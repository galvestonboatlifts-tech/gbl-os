export const CUSTOMER_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'lead', label: 'Lead' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
]

export const CUSTOMER_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'marina', label: 'Marina' },
  { value: 'property_manager', label: 'Property Manager' },
  { value: 'other', label: 'Other' },
]

export const CONTACT_METHODS = [
  { value: 'phone', label: 'Phone' },
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
]

export const CUSTOMER_TAG_OPTIONS = [
  'VIP',
  'Warranty',
  'Commercial',
  'Marina',
  'Repeat Customer',
  'Past Due',
  'Priority',
]

export function createEmptyCustomer() {
  return {
    id: null,
    customer_number: '',
    first_name: '',
    last_name: '',
    company_name: '',
    customer_type: 'residential',
    status: 'active',
    primary_phone: '',
    secondary_phone: '',
    email: '',
    preferred_contact_method: 'phone',
    billing_address_line_1: '',
    billing_address_line_2: '',
    billing_city: '',
    billing_state: 'TX',
    billing_postal_code: '',
    service_address_line_1: '',
    service_address_line_2: '',
    service_city: '',
    service_state: 'TX',
    service_postal_code: '',
    use_billing_for_service: true,
    tags: [],
    notes: '',
    internal_notes: '',
  }
}

export function createEmptyProperty(customerId = '') {
  return {
    id: null,
    customer_id: customerId,
    name: '',
    address: '',
    city: '',
    state: 'TX',
    zip_code: '',
    gate_code: '',
    dock_details: '',
    notes: '',
  }
}

export function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean)
  if (typeof tags === 'string') {
    return tags.split(',').map((tag) => tag.trim()).filter(Boolean)
  }
  return []
}

export function normalizeCustomer(customer = {}) {
  return {
    ...createEmptyCustomer(),
    ...customer,
    tags: normalizeTags(customer.tags),
    use_billing_for_service: customer.use_billing_for_service !== false,
  }
}

export function getCustomerDisplayName(customer = {}) {
  const person = [customer.first_name, customer.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  if (customer.company_name && person) return `${customer.company_name} — ${person}`
  return customer.company_name || person || customer.name || 'Unnamed Customer'
}

export function getCustomerInitials(customer = {}) {
  return getCustomerDisplayName(customer)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'C'
}

export function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  return value || ''
}

export function phoneHref(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits ? `tel:${digits}` : ''
}

export function textHref(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits ? `sms:${digits}` : ''
}

export function emailHref(value) {
  return value ? `mailto:${value}` : ''
}

export function mapsHref(address) {
  return address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : ''
}

export function formatCustomerAddress(customer = {}, type = 'service') {
  const prefix = type === 'billing' ? 'billing' : 'service'
  const line1 = customer[`${prefix}_address_line_1`] || ''
  const line2 = customer[`${prefix}_address_line_2`] || ''
  const city = customer[`${prefix}_city`] || ''
  const state = customer[`${prefix}_state`] || ''
  const postal = customer[`${prefix}_postal_code`] || ''

  return [
    [line1, line2].filter(Boolean).join(', '),
    [city, [state, postal].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  ].filter(Boolean).join(', ')
}

export function formatPropertyAddress(property = {}) {
  return [
    property.address,
    [property.city, property.state, property.zip_code].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ')
}

export function formatMoney(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0))
}

export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function getRecordDate(record = {}) {
  return (
    record.completed_at ||
    record.paid_at ||
    record.invoice_date ||
    record.scheduled_date ||
    record.install_date ||
    record.service_date ||
    record.updated_at ||
    record.created_at ||
    null
  )
}

export function getCustomerFinancials(customerId, invoices = []) {
  const rows = invoices.filter((x) => x.customer_id === customerId)
  const totalInvoiced = rows.reduce((sum, x) => sum + Number(x.total || x.amount || 0), 0)
  const totalPaid = rows.reduce((sum, x) => sum + Number(x.paid || x.amount_paid || 0), 0)
  const balance = totalInvoiced - totalPaid

  return {
    totalInvoiced,
    totalPaid,
    balance,
    invoiceCount: rows.length,
    averageInvoice: rows.length ? totalInvoiced / rows.length : 0,
  }
}

export function buildCustomerTimeline({
  customer,
  properties = [],
  boatLifts = [],
  jobs = [],
  invoices = [],
}) {
  if (!customer) return []

  const items = []

  properties
    .filter((x) => x.customer_id === customer.id)
    .forEach((property) => {
      items.push({
        id: `property-${property.id}`,
        type: 'property',
        title: 'Property added',
        description: property.name || formatPropertyAddress(property),
        date: getRecordDate(property),
      })
    })

  boatLifts
    .filter((x) => x.customer_id === customer.id)
    .forEach((lift) => {
      items.push({
        id: `lift-${lift.id}`,
        type: 'lift',
        title: lift.install_date ? 'Boat lift installed' : 'Boat lift added',
        description: lift.lift_number || lift.name || [lift.manufacturer, lift.model].filter(Boolean).join(' ') || 'Boat lift',
        date: getRecordDate(lift),
      })
    })

  jobs
    .filter((x) => x.customer_id === customer.id)
    .forEach((job) => {
      items.push({
        id: `job-${job.id}`,
        type: 'job',
        title: job.status === 'completed' ? 'Job completed' : 'Job created',
        description: job.job_number || job.number || job.title || job.scope || 'Job',
        date: getRecordDate(job),
      })
    })

  invoices
    .filter((x) => x.customer_id === customer.id)
    .forEach((invoice) => {
      const total = Number(invoice.total || invoice.amount || 0)
      const paid = Number(invoice.paid || invoice.amount_paid || 0)
      items.push({
        id: `invoice-${invoice.id}`,
        type: paid >= total && total > 0 ? 'payment' : 'invoice',
        title: paid >= total && total > 0 ? 'Invoice paid' : 'Invoice created',
        description: `${invoice.invoice_number || invoice.number || 'Invoice'} · ${formatMoney(total)}`,
        date: getRecordDate(invoice),
      })
    })

  items.push({
    id: `customer-${customer.id}`,
    type: 'customer',
    title: 'Customer created',
    description: getCustomerDisplayName(customer),
    date: customer.created_at,
  })

  return items
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
}

export function getCustomerHealth({
  customer,
  invoices = [],
  jobs = [],
  boatLifts = [],
}) {
  const financials = getCustomerFinancials(customer.id, invoices)
  const customerJobs = jobs.filter((x) => x.customer_id === customer.id)
  const customerLifts = boatLifts.filter((x) => x.customer_id === customer.id)

  const overdueInvoice = invoices.some((x) => {
    if (x.customer_id !== customer.id) return false
    const total = Number(x.total || x.amount || 0)
    const paid = Number(x.paid || x.amount_paid || 0)
    const dueDate = x.due_date ? new Date(x.due_date) : null
    return total > paid && dueDate && dueDate < new Date()
  })

  const openJobs = customerJobs.filter((x) =>
    ['open', 'scheduled', 'in_progress', 'pending'].includes(String(x.status || '').toLowerCase())
  ).length

  if (overdueInvoice || financials.balance > 5000) {
    return { label: 'Needs Attention', tone: 'danger', reason: 'Past-due or high outstanding balance' }
  }

  if (openJobs > 0 || financials.balance > 0) {
    return { label: 'Follow Up', tone: 'warning', reason: 'Open work or balance remains' }
  }

  if (customerLifts.length > 0 || financials.totalPaid > 0) {
    return { label: 'Good', tone: 'success', reason: 'Active customer in good standing' }
  }

  return { label: 'New', tone: 'neutral', reason: 'New customer record' }
}

export function validateCustomer(customer = {}) {
  const errors = {}
  const hasName =
    String(customer.first_name || '').trim() ||
    String(customer.last_name || '').trim() ||
    String(customer.company_name || '').trim()

  if (!hasName) errors.name = 'Enter a customer or company name.'

  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    errors.email = 'Enter a valid email address.'
  }

  return { errors, isValid: Object.keys(errors).length === 0 }
}

export function prepareCustomerPayload(customer = {}) {
  const item = normalizeCustomer(customer)

  if (item.use_billing_for_service) {
    item.service_address_line_1 = item.billing_address_line_1
    item.service_address_line_2 = item.billing_address_line_2
    item.service_city = item.billing_city
    item.service_state = item.billing_state
    item.service_postal_code = item.billing_postal_code
  }

  const payload = {
    customer_number: item.customer_number || null,
    first_name: item.first_name.trim() || null,
    last_name: item.last_name.trim() || null,
    company_name: item.company_name.trim() || null,
    customer_type: item.customer_type,
    status: item.status,
    primary_phone: item.primary_phone.trim() || null,
    secondary_phone: item.secondary_phone.trim() || null,
    email: item.email.trim() || null,
    preferred_contact_method: item.preferred_contact_method,
    billing_address_line_1: item.billing_address_line_1.trim() || null,
    billing_address_line_2: item.billing_address_line_2.trim() || null,
    billing_city: item.billing_city.trim() || null,
    billing_state: item.billing_state.trim() || null,
    billing_postal_code: item.billing_postal_code.trim() || null,
    service_address_line_1: item.service_address_line_1.trim() || null,
    service_address_line_2: item.service_address_line_2.trim() || null,
    service_city: item.service_city.trim() || null,
    service_state: item.service_state.trim() || null,
    service_postal_code: item.service_postal_code.trim() || null,
    use_billing_for_service: item.use_billing_for_service,
    tags: normalizeTags(item.tags),
    notes: item.notes.trim() || null,
    internal_notes: item.internal_notes.trim() || null,
    updated_at: new Date().toISOString(),
  }

  if (item.id) payload.id = item.id
  return payload
}

export function filterCustomers(customers = [], filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase()

  return customers.filter((customer) => {
    const text = [
      getCustomerDisplayName(customer),
      customer.customer_number,
      customer.primary_phone,
      customer.secondary_phone,
      customer.email,
      formatCustomerAddress(customer, 'service'),
      formatCustomerAddress(customer, 'billing'),
      normalizeTags(customer.tags).join(' '),
    ].filter(Boolean).join(' ').toLowerCase()

    return (
      (!filters.status || filters.status === 'all' || customer.status === filters.status) &&
      (!filters.type || filters.type === 'all' || customer.customer_type === filters.type) &&
      (!search || text.includes(search))
    )
  })
}
