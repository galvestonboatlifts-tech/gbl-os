import React, { useMemo, useState } from 'react'

import { Field, Modal, SelectField } from '../../components/UI'
import {
  EMPTY_ESTIMATE,
  EMPTY_LINE_ITEM,
  ESTIMATE_STATUS_OPTIONS,
  calculateEstimateTotals,
  createId,
  customerName,
  employeeName,
  formatCurrency,
  normalizeLineItem,
} from './estimateUtils'

const CATEGORY_OPTIONS = [
  'Material',
  'Labor',
  'Equipment',
  'Subcontractor',
  'Permit',
  'Freight',
  'Other',
]

export default function EstimateEditor({
  initial,
  customers,
  employees,
  saving,
  onClose,
  onSave,
}) {
  const [values, setValues] = useState({ ...EMPTY_ESTIMATE, ...initial })
  const [lineItems, setLineItems] = useState(
    (initial.line_items || []).map(normalizeLineItem)
  )

  const totals = useMemo(
    () => calculateEstimateTotals(values, lineItems),
    [lineItems, values]
  )

  const setValue = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))

  const updateLine = (id, key, value) => {
    setLineItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [key]: value } : item))
    )
  }

  const addLine = () => {
    setLineItems((current) => [
      ...current,
      {
        ...EMPTY_LINE_ITEM,
        id: createId(),
        sort_order: current.length,
      },
    ])
  }

  const duplicateLine = (line) => {
    setLineItems((current) => [
      ...current,
      {
        ...line,
        id: createId(),
        sort_order: current.length,
      },
    ])
  }

  const deleteLine = (id) => {
    setLineItems((current) => current.filter((item) => item.id !== id))
  }

  const moveLine = (index, direction) => {
    setLineItems((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const copy = [...current]
      const [item] = copy.splice(index, 1)
      copy.splice(target, 0, item)
      return copy.map((row, sort_order) => ({ ...row, sort_order }))
    })
  }

  return (
    <Modal
      title={initial.id ? 'Edit Estimate' : 'Create Estimate'}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSave(values, lineItems)
        }}
      >
        <section className="panel">
          <h3>Estimate Information</h3>
          <div className="form-grid">
            <Field
              label="Estimate Number"
              value={values.estimate_number}
              onChange={(value) => setValue('estimate_number', value)}
              required
            />

            <SelectField
              label="Customer"
              value={values.customer_id || ''}
              onChange={(value) => setValue('customer_id', value)}
              options={[
                ['', 'Select customer'],
                ...customers.map((customer) => [
                  customer.id,
                  customerName(customer),
                ]),
              ]}
            />

            <Field
              label="Title"
              value={values.title}
              onChange={(value) => setValue('title', value)}
              required
            />

            <SelectField
              label="Status"
              value={values.status}
              onChange={(value) => setValue('status', value)}
              options={ESTIMATE_STATUS_OPTIONS.map((item) => [item, item])}
            />

            <Field
              label="Issue Date"
              type="date"
              value={values.issue_date || ''}
              onChange={(value) => setValue('issue_date', value)}
            />

            <Field
              label="Expiration Date"
              type="date"
              value={values.expiration_date || ''}
              onChange={(value) => setValue('expiration_date', value)}
            />

            <SelectField
              label="Salesperson"
              value={values.salesperson_id || ''}
              onChange={(value) => setValue('salesperson_id', value)}
              options={[
                ['', 'Unassigned'],
                ...employees.map((employee) => [
                  employee.id,
                  employeeName(employee),
                ]),
              ]}
            />
          </div>
        </section>

        <section className="panel">
          <h3>Project Location</h3>
          <div className="form-grid">
            <Field
              label="Address"
              value={values.project_address}
              onChange={(value) => setValue('project_address', value)}
            />
            <Field
              label="City"
              value={values.project_city}
              onChange={(value) => setValue('project_city', value)}
            />
            <Field
              label="State"
              value={values.project_state}
              onChange={(value) => setValue('project_state', value)}
            />
            <Field
              label="ZIP Code"
              value={values.project_postal_code}
              onChange={(value) => setValue('project_postal_code', value)}
            />
          </div>
        </section>

        <section className="panel">
          <div className="between">
            <h3>Line Items</h3>
            <button type="button" className="primary" onClick={addLine}>
              + Line Item
            </button>
          </div>

          <div className="cards">
            {lineItems.map((line, index) => {
              const quantity = Number(line.quantity || 0)
              const cost = quantity * Number(line.unit_cost || 0)
              const price = quantity * Number(line.unit_price || 0)

              return (
                <article className="card" key={line.id}>
                  <div className="between">
                    <strong>Item {index + 1}</strong>
                    <div className="actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => moveLine(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => moveLine(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => duplicateLine(line)}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => deleteLine(line.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="form-grid">
                    <SelectField
                      label="Category"
                      value={line.category}
                      onChange={(value) => updateLine(line.id, 'category', value)}
                      options={CATEGORY_OPTIONS.map((item) => [item, item])}
                    />

                    <Field
                      label="Description"
                      value={line.description}
                      onChange={(value) =>
                        updateLine(line.id, 'description', value)
                      }
                      required
                    />

                    <Field
                      label="Quantity"
                      type="number"
                      value={line.quantity}
                      onChange={(value) => updateLine(line.id, 'quantity', value)}
                    />

                    <Field
                      label="Unit"
                      value={line.unit}
                      onChange={(value) => updateLine(line.id, 'unit', value)}
                    />

                    <Field
                      label="Unit Cost"
                      type="number"
                      value={line.unit_cost}
                      onChange={(value) => updateLine(line.id, 'unit_cost', value)}
                    />

                    <Field
                      label="Unit Price"
                      type="number"
                      value={line.unit_price}
                      onChange={(value) => updateLine(line.id, 'unit_price', value)}
                    />

                    <SelectField
                      label="Taxable"
                      value={line.taxable ? 'yes' : 'no'}
                      onChange={(value) =>
                        updateLine(line.id, 'taxable', value === 'yes')
                      }
                      options={[
                        ['yes', 'Yes'],
                        ['no', 'No'],
                      ]}
                    />
                  </div>

                  <p>
                    <b>Cost:</b> {formatCurrency(cost)} · <b>Price:</b>{' '}
                    {formatCurrency(price)} · <b>Gross Profit:</b>{' '}
                    {formatCurrency(price - cost)}
                  </p>
                </article>
              )
            })}

            {!lineItems.length && (
              <div className="empty">
                No line items. Add at least one item before saving.
              </div>
            )}
          </div>
        </section>

        <section className="panel">
          <h3>Pricing</h3>
          <div className="form-grid">
            <Field
              label="Tax Rate (%)"
              type="number"
              value={values.tax_rate}
              onChange={(value) => setValue('tax_rate', value)}
            />

            <SelectField
              label="Discount Type"
              value={values.discount_type}
              onChange={(value) => setValue('discount_type', value)}
              options={[
                ['amount', 'Dollar Amount'],
                ['percent', 'Percentage'],
              ]}
            />

            <Field
              label="Discount Value"
              type="number"
              value={values.discount_value}
              onChange={(value) => setValue('discount_value', value)}
            />

            <SelectField
              label="Deposit Type"
              value={values.deposit_type}
              onChange={(value) => setValue('deposit_type', value)}
              options={[
                ['percent', 'Percentage'],
                ['amount', 'Dollar Amount'],
              ]}
            />

            <Field
              label="Deposit Value"
              type="number"
              value={values.deposit_value}
              onChange={(value) => setValue('deposit_value', value)}
            />
          </div>

          <div className="metrics">
            <div className="metric">
              <span>Cost</span>
              <strong>{formatCurrency(totals.costTotal)}</strong>
            </div>
            <div className="metric">
              <span>Subtotal</span>
              <strong>{formatCurrency(totals.subtotal)}</strong>
            </div>
            <div className="metric">
              <span>Discount</span>
              <strong>{formatCurrency(totals.discount)}</strong>
            </div>
            <div className="metric">
              <span>Tax</span>
              <strong>{formatCurrency(totals.tax)}</strong>
            </div>
            <div className="metric">
              <span>Total</span>
              <strong>{formatCurrency(totals.total)}</strong>
            </div>
            <div className="metric">
              <span>Margin</span>
              <strong>{totals.margin.toFixed(1)}%</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <h3>Notes & Terms</h3>
          <div className="form-grid">
            <Field
              label="Customer Notes"
              value={values.notes}
              onChange={(value) => setValue('notes', value)}
              multiline
            />
            <Field
              label="Terms"
              value={values.terms}
              onChange={(value) => setValue('terms', value)}
              multiline
            />
            <Field
              label="Internal Notes"
              value={values.internal_notes}
              onChange={(value) => setValue('internal_notes', value)}
              multiline
            />
          </div>
        </section>

        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={saving || !lineItems.length}>
            {saving ? 'Saving...' : 'Save Estimate'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
