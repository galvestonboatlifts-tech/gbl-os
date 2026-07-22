import React, { useMemo, useState } from 'react'
import { Badge, Empty, Field, Modal, SelectField } from '../../components/UI'
import { dateText, id } from '../../lib/utils'

const STATUSES = ['Active', 'Needs Service', 'Out of Service', 'Removed']
const PRIORITIES = ['None', 'Monitor', 'Recommended Soon', 'Immediate Attention']

const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const name = (lift) => `${lift?.lift_number || 'Unnumbered Lift'}${lift?.manufacturer ? ` · ${lift.manufacturer}` : ''}`

export default function BoatLiftsModule({
  records,
  session,
  save,
  remove,
  setEditor,
}) {
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)

  const customer = (recordId) => records.customers.find((x) => x.id === recordId)
  const property = (recordId) => records.properties.find((x) => x.id === recordId)
  const selected = records.boat_lifts.find((x) => x.id === selectedId)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return records.boat_lifts
    return records.boat_lifts.filter((x) => [
      x.lift_number, x.manufacturer, x.model, x.serial_number,
      x.status, x.boat_name, x.notes, customer(x.customer_id)?.name,
      property(x.property_id)?.address,
    ].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)))
  }, [search, records.boat_lifts, records.customers, records.properties])

  if (selected) {
    const jobs = records.jobs.filter((x) => x.boat_lift_id === selected.id)
    const estimates = records.estimates.filter((x) => x.boat_lift_id === selected.id)
    const maintenance = records.maintenance.filter((x) => x.boat_lift_id === selected.id)
    const qrUrl = `${window.location.origin}/?lift=${encodeURIComponent(selected.qr_token || selected.id)}`

    return <>
      <div className="toolbar">
        <button className="secondary" onClick={() => setSelectedId(null)}>← Back to Boat Lifts</button>
        <button className="primary" onClick={() => setEditing(selected)}>Edit Lift</button>
      </div>

      <section className="panel">
        <div className="between">
          <div>
            <h2>{name(selected)}</h2>
            <div className="small">{property(selected.property_id)?.address || 'No property assigned'}</div>
          </div>
          <Badge>{selected.status}</Badge>
        </div>
        <div className="metrics">
          <div className="metric"><span>Capacity</span><strong>{selected.capacity_lbs ? `${n(selected.capacity_lbs).toLocaleString()} lb` : '—'}</strong></div>
          <div className="metric"><span>Install Date</span><strong>{dateText(selected.install_date)}</strong></div>
          <div className="metric"><span>Warranty Ends</span><strong>{dateText(selected.warranty_end)}</strong></div>
          <div className="metric"><span>Next Service</span><strong>{dateText(selected.next_service_date)}</strong></div>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Lift Information</h2>
          <p><b>Customer:</b> {customer(selected.customer_id)?.name || '—'}</p>
          <p><b>Property:</b> {property(selected.property_id)?.address || '—'}</p>
          <p><b>Manufacturer:</b> {selected.manufacturer || '—'}</p>
          <p><b>Model:</b> {selected.model || '—'}</p>
          <p><b>Serial Number:</b> {selected.serial_number || '—'}</p>
          <p><b>Lift Type:</b> {selected.lift_type || '—'}</p>
          <p><b>Boat:</b> {selected.boat_name || '—'} {selected.boat_length_ft ? `· ${selected.boat_length_ft} ft` : ''}</p>
        </section>

        <section className="panel">
          <h2>Permanent QR Identity</h2>
          <div style={{ padding: 18, border: '2px dashed #b8bec8', borderRadius: 14, textAlign: 'center' }}>
            <div className="small">PERMANENT LIFT ID</div>
            <div style={{ fontSize: 26, fontWeight: 800, margin: '8px 0' }}>{selected.lift_number}</div>
            <div className="small" style={{ overflowWrap: 'anywhere' }}>{selected.qr_token}</div>
            <div className="actions" style={{ justifyContent: 'center', marginTop: 14 }}>
              <button className="secondary" onClick={() => navigator.clipboard?.writeText(qrUrl)}>Copy Scan Link</button>
              <a className="secondary" href={qrUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>Open Link</a>
            </div>
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Mechanical Components</h2>
          <p><b>Motor:</b> {selected.motor_details || '—'}</p>
          <p><b>Gearbox:</b> {selected.gearbox_details || '—'}</p>
          <p><b>Cables:</b> {selected.cable_details || '—'}</p>
          <p><b>Pulleys:</b> {selected.pulley_details || '—'}</p>
          <p><b>Cradle / Bunks:</b> {selected.cradle_bunk_details || '—'}</p>
        </section>
        <section className="panel">
          <h2>Electrical and Controls</h2>
          <p><b>Voltage:</b> {selected.voltage || '—'}</p>
          <p><b>Controls:</b> {selected.control_details || '—'}</p>
          <p><b>Remote:</b> {selected.remote_details || '—'}</p>
          <p><b>Electrical:</b> {selected.electrical_details || '—'}</p>
        </section>
      </div>

      <section className="panel">
        <div className="between"><h2>Current Recommendation</h2><Badge>{selected.recommendation_priority || 'None'}</Badge></div>
        <p>{selected.current_recommendation || 'No active recommendation.'}</p>
        <p><b>Internal Notes:</b> {selected.notes || 'No notes.'}</p>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="between">
            <h2>Service History</h2>
            <button className="primary" onClick={() => setEditor({ type: 'job', row: {
              customer_id: selected.customer_id,
              property_id: selected.property_id,
              boat_lift_id: selected.id,
            } })}>+ Job</button>
          </div>
          <div className="cards">
            {jobs.map((x) => <article className="card" key={x.id}>
              <div className="between"><h3>{x.number} · {x.title}</h3><Badge>{x.status}</Badge></div>
              <p>{dateText(x.start_date)} · {x.crew || 'Unassigned'}</p>
              <p>{x.scope}</p>
            </article>)}
            {!jobs.length && <Empty>No service jobs attached to this lift</Empty>}
          </div>
        </section>

        <section className="panel">
          <div className="between">
            <h2>Estimates</h2>
            <button className="primary" onClick={() => setEditor({ type: 'estimate', row: {
              customer_id: selected.customer_id,
              property_id: selected.property_id,
              boat_lift_id: selected.id,
            } })}>+ Estimate</button>
          </div>
          <div className="cards">
            {estimates.map((x) => <article className="card" key={x.id}>
              <div className="between"><h3>{x.number} · {x.title}</h3><Badge>{x.status}</Badge></div>
              <p>{x.scope}</p>
            </article>)}
            {!estimates.length && <Empty>No estimates attached to this lift</Empty>}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="between">
          <h2>Maintenance</h2>
          <button className="primary" onClick={() => setEditor({ type: 'maintenance', row: {
            customer_id: selected.customer_id,
            property_id: selected.property_id,
            boat_lift_id: selected.id,
          } })}>+ Reminder</button>
        </div>
        <div className="cards">
          {maintenance.map((x) => <article className="card" key={x.id}>
            <div className="between">
              <div><h3>{x.title}</h3><p>{x.notes}</p></div>
              <div><div className="money">{dateText(x.due_date)}</div><Badge>{x.status}</Badge></div>
            </div>
          </article>)}
          {!maintenance.length && <Empty>No maintenance reminders</Empty>}
        </div>
      </section>

      {editing && <BoatLiftEditor
        initial={editing}
        records={records}
        session={session}
        close={() => setEditing(null)}
        onSave={async (row) => {
          const ok = await save('boat_lifts', row)
          if (ok !== false) setEditing(null)
        }}
      />}
    </>
  }

  return <>
    <div className="toolbar">
      <input
        type="search"
        placeholder="Search lift ID, property, manufacturer, model…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: 'min(520px, 100%)', padding: '12px 14px', borderRadius: 10, border: '1px solid #d6d9df', font: 'inherit' }}
      />
      <button className="primary" onClick={() => setEditing({})}>+ Boat Lift</button>
    </div>

    <div className="cards">
      {filtered.map((x) => <article className="card" key={x.id}>
        <div className="between">
          <div>
            <h3>{name(x)}</h3>
            <div className="small">{customer(x.customer_id)?.name || 'No customer'} · {property(x.property_id)?.address || 'No property'}</div>
          </div>
          <Badge>{x.status}</Badge>
        </div>
        <div className="grid-2">
          <div><p><b>Capacity:</b> {x.capacity_lbs ? `${n(x.capacity_lbs).toLocaleString()} lb` : '—'}</p><p><b>Model:</b> {x.model || '—'}</p></div>
          <div><p><b>Next Service:</b> {dateText(x.next_service_date)}</p><p><b>Recommendation:</b> {x.recommendation_priority || 'None'}</p></div>
        </div>
        <div className="actions">
          <button className="primary" onClick={() => setSelectedId(x.id)}>Open Lift</button>
          <button className="secondary" onClick={() => setEditing(x)}>Edit</button>
          <button className="danger" onClick={() => remove('boat_lifts', x.id)}>Delete</button>
        </div>
      </article>)}
      {!filtered.length && <Empty>{records.boat_lifts.length ? 'No lifts match your search' : 'No boat lifts'}</Empty>}
    </div>

    {editing && <BoatLiftEditor
      initial={editing}
      records={records}
      session={session}
      close={() => setEditing(null)}
      onSave={async (row) => {
        const ok = await save('boat_lifts', row)
        if (ok !== false) setEditing(null)
      }}
    />}
  </>
}

function BoatLiftEditor({ initial, records, close, onSave }) {
  const [x, setX] = useState({ ...initial })
  const set = (key, value) => setX((old) => ({ ...old, [key]: value }))
  const customerOptions = records.customers.map((c) => [c.id, c.name])
  const propertyOptions = records.properties
    .filter((p) => !x.customer_id || p.customer_id === x.customer_id)
    .map((p) => [p.id, p.address])

  async function submit(e) {
    e.preventDefault()
    await onSave({
      id: initial.id || id(),
      customer_id: x.customer_id || null,
      property_id: x.property_id || null,
      lift_number: x.lift_number || `GBL-L-${String(records.boat_lifts.length + 1).padStart(6, '0')}`,
      qr_token: x.qr_token || crypto.randomUUID(),
      status: x.status || 'Active',
      manufacturer: x.manufacturer || null,
      model: x.model || null,
      serial_number: x.serial_number || null,
      lift_type: x.lift_type || null,
      capacity_lbs: n(x.capacity_lbs),
      install_date: x.install_date || null,
      warranty_end: x.warranty_end || null,
      last_service_date: x.last_service_date || null,
      next_service_date: x.next_service_date || null,
      boat_name: x.boat_name || null,
      boat_length_ft: n(x.boat_length_ft),
      motor_details: x.motor_details || null,
      gearbox_details: x.gearbox_details || null,
      cable_details: x.cable_details || null,
      pulley_details: x.pulley_details || null,
      cradle_bunk_details: x.cradle_bunk_details || null,
      voltage: x.voltage || null,
      control_details: x.control_details || null,
      remote_details: x.remote_details || null,
      electrical_details: x.electrical_details || null,
      recommendation_priority: x.recommendation_priority || 'None',
      current_recommendation: x.current_recommendation || null,
      notes: x.notes || null,
    })
  }

  return <Modal title={`${initial.id ? 'Edit' : 'Add'} Boat Lift`} onClose={close}>
    <form onSubmit={submit}>
      <div className="form-grid">
        <SelectField label="Customer" value={x.customer_id} onChange={(v) => { set('customer_id', v); set('property_id', '') }} options={[['', 'Select customer'], ...customerOptions]} required />
        <SelectField label="Property" value={x.property_id} onChange={(v) => set('property_id', v)} options={[['', 'Select property'], ...propertyOptions]} required />
        <Field label="Lift ID" value={x.lift_number} onChange={(v) => set('lift_number', v)} />
        <SelectField label="Status" value={x.status || 'Active'} onChange={(v) => set('status', v)} options={STATUSES.map((v) => [v, v])} />
        <Field label="Manufacturer" value={x.manufacturer} onChange={(v) => set('manufacturer', v)} />
        <Field label="Model" value={x.model} onChange={(v) => set('model', v)} />
        <Field label="Serial Number" value={x.serial_number} onChange={(v) => set('serial_number', v)} />
        <Field label="Lift Type" value={x.lift_type} onChange={(v) => set('lift_type', v)} />
        <Field label="Capacity (lb)" value={x.capacity_lbs} onChange={(v) => set('capacity_lbs', v)} type="number" />
        <Field label="Install Date" value={x.install_date} onChange={(v) => set('install_date', v)} type="date" />
        <Field label="Warranty End" value={x.warranty_end} onChange={(v) => set('warranty_end', v)} type="date" />
        <Field label="Last Service" value={x.last_service_date} onChange={(v) => set('last_service_date', v)} type="date" />
        <Field label="Next Service" value={x.next_service_date} onChange={(v) => set('next_service_date', v)} type="date" />
        <Field label="Boat Name" value={x.boat_name} onChange={(v) => set('boat_name', v)} />
        <Field label="Boat Length (ft)" value={x.boat_length_ft} onChange={(v) => set('boat_length_ft', v)} type="number" />
        <Field label="Motor Details" value={x.motor_details} onChange={(v) => set('motor_details', v)} type="textarea" wide />
        <Field label="Gearbox Details" value={x.gearbox_details} onChange={(v) => set('gearbox_details', v)} type="textarea" wide />
        <Field label="Cable Details" value={x.cable_details} onChange={(v) => set('cable_details', v)} type="textarea" wide />
        <Field label="Pulley Details" value={x.pulley_details} onChange={(v) => set('pulley_details', v)} type="textarea" wide />
        <Field label="Cradle / Bunk Details" value={x.cradle_bunk_details} onChange={(v) => set('cradle_bunk_details', v)} type="textarea" wide />
        <Field label="Voltage" value={x.voltage} onChange={(v) => set('voltage', v)} />
        <Field label="Control Details" value={x.control_details} onChange={(v) => set('control_details', v)} type="textarea" wide />
        <Field label="Remote Details" value={x.remote_details} onChange={(v) => set('remote_details', v)} type="textarea" wide />
        <Field label="Electrical Details" value={x.electrical_details} onChange={(v) => set('electrical_details', v)} type="textarea" wide />
        <SelectField label="Recommendation Priority" value={x.recommendation_priority || 'None'} onChange={(v) => set('recommendation_priority', v)} options={PRIORITIES.map((v) => [v, v])} />
        <Field label="Current Recommendation" value={x.current_recommendation} onChange={(v) => set('current_recommendation', v)} type="textarea" wide />
        <Field label="Internal Notes" value={x.notes} onChange={(v) => set('notes', v)} type="textarea" wide />
      </div>
      <div className="actions" style={{ marginTop: 18, justifyContent: 'flex-end' }}>
        <button type="button" className="secondary" onClick={close}>Cancel</button>
        <button className="primary">Save Boat Lift</button>
      </div>
    </form>
  </Modal>
}
