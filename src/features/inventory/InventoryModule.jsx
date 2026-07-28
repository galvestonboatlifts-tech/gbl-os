import React, { useCallback, useEffect, useMemo, useState } from 'react'

import {
  Badge,
  Empty,
  Field,
  Modal,
  SelectField,
} from '../../components/UI'

import { supabase } from '../../lib/supabase'

const CATEGORY_OPTIONS = [
  'Cable',
  'Motor',
  'Switch',
  'Gearbox',
  'Pulley',
  'Bearing',
  'Fastener',
  'Electrical',
  'Structural',
  'Hardware',
  'Safety',
  'Consumable',
  'Other',
]

const UNIT_OPTIONS = [
  'Each',
  'Box',
  'Pack',
  'Foot',
  'Pair',
  'Set',
  'Gallon',
  'Pound',
  'Roll',
]

const EMPTY_ITEM = {
  sku: '',
  name: '',
  category: 'Hardware',
  description: '',
  quantity_on_hand: 0,
  reorder_level: 0,
  unit: 'Each',
  unit_cost: '',
  sale_price: '',
  supplier: '',
  supplier_part_number: '',
  location: '',
  active: true,
  notes: '',
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatCurrency(value) {
  const number = Number(value)

  if (!Number.isFinite(number)) {
    return '—'
  }

  return number.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function getMissingColumn(error) {
  const message = String(error?.message || '')

  const patterns = [
    /column ["']?([^"' ]+)["']? of relation/i,
    /Could not find the ['"]([^'"]+)['"] column/i,
    /column ([a-zA-Z0-9_]+) does not exist/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)

    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

async function adaptiveUpsert(table, payload, conflictColumn = 'id') {
  let workingPayload = { ...payload }
  const removedColumns = []

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await supabase
      .from(table)
      .upsert(workingPayload, {
        onConflict: conflictColumn,
      })
      .select()
      .single()

    if (!result.error) {
      return {
        data: result.data,
        error: null,
        removedColumns,
      }
    }

    const missingColumn = getMissingColumn(result.error)

    if (!missingColumn || !(missingColumn in workingPayload)) {
      return {
        data: null,
        error: result.error,
        removedColumns,
      }
    }

    delete workingPayload[missingColumn]
    removedColumns.push(missingColumn)
  }

  return {
    data: null,
    error: new Error(`Unable to save ${table}.`),
    removedColumns,
  }
}

function stockStatus(item) {
  const quantity = toNumber(item.quantity_on_hand)
  const reorder = toNumber(item.reorder_level)

  if (!item.active) {
    return 'Inactive'
  }

  if (quantity <= 0) {
    return 'Out of Stock'
  }

  if (quantity <= reorder) {
    return 'Low Stock'
  }

  return 'In Stock'
}

export default function InventoryModule() {
  const [items, setItems] = useState([])
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [editingItem, setEditingItem] = useState(null)
  const [adjustingItem, setAdjustingItem] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    const [itemsResult, transactionsResult] = await Promise.all([
      supabase
        .from('inventory_items')
        .select('*')
        .order('name', { ascending: true }),

      supabase
        .from('inventory_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    if (itemsResult.error) {
      console.error(itemsResult.error)
      setErrorMessage(itemsResult.error.message)
    }

    if (transactionsResult.error) {
      console.error(transactionsResult.error)
    }

    setItems(Array.isArray(itemsResult.data) ? itemsResult.data : [])
    setTransactions(
      Array.isArray(transactionsResult.data)
        ? transactionsResult.data
        : []
    )

    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()

    return items.filter((item) => {
      if (categoryFilter && item.category !== categoryFilter) {
        return false
      }

      if (statusFilter && stockStatus(item) !== statusFilter) {
        return false
      }

      if (!query) {
        return true
      }

      const values = [
        item.sku,
        item.name,
        item.category,
        item.description,
        item.supplier,
        item.supplier_part_number,
        item.location,
        item.notes,
      ]

      return values
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(query)
        )
    })
  }, [items, search, categoryFilter, statusFilter])

  const metrics = useMemo(() => {
    const activeItems = items.filter((item) => item.active !== false)
    const totalValue = activeItems.reduce((sum, item) => {
      return (
        sum +
        toNumber(item.quantity_on_hand) *
          toNumber(item.unit_cost)
      )
    }, 0)

    return {
      total: items.length,
      lowStock: items.filter(
        (item) => stockStatus(item) === 'Low Stock'
      ).length,
      outOfStock: items.filter(
        (item) => stockStatus(item) === 'Out of Stock'
      ).length,
      inventoryValue: totalValue,
    }
  }, [items])

  async function saveItem(values) {
    if (!values.name.trim()) {
      alert('Enter an item name.')
      return false
    }

    setSaving(true)
    setErrorMessage('')

    const { data: authData, error: authError } =
      await supabase.auth.getUser()

    if (authError) {
      setSaving(false)
      alert(authError.message)
      return false
    }

    const payload = {
      id: values.id || createId(),
      user_id: authData.user?.id || null,
      sku: normalizeText(values.sku),
      name: values.name.trim(),
      category: values.category || 'Other',
      description: normalizeText(values.description),
      quantity_on_hand: toNumber(values.quantity_on_hand),
      reorder_level: toNumber(values.reorder_level),
      unit: values.unit || 'Each',
      unit_cost:
        values.unit_cost === ''
          ? null
          : toNumber(values.unit_cost),
      sale_price:
        values.sale_price === ''
          ? null
          : toNumber(values.sale_price),
      supplier: normalizeText(values.supplier),
      supplier_part_number: normalizeText(
        values.supplier_part_number
      ),
      location: normalizeText(values.location),
      active: Boolean(values.active),
      notes: normalizeText(values.notes),
    }

    const result = await adaptiveUpsert(
      'inventory_items',
      payload
    )

    setSaving(false)

    if (result.error) {
      console.error(result.error)
      setErrorMessage(result.error.message)
      alert(result.error.message)
      return false
    }

    setItems((current) => {
      const exists = current.some(
        (item) => item.id === result.data.id
      )

      if (!exists) {
        return [...current, result.data].sort((a, b) =>
          String(a.name || '').localeCompare(
            String(b.name || '')
          )
        )
      }

      return current.map((item) =>
        item.id === result.data.id ? result.data : item
      )
    })

    setEditingItem(null)
    return true
  }

  async function deleteItem(item) {
    const confirmed = window.confirm(
      `Delete ${item.name}?`
    )

    if (!confirmed) {
      return
    }

    const { error } = await supabase
      .from('inventory_items')
      .delete()
      .eq('id', item.id)

    if (error) {
      alert(error.message)
      return
    }

    setItems((current) =>
      current.filter((record) => record.id !== item.id)
    )
  }

  async function adjustInventory(values) {
    const item = adjustingItem

    if (!item) {
      return false
    }

    const amount = toNumber(values.amount)
    const currentQuantity = toNumber(item.quantity_on_hand)

    let newQuantity = currentQuantity

    if (values.type === 'Add') {
      newQuantity = currentQuantity + amount
    } else if (values.type === 'Remove') {
      newQuantity = Math.max(0, currentQuantity - amount)
    } else {
      newQuantity = Math.max(0, amount)
    }

    setSaving(true)

    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ quantity_on_hand: newQuantity })
      .eq('id', item.id)

    if (updateError) {
      setSaving(false)
      alert(updateError.message)
      return false
    }

    const transactionPayload = {
      id: createId(),
      inventory_item_id: item.id,
      transaction_type: values.type,
      quantity: amount,
      previous_quantity: currentQuantity,
      new_quantity: newQuantity,
      reason: normalizeText(values.reason),
      notes: normalizeText(values.notes),
    }

    const transactionResult = await adaptiveUpsert(
      'inventory_transactions',
      transactionPayload
    )

    if (transactionResult.error) {
      console.warn(
        'Inventory quantity updated, but transaction log failed:',
        transactionResult.error
      )
    }

    setItems((current) =>
      current.map((record) =>
        record.id === item.id
          ? {
              ...record,
              quantity_on_hand: newQuantity,
            }
          : record
      )
    )

    if (transactionResult.data) {
      setTransactions((current) => [
        transactionResult.data,
        ...current,
      ])
    }

    setSaving(false)
    setAdjustingItem(null)
    return true
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Inventory</h2>
        <p>Loading inventory...</p>
      </section>
    )
  }

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search inventory..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{
            width: 'min(520px, 100%)',
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid #d6d9df',
            font: 'inherit',
          }}
        />

        <div className="actions">
          <SelectField
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              ['', 'All categories'],
              ...CATEGORY_OPTIONS.map((category) => [
                category,
                category,
              ]),
            ]}
          />

          <SelectField
            label="Stock Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ['', 'All statuses'],
              ['In Stock', 'In Stock'],
              ['Low Stock', 'Low Stock'],
              ['Out of Stock', 'Out of Stock'],
              ['Inactive', 'Inactive'],
            ]}
          />

          <button
            className="primary"
            onClick={() =>
              setEditingItem({
                ...EMPTY_ITEM,
              })
            }
          >
            + Inventory Item
          </button>
        </div>
      </div>

      {errorMessage && (
        <section className="panel">
          <strong>Inventory error:</strong>
          <p>{errorMessage}</p>

          <button
            className="secondary"
            onClick={loadData}
          >
            Try Again
          </button>
        </section>
      )}

      <div className="metrics">
        <div className="metric">
          <span>Total Items</span>
          <strong>{metrics.total}</strong>
        </div>

        <div className="metric">
          <span>Low Stock</span>
          <strong>{metrics.lowStock}</strong>
        </div>

        <div className="metric">
          <span>Out of Stock</span>
          <strong>{metrics.outOfStock}</strong>
        </div>

        <div className="metric">
          <span>Inventory Value</span>
          <strong>
            {formatCurrency(metrics.inventoryValue)}
          </strong>
        </div>
      </div>

      <div className="cards">
        {filteredItems.map((item) => {
          const status = stockStatus(item)
          const quantity = toNumber(item.quantity_on_hand)

          return (
            <article className="card" key={item.id}>
              <div className="between">
                <div>
                  <h3>{item.name}</h3>

                  <div className="small">
                    {item.sku || 'No SKU'} ·{' '}
                    {item.category || 'Other'}
                  </div>
                </div>

                <Badge>{status}</Badge>
              </div>

              <p>
                <b>Quantity:</b> {quantity}{' '}
                {item.unit || 'Each'}
              </p>

              <p>
                <b>Reorder Level:</b>{' '}
                {toNumber(item.reorder_level)}
              </p>

              <p>
                <b>Location:</b>{' '}
                {item.location || 'Not assigned'}
              </p>

              <p>
                <b>Unit Cost:</b>{' '}
                {formatCurrency(item.unit_cost)}
              </p>

              <p>
                <b>Sale Price:</b>{' '}
                {formatCurrency(item.sale_price)}
              </p>

              {item.description && <p>{item.description}</p>}

              <div className="actions">
                <button
                  className="primary"
                  onClick={() => setAdjustingItem(item)}
                >
                  Adjust Stock
                </button>

                <button
                  className="secondary"
                  onClick={() => setEditingItem(item)}
                >
                  Edit
                </button>

                <button
                  className="danger"
                  onClick={() => deleteItem(item)}
                >
                  Delete
                </button>
              </div>
            </article>
          )
        })}

        {!filteredItems.length && (
          <Empty>
            {items.length
              ? 'No inventory items match your filters'
              : 'No inventory items have been added yet'}
          </Empty>
        )}
      </div>

      <section className="panel">
        <h2>Recent Inventory Activity</h2>

        {!transactions.length ? (
          <p>No inventory activity has been recorded.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
              }}
            >
              <thead>
                <tr>
                  <th align="left">Date</th>
                  <th align="left">Type</th>
                  <th align="left">Quantity</th>
                  <th align="left">Reason</th>
                  <th align="left">New Stock</th>
                </tr>
              </thead>

              <tbody>
                {transactions.slice(0, 20).map((transaction) => (
                  <tr key={transaction.id}>
                    <td>
                      {transaction.created_at
                        ? new Date(
                            transaction.created_at
                          ).toLocaleString()
                        : '—'}
                    </td>

                    <td>
                      {transaction.transaction_type || '—'}
                    </td>

                    <td>{transaction.quantity ?? '—'}</td>

                    <td>{transaction.reason || '—'}</td>

                    <td>
                      {transaction.new_quantity ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingItem && (
        <InventoryEditor
          initial={editingItem}
          saving={saving}
          onClose={() => setEditingItem(null)}
          onSave={saveItem}
        />
      )}

      {adjustingItem && (
        <StockAdjustmentModal
          item={adjustingItem}
          saving={saving}
          onClose={() => setAdjustingItem(null)}
          onSave={adjustInventory}
        />
      )}
    </>
  )
}

function InventoryEditor({
  initial,
  saving,
  onClose,
  onSave,
}) {
  const [values, setValues] = useState({
    ...EMPTY_ITEM,
    ...initial,
  })

  function setValue(key, value) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }))
  }

  async function submit(event) {
    event.preventDefault()
    await onSave(values)
  }

  return (
    <Modal
      title={
        initial.id
          ? 'Edit Inventory Item'
          : 'Add Inventory Item'
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field
            label="Item Name"
            value={values.name}
            onChange={(value) => setValue('name', value)}
            required
          />

          <Field
            label="SKU"
            value={values.sku}
            onChange={(value) => setValue('sku', value)}
          />

          <SelectField
            label="Category"
            value={values.category}
            onChange={(value) =>
              setValue('category', value)
            }
            options={CATEGORY_OPTIONS.map((category) => [
              category,
              category,
            ])}
          />

          <SelectField
            label="Unit"
            value={values.unit}
            onChange={(value) => setValue('unit', value)}
            options={UNIT_OPTIONS.map((unit) => [unit, unit])}
          />

          <Field
            label="Quantity on Hand"
            value={values.quantity_on_hand}
            onChange={(value) =>
              setValue('quantity_on_hand', value)
            }
            type="number"
          />

          <Field
            label="Reorder Level"
            value={values.reorder_level}
            onChange={(value) =>
              setValue('reorder_level', value)
            }
            type="number"
          />

          <Field
            label="Unit Cost"
            value={values.unit_cost}
            onChange={(value) =>
              setValue('unit_cost', value)
            }
            type="number"
          />

          <Field
            label="Sale Price"
            value={values.sale_price}
            onChange={(value) =>
              setValue('sale_price', value)
            }
            type="number"
          />

          <Field
            label="Supplier"
            value={values.supplier}
            onChange={(value) =>
              setValue('supplier', value)
            }
          />

          <Field
            label="Supplier Part Number"
            value={values.supplier_part_number}
            onChange={(value) =>
              setValue('supplier_part_number', value)
            }
          />

          <Field
            label="Storage Location"
            value={values.location}
            onChange={(value) =>
              setValue('location', value)
            }
          />

          <label
            className="field"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              alignSelf: 'end',
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(values.active)}
              onChange={(event) =>
                setValue('active', event.target.checked)
              }
            />
            Active inventory item
          </label>

          <Field
            label="Description"
            value={values.description}
            onChange={(value) =>
              setValue('description', value)
            }
            type="textarea"
            wide
          />

          <Field
            label="Notes"
            value={values.notes}
            onChange={(value) =>
              setValue('notes', value)
            }
            type="textarea"
            wide
          />
        </div>

        <div
          className="actions"
          style={{
            justifyContent: 'flex-end',
            marginTop: 18,
          }}
        >
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>

          <button
            className="primary"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Item'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function StockAdjustmentModal({
  item,
  saving,
  onClose,
  onSave,
}) {
  const [values, setValues] = useState({
    type: 'Add',
    amount: 1,
    reason: '',
    notes: '',
  })

  function setValue(key, value) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }))
  }

  async function submit(event) {
    event.preventDefault()

    if (toNumber(values.amount) < 0) {
      alert('Enter a valid quantity.')
      return
    }

    await onSave(values)
  }

  return (
    <Modal
      title={`Adjust Stock — ${item.name}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <p>
          Current stock:{' '}
          <b>
            {toNumber(item.quantity_on_hand)}{' '}
            {item.unit || 'Each'}
          </b>
        </p>

        <div className="form-grid">
          <SelectField
            label="Adjustment Type"
            value={values.type}
            onChange={(value) => setValue('type', value)}
            options={[
              ['Add', 'Add stock'],
              ['Remove', 'Remove stock'],
              ['Set', 'Set exact quantity'],
            ]}
          />

          <Field
            label={
              values.type === 'Set'
                ? 'New Quantity'
                : 'Quantity'
            }
            value={values.amount}
            onChange={(value) => setValue('amount', value)}
            type="number"
            required
          />

          <Field
            label="Reason"
            value={values.reason}
            onChange={(value) => setValue('reason', value)}
          />

          <Field
            label="Notes"
            value={values.notes}
            onChange={(value) => setValue('notes', value)}
            type="textarea"
            wide
          />
        </div>

        <div
          className="actions"
          style={{
            justifyContent: 'flex-end',
            marginTop: 18,
          }}
        >
          <button
            type="button"
            className="secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>

          <button
            className="primary"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Adjustment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}