import React, { useMemo, useState } from 'react'
import { Badge, Empty, Metric } from '../../components/UI'
import {
  LIFT_STATUSES,
  filterBoatLifts,
  formatCapacity,
  formatDate,
  getCustomerName,
  getLiftDisplayName,
  getLiftHealth,
  getPropertyName,
} from './boatLiftUtils'

export default function BoatLiftDashboard({
  lifts = [],
  customers = [],
  properties = [],
  onOpenLift,
  onAddLift,
  onEditLift,
}) {
  const [filters, setFilters] = useState({
    search: '',
    status: 'all',
    customerId: 'all',
  })

  const filtered = useMemo(
    () => filterBoatLifts(lifts, customers, properties, filters),
    [lifts, customers, properties, filters]
  )

  const active = lifts.filter((lift) => lift.status === 'active').length
  const due = lifts.filter((lift) => getLiftHealth(lift).label.includes('Service')).length
  const out = lifts.filter((lift) => lift.status === 'out_of_service').length

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search lifts, serial numbers, customers..."
          value={filters.search}
          onChange={(event) =>
            setFilters((current) => ({ ...current, search: event.target.value }))
          }
          style={{
            width: 'min(520px, 100%)',
            padding: 12,
            borderRadius: 10,
            border: '1px solid #d6d9df',
          }}
        />

        <div className="actions">
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value }))
            }
          >
            <option value="all">All statuses</option>
            {LIFT_STATUSES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>

          <select
            value={filters.customerId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, customerId: event.target.value }))
            }
          >
            <option value="all">All customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {getCustomerName(customer)}
              </option>
            ))}
          </select>

          <button className="primary" onClick={onAddLift}>+ Boat Lift</button>
        </div>
      </div>

      <div className="metrics">
        <Metric label="Total Lifts" value={lifts.length} />
        <Metric label="Active" value={active} />
        <Metric label="Service Due" value={due} />
        <Metric label="Out of Service" value={out} />
      </div>

      <div className="cards">
        {filtered.map((lift) => {
          const customer = customers.find((item) => item.id === lift.customer_id)
          const property = properties.find((item) => item.id === lift.property_id)
          const health = getLiftHealth(lift)

          return (
            <article className="card" key={lift.id}>
              <div className="between">
                <div>
                  <h3>{getLiftDisplayName(lift)}</h3>
                  <div className="small">
                    {[lift.manufacturer, lift.model].filter(Boolean).join(' · ') || 'No equipment details'}
                  </div>
                </div>
                <div className="actions">
                  <Badge>{lift.status || 'active'}</Badge>
                  <Badge>{health.label}</Badge>
                </div>
              </div>

              <p><b>Customer:</b> {getCustomerName(customer)}</p>
              <p><b>Property:</b> {getPropertyName(property)}</p>
              <p><b>Capacity:</b> {formatCapacity(lift.capacity)}</p>
              <p><b>Installed:</b> {formatDate(lift.install_date)}</p>
              <p><b>Next Service:</b> {formatDate(lift.next_service_at)}</p>

              <div className="actions">
                <button className="primary" onClick={() => onOpenLift(lift.id)}>Open</button>
                <button className="secondary" onClick={() => onEditLift(lift)}>Edit</button>
              </div>
            </article>
          )
        })}

        {!filtered.length && <Empty>No boat lifts found</Empty>}
      </div>
    </>
  )
}
