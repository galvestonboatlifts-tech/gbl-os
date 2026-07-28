import React from 'react'
import { Badge, Empty, Metric } from '../../components/UI'
import {
  buildCustomerTimeline,
  emailHref,
  formatCustomerAddress,
  formatDate,
  formatMoney,
  formatPhone,
  formatPropertyAddress,
  getCustomerDisplayName,
  getCustomerFinancials,
  getCustomerHealth,
  mapsHref,
  phoneHref,
  textHref,
} from './customerUtils'

function QuickAction({ href, disabled, children, external = false }) {
  if (disabled || !href) {
    return <button className="secondary" disabled>{children}</button>
  }

  return (
    <a
      href={href}
      className="secondary"
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      style={{ textDecoration: 'none' }}
    >
      {children}
    </a>
  )
}

function TimelineIcon({ type }) {
  const icons = {
    customer: '👤',
    property: '📍',
    lift: '⚙️',
    job: '🛠️',
    invoice: '🧾',
    payment: '💵',
  }
  return <span aria-hidden="true">{icons[type] || '•'}</span>
}

export default function CustomerDetail({
  customer,
  properties = [],
  boatLifts = [],
  jobs = [],
  invoices = [],
  onBack,
  onEditCustomer,
  onAddProperty,
  onEditProperty,
  onDeleteProperty,
}) {
  const customerProperties = properties.filter((x) => x.customer_id === customer.id)
  const customerLifts = boatLifts.filter((x) => x.customer_id === customer.id)
  const customerJobs = jobs.filter((x) => x.customer_id === customer.id)
  const customerInvoices = invoices.filter((x) => x.customer_id === customer.id)

  const financials = getCustomerFinancials(customer.id, invoices)
  const health = getCustomerHealth({ customer, invoices, jobs, boatLifts })
  const timeline = buildCustomerTimeline({
    customer,
    properties,
    boatLifts,
    jobs,
    invoices,
  })

  const serviceAddress =
    formatCustomerAddress(customer, 'service') ||
    formatCustomerAddress(customer, 'billing')

  const completedJobs = customerJobs.filter(
    (x) => String(x.status || '').toLowerCase() === 'completed'
  )

  const latestJob = [...customerJobs]
    .filter((x) => x.completed_at || x.scheduled_date || x.created_at)
    .sort((a, b) =>
      new Date(b.completed_at || b.scheduled_date || b.created_at) -
      new Date(a.completed_at || a.scheduled_date || a.created_at)
    )[0]

  return (
    <>
      <div className="toolbar">
        <button className="secondary" onClick={onBack}>← Back to Customers</button>
        <div className="actions">
          <button className="secondary" onClick={onAddProperty}>+ Property</button>
          <button className="primary" onClick={() => onEditCustomer(customer)}>Edit Customer</button>
        </div>
      </div>

      <section className="panel">
        <div className="between">
          <div>
            <h2>{getCustomerDisplayName(customer)}</h2>
            <div className="small">
              {customer.customer_number || 'No customer number'} · {customer.customer_type || 'residential'}
            </div>
          </div>
          <div className="actions">
            <Badge>{customer.status || 'active'}</Badge>
            <Badge>{health.label}</Badge>
          </div>
        </div>

        <div className="actions" style={{ marginTop: 18, flexWrap: 'wrap' }}>
          <QuickAction href={phoneHref(customer.primary_phone)} disabled={!customer.primary_phone}>
            ☎ Call
          </QuickAction>
          <QuickAction href={textHref(customer.primary_phone)} disabled={!customer.primary_phone}>
            💬 Text
          </QuickAction>
          <QuickAction href={emailHref(customer.email)} disabled={!customer.email}>
            ✉ Email
          </QuickAction>
          <QuickAction href={mapsHref(serviceAddress)} disabled={!serviceAddress} external>
            📍 Navigate
          </QuickAction>
          <button className="secondary" onClick={onAddProperty}>＋ Property</button>
          <button className="secondary" onClick={() => onEditCustomer(customer)}>✎ Edit</button>
        </div>

        <div className="grid-2" style={{ marginTop: 20 }}>
          <div>
            <h3>Contact</h3>
            <p><b>Primary Phone:</b> {formatPhone(customer.primary_phone) || '—'}</p>
            <p><b>Secondary Phone:</b> {formatPhone(customer.secondary_phone) || '—'}</p>
            <p><b>Email:</b> {customer.email || '—'}</p>
            <p><b>Preferred Contact:</b> {customer.preferred_contact_method || '—'}</p>
          </div>
          <div>
            <h3>Addresses</h3>
            <p><b>Billing:</b> {formatCustomerAddress(customer, 'billing') || '—'}</p>
            <p><b>Service:</b> {formatCustomerAddress(customer, 'service') || '—'}</p>
          </div>
        </div>

        <div className="grid-2">
          <div>
            <h3>Customer Notes</h3>
            <p>{customer.notes || 'No customer notes.'}</p>
          </div>
          <div>
            <h3>Internal Notes</h3>
            <p>{customer.internal_notes || 'No internal notes.'}</p>
          </div>
        </div>
      </section>

      <div className="metrics">
        <Metric label="Lifetime Revenue" value={formatMoney(financials.totalPaid)} />
        <Metric label="Outstanding Balance" value={formatMoney(financials.balance)} />
        <Metric label="Jobs Completed" value={completedJobs.length} />
        <Metric label="Average Invoice" value={formatMoney(financials.averageInvoice)} />
        <Metric label="Boat Lifts" value={customerLifts.length} />
        <Metric label="Last Service" value={formatDate(latestJob?.completed_at || latestJob?.scheduled_date)} />
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="between">
            <div>
              <h2>Customer Health</h2>
              <p className="small">{health.reason}</p>
            </div>
            <Badge>{health.label}</Badge>
          </div>

          <div className="grid-2">
            <div className="card">
              <b>Open Jobs</b>
              <div style={{ fontSize: 28, marginTop: 8 }}>
                {customerJobs.filter((x) =>
                  ['open', 'scheduled', 'pending', 'in_progress'].includes(
                    String(x.status || '').toLowerCase()
                  )
                ).length}
              </div>
            </div>

            <div className="card">
              <b>Open Invoices</b>
              <div style={{ fontSize: 28, marginTop: 8 }}>
                {customerInvoices.filter((x) => {
                  const total = Number(x.total || x.amount || 0)
                  const paid = Number(x.paid || x.amount_paid || 0)
                  return paid < total
                }).length}
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="between">
            <h2>Activity Timeline</h2>
            <span className="small">{timeline.length} events</span>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {timeline.slice(0, 12).map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '34px 1fr auto',
                  gap: 10,
                  alignItems: 'start',
                  borderBottom: '1px solid #e5e7eb',
                  paddingBottom: 12,
                }}
              >
                <div style={{ fontSize: 20 }}><TimelineIcon type={item.type} /></div>
                <div>
                  <b>{item.title}</b>
                  <div className="small">{item.description}</div>
                </div>
                <div className="small">{formatDate(item.date)}</div>
              </div>
            ))}
            {!timeline.length && <Empty>No customer activity yet</Empty>}
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="between">
            <h2>Properties</h2>
            <button className="primary" onClick={onAddProperty}>+ Add Property</button>
          </div>

          <div className="cards">
            {customerProperties.map((property) => (
              <article className="card" key={property.id}>
                <div className="between">
                  <div>
                    <h3>{property.name || formatPropertyAddress(property)}</h3>
                    {property.name && <div className="small">{formatPropertyAddress(property)}</div>}
                  </div>
                  {formatPropertyAddress(property) && (
                    <a
                      className="secondary"
                      href={mapsHref(formatPropertyAddress(property))}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textDecoration: 'none' }}
                    >
                      Navigate
                    </a>
                  )}
                </div>
                <p><b>Gate Code:</b> {property.gate_code || '—'}</p>
                <p><b>Dock:</b> {property.dock_details || '—'}</p>
                <p>{property.notes || ''}</p>
                <div className="actions">
                  <button className="secondary" onClick={() => onEditProperty(property)}>Edit</button>
                  <button className="danger" onClick={() => onDeleteProperty(property)}>Delete</button>
                </div>
              </article>
            ))}
            {!customerProperties.length && <Empty>No properties added</Empty>}
          </div>
        </section>

        <section className="panel">
          <h2>Boat Lifts</h2>
          <div className="cards">
            {customerLifts.map((lift) => (
              <article className="card" key={lift.id}>
                <div className="between">
                  <h3>{lift.lift_number || lift.name || 'Boat Lift'}</h3>
                  <Badge>{lift.status || 'Active'}</Badge>
                </div>
                <p><b>Equipment:</b> {[lift.manufacturer, lift.model].filter(Boolean).join(' · ') || '—'}</p>
                <p><b>Capacity:</b> {lift.capacity ? `${Number(lift.capacity).toLocaleString()} lb` : '—'}</p>
                <p><b>Installed:</b> {formatDate(lift.install_date || lift.created_at)}</p>
                <p><b>Warranty:</b> {formatDate(lift.warranty_expires_at || lift.warranty_expiration)}</p>
                <p><b>Last Service:</b> {formatDate(lift.last_service_at || lift.service_date)}</p>
              </article>
            ))}
            {!customerLifts.length && <Empty>No boat lifts linked</Empty>}
          </div>
        </section>

        <section className="panel">
          <h2>Jobs</h2>
          <div className="cards">
            {customerJobs.map((job) => (
              <article className="card" key={job.id}>
                <div className="between">
                  <h3>{job.job_number || job.number || job.title || 'Job'}</h3>
                  <Badge>{job.status || 'Open'}</Badge>
                </div>
                <p>{job.scope || job.description || 'No job description.'}</p>
                <p><b>Scheduled:</b> {formatDate(job.scheduled_date)}</p>
                <p><b>Completed:</b> {formatDate(job.completed_at)}</p>
              </article>
            ))}
            {!customerJobs.length && <Empty>No jobs linked</Empty>}
          </div>
        </section>

        <section className="panel">
          <h2>Invoices</h2>
          <div className="cards">
            {customerInvoices.map((invoice) => {
              const total = Number(invoice.total || invoice.amount || 0)
              const paid = Number(invoice.paid || invoice.amount_paid || 0)

              return (
                <article className="card" key={invoice.id}>
                  <div className="between">
                    <h3>{invoice.invoice_number || invoice.number || 'Invoice'}</h3>
                    <Badge>{invoice.status || (paid >= total && total > 0 ? 'Paid' : 'Open')}</Badge>
                  </div>
                  <p><b>Total:</b> {formatMoney(total)}</p>
                  <p><b>Paid:</b> {formatMoney(paid)}</p>
                  <p><b>Balance:</b> {formatMoney(total - paid)}</p>
                  <p><b>Due:</b> {formatDate(invoice.due_date)}</p>
                </article>
              )
            })}
            {!customerInvoices.length && <Empty>No invoices linked</Empty>}
          </div>
        </section>
      </div>
    </>
  )
}
