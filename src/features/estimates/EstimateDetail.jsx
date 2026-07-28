import React, { useMemo, useState } from 'react'

import { Badge, Empty, Modal } from '../../components/UI'
import {
  calculateEstimateTotals,
  customerName,
  employeeName,
  formatCurrency,
  formatDate,
} from './estimateUtils'

export default function EstimateDetail({
  estimate,
  customers,
  employees,
  versions,
  saving,
  onBack,
  onEdit,
  onDelete,
  onDuplicate,
  onStatusChange,
  onCreateVersion,
  onConvertToJob,
}) {
  const [showVersionModal, setShowVersionModal] = useState(false)
  const [versionNotes, setVersionNotes] = useState('')
  const [tab, setTab] = useState('overview')

  const customer = customers.find((item) => item.id === estimate.customer_id)
  const salesperson = employees.find((item) => item.id === estimate.salesperson_id)
  const totals = useMemo(
    () => calculateEstimateTotals(estimate, estimate.line_items || []),
    [estimate]
  )

  return (
    <>
      <div className="toolbar">
        <button className="secondary" onClick={onBack}>
          ← Back to Estimates
        </button>

        <div className="actions">
          <button className="secondary" onClick={onDuplicate}>
            Duplicate
          </button>
          <button className="secondary" onClick={() => setShowVersionModal(true)}>
            Save Version
          </button>
          <button className="primary" onClick={onEdit}>
            Edit
          </button>
          <button className="danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <section className="panel">
        <div className="between">
          <div>
            <h2>{estimate.title || 'Untitled Estimate'}</h2>
            <div className="small">
              {estimate.estimate_number || 'No estimate number'} ·{' '}
              {customerName(customer)}
            </div>
          </div>
          <Badge>{estimate.status || 'Draft'}</Badge>
        </div>

        <div className="metrics">
          <div className="metric">
            <span>Total</span>
            <strong>{formatCurrency(totals.total)}</strong>
          </div>
          <div className="metric">
            <span>Estimated Cost</span>
            <strong>{formatCurrency(totals.costTotal)}</strong>
          </div>
          <div className="metric">
            <span>Gross Profit</span>
            <strong>{formatCurrency(totals.profit)}</strong>
          </div>
          <div className="metric">
            <span>Margin</span>
            <strong>{totals.margin.toFixed(1)}%</strong>
          </div>
          <div className="metric">
            <span>Deposit</span>
            <strong>{formatCurrency(totals.deposit)}</strong>
          </div>
          <div className="metric">
            <span>Balance</span>
            <strong>{formatCurrency(totals.balance)}</strong>
          </div>
        </div>
      </section>

      <div className="tabs">
        {[
          ['overview', 'Overview'],
          ['items', 'Line Items'],
          ['versions', 'Versions'],
          ['actions', 'Actions'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? 'active' : ''}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="grid-2">
            <section className="panel">
              <h3>Estimate Information</h3>
              <p><b>Customer:</b> {customerName(customer)}</p>
              <p><b>Salesperson:</b> {salesperson ? employeeName(salesperson) : 'Unassigned'}</p>
              <p><b>Issue Date:</b> {formatDate(estimate.issue_date)}</p>
              <p><b>Expiration Date:</b> {formatDate(estimate.expiration_date)}</p>
              <p><b>Status:</b> {estimate.status || 'Draft'}</p>
            </section>

            <section className="panel">
              <h3>Project Address</h3>
              <p>
                {[
                  estimate.project_address,
                  estimate.project_city,
                  estimate.project_state,
                  estimate.project_postal_code,
                ]
                  .filter(Boolean)
                  .join(', ') || 'No project address entered.'}
              </p>
            </section>
          </div>

          <div className="grid-2">
            <section className="panel">
              <h3>Customer Notes</h3>
              <p>{estimate.notes || 'No customer notes.'}</p>
            </section>

            <section className="panel">
              <h3>Terms</h3>
              <p>{estimate.terms || 'No terms entered.'}</p>
            </section>
          </div>

          <section className="panel">
            <h3>Internal Notes</h3>
            <p>{estimate.internal_notes || 'No internal notes.'}</p>
          </section>
        </>
      )}

      {tab === 'items' && (
        <section className="panel">
          <h3>Line Items</h3>
          <div className="cards">
            {(estimate.line_items || []).map((item, index) => {
              const quantity = Number(item.quantity || 0)
              const cost = quantity * Number(item.unit_cost || 0)
              const price = quantity * Number(item.unit_price || 0)

              return (
                <article className="card" key={item.id || index}>
                  <div className="between">
                    <div>
                      <h3>{item.description || `Item ${index + 1}`}</h3>
                      <div className="small">
                        {item.category || 'Other'} · {quantity} {item.unit || 'each'}
                      </div>
                    </div>
                    <strong>{formatCurrency(price)}</strong>
                  </div>
                  <p><b>Unit Cost:</b> {formatCurrency(item.unit_cost)}</p>
                  <p><b>Unit Price:</b> {formatCurrency(item.unit_price)}</p>
                  <p><b>Total Cost:</b> {formatCurrency(cost)}</p>
                  <p><b>Gross Profit:</b> {formatCurrency(price - cost)}</p>
                  <p><b>Taxable:</b> {item.taxable === false ? 'No' : 'Yes'}</p>
                </article>
              )
            })}

            {!(estimate.line_items || []).length && <Empty>No line items</Empty>}
          </div>

          <div className="grid-2">
            <section className="panel">
              <h3>Pricing Summary</h3>
              <p><b>Subtotal:</b> {formatCurrency(totals.subtotal)}</p>
              <p><b>Discount:</b> {formatCurrency(totals.discount)}</p>
              <p><b>Tax:</b> {formatCurrency(totals.tax)}</p>
              <p><b>Total:</b> {formatCurrency(totals.total)}</p>
            </section>

            <section className="panel">
              <h3>Profitability</h3>
              <p><b>Estimated Cost:</b> {formatCurrency(totals.costTotal)}</p>
              <p><b>Gross Profit:</b> {formatCurrency(totals.profit)}</p>
              <p><b>Margin:</b> {totals.margin.toFixed(1)}%</p>
            </section>
          </div>
        </section>
      )}

      {tab === 'versions' && (
        <section className="panel">
          <h3>Version History</h3>
          <div className="cards">
            {versions.map((version) => (
              <article className="card" key={version.id}>
                <div className="between">
                  <h3>Version {version.version_number || '—'}</h3>
                  <Badge>{formatDate(version.created_at)}</Badge>
                </div>
                <p>{version.notes || 'No version notes.'}</p>
                <p><b>Total:</b> {formatCurrency(version.total)}</p>
                <p><b>Status:</b> {version.status || 'Draft'}</p>
              </article>
            ))}

            {!versions.length && <Empty>No versions saved</Empty>}
          </div>
        </section>
      )}

      {tab === 'actions' && (
        <section className="panel">
          <h3>Estimate Actions</h3>
          <div className="actions">
            {['Draft', 'Sent', 'Viewed', 'Approved', 'Rejected', 'Expired'].map(
              (status) => (
                <button
                  key={status}
                  className={status === estimate.status ? 'primary' : 'secondary'}
                  onClick={() => onStatusChange(status)}
                  disabled={saving}
                >
                  Mark {status}
                </button>
              )
            )}
          </div>

          <hr />

          <div className="actions">
            <button
              className="primary"
              onClick={onConvertToJob}
              disabled={saving || estimate.status === 'Converted'}
            >
              Convert to Job
            </button>
          </div>
        </section>
      )}

      {showVersionModal && (
        <Modal title="Save Estimate Version" onClose={() => setShowVersionModal(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              onCreateVersion(versionNotes)
              setVersionNotes('')
              setShowVersionModal(false)
            }}
          >
            <label>
              Version Notes
              <textarea
                value={versionNotes}
                onChange={(event) => setVersionNotes(event.target.value)}
                placeholder="Describe what changed in this version."
              />
            </label>

            <div className="actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowVersionModal(false)}
              >
                Cancel
              </button>
              <button className="primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Version'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
