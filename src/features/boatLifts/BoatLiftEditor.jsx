import React, { useEffect, useMemo, useState } from 'react'
import { Field, Modal, SelectField } from '../../components/UI'
import {
  LIFT_STATUSES,
  createEmptyBoatLift,
  getCustomerName,
  getPropertyName,
  normalizeBoatLift,
  validateBoatLift,
} from './boatLiftUtils'

export default function BoatLiftEditor({
  lift,
  customers = [],
  properties = [],
  saving = false,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(createEmptyBoatLift())
  const [errors, setErrors] = useState({})

  useEffect(() => {
    setForm(normalizeBoatLift(lift || createEmptyBoatLift()))
  }, [lift])

  const set = (key, value) =>
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'customer_id' ? { property_id: '' } : {}),
    }))

  const availableProperties = useMemo(
    () => properties.filter((property) => property.customer_id === form.customer_id),
    [properties, form.customer_id]
  )

  async function submit(event) {
    event.preventDefault()
    const validation = validateBoatLift(form)
    setErrors(validation.errors)
    if (!validation.isValid) return
    await onSave(form)
  }

  return (
    <Modal title={form.id ? 'Edit Boat Lift' : 'Add Boat Lift'} onClose={onClose}>
      <form onSubmit={submit}>
        {Object.values(errors).map((message) => (
          <p className="error" key={message}>{message}</p>
        ))}

        <div className="form-grid">
          <Field
            label="Lift Number"
            value={form.lift_number}
            onChange={(value) => set('lift_number', value)}
          />

          <SelectField
            label="Status"
            value={form.status}
            onChange={(value) => set('status', value)}
            options={LIFT_STATUSES.map((item) => [item.value, item.label])}
          />

          <SelectField
            label="Customer"
            value={form.customer_id}
            onChange={(value) => set('customer_id', value)}
            options={[
              ['', 'Select customer'],
              ...customers.map((customer) => [customer.id, getCustomerName(customer)]),
            ]}
          />

          <SelectField
            label="Property"
            value={form.property_id}
            onChange={(value) => set('property_id', value)}
            options={[
              ['', 'Select property'],
              ...availableProperties.map((property) => [property.id, getPropertyName(property)]),
            ]}
          />

          <Field label="Manufacturer" value={form.manufacturer} onChange={(value) => set('manufacturer', value)} />
          <Field label="Model" value={form.model} onChange={(value) => set('model', value)} />
          <Field label="Capacity (lb)" type="number" value={form.capacity} onChange={(value) => set('capacity', value)} />
          <Field label="Serial Number" value={form.serial_number} onChange={(value) => set('serial_number', value)} />

          <Field label="Install Date" type="date" value={form.install_date || ''} onChange={(value) => set('install_date', value)} />
          <Field label="Warranty Expires" type="date" value={form.warranty_expires_at || ''} onChange={(value) => set('warranty_expires_at', value)} />
          <Field label="Last Service" type="date" value={form.last_service_at || ''} onChange={(value) => set('last_service_at', value)} />
          <Field label="Next Service" type="date" value={form.next_service_at || ''} onChange={(value) => set('next_service_at', value)} />

          <h3 style={{ gridColumn: '1 / -1' }}>Components</h3>
          <Field label="Motor Details" value={form.motor_details} onChange={(value) => set('motor_details', value)} wide />
          <Field label="Gearbox Details" value={form.gearbox_details} onChange={(value) => set('gearbox_details', value)} wide />
          <Field label="Cable Details" value={form.cable_details} onChange={(value) => set('cable_details', value)} wide />
          <Field label="Controls / Switches" value={form.control_details} onChange={(value) => set('control_details', value)} wide />
          <Field label="Cradle / Bunks / Beams" value={form.cradle_details} onChange={(value) => set('cradle_details', value)} wide />
          <Field label="Lift Notes" type="textarea" value={form.notes} onChange={(value) => set('notes', value)} wide />
        </div>

        <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Boat Lift'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
