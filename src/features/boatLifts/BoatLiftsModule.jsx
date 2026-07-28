import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  Badge,
  Empty,
  Field,
  Modal,
  SelectField,
} from '../../components/UI'
import { supabase } from '../../lib/supabase'
import { dateText } from '../../lib/utils'

const STATUS_OPTIONS = [
  'Active',
  'Needs Service',
  'Out of Service',
  'Removed',
]

const PRIORITY_OPTIONS = [
  'None',
  'Monitor',
  'Recommended Soon',
  'Immediate Attention',
]

const EMPTY_FORM = {
  customer_id: '',
  property_id: '',
  lift_number: '',
  status: 'Active',
  manufacturer: '',
  model: '',
  serial_number: '',
  lift_type: '',
  capacity_lbs: '',
  install_date: '',
  warranty_end: '',
  last_service_date: '',
  next_service_date: '',
  boat_name: '',
  boat_length_ft: '',
  motor_details: '',
  gearbox_details: '',
  cable_details: '',
  pulley_details: '',
  cradle_bunk_details: '',
  voltage: '',
  control_details: '',
  remote_details: '',
  electrical_details: '',
  recommendation_priority: 'None',
  current_recommendation: '',
  notes: '',
}

function numberValue(value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function liftTitle(lift) {
  const liftNumber = lift?.lift_number || 'Unnumbered Lift'
  const manufacturer = lift?.manufacturer
    ? ` · ${lift.manufacturer}`
    : ''

  return `${liftNumber}${manufacturer}`
}

export default function BoatLiftsModule() {
  const [boatLifts, setBoatLifts] = useState([])
  const [customers, setCustomers] = useState([])
  const [properties, setProperties] = useState([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [search, setSearch] = useState('')
  const [selectedLiftId, setSelectedLiftId] = useState(null)
  const [editingLift, setEditingLift] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    const [
      boatLiftResult,
      customerResult,
      propertyResult,
    ] = await Promise.all([
      supabase
        .from('boat_lifts')
        .select('*')
        .order('lift_number', { ascending: true }),

      supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true }),

      supabase
        .from('properties')
        .select('*')
        .order('address', { ascending: true }),
    ])

    const errors = [
      boatLiftResult.error,
      customerResult.error,
      propertyResult.error,
    ].filter(Boolean)

    if (errors.length) {
      console.error('Unable to load Boat Lifts module:', errors)

      setErrorMessage(
        errors.map((error) => error.message).join(' | ')
      )
    }

    setBoatLifts(
      Array.isArray(boatLiftResult.data)
        ? boatLiftResult.data
        : []
    )

    setCustomers(
      Array.isArray(customerResult.data)
        ? customerResult.data
        : []
    )

    setProperties(
      Array.isArray(propertyResult.data)
        ? propertyResult.data
        : []
    )

    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const customerById = useMemo(
    () =>
      Object.fromEntries(
        customers.map((customer) => [
          customer.id,
          customer,
        ])
      ),
    [customers]
  )

  const propertyById = useMemo(
    () =>
      Object.fromEntries(
        properties.map((property) => [
          property.id,
          property,
        ])
      ),
    [properties]
  )

  const selectedLift = useMemo(
    () =>
      boatLifts.find(
        (lift) => lift.id === selectedLiftId
      ) || null,
    [boatLifts, selectedLiftId]
  )

  const filteredBoatLifts = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) {
      return boatLifts
    }

    return boatLifts.filter((lift) => {
      const customer =
        customerById[lift.customer_id]

      const property =
        propertyById[lift.property_id]

      const searchableValues = [
        lift.lift_number,
        lift.manufacturer,
        lift.model,
        lift.serial_number,
        lift.status,
        lift.boat_name,
        lift.notes,
        customer?.name,
        property?.address,
      ]

      return searchableValues
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(query)
        )
    })
  }, [
    boatLifts,
    customerById,
    propertyById,
    search,
  ])

  async function saveLift(formValues) {
    setSaving(true)
    setErrorMessage('')

    const payload = {
      id: formValues.id || createId(),
      customer_id:
        formValues.customer_id || null,
      property_id:
        formValues.property_id || null,
      lift_number:
        formValues.lift_number ||
        `GBL-L-${String(
          boatLifts.length + 1
        ).padStart(6, '0')}`,
      qr_token:
        formValues.qr_token || createId(),
      status:
        formValues.status || 'Active',
      manufacturer:
        formValues.manufacturer || null,
      model:
        formValues.model || null,
      serial_number:
        formValues.serial_number || null,
      lift_type:
        formValues.lift_type || null,
      capacity_lbs:
        numberValue(formValues.capacity_lbs),
      install_date:
        formValues.install_date || null,
      warranty_end:
        formValues.warranty_end || null,
      last_service_date:
        formValues.last_service_date || null,
      next_service_date:
        formValues.next_service_date || null,
      boat_name:
        formValues.boat_name || null,
      boat_length_ft:
        numberValue(formValues.boat_length_ft),
      motor_details:
        formValues.motor_details || null,
      gearbox_details:
        formValues.gearbox_details || null,
      cable_details:
        formValues.cable_details || null,
      pulley_details:
        formValues.pulley_details || null,
      cradle_bunk_details:
        formValues.cradle_bunk_details || null,
      voltage:
        formValues.voltage || null,
      control_details:
        formValues.control_details || null,
      remote_details:
        formValues.remote_details || null,
      electrical_details:
        formValues.electrical_details || null,
      recommendation_priority:
        formValues.recommendation_priority ||
        'None',
      current_recommendation:
        formValues.current_recommendation ||
        null,
      notes:
        formValues.notes || null,
    }

    const { data, error } = await supabase
      .from('boat_lifts')
      .upsert(payload)
      .select()
      .single()

    setSaving(false)

    if (error) {
      console.error('Unable to save boat lift:', error)
      setErrorMessage(error.message)
      alert(error.message)
      return false
    }

    setBoatLifts((current) => {
      const exists = current.some(
        (lift) => lift.id === data.id
      )

      if (!exists) {
        return [...current, data]
      }

      return current.map((lift) =>
        lift.id === data.id ? data : lift
      )
    })

    setEditingLift(null)

    return true
  }

  async function deleteLift(lift) {
    const confirmed = window.confirm(
      `Delete ${liftTitle(lift)}?`
    )

    if (!confirmed) {
      return
    }

    const { error } = await supabase
      .from('boat_lifts')
      .delete()
      .eq('id', lift.id)

    if (error) {
      console.error('Unable to delete boat lift:', error)
      setErrorMessage(error.message)
      alert(error.message)
      return
    }

    setBoatLifts((current) =>
      current.filter(
        (existingLift) =>
          existingLift.id !== lift.id
      )
    )

    if (selectedLiftId === lift.id) {
      setSelectedLiftId(null)
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Boat Lifts</h2>
        <p>Loading boat lift records...</p>
      </section>
    )
  }

  if (selectedLift) {
    const customer =
      customerById[selectedLift.customer_id]

    const property =
      propertyById[selectedLift.property_id]

    const qrUrl =
      `${window.location.origin}/?lift=` +
      encodeURIComponent(
        selectedLift.qr_token ||
          selectedLift.id
      )

    return (
      <>
        <div className="toolbar">
          <button
            className="secondary"
            onClick={() =>
              setSelectedLiftId(null)
            }
          >
            ← Back to Boat Lifts
          </button>

          <button
            className="primary"
            onClick={() =>
              setEditingLift(selectedLift)
            }
          >
            Edit Lift
          </button>
        </div>

        {errorMessage && (
          <section className="panel">
            <strong>Boat Lifts error:</strong>
            <p>{errorMessage}</p>
          </section>
        )}

        <section className="panel">
          <div className="between">
            <div>
              <h2>{liftTitle(selectedLift)}</h2>

              <div className="small">
                {property?.address ||
                  'No property assigned'}
              </div>
            </div>

            <Badge>
              {selectedLift.status || 'Active'}
            </Badge>
          </div>

          <div className="metrics">
            <div className="metric">
              <span>Capacity</span>
              <strong>
                {selectedLift.capacity_lbs
                  ? `${Number(
                      selectedLift.capacity_lbs
                    ).toLocaleString()} lb`
                  : '—'}
              </strong>
            </div>

            <div className="metric">
              <span>Install Date</span>
              <strong>
                {dateText(
                  selectedLift.install_date
                )}
              </strong>
            </div>

            <div className="metric">
              <span>Warranty Ends</span>
              <strong>
                {dateText(
                  selectedLift.warranty_end
                )}
              </strong>
            </div>

            <div className="metric">
              <span>Next Service</span>
              <strong>
                {dateText(
                  selectedLift.next_service_date
                )}
              </strong>
            </div>
          </div>
        </section>

        <div className="grid-2">
          <section className="panel">
            <h2>Lift Information</h2>

            <p>
              <b>Customer:</b>{' '}
              {customer?.name || '—'}
            </p>

            <p>
              <b>Property:</b>{' '}
              {property?.address || '—'}
            </p>

            <p>
              <b>Manufacturer:</b>{' '}
              {selectedLift.manufacturer || '—'}
            </p>

            <p>
              <b>Model:</b>{' '}
              {selectedLift.model || '—'}
            </p>

            <p>
              <b>Serial Number:</b>{' '}
              {selectedLift.serial_number || '—'}
            </p>

            <p>
              <b>Lift Type:</b>{' '}
              {selectedLift.lift_type || '—'}
            </p>

            <p>
              <b>Boat:</b>{' '}
              {selectedLift.boat_name || '—'}
              {selectedLift.boat_length_ft
                ? ` · ${selectedLift.boat_length_ft} ft`
                : ''}
            </p>
          </section>

          <section className="panel">
            <h2>Customer QR Link</h2>

            <div
              style={{
                padding: 18,
                border: '2px dashed #b8bec8',
                borderRadius: 14,
                textAlign: 'center',
              }}
            >
              <div className="small">
                CUSTOMER QR STICKER
              </div>

              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  margin: '8px 0',
                }}
              >
                {selectedLift.lift_number}
              </div>

              <div
                className="small"
                style={{
                  overflowWrap: 'anywhere',
                }}
              >
                {qrUrl}
              </div>

              <div
                className="actions"
                style={{
                  justifyContent: 'center',
                  marginTop: 14,
                }}
              >
                <button
                  className="secondary"
                  onClick={() =>
                    navigator.clipboard?.writeText(
                      qrUrl
                    )
                  }
                >
                  Copy Scan Link
                </button>

                <a
                  className="secondary"
                  href={qrUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    textDecoration: 'none',
                  }}
                >
                  Open Link
                </a>
              </div>
            </div>
          </section>
        </div>

        <div className="grid-2">
          <section className="panel">
            <h2>Mechanical Components</h2>

            <p>
              <b>Motor:</b>{' '}
              {selectedLift.motor_details || '—'}
            </p>

            <p>
              <b>Gearbox:</b>{' '}
              {selectedLift.gearbox_details || '—'}
            </p>

            <p>
              <b>Cables:</b>{' '}
              {selectedLift.cable_details || '—'}
            </p>

            <p>
              <b>Pulleys:</b>{' '}
              {selectedLift.pulley_details || '—'}
            </p>

            <p>
              <b>Cradle / Bunks:</b>{' '}
              {selectedLift.cradle_bunk_details ||
                '—'}
            </p>
          </section>

          <section className="panel">
            <h2>Electrical and Controls</h2>

            <p>
              <b>Voltage:</b>{' '}
              {selectedLift.voltage || '—'}
            </p>

            <p>
              <b>Controls:</b>{' '}
              {selectedLift.control_details || '—'}
            </p>

            <p>
              <b>Remote:</b>{' '}
              {selectedLift.remote_details || '—'}
            </p>

            <p>
              <b>Electrical:</b>{' '}
              {selectedLift.electrical_details ||
                '—'}
            </p>
          </section>
        </div>

        <section className="panel">
          <div className="between">
            <h2>Current Recommendation</h2>

            <Badge>
              {selectedLift.recommendation_priority ||
                'None'}
            </Badge>
          </div>

          <p>
            {selectedLift.current_recommendation ||
              'No active recommendation.'}
          </p>

          <p>
            <b>Internal Notes:</b>{' '}
            {selectedLift.notes || 'No notes.'}
          </p>
        </section>

        {editingLift && (
          <BoatLiftEditor
            initial={editingLift}
            customers={customers}
            properties={properties}
            saving={saving}
            onClose={() =>
              setEditingLift(null)
            }
            onSave={saveLift}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search lift ID, customer, property, manufacturer, model..."
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          style={{
            width: 'min(520px, 100%)',
            padding: '12px 14px',
            borderRadius: 10,
            border: '1px solid #d6d9df',
            font: 'inherit',
          }}
        />

        <button
          className="primary"
          onClick={() =>
            setEditingLift({
              ...EMPTY_FORM,
            })
          }
        >
          + Boat Lift
        </button>
      </div>

      {errorMessage && (
        <section className="panel">
          <strong>Boat Lifts error:</strong>
          <p>{errorMessage}</p>

          <button
            className="secondary"
            onClick={loadData}
          >
            Try Again
          </button>
        </section>
      )}

      <div className="cards">
        {filteredBoatLifts.map((lift) => {
          const customer =
            customerById[lift.customer_id]

          const property =
            propertyById[lift.property_id]

          return (
            <article
              className="card"
              key={lift.id}
            >
              <div className="between">
                <div>
                  <h3>{liftTitle(lift)}</h3>

                  <div className="small">
                    {customer?.name ||
                      'No customer'}{' '}
                    ·{' '}
                    {property?.address ||
                      'No property'}
                  </div>
                </div>

                <Badge>
                  {lift.status || 'Active'}
                </Badge>
              </div>

              <div className="grid-2">
                <div>
                  <p>
                    <b>Capacity:</b>{' '}
                    {lift.capacity_lbs
                      ? `${Number(
                          lift.capacity_lbs
                        ).toLocaleString()} lb`
                      : '—'}
                  </p>

                  <p>
                    <b>Model:</b>{' '}
                    {lift.model || '—'}
                  </p>
                </div>

                <div>
                  <p>
                    <b>Next Service:</b>{' '}
                    {dateText(
                      lift.next_service_date
                    )}
                  </p>

                  <p>
                    <b>Recommendation:</b>{' '}
                    {lift.recommendation_priority ||
                      'None'}
                  </p>
                </div>
              </div>

              <div className="actions">
                <button
                  className="primary"
                  onClick={() =>
                    setSelectedLiftId(lift.id)
                  }
                >
                  Open Lift
                </button>

                <button
                  className="secondary"
                  onClick={() =>
                    setEditingLift(lift)
                  }
                >
                  Edit
                </button>

                <button
                  className="danger"
                  onClick={() =>
                    deleteLift(lift)
                  }
                >
                  Delete
                </button>
              </div>
            </article>
          )
        })}

        {!filteredBoatLifts.length && (
          <Empty>
            {boatLifts.length
              ? 'No boat lifts match your search'
              : 'No boat lifts have been added yet'}
          </Empty>
        )}
      </div>

      {editingLift && (
        <BoatLiftEditor
          initial={editingLift}
          customers={customers}
          properties={properties}
          saving={saving}
          onClose={() => setEditingLift(null)}
          onSave={saveLift}
        />
      )}
    </>
  )
}

function BoatLiftEditor({
  initial,
  customers,
  properties,
  saving,
  onClose,
  onSave,
}) {
  const [formValues, setFormValues] = useState({
    ...EMPTY_FORM,
    ...initial,
  })

  function setValue(key, value) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const availableProperties = properties.filter(
    (property) =>
      !formValues.customer_id ||
      property.customer_id ===
        formValues.customer_id
  )

  async function submit(event) {
    event.preventDefault()

    if (
      !formValues.customer_id ||
      !formValues.property_id
    ) {
      alert(
        'Select both a customer and property.'
      )
      return
    }

    await onSave(formValues)
  }

  return (
    <Modal
      title={
        initial.id
          ? 'Edit Boat Lift'
          : 'Add Boat Lift'
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <SelectField
            label="Customer"
            value={formValues.customer_id}
            onChange={(value) => {
              setValue('customer_id', value)
              setValue('property_id', '')
            }}
            options={[
              ['', 'Select customer'],
              ...customers.map((customer) => [
                customer.id,
                customer.name,
              ]),
            ]}
            required
          />

          <SelectField
            label="Property"
            value={formValues.property_id}
            onChange={(value) =>
              setValue('property_id', value)
            }
            options={[
              ['', 'Select property'],
              ...availableProperties.map(
                (property) => [
                  property.id,
                  property.address,
                ]
              ),
            ]}
            required
          />

          <Field
            label="Lift ID"
            value={formValues.lift_number}
            onChange={(value) =>
              setValue('lift_number', value)
            }
          />

          <SelectField
            label="Status"
            value={formValues.status}
            onChange={(value) =>
              setValue('status', value)
            }
            options={STATUS_OPTIONS.map(
              (value) => [value, value]
            )}
          />

          <Field
            label="Manufacturer"
            value={formValues.manufacturer}
            onChange={(value) =>
              setValue('manufacturer', value)
            }
          />

          <Field
            label="Model"
            value={formValues.model}
            onChange={(value) =>
              setValue('model', value)
            }
          />

          <Field
            label="Serial Number"
            value={formValues.serial_number}
            onChange={(value) =>
              setValue('serial_number', value)
            }
          />

          <Field
            label="Lift Type"
            value={formValues.lift_type}
            onChange={(value) =>
              setValue('lift_type', value)
            }
          />

          <Field
            label="Capacity (lb)"
            value={formValues.capacity_lbs}
            onChange={(value) =>
              setValue('capacity_lbs', value)
            }
            type="number"
          />

          <Field
            label="Install Date"
            value={formValues.install_date}
            onChange={(value) =>
              setValue('install_date', value)
            }
            type="date"
          />

          <Field
            label="Warranty End"
            value={formValues.warranty_end}
            onChange={(value) =>
              setValue('warranty_end', value)
            }
            type="date"
          />

          <Field
            label="Last Service"
            value={formValues.last_service_date}
            onChange={(value) =>
              setValue(
                'last_service_date',
                value
              )
            }
            type="date"
          />

          <Field
            label="Next Service"
            value={formValues.next_service_date}
            onChange={(value) =>
              setValue(
                'next_service_date',
                value
              )
            }
            type="date"
          />

          <Field
            label="Boat Name"
            value={formValues.boat_name}
            onChange={(value) =>
              setValue('boat_name', value)
            }
          />

          <Field
            label="Boat Length (ft)"
            value={formValues.boat_length_ft}
            onChange={(value) =>
              setValue(
                'boat_length_ft',
                value
              )
            }
            type="number"
          />

          <Field
            label="Motor Details"
            value={formValues.motor_details}
            onChange={(value) =>
              setValue(
                'motor_details',
                value
              )
            }
            type="textarea"
            wide
          />

          <Field
            label="Gearbox Details"
            value={formValues.gearbox_details}
            onChange={(value) =>
              setValue(
                'gearbox_details',
                value
              )
            }
            type="textarea"
            wide
          />

          <Field
            label="Cable Details"
            value={formValues.cable_details}
            onChange={(value) =>
              setValue(
                'cable_details',
                value
              )
            }
            type="textarea"
            wide
          />

          <Field
            label="Pulley Details"
            value={formValues.pulley_details}
            onChange={(value) =>
              setValue(
                'pulley_details',
                value
              )
            }
            type="textarea"
            wide
          />

          <Field
            label="Cradle / Bunk Details"
            value={
              formValues.cradle_bunk_details
            }
            onChange={(value) =>
              setValue(
                'cradle_bunk_details',
                value
              )
            }
            type="textarea"
            wide
          />

          <Field
            label="Voltage"
            value={formValues.voltage}
            onChange={(value) =>
              setValue('voltage', value)
            }
          />

          <Field
            label="Control Details"
            value={formValues.control_details}
            onChange={(value) =>
              setValue(
                'control_details',
                value
              )
            }
            type="textarea"
            wide
          />

          <Field
            label="Remote Details"
            value={formValues.remote_details}
            onChange={(value) =>
              setValue(
                'remote_details',
                value
              )
            }
            type="textarea"
            wide
          />

          <Field
            label="Electrical Details"
            value={
              formValues.electrical_details
            }
            onChange={(value) =>
              setValue(
                'electrical_details',
                value
              )
            }
            type="textarea"
            wide
          />

          <SelectField
            label="Recommendation Priority"
            value={
              formValues.recommendation_priority
            }
            onChange={(value) =>
              setValue(
                'recommendation_priority',
                value
              )
            }
            options={PRIORITY_OPTIONS.map(
              (value) => [value, value]
            )}
          />

          <Field
            label="Current Recommendation"
            value={
              formValues.current_recommendation
            }
            onChange={(value) =>
              setValue(
                'current_recommendation',
                value
              )
            }
            type="textarea"
            wide
          />

          <Field
            label="Internal Notes"
            value={formValues.notes}
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
            marginTop: 18,
            justifyContent: 'flex-end',
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
            {saving
              ? 'Saving...'
              : 'Save Boat Lift'}
          </button>
        </div>
      </form>
    </Modal>
  )
}