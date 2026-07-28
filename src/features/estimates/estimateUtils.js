export const ESTIMATE_STATUS_OPTIONS = [
  'Draft',
  'Sent',
  'Viewed',
  'Approved',
  'Rejected',
  'Expired',
  'Converted',
  'Cancelled',
]

export const EMPTY_ESTIMATE = {
  estimate_number: '',
  customer_id: '',
  job_id: '',
  title: '',
  status: 'Draft',
  issue_date: new Date().toISOString().slice(0, 10),
  expiration_date: '',
  project_address: '',
  project_city: '',
  project_state: 'TX',
  project_postal_code: '',
  salesperson_id: '',
  tax_rate: '8.25',
  discount_type: 'amount',
  discount_value: '',
  deposit_type: 'percent',
  deposit_value: '',
  notes: '',
  terms: '',
  internal_notes: '',
}

export const EMPTY_LINE_ITEM = {
  id: '',
  category: 'Material',
  description: '',
  quantity: '1',
  unit: 'each',
  unit_cost: '',
  unit_price: '',
  taxable: true,
  sort_order: 0,
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
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0))
}

export function formatDate(value) {
  if (!value) return '—'
  const text = String(value)
  const date = new Date(text.length === 10 ? `${text}T12:00:00` : text)
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString()
}

export function customerName(customer) {
  return (
    customer?.company_name ||
    [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') ||
    customer?.name ||
    'Unknown Customer'
  )
}

export function employeeName(employee) {
  return (
    employee?.preferred_name ||
    [employee?.first_name, employee?.last_name].filter(Boolean).join(' ') ||
    employee?.name ||
    'Employee'
  )
}

export function nextEstimateNumber(estimates) {
  const year = new Date().getFullYear()
  const numbers = estimates
    .map((estimate) => String(estimate.estimate_number || ''))
    .map((value) => {
      const match = value.match(/(\d+)$/)
      return match ? Number(match[1]) : 0
    })

  const next = Math.max(0, ...numbers) + 1
  return `EST-${year}-${String(next).padStart(4, '0')}`
}

export function normalizeLineItem(item, index = 0) {
  return {
    id: item.id || createId(),
    category: item.category || 'Material',
    description: item.description || '',
    quantity: item.quantity ?? '1',
    unit: item.unit || 'each',
    unit_cost: item.unit_cost ?? '',
    unit_price: item.unit_price ?? '',
    taxable: item.taxable !== false,
    sort_order: item.sort_order ?? index,
  }
}

export function calculateEstimateTotals(estimate, lineItems) {
  const rows = lineItems.map((item) => {
    const quantity = Number(item.quantity || 0)
    const cost = Number(item.unit_cost || 0) * quantity
    const price = Number(item.unit_price || 0) * quantity
    return { ...item, quantity, cost, price }
  })

  const subtotal = rows.reduce((sum, row) => sum + row.price, 0)
  const costTotal = rows.reduce((sum, row) => sum + row.cost, 0)
  const taxableSubtotal = rows
    .filter((row) => row.taxable)
    .reduce((sum, row) => sum + row.price, 0)

  const discountValue = Number(estimate.discount_value || 0)
  const discount =
    estimate.discount_type === 'percent'
      ? subtotal * (discountValue / 100)
      : discountValue

  const subtotalAfterDiscount = Math.max(0, subtotal - discount)
  const taxableRatio = subtotal > 0 ? taxableSubtotal / subtotal : 0
  const taxableAfterDiscount = subtotalAfterDiscount * taxableRatio
  const tax = taxableAfterDiscount * (Number(estimate.tax_rate || 0) / 100)
  const total = subtotalAfterDiscount + tax

  const depositValue = Number(estimate.deposit_value || 0)
  const deposit =
    estimate.deposit_type === 'amount'
      ? depositValue
      : total * (depositValue / 100)

  const profit = subtotalAfterDiscount - costTotal
  const margin = subtotalAfterDiscount > 0 ? (profit / subtotalAfterDiscount) * 100 : 0

  return {
    rows,
    subtotal,
    costTotal,
    discount,
    taxableSubtotal,
    taxableAfterDiscount,
    tax,
    total,
    deposit,
    balance: total - deposit,
    profit,
    margin,
  }
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
    if (match?.[1]) return match[1]
  }

  return null
}

export async function adaptiveUpsert(supabase, table, payload) {
  const working = { ...payload }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await supabase
      .from(table)
      .upsert(working, { onConflict: 'id' })
      .select()
      .single()

    if (!result.error) return result

    const missing = missingColumnName(result.error)
    if (!missing || !(missing in working)) return result
    delete working[missing]
  }

  return {
    data: null,
    error: new Error(`Unable to save record to ${table}.`),
  }
}

export async function safeSelect(supabase, table, orderColumn = 'created_at', ascending = false) {
  const result = await supabase
    .from(table)
    .select('*')
    .order(orderColumn, { ascending })

  if (!result.error) {
    return { data: Array.isArray(result.data) ? result.data : [], error: null }
  }

  const message = String(result.error.message || '').toLowerCase()
  if (message.includes('does not exist') || message.includes('schema cache')) {
    return { data: [], error: null }
  }

  return { data: [], error: result.error }
}
