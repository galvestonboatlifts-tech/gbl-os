import React from 'react'
import { Badge, Empty, Metric } from '../../components/UI'
import {
  formatCapacity,
  formatDate,
  getCustomerName,
  getLiftDisplayName,
  getLiftHealth,
  getLiftInvoices,
  getLiftJobs,
  getPropertyName,
} from './boatLiftUtils'

export default function BoatLiftDetail({
  lift,
  customers = [],
  properties = [],
  jobs = [],
  invoices = [],
  onBack,
  onEditLift,
  onDeleteLift,
}) {
  const customer = customers.find((item) => item.id === lift.customer_id)
  const property = properties.find((item) => item.id === lift.property_id)
  const health = getLiftHealth(lift)
  const liftJobs = getLiftJobs(lift.id, jobs)
  const liftInvoices = getLiftInvoices(lift.id, invoices, jobs)

  const completedJobs = liftJobs.filter(
    (job) => String(job.status || '').toLowerCase() === 'completed'
  )

  const totalRevenue = liftInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.paid || invoice.amount_paid || 0),
    0
  )

  return (
    <>
      <div className="toolbar">
        <button className="secondary" onClick={onBack}>← Back to Boat Lifts</button>
        <div className="actions">
          <button className="secondary" onClick={() => onEditLift(lift)}>Edit Lift</button>
          <button className="danger" onClick={() => onDeleteLift(lift)}>Delete Lift</button>
        </div>
      </div>

      <section className="panel">
        <div className="between">
          <div>
            <h2>{getLiftDisplayName(lift)}</h2>
            <div className="small">
              {[lift.manufacturer, lift.model, lift.serial_number].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="actions">
            <Badge>{lift.status || 'active'}</Badge>
            <Badge>{health.label}</Badge>
          </div>
        </div>

        <p style={{ marginTop: 18 }}><b>Health:</b> {health.reason}</p>

        <div className="grid-2">
          <div>
            <h3>Ownership</h3>
            <p><b>Customer:</b> {getCustomerName(customer)}</p>
            <p><b>Property:</b> {getPropertyName(property)}</p>
          </div>
          <div>
            <h3>Lift Information</h3>
            <p><b>Capacity:</b> {formatCapacity(lift.capacity)}</p>
            <p><b>Installed:</b> {formatDate(lift.install_date)}</p>
            <p><b>Warranty:</b> {formatDate(lift.warranty_expires_at)}</p>
            <p><b>Last Service:</b> {formatDate(lift.last_service_at)}</p>
            <p><b>Next Service:</b> {formatDate(lift.next_service_at)}</p>
          </div>
        </div>
      </section>

      <div className="metrics">
        <Metric label="Completed Jobs" value={completedJobs.length} />
        <Metric label="Total Service Jobs" value={liftJobs.length} />
        <Metric label="Invoices" value={liftInvoices.length} />
        <Metric label="Revenue" value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalRevenue)} />
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Components</h2>
          <div className="cards">
            <article className="card"><h3>Motors</h3><p>{lift.motor_details || 'No motor details recorded.'}</p></article>
            <article className="card"><h3>Gearboxes</h3><p>{lift.gearbox_details || 'No gearbox details recorded.'}</p></article>
            <article className="card"><h3>Cables</h3><p>{lift.cable_details || 'No cable details recorded.'}</p></article>
            <article className="card"><h3>Controls</h3><p>{lift.control_details || 'No control details recorded.'}</p></article>
            <article className="card"><h3>Cradle / Bunks / Beams</h3><p>{lift.cradle_details || 'No cradle details recorded.'}</p></article>
          </div>
        </section>

        <section className="panel">
          <h2>Lift Notes</h2>
          <p>{lift.notes || 'No notes recorded.'}</p>
        </section>

        <section className="panel">
          <h2>Service History</h2>
          <div className="cards">
            {liftJobs.map((job) => (
              <article className="card" key={job.id}>
                <div className="between">
                  <h3>{job.job_number || job.number || job.title || 'Service Job'}</h3>
                  <Badge>{job.status || 'Open'}</Badge>
                </div>
                <p>{job.scope || job.description || 'No description.'}</p>
                <p><b>Scheduled:</b> {formatDate(job.scheduled_date)}</p>
                <p><b>Completed:</b> {formatDate(job.completed_at)}</p>
              </article>
            ))}
            {!liftJobs.length && <Empty>No service history linked</Empty>}
          </div>
        </section>

        <section className="panel">
          <h2>Invoices</h2>
          <div className="cards">
            {liftInvoices.map((invoice) => {
              const total = Number(invoice.total || invoice.amount || 0)
              const paid = Number(invoice.paid || invoice.amount_paid || 0)

              return (
                <article className="card" key={invoice.id}>
                  <div className="between">
                    <h3>{invoice.invoice_number || invoice.number || 'Invoice'}</h3>
                    <Badge>{invoice.status || (paid >= total && total > 0 ? 'Paid' : 'Open')}</Badge>
                  </div>
                  <p><b>Total:</b> ${total.toFixed(2)}</p>
                  <p><b>Paid:</b> ${paid.toFixed(2)}</p>
                  <p><b>Due:</b> {formatDate(invoice.due_date)}</p>
                </article>
              )
            })}
            {!liftInvoices.length && <Empty>No invoices linked</Empty>}
          </div>
        </section>
      </div>
    </>
  )
}
