import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

const ESTIMATE_STATUSES = [
  'Draft',
  'Sent',
  'Viewed',
  'Approved',
  'Declined',
  'Expired',
  'Converted',
]

const DEFAULT_ITEM = {
  id: '',
  item_type: 'Material',
  description: '',
  quantity: 1,
  unit: 'each',
  unit_cost: 0,
  unit_price: 0,
  taxable: true,
  sort_order: 0,
}

const EMPTY_ESTIMATE = {
  id: '',
  customer_id: '',
  property_id: '',
  boat_lift_id: '',
  number: '',
  title: '',
  status: 'Draft',
  scope: '',
  valid_until: '',
  notes: '',
  customer_message: '',
  internal_notes: '',
  discount_type: 'Percent',
  discount_value: 0,
  tax_rate: 8.25,
  deposit_percent: 0,
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

  const date = new Date(`${value}T12:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString()
}

function customerName(customer) {
  return (
    customer?.name ||
    customer?.full_name ||
    customer?.company ||
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

function nextEstimateNumber(estimates) {
  const year = new Date().getFullYear()

  const numbers = estimates
    .map((estimate) => {
      const match = String(
        estimate.number || ''
      ).match(/(\d+)$/)

      return match ? Number(match[1]) : 0
    })
    .filter(Number.isFinite)

  const next =
    numbers.length > 0
      ? Math.max(...numbers) + 1
      : 1

  return `EST-${year}-${String(next).padStart(
    4,
    '0'
  )}`
}

function normalizeLineItem(item, index = 0) {
  return {
    ...DEFAULT_ITEM,
    ...item,
    id: item?.id || createId(),
    item_type:
      item?.item_type ||
      item?.type ||
      'Material',
    quantity: Number(
      item?.quantity ??
        item?.qty ??
        1
    ),
    unit_cost: Number(
      item?.unit_cost ??
        item?.cost ??
        0
    ),
    unit_price: Number(
      item?.unit_price ??
        item?.price ??
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

function parseLineItems(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeLineItem)
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)

      return Array.isArray(parsed)
        ? parsed.map(normalizeLineItem)
        : []
    } catch {
      return []
    }
  }

  return []
}

function calculateTotals(estimate, items) {
  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      Number(item.quantity || 0) *
        Number(item.unit_price || 0),
    0
  )

  const cost = items.reduce(
    (sum, item) =>
      sum +
      Number(item.quantity || 0) *
        Number(item.unit_cost || 0),
    0
  )

  const discountValue = Number(
    estimate.discount_value || 0
  )

  const discount =
    estimate.discount_type === 'Amount'
      ? Math.min(subtotal, discountValue)
      : subtotal * (discountValue / 100)

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
      ? Math.max(
          0,
          taxableSubtotal *
            (discountedSubtotal / subtotal)
        )
      : 0

  const tax =
    taxableAfterDiscount *
    (Number(estimate.tax_rate || 0) / 100)

  const total = discountedSubtotal + tax
  const deposit =
    total *
    (Number(
      estimate.deposit_percent || 0
    ) /
      100)

  return {
    subtotal,
    cost,
    discount,
    tax,
    total,
    deposit,
    grossProfit: total - tax - cost,
    margin:
      subtotal > 0
        ? ((subtotal - cost) / subtotal) *
          100
        : 0,
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

async function safeSelect(
  supabase,
  table,
  orderColumn = 'created_at',
  ascending = false
) {
  const result = await supabase
    .from(table)
    .select('*')
    .order(orderColumn, { ascending })

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

export default function EstimatesModule({
  supabase,
  onOpenCustomer,
  onOpenJob,
  onCreateInvoice,
}) {
  const [estimates, setEstimates] = useState([])
  const [customers, setCustomers] = useState([])
  const [properties, setProperties] = useState([])
  const [boatLifts, setBoatLifts] = useState([])
  const [jobs, setJobs] = useState([])
  const [estimateItems, setEstimateItems] =
    useState([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] =
    useState('')
  const [selectedId, setSelectedId] =
    useState(null)
  const [editor, setEditor] = useState(null)
  const [templates, setTemplates] = useState(
    () => {
      try {
        return JSON.parse(
          localStorage.getItem(
            'gbl-estimate-templates'
          ) || '[]'
        )
      } catch {
        return []
      }
    }
  )

  const loadData = useCallback(async () => {
    if (!supabase) {
      setError('Supabase is not available.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const [
      estimateResult,
      customerResult,
      propertyResult,
      liftResult,
      jobResult,
      itemResult,
    ] = await Promise.all([
      safeSelect(
        supabase,
        'estimates',
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
        'estimate_line_items',
        'sort_order',
        true
      ),
    ])

    const firstError = [
      estimateResult.error,
      customerResult.error,
      propertyResult.error,
      liftResult.error,
      jobResult.error,
      itemResult.error,
    ].find(Boolean)

    if (firstError) {
      setError(firstError.message)
    }

    setEstimates(estimateResult.data)
    setCustomers(customerResult.data)
    setProperties(propertyResult.data)
    setBoatLifts(liftResult.data)
    setJobs(jobResult.data)
    setEstimateItems(itemResult.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredEstimates = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase()

    return estimates.filter((estimate) => {
      if (
        statusFilter &&
        estimate.status !== statusFilter
      ) {
        return false
      }

      if (!query) {
        return true
      }

      const customer = customers.find(
        (item) =>
          item.id === estimate.customer_id
      )

      return [
        estimate.number,
        estimate.title,
        estimate.scope,
        estimate.status,
        customerName(customer),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [
    estimates,
    customers,
    search,
    statusFilter,
  ])

  const selectedEstimate = useMemo(
    () =>
      estimates.find(
        (estimate) =>
          estimate.id === selectedId
      ) || null,
    [estimates, selectedId]
  )

  const metrics = useMemo(() => {
    const open = estimates.filter(
      (estimate) =>
        ![
          'Approved',
          'Declined',
          'Expired',
          'Converted',
        ].includes(estimate.status)
    )

    return {
      total: estimates.length,
      open: open.length,
      approved: estimates.filter(
        (estimate) =>
          estimate.status === 'Approved'
      ).length,
      openValue: open.reduce(
        (sum, estimate) =>
          sum + Number(estimate.total || 0),
        0
      ),
      approvedValue: estimates
        .filter(
          (estimate) =>
            estimate.status === 'Approved' ||
            estimate.status === 'Converted'
        )
        .reduce(
          (sum, estimate) =>
            sum + Number(estimate.total || 0),
          0
        ),
    }
  }, [estimates])

  function lineItemsForEstimate(estimate) {
    const tableItems = estimateItems.filter(
      (item) =>
        item.estimate_id === estimate.id
    )

    if (tableItems.length) {
      return tableItems.map(
        normalizeLineItem
      )
    }

    return parseLineItems(
      estimate.line_items
    )
  }

  function openNewEstimate() {
    setEditor({
      estimate: {
        ...EMPTY_ESTIMATE,
        number:
          nextEstimateNumber(estimates),
        valid_until: new Date(
          Date.now() +
            30 * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .slice(0, 10),
      },
      items: [
        normalizeLineItem(DEFAULT_ITEM),
      ],
    })
  }

  function openEstimate(estimate) {
    setEditor({
      estimate: {
        ...EMPTY_ESTIMATE,
        ...estimate,
      },
      items:
        lineItemsForEstimate(estimate)
          .length > 0
          ? lineItemsForEstimate(estimate)
          : [
              normalizeLineItem(
                DEFAULT_ITEM
              ),
            ],
    })
  }

  async function updateStatus(
    estimate,
    status
  ) {
    setSaving(true)
    setError('')

    try {
      const { error: updateError } =
        await supabase
          .from('estimates')
          .update({ status })
          .eq('id', estimate.id)

      if (updateError) {
        throw updateError
      }

      setMessage(
        `${estimate.number || 'Estimate'} marked ${status}.`
      )

      await loadData()
    } catch (statusError) {
      setError(statusError.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteEstimate(
    estimate
  ) {
    const confirmed = window.confirm(
      `Delete ${estimate.number || 'this estimate'}?`
    )

    if (!confirmed) {
      return
    }

    setSaving(true)
    setError('')

    try {
      await supabase
        .from('estimate_line_items')
        .delete()
        .eq('estimate_id', estimate.id)

      const { error: deleteError } =
        await supabase
          .from('estimates')
          .delete()
          .eq('id', estimate.id)

      if (deleteError) {
        throw deleteError
      }

      if (selectedId === estimate.id) {
        setSelectedId(null)
      }

      await loadData()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setSaving(false)
    }
  }

  async function duplicateEstimate(
    estimate
  ) {
    const items =
      lineItemsForEstimate(estimate)

    setEditor({
      estimate: {
        ...EMPTY_ESTIMATE,
        ...estimate,
        id: '',
        number:
          nextEstimateNumber(estimates),
        title: `${estimate.title || 'Estimate'} Copy`,
        status: 'Draft',
      },
      items: items.map((item) => ({
        ...item,
        id: createId(),
      })),
    })
  }

  async function createRevision(
    estimate
  ) {
    const revisionCount =
      estimates.filter((item) =>
        String(item.number || '').startsWith(
          `${estimate.number}-R`
        )
      ).length + 1

    setEditor({
      estimate: {
        ...EMPTY_ESTIMATE,
        ...estimate,
        id: '',
        number: `${estimate.number}-R${revisionCount}`,
        status: 'Draft',
        title: `${estimate.title || 'Estimate'} Revision ${revisionCount}`,
      },
      items:
        lineItemsForEstimate(estimate).map(
          (item) => ({
            ...item,
            id: createId(),
          })
        ),
    })
  }

  async function convertToJob(
    estimate
  ) {
    const existing = jobs.find(
      (job) =>
        job.estimate_id === estimate.id
    )

    if (existing) {
      setMessage(
        `A job already exists for ${estimate.number}.`
      )
      onOpenJob?.(existing.id)
      return
    }

    const confirmed = window.confirm(
      `Convert ${estimate.number} into a job?`
    )

    if (!confirmed) {
      return
    }

    setSaving(true)
    setError('')

    try {
      const {
        data: authData,
      } = await supabase.auth.getUser()

      const lineItems =
        lineItemsForEstimate(estimate)

      const materialCost =
        lineItems
          .filter(
            (item) =>
              item.item_type === 'Material'
          )
          .reduce(
            (sum, item) =>
              sum +
              Number(item.quantity || 0) *
                Number(item.unit_cost || 0),
            0
          )

      const laborCost =
        lineItems
          .filter(
            (item) =>
              item.item_type === 'Labor'
          )
          .reduce(
            (sum, item) =>
              sum +
              Number(item.quantity || 0) *
                Number(item.unit_cost || 0),
            0
          )

      const jobPayload = {
        id: createId(),
        user_id:
          authData?.user?.id || undefined,
        customer_id:
          estimate.customer_id,
        property_id:
          estimate.property_id || null,
        boat_lift_id:
          estimate.boat_lift_id || null,
        estimate_id: estimate.id,
        number: `JOB-${Date.now()}`,
        title:
          estimate.title ||
          'Approved estimate',
        status: 'Scheduled',
        priority: 'Normal',
        contract_amount: Number(
          estimate.total || 0
        ),
        material_cost: materialCost,
        labor_cost: laborCost,
        other_cost: 0,
        materials_used: lineItems.filter(
          (item) =>
            item.item_type === 'Material'
        ),
        scope: estimate.scope || '',
        notes:
          `Created from ${estimate.number || 'estimate'}.`,
      }

      Object.keys(jobPayload).forEach(
        (key) => {
          if (jobPayload[key] === undefined) {
            delete jobPayload[key]
          }
        }
      )

      const { data, error: jobError } =
        await supabase
          .from('jobs')
          .insert(jobPayload)
          .select()
          .single()

      if (jobError) {
        throw jobError
      }

      const { error: estimateError } =
        await supabase
          .from('estimates')
          .update({
            status: 'Converted',
          })
          .eq('id', estimate.id)

      if (estimateError) {
        throw estimateError
      }

      setMessage(
        `${estimate.number} converted to ${data.number}.`
      )

      await loadData()
      onOpenJob?.(data.id)
    } catch (convertError) {
      setError(convertError.message)
    } finally {
      setSaving(false)
    }
  }

  function saveTemplate(
    estimate,
    items
  ) {
    const name = window.prompt(
      'Template name:',
      estimate.title || 'Estimate Template'
    )

    if (!name) {
      return
    }

    const nextTemplates = [
      ...templates,
      {
        id: createId(),
        name,
        title: estimate.title,
        scope: estimate.scope,
        customer_message:
          estimate.customer_message,
        notes: estimate.notes,
        items,
      },
    ]

    setTemplates(nextTemplates)

    localStorage.setItem(
      'gbl-estimate-templates',
      JSON.stringify(nextTemplates)
    )

    setMessage(`Template "${name}" saved.`)
  }

  function useTemplate(template) {
    setEditor({
      estimate: {
        ...EMPTY_ESTIMATE,
        number:
          nextEstimateNumber(estimates),
        title: template.title || template.name,
        scope: template.scope || '',
        customer_message:
          template.customer_message || '',
        notes: template.notes || '',
        valid_until: new Date(
          Date.now() +
            30 * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .slice(0, 10),
      },
      items:
        template.items?.map(
          (item, index) =>
            normalizeLineItem(
              {
                ...item,
                id: createId(),
              },
              index
            )
        ) || [
          normalizeLineItem(DEFAULT_ITEM),
        ],
    })
  }

  function deleteTemplate(templateId) {
    const nextTemplates =
      templates.filter(
        (template) =>
          template.id !== templateId
      )

    setTemplates(nextTemplates)

    localStorage.setItem(
      'gbl-estimate-templates',
      JSON.stringify(nextTemplates)
    )
  }

  function printEstimate(estimate) {
    const items =
      lineItemsForEstimate(estimate)

    const totals = calculateTotals(
      estimate,
      items
    )

    const customer = customers.find(
      (item) =>
        item.id === estimate.customer_id
    )

    const property = properties.find(
      (item) =>
        item.id === estimate.property_id
    )

    const popup = window.open(
      '',
      '_blank',
      'width=1000,height=850'
    )

    if (!popup) {
      alert(
        'Allow pop-ups to print this estimate.'
      )
      return
    }

    const rows = items
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

    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(estimate.number || 'Estimate')}</title>
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
              width: 420px;
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
            <h1>Galveston Boat Lifts</h1>
            <p>Estimate ${escapeHtml(estimate.number || '')}</p>
          </header>

          <div class="grid">
            <section>
              <h2>Prepared For</h2>
              <p><b>${escapeHtml(customerName(customer))}</b></p>
              <p>${escapeHtml(customer?.phone || '')}</p>
              <p>${escapeHtml(customer?.email || '')}</p>
              <p>${escapeHtml(propertyAddress(property))}</p>
            </section>

            <section>
              <h2>Estimate Details</h2>
              <p><b>${escapeHtml(estimate.title || '')}</b></p>
              <p>Status: ${escapeHtml(estimate.status || 'Draft')}</p>
              <p>Valid Until: ${escapeHtml(dateText(estimate.valid_until))}</p>
            </section>
          </div>

          <section>
            <h2>Scope of Work</h2>
            <p>${escapeHtml(estimate.scope || 'No scope entered.')}</p>
          </section>

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
            <tbody>${rows}</tbody>
          </table>

          <div class="totals">
            <div><span>Subtotal</span><b>${escapeHtml(money(totals.subtotal))}</b></div>
            <div><span>Discount</span><b>-${escapeHtml(money(totals.discount))}</b></div>
            <div><span>Tax</span><b>${escapeHtml(money(totals.tax))}</b></div>
            <div class="grand"><span>Total</span><b>${escapeHtml(money(totals.total))}</b></div>
            ${
              totals.deposit > 0
                ? `<div><span>Requested Deposit</span><b>${escapeHtml(money(totals.deposit))}</b></div>`
                : ''
            }
          </div>

          <section>
            <h2>Message</h2>
            <p>${escapeHtml(estimate.customer_message || estimate.notes || '')}</p>
          </section>
        </body>
      </html>
    `)

    popup.document.close()
    popup.focus()
  }

  function emailEstimate(estimate) {
    const customer = customers.find(
      (item) =>
        item.id === estimate.customer_id
    )

    const subject = encodeURIComponent(
      `${estimate.number || 'Estimate'} from Galveston Boat Lifts`
    )

    const body = encodeURIComponent(
      `Hello ${customerName(customer)},\n\n` +
        `Your estimate ${estimate.number || ''} for ${estimate.title || 'proposed work'} totals ${money(estimate.total)}.\n\n` +
        `The estimate is valid until ${dateText(estimate.valid_until)}.\n\n` +
        `Thank you,\nGalveston Boat Lifts`
    )

    window.location.href =
      `mailto:${customer?.email || ''}` +
      `?subject=${subject}&body=${body}`

    if (
      estimate.status === 'Draft'
    ) {
      updateStatus(estimate, 'Sent')
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Loading Estimates...</h2>
      </section>
    )
  }

  if (editor) {
    return (
      <EstimateEditor
        supabase={supabase}
        editor={editor}
        estimates={estimates}
        customers={customers}
        properties={properties}
        boatLifts={boatLifts}
        templates={templates}
        onCancel={() => setEditor(null)}
        onSaved={async (saved) => {
          setEditor(null)
          setSelectedId(saved.id)
          await loadData()
        }}
        onSaveTemplate={saveTemplate}
      />
    )
  }

  if (selectedEstimate) {
    const customer = customers.find(
      (item) =>
        item.id ===
        selectedEstimate.customer_id
    )

    const property = properties.find(
      (item) =>
        item.id ===
        selectedEstimate.property_id
    )

    const lift = boatLifts.find(
      (item) =>
        item.id ===
        selectedEstimate.boat_lift_id
    )

    const items =
      lineItemsForEstimate(
        selectedEstimate
      )

    const totals = calculateTotals(
      selectedEstimate,
      items
    )

    const linkedJob = jobs.find(
      (job) =>
        job.estimate_id ===
        selectedEstimate.id
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
                ← All Estimates
              </button>

              <h1>
                {selectedEstimate.number}
                {' · '}
                {selectedEstimate.title ||
                  'Untitled Estimate'}
              </h1>

              <p className="small">
                {customerName(customer)}
                {' · '}
                {propertyAddress(property)}
              </p>
            </div>

            <div className="actions">
              <Badge>
                {selectedEstimate.status ||
                  'Draft'}
              </Badge>

              <button
                type="button"
                className="secondary"
                onClick={() =>
                  openEstimate(
                    selectedEstimate
                  )
                }
              >
                Edit
              </button>

              <button
                type="button"
                className="secondary"
                onClick={() =>
                  printEstimate(
                    selectedEstimate
                  )
                }
              >
                Print / PDF
              </button>

              <button
                type="button"
                className="primary"
                onClick={() =>
                  emailEstimate(
                    selectedEstimate
                  )
                }
              >
                Email
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
            label="Estimate Total"
            value={money(totals.total)}
          />
          <Metric
            label="Estimated Cost"
            value={money(totals.cost)}
          />
          <Metric
            label="Gross Profit"
            value={money(
              totals.grossProfit
            )}
          />
          <Metric
            label="Margin"
            value={`${totals.margin.toFixed(
              1
            )}%`}
          />
          <Metric
            label="Valid Until"
            value={dateText(
              selectedEstimate.valid_until
            )}
          />
        </div>

        <div className="grid-2">
          <section className="panel">
            <h2>Customer and Property</h2>
            <p>
              <b>Customer:</b>{' '}
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
                  selectedEstimate.customer_id
                )
              }
            >
              Open Customer
            </button>
          </section>

          <section className="panel">
            <h2>Estimate Information</h2>
            <p>
              <b>Status:</b>{' '}
              {selectedEstimate.status}
            </p>
            <p>
              <b>Valid Until:</b>{' '}
              {dateText(
                selectedEstimate.valid_until
              )}
            </p>
            <p>
              <b>Deposit Requested:</b>{' '}
              {money(totals.deposit)}
            </p>
            <p>
              <b>Linked Job:</b>{' '}
              {linkedJob?.number || '—'}
            </p>
          </section>
        </div>

        <section className="panel">
          <h2>Scope of Work</h2>
          <p>
            {selectedEstimate.scope ||
              'No scope entered.'}
          </p>
        </section>

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
                  <th>Cost</th>
                  <th>Price</th>
                  <th>Total</th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.item_type}</td>
                    <td>
                      <b>{item.description}</b>
                    </td>
                    <td>{item.quantity}</td>
                    <td>{item.unit}</td>
                    <td>{money(item.unit_cost)}</td>
                    <td>{money(item.unit_price)}</td>
                    <td>
                      {money(
                        Number(
                          item.quantity || 0
                        ) *
                          Number(
                            item.unit_price || 0
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
              value={money(totals.subtotal)}
            />
            <SummaryRow
              label="Discount"
              value={`-${money(totals.discount)}`}
            />
            <SummaryRow
              label="Tax"
              value={money(totals.tax)}
            />
            <SummaryRow
              label="Total"
              value={money(totals.total)}
              strong
            />
          </div>
        </section>

        <section className="panel">
          <h2>Approval and Workflow</h2>

          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() =>
                updateStatus(
                  selectedEstimate,
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
                  selectedEstimate,
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
                updateStatus(
                  selectedEstimate,
                  'Approved'
                )
              }
            >
              Approve
            </button>

            <button
              type="button"
              className="danger"
              disabled={saving}
              onClick={() =>
                updateStatus(
                  selectedEstimate,
                  'Declined'
                )
              }
            >
              Decline
            </button>

            <button
              type="button"
              className="secondary"
              onClick={() =>
                createRevision(
                  selectedEstimate
                )
              }
            >
              Create Revision
            </button>

            <button
              type="button"
              className="secondary"
              onClick={() =>
                duplicateEstimate(
                  selectedEstimate
                )
              }
            >
              Duplicate
            </button>

            <button
              type="button"
              className="primary"
              disabled={
                saving ||
                Boolean(linkedJob)
              }
              onClick={() =>
                convertToJob(
                  selectedEstimate
                )
              }
            >
              {linkedJob
                ? 'Job Created'
                : 'Convert to Job'}
            </button>

            <button
              type="button"
              className="secondary"
              disabled={!linkedJob}
              onClick={() =>
                onCreateInvoice?.(
                  selectedEstimate.id
                )
              }
            >
              Create Invoice
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Notes</h2>
          <p>
            <b>Customer Message:</b>{' '}
            {selectedEstimate.customer_message ||
              selectedEstimate.notes ||
              '—'}
          </p>
          <p>
            <b>Internal Notes:</b>{' '}
            {selectedEstimate.internal_notes ||
              '—'}
          </p>
        </section>

        <section className="panel">
          <button
            type="button"
            className="danger"
            disabled={saving}
            onClick={() =>
              deleteEstimate(
                selectedEstimate
              )
            }
          >
            Delete Estimate
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
            <h1>Estimates</h1>
            <p className="small">
              Build, send, approve, revise,
              and convert estimates into jobs.
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
              onClick={openNewEstimate}
            >
              + New Estimate
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
          label="Total Estimates"
          value={metrics.total}
        />
        <Metric
          label="Open Estimates"
          value={metrics.open}
        />
        <Metric
          label="Approved"
          value={metrics.approved}
        />
        <Metric
          label="Open Value"
          value={money(metrics.openValue)}
        />
        <Metric
          label="Approved Value"
          value={money(
            metrics.approvedValue
          )}
        />
      </div>

      <section className="panel">
        <div className="form-grid">
          <Field
            label="Search"
            value={search}
            onChange={setSearch}
            placeholder="Estimate, customer, scope..."
          />

          <SelectField
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ['', 'All statuses'],
              ...ESTIMATE_STATUSES.map(
                (status) => [
                  status,
                  status,
                ]
              ),
            ]}
          />
        </div>
      </section>

      {templates.length > 0 && (
        <section className="panel">
          <h2>Estimate Templates</h2>

          <div className="cards">
            {templates.map((template) => (
              <article
                className="card"
                key={template.id}
              >
                <div className="between">
                  <strong>
                    {template.name}
                  </strong>

                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      deleteTemplate(
                        template.id
                      )
                    }
                  >
                    Delete
                  </button>
                </div>

                <p>
                  {template.title ||
                    template.scope ||
                    'Saved estimate template'}
                </p>

                <button
                  type="button"
                  className="primary"
                  onClick={() =>
                    useTemplate(template)
                  }
                >
                  Use Template
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="cards">
          {filteredEstimates.map(
            (estimate) => {
              const customer =
                customers.find(
                  (item) =>
                    item.id ===
                    estimate.customer_id
                )

              const property =
                properties.find(
                  (item) =>
                    item.id ===
                    estimate.property_id
                )

              return (
                <article
                  className="card"
                  key={estimate.id}
                >
                  <div className="between">
                    <div>
                      <h3>
                        {estimate.number ||
                          'Estimate'}
                        {' · '}
                        {estimate.title ||
                          'Untitled'}
                      </h3>

                      <div className="small">
                        {customerName(
                          customer
                        )}
                        {' · '}
                        {propertyAddress(
                          property
                        )}
                      </div>
                    </div>

                    <div>
                      <div className="money">
                        {money(
                          estimate.total
                        )}
                      </div>

                      <Badge>
                        {estimate.status ||
                          'Draft'}
                      </Badge>
                    </div>
                  </div>

                  <p>
                    {estimate.scope ||
                      'No scope entered.'}
                  </p>

                  <div className="small">
                    Valid until{' '}
                    {dateText(
                      estimate.valid_until
                    )}
                  </div>

                  <div className="actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        setSelectedId(
                          estimate.id
                        )
                      }
                    >
                      Open Estimate
                    </button>

                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        printEstimate(
                          estimate
                        )
                      }
                    >
                      PDF
                    </button>

                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        duplicateEstimate(
                          estimate
                        )
                      }
                    >
                      Duplicate
                    </button>
                  </div>
                </article>
              )
            }
          )}

          {!filteredEstimates.length && (
            <Empty>No estimates found</Empty>
          )}
        </div>
      </section>
    </>
  )
}

function EstimateEditor({
  supabase,
  editor,
  estimates,
  customers,
  properties,
  boatLifts,
  onCancel,
  onSaved,
  onSaveTemplate,
}) {
  const [estimate, setEstimate] =
    useState(editor.estimate)

  const [items, setItems] = useState(
    editor.items.map(normalizeLineItem)
  )

  const [saving, setSaving] =
    useState(false)

  const [error, setError] =
    useState('')

  const totals = useMemo(
    () => calculateTotals(estimate, items),
    [estimate, items]
  )

  const filteredProperties = useMemo(
    () =>
      properties.filter(
        (property) =>
          !estimate.customer_id ||
          property.customer_id ===
            estimate.customer_id
      ),
    [
      properties,
      estimate.customer_id,
    ]
  )

  const filteredLifts = useMemo(
    () =>
      boatLifts.filter(
        (lift) =>
          (!estimate.customer_id ||
            lift.customer_id ===
              estimate.customer_id) &&
          (!estimate.property_id ||
            lift.property_id ===
              estimate.property_id)
      ),
    [
      boatLifts,
      estimate.customer_id,
      estimate.property_id,
    ]
  )

  function updateEstimate(field, value) {
    setEstimate((current) => ({
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
                  'unit_cost',
                  'unit_price',
                ].includes(field)
                  ? Number(value || 0)
                  : value,
            }
          : item
      )
    )
  }

  function addItem(itemType = 'Material') {
    setItems((current) => [
      ...current,
      normalizeLineItem({
        ...DEFAULT_ITEM,
        id: createId(),
        item_type: itemType,
        sort_order: current.length,
      }),
    ])
  }

  function removeItem(itemId) {
    setItems((current) =>
      current.filter(
        (item) => item.id !== itemId
      )
    )
  }

  function moveItem(itemId, direction) {
    setItems((current) => {
      const index = current.findIndex(
        (item) => item.id === itemId
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
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)

      return next.map(
        (entry, sortOrder) => ({
          ...entry,
          sort_order: sortOrder,
        })
      )
    })
  }

  async function saveEstimate(event) {
    event.preventDefault()

    if (!estimate.customer_id) {
      setError('Select a customer.')
      return
    }

    if (!estimate.title.trim()) {
      setError('Enter an estimate title.')
      return
    }

    if (
      items.every(
        (item) =>
          !item.description.trim()
      )
    ) {
      setError(
        'Add at least one line item.'
      )
      return
    }

    setSaving(true)
    setError('')

    try {
      const {
        data: authData,
      } = await supabase.auth.getUser()

      const estimateId =
        estimate.id || createId()

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

      const payload = {
        id: estimateId,
        user_id:
          authData?.user?.id || undefined,
        customer_id:
          estimate.customer_id,
        property_id:
          estimate.property_id || null,
        boat_lift_id:
          estimate.boat_lift_id || null,
        number:
          estimate.number ||
          nextEstimateNumber(estimates),
        title: estimate.title,
        status:
          estimate.status || 'Draft',
        scope: estimate.scope || '',
        valid_until:
          estimate.valid_until || null,
        notes:
          estimate.notes ||
          estimate.customer_message ||
          '',
        line_items: cleanItems.map(
          (item) => ({
            description:
              item.description,
            qty: item.quantity,
            quantity: item.quantity,
            unit: item.unit,
            price: item.unit_price,
            unit_price:
              item.unit_price,
            unit_cost:
              item.unit_cost,
            item_type:
              item.item_type,
            taxable:
              item.taxable,
          })
        ),
        subtotal:
          Math.round(
            totals.subtotal * 100
          ) / 100,
        tax:
          Math.round(totals.tax * 100) /
          100,
        total:
          Math.round(
            totals.total * 100
          ) / 100,
      }

      Object.keys(payload).forEach(
        (key) => {
          if (payload[key] === undefined) {
            delete payload[key]
          }
        }
      )

      const { data, error: saveError } =
        await supabase
          .from('estimates')
          .upsert(payload)
          .select()
          .single()

      if (saveError) {
        throw saveError
      }

      const tableCheck = await supabase
        .from('estimate_line_items')
        .select('id')
        .limit(1)

      if (!tableCheck.error) {
        const { error: deleteError } =
          await supabase
            .from('estimate_line_items')
            .delete()
            .eq(
              'estimate_id',
              estimateId
            )

        if (deleteError) {
          throw deleteError
        }

        const tableRows =
          cleanItems.map(
            (item, index) => ({
              id: createId(),
              estimate_id:
                estimateId,
              description:
                item.description,
              item_type:
                item.item_type,
              quantity:
                item.quantity,
              unit: item.unit,
              unit_cost:
                item.unit_cost,
              unit_price:
                item.unit_price,
              taxable:
                item.taxable,
              sort_order: index,
            })
          )

        if (tableRows.length) {
          const {
            error: itemError,
          } = await supabase
            .from(
              'estimate_line_items'
            )
            .insert(tableRows)

          if (itemError) {
            throw itemError
          }
        }
      }

      await onSaved(data)
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={saveEstimate}>
      <section className="panel">
        <div className="between">
          <div>
            <h1>
              {estimate.id
                ? 'Edit Estimate'
                : 'New Estimate'}
            </h1>
            <p className="small">
              Build pricing, calculate margin,
              and prepare the customer proposal.
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
              type="button"
              className="secondary"
              onClick={() =>
                onSaveTemplate(
                  estimate,
                  items
                )
              }
            >
              Save as Template
            </button>

            <button
              type="submit"
              className="primary"
              disabled={saving}
            >
              {saving
                ? 'Saving...'
                : 'Save Estimate'}
            </button>
          </div>
        </div>

        {error && (
          <p className="negative">{error}</p>
        )}
      </section>

      <div className="metrics">
        <Metric
          label="Subtotal"
          value={money(totals.subtotal)}
        />
        <Metric
          label="Estimated Cost"
          value={money(totals.cost)}
        />
        <Metric
          label="Gross Profit"
          value={money(
            totals.grossProfit
          )}
        />
        <Metric
          label="Margin"
          value={`${totals.margin.toFixed(
            1
          )}%`}
        />
        <Metric
          label="Estimate Total"
          value={money(totals.total)}
        />
      </div>

      <section className="panel">
        <h2>Estimate Information</h2>

        <div className="form-grid">
          <Field
            label="Estimate Number"
            value={estimate.number}
            onChange={(value) =>
              updateEstimate(
                'number',
                value
              )
            }
          />

          <Field
            label="Title"
            value={estimate.title}
            onChange={(value) =>
              updateEstimate(
                'title',
                value
              )
            }
            required
          />

          <SelectField
            label="Status"
            value={estimate.status}
            onChange={(value) =>
              updateEstimate(
                'status',
                value
              )
            }
            options={ESTIMATE_STATUSES.map(
              (status) => [
                status,
                status,
              ]
            )}
          />

          <Field
            label="Valid Until"
            type="date"
            value={estimate.valid_until}
            onChange={(value) =>
              updateEstimate(
                'valid_until',
                value
              )
            }
          />

          <SelectField
            label="Customer"
            value={estimate.customer_id}
            onChange={(value) => {
              setEstimate((current) => ({
                ...current,
                customer_id: value,
                property_id: '',
                boat_lift_id: '',
              }))
            }}
            options={[
              ['', 'Select customer'],
              ...customers.map(
                (customer) => [
                  customer.id,
                  customerName(customer),
                ]
              ),
            ]}
          />

          <SelectField
            label="Property"
            value={estimate.property_id}
            onChange={(value) => {
              setEstimate((current) => ({
                ...current,
                property_id: value,
                boat_lift_id: '',
              }))
            }}
            options={[
              ['', 'No property'],
              ...filteredProperties.map(
                (property) => [
                  property.id,
                  propertyAddress(property),
                ]
              ),
            ]}
          />

          <SelectField
            label="Boat Lift"
            value={estimate.boat_lift_id}
            onChange={(value) =>
              updateEstimate(
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
        </div>
      </section>

      <section className="panel">
        <h2>Scope of Work</h2>

        <TextArea
          label="Scope"
          value={estimate.scope}
          onChange={(value) =>
            updateEstimate(
              'scope',
              value
            )
          }
          rows={6}
        />
      </section>

      <section className="panel">
        <div className="between">
          <h2>Line Items</h2>

          <div className="actions">
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

            <button
              type="button"
              className="secondary"
              onClick={() =>
                addItem('Service')
              }
            >
              + Service
            </button>
          </div>
        </div>

        {items.map((item, index) => (
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
                  disabled={index === 0}
                  onClick={() =>
                    moveItem(item.id, -1)
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
                    moveItem(item.id, 1)
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
                    removeItem(item.id)
                  }
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="form-grid">
              <SelectField
                label="Type"
                value={item.item_type}
                onChange={(value) =>
                  updateItem(
                    item.id,
                    'item_type',
                    value
                  )
                }
                options={[
                  ['Material', 'Material'],
                  ['Labor', 'Labor'],
                  ['Equipment', 'Equipment'],
                  ['Service', 'Service'],
                  ['Other', 'Other'],
                ]}
              />

              <Field
                label="Description"
                value={item.description}
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
                value={item.quantity}
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
                label="Unit Cost"
                type="number"
                value={item.unit_cost}
                onChange={(value) =>
                  updateItem(
                    item.id,
                    'unit_cost',
                    value
                  )
                }
              />

              <Field
                label="Customer Price"
                type="number"
                value={item.unit_price}
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
                  checked={item.taxable}
                  onChange={(event) =>
                    updateItem(
                      item.id,
                      'taxable',
                      event.target.checked
                    )
                  }
                />
              </label>

              <div>
                <b>Line Total</b>
                <div className="money">
                  {money(
                    Number(
                      item.quantity || 0
                    ) *
                      Number(
                        item.unit_price || 0
                      )
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Pricing</h2>

          <div className="form-grid">
            <SelectField
              label="Discount Type"
              value={
                estimate.discount_type
              }
              onChange={(value) =>
                updateEstimate(
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
                estimate.discount_type ===
                'Amount'
                  ? 'Discount Amount'
                  : 'Discount Percent'
              }
              type="number"
              value={
                estimate.discount_value
              }
              onChange={(value) =>
                updateEstimate(
                  'discount_value',
                  Number(value || 0)
                )
              }
            />

            <Field
              label="Tax Rate %"
              type="number"
              value={estimate.tax_rate}
              onChange={(value) =>
                updateEstimate(
                  'tax_rate',
                  Number(value || 0)
                )
              }
            />

            <Field
              label="Deposit %"
              type="number"
              value={
                estimate.deposit_percent
              }
              onChange={(value) =>
                updateEstimate(
                  'deposit_percent',
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
            value={money(totals.subtotal)}
          />
          <SummaryRow
            label="Discount"
            value={`-${money(totals.discount)}`}
          />
          <SummaryRow
            label="Tax"
            value={money(totals.tax)}
          />
          <SummaryRow
            label="Total"
            value={money(totals.total)}
            strong
          />
          <SummaryRow
            label="Requested Deposit"
            value={money(totals.deposit)}
          />
        </section>
      </div>

      <section className="panel">
        <h2>Messages and Notes</h2>

        <div className="grid-2">
          <TextArea
            label="Customer Message"
            value={
              estimate.customer_message
            }
            onChange={(value) =>
              updateEstimate(
                'customer_message',
                value
              )
            }
            rows={5}
          />

          <TextArea
            label="Internal Notes"
            value={
              estimate.internal_notes
            }
            onChange={(value) =>
              updateEstimate(
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
          border: '1px solid #cbd5e1',
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
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          font: 'inherit',
          background: '#ffffff',
        }}
      >
        {options.map(
          ([optionValue, optionLabel]) => (
            <option
              key={String(optionValue)}
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
          border: '1px solid #cbd5e1',
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

function Metric({ label, value }) {
  return (
    <article className="metric">
      <div className="small">{label}</div>
      <div className="money">{value}</div>
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
        fontSize: strong ? 19 : 15,
        fontWeight: strong ? 800 : 500,
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
