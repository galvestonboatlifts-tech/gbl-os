export const INVOICE_STATUS_OPTIONS = [
  'Draft',
  'Sent',
  'Viewed',
  'Partial',
  'Paid',
  'Overdue',
  'Void',
]

export const PAYMENT_METHOD_OPTIONS = [
  'Cash',
  'Check',
  'Credit Card',
  'ACH',
  'Wire Transfer',
  'Zelle',
  'Venmo',
  'Other',
]

export const LINE_ITEM_CATEGORY_OPTIONS = [
  'Material',
  'Labor',
  'Equipment',
  'Subcontractor',
  'Permit',
  'Freight',
  'Service',
  'Other',
]

export const EMPTY_INVOICE = {
  invoice_number: '',
  customer_id: '',
  estimate_id: '',
  job_id: '',
  title: '',
  status: 'Draft',
  issue_date: new Date().toISOString().slice(0, 10),
  due_date: '',
  billing_address: '',
  billing_city: '',
  billing_state: 'TX',
  billing_postal_code: '',
  project_address: '',
  project_city: '',
  project_state: 'TX',
  project_postal_code: '',
  salesperson_id: '',
  tax_rate: '8.25',
  discount_type: 'amount',
  discount_value: '',
  deposit_applied: '',
  late_fee_type: 'amount',
  late_fee_value: '',
  notes: '',
  terms: '',
  internal_notes: '',
  footer_message: 'Thank you for your business.',
}

export const EMPTY_LINE_ITEM = {
  id: '',
  category: 'Service',
  description: '',
  quantity: '1',
  unit: 'each',
  unit_cost: '',
  unit_price: '',
  taxable: true,
  sort_order: 0,
}

export const EMPTY_PAYMENT = {
  payment_date: new Date().toISOString().slice(0, 10),
  amount: '',
  method: 'Check',
  reference_number: '',
  notes: '',
}

export function createId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function cleanText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

export function cleanNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

export function roundMoney(value) {
  return (
    Math.round((Number(value || 0) + Number.EPSILON) * 100) /
    100
  )
}

export function clampMoney(value) {
  return Math.max(0, roundMoney(value))
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0))
}

export function formatDate(value) {
  if (!value) {
    return '—'
  }

  const text = String(value)

  const date = new Date(
    text.length === 10
      ? `${text}T12:00:00`
      : text
  )

  return Number.isNaN(date.getTime())
    ? text
    : date.toLocaleDateString('en-US')
}

export function customerName(customer) {
  return (
    customer?.company_name ||
    [customer?.first_name, customer?.last_name]
      .filter(Boolean)
      .join(' ') ||
    customer?.name ||
    'Unknown Customer'
  )
}

export function employeeName(employee) {
  return (
    employee?.preferred_name ||
    [employee?.first_name, employee?.last_name]
      .filter(Boolean)
      .join(' ') ||
    employee?.name ||
    'Employee'
  )
}

export function nextInvoiceNumber(invoices) {
  const year = new Date().getFullYear()

  const highest = invoices
    .map((invoice) => String(invoice.invoice_number || ''))
    .map((value) => {
      const match = value.match(/(\d+)$/)

      return match
        ? Number(match[1])
        : 0
    })
    .reduce(
      (maximum, value) => Math.max(maximum, value),
      0
    )

  return `INV-${year}-${String(highest + 1).padStart(4, '0')}`
}

export function normalizeLineItem(item, index = 0) {
  return {
    id: item.id || createId(),
    invoice_id: item.invoice_id || '',
    category: item.category || 'Service',
    description: item.description || '',
    quantity: item.quantity ?? '1',
    unit: item.unit || 'each',
    unit_cost: item.unit_cost ?? '',
    unit_price: item.unit_price ?? '',
    taxable: item.taxable !== false,
    sort_order: item.sort_order ?? index,
  }
}export function normalizePayment(payment) {
  return {
    id: payment.id || createId(),
    invoice_id: payment.invoice_id || '',
    payment_date:
      payment.payment_date ||
      new Date().toISOString().slice(0, 10),
    amount: payment.amount ?? '',
    method: payment.method || 'Check',
    reference_number: payment.reference_number || '',
    notes: payment.notes || '',
  }
}

export function calculateInvoiceTotals(
  invoice,
  lineItems,
  payments = []
) {
  const rows = lineItems.map((item) => {
    const quantity = Number(item.quantity || 0)
    const unitCost = Number(item.unit_cost || 0)
    const unitPrice = Number(item.unit_price || 0)

    return {
      ...item,
      quantity,
      unitCost,
      unitPrice,
      cost: roundMoney(quantity * unitCost),
      price: roundMoney(quantity * unitPrice),
    }
  })

  const subtotal = roundMoney(
    rows.reduce(
      (sum, row) => sum + row.price,
      0
    )
  )

  const costTotal = roundMoney(
    rows.reduce(
      (sum, row) => sum + row.cost,
      0
    )
  )

  const taxableSubtotal = roundMoney(
    rows
      .filter((row) => row.taxable)
      .reduce(
        (sum, row) => sum + row.price,
        0
      )
  )

  const discountValue = Number(
    invoice.discount_value || 0
  )

  const discount =
    invoice.discount_type === 'percent'
      ? roundMoney(
          subtotal * (discountValue / 100)
        )
      : roundMoney(discountValue)

  const subtotalAfterDiscount = clampMoney(
    subtotal - discount
  )

  const taxableRatio =
    subtotal > 0
      ? taxableSubtotal / subtotal
      : 0

  const taxableAfterDiscount = roundMoney(
    subtotalAfterDiscount * taxableRatio
  )

  const tax = roundMoney(
    taxableAfterDiscount *
      (Number(invoice.tax_rate || 0) / 100)
  )

  const lateFeeValue = Number(
    invoice.late_fee_value || 0
  )

  const lateFee =
    invoice.late_fee_type === 'percent'
      ? roundMoney(
          (subtotalAfterDiscount + tax) *
            (lateFeeValue / 100)
        )
      : roundMoney(lateFeeValue)

  const invoiceTotal = roundMoney(
    subtotalAfterDiscount +
      tax +
      lateFee
  )

  const depositApplied = clampMoney(
    invoice.deposit_applied
  )

  const paymentTotal = roundMoney(
    payments.reduce(
      (sum, payment) =>
        sum + Number(payment.amount || 0),
      0
    )
  )

  const creditsTotal = roundMoney(
    depositApplied + paymentTotal
  )

  const balanceDue = clampMoney(
    invoiceTotal - creditsTotal
  )

  const overpayment = clampMoney(
    creditsTotal - invoiceTotal
  )

  const profit = roundMoney(
    subtotalAfterDiscount - costTotal
  )

  const margin =
    subtotalAfterDiscount > 0
      ? roundMoney(
          (profit / subtotalAfterDiscount) * 100
        )
      : 0

  return {
    rows,
    subtotal,
    costTotal,
    taxableSubtotal,
    discount,
    subtotalAfterDiscount,
    taxableAfterDiscount,
    tax,
    lateFee,
    invoiceTotal,
    depositApplied,
    paymentTotal,
    creditsTotal,
    balanceDue,
    overpayment,
    profit,
    margin,
  }
}

export function getDaysPastDue(
  invoice,
  today = new Date()
) {
  if (!invoice?.due_date) {
    return 0
  }

  const dueDate = new Date(
    `${invoice.due_date}T12:00:00`
  )

  const currentDate = new Date(today)

  currentDate.setHours(
    12,
    0,
    0,
    0
  )

  const difference =
    currentDate.getTime() -
    dueDate.getTime()

  return Math.max(
    0,
    Math.floor(
      difference / 86400000
    )
  )
}

export function getAgingBucket(
  invoice,
  totals,
  today = new Date()
) {
  if (
    !totals ||
    totals.balanceDue <= 0
  ) {
    return 'Paid'
  }

  const daysPastDue = getDaysPastDue(
    invoice,
    today
  )

  if (daysPastDue <= 0) {
    return 'Current'
  }

  if (daysPastDue <= 30) {
    return '1-30'
  }

  if (daysPastDue <= 60) {
    return '31-60'
  }

  if (daysPastDue <= 90) {
    return '61-90'
  }

  return '90+'
}

export function deriveInvoiceStatus(
  invoice,
  totals,
  today = new Date()
) {
  if (invoice.status === 'Void') {
    return 'Void'
  }

  if (totals.balanceDue <= 0) {
    return 'Paid'
  }

  if (
    totals.paymentTotal > 0 ||
    totals.depositApplied > 0
  ) {
    return 'Partial'
  }

  if (
    getDaysPastDue(
      invoice,
      today
    ) > 0
  ) {
    return 'Overdue'
  }

  return invoice.status || 'Draft'
}export function buildAgingSummary(
  invoices,
  lineItems,
  payments,
  today = new Date()
) {
  const summary = {
    Current: 0,
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
    Paid: 0,
  }

  invoices.forEach((invoice) => {
    const invoiceLines = lineItems.filter(
      (item) => item.invoice_id === invoice.id
    )

    const invoicePayments = payments.filter(
      (payment) => payment.invoice_id === invoice.id
    )

    const totals = calculateInvoiceTotals(
      invoice,
      invoiceLines,
      invoicePayments
    )

    const bucket = getAgingBucket(
      invoice,
      totals,
      today
    )

    summary[bucket] = roundMoney(
      (summary[bucket] || 0) + totals.balanceDue
    )
  })

  return summary
}

export function missingColumnName(error) {
  const message = String(error?.message || '')

  const patterns = [
    /Could not find the ['"]([^'"]+)['"] column/i,
    /column ["']?([^"' ]+)["']? of relation/i,
    /column ([a-zA-Z0-9_]+) does not exist/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)

    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

export async function adaptiveUpsert(
  supabase,
  table,
  payload
) {
  const working = {
    ...payload,
  }

  for (let attempt = 0; attempt < 50; attempt++) {
    const result = await supabase
      .from(table)
      .upsert(working, {
        onConflict: 'id',
      })
      .select()
      .single()

    if (!result.error) {
      return result
    }

    const missing = missingColumnName(result.error)

    if (
      !missing ||
      !(missing in working)
    ) {
      return result
    }

    delete working[missing]
  }

  return {
    data: null,
    error: new Error(
      `Unable to save record to ${table}.`
    ),
  }
}

export async function safeSelect(
  supabase,
  table,
  orderColumn = 'created_at',
  ascending = false
) {
  const result = await supabase
    .from(table)
    .select('*')
    .order(orderColumn, {
      ascending,
    })

  if (!result.error) {
    return {
      data: Array.isArray(result.data)
        ? result.data
        : [],
      error: null,
    }
  }

  const message = String(
    result.error.message || ''
  ).toLowerCase()

  if (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('relation')
  ) {
    return {
      data: [],
      error: null,
    }
  }

  return {
    data: [],
    error: result.error,
  }
}

export function invoiceToPlainText(
  invoice,
  customer,
  lineItems,
  payments
) {
  const totals = calculateInvoiceTotals(
    invoice,
    lineItems,
    payments
  )

  const lines = [
    invoice.title || 'Invoice',
    invoice.invoice_number || '',
    customerName(customer),
    '',
  ]

  lineItems.forEach((item) => {
    const total =
      Number(item.quantity || 0) *
      Number(item.unit_price || 0)

    lines.push(
      `${item.description || 'Item'} — ${item.quantity || 0} ${
        item.unit || ''
      } × ${formatCurrency(
        item.unit_price
      )} = ${formatCurrency(total)}`
    )
  })

  lines.push('')
  lines.push(
    `Subtotal: ${formatCurrency(
      totals.subtotal
    )}`
  )
  lines.push(
    `Discount: ${formatCurrency(
      totals.discount
    )}`
  )
  lines.push(
    `Tax: ${formatCurrency(
      totals.tax
    )}`
  )
  lines.push(
    `Late Fee: ${formatCurrency(
      totals.lateFee
    )}`
  )
  lines.push(
    `Invoice Total: ${formatCurrency(
      totals.invoiceTotal
    )}`
  )
  lines.push(
    `Payments: ${formatCurrency(
      totals.paymentTotal
    )}`
  )
  lines.push(
    `Credits: ${formatCurrency(
      totals.creditsTotal
    )}`
  )
  lines.push(
    `Balance Due: ${formatCurrency(
      totals.balanceDue
    )}`
  )

  return lines.join('\n')
}