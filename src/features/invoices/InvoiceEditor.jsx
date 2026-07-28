import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  EMPTY_INVOICE,
  EMPTY_LINE_ITEM,
  INVOICE_STATUS_OPTIONS,
  LINE_ITEM_CATEGORY_OPTIONS,
  adaptiveUpsert,
  calculateInvoiceTotals,
  cleanNumber,
  cleanText,
  createId,
  customerName,
  employeeName,
  formatCurrency,
  nextInvoiceNumber,
  normalizeLineItem,
  safeSelect,
} from './invoiceUtils'

const UNIT_OPTIONS = [
  'each',
  'hour',
  'day',
  'foot',
  'linear foot',
  'square foot',
  'cubic yard',
  'pound',
  'ton',
  'lot',
  'service',
]

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateString, days) {
  const source = dateString || todayString()
  const date = new Date(`${source}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function cloneInvoice(invoice = {}) {
  return {
    ...EMPTY_INVOICE,
    ...invoice,
    issue_date: invoice.issue_date || todayString(),
    due_date:
      invoice.due_date ||
      addDays(invoice.issue_date || todayString(), 30),
  }
}

function makeLineItem(overrides = {}, sortOrder = 0) {
  return normalizeLineItem(
    {
      ...EMPTY_LINE_ITEM,
      id: createId(),
      sort_order: sortOrder,
      ...overrides,
    },
    sortOrder
  )
}

function addressFromCustomer(customer) {
  return {
    billing_address:
      customer?.billing_address ||
      customer?.address ||
      customer?.street_address ||
      '',
    billing_city:
      customer?.billing_city ||
      customer?.city ||
      '',
    billing_state:
      customer?.billing_state ||
      customer?.state ||
      'TX',
    billing_postal_code:
      customer?.billing_postal_code ||
      customer?.postal_code ||
      customer?.zip ||
      '',
  }
}

function projectAddressFromJob(job) {
  return {
    project_address:
      job?.service_address ||
      job?.project_address ||
      job?.address ||
      '',
    project_city:
      job?.service_city ||
      job?.project_city ||
      job?.city ||
      '',
    project_state:
      job?.service_state ||
      job?.project_state ||
      job?.state ||
      'TX',
    project_postal_code:
      job?.service_postal_code ||
      job?.project_postal_code ||
      job?.postal_code ||
      job?.zip ||
      '',
  }
}

function estimateLabel(estimate) {
  return (
    estimate?.estimate_number ||
    estimate?.number ||
    estimate?.title ||
    'Estimate'
  )
}

function jobLabel(job) {
  return (
    job?.job_number ||
    job?.title ||
    job?.name ||
    'Job'
  )
}

function moveItem(items, fromIndex, toIndex) {
  if (
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items
  }

  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)

  return next.map((item, index) => ({
    ...item,
    sort_order: index,
  }))
}

export default function InvoiceEditor({
  supabase,
  invoiceId = null,
  initialInvoice = null,
  initialLineItems = null,
  sourceEstimateId = null,
  onCancel,
  onSaved,
}) {
  const [invoice, setInvoice] = useState(
    cloneInvoice(initialInvoice || {})
  )

  const [lineItems, setLineItems] = useState(
    Array.isArray(initialLineItems) &&
      initialLineItems.length > 0
      ? initialLineItems.map(normalizeLineItem)
      : [makeLineItem()]
  )

  const [customers, setCustomers] = useState([])
  const [jobs, setJobs] = useState([])
  const [estimates, setEstimates] = useState([])
  const [estimateItems, setEstimateItems] = useState([])
  const [employees, setEmployees] = useState([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importingEstimate, setImportingEstimate] =
    useState(false)

  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] =
    useState('')

  const isEditing = Boolean(
    invoiceId ||
      initialInvoice?.id ||
      invoice?.id
  )

  const effectiveInvoiceId =
    invoiceId ||
    initialInvoice?.id ||
    invoice?.id ||
    null

  const loadReferenceData = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not available.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const [
        invoiceResult,
        itemResult,
        customerResult,
        jobResult,
        estimateResult,
        estimateItemResult,
        employeeResult,
      ] = await Promise.all([
        effectiveInvoiceId
          ? supabase
              .from('invoices')
              .select('*')
              .eq('id', effectiveInvoiceId)
              .single()
          : Promise.resolve({
              data: null,
              error: null,
            }),
        effectiveInvoiceId
          ? supabase
              .from('invoice_line_items')
              .select('*')
              .eq('invoice_id', effectiveInvoiceId)
              .order('sort_order', {
                ascending: true,
              })
          : Promise.resolve({
              data: [],
              error: null,
            }),
        safeSelect(
          supabase,
          'customers',
          'created_at',
          false
        ),
        safeSelect(
          supabase,
          'jobs',
          'created_at',
          false
        ),
        safeSelect(
          supabase,
          'estimates',
          'created_at',
          false
        ),
        safeSelect(
          supabase,
          'estimate_line_items',
          'sort_order',
          true
        ),
        safeSelect(
          supabase,
          'employees',
          'created_at',
          false
        ),
      ])

      if (
        invoiceResult.error &&
        !String(
          invoiceResult.error.message || ''
        )
          .toLowerCase()
          .includes('no rows')
      ) {
        throw invoiceResult.error
      }

      if (itemResult.error) {
        throw itemResult.error
      }

      const referenceError =
        customerResult.error ||
        jobResult.error ||
        estimateResult.error ||
        estimateItemResult.error ||
        employeeResult.error

      if (referenceError) {
        throw referenceError
      }

      setCustomers(customerResult.data)
      setJobs(jobResult.data)
      setEstimates(estimateResult.data)
      setEstimateItems(estimateItemResult.data)
      setEmployees(employeeResult.data)

      if (invoiceResult.data) {
        setInvoice(
          cloneInvoice(invoiceResult.data)
        )
      } else if (!isEditing) {
        setInvoice((current) => ({
          ...cloneInvoice(current),
          invoice_number:
            current.invoice_number ||
            nextInvoiceNumber([]),
        }))
      }

      if (
        Array.isArray(itemResult.data) &&
        itemResult.data.length > 0
      ) {
        setLineItems(
          itemResult.data.map(normalizeLineItem)
        )
      }
    } catch (loadError) {
      console.error(
        'Unable to load invoice editor:',
        loadError
      )

      setError(
        loadError?.message ||
          'Unable to load invoice information.'
      )
    } finally {
      setLoading(false)
    }
  }, [
    supabase,
    effectiveInvoiceId,
    isEditing,
  ])

  useEffect(() => {
    loadReferenceData()
  }, [loadReferenceData])

  useEffect(() => {
    if (
      !sourceEstimateId ||
      estimates.length === 0
    ) {
      return
    }

    const estimate = estimates.find(
      (record) =>
        record.id === sourceEstimateId
    )

    if (estimate) {
      importEstimate(estimate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sourceEstimateId,
    estimates,
  ])

  const selectedCustomer = useMemo(
    () =>
      customers.find(
        (customer) =>
          customer.id === invoice.customer_id
      ) || null,
    [
      customers,
      invoice.customer_id,
    ]
  )

  const selectedJob = useMemo(
    () =>
      jobs.find(
        (job) => job.id === invoice.job_id
      ) || null,
    [
      jobs,
      invoice.job_id,
    ]
  )

  const filteredJobs = useMemo(() => {
    if (!invoice.customer_id) {
      return jobs
    }

    return jobs.filter(
      (job) =>
        !job.customer_id ||
        job.customer_id ===
          invoice.customer_id
    )
  }, [
    jobs,
    invoice.customer_id,
  ])

  const filteredEstimates = useMemo(() => {
    if (!invoice.customer_id) {
      return estimates
    }

    return estimates.filter(
      (estimate) =>
        !estimate.customer_id ||
        estimate.customer_id ===
          invoice.customer_id
    )
  }, [
    estimates,
    invoice.customer_id,
  ])

  const totals = useMemo(
    () =>
      calculateInvoiceTotals(
        invoice,
        lineItems,
        []
      ),
    [
      invoice,
      lineItems,
    ]
  )

  function updateInvoice(field, value) {
    setInvoice((current) => ({
      ...current,
      [field]: value,
    }))

    setSuccessMessage('')
  }

  function handleCustomerChange(customerId) {
    const customer = customers.find(
      (record) => record.id === customerId
    )

    const address = addressFromCustomer(
      customer
    )

    setInvoice((current) => ({
      ...current,
      customer_id: customerId,
      job_id:
        current.job_id &&
        jobs.some(
          (job) =>
            job.id === current.job_id &&
            (
              !job.customer_id ||
              job.customer_id === customerId
            )
        )
          ? current.job_id
          : '',
      ...address,
    }))

    setSuccessMessage('')
  }

  function handleJobChange(jobId) {
    const job = jobs.find(
      (record) => record.id === jobId
    )

    const projectAddress =
      projectAddressFromJob(job)

    setInvoice((current) => ({
      ...current,
      job_id: jobId,
      customer_id:
        current.customer_id ||
        job?.customer_id ||
        '',
      title:
        current.title ||
        job?.title ||
        job?.name ||
        '',
      ...projectAddress,
    }))

    setSuccessMessage('')
  }

  function updateLineItem(
    itemId,
    field,
    value
  ) {
    setLineItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    )

    setSuccessMessage('')
  }

  function addLineItem(afterIndex = null) {
    setLineItems((current) => {
      const next = [...current]

      const insertIndex =
        afterIndex === null
          ? next.length
          : afterIndex + 1

      next.splice(
        insertIndex,
        0,
        makeLineItem(
          {},
          insertIndex
        )
      )

      return next.map(
        (item, index) => ({
          ...item,
          sort_order: index,
        })
      )
    })
  }

  function duplicateLineItem(index) {
    setLineItems((current) => {
      const source = current[index]

      if (!source) return current

      const copy = {
        ...source,
        id: createId(),
        invoice_id: '',
      }

      const next = [...current]
      next.splice(index + 1, 0, copy)

      return next.map(
        (item, itemIndex) => ({
          ...item,
          sort_order: itemIndex,
        })
      )
    })
  }

  function removeLineItem(itemId) {
    setLineItems((current) => {
      if (current.length === 1) {
        return [makeLineItem()]
      }

      return current
        .filter(
          (item) => item.id !== itemId
        )
        .map(
          (item, index) => ({
            ...item,
            sort_order: index,
          })
        )
    })
  }

  function moveLineItemUp(index) {
    setLineItems((current) =>
      moveItem(
        current,
        index,
        index - 1
      )
    )
  }

  function moveLineItemDown(index) {
    setLineItems((current) =>
      moveItem(
        current,
        index,
        index + 1
      )
    )
  }

  function clearLineItems() {
    const confirmed = window.confirm(
      'Remove all invoice line items?'
    )

    if (!confirmed) return

    setLineItems([makeLineItem()])
  }

  async function importEstimate(
    estimateOrId
  ) {
    const estimate =
      typeof estimateOrId === 'object'
        ? estimateOrId
        : estimates.find(
            (record) =>
              record.id === estimateOrId
          )

    if (!estimate) return

    setImportingEstimate(true)
    setError('')
    setSuccessMessage('')

    try {
      const items = estimateItems
        .filter(
          (item) =>
            item.estimate_id === estimate.id
        )
        .map(
          (item, index) =>
            makeLineItem(
              {
                category:
                  item.category ||
                  item.item_type ||
                  'Service',
                description:
                  item.description ||
                  item.name ||
                  '',
                quantity:
                  item.quantity ?? '1',
                unit:
                  item.unit || 'each',
                unit_cost:
                  item.unit_cost ??
                  item.cost ??
                  '',
                unit_price:
                  item.unit_price ??
                  item.price ??
                  '',
                taxable:
                  item.taxable !== false,
              },
              index
            )
        )

      const customer =
        customers.find(
          (record) =>
            record.id ===
            estimate.customer_id
        ) || null

      const job =
        jobs.find(
          (record) =>
            record.id === estimate.job_id
        ) || null

      setInvoice((current) => ({
        ...current,
        estimate_id: estimate.id,
        customer_id:
          estimate.customer_id ||
          current.customer_id,
        job_id:
          estimate.job_id ||
          current.job_id,
        title:
          estimate.title ||
          current.title ||
          'Invoice',
        tax_rate:
          estimate.tax_rate ??
          current.tax_rate,
        discount_type:
          estimate.discount_type ||
          current.discount_type,
        discount_value:
          estimate.discount_value ??
          current.discount_value,
        notes:
          estimate.notes ||
          current.notes,
        terms:
          estimate.terms ||
          current.terms,
        ...addressFromCustomer(customer),
        ...projectAddressFromJob(job),
      }))

      if (items.length > 0) {
        setLineItems(items)
      }

      setSuccessMessage(
        `${estimateLabel(
          estimate
        )} imported.`
      )
    } catch (importError) {
      console.error(
        'Unable to import estimate:',
        importError
      )

      setError(
        importError?.message ||
          'Unable to import the estimate.'
      )
    } finally {
      setImportingEstimate(false)
    }
  }

  function validateInvoice() {
    const issues = []

    if (!invoice.customer_id) {
      issues.push('Select a customer.')
    }

    if (!cleanText(invoice.invoice_number)) {
      issues.push(
        'Enter an invoice number.'
      )
    }

    if (!invoice.issue_date) {
      issues.push(
        'Enter an issue date.'
      )
    }

    if (!invoice.due_date) {
      issues.push(
        'Enter a due date.'
      )
    }

    const usableItems =
      lineItems.filter(
        (item) =>
          cleanText(item.description) ||
          Number(item.unit_price || 0) !== 0
      )

    if (usableItems.length === 0) {
      issues.push(
        'Add at least one line item.'
      )
    }

    usableItems.forEach(
      (item, index) => {
        if (
          Number(item.quantity || 0) <= 0
        ) {
          issues.push(
            `Line ${index + 1} must have a quantity greater than zero.`
          )
        }

        if (
          Number(item.unit_price || 0) < 0
        ) {
          issues.push(
            `Line ${index + 1} cannot have a negative price.`
          )
        }
      }
    )

    return issues
  }

  function invoicePayload(id) {
    return {
      id,
      invoice_number:
        cleanText(
          invoice.invoice_number
        ),
      customer_id:
        cleanText(
          invoice.customer_id
        ),
      estimate_id:
        cleanText(
          invoice.estimate_id
        ),
      job_id:
        cleanText(
          invoice.job_id
        ),
      title:
        cleanText(
          invoice.title
        ),
      status:
        invoice.status || 'Draft',
      issue_date:
        invoice.issue_date || null,
      due_date:
        invoice.due_date || null,
      billing_address:
        cleanText(
          invoice.billing_address
        ),
      billing_city:
        cleanText(
          invoice.billing_city
        ),
      billing_state:
        cleanText(
          invoice.billing_state
        ),
      billing_postal_code:
        cleanText(
          invoice.billing_postal_code
        ),
      project_address:
        cleanText(
          invoice.project_address
        ),
      project_city:
        cleanText(
          invoice.project_city
        ),
      project_state:
        cleanText(
          invoice.project_state
        ),
      project_postal_code:
        cleanText(
          invoice.project_postal_code
        ),
      salesperson_id:
        cleanText(
          invoice.salesperson_id
        ),
      tax_rate:
        cleanNumber(
          invoice.tax_rate
        ) || 0,
      discount_type:
        invoice.discount_type ||
        'amount',
      discount_value:
        cleanNumber(
          invoice.discount_value
        ) || 0,
      deposit_applied:
        cleanNumber(
          invoice.deposit_applied
        ) || 0,
      late_fee_type:
        invoice.late_fee_type ||
        'amount',
      late_fee_value:
        cleanNumber(
          invoice.late_fee_value
        ) || 0,
      notes:
        cleanText(
          invoice.notes
        ),
      terms:
        cleanText(
          invoice.terms
        ),
      internal_notes:
        cleanText(
          invoice.internal_notes
        ),
      footer_message:
        cleanText(
          invoice.footer_message
        ),
      subtotal:
        totals.subtotal,
      discount_total:
        totals.discount,
      taxable_subtotal:
        totals.taxableAfterDiscount,
      tax_total:
        totals.tax,
      late_fee_total:
        totals.lateFee,
      total:
        totals.invoiceTotal,
      balance_due:
        totals.balanceDue,
      updated_at:
        new Date().toISOString(),
      ...(isEditing
        ? {}
        : {
            created_at:
              new Date().toISOString(),
          }),
    }
  }

  function lineItemPayload(
    item,
    invoiceRecordId,
    index
  ) {
    return {
      id:
        item.id ||
        createId(),
      invoice_id:
        invoiceRecordId,
      category:
        item.category ||
        'Service',
      description:
        cleanText(
          item.description
        ),
      quantity:
        cleanNumber(
          item.quantity
        ) || 0,
      unit:
        cleanText(
          item.unit
        ) || 'each',
      unit_cost:
        cleanNumber(
          item.unit_cost
        ) || 0,
      unit_price:
        cleanNumber(
          item.unit_price
        ) || 0,
      taxable:
        item.taxable !== false,
      sort_order: index,
      updated_at:
        new Date().toISOString(),
    }
  }

  async function saveInvoice(
    event
  ) {
    event?.preventDefault()

    if (saving) return

    const issues =
      validateInvoice()

    if (issues.length > 0) {
      setError(issues.join(' '))
      setSuccessMessage('')
      return
    }

    if (!supabase) {
      setError(
        'Supabase is not available.'
      )
      return
    }

    setSaving(true)
    setError('')
    setSuccessMessage('')

    try {
      const recordId =
        effectiveInvoiceId ||
        createId()

      const invoiceResult =
        await adaptiveUpsert(
          supabase,
          'invoices',
          invoicePayload(recordId)
        )

      if (invoiceResult.error) {
        throw invoiceResult.error
      }

      const savedInvoice =
        invoiceResult.data || {
          ...invoice,
          id: recordId,
        }

      const usableItems =
        lineItems.filter(
          (item) =>
            cleanText(
              item.description
            ) ||
            Number(
              item.unit_price || 0
            ) !== 0
        )

      const existingResult =
        await supabase
          .from(
            'invoice_line_items'
          )
          .select('id')
          .eq(
            'invoice_id',
            recordId
          )

      if (
        existingResult.error &&
        !String(
          existingResult.error.message ||
            ''
        )
          .toLowerCase()
          .includes('does not exist')
      ) {
        throw existingResult.error
      }

      const existingIds = new Set(
        (
          existingResult.data || []
        ).map(
          (item) => item.id
        )
      )

      const savedIds = new Set()

      for (
        let index = 0;
        index < usableItems.length;
        index += 1
      ) {
        const item =
          usableItems[index]

        const payload =
          lineItemPayload(
            item,
            recordId,
            index
          )

        const itemResult =
          await adaptiveUpsert(
            supabase,
            'invoice_line_items',
            payload
          )

        if (itemResult.error) {
          throw itemResult.error
        }

        savedIds.add(payload.id)
      }

      const removedIds = [
        ...existingIds,
      ].filter(
        (id) => !savedIds.has(id)
      )

      if (
        removedIds.length > 0
      ) {
        const deleteResult =
          await supabase
            .from(
              'invoice_line_items'
            )
            .delete()
            .in(
              'id',
              removedIds
            )

        if (deleteResult.error) {
          throw deleteResult.error
        }
      }

      setInvoice(
        cloneInvoice(savedInvoice)
      )

      setLineItems(
        usableItems.map(
          (item, index) => ({
            ...normalizeLineItem(
              item,
              index
            ),
            invoice_id:
              recordId,
            sort_order:
              index,
          })
        )
      )

      setSuccessMessage(
        `Invoice ${
          savedInvoice.invoice_number ||
          invoice.invoice_number
        } saved.`
      )

      onSaved?.(
        savedInvoice,
        usableItems
      )
    } catch (saveError) {
      console.error(
        'Unable to save invoice:',
        saveError
      )

      setError(
        saveError?.message ||
          'Unable to save the invoice.'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="invoice-editor-loading">
        Loading invoice editor...
      </div>
    )
  }

  return (
    <form
      className="invoice-editor"
      onSubmit={saveInvoice}
    >
      <header className="invoice-editor-header">
        <div>
          <h2>
            {isEditing
              ? 'Edit Invoice'
              : 'New Invoice'}
          </h2>

          <p>
            Build the invoice, review
            totals, and save it to the
            customer account.
          </p>
        </div>

        <div className="invoice-editor-header-actions">
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onCancel?.()
            }
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
          >
            {saving
              ? 'Saving...'
              : 'Save Invoice'}
          </button>
        </div>
      </header>

      {error && (
        <div
          className="invoice-error-banner"
          role="alert"
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          className="invoice-success-banner"
          role="status"
        >
          {successMessage}
        </div>
      )}

      <section className="invoice-editor-section">
        <div className="invoice-section-heading">
          <div>
            <h3>Invoice Information</h3>

            <p>
              Customer, job, dates, and
              invoice status.
            </p>
          </div>
        </div>

        <div className="invoice-form-grid">
          <label>
            Customer
            <span aria-hidden="true">*</span>

            <select
              required
              value={
                invoice.customer_id
              }
              onChange={(event) =>
                handleCustomerChange(
                  event.target.value
                )
              }
            >
              <option value="">
                Select customer
              </option>

              {[...customers]
                .sort((a, b) =>
                  customerName(
                    a
                  ).localeCompare(
                    customerName(b)
                  )
                )
                .map(
                  (customer) => (
                    <option
                      key={
                        customer.id
                      }
                      value={
                        customer.id
                      }
                    >
                      {customerName(
                        customer
                      )}
                    </option>
                  )
                )}
            </select>
          </label>

          <label>
            Job

            <select
              value={
                invoice.job_id
              }
              onChange={(event) =>
                handleJobChange(
                  event.target.value
                )
              }
            >
              <option value="">
                No linked job
              </option>

              {filteredJobs.map(
                (job) => (
                  <option
                    key={job.id}
                    value={job.id}
                  >
                    {jobLabel(job)}
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            Invoice Number
            <span aria-hidden="true">*</span>

            <input
              required
              type="text"
              value={
                invoice.invoice_number
              }
              onChange={(event) =>
                updateInvoice(
                  'invoice_number',
                  event.target.value
                )
              }
            />
          </label>

          <label>
            Status

            <select
              value={
                invoice.status
              }
              onChange={(event) =>
                updateInvoice(
                  'status',
                  event.target.value
                )
              }
            >
              {INVOICE_STATUS_OPTIONS.map(
                (status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {status}
                  </option>
                )
              )}
            </select>
          </label>

          <label>
            Issue Date
            <span aria-hidden="true">*</span>

            <input
              required
              type="date"
              value={
                invoice.issue_date
              }
              onChange={(event) =>
                updateInvoice(
                  'issue_date',
                  event.target.value
                )
              }
            />
          </label>

          <label>
            Due Date
            <span aria-hidden="true">*</span>

            <input
              required
              type="date"
              value={
                invoice.due_date
              }
              onChange={(event) =>
                updateInvoice(
                  'due_date',
                  event.target.value
                )
              }
            />
          </label>

          <label className="invoice-field-wide">
            Invoice Title

            <input
              type="text"
              placeholder="Boat lift installation, service call, repair..."
              value={
                invoice.title
              }
              onChange={(event) =>
                updateInvoice(
                  'title',
                  event.target.value
                )
              }
            />
          </label>

          <label>
            Salesperson

            <select
              value={
                invoice.salesperson_id
              }
              onChange={(event) =>
                updateInvoice(
                  'salesperson_id',
                  event.target.value
                )
              }
            >
              <option value="">
                Unassigned
              </option>

              {employees.map(
                (employee) => (
                  <option
                    key={
                      employee.id
                    }
                    value={
                      employee.id
                    }
                  >
                    {employeeName(
                      employee
                    )}
                  </option>
                )
              )}
            </select>
          </label>
        </div>
      </section>

      <section className="invoice-editor-section">
        <div className="invoice-section-heading">
          <div>
            <h3>Import Estimate</h3>

            <p>
              Pull customer details and
              line items from an existing
              estimate.
            </p>
          </div>
        </div>

        <div className="invoice-inline-controls">
          <select
            value={
              invoice.estimate_id
            }
            onChange={(event) =>
              updateInvoice(
                'estimate_id',
                event.target.value
              )
            }
          >
            <option value="">
              Select estimate
            </option>

            {filteredEstimates.map(
              (estimate) => (
                <option
                  key={
                    estimate.id
                  }
                  value={
                    estimate.id
                  }
                >
                  {estimateLabel(
                    estimate
                  )}
                </option>
              )
            )}
          </select>

          <button
            type="button"
            disabled={
              !invoice.estimate_id ||
              importingEstimate
            }
            onClick={() =>
              importEstimate(
                invoice.estimate_id
              )
            }
          >
            {importingEstimate
              ? 'Importing...'
              : 'Import Estimate'}
          </button>
        </div>
      </section>

      <section className="invoice-editor-section">
        <div className="invoice-section-heading">
          <div>
            <h3>Addresses</h3>

            <p>
              Billing and project/service
              locations.
            </p>
          </div>
        </div>

        <div className="invoice-address-grid">
          <fieldset>
            <legend>Billing Address</legend>

            <label>
              Street

              <input
                type="text"
                value={
                  invoice.billing_address
                }
                onChange={(event) =>
                  updateInvoice(
                    'billing_address',
                    event.target.value
                  )
                }
              />
            </label>

            <div className="invoice-address-row">
              <label>
                City

                <input
                  type="text"
                  value={
                    invoice.billing_city
                  }
                  onChange={(event) =>
                    updateInvoice(
                      'billing_city',
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                State

                <input
                  type="text"
                  maxLength={2}
                  value={
                    invoice.billing_state
                  }
                  onChange={(event) =>
                    updateInvoice(
                      'billing_state',
                      event.target.value.toUpperCase()
                    )
                  }
                />
              </label>

              <label>
                ZIP

                <input
                  type="text"
                  value={
                    invoice.billing_postal_code
                  }
                  onChange={(event) =>
                    updateInvoice(
                      'billing_postal_code',
                      event.target.value
                    )
                  }
                />
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend>Project Address</legend>

            <label>
              Street

              <input
                type="text"
                value={
                  invoice.project_address
                }
                onChange={(event) =>
                  updateInvoice(
                    'project_address',
                    event.target.value
                  )
                }
              />
            </label>

            <div className="invoice-address-row">
              <label>
                City

                <input
                  type="text"
                  value={
                    invoice.project_city
                  }
                  onChange={(event) =>
                    updateInvoice(
                      'project_city',
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                State

                <input
                  type="text"
                  maxLength={2}
                  value={
                    invoice.project_state
                  }
                  onChange={(event) =>
                    updateInvoice(
                      'project_state',
                      event.target.value.toUpperCase()
                    )
                  }
                />
              </label>

              <label>
                ZIP

                <input
                  type="text"
                  value={
                    invoice.project_postal_code
                  }
                  onChange={(event) =>
                    updateInvoice(
                      'project_postal_code',
                      event.target.value
                    )
                  }
                />
              </label>
            </div>
          </fieldset>
        </div>
      </section>

      <section className="invoice-editor-section">
        <div className="invoice-section-heading">
          <div>
            <h3>Line Items</h3>

            <p>
              Add labor, material,
              equipment, permits, and
              other billable items.
            </p>
          </div>

          <div className="invoice-section-actions">
            <button
              type="button"
              onClick={() =>
                addLineItem()
              }
            >
              + Add Item
            </button>

            <button
              type="button"
              onClick={
                clearLineItems
              }
            >
              Clear Items
            </button>
          </div>
        </div>

        <div className="invoice-line-items-scroll">
          <table className="invoice-line-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Category</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Unit Cost</th>
                <th>Unit Price</th>
                <th>Tax</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {lineItems.map(
                (item, index) => {
                  const quantity =
                    Number(
                      item.quantity || 0
                    )

                  const amount =
                    quantity *
                    Number(
                      item.unit_price || 0
                    )

                  return (
                    <tr key={item.id}>
                      <td>
                        {index + 1}
                      </td>

                      <td>
                        <select
                          value={
                            item.category
                          }
                          onChange={(event) =>
                            updateLineItem(
                              item.id,
                              'category',
                              event.target.value
                            )
                          }
                        >
                          {LINE_ITEM_CATEGORY_OPTIONS.map(
                            (category) => (
                              <option
                                key={
                                  category
                                }
                                value={
                                  category
                                }
                              >
                                {category}
                              </option>
                            )
                          )}
                        </select>
                      </td>

                      <td>
                        <textarea
                          rows={2}
                          placeholder="Description"
                          value={
                            item.description
                          }
                          onChange={(event) =>
                            updateLineItem(
                              item.id,
                              'description',
                              event.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            item.quantity
                          }
                          onChange={(event) =>
                            updateLineItem(
                              item.id,
                              'quantity',
                              event.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="text"
                          list="invoice-unit-options"
                          value={
                            item.unit
                          }
                          onChange={(event) =>
                            updateLineItem(
                              item.id,
                              'unit',
                              event.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            item.unit_cost
                          }
                          onChange={(event) =>
                            updateLineItem(
                              item.id,
                              'unit_cost',
                              event.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            item.unit_price
                          }
                          onChange={(event) =>
                            updateLineItem(
                              item.id,
                              'unit_price',
                              event.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          type="checkbox"
                          checked={
                            item.taxable !==
                            false
                          }
                          onChange={(event) =>
                            updateLineItem(
                              item.id,
                              'taxable',
                              event.target.checked
                            )
                          }
                          aria-label={`Taxable line ${
                            index + 1
                          }`}
                        />
                      </td>

                      <td>
                        <strong>
                          {formatCurrency(
                            amount
                          )}
                        </strong>
                      </td>

                      <td>
                        <div className="invoice-line-item-actions">
                          <button
                            type="button"
                            disabled={
                              index === 0
                            }
                            onClick={() =>
                              moveLineItemUp(
                                index
                              )
                            }
                            aria-label={`Move line ${
                              index + 1
                            } up`}
                          >
                            ↑
                          </button>

                          <button
                            type="button"
                            disabled={
                              index ===
                              lineItems.length -
                                1
                            }
                            onClick={() =>
                              moveLineItemDown(
                                index
                              )
                            }
                            aria-label={`Move line ${
                              index + 1
                            } down`}
                          >
                            ↓
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              duplicateLineItem(
                                index
                              )
                            }
                          >
                            Copy
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              addLineItem(
                                index
                              )
                            }
                          >
                            Add
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              removeLineItem(
                                item.id
                              )
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }
              )}
            </tbody>
          </table>
        </div>

        <datalist id="invoice-unit-options">
          {UNIT_OPTIONS.map(
            (unit) => (
              <option
                key={unit}
                value={unit}
              />
            )
          )}
        </datalist>
      </section>

      <section className="invoice-editor-section">
        <div className="invoice-section-heading">
          <div>
            <h3>Pricing and Totals</h3>

            <p>
              Apply discounts, tax,
              deposits, and late fees.
            </p>
          </div>
        </div>

        <div className="invoice-pricing-layout">
          <div className="invoice-pricing-controls">
            <label>
              Discount Type

              <select
                value={
                  invoice.discount_type
                }
                onChange={(event) =>
                  updateInvoice(
                    'discount_type',
                    event.target.value
                  )
                }
              >
                <option value="amount">
                  Dollar amount
                </option>

                <option value="percent">
                  Percentage
                </option>
              </select>
            </label>

            <label>
              Discount Value

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  invoice.discount_value
                }
                onChange={(event) =>
                  updateInvoice(
                    'discount_value',
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Tax Rate (%)

              <input
                type="number"
                min="0"
                step="0.001"
                value={
                  invoice.tax_rate
                }
                onChange={(event) =>
                  updateInvoice(
                    'tax_rate',
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Deposit Applied

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  invoice.deposit_applied
                }
                onChange={(event) =>
                  updateInvoice(
                    'deposit_applied',
                    event.target.value
                  )
                }
              />
            </label>

            <label>
              Late Fee Type

              <select
                value={
                  invoice.late_fee_type
                }
                onChange={(event) =>
                  updateInvoice(
                    'late_fee_type',
                    event.target.value
                  )
                }
              >
                <option value="amount">
                  Dollar amount
                </option>

                <option value="percent">
                  Percentage
                </option>
              </select>
            </label>

            <label>
              Late Fee Value

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  invoice.late_fee_value
                }
                onChange={(event) =>
                  updateInvoice(
                    'late_fee_value',
                    event.target.value
                  )
                }
              />
            </label>
          </div>

          <aside className="invoice-total-card">
            <div>
              <span>Subtotal</span>

              <strong>
                {formatCurrency(
                  totals.subtotal
                )}
              </strong>
            </div>

            <div>
              <span>Discount</span>

              <strong>
                -
                {formatCurrency(
                  totals.discount
                )}
              </strong>
            </div>

            <div>
              <span>Taxable</span>

              <strong>
                {formatCurrency(
                  totals.taxableAfterDiscount
                )}
              </strong>
            </div>

            <div>
              <span>Tax</span>

              <strong>
                {formatCurrency(
                  totals.tax
                )}
              </strong>
            </div>

            <div>
              <span>Late Fee</span>

              <strong>
                {formatCurrency(
                  totals.lateFee
                )}
              </strong>
            </div>

            <div className="invoice-total-card-grand">
              <span>Invoice Total</span>

              <strong>
                {formatCurrency(
                  totals.invoiceTotal
                )}
              </strong>
            </div>

            <div>
              <span>Deposit Applied</span>

              <strong>
                -
                {formatCurrency(
                  totals.depositApplied
                )}
              </strong>
            </div>

            <div className="invoice-total-card-balance">
              <span>Balance Due</span>

              <strong>
                {formatCurrency(
                  totals.balanceDue
                )}
              </strong>
            </div>

            <div className="invoice-total-card-internal">
              <span>Estimated Cost</span>

              <strong>
                {formatCurrency(
                  totals.costTotal
                )}
              </strong>
            </div>

            <div className="invoice-total-card-internal">
              <span>Estimated Profit</span>

              <strong>
                {formatCurrency(
                  totals.profit
                )}
              </strong>
            </div>

            <div className="invoice-total-card-internal">
              <span>Margin</span>

              <strong>
                {totals.margin.toFixed(
                  2
                )}
                %
              </strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="invoice-editor-section">
        <div className="invoice-section-heading">
          <div>
            <h3>Notes and Terms</h3>

            <p>
              Customer-facing notes,
              payment terms, and internal
              information.
            </p>
          </div>
        </div>

        <div className="invoice-notes-grid">
          <label>
            Customer Notes

            <textarea
              rows={6}
              value={
                invoice.notes
              }
              onChange={(event) =>
                updateInvoice(
                  'notes',
                  event.target.value
                )
              }
            />
          </label>

          <label>
            Terms

            <textarea
              rows={6}
              value={
                invoice.terms
              }
              onChange={(event) =>
                updateInvoice(
                  'terms',
                  event.target.value
                )
              }
              placeholder="Payment due within 30 days..."
            />
          </label>

          <label>
            Internal Notes

            <textarea
              rows={6}
              value={
                invoice.internal_notes
              }
              onChange={(event) =>
                updateInvoice(
                  'internal_notes',
                  event.target.value
                )
              }
            />
          </label>

          <label>
            Footer Message

            <textarea
              rows={6}
              value={
                invoice.footer_message
              }
              onChange={(event) =>
                updateInvoice(
                  'footer_message',
                  event.target.value
                )
              }
            />
          </label>
        </div>
      </section>

      <footer className="invoice-editor-footer">
        <div>
          <span>
            Customer:{' '}
            <strong>
              {selectedCustomer
                ? customerName(
                    selectedCustomer
                  )
                : 'Not selected'}
            </strong>
          </span>

          <span>
            Job:{' '}
            <strong>
              {selectedJob
                ? jobLabel(
                    selectedJob
                  )
                : 'Not linked'}
            </strong>
          </span>

          <span>
            Balance:{' '}
            <strong>
              {formatCurrency(
                totals.balanceDue
              )}
            </strong>
          </span>
        </div>

        <div>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onCancel?.()
            }
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
          >
            {saving
              ? 'Saving...'
              : 'Save Invoice'}
          </button>
        </div>
      </footer>
    </form>
  )
}