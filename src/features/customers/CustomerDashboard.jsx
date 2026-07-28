import React, { useMemo, useState } from 'react'
import { Badge, Empty, Metric } from '../../components/UI'
import {
  CUSTOMER_STATUSES,
  CUSTOMER_TYPES,
  filterCustomers,
  formatMoney,
  formatPhone,
  getCustomerDisplayName,
  getCustomerFinancials,
  getCustomerHealth,
  getCustomerInitials,
} from './customerUtils'

export default function CustomerDashboard({
  customers = [],
  properties = [],
  boatLifts = [],
  jobs = [],
  invoices = [],
  onOpenCustomer,
  onAddCustomer,
  onEditCustomer,
}) {
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    type: 'all',
  })

  const filtered = useMemo(
    () => filterCustomers(customers, filters),
    [customers, filters]
  )

  const activeCount = customers.filter((x) => x.status === 'active').length
  const leadCount = customers.filter((x) => x.status === 'lead').length
  const totalOutstanding = invoices.reduce((sum, x) => {
    return sum + Number(x.total || x.amount || 0) - Number(x.paid || x.amount_paid || 0)
  }, 0)

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search customers, phone, email, address..."
          value={filters.search}
          onChange={(event) => setFilters((old) => ({ ...old, search: event.target.value }))}
          style={{ width: 'min(520px, 100%)', padding: 12, borderRadius: 10, border: '1px solid #d6d9df' }}
        />

        <div className="actions">
          <select value={filters.status} onChange={(e) => setFilters((old) => ({ ...old, status: e.target.value }))}>
            <option value="all">All statuses</option>
            {CUSTOMER_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>

          <select value={filters.type} onChange={(e) => setFilters((old) => ({ ...old, type: e.target.value }))}>
            <option value="all">All types</option>
            {CUSTOMER_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>

          <button className="primary" onClick={onAddCustomer}>+ Customer</button>
        </div>
      </div>

      <div className="metrics">
        <Metric label="Total Customers" value={customers.length} />
        <Metric label="Active" value={activeCount} />
        <Metric label="Leads" value={leadCount} />
        <Metric label="Outstanding" value={formatMoney(totalOutstanding)} />
      </div>

      <div className="cards">
        {filtered.map((customer) => {
          const propertyCount = properties.filter((x) => x.customer_id === customer.id).length
          const liftCount = boatLifts.filter((x) => x.customer_id === customer.id).length
          const jobCount = jobs.filter((x) => x.customer_id === customer.id).length
          const financials = getCustomerFinancials(customer.id, invoices)
          const health = getCustomerHealth({ customer, invoices, jobs, boatLifts })

          return (
            <article className="card" key={customer.id}>
              <div className="between">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="avatar">{getCustomerInitials(customer)}</div>
                  <div>
                    <h3>{getCustomerDisplayName(customer)}</h3>
                    <div className="small">{customer.customer_number || customer.email || 'No customer number'}</div>
                  </div>
                </div>
                <div className="actions">
                  <Badge>{customer.status || 'active'}</Badge>
                  <Badge>{health.label}</Badge>
                </div>
              </div>

              <p><b>Phone:</b> {formatPhone(customer.primary_phone) || '—'}</p>
              <p><b>Properties:</b> {propertyCount} · <b>Lifts:</b> {liftCount} · <b>Jobs:</b> {jobCount}</p>
              <p><b>Lifetime Revenue:</b> {formatMoney(financials.totalPaid)}</p>
              <p><b>Balance Due:</b> {formatMoney(financials.balance)}</p>

              <div className="actions">
                <button className="primary" onClick={() => onOpenCustomer(customer.id)}>Open</button>
                <button className="secondary" onClick={() => onEditCustomer(customer)}>Edit</button>
              </div>
            </article>
          )
        })}

        {!filtered.length && <Empty>No customers found</Empty>}
      </div>
    </>
  )
}
