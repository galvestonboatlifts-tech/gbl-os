import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

const INVOICE_STATUSES = [
  'Draft',
  'Sent',
  'Viewed',
  'Partial',
  'Paid',
  'Overdue',
  'Void',
]

const PAYMENT_METHODS = [
  'Cash',
  'Check',
  'Credit Card',
  'ACH',
  'Wire Transfer',
  'Zelle',
  'Other',
]

const EMPTY_INVOICE = {
  id: '',
  customer_id: '',
  property_id: '',
  boat_lift_id: '',
  job_id: '',
  estimate_id: '',
  number: '',
  title: '',
  status: 'Draft',
  issue_date: new Date()
    .toISOString()
    .slice(0, 10),
  due_date: '',
  terms: 'Due on receipt',
  notes: '',
  customer_message: '',
  internal_notes: '',
  discount_type: 'Percent',
  discount_value: 0,
  tax_rate: 8.25,
  deposit_applied: 0,
  late_fee: 0,
}

const EMPTY_PAYMENT = {
  amount: '',
  payment_date: new Date()
    .toISOString()
    .slice(0, 10),
  method: 'Check',
  reference: '',
  notes: '',
}

const DEFAULT_LINE_ITEM = {
  id: '',
  item_type: 'Service',
  description: '',
  quantity: 1,
  unit: 'each',
  unit_price: 0,
  taxable: true,
  sort_order: 0,
}

function createId() {
  if (
    typeof crypto !== 'undefined' &&
    crypto.randomUUID
  ) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`
}

function money(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0))
}

function dateText(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(
    String(value).length === 10
      ? `${value}T12:00:00`
      : value
  )

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleDateString()
}

function dateTimeText(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleString()
}

function customerName(customer) {
  return (
    customer?.name ||
    customer?.full_name ||
    customer?.company ||
    customer?.company_name ||
    'Unknown customer'
  )
}

function propertyAddress(property) {
  if (!property) {
    return 'No property selected'
  }

  return [
    property.address,
    property.city,
    property.state,
    property.zip_code,
  ]
    .filter(Boolean)
    .join(', ')
}

function invoiceNumber(invoices) {
  const year = new Date().getFullYear()

  const values = invoices
    .map((invoice) => {
      const match = String(
        invoice.number ||
          invoice.invoice_number ||
          ''
      ).match(/(\d+)$/)

      return match ? Number(match[1]) : 0
    })
    .filter(Number.isFinite)

  const next =
    values.length > 0
      ? Math.max(...values) + 1
      : 1

  return `INV-${year}-${String(next).padStart(
    4,
    '0'
  )}`
}

function normalizeLineItem(item, index = 0) {
  return {
    ...DEFAULT_LINE_ITEM,
    ...item,
    id: item?.id || createId(),
    item_type:
      item?.item_type ||
      item?.type ||
      'Service',
    description:
      item?.description ||
      item?.name ||
      '',
    quantity: Number(
      item?.quantity ??
        item?.qty ??
        1
    ),
    unit:
      item?.unit ||
      'each',
    unit_price: Number(
      item?.unit_price ??
        item?.price ??
        item?.rate ??
        0
    ),
    taxable:
      item?.taxable === undefined
        ? true
        : Boolean(item.taxable),
    sort_order:
      item?.sort_order ?? index,
  }
}

function parseArray(value) {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed)
        ? parsed
        : []
    } catch {
      return []
    }
  }

  return []
}

function parseLineItems(value) {
  return parseArray(value).map(
    normalizeLineItem
  )
}

function normalizePayment(payment) {
  return {
    id:
      payment?.id ||
      createId(),
    invoice_id:
      payment?.invoice_id || '',
    amount: Number(
      payment?.amount || 0
    ),
    payment_date:
      payment?.payment_date ||
      payment?.date ||
      new Date()
        .toISOString()
        .slice(0, 10),
    method:
      payment?.method ||
      payment?.payment_method ||
      'Other',
    reference:
      payment?.reference ||
      payment?.reference_number ||
      '',
    notes:
      payment?.notes || '',
    created_at:
      payment?.created_at ||
      new Date().toISOString(),
  }
}

function calculateInvoice(
  invoice,
  items,
  payments
) {
  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      Number(item.quantity || 0) *
        Number(item.unit_price || 0),
    0
  )

  const discountValue = Number(
    invoice.discount_value || 0
  )

  const discount =
    invoice.discount_type === 'Amount'
      ? Math.min(
          subtotal,
          discountValue
        )
      : subtotal *
        (discountValue / 100)

  const discountedSubtotal = Math.max(
    0,
    subtotal - discount
  )

  const taxableSubtotal = items.reduce(
    (sum, item) =>
      item.taxable
        ? sum +
          Number(item.quantity || 0) *
            Number(item.unit_price || 0)
        : sum,
    0
  )

  const taxableAfterDiscount =
    subtotal > 0
      ? taxableSubtotal *
        (discountedSubtotal / subtotal)
      : 0

  const tax =
    taxableAfterDiscount *
    (Number(invoice.tax_rate || 0) /
      100)

  const lateFee = Number(
    invoice.late_fee || 0
  )

  const total =
    discountedSubtotal +
    tax +
    lateFee

  const depositApplied = Number(
    invoice.deposit_applied || 0
  )

  const paymentTotal = payments.reduce(
    (sum, payment) =>
      sum + Number(payment.amount || 0),
    0
  )

  const paid =
    paymentTotal +
    depositApplied

  const balance = Math.max(
    0,
    total - paid
  )

  return {
    subtotal,
    discount,
    tax,
    lateFee,
    total,
    depositApplied,
    paymentTotal,
    paid,
    balance,
  }
}

function isOverdue(invoice, balance) {
  if (
    balance <= 0 ||
    !invoice.due_date ||
    invoice.status === 'Void'
  ) {
    return false
  }

  const due = new Date(
    `${invoice.due_date}T23:59:59`
  )

  return due.getTime() < Date.now()
}

function ageInDays(invoice) {
  if (!invoice.due_date) {
    return 0
  }

  const due = new Date(
    `${invoice.due_date}T12:00:00`
  )

  if (Number.isNaN(due.getTime())) {
    return 0
  }

  return Math.max(
    0,
    Math.floor(
      (Date.now() - due.getTime()) /
        86400000
    )
  )
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function missingColumnName(error) {
  const message = String(
    error?.message || ''
  )

  const patterns = [
    /column ["']?([a-zA-Z0-9_]+)["']? does not exist/i,
    /could not find the ["']?([a-zA-Z0-9_]+)["']? column/i,
    /schema cache.*["']([a-zA-Z0-9_]+)["']/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)

    if (match?.[1]) {
      return match[1]
    }
  }

  return ''
}

async function safeSelect(
  supabase,
  table,
  orderColumn = 'created_at',
  ascending = false
) {
  let query = supabase
    .from(table)
    .select('*')

  if (orderColumn) {
    query = query.order(orderColumn, {
      ascending,
    })
  }

  const result = await query

  if (!result.error) {
    return {
      data: result.data || [],
      error: null,
      missing: false,
    }
  }

  const message = String(
    result.error.message || ''
  ).toLowerCase()

  if (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  ) {
    return {
      data: [],
      error: null,
      missing: true,
    }
  }

  return {
    data: [],
    error: result.error,
    missing: false,
  }
}

async function upsertCompatible(
  supabase,
  table,
  payload,
  attempt = 0
) {
  const result = await supabase
    .from(table)
    .upsert(payload)
    .select()
    .single()

  if (!result.error) {
    return result
  }

  if (attempt > 20) {
    return result
  }

  const missing =
    missingColumnName(result.error)

  if (
    missing &&
    Object.prototype.hasOwnProperty.call(
      payload,
      missing
    )
  ) {
    const nextPayload = {
      ...payload,
    }

    delete nextPayload[missing]

    return upsertCompatible(
      supabase,
      table,
      nextPayload,
      attempt + 1
    )
  }

  return result
}

async function insertCompatible(
  supabase,
  table,
  rows,
  attempt = 0
) {
  const result = await supabase
    .from(table)
    .insert(rows)
    .select()

  if (!result.error) {
    return result
  }

  if (attempt > 20) {
    return result
  }

  const missing =
    missingColumnName(result.error)

  if (missing) {
    const nextRows = rows.map((row) => {
      const copy = { ...row }
      delete copy[missing]
      return copy
    })

    const changed = rows.some((row) =>
      Object.prototype.hasOwnProperty.call(
        row,
        missing
      )
    )

    if (changed) {
      return insertCompatible(
        supabase,
        table,
        nextRows,
        attempt + 1
      )
    }
  }

  return result
}

export default function InvoicesModule({
  supabase,
  initialEstimateId,
  initialJobId,
  onOpenCustomer,
  onOpenJob,
}) {
  const [invoices, setInvoices] =
    useState([])
  const [customers, setCustomers] =
    useState([])
  const [properties, setProperties] =
    useState([])
  const [boatLifts, setBoatLifts] =
    useState([])
  const [jobs, setJobs] = useState([])
  const [estimates, setEstimates] =
    useState([])
  const [invoiceItems, setInvoiceItems] =
    useState([])
  const [payments, setPayments] =
    useState([])

  const [loading, setLoading] =
    useState(true)
  const [saving, setSaving] =
    useState(false)
  const [error, setError] =
    useState('')
  const [message, setMessage] =
    useState('')

  const [search, setSearch] =
    useState('')
  const [statusFilter, setStatusFilter] =
    useState('')
  const [agingFilter, setAgingFilter] =
    useState('')
  const [selectedId, setSelectedId] =
    useState(null)
  const [editor, setEditor] =
    useState(null)
  const [paymentInvoice, setPaymentInvoice] =
    useState(null)
  const [paymentForm, setPaymentForm] =
    useState({
      ...EMPTY_PAYMENT,
    })

  const [tableAvailability, setTableAvailability] =
    useState({
      lineItems: true,
      payments: true,
    })

  const loadData = useCallback(async () => {
    if (!supabase) {
      setError(
        'Supabase is not available.'
      )
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const [
      invoiceResult,
      customerResult,
      propertyResult,
      liftResult,
      jobResult,
      estimateResult,
      itemResult,
      paymentResult,
    ] = await Promise.all([
      safeSelect(
        supabase,
        'invoices',
        'created_at',
        false
      ),
      safeSelect(
        supabase,
        'customers',
        'created_at',
        false
      ),
      safeSelect(
        supabase,
        'properties',
        'created_at',
        false
      ),
      safeSelect(
        supabase,
        'boat_lifts',
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
        'invoice_line_items',
        'sort_order',
        true
      ),
      safeSelect(
        supabase,
        'payments',
        'created_at',
        false
      ),
    ])

    const firstError = [
      invoiceResult.error,
      customerResult.error,
      propertyResult.error,
      liftResult.error,
      jobResult.error,
      estimateResult.error,
      itemResult.error,
      paymentResult.error,
    ].find(Boolean)

    if (firstError) {
      setError(firstError.message)
    }

    setInvoices(invoiceResult.data)
    setCustomers(customerResult.data)
    setProperties(propertyResult.data)
    setBoatLifts(liftResult.data)
    setJobs(jobResult.data)
    setEstimates(estimateResult.data)
    setInvoiceItems(itemResult.data)
    setPayments(paymentResult.data)

    setTableAvailability({
      lineItems: !itemResult.missing,
      payments: !paymentResult.missing,
    })

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (
      loading ||
      editor ||
      selectedId
    ) {
      return
    }

    if (initialEstimateId) {
      const estimate = estimates.find(
        (item) =>
          item.id === initialEstimateId
      )

      if (estimate) {
        openFromEstimate(estimate)
      }
    } else if (initialJobId) {
      const job = jobs.find(
        (item) =>
          item.id === initialJobId
      )

      if (job) {
        openFromJob(job)
      }
    }
  }, [
    loading,
    editor,
    selectedId,
    initialEstimateId,
    initialJobId,
    estimates,
    jobs,
  ])

  function itemsForInvoice(invoice) {
    const rows = invoiceItems.filter(
      (item) =>
        item.invoice_id === invoice.id
    )

    if (rows.length) {
      return rows.map(
        normalizeLineItem
      )
    }

    return parseLineItems(
      invoice.line_items
    )
  }

  function paymentsForInvoice(invoice) {
    const rows = payments.filter(
      (payment) =>
        payment.invoice_id === invoice.id
    )

    if (rows.length) {
      return rows.map(
        normalizePayment
      )
    }

    return parseArray(
      invoice.payment_history
    ).map(normalizePayment)
  }

  const invoiceRows = useMemo(
    () =>
      invoices.map((invoice) => {
        const items =
          itemsForInvoice(invoice)

        const invoicePayments =
          paymentsForInvoice(invoice)

        const calculated =
          calculateInvoice(
            invoice,
            items,
            invoicePayments
          )

        const storedTotal = Number(
          invoice.total ??
            invoice.amount ??
            calculated.total
        )

        const storedBalance =
          invoice.balance_due ??
          invoice.balance

        const balance =
          storedBalance === null ||
          storedBalance === undefined
            ? calculated.balance
            : Number(storedBalance)

        const paid =
          Math.max(
            0,
            storedTotal - balance
          )

        const overdue = isOverdue(
          invoice,
          balance
        )

        return {
          ...invoice,
          displayTotal: storedTotal,
          displayBalance: balance,
          displayPaid: paid,
          overdue,
          ageDays: ageInDays(invoice),
        }
      }),
    [
      invoices,
      invoiceItems,
      payments,
    ]
  )

  const filteredInvoices = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase()

    return invoiceRows.filter(
      (invoice) => {
        const effectiveStatus =
          invoice.overdue &&
          ![
            'Paid',
            'Void',
          ].includes(invoice.status)
            ? 'Overdue'
            : invoice.status

        if (
          statusFilter &&
          effectiveStatus !== statusFilter
        ) {
          return false
        }

        if (agingFilter) {
          const age =
            invoice.ageDays

          if (
            agingFilter === 'Current' &&
            age > 0
          ) {
            return false
          }

          if (
            agingFilter === '1-30' &&
            (age < 1 || age > 30)
          ) {
            return false
          }

          if (
            agingFilter === '31-60' &&
            (age < 31 || age > 60)
          ) {
            return false
          }

          if (
            agingFilter === '61-90' &&
            (age < 61 || age > 90)
          ) {
            return false
          }

          if (
            agingFilter === '90+' &&
            age < 91
          ) {
            return false
          }
        }

        if (!query) {
          return true
        }

        const customer = customers.find(
          (item) =>
            item.id ===
            invoice.customer_id
        )

        const job = jobs.find(
          (item) =>
            item.id === invoice.job_id
        )

        return [
          invoice.number,
          invoice.invoice_number,
          invoice.title,
          invoice.status,
          invoice.notes,
          customerName(customer),
          job?.number,
          job?.title,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      }
    )
  }, [
    invoiceRows,
    customers,
    jobs,
    search,
    statusFilter,
    agingFilter,
  ])

  const selectedInvoice = useMemo(
    () =>
      invoices.find(
        (invoice) =>
          invoice.id === selectedId
      ) || null,
    [invoices, selectedId]
  )

  const metrics = useMemo(() => {
    const outstanding =
      invoiceRows.filter(
        (invoice) =>
          invoice.displayBalance > 0 &&
          invoice.status !== 'Void'
      )

    return {
      invoiceCount:
        invoiceRows.length,
      outstandingCount:
        outstanding.length,
      outstandingValue:
        outstanding.reduce(
          (sum, invoice) =>
            sum +
            invoice.displayBalance,
          0
        ),
      overdueValue:
        outstanding
          .filter(
            (invoice) =>
              invoice.overdue
          )
          .reduce(
            (sum, invoice) =>
              sum +
              invoice.displayBalance,
            0
          ),
      paidValue:
        invoiceRows.reduce(
          (sum, invoice) =>
            sum +
            invoice.displayPaid,
          0
        ),
      totalBilled:
        invoiceRows
          .filter(
            (invoice) =>
              invoice.status !== 'Void'
          )
          .reduce(
            (sum, invoice) =>
              sum +
              invoice.displayTotal,
            0
          ),
    }
  }, [invoiceRows])

  const agingTotals = useMemo(() => {
    const open = invoiceRows.filter(
      (invoice) =>
        invoice.displayBalance > 0 &&
        invoice.status !== 'Void'
    )

    return {
      current: open
        .filter(
          (invoice) =>
            invoice.ageDays === 0
        )
        .reduce(
          (sum, invoice) =>
            sum +
            invoice.displayBalance,
          0
        ),
      oneToThirty: open
        .filter(
          (invoice) =>
            invoice.ageDays >= 1 &&
            invoice.ageDays <= 30
        )
        .reduce(
          (sum, invoice) =>
            sum +
            invoice.displayBalance,
          0
        ),
      thirtyOneToSixty: open
        .filter(
          (invoice) =>
            invoice.ageDays >= 31 &&
            invoice.ageDays <= 60
        )
        .reduce(
          (sum, invoice) =>
            sum +
            invoice.displayBalance,
          0
        ),
      sixtyOneToNinety: open
        .filter(
          (invoice) =>
            invoice.ageDays >= 61 &&
            invoice.ageDays <= 90
        )
        .reduce(
          (sum, invoice) =>
            sum +
            invoice.displayBalance,
          0
        ),
      ninetyPlus: open
        .filter(
          (invoice) =>
            invoice.ageDays >= 91
        )
        .reduce(
          (sum, invoice) =>
            sum +
            invoice.displayBalance,
          0
        ),
    }
  }, [invoiceRows])

  function openNewInvoice() {
    setEditor({
      invoice: {
        ...EMPTY_INVOICE,
        number:
          invoiceNumber(invoices),
        due_date: new Date()
          .toISOString()
          .slice(0, 10),
      },
      items: [
        normalizeLineItem(
          DEFAULT_LINE_ITEM
        ),
      ],
    })
  }

  function openInvoice(invoice) {
    const items =
      itemsForInvoice(invoice)

    setEditor({
      invoice: {
        ...EMPTY_INVOICE,
        ...invoice,
        number:
          invoice.number ||
          invoice.invoice_number ||
          '',
        deposit_applied:
          invoice.deposit_applied ??
          invoice.deposit ??
          0,
      },
      items:
        items.length > 0
          ? items
          : [
              normalizeLineItem(
                DEFAULT_LINE_ITEM
              ),
            ],
    })
  }

  function openFromEstimate(estimate) {
    const estimateItems =
      parseLineItems(
        estimate.line_items
      )

    setEditor({
      invoice: {
        ...EMPTY_INVOICE,
        customer_id:
          estimate.customer_id || '',
        property_id:
          estimate.property_id || '',
        boat_lift_id:
          estimate.boat_lift_id || '',
        estimate_id:
          estimate.id || '',
        number:
          invoiceNumber(invoices),
        title:
          estimate.title ||
          `Invoice for ${estimate.number || 'Estimate'}`,
        notes:
          estimate.notes || '',
        customer_message:
          estimate.customer_message ||
          '',
        tax_rate:
          estimate.tax_rate ??
          8.25,
        discount_type:
          estimate.discount_type ||
          'Percent',
        discount_value:
          estimate.discount_value || 0,
        issue_date: new Date()
          .toISOString()
          .slice(0, 10),
        due_date: new Date()
          .toISOString()
          .slice(0, 10),
      },
      items:
        estimateItems.length > 0
          ? estimateItems
          : [
              normalizeLineItem({
                description:
                  estimate.title ||
                  'Approved estimate',
                quantity: 1,
                unit: 'job',
                unit_price:
                  estimate.total || 0,
                taxable: true,
              }),
            ],
    })
  }

  function openFromJob(job) {
    const materials =
      parseArray(
        job.materials_used
      ).map((item) =>
        normalizeLineItem({
          item_type: 'Material',
          description:
            item.name ||
            item.description ||
            'Material',
          quantity:
            item.quantity || 1,
          unit:
            item.unit || 'each',
          unit_price:
            item.price ??
            item.unit_price ??
            item.cost ??
            0,
          taxable: true,
        })
      )

    const serviceAmount =
      Number(
        job.contract_amount || 0
      )

    const jobItems =
      materials.length > 0
        ? materials
        : [
            normalizeLineItem({
              item_type: 'Service',
              description:
                job.title ||
                job.scope ||
                'Boat lift service',
              quantity: 1,
              unit: 'job',
              unit_price:
                serviceAmount,
              taxable: true,
            }),
          ]

    setEditor({
      invoice: {
        ...EMPTY_INVOICE,
        customer_id:
          job.customer_id || '',
        property_id:
          job.property_id || '',
        boat_lift_id:
          job.boat_lift_id || '',
        job_id:
          job.id || '',
        estimate_id:
          job.estimate_id || '',
        number:
          invoiceNumber(invoices),
        title:
          job.title ||
          `Invoice for ${job.number || 'Job'}`,
        notes:
          job.notes || '',
        issue_date: new Date()
          .toISOString()
          .slice(0, 10),
        due_date: new Date()
          .toISOString()
          .slice(0, 10),
      },
      items: jobItems,
    })
  }

  async function updateStatus(
    invoice,
    status
  ) {
    setSaving(true)
    setError('')

    try {
      const { error: updateError } =
        await supabase
          .from('invoices')
          .update({ status })
          .eq('id', invoice.id)

      if (updateError) {
        throw updateError
      }

      setMessage(
        `${invoice.number || invoice.invoice_number || 'Invoice'} marked ${status}.`
      )

      await loadData()
    } catch (statusError) {
      setError(statusError.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteInvoice(invoice) {
    const confirmed = window.confirm(
      `Delete ${invoice.number || invoice.invoice_number || 'this invoice'}?`
    )

    if (!confirmed) {
      return
    }

    setSaving(true)
    setError('')

    try {
      if (tableAvailability.lineItems) {
        await supabase
          .from('invoice_line_items')
          .delete()
          .eq(
            'invoice_id',
            invoice.id
          )
      }

      if (tableAvailability.payments) {
        await supabase
          .from('payments')
          .delete()
          .eq(
            'invoice_id',
            invoice.id
          )
      }

      const { error: deleteError } =
        await supabase
          .from('invoices')
          .delete()
          .eq('id', invoice.id)

      if (deleteError) {
        throw deleteError
      }

      setSelectedId(null)
      await loadData()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setSaving(false)
    }
  }

  function duplicateInvoice(invoice) {
    setEditor({
      invoice: {
        ...EMPTY_INVOICE,
        ...invoice,
        id: '',
        number:
          invoiceNumber(invoices),
        invoice_number: undefined,
        title: `${invoice.title || 'Invoice'} Copy`,
        status: 'Draft',
        issue_date: new Date()
          .toISOString()
          .slice(0, 10),
        due_date: new Date()
          .toISOString()
          .slice(0, 10),
      },
      items:
        itemsForInvoice(invoice).map(
          (item) => ({
            ...item,
            id: createId(),
          })
        ),
    })
  }

  function beginPayment(invoice) {
    const items =
      itemsForInvoice(invoice)

    const invoicePayments =
      paymentsForInvoice(invoice)

    const totals = calculateInvoice(
      invoice,
      items,
      invoicePayments
    )

    setPaymentInvoice({
      ...invoice,
      calculatedBalance:
        totals.balance,
    })

    setPaymentForm({
      ...EMPTY_PAYMENT,
      amount:
        totals.balance > 0
          ? totals.balance.toFixed(2)
          : '',
    })
  }

  async function recordPayment(event) {
    event.preventDefault()

    if (!paymentInvoice) {
      return
    }

    const amount = Number(
      paymentForm.amount || 0
    )

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setError(
        'Enter a payment amount greater than zero.'
      )
      return
    }

    setSaving(true)
    setError('')

    try {
      const payment = normalizePayment({
        id: createId(),
        invoice_id:
          paymentInvoice.id,
        amount,
        payment_date:
          paymentForm.payment_date,
        method:
          paymentForm.method,
        reference:
          paymentForm.reference,
        notes:
          paymentForm.notes,
      })

      let nextPaymentHistory =
        paymentsForInvoice(
          paymentInvoice
        )

      nextPaymentHistory = [
        ...nextPaymentHistory,
        payment,
      ]

      if (
        tableAvailability.payments
      ) {
        const result =
          await insertCompatible(
            supabase,
            'payments',
            [payment]
          )

        if (result.error) {
          throw result.error
        }
      }

      const items =
        itemsForInvoice(
          paymentInvoice
        )

      const totals =
        calculateInvoice(
          paymentInvoice,
          items,
          nextPaymentHistory
        )

      const nextStatus =
        totals.balance <= 0
          ? 'Paid'
          : 'Partial'

      const payload = {
        status: nextStatus,
        amount_paid:
          totals.paid,
        balance_due:
          totals.balance,
        balance:
          totals.balance,
        paid_at:
          totals.balance <= 0
            ? new Date().toISOString()
            : null,
        payment_history:
          nextPaymentHistory,
      }

      const result =
        await upsertCompatible(
          supabase,
          'invoices',
          {
            ...paymentInvoice,
            ...payload,
          }
        )

      if (result.error) {
        throw result.error
      }

      setPaymentInvoice(null)
      setMessage(
        `${money(amount)} payment recorded.`
      )

      await loadData()
    } catch (paymentError) {
      setError(paymentError.message)
    } finally {
      setSaving(false)
    }
  }

  async function removePayment(
    invoice,
    payment
  ) {
    const confirmed = window.confirm(
      `Remove the ${money(payment.amount)} payment?`
    )

    if (!confirmed) {
      return
    }

    setSaving(true)
    setError('')

    try {
      if (
        tableAvailability.payments &&
        payment.id
      ) {
        const { error: deleteError } =
          await supabase
            .from('payments')
            .delete()
            .eq('id', payment.id)

        if (deleteError) {
          throw deleteError
        }
      }

      const nextHistory =
        paymentsForInvoice(invoice).filter(
          (item) =>
            item.id !== payment.id
        )

      const totals =
        calculateInvoice(
          invoice,
          itemsForInvoice(invoice),
          nextHistory
        )

      const nextStatus =
        totals.balance <= 0
          ? 'Paid'
          : totals.paid > 0
            ? 'Partial'
            : 'Sent'

      const result =
        await upsertCompatible(
          supabase,
          'invoices',
          {
            ...invoice,
            status: nextStatus,
            amount_paid:
              totals.paid,
            balance_due:
              totals.balance,
            balance:
              totals.balance,
            payment_history:
              nextHistory,
            paid_at:
              totals.balance <= 0
                ? invoice.paid_at ||
                  new Date().toISOString()
                : null,
          }
        )

      if (result.error) {
        throw result.error
      }

      await loadData()
    } catch (paymentError) {
      setError(paymentError.message)
    } finally {
      setSaving(false)
    }
  }

  function printInvoice(invoice) {
    const items =
      itemsForInvoice(invoice)

    const invoicePayments =
      paymentsForInvoice(invoice)

    const totals =
      calculateInvoice(
        invoice,
        items,
        invoicePayments
      )

    const customer = customers.find(
      (item) =>
        item.id ===
        invoice.customer_id
    )

    const property = properties.find(
      (item) =>
        item.id ===
        invoice.property_id
    )

    const job = jobs.find(
      (item) =>
        item.id === invoice.job_id
    )

    const popup = window.open(
      '',
      '_blank',
      'width=1000,height=850'
    )

    if (!popup) {
      alert(
        'Allow pop-ups to print the invoice.'
      )
      return
    }

    const itemRows = items
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.description)}</td>
            <td>${escapeHtml(item.item_type)}</td>
            <td>${Number(item.quantity || 0)}</td>
            <td>${escapeHtml(item.unit || '')}</td>
            <td>${escapeHtml(money(item.unit_price))}</td>
            <td>${escapeHtml(
              money(
                Number(item.quantity || 0) *
                  Number(item.unit_price || 0)
              )
            )}</td>
          </tr>
        `
      )
      .join('')

    const paymentRows = invoicePayments
      .map(
        (payment) => `
          <tr>
            <td>${escapeHtml(dateText(payment.payment_date))}</td>
            <td>${escapeHtml(payment.method)}</td>
            <td>${escapeHtml(payment.reference || '')}</td>
            <td>${escapeHtml(money(payment.amount))}</td>
          </tr>
        `
      )
      .join('')

    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(invoice.number || invoice.invoice_number || 'Invoice')}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 36px;
              font-family: Arial, sans-serif;
              color: #0f172a;
              line-height: 1.45;
            }
            header {
              display: flex;
              justify-content: space-between;
              gap: 30px;
              border-bottom: 4px solid #0f172a;
              padding-bottom: 18px;
              margin-bottom: 24px;
            }
            h1, h2, p { margin-top: 0; }
            h1 { margin-bottom: 4px; }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 24px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 18px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 9px;
              text-align: left;
            }
            th { background: #f1f5f9; }
            .totals {
              width: 430px;
              margin-left: auto;
              margin-top: 20px;
            }
            .totals div {
              display: flex;
              justify-content: space-between;
              padding: 6px 0;
            }
            .grand {
              border-top: 2px solid #0f172a;
              font-size: 20px;
              font-weight: bold;
            }
            .balance {
              margin-top: 10px;
              padding: 12px;
              background: #e0f2fe;
              font-size: 22px;
              font-weight: 800;
            }
            .print {
              position: fixed;
              top: 12px;
              right: 12px;
              padding: 10px 16px;
              background: #0f172a;
              color: white;
              border: 0;
              border-radius: 8px;
            }
            @media print {
              body { padding: 0; }
              .print { display: none; }
            }
          </style>
        </head>
        <body>
          <button class="print" onclick="window.print()">
            Print / Save PDF
          </button>

          <header>
            <div>
              <h1>Galveston Boat Lifts</h1>
              <p>Invoice ${escapeHtml(invoice.number || invoice.invoice_number || '')}</p>
            </div>

            <div>
              <p><b>Issue Date:</b> ${escapeHtml(dateText(invoice.issue_date || invoice.created_at))}</p>
              <p><b>Due Date:</b> ${escapeHtml(dateText(invoice.due_date))}</p>
              <p><b>Status:</b> ${escapeHtml(invoice.status || 'Draft')}</p>
            </div>
          </header>

          <div class="grid">
            <section>
              <h2>Bill To</h2>
              <p><b>${escapeHtml(customerName(customer))}</b></p>
              <p>${escapeHtml(customer?.phone || '')}</p>
              <p>${escapeHtml(customer?.email || '')}</p>
              <p>${escapeHtml(propertyAddress(property))}</p>
            </section>

            <section>
              <h2>Job Information</h2>
              <p><b>${escapeHtml(invoice.title || '')}</b></p>
              <p>Job: ${escapeHtml(job?.number || '—')}</p>
              <p>Terms: ${escapeHtml(invoice.terms || '')}</p>
            </section>
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>

          <div class="totals">
            <div><span>Subtotal</span><b>${escapeHtml(money(totals.subtotal))}</b></div>
            <div><span>Discount</span><b>-${escapeHtml(money(totals.discount))}</b></div>
            <div><span>Tax</span><b>${escapeHtml(money(totals.tax))}</b></div>
            ${
              totals.lateFee > 0
                ? `<div><span>Late Fee</span><b>${escapeHtml(money(totals.lateFee))}</b></div>`
                : ''
            }
            <div class="grand"><span>Total</span><b>${escapeHtml(money(totals.total))}</b></div>
            <div><span>Deposit Applied</span><b>-${escapeHtml(money(totals.depositApplied))}</b></div>
            <div><span>Payments</span><b>-${escapeHtml(money(totals.paymentTotal))}</b></div>
            <div class="balance"><span>Balance Due</span><b>${escapeHtml(money(totals.balance))}</b></div>
          </div>

          ${
            invoicePayments.length
              ? `
                <section>
                  <h2>Payments</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>${paymentRows}</tbody>
                  </table>
                </section>
              `
              : ''
          }

          <section>
            <h2>Notes</h2>
            <p>${escapeHtml(invoice.customer_message || invoice.notes || '')}</p>
          </section>
        </body>
      </html>
    `)

    popup.document.close()
    popup.focus()
  }

  function emailInvoice(invoice) {
    const customer = customers.find(
      (item) =>
        item.id ===
        invoice.customer_id
    )

    const row = invoiceRows.find(
      (item) =>
        item.id === invoice.id
    )

    const subject = encodeURIComponent(
      `${invoice.number || invoice.invoice_number || 'Invoice'} from Galveston Boat Lifts`
    )

    const body = encodeURIComponent(
      `Hello ${customerName(customer)},\n\n` +
        `Your invoice ${invoice.number || invoice.invoice_number || ''} has a balance of ${money(row?.displayBalance || 0)}.\n\n` +
        `Due date: ${dateText(invoice.due_date)}\n\n` +
        `Thank you,\nGalveston Boat Lifts`
    )

    window.location.href =
      `mailto:${customer?.email || ''}` +
      `?subject=${subject}&body=${body}`

    if (invoice.status === 'Draft') {
      updateStatus(invoice, 'Sent')
    }
  }

  function sendReminder(invoice) {
    const customer = customers.find(
      (item) =>
        item.id ===
        invoice.customer_id
    )

    const row = invoiceRows.find(
      (item) =>
        item.id === invoice.id
    )

    const subject = encodeURIComponent(
      `Payment reminder: ${invoice.number || invoice.invoice_number || 'Invoice'}`
    )

    const body = encodeURIComponent(
      `Hello ${customerName(customer)},\n\n` +
        `This is a payment reminder for invoice ${invoice.number || invoice.invoice_number || ''}. The current balance is ${money(row?.displayBalance || 0)} and the due date was ${dateText(invoice.due_date)}.\n\n` +
        `Please contact Galveston Boat Lifts with any questions.\n\nThank you.`
    )

    window.location.href =
      `mailto:${customer?.email || ''}` +
      `?subject=${subject}&body=${body}`
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Loading Invoices...</h2>
      </section>
    )
  }

  if (editor) {
    return (
      <InvoiceEditor
        supabase={supabase}
        editor={editor}
        invoices={invoices}
        customers={customers}
        properties={properties}
        boatLifts={boatLifts}
        jobs={jobs}
        estimates={estimates}
        tableAvailability={
          tableAvailability
        }
        onCancel={() =>
          setEditor(null)
        }
        onSaved={async (saved) => {
          setEditor(null)
          setSelectedId(saved.id)
          await loadData()
        }}
      />
    )
  }

  if (selectedInvoice) {
    const customer = customers.find(
      (item) =>
        item.id ===
        selectedInvoice.customer_id
    )

    const property = properties.find(
      (item) =>
        item.id ===
        selectedInvoice.property_id
    )

    const lift = boatLifts.find(
      (item) =>
        item.id ===
        selectedInvoice.boat_lift_id
    )

    const job = jobs.find(
      (item) =>
        item.id ===
        selectedInvoice.job_id
    )

    const estimate = estimates.find(
      (item) =>
        item.id ===
        selectedInvoice.estimate_id
    )

    const items =
      itemsForInvoice(
        selectedInvoice
      )

    const invoicePayments =
      paymentsForInvoice(
        selectedInvoice
      )

    const totals =
      calculateInvoice(
        selectedInvoice,
        items,
        invoicePayments
      )

    const overdue =
      isOverdue(
        selectedInvoice,
        totals.balance
      )

    return (
      <>
        <section className="panel">
          <div className="between">
            <div>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setSelectedId(null)
                }
              >
                ← All Invoices
              </button>

              <h1>
                {selectedInvoice.number ||
                  selectedInvoice.invoice_number ||
                  'Invoice'}
                {' · '}
                {selectedInvoice.title ||
                  'Untitled Invoice'}
              </h1>

              <p className="small">
                {customerName(customer)}
                {' · '}
                {propertyAddress(property)}
              </p>
            </div>

            <div className="actions">
              <Badge>
                {overdue
                  ? 'Overdue'
                  : selectedInvoice.status ||
                    'Draft'}
              </Badge>

              <button
                type="button"
                className="secondary"
                onClick={() =>
                  openInvoice(
                    selectedInvoice
                  )
                }
              >
                Edit
              </button>

              <button
                type="button"
                className="secondary"
                onClick={() =>
                  printInvoice(
                    selectedInvoice
                  )
                }
              >
                Print / PDF
              </button>

              <button
                type="button"
                className="primary"
                onClick={() =>
                  emailInvoice(
                    selectedInvoice
                  )
                }
              >
                Email Invoice
              </button>
            </div>
          </div>
        </section>

        {error && (
          <section className="panel">
            <p className="negative">
              {error}
            </p>
          </section>
        )}

        {message && (
          <section className="panel">
            <p className="positive">
              {message}
            </p>
          </section>
        )}

        <div className="metrics">
          <Metric
            label="Invoice Total"
            value={money(totals.total)}
          />
          <Metric
            label="Payments"
            value={money(
              totals.paymentTotal
            )}
          />
          <Metric
            label="Deposit Applied"
            value={money(
              totals.depositApplied
            )}
          />
          <Metric
            label="Balance Due"
            value={money(totals.balance)}
          />
          <Metric
            label="Due Date"
            value={dateText(
              selectedInvoice.due_date
            )}
          />
        </div>

        <div className="grid-2">
          <section className="panel">
            <h2>Customer</h2>

            <p>
              <b>Name:</b>{' '}
              {customerName(customer)}
            </p>
            <p>
              <b>Phone:</b>{' '}
              {customer?.phone || '—'}
            </p>
            <p>
              <b>Email:</b>{' '}
              {customer?.email || '—'}
            </p>
            <p>
              <b>Property:</b>{' '}
              {propertyAddress(property)}
            </p>
            <p>
              <b>Boat Lift:</b>{' '}
              {lift?.lift_number ||
                lift?.name ||
                '—'}
            </p>

            <button
              type="button"
              className="secondary"
              onClick={() =>
                onOpenCustomer?.(
                  selectedInvoice.customer_id
                )
              }
            >
              Open Customer
            </button>
          </section>

          <section className="panel">
            <h2>Invoice Information</h2>

            <p>
              <b>Status:</b>{' '}
              {overdue
                ? 'Overdue'
                : selectedInvoice.status}
            </p>
            <p>
              <b>Issue Date:</b>{' '}
              {dateText(
                selectedInvoice.issue_date ||
                  selectedInvoice.created_at
              )}
            </p>
            <p>
              <b>Due Date:</b>{' '}
              {dateText(
                selectedInvoice.due_date
              )}
            </p>
            <p>
              <b>Terms:</b>{' '}
              {selectedInvoice.terms ||
                '—'}
            </p>
            <p>
              <b>Job:</b>{' '}
              {job?.number || '—'}
            </p>
            <p>
              <b>Estimate:</b>{' '}
              {estimate?.number || '—'}
            </p>

            {job && (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  onOpenJob?.(job.id)
                }
              >
                Open Job
              </button>
            )}
          </section>
        </div>

        <section className="panel">
          <h2>Line Items</h2>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.item_type}
                    </td>
                    <td>
                      <b>
                        {item.description}
                      </b>
                    </td>
                    <td>
                      {item.quantity}
                    </td>
                    <td>
                      {item.unit}
                    </td>
                    <td>
                      {money(
                        item.unit_price
                      )}
                    </td>
                    <td>
                      {money(
                        Number(
                          item.quantity || 0
                        ) *
                          Number(
                            item.unit_price ||
                              0
                          )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div
            style={{
              maxWidth: 480,
              marginLeft: 'auto',
              marginTop: 20,
            }}
          >
            <SummaryRow
              label="Subtotal"
              value={money(
                totals.subtotal
              )}
            />
            <SummaryRow
              label="Discount"
              value={`-${money(
                totals.discount
              )}`}
            />
            <SummaryRow
              label="Tax"
              value={money(totals.tax)}
            />
            {totals.lateFee > 0 && (
              <SummaryRow
                label="Late Fee"
                value={money(
                  totals.lateFee
                )}
              />
            )}
            <SummaryRow
              label="Invoice Total"
              value={money(
                totals.total
              )}
              strong
            />
            <SummaryRow
              label="Paid"
              value={`-${money(
                totals.paid
              )}`}
            />
            <SummaryRow
              label="Balance Due"
              value={money(
                totals.balance
              )}
              strong
            />
          </div>
        </section>

        <section className="panel">
          <div className="between">
            <div>
              <h2>Payments</h2>
              <p className="small">
                Record checks, cash, card,
                ACH, wire, or other payments.
              </p>
            </div>

            <button
              type="button"
              className="primary"
              disabled={
                totals.balance <= 0 ||
                selectedInvoice.status ===
                  'Void'
              }
              onClick={() =>
                beginPayment(
                  selectedInvoice
                )
              }
            >
              + Record Payment
            </button>
          </div>

          <div className="cards">
            {invoicePayments.map(
              (payment) => (
                <article
                  className="card"
                  key={payment.id}
                >
                  <div className="between">
                    <div>
                      <h3>
                        {money(
                          payment.amount
                        )}
                      </h3>

                      <div className="small">
                        {dateText(
                          payment.payment_date
                        )}
                        {' · '}
                        {payment.method}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="danger"
                      disabled={saving}
                      onClick={() =>
                        removePayment(
                          selectedInvoice,
                          payment
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>

                  <p>
                    <b>Reference:</b>{' '}
                    {payment.reference ||
                      '—'}
                  </p>

                  <p>
                    {payment.notes || ''}
                  </p>
                </article>
              )
            )}

            {!invoicePayments.length && (
              <Empty>
                No payments recorded
              </Empty>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Invoice Workflow</h2>

          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() =>
                updateStatus(
                  selectedInvoice,
                  'Sent'
                )
              }
            >
              Mark Sent
            </button>

            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() =>
                updateStatus(
                  selectedInvoice,
                  'Viewed'
                )
              }
            >
              Mark Viewed
            </button>

            <button
              type="button"
              className="primary"
              disabled={saving}
              onClick={() =>
                beginPayment(
                  selectedInvoice
                )
              }
            >
              Record Payment
            </button>

            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() =>
                updateStatus(
                  selectedInvoice,
                  'Paid'
                )
              }
            >
              Mark Paid
            </button>

            <button
              type="button"
              className="secondary"
              onClick={() =>
                duplicateInvoice(
                  selectedInvoice
                )
              }
            >
              Duplicate
            </button>

            <button
              type="button"
              className="secondary"
              disabled={
                totals.balance <= 0
              }
              onClick={() =>
                sendReminder(
                  selectedInvoice
                )
              }
            >
              Send Reminder
            </button>

            <button
              type="button"
              className="danger"
              disabled={saving}
              onClick={() =>
                updateStatus(
                  selectedInvoice,
                  'Void'
                )
              }
            >
              Void Invoice
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Notes</h2>

          <p>
            <b>Customer Message:</b>{' '}
            {selectedInvoice.customer_message ||
              selectedInvoice.notes ||
              '—'}
          </p>

          <p>
            <b>Internal Notes:</b>{' '}
            {selectedInvoice.internal_notes ||
              '—'}
          </p>
        </section>

        <section className="panel">
          <button
            type="button"
            className="danger"
            disabled={saving}
            onClick={() =>
              deleteInvoice(
                selectedInvoice
              )
            }
          >
            Delete Invoice
          </button>
        </section>
      </>
    )
  }

  return (
    <>
      <section className="panel">
        <div className="between">
          <div>
            <h1>Invoices</h1>
            <p className="small">
              Create invoices, collect
              payments, track balances, and
              manage aging.
            </p>
          </div>

          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={loadData}
            >
              Refresh
            </button>

            <button
              type="button"
              className="primary"
              onClick={openNewInvoice}
            >
              + New Invoice
            </button>
          </div>
        </div>

        {error && (
          <p className="negative">{error}</p>
        )}

        {message && (
          <p className="positive">{message}</p>
        )}
      </section>

      <div className="metrics">
        <Metric
          label="Total Billed"
          value={money(
            metrics.totalBilled
          )}
        />
        <Metric
          label="Outstanding"
          value={money(
            metrics.outstandingValue
          )}
        />
        <Metric
          label="Overdue"
          value={money(
            metrics.overdueValue
          )}
        />
        <Metric
          label="Payments Collected"
          value={money(
            metrics.paidValue
          )}
        />
        <Metric
          label="Open Invoices"
          value={
            metrics.outstandingCount
          }
        />
      </div>

      <section className="panel">
        <h2>Accounts Receivable Aging</h2>

        <div className="metrics">
          <Metric
            label="Current"
            value={money(
              agingTotals.current
            )}
          />
          <Metric
            label="1–30 Days"
            value={money(
              agingTotals.oneToThirty
            )}
          />
          <Metric
            label="31–60 Days"
            value={money(
              agingTotals.thirtyOneToSixty
            )}
          />
          <Metric
            label="61–90 Days"
            value={money(
              agingTotals.sixtyOneToNinety
            )}
          />
          <Metric
            label="90+ Days"
            value={money(
              agingTotals.ninetyPlus
            )}
          />
        </div>
      </section>

      <section className="panel">
        <div className="form-grid">
          <Field
            label="Search"
            value={search}
            onChange={setSearch}
            placeholder="Invoice, customer, job..."
          />

          <SelectField
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ['', 'All statuses'],
              ...INVOICE_STATUSES.map(
                (status) => [
                  status,
                  status,
                ]
              ),
            ]}
          />

          <SelectField
            label="Aging"
            value={agingFilter}
            onChange={setAgingFilter}
            options={[
              ['', 'All aging'],
              ['Current', 'Current'],
              ['1-30', '1–30 Days'],
              ['31-60', '31–60 Days'],
              ['61-90', '61–90 Days'],
              ['90+', '90+ Days'],
            ]}
          />
        </div>
      </section>

      <section className="panel">
        <div className="cards">
          {filteredInvoices.map(
            (invoice) => {
              const customer =
                customers.find(
                  (item) =>
                    item.id ===
                    invoice.customer_id
                )

              const effectiveStatus =
                invoice.overdue &&
                ![
                  'Paid',
                  'Void',
                ].includes(
                  invoice.status
                )
                  ? 'Overdue'
                  : invoice.status

              return (
                <article
                  className="card"
                  key={invoice.id}
                >
                  <div className="between">
                    <div>
                      <h3>
                        {invoice.number ||
                          invoice.invoice_number ||
                          'Invoice'}
                        {' · '}
                        {invoice.title ||
                          'Untitled'}
                      </h3>

                      <div className="small">
                        {customerName(
                          customer
                        )}
                        {' · Due '}
                        {dateText(
                          invoice.due_date
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="money">
                        {money(
                          invoice.displayBalance
                        )}
                      </div>

                      <Badge>
                        {effectiveStatus ||
                          'Draft'}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid-2">
                    <p>
                      <b>Total:</b>{' '}
                      {money(
                        invoice.displayTotal
                      )}
                    </p>

                    <p>
                      <b>Paid:</b>{' '}
                      {money(
                        invoice.displayPaid
                      )}
                    </p>
                  </div>

                  <div className="actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        setSelectedId(
                          invoice.id
                        )
                      }
                    >
                      Open Invoice
                    </button>

                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        printInvoice(
                          invoice
                        )
                      }
                    >
                      PDF
                    </button>

                    <button
                      type="button"
                      className="secondary"
                      disabled={
                        invoice.displayBalance <=
                        0
                      }
                      onClick={() =>
                        beginPayment(
                          invoice
                        )
                      }
                    >
                      Payment
                    </button>

                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        emailInvoice(
                          invoice
                        )
                      }
                    >
                      Email
                    </button>
                  </div>
                </article>
              )
            }
          )}

          {!filteredInvoices.length && (
            <Empty>No invoices found</Empty>
          )}
        </div>
      </section>

      {paymentInvoice && (
        <Modal
          title={`Record Payment · ${
            paymentInvoice.number ||
            paymentInvoice.invoice_number ||
            'Invoice'
          }`}
          onClose={() =>
            setPaymentInvoice(null)
          }
        >
          <form onSubmit={recordPayment}>
            <p>
              <b>Current Balance:</b>{' '}
              {money(
                paymentInvoice.calculatedBalance
              )}
            </p>

            <div className="form-grid">
              <Field
                label="Payment Amount"
                type="number"
                value={paymentForm.amount}
                onChange={(value) =>
                  setPaymentForm(
                    (current) => ({
                      ...current,
                      amount: value,
                    })
                  )
                }
              />

              <Field
                label="Payment Date"
                type="date"
                value={
                  paymentForm.payment_date
                }
                onChange={(value) =>
                  setPaymentForm(
                    (current) => ({
                      ...current,
                      payment_date:
                        value,
                    })
                  )
                }
              />

              <SelectField
                label="Method"
                value={paymentForm.method}
                onChange={(value) =>
                  setPaymentForm(
                    (current) => ({
                      ...current,
                      method: value,
                    })
                  )
                }
                options={PAYMENT_METHODS.map(
                  (method) => [
                    method,
                    method,
                  ]
                )}
              />

              <Field
                label="Reference"
                value={
                  paymentForm.reference
                }
                onChange={(value) =>
                  setPaymentForm(
                    (current) => ({
                      ...current,
                      reference:
                        value,
                    })
                  )
                }
                placeholder="Check number, transaction ID..."
              />
            </div>

            <TextArea
              label="Notes"
              value={paymentForm.notes}
              onChange={(value) =>
                setPaymentForm(
                  (current) => ({
                    ...current,
                    notes: value,
                  })
                )
              }
              rows={4}
            />

            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setPaymentInvoice(null)
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary"
                disabled={saving}
              >
                {saving
                  ? 'Saving...'
                  : 'Record Payment'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

function InvoiceEditor({
  supabase,
  editor,
  invoices,
  customers,
  properties,
  boatLifts,
  jobs,
  estimates,
  tableAvailability,
  onCancel,
  onSaved,
}) {
  const [invoice, setInvoice] =
    useState(editor.invoice)

  const [items, setItems] =
    useState(
      editor.items.map(
        normalizeLineItem
      )
    )

  const [saving, setSaving] =
    useState(false)
  const [error, setError] =
    useState('')

  const totals = useMemo(
    () =>
      calculateInvoice(
        invoice,
        items,
        []
      ),
    [invoice, items]
  )

  const filteredProperties =
    useMemo(
      () =>
        properties.filter(
          (property) =>
            !invoice.customer_id ||
            property.customer_id ===
              invoice.customer_id
        ),
      [
        properties,
        invoice.customer_id,
      ]
    )

  const filteredLifts = useMemo(
    () =>
      boatLifts.filter(
        (lift) =>
          (!invoice.customer_id ||
            lift.customer_id ===
              invoice.customer_id) &&
          (!invoice.property_id ||
            lift.property_id ===
              invoice.property_id)
      ),
    [
      boatLifts,
      invoice.customer_id,
      invoice.property_id,
    ]
  )

  const filteredJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          !invoice.customer_id ||
          job.customer_id ===
            invoice.customer_id
      ),
    [
      jobs,
      invoice.customer_id,
    ]
  )

  const filteredEstimates =
    useMemo(
      () =>
        estimates.filter(
          (estimate) =>
            !invoice.customer_id ||
            estimate.customer_id ===
              invoice.customer_id
        ),
      [
        estimates,
        invoice.customer_id,
      ]
    )

  function updateInvoice(field, value) {
    setInvoice((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function updateItem(
    itemId,
    field,
    value
  ) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              [field]:
                [
                  'quantity',
                  'unit_price',
                ].includes(field)
                  ? Number(value || 0)
                  : value,
            }
          : item
      )
    )
  }

  function addItem(
    itemType = 'Service'
  ) {
    setItems((current) => [
      ...current,
      normalizeLineItem({
        ...DEFAULT_LINE_ITEM,
        id: createId(),
        item_type: itemType,
        sort_order: current.length,
      }),
    ])
  }

  function removeItem(itemId) {
    setItems((current) =>
      current.filter(
        (item) =>
          item.id !== itemId
      )
    )
  }

  function moveItem(
    itemId,
    direction
  ) {
    setItems((current) => {
      const index =
        current.findIndex(
          (item) =>
            item.id === itemId
        )

      const nextIndex =
        index + direction

      if (
        index < 0 ||
        nextIndex < 0 ||
        nextIndex >= current.length
      ) {
        return current
      }

      const next = [...current]
      const [item] = next.splice(
        index,
        1
      )

      next.splice(
        nextIndex,
        0,
        item
      )

      return next.map(
        (entry, sortOrder) => ({
          ...entry,
          sort_order:
            sortOrder,
        })
      )
    })
  }

  function applyJob(jobId) {
    const job = jobs.find(
      (item) =>
        item.id === jobId
    )

    if (!job) {
      updateInvoice(
        'job_id',
        ''
      )
      return
    }

    const materials =
      parseArray(
        job.materials_used
      ).map((item) =>
        normalizeLineItem({
          item_type: 'Material',
          description:
            item.name ||
            item.description ||
            'Material',
          quantity:
            item.quantity || 1,
          unit:
            item.unit || 'each',
          unit_price:
            item.price ??
            item.unit_price ??
            item.cost ??
            0,
          taxable: true,
        })
      )

    setInvoice((current) => ({
      ...current,
      job_id: job.id,
      estimate_id:
        job.estimate_id ||
        current.estimate_id,
      customer_id:
        job.customer_id ||
        current.customer_id,
      property_id:
        job.property_id ||
        current.property_id,
      boat_lift_id:
        job.boat_lift_id ||
        current.boat_lift_id,
      title:
        current.title ||
        job.title ||
        `Invoice for ${job.number || 'Job'}`,
    }))

    if (materials.length) {
      setItems(materials)
    } else if (
      Number(
        job.contract_amount || 0
      ) > 0
    ) {
      setItems([
        normalizeLineItem({
          item_type: 'Service',
          description:
            job.title ||
            job.scope ||
            'Boat lift service',
          quantity: 1,
          unit: 'job',
          unit_price:
            job.contract_amount,
          taxable: true,
        }),
      ])
    }
  }

  function applyEstimate(
    estimateId
  ) {
    const estimate =
      estimates.find(
        (item) =>
          item.id === estimateId
      )

    if (!estimate) {
      updateInvoice(
        'estimate_id',
        ''
      )
      return
    }

    const estimateItems =
      parseLineItems(
        estimate.line_items
      )

    setInvoice((current) => ({
      ...current,
      estimate_id:
        estimate.id,
      customer_id:
        estimate.customer_id ||
        current.customer_id,
      property_id:
        estimate.property_id ||
        current.property_id,
      boat_lift_id:
        estimate.boat_lift_id ||
        current.boat_lift_id,
      title:
        current.title ||
        estimate.title ||
        `Invoice for ${estimate.number || 'Estimate'}`,
      discount_type:
        estimate.discount_type ||
        current.discount_type,
      discount_value:
        estimate.discount_value ??
        current.discount_value,
      tax_rate:
        estimate.tax_rate ??
        current.tax_rate,
    }))

    if (estimateItems.length) {
      setItems(estimateItems)
    } else if (
      Number(
        estimate.total || 0
      ) > 0
    ) {
      setItems([
        normalizeLineItem({
          item_type: 'Service',
          description:
            estimate.title ||
            'Approved estimate',
          quantity: 1,
          unit: 'job',
          unit_price:
            estimate.total,
          taxable: true,
        }),
      ])
    }
  }

  async function saveInvoice(event) {
    event.preventDefault()

    if (!invoice.customer_id) {
      setError(
        'Select a customer.'
      )
      return
    }

    if (
      !invoice.title.trim()
    ) {
      setError(
        'Enter an invoice title.'
      )
      return
    }

    const cleanItems = items
      .filter(
        (item) =>
          item.description.trim()
      )
      .map((item, index) => ({
        ...normalizeLineItem(
          item,
          index
        ),
        sort_order: index,
      }))

    if (!cleanItems.length) {
      setError(
        'Add at least one invoice line item.'
      )
      return
    }

    setSaving(true)
    setError('')

    try {
      const {
        data: authData,
      } = await supabase.auth.getUser()

      const invoiceId =
        invoice.id || createId()

      const payload = {
        id: invoiceId,
        user_id:
          authData?.user?.id ||
          undefined,
        customer_id:
          invoice.customer_id,
        property_id:
          invoice.property_id ||
          null,
        boat_lift_id:
          invoice.boat_lift_id ||
          null,
        job_id:
          invoice.job_id || null,
        estimate_id:
          invoice.estimate_id ||
          null,
        number:
          invoice.number ||
          invoice.invoice_number ||
          invoiceNumber(invoices),
        invoice_number:
          invoice.number ||
          invoice.invoice_number ||
          invoiceNumber(invoices),
        title:
          invoice.title,
        status:
          invoice.status ||
          'Draft',
        issue_date:
          invoice.issue_date ||
          null,
        due_date:
          invoice.due_date ||
          null,
        terms:
          invoice.terms || '',
        notes:
          invoice.notes ||
          invoice.customer_message ||
          '',
        customer_message:
          invoice.customer_message ||
          '',
        internal_notes:
          invoice.internal_notes ||
          '',
        discount_type:
          invoice.discount_type ||
          'Percent',
        discount_value:
          Number(
            invoice.discount_value ||
              0
          ),
        tax_rate:
          Number(
            invoice.tax_rate || 0
          ),
        deposit_applied:
          Number(
            invoice.deposit_applied ||
              0
          ),
        late_fee:
          Number(
            invoice.late_fee || 0
          ),
        subtotal:
          Math.round(
            totals.subtotal * 100
          ) / 100,
        discount:
          Math.round(
            totals.discount * 100
          ) / 100,
        tax:
          Math.round(
            totals.tax * 100
          ) / 100,
        total:
          Math.round(
            totals.total * 100
          ) / 100,
        amount:
          Math.round(
            totals.total * 100
          ) / 100,
        amount_paid:
          Number(
            invoice.amount_paid ||
              0
          ),
        balance_due:
          Math.round(
            totals.balance * 100
          ) / 100,
        balance:
          Math.round(
            totals.balance * 100
          ) / 100,
        line_items:
          cleanItems.map(
            (item) => ({
              description:
                item.description,
              item_type:
                item.item_type,
              quantity:
                item.quantity,
              qty:
                item.quantity,
              unit:
                item.unit,
              unit_price:
                item.unit_price,
              price:
                item.unit_price,
              taxable:
                item.taxable,
            })
          ),
      }

      Object.keys(payload).forEach(
        (key) => {
          if (
            payload[key] ===
            undefined
          ) {
            delete payload[key]
          }
        }
      )

      const result =
        await upsertCompatible(
          supabase,
          'invoices',
          payload
        )

      if (result.error) {
        throw result.error
      }

      if (
        tableAvailability.lineItems
      ) {
        const { error: deleteError } =
          await supabase
            .from(
              'invoice_line_items'
            )
            .delete()
            .eq(
              'invoice_id',
              invoiceId
            )

        if (deleteError) {
          throw deleteError
        }

        const rows =
          cleanItems.map(
            (item, index) => ({
              id: createId(),
              invoice_id:
                invoiceId,
              description:
                item.description,
              item_type:
                item.item_type,
              quantity:
                item.quantity,
              unit:
                item.unit,
              unit_price:
                item.unit_price,
              taxable:
                item.taxable,
              sort_order: index,
            })
          )

        const itemResult =
          await insertCompatible(
            supabase,
            'invoice_line_items',
            rows
          )

        if (itemResult.error) {
          throw itemResult.error
        }
      }

      await onSaved(
        result.data
      )
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={saveInvoice}>
      <section className="panel">
        <div className="between">
          <div>
            <h1>
              {invoice.id
                ? 'Edit Invoice'
                : 'New Invoice'}
            </h1>

            <p className="small">
              Build the invoice, calculate
              tax and balance, and connect it
              to a job or estimate.
            </p>
          </div>

          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={onCancel}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary"
              disabled={saving}
            >
              {saving
                ? 'Saving...'
                : 'Save Invoice'}
            </button>
          </div>
        </div>

        {error && (
          <p className="negative">
            {error}
          </p>
        )}
      </section>

      <div className="metrics">
        <Metric
          label="Subtotal"
          value={money(
            totals.subtotal
          )}
        />
        <Metric
          label="Discount"
          value={money(
            totals.discount
          )}
        />
        <Metric
          label="Tax"
          value={money(totals.tax)}
        />
        <Metric
          label="Invoice Total"
          value={money(
            totals.total
          )}
        />
        <Metric
          label="Balance Due"
          value={money(
            totals.balance
          )}
        />
      </div>

      <section className="panel">
        <h2>Invoice Information</h2>

        <div className="form-grid">
          <Field
            label="Invoice Number"
            value={
              invoice.number ||
              invoice.invoice_number ||
              ''
            }
            onChange={(value) =>
              updateInvoice(
                'number',
                value
              )
            }
          />

          <Field
            label="Title"
            value={invoice.title}
            onChange={(value) =>
              updateInvoice(
                'title',
                value
              )
            }
            required
          />

          <SelectField
            label="Status"
            value={invoice.status}
            onChange={(value) =>
              updateInvoice(
                'status',
                value
              )
            }
            options={INVOICE_STATUSES.map(
              (status) => [
                status,
                status,
              ]
            )}
          />

          <Field
            label="Issue Date"
            type="date"
            value={
              invoice.issue_date
            }
            onChange={(value) =>
              updateInvoice(
                'issue_date',
                value
              )
            }
          />

          <Field
            label="Due Date"
            type="date"
            value={invoice.due_date}
            onChange={(value) =>
              updateInvoice(
                'due_date',
                value
              )
            }
          />

          <SelectField
            label="Customer"
            value={
              invoice.customer_id
            }
            onChange={(value) => {
              setInvoice(
                (current) => ({
                  ...current,
                  customer_id:
                    value,
                  property_id: '',
                  boat_lift_id: '',
                  job_id: '',
                  estimate_id: '',
                })
              )
            }}
            options={[
              ['', 'Select customer'],
              ...customers.map(
                (customer) => [
                  customer.id,
                  customerName(
                    customer
                  ),
                ]
              ),
            ]}
          />

          <SelectField
            label="Property"
            value={
              invoice.property_id
            }
            onChange={(value) => {
              setInvoice(
                (current) => ({
                  ...current,
                  property_id:
                    value,
                  boat_lift_id: '',
                })
              )
            }}
            options={[
              ['', 'No property'],
              ...filteredProperties.map(
                (property) => [
                  property.id,
                  propertyAddress(
                    property
                  ),
                ]
              ),
            ]}
          />

          <SelectField
            label="Boat Lift"
            value={
              invoice.boat_lift_id
            }
            onChange={(value) =>
              updateInvoice(
                'boat_lift_id',
                value
              )
            }
            options={[
              ['', 'No boat lift'],
              ...filteredLifts.map(
                (lift) => [
                  lift.id,
                  lift.lift_number ||
                    lift.name ||
                    'Boat Lift',
                ]
              ),
            ]}
          />

          <SelectField
            label="Linked Job"
            value={
              invoice.job_id
            }
            onChange={applyJob}
            options={[
              ['', 'No linked job'],
              ...filteredJobs.map(
                (job) => [
                  job.id,
                  `${job.number || 'Job'} · ${job.title || ''}`,
                ]
              ),
            ]}
          />

          <SelectField
            label="Linked Estimate"
            value={
              invoice.estimate_id
            }
            onChange={applyEstimate}
            options={[
              ['', 'No linked estimate'],
              ...filteredEstimates.map(
                (estimate) => [
                  estimate.id,
                  `${estimate.number || 'Estimate'} · ${estimate.title || ''}`,
                ]
              ),
            ]}
          />

          <Field
            label="Payment Terms"
            value={invoice.terms}
            onChange={(value) =>
              updateInvoice(
                'terms',
                value
              )
            }
            placeholder="Due on receipt, Net 15, Net 30..."
          />
        </div>
      </section>

      <section className="panel">
        <div className="between">
          <h2>Invoice Line Items</h2>

          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                addItem('Service')
              }
            >
              + Service
            </button>

            <button
              type="button"
              className="secondary"
              onClick={() =>
                addItem('Material')
              }
            >
              + Material
            </button>

            <button
              type="button"
              className="secondary"
              onClick={() =>
                addItem('Labor')
              }
            >
              + Labor
            </button>

            <button
              type="button"
              className="secondary"
              onClick={() =>
                addItem('Equipment')
              }
            >
              + Equipment
            </button>
          </div>
        </div>

        {items.map(
          (item, index) => (
            <article
              className="card"
              key={item.id}
            >
              <div className="between">
                <strong>
                  Line Item {index + 1}
                </strong>

                <div className="actions">
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      index === 0
                    }
                    onClick={() =>
                      moveItem(
                        item.id,
                        -1
                      )
                    }
                  >
                    ↑
                  </button>

                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      index ===
                      items.length - 1
                    }
                    onClick={() =>
                      moveItem(
                        item.id,
                        1
                      )
                    }
                  >
                    ↓
                  </button>

                  <button
                    type="button"
                    className="danger"
                    disabled={
                      items.length === 1
                    }
                    onClick={() =>
                      removeItem(
                        item.id
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="form-grid">
                <SelectField
                  label="Type"
                  value={
                    item.item_type
                  }
                  onChange={(value) =>
                    updateItem(
                      item.id,
                      'item_type',
                      value
                    )
                  }
                  options={[
                    ['Service', 'Service'],
                    ['Material', 'Material'],
                    ['Labor', 'Labor'],
                    ['Equipment', 'Equipment'],
                    ['Other', 'Other'],
                  ]}
                />

                <Field
                  label="Description"
                  value={
                    item.description
                  }
                  onChange={(value) =>
                    updateItem(
                      item.id,
                      'description',
                      value
                    )
                  }
                />

                <Field
                  label="Quantity"
                  type="number"
                  value={
                    item.quantity
                  }
                  onChange={(value) =>
                    updateItem(
                      item.id,
                      'quantity',
                      value
                    )
                  }
                />

                <Field
                  label="Unit"
                  value={item.unit}
                  onChange={(value) =>
                    updateItem(
                      item.id,
                      'unit',
                      value
                    )
                  }
                />

                <Field
                  label="Unit Price"
                  type="number"
                  value={
                    item.unit_price
                  }
                  onChange={(value) =>
                    updateItem(
                      item.id,
                      'unit_price',
                      value
                    )
                  }
                />

                <label>
                  <span
                    style={{
                      display: 'block',
                      marginBottom: 6,
                      fontWeight: 700,
                    }}
                  >
                    Taxable
                  </span>

                  <input
                    type="checkbox"
                    checked={
                      item.taxable
                    }
                    onChange={(event) =>
                      updateItem(
                        item.id,
                        'taxable',
                        event.target
                          .checked
                      )
                    }
                  />
                </label>

                <div>
                  <b>Line Total</b>
                  <div className="money">
                    {money(
                      Number(
                        item.quantity ||
                          0
                      ) *
                        Number(
                          item.unit_price ||
                            0
                        )
                    )}
                  </div>
                </div>
              </div>
            </article>
          )
        )}
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Pricing</h2>

          <div className="form-grid">
            <SelectField
              label="Discount Type"
              value={
                invoice.discount_type
              }
              onChange={(value) =>
                updateInvoice(
                  'discount_type',
                  value
                )
              }
              options={[
                ['Percent', 'Percent'],
                ['Amount', 'Dollar Amount'],
              ]}
            />

            <Field
              label={
                invoice.discount_type ===
                'Amount'
                  ? 'Discount Amount'
                  : 'Discount Percent'
              }
              type="number"
              value={
                invoice.discount_value
              }
              onChange={(value) =>
                updateInvoice(
                  'discount_value',
                  Number(value || 0)
                )
              }
            />

            <Field
              label="Tax Rate %"
              type="number"
              value={
                invoice.tax_rate
              }
              onChange={(value) =>
                updateInvoice(
                  'tax_rate',
                  Number(value || 0)
                )
              }
            />

            <Field
              label="Deposit Applied"
              type="number"
              value={
                invoice.deposit_applied
              }
              onChange={(value) =>
                updateInvoice(
                  'deposit_applied',
                  Number(value || 0)
                )
              }
            />

            <Field
              label="Late Fee"
              type="number"
              value={
                invoice.late_fee
              }
              onChange={(value) =>
                updateInvoice(
                  'late_fee',
                  Number(value || 0)
                )
              }
            />
          </div>
        </section>

        <section className="panel">
          <h2>Totals</h2>

          <SummaryRow
            label="Subtotal"
            value={money(
              totals.subtotal
            )}
          />
          <SummaryRow
            label="Discount"
            value={`-${money(
              totals.discount
            )}`}
          />
          <SummaryRow
            label="Tax"
            value={money(
              totals.tax
            )}
          />
          <SummaryRow
            label="Late Fee"
            value={money(
              totals.lateFee
            )}
          />
          <SummaryRow
            label="Invoice Total"
            value={money(
              totals.total
            )}
            strong
          />
          <SummaryRow
            label="Deposit Applied"
            value={`-${money(
              totals.depositApplied
            )}`}
          />
          <SummaryRow
            label="Balance Due"
            value={money(
              totals.balance
            )}
            strong
          />
        </section>
      </div>

      <section className="panel">
        <h2>Messages and Notes</h2>

        <div className="grid-2">
          <TextArea
            label="Customer Message"
            value={
              invoice.customer_message
            }
            onChange={(value) =>
              updateInvoice(
                'customer_message',
                value
              )
            }
            rows={5}
          />

          <TextArea
            label="Internal Notes"
            value={
              invoice.internal_notes
            }
            onChange={(value) =>
              updateInvoice(
                'internal_notes',
                value
              )
            }
            rows={5}
          />
        </div>
      </section>
    </form>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  required = false,
}) {
  return (
    <label>
      <span
        style={{
          display: 'block',
          marginBottom: 6,
          fontWeight: 700,
        }}
      >
        {label}
      </span>

      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        required={required}
        onChange={(event) =>
          onChange(event.target.value)
        }
        style={{
          width: '100%',
          padding: '11px 12px',
          border:
            '1px solid #cbd5e1',
          borderRadius: 8,
          font: 'inherit',
        }}
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}) {
  return (
    <label>
      <span
        style={{
          display: 'block',
          marginBottom: 6,
          fontWeight: 700,
        }}
      >
        {label}
      </span>

      <select
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value)
        }
        style={{
          width: '100%',
          padding: '11px 12px',
          border:
            '1px solid #cbd5e1',
          borderRadius: 8,
          font: 'inherit',
          background: '#ffffff',
        }}
      >
        {options.map(
          ([
            optionValue,
            optionLabel,
          ]) => (
            <option
              key={String(
                optionValue
              )}
              value={optionValue}
            >
              {optionLabel}
            </option>
          )
        )}
      </select>
    </label>
  )
}

function TextArea({
  label,
  value,
  onChange,
  rows = 4,
}) {
  return (
    <label>
      <span
        style={{
          display: 'block',
          marginBottom: 6,
          fontWeight: 700,
        }}
      >
        {label}
      </span>

      <textarea
        value={value ?? ''}
        rows={rows}
        onChange={(event) =>
          onChange(event.target.value)
        }
        style={{
          width: '100%',
          padding: '11px 12px',
          border:
            '1px solid #cbd5e1',
          borderRadius: 8,
          font: 'inherit',
          resize: 'vertical',
        }}
      />
    </label>
  )
}

function Badge({ children }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '5px 9px',
        borderRadius: 999,
        background: '#e2e8f0',
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  )
}

function Metric({
  label,
  value,
}) {
  return (
    <article className="metric">
      <div className="small">
        {label}
      </div>
      <div className="money">
        {value}
      </div>
    </article>
  )
}

function Empty({ children }) {
  return (
    <div
      className="card"
      style={{
        textAlign: 'center',
        color: '#64748b',
      }}
    >
      {children}
    </div>
  )
}

function SummaryRow({
  label,
  value,
  strong = false,
}) {
  return (
    <div
      className="between"
      style={{
        padding: '7px 0',
        borderTop: strong
          ? '2px solid #0f172a'
          : '1px solid #e2e8f0',
        fontSize: strong
          ? 19
          : 15,
        fontWeight: strong
          ? 800
          : 500,
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function Modal({
  title,
  children,
  onClose,
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background:
          'rgba(15, 23, 42, 0.55)',
      }}
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose()
        }
      }}
    >
      <section
        className="panel"
        style={{
          width: 'min(720px, 100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div className="between">
          <h2>{title}</h2>

          <button
            type="button"
            className="secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {children}
      </section>
    </div>
  )
}
