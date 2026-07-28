import React, { useEffect, useState } from 'react'
import { Field, Modal } from '../../components/UI'
import { createEmptyProperty } from './customerUtils'

export default function PropertyEditor({ customerId, property, saving = false, onClose, onSave }) {
  const [form, setForm] = useState(createEmptyProperty(customerId))

  useEffect(() => {
    setForm({
      ...createEmptyProperty(customerId),
      ...(property || {}),
      customer_id: property?.customer_id || customerId,
    })
  }, [customerId, property])

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  async function submit(event) {
    event.preventDefault()
    if (!String(form.address || '').trim()) {
      alert('Enter the property address.')
      return
    }
    await onSave(form)
  }

  return (
    <Modal title={form.id ? 'Edit Property' : 'Add Property'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Property Name" value={form.name} onChange={(v) => set('name', v)} />
          <Field label="Street Address" value={form.address} onChange={(v) => set('address', v)} required wide />
          <Field label="City" value={form.city} onChange={(v) => set('city', v)} />
          <Field label="State" value={form.state} onChange={(v) => set('state', v)} />
          <Field label="ZIP Code" value={form.zip_code} onChange={(v) => set('zip_code', v)} />
          <Field label="Gate Code" value={form.gate_code} onChange={(v) => set('gate_code', v)} />
          <Field label="Dock Details" type="textarea" value={form.dock_details} onChange={(v) => set('dock_details', v)} wide />
          <Field label="Property Notes" type="textarea" value={form.notes} onChange={(v) => set('notes', v)} wide />
        </div>

        <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Property'}</button>
        </div>
      </form>
    </Modal>
  )
}
