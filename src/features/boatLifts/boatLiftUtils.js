export const LIFT_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'service_due', label: 'Service Due' },
  { value: 'out_of_service', label: 'Out of Service' },
  { value: 'removed', label: 'Removed' },
]

export function createEmptyBoatLift() {
  return {
    id: null,
    lift_number: '',
    customer_id: '',
    property_id: '',
    manufacturer: '',
    model: '',
    capacity: '',
    serial_number: '',
    install_date: '',
    warranty_expires_at: '',
    last_service_at: '',
    next_service_at: '',
    status: 'active',
    motor_details: '',
    gearbox_details: '',
    cable_details: '',
    control_details: '',
    cradle_details: '',
    notes: '',
  }
}

export function normalizeBoatLift(lift = {}) {
  return {
    ...createEmptyBoatLift(),
    ...lift,
    capacity: lift.capacity ?? '',
  }
}

export function getLiftDisplayName(lift = {}) {
  if (lift.lift_number) return lift.lift_number
  const equipment = [lift.manufacturer, lift.model].filter(Boolean).join(' ')
  return equipment || 'Unnamed Boat Lift'
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

export function formatCapacity(value) {
  const amount = Number(value || 0)
  return amount ? `${amount.toLocaleString('en-US')} lb` : '—'
}

export function getCustomerName(customer = {}) {
  const person = [customer.first_name, customer.last_name].filter(Boolean).join(' ')
  return customer.company_name || person || customer.name || 'Unknown Customer'
}

export function getPropertyName(property = {}) {
  return (
    property.name ||
    [
      property.address,
      [property.city, property.state, property.zip_code].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join(', ') ||
    'Unknown Property'
  )
}

export function daysUntil(value) {
  if (!value) return null
  const target = new Date(value)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target - today) / 86400000)
}

export function getLiftHealth(lift = {}) {
  const status = String(lift.status || '').toLowerCase()
  const serviceDays = daysUntil(lift.next_service_at)
  const warrantyDays = daysUntil(lift.warranty_expires_at)

  if (status === 'out_of_service' || status === 'removed') {
    return {
      label: status === 'removed' ? 'Removed' : 'Out of Service',
      tone: 'danger',
      reason: status === 'removed' ? 'Lift has been removed' : 'Lift is unavailable for use',
    }
  }

  if (status === 'service_due' || (serviceDays !== null && serviceDays < 0)) {
    return {
      label: 'Service Due',
      tone: 'warning',
      reason: 'Scheduled maintenance is overdue',
    }
  }

  if (serviceDays !== null && serviceDays <= 30) {
    return {
      label: 'Service Soon',
      tone: 'warning',
      reason: `Service due in ${serviceDays} day${serviceDays === 1 ? '' : 's'}`,
    }
  }

  if (warrantyDays !== null && warrantyDays <= 60 && warrantyDays >= 0) {
    return {
      label: 'Warranty Expiring',
      tone: 'warning',
      reason: `Warranty expires in ${warrantyDays} days`,
    }
  }

  return {
    label: 'Healthy',
    tone: 'success',
    reason: 'No immediate issues detected',
  }
}

export function filterBoatLifts(lifts = [], customers = [], properties = [], filters = {}) {
  const search = String(filters.search || '').trim().toLowerCase()

  return lifts.filter((lift) => {
    const customer = customers.find((x) => x.id === lift.customer_id)
    const property = properties.find((x) => x.id === lift.property_id)

    const text = [
      getLiftDisplayName(lift),
      lift.manufacturer,
      lift.model,
      lift.serial_number,
      lift.capacity,
      getCustomerName(customer),
      getPropertyName(property),
      lift.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return (
      (!filters.status || filters.status === 'all' || lift.status === filters.status) &&
      (!filters.customerId || filters.customerId === 'all' || lift.customer_id === filters.customerId) &&
      (!search || text.includes(search))
    )
  })
}

export function validateBoatLift(lift = {}) {
  const errors = {}

  if (!lift.customer_id) errors.customer_id = 'Select a customer.'
  if (!lift.property_id) errors.property_id = 'Select a property.'
  if (!lift.lift_number && !lift.manufacturer && !lift.model) {
    errors.name = 'Enter a lift number, manufacturer, or model.'
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  }
}

export function prepareBoatLiftPayload(lift = {}) {
  const item = normalizeBoatLift(lift)

  const payload = {
    lift_number: String(item.lift_number || '').trim() || null,
    customer_id: item.customer_id || null,
    property_id: item.property_id || null,
    manufacturer: String(item.manufacturer || '').trim() || null,
    model: String(item.model || '').trim() || null,
    capacity: item.capacity === '' ? null : Number(item.capacity),
    serial_number: String(item.serial_number || '').trim() || null,
    install_date: item.install_date || null,
    warranty_expires_at: item.warranty_expires_at || null,
    last_service_at: item.last_service_at || null,
    next_service_at: item.next_service_at || null,
    status: item.status || 'active',
    motor_details: String(item.motor_details || '').trim() || null,
    gearbox_details: String(item.gearbox_details || '').trim() || null,
    cable_details: String(item.cable_details || '').trim() || null,
    control_details: String(item.control_details || '').trim() || null,
    cradle_details: String(item.cradle_details || '').trim() || null,
    notes: String(item.notes || '').trim() || null,
    updated_at: new Date().toISOString(),
  }

  if (item.id) payload.id = item.id
  return payload
}

export function getLiftJobs(liftId, jobs = []) {
  return jobs.filter((job) => job.boat_lift_id === liftId || job.lift_id === liftId)
}

export function getLiftInvoices(liftId, invoices = [], jobs = []) {
  const jobIds = new Set(getLiftJobs(liftId, jobs).map((job) => job.id))
  return invoices.filter(
    (invoice) =>
      invoice.boat_lift_id === liftId ||
      invoice.lift_id === liftId ||
      jobIds.has(invoice.job_id)
  )
}
