import React, { useEffect, useState } from 'react'
import { Field, Modal, SelectField } from '../../components/UI'
import {
  CONTACT_METHODS,
  CUSTOMER_STATUSES,
  CUSTOMER_TAG_OPTIONS,
  CUSTOMER_TYPES,
  createEmptyCustomer,
  normalizeCustomer,
  validateCustomer,
} from './customerUtils'

export default function CustomerEditor({ customer, saving = false, onClose, onSave }) {
  const [form, setForm] = useState(createEmptyCustomer())
  const [errors, setErrors] = useState({})

  useEffect(() => {
    setForm(normalizeCustomer(customer || createEmptyCustomer()))
  }, [customer])

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  function toggleTag(tag) {
    setForm((current) => ({
      ...current,
      tags: current.tags.includes(tag)
        ? current.tags.filter((item) => item !== tag)
        : [...current.tags, tag],
    }))
  }

  async function submit(event) {
    event.preventDefault()
    const validation = validateCustomer(form)
    setErrors(validation.errors)
    if (!validation.isValid) return
    await onSave(form)
  }

  return (
    <Modal title={form.id ? 'Edit Customer' : 'Add Customer'} onClose={onClose}>
      <form onSubmit={submit}>
        {errors.name && <p className="error">{errors.name}</p>}
        {errors.email && <p className="error">{errors.email}</p>}

        <div className="form-grid">
          <Field label="Customer Number" value={form.customer_number} onChange={(v) => set('customer_number', v)} />
          <SelectField label="Status" value={form.status} onChange={(v) => set('status', v)} options={CUSTOMER_STATUSES.map((x) => [x.value, x.label])} />
          <Field label="First Name" value={form.first_name} onChange={(v) => set('first_name', v)} />
          <Field label="Last Name" value={form.last_name} onChange={(v) => set('last_name', v)} />
          <Field label="Company Name" value={form.company_name} onChange={(v) => set('company_name', v)} wide />
          <SelectField label="Customer Type" value={form.customer_type} onChange={(v) => set('customer_type', v)} options={CUSTOMER_TYPES.map((x) => [x.value, x.label])} />
          <SelectField label="Preferred Contact" value={form.preferred_contact_method} onChange={(v) => set('preferred_contact_method', v)} options={CONTACT_METHODS.map((x) => [x.value, x.label])} />
          <Field label="Primary Phone" value={form.primary_phone} onChange={(v) => set('primary_phone', v)} />
          <Field label="Secondary Phone" value={form.secondary_phone} onChange={(v) => set('secondary_phone', v)} />
          <Field label="Email" type="email" value={form.email} onChange={(v) => set('email', v)} />

          <h3 style={{ gridColumn: '1 / -1' }}>Billing Address</h3>
          <Field label="Address Line 1" value={form.billing_address_line_1} onChange={(v) => set('billing_address_line_1', v)} wide />
          <Field label="Address Line 2" value={form.billing_address_line_2} onChange={(v) => set('billing_address_line_2', v)} wide />
          <Field label="City" value={form.billing_city} onChange={(v) => set('billing_city', v)} />
          <Field label="State" value={form.billing_state} onChange={(v) => set('billing_state', v)} />
          <Field label="ZIP Code" value={form.billing_postal_code} onChange={(v) => set('billing_postal_code', v)} />

          <label style={{ gridColumn: '1 / -1' }}>
            <input type="checkbox" checked={form.use_billing_for_service} onChange={(event) => set('use_billing_for_service', event.target.checked)} />{' '}
            Use billing address as service address
          </label>

          {!form.use_billing_for_service && (
            <>
              <h3 style={{ gridColumn: '1 / -1' }}>Service Address</h3>
              <Field label="Address Line 1" value={form.service_address_line_1} onChange={(v) => set('service_address_line_1', v)} wide />
              <Field label="Address Line 2" value={form.service_address_line_2} onChange={(v) => set('service_address_line_2', v)} wide />
              <Field label="City" value={form.service_city} onChange={(v) => set('service_city', v)} />
              <Field label="State" value={form.service_state} onChange={(v) => set('service_state', v)} />
              <Field label="ZIP Code" value={form.service_postal_code} onChange={(v) => set('service_postal_code', v)} />
            </>
          )}

          <div style={{ gridColumn: '1 / -1' }}>
            <b>Tags</b>
            <div className="actions" style={{ marginTop: 8 }}>
              {CUSTOMER_TAG_OPTIONS.map((tag) => (
                <button key={tag} type="button" className={form.tags.includes(tag) ? 'primary' : 'secondary'} onClick={() => toggleTag(tag)}>
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <Field label="Customer Notes" type="textarea" value={form.notes} onChange={(v) => set('notes', v)} wide />
          <Field label="Internal Notes" type="textarea" value={form.internal_notes} onChange={(v) => set('internal_notes', v)} wide />
        </div>

        <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Customer'}</button>
        </div>
      </form>
    </Modal>
  )
}
