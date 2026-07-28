import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  Badge,
  Empty,
  Field,
  Modal,
  SelectField,
} from '../../components/UI'

import { supabase } from '../../lib/supabase'

const STATUS_OPTIONS = [
  'New',
  'Scheduled',
  'Dispatched',
  'In Progress',
  'On Hold',
  'Completed',
  'Cancelled',
]

const PRIORITY_OPTIONS = [
  'Low',
  'Normal',
  'High',
  'Emergency',
]

const JOB_TYPE_OPTIONS = [
  'Installation',
  'Repair',
  'Annual Service',
  'Warranty',
  'Inspection',
  'Removal',
  'Electrical',
  'Emergency Service',
  'Other',
]

const DEFAULT_CHECKLIST = [
  { id: 'work-area-safe', label: 'Work area left safe and clean', completed: false },
  { id: 'lift-tested', label: 'Boat lift tested through full operation', completed: false },
  { id: 'hardware-checked', label: 'Hardware, cables, pulleys, and fasteners checked', completed: false },
  { id: 'controls-checked', label: 'Controls and electrical operation checked', completed: false },
  { id: 'customer-updated', label: 'Customer updated on completed work', completed: false },
  { id: 'photos-reviewed', label: 'Required job photos reviewed', completed: false },
]

const EMPTY_JOB = {
  number: '',
  title: '',
  job_type: 'Repair',
  customer_id: '',
  property_id: '',
  boat_lift_id: '',
  status: 'New',
  priority: 'Normal',
  start_date: '',
  due_date: '',
  scheduled_start: '',
  scheduled_end: '',
  completed_at: '',
  assigned_employee_ids: [],
  crew: '',
  scope: '',
  dispatch_notes: '',
  notes: '',
  equipment_used: '',
  contract_amount: '',
  material_cost: '',
  labor_cost: '',
  other_cost: '',
  materials_used: [],
  labor_entries: [],
  daily_logs: [],
  completion_checklist: DEFAULT_CHECKLIST,
}

function createId() {
  if (
    typeof crypto !== 'undefined' &&
    crypto.randomUUID
  ) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`
}

function normalizeText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function numberValue(value) {
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed)
    ? parsed
    : null
}

function arrayValue(value) {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

function normalizeChecklist(value) {
  const saved = arrayValue(value)

  if (!saved.length) {
    return DEFAULT_CHECKLIST.map((item) => ({ ...item }))
  }

  const savedById = Object.fromEntries(
    saved.map((item) => [item.id, item])
  )

  return DEFAULT_CHECKLIST.map((item) => ({
    ...item,
    completed: Boolean(savedById[item.id]?.completed),
  }))
}

function formatCurrency(value) {
  const amount = Number(value || 0)

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

function formatDate(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleDateString()
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

function calculateLaborHours(entries) {
  return arrayValue(entries).reduce((total, entry) => {
    if (entry.hours !== '' && entry.hours !== null && entry.hours !== undefined) {
      return total + Number(entry.hours || 0)
    }

    if (!entry.start || !entry.end) {
      return total
    }

    const start = new Date(entry.start)
    const end = new Date(entry.end)

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return total
    }

    return total + (end - start) / 3600000
  }, 0)
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

async function adaptiveUpsert(
  table,
  payload,
  conflictColumn = 'id'
) {
  let workingPayload = { ...payload }
  const removedColumns = []

  for (let attempt = 0; attempt < 24; attempt += 1) {
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

    const missingColumn = getMissingColumn(
      result.error
    )

    if (
      !missingColumn ||
      !(missingColumn in workingPayload)
    ) {
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
    error: new Error(
      `Unable to save ${table} after removing unsupported fields.`
    ),
    removedColumns,
  }
}

function jobLabel(job) {
  return `${job.number || 'Unnumbered Job'} · ${
    job.title || 'Untitled Job'
  }`
}

function customerName(customer) {
  if (!customer) return 'No customer'

  const person = [
    customer.first_name,
    customer.last_name,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    customer.name ||
    customer.company_name ||
    person ||
    'No customer'
  )
}

function employeeName(employee) {
  if (!employee) return 'Employee'

  return (
    employee.name ||
    employee.full_name ||
    employee.email ||
    'Employee'
  )
}

export default function JobsModule() {
  const [jobs, setJobs] = useState([])
  const [customers, setCustomers] = useState([])
  const [properties, setProperties] = useState([])
  const [boatLifts, setBoatLifts] = useState([])
  const [employees, setEmployees] = useState([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] =
    useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] =
    useState('')
  const [priorityFilter, setPriorityFilter] =
    useState('')

  const [selectedJobId, setSelectedJobId] =
    useState(null)
  const [editingJob, setEditingJob] =
    useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    const [
      jobsResult,
      customersResult,
      propertiesResult,
      boatLiftsResult,
      employeesResult,
    ] = await Promise.all([
      supabase
        .from('jobs')
        .select('*')
        .order('created_at', {
          ascending: false,
        }),

      supabase
        .from('customers')
        .select('*')
        .order('created_at', {
          ascending: false,
        }),

      supabase
        .from('properties')
        .select('*')
        .order('address', {
          ascending: true,
        }),

      supabase
        .from('boat_lifts')
        .select('*')
        .order('lift_number', {
          ascending: true,
        }),

      supabase
        .from('employees')
        .select('*')
        .order('created_at', {
          ascending: false,
        }),
    ])

    const errors = [
      jobsResult.error,
      customersResult.error,
      propertiesResult.error,
      boatLiftsResult.error,
      employeesResult.error,
    ].filter(Boolean)

    if (errors.length) {
      console.error(
        'Jobs module load errors:',
        errors
      )

      setErrorMessage(
        errors
          .map((error) => error.message)
          .join(' | ')
      )
    }

    setJobs(
      Array.isArray(jobsResult.data)
        ? jobsResult.data
        : []
    )

    setCustomers(
      Array.isArray(customersResult.data)
        ? customersResult.data
        : []
    )

    setProperties(
      Array.isArray(propertiesResult.data)
        ? propertiesResult.data
        : []
    )

    setBoatLifts(
      Array.isArray(boatLiftsResult.data)
        ? boatLiftsResult.data
        : []
    )

    setEmployees(
      Array.isArray(employeesResult.data)
        ? employeesResult.data
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

  const boatLiftById = useMemo(
    () =>
      Object.fromEntries(
        boatLifts.map((lift) => [
          lift.id,
          lift,
        ])
      ),
    [boatLifts]
  )

  const selectedJob = useMemo(
    () =>
      jobs.find(
        (job) => job.id === selectedJobId
      ) || null,
    [jobs, selectedJobId]
  )

  const filteredJobs = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase()

    return jobs.filter((job) => {
      if (
        statusFilter &&
        (job.status || 'New') !== statusFilter
      ) {
        return false
      }

      if (
        priorityFilter &&
        (job.priority || 'Normal') !==
          priorityFilter
      ) {
        return false
      }

      if (!query) {
        return true
      }

      const customer =
        customerById[job.customer_id]

      const property =
        propertyById[job.property_id]

      const lift =
        boatLiftById[job.boat_lift_id]

      const values = [
        job.number,
        job.title,
        job.job_type,
        job.status,
        job.priority,
        job.scope,
        job.notes,
        job.dispatch_notes,
        job.crew,
        customerName(customer),
        property?.address,
        lift?.lift_number,
      ]

      return values
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(query)
        )
    })
  }, [
    jobs,
    search,
    statusFilter,
    priorityFilter,
    customerById,
    propertyById,
    boatLiftById,
  ])

  async function saveJob(formValues) {
    if (!formValues.title.trim()) {
      alert('Enter the job title.')
      return false
    }

    if (!formValues.customer_id) {
      alert('Select a customer.')
      return false
    }

    setSaving(true)
    setErrorMessage('')

    const {
      data: authData,
      error: authError,
    } = await supabase.auth.getUser()

    if (authError) {
      setSaving(false)
      alert(authError.message)
      return false
    }

    const assignedIds = Array.isArray(
      formValues.assigned_employee_ids
    )
      ? formValues.assigned_employee_ids
      : []

    const crew = employees
      .filter((employee) =>
        assignedIds.includes(employee.id)
      )
      .map(employeeName)
      .join(', ')

    const materialsUsed = arrayValue(
      formValues.materials_used
    ).filter((item) =>
      String(item.name || '').trim()
    )

    const laborEntries = arrayValue(
      formValues.labor_entries
    ).filter((item) =>
      item.employee_id ||
      item.employee_name ||
      item.start ||
      item.end ||
      item.hours
    )

    const dailyLogs = arrayValue(
      formValues.daily_logs
    ).filter((item) =>
      String(item.notes || '').trim()
    )

    const payload = {
      id: formValues.id || createId(),
      user_id: authData.user?.id || null,
      number:
        normalizeText(formValues.number) ||
        `JOB-${Date.now()}`,
      title: formValues.title.trim(),
      job_type:
        formValues.job_type || 'Repair',
      customer_id:
        formValues.customer_id || null,
      property_id:
        formValues.property_id || null,
      boat_lift_id:
        formValues.boat_lift_id || null,
      status:
        formValues.status || 'New',
      priority:
        formValues.priority || 'Normal',
      start_date:
        formValues.start_date || null,
      due_date:
        formValues.due_date || null,
      scheduled_start:
        formValues.scheduled_start || null,
      scheduled_end:
        formValues.scheduled_end || null,
      completed_at:
        formValues.completed_at || null,
      assigned_employee_ids: assignedIds,
      crew: crew || normalizeText(
        formValues.crew
      ),
      scope: normalizeText(formValues.scope),
      dispatch_notes: normalizeText(
        formValues.dispatch_notes
      ),
      notes: normalizeText(formValues.notes),
      equipment_used: normalizeText(
        formValues.equipment_used
      ),
      contract_amount: numberValue(
        formValues.contract_amount
      ),
      material_cost: numberValue(
        formValues.material_cost
      ),
      labor_cost: numberValue(
        formValues.labor_cost
      ),
      other_cost: numberValue(
        formValues.other_cost
      ),
      materials_used: materialsUsed,
      labor_entries: laborEntries,
      daily_logs: dailyLogs,
      completion_checklist: normalizeChecklist(
        formValues.completion_checklist
      ),
    }

    const result = await adaptiveUpsert(
      'jobs',
      payload
    )

    setSaving(false)

    if (result.error) {
      console.error(
        'Unable to save job:',
        result.error
      )

      setErrorMessage(result.error.message)
      alert(result.error.message)
      return false
    }

    if (result.removedColumns.length) {
      console.warn(
        'Unsupported job columns were skipped:',
        result.removedColumns
      )
    }

    setJobs((current) => {
      const exists = current.some(
        (job) => job.id === result.data.id
      )

      if (!exists) {
        return [result.data, ...current]
      }

      return current.map((job) =>
        job.id === result.data.id
          ? result.data
          : job
      )
    })

    setEditingJob(null)
    setSelectedJobId(result.data.id)

    return true
  }

  async function deleteJob(job) {
    const confirmed = window.confirm(
      `Delete ${jobLabel(job)}?`
    )

    if (!confirmed) {
      return
    }

    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', job.id)

    if (error) {
      console.error(
        'Unable to delete job:',
        error
      )

      alert(error.message)
      return
    }

    setJobs((current) =>
      current.filter(
        (item) => item.id !== job.id
      )
    )

    if (selectedJobId === job.id) {
      setSelectedJobId(null)
    }
  }

  async function quickStatus(job, status) {
    const update = {
      status,
      ...(status === 'Completed' && !job.completed_at
        ? { completed_at: new Date().toISOString() }
        : {}),
    }

    const result = await adaptiveUpsert(
      'jobs',
      {
        ...job,
        ...update,
      }
    )

    if (result.error) {
      alert(result.error.message)
      return
    }

    setJobs((current) =>
      current.map((item) =>
        item.id === job.id
          ? result.data
          : item
      )
    )
  }

  async function completeJob(job) {
    const checklist = normalizeChecklist(
      job.completion_checklist
    )

    const incomplete = checklist.filter(
      (item) => !item.completed
    )

    if (incomplete.length) {
      alert(
        `Complete all checklist items before closing the job. ${incomplete.length} item(s) remain.`
      )
      setEditingJob({
        ...job,
        completion_checklist: checklist,
      })
      return
    }

    const confirmed = window.confirm(
      `Mark ${jobLabel(job)} complete?`
    )

    if (!confirmed) return

    await quickStatus(job, 'Completed')
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Jobs</h2>
        <p>Loading job records...</p>
      </section>
    )
  }

  if (selectedJob) {
    const customer =
      customerById[selectedJob.customer_id]

    const property =
      propertyById[selectedJob.property_id]

    const lift =
      boatLiftById[selectedJob.boat_lift_id]

    const totalCost =
      Number(selectedJob.material_cost || 0) +
      Number(selectedJob.labor_cost || 0) +
      Number(selectedJob.other_cost || 0)

    const grossProfit =
      Number(selectedJob.contract_amount || 0) -
      totalCost

    const materialsUsed = arrayValue(
      selectedJob.materials_used
    )

    const laborEntries = arrayValue(
      selectedJob.labor_entries
    )

    const dailyLogs = arrayValue(
      selectedJob.daily_logs
    )

    const checklist = normalizeChecklist(
      selectedJob.completion_checklist
    )

    const laborHours = calculateLaborHours(
      laborEntries
    )

    const checklistComplete = checklist.filter(
      (item) => item.completed
    ).length

    return (
      <>
        <div className="toolbar">
          <button
            className="secondary"
            onClick={() =>
              setSelectedJobId(null)
            }
          >
            ← Back to Jobs
          </button>

          <div className="actions">
            {selectedJob.status !== 'Completed' && (
              <button
                className="secondary"
                onClick={() =>
                  quickStatus(
                    selectedJob,
                    'In Progress'
                  )
                }
              >
                Start Job
              </button>
            )}

            {selectedJob.status !== 'Completed' && (
              <button
                className="primary"
                onClick={() =>
                  completeJob(selectedJob)
                }
              >
                Complete Job
              </button>
            )}

            <button
              className="secondary"
              onClick={() =>
                setEditingJob({
                  ...selectedJob,
                  materials_used: materialsUsed,
                  labor_entries: laborEntries,
                  daily_logs: dailyLogs,
                  completion_checklist: checklist,
                })
              }
            >
              Edit Job
            </button>
          </div>
        </div>

        {errorMessage && (
          <section className="panel">
            <strong>Jobs error:</strong>
            <p>{errorMessage}</p>
          </section>
        )}

        <section className="panel">
          <div className="between">
            <div>
              <h2>{jobLabel(selectedJob)}</h2>

              <div className="small">
                {customerName(customer)} ·{' '}
                {property?.address ||
                  'No property'}
              </div>
            </div>

            <div className="actions">
              <Badge>
                {selectedJob.job_type ||
                  'Repair'}
              </Badge>

              <Badge>
                {selectedJob.priority ||
                  'Normal'}
              </Badge>

              <Badge>
                {selectedJob.status || 'New'}
              </Badge>
            </div>
          </div>

          <div className="metrics">
            <div className="metric">
              <span>Contract</span>
              <strong>
                {formatCurrency(
                  selectedJob.contract_amount
                )}
              </strong>
            </div>

            <div className="metric">
              <span>Total Cost</span>
              <strong>
                {formatCurrency(totalCost)}
              </strong>
            </div>

            <div className="metric">
              <span>Gross Profit</span>
              <strong>
                {formatCurrency(grossProfit)}
              </strong>
            </div>

            <div className="metric">
              <span>Labor Hours</span>
              <strong>
                {laborHours.toFixed(2)}
              </strong>
            </div>

            <div className="metric">
              <span>Checklist</span>
              <strong>
                {checklistComplete}/{checklist.length}
              </strong>
            </div>
          </div>
        </section>

        <div className="grid-2">
          <section className="panel">
            <h2>Job Information</h2>

            <p><b>Type:</b>{' '}{selectedJob.job_type || '—'}</p>
            <p><b>Customer:</b>{' '}{customerName(customer)}</p>
            <p><b>Property:</b>{' '}{property?.address || '—'}</p>
            <p><b>Boat Lift:</b>{' '}{lift?.lift_number || '—'}</p>
            <p><b>Start Date:</b>{' '}{formatDate(selectedJob.start_date)}</p>
            <p><b>Due Date:</b>{' '}{formatDate(selectedJob.due_date)}</p>
            <p><b>Scheduled Start:</b>{' '}{formatDateTime(selectedJob.scheduled_start)}</p>
            <p><b>Scheduled End:</b>{' '}{formatDateTime(selectedJob.scheduled_end)}</p>
            <p><b>Completed:</b>{' '}{formatDateTime(selectedJob.completed_at)}</p>
            <p><b>Crew:</b>{' '}{selectedJob.crew || '—'}</p>
          </section>

          <section className="panel">
            <h2>Financial Summary</h2>

            <p><b>Contract Amount:</b>{' '}{formatCurrency(selectedJob.contract_amount)}</p>
            <p><b>Material Cost:</b>{' '}{formatCurrency(selectedJob.material_cost)}</p>
            <p><b>Labor Cost:</b>{' '}{formatCurrency(selectedJob.labor_cost)}</p>
            <p><b>Other Cost:</b>{' '}{formatCurrency(selectedJob.other_cost)}</p>
            <p><b>Gross Profit:</b>{' '}{formatCurrency(grossProfit)}</p>
          </section>
        </div>

        <section className="panel">
          <h2>Scope of Work</h2>
          <p>{selectedJob.scope || 'No scope entered.'}</p>
        </section>

        <div className="grid-2">
          <section className="panel">
            <h2>Materials Used</h2>

            <div className="cards">
              {materialsUsed.map((item) => (
                <article className="card" key={item.id}>
                  <div className="between">
                    <strong>{item.name || 'Material'}</strong>
                    <span>{Number(item.quantity || 0)} {item.unit || ''}</span>
                  </div>
                  <div className="small">
                    {item.part_number ? `Part ${item.part_number}` : 'No part number'}
                    {item.cost ? ` · ${formatCurrency(item.cost)}` : ''}
                  </div>
                </article>
              ))}

              {!materialsUsed.length && (
                <Empty>No materials recorded</Empty>
              )}
            </div>
          </section>

          <section className="panel">
            <h2>Labor Entries</h2>

            <div className="cards">
              {laborEntries.map((entry) => {
                const employee =
                  employees.find((item) => item.id === entry.employee_id)

                const entryHours =
                  entry.hours !== '' &&
                  entry.hours !== null &&
                  entry.hours !== undefined
                    ? Number(entry.hours || 0)
                    : calculateLaborHours([entry])

                return (
                  <article className="card" key={entry.id}>
                    <strong>
                      {employeeName(employee) ||
                        entry.employee_name ||
                        'Labor Entry'}
                    </strong>
                    <p>
                      <b>Hours:</b>{' '}
                      {entryHours.toFixed(2)}
                    </p>
                    <div className="small">
                      {entry.start ? formatDateTime(entry.start) : 'No start'}
                      {' → '}
                      {entry.end ? formatDateTime(entry.end) : 'No end'}
                    </div>
                    {entry.notes && <p>{entry.notes}</p>}
                  </article>
                )
              })}

              {!laborEntries.length && (
                <Empty>No labor entries recorded</Empty>
              )}
            </div>
          </section>
        </div>

        <section className="panel">
          <h2>Daily Work Log</h2>

          <div className="cards">
            {dailyLogs.map((log) => (
              <article className="card" key={log.id}>
                <div className="between">
                  <strong>{formatDate(log.date)}</strong>
                  <span className="small">{log.employee_name || ''}</span>
                </div>
                <p>{log.notes}</p>
              </article>
            ))}

            {!dailyLogs.length && (
              <Empty>No daily log entries</Empty>
            )}
          </div>
        </section>

        <JobFieldWork
          job={selectedJob}
          employees={employees}
          onJobUpdated={(updatedJob) =>
            setJobs((current) =>
              current.map((item) =>
                item.id === updatedJob.id
                  ? updatedJob
                  : item
              )
            )
          }
        />

        <JobCompletionCenter
          job={selectedJob}
          customer={customer}
          property={property}
          lift={lift}
          employees={employees}
          onJobUpdated={(updatedJob) =>
            setJobs((current) =>
              current.map((item) =>
                item.id === updatedJob.id
                  ? updatedJob
                  : item
              )
            )
          }
        />

        <div className="grid-2">
          <section className="panel">
            <h2>Completion Checklist</h2>

            <div style={{ display: 'grid', gap: 10 }}>
              {checklist.map((item) => (
                <div className="between" key={item.id}>
                  <span>{item.label}</span>
                  <Badge>{item.completed ? 'Complete' : 'Open'}</Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Equipment Used</h2>
            <p>{selectedJob.equipment_used || 'No equipment recorded.'}</p>
          </section>
        </div>

        <div className="grid-2">
          <section className="panel">
            <h2>Dispatch Notes</h2>
            <p>{selectedJob.dispatch_notes || 'No dispatch notes.'}</p>
          </section>

          <section className="panel">
            <h2>Internal Notes</h2>
            <p>{selectedJob.notes || 'No internal notes.'}</p>
          </section>
        </div>

        <section className="panel">
          <h2>Job Actions</h2>

          <div className="actions">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                className={
                  status === selectedJob.status
                    ? 'primary'
                    : 'secondary'
                }
                onClick={() =>
                  status === 'Completed'
                    ? completeJob(selectedJob)
                    : quickStatus(selectedJob, status)
                }
              >
                {status}
              </button>
            ))}
          </div>
        </section>

        {editingJob && (
          <JobEditor
            initial={editingJob}
            customers={customers}
            properties={properties}
            boatLifts={boatLifts}
            employees={employees}
            saving={saving}
            onClose={() =>
              setEditingJob(null)
            }
            onSave={saveJob}
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
          placeholder="Search jobs, customers, properties, lifts..."
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

        <div className="actions">
          <SelectField
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ['', 'All statuses'],
              ...STATUS_OPTIONS.map(
                (status) => [
                  status,
                  status,
                ]
              ),
            ]}
          />

          <SelectField
            label="Priority"
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={[
              ['', 'All priorities'],
              ...PRIORITY_OPTIONS.map(
                (priority) => [
                  priority,
                  priority,
                ]
              ),
            ]}
          />

          <button
            className="primary"
            onClick={() =>
              setEditingJob({
                ...EMPTY_JOB,
                completion_checklist:
                  DEFAULT_CHECKLIST.map((item) => ({ ...item })),
              })
            }
          >
            + Job
          </button>
        </div>
      </div>

      {errorMessage && (
        <section className="panel">
          <strong>Jobs error:</strong>
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
          <span>Total Jobs</span>
          <strong>{jobs.length}</strong>
        </div>

        <div className="metric">
          <span>Open</span>
          <strong>
            {
              jobs.filter(
                (job) =>
                  ![
                    'Completed',
                    'Cancelled',
                  ].includes(job.status)
              ).length
            }
          </strong>
        </div>

        <div className="metric">
          <span>In Progress</span>
          <strong>
            {
              jobs.filter(
                (job) =>
                  job.status ===
                  'In Progress'
              ).length
            }
          </strong>
        </div>

        <div className="metric">
          <span>Emergency</span>
          <strong>
            {
              jobs.filter(
                (job) =>
                  job.priority ===
                    'Emergency' &&
                  ![
                    'Completed',
                    'Cancelled',
                  ].includes(job.status)
              ).length
            }
          </strong>
        </div>
      </div>

      <div className="cards">
        {filteredJobs.map((job) => {
          const customer =
            customerById[job.customer_id]

          const property =
            propertyById[job.property_id]

          const lift =
            boatLiftById[job.boat_lift_id]

          return (
            <article
              className="card"
              key={job.id}
            >
              <div className="between">
                <div>
                  <h3>{jobLabel(job)}</h3>

                  <div className="small">
                    {customerName(customer)} ·{' '}
                    {property?.address ||
                      'No property'}
                  </div>
                </div>

                <div className="actions">
                  <Badge>
                    {job.job_type || 'Repair'}
                  </Badge>

                  <Badge>
                    {job.priority ||
                      'Normal'}
                  </Badge>

                  <Badge>
                    {job.status || 'New'}
                  </Badge>
                </div>
              </div>

              <div className="grid-2">
                <div>
                  <p><b>Boat Lift:</b>{' '}{lift?.lift_number || '—'}</p>
                  <p><b>Crew:</b>{' '}{job.crew || 'Unassigned'}</p>
                </div>

                <div>
                  <p><b>Due:</b>{' '}{formatDate(job.due_date)}</p>
                  <p><b>Contract:</b>{' '}{formatCurrency(job.contract_amount)}</p>
                </div>
              </div>

              {job.scope && (
                <p>{job.scope}</p>
              )}

              <div className="actions">
                <button
                  className="primary"
                  onClick={() =>
                    setSelectedJobId(job.id)
                  }
                >
                  Open Job
                </button>

                <button
                  className="secondary"
                  onClick={() =>
                    setEditingJob({
                      ...job,
                      materials_used: arrayValue(job.materials_used),
                      labor_entries: arrayValue(job.labor_entries),
                      daily_logs: arrayValue(job.daily_logs),
                      completion_checklist: normalizeChecklist(job.completion_checklist),
                    })
                  }
                >
                  Edit
                </button>

                <button
                  className="danger"
                  onClick={() =>
                    deleteJob(job)
                  }
                >
                  Delete
                </button>
              </div>
            </article>
          )
        })}

        {!filteredJobs.length && (
          <Empty>
            {jobs.length
              ? 'No jobs match your filters'
              : 'No jobs have been added yet'}
          </Empty>
        )}
      </div>

      {editingJob && (
        <JobEditor
          initial={editingJob}
          customers={customers}
          properties={properties}
          boatLifts={boatLifts}
          employees={employees}
          saving={saving}
          onClose={() =>
            setEditingJob(null)
          }
          onSave={saveJob}
        />
      )}
    </>
  )
}

function JobEditor({
  initial,
  customers,
  properties,
  boatLifts,
  employees,
  saving,
  onClose,
  onSave,
}) {
  const [values, setValues] = useState({
    ...EMPTY_JOB,
    ...initial,
    assigned_employee_ids:
      Array.isArray(
        initial.assigned_employee_ids
      )
        ? initial.assigned_employee_ids
        : [],
    materials_used: arrayValue(initial.materials_used),
    labor_entries: arrayValue(initial.labor_entries),
    daily_logs: arrayValue(initial.daily_logs),
    completion_checklist: normalizeChecklist(
      initial.completion_checklist
    ),
  })

  function setValue(key, value) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }))
  }

  function toggleEmployee(employeeId) {
    setValues((current) => {
      const ids = Array.isArray(
        current.assigned_employee_ids
      )
        ? current.assigned_employee_ids
        : []

      return {
        ...current,
        assigned_employee_ids:
          ids.includes(employeeId)
            ? ids.filter(
                (id) => id !== employeeId
              )
            : [...ids, employeeId],
      }
    })
  }

  function addMaterial() {
    setValue('materials_used', [
      ...values.materials_used,
      {
        id: createId(),
        name: '',
        part_number: '',
        quantity: 1,
        unit: 'ea',
        cost: '',
      },
    ])
  }

  function updateMaterial(id, key, value) {
    setValue(
      'materials_used',
      values.materials_used.map((item) =>
        item.id === id
          ? { ...item, [key]: value }
          : item
      )
    )
  }

  function removeMaterial(id) {
    setValue(
      'materials_used',
      values.materials_used.filter(
        (item) => item.id !== id
      )
    )
  }

  function addLaborEntry() {
    setValue('labor_entries', [
      ...values.labor_entries,
      {
        id: createId(),
        employee_id: '',
        employee_name: '',
        start: '',
        end: '',
        hours: '',
        notes: '',
      },
    ])
  }

  function updateLaborEntry(id, key, value) {
    setValue(
      'labor_entries',
      values.labor_entries.map((item) =>
        item.id === id
          ? { ...item, [key]: value }
          : item
      )
    )
  }

  function removeLaborEntry(id) {
    setValue(
      'labor_entries',
      values.labor_entries.filter(
        (item) => item.id !== id
      )
    )
  }

  function addDailyLog() {
    setValue('daily_logs', [
      ...values.daily_logs,
      {
        id: createId(),
        date: new Date().toISOString().slice(0, 10),
        employee_name: '',
        notes: '',
      },
    ])
  }

  function updateDailyLog(id, key, value) {
    setValue(
      'daily_logs',
      values.daily_logs.map((item) =>
        item.id === id
          ? { ...item, [key]: value }
          : item
      )
    )
  }

  function removeDailyLog(id) {
    setValue(
      'daily_logs',
      values.daily_logs.filter(
        (item) => item.id !== id
      )
    )
  }

  function toggleChecklist(id) {
    setValue(
      'completion_checklist',
      values.completion_checklist.map((item) =>
        item.id === id
          ? { ...item, completed: !item.completed }
          : item
      )
    )
  }

  const availableProperties =
    properties.filter(
      (property) =>
        !values.customer_id ||
        property.customer_id ===
          values.customer_id
    )

  const availableBoatLifts =
    boatLifts.filter(
      (lift) =>
        (!values.customer_id ||
          lift.customer_id ===
            values.customer_id) &&
        (!values.property_id ||
          lift.property_id ===
            values.property_id)
    )

  async function submit(event) {
    event.preventDefault()
    await onSave(values)
  }

  return (
    <Modal
      title={
        initial.id
          ? 'Edit Job'
          : 'Add Job'
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field
            label="Job Number"
            value={values.number}
            onChange={(value) =>
              setValue('number', value)
            }
          />

          <Field
            label="Job Title"
            value={values.title}
            onChange={(value) =>
              setValue('title', value)
            }
            required
          />

          <SelectField
            label="Job Type"
            value={values.job_type}
            onChange={(value) =>
              setValue('job_type', value)
            }
            options={JOB_TYPE_OPTIONS.map(
              (type) => [type, type]
            )}
          />

          <SelectField
            label="Customer"
            value={values.customer_id}
            onChange={(value) => {
              setValue('customer_id', value)
              setValue('property_id', '')
              setValue('boat_lift_id', '')
            }}
            options={[
              ['', 'Select customer'],
              ...customers.map((customer) => [
                customer.id,
                customerName(customer),
              ]),
            ]}
            required
          />

          <SelectField
            label="Property"
            value={values.property_id}
            onChange={(value) => {
              setValue('property_id', value)
              setValue('boat_lift_id', '')
            }}
            options={[
              ['', 'Select property'],
              ...availableProperties.map(
                (property) => [
                  property.id,
                  property.address,
                ]
              ),
            ]}
          />

          <SelectField
            label="Boat Lift"
            value={values.boat_lift_id}
            onChange={(value) =>
              setValue('boat_lift_id', value)
            }
            options={[
              ['', 'Select boat lift'],
              ...availableBoatLifts.map(
                (lift) => [
                  lift.id,
                  lift.lift_number ||
                    'Unnumbered Lift',
                ]
              ),
            ]}
          />

          <SelectField
            label="Status"
            value={values.status}
            onChange={(value) =>
              setValue('status', value)
            }
            options={STATUS_OPTIONS.map(
              (status) => [
                status,
                status,
              ]
            )}
          />

          <SelectField
            label="Priority"
            value={values.priority}
            onChange={(value) =>
              setValue('priority', value)
            }
            options={PRIORITY_OPTIONS.map(
              (priority) => [
                priority,
                priority,
              ]
            )}
          />

          <Field
            label="Start Date"
            value={values.start_date}
            onChange={(value) =>
              setValue('start_date', value)
            }
            type="date"
          />

          <Field
            label="Due Date"
            value={values.due_date}
            onChange={(value) =>
              setValue('due_date', value)
            }
            type="date"
          />

          <Field
            label="Scheduled Start"
            value={
              values.scheduled_start
                ? String(
                    values.scheduled_start
                  ).slice(0, 16)
                : ''
            }
            onChange={(value) =>
              setValue(
                'scheduled_start',
                value
              )
            }
            type="datetime-local"
          />

          <Field
            label="Scheduled End"
            value={
              values.scheduled_end
                ? String(
                    values.scheduled_end
                  ).slice(0, 16)
                : ''
            }
            onChange={(value) =>
              setValue(
                'scheduled_end',
                value
              )
            }
            type="datetime-local"
          />

          <Field
            label="Contract Amount"
            value={values.contract_amount}
            onChange={(value) =>
              setValue(
                'contract_amount',
                value
              )
            }
            type="number"
          />

          <Field
            label="Material Cost"
            value={values.material_cost}
            onChange={(value) =>
              setValue(
                'material_cost',
                value
              )
            }
            type="number"
          />

          <Field
            label="Labor Cost"
            value={values.labor_cost}
            onChange={(value) =>
              setValue(
                'labor_cost',
                value
              )
            }
            type="number"
          />

          <Field
            label="Other Cost"
            value={values.other_cost}
            onChange={(value) =>
              setValue(
                'other_cost',
                value
              )
            }
            type="number"
          />

          <Field
            label="Scope of Work"
            value={values.scope}
            onChange={(value) =>
              setValue('scope', value)
            }
            type="textarea"
            wide
          />

          <Field
            label="Equipment Used"
            value={values.equipment_used}
            onChange={(value) =>
              setValue('equipment_used', value)
            }
            type="textarea"
            wide
          />

          <Field
            label="Dispatch Notes"
            value={values.dispatch_notes}
            onChange={(value) =>
              setValue(
                'dispatch_notes',
                value
              )
            }
            type="textarea"
            wide
          />

          <Field
            label="Internal Notes"
            value={values.notes}
            onChange={(value) =>
              setValue('notes', value)
            }
            type="textarea"
            wide
          />
        </div>

        <section className="panel">
          <div className="between">
            <h2>Materials Used</h2>
            <button
              type="button"
              className="primary"
              onClick={addMaterial}
            >
              + Material
            </button>
          </div>

          <div className="cards">
            {values.materials_used.map((item) => (
              <article className="card" key={item.id}>
                <div className="form-grid">
                  <Field
                    label="Material / Part"
                    value={item.name}
                    onChange={(value) =>
                      updateMaterial(item.id, 'name', value)
                    }
                  />

                  <Field
                    label="Part Number"
                    value={item.part_number}
                    onChange={(value) =>
                      updateMaterial(item.id, 'part_number', value)
                    }
                  />

                  <Field
                    label="Quantity"
                    value={item.quantity}
                    type="number"
                    onChange={(value) =>
                      updateMaterial(item.id, 'quantity', value)
                    }
                  />

                  <Field
                    label="Unit"
                    value={item.unit}
                    onChange={(value) =>
                      updateMaterial(item.id, 'unit', value)
                    }
                  />

                  <Field
                    label="Cost"
                    value={item.cost}
                    type="number"
                    onChange={(value) =>
                      updateMaterial(item.id, 'cost', value)
                    }
                  />
                </div>

                <div className="actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => removeMaterial(item.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}

            {!values.materials_used.length && (
              <Empty>No materials added</Empty>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="between">
            <h2>Labor Entries</h2>
            <button
              type="button"
              className="primary"
              onClick={addLaborEntry}
            >
              + Labor Entry
            </button>
          </div>

          <div className="cards">
            {values.labor_entries.map((entry) => (
              <article className="card" key={entry.id}>
                <div className="form-grid">
                  <SelectField
                    label="Employee"
                    value={entry.employee_id}
                    onChange={(value) =>
                      updateLaborEntry(entry.id, 'employee_id', value)
                    }
                    options={[
                      ['', 'Select employee'],
                      ...employees.map((employee) => [
                        employee.id,
                        employeeName(employee),
                      ]),
                    ]}
                  />

                  <Field
                    label="Manual Hours"
                    value={entry.hours}
                    type="number"
                    onChange={(value) =>
                      updateLaborEntry(entry.id, 'hours', value)
                    }
                  />

                  <Field
                    label="Start"
                    value={entry.start ? String(entry.start).slice(0, 16) : ''}
                    type="datetime-local"
                    onChange={(value) =>
                      updateLaborEntry(entry.id, 'start', value)
                    }
                  />

                  <Field
                    label="End"
                    value={entry.end ? String(entry.end).slice(0, 16) : ''}
                    type="datetime-local"
                    onChange={(value) =>
                      updateLaborEntry(entry.id, 'end', value)
                    }
                  />

                  <Field
                    label="Labor Notes"
                    value={entry.notes}
                    type="textarea"
                    wide
                    onChange={(value) =>
                      updateLaborEntry(entry.id, 'notes', value)
                    }
                  />
                </div>

                <div className="actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => removeLaborEntry(entry.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}

            {!values.labor_entries.length && (
              <Empty>No labor entries added</Empty>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="between">
            <h2>Daily Work Log</h2>
            <button
              type="button"
              className="primary"
              onClick={addDailyLog}
            >
              + Log Entry
            </button>
          </div>

          <div className="cards">
            {values.daily_logs.map((log) => (
              <article className="card" key={log.id}>
                <div className="form-grid">
                  <Field
                    label="Date"
                    value={log.date}
                    type="date"
                    onChange={(value) =>
                      updateDailyLog(log.id, 'date', value)
                    }
                  />

                  <Field
                    label="Employee"
                    value={log.employee_name}
                    onChange={(value) =>
                      updateDailyLog(log.id, 'employee_name', value)
                    }
                  />

                  <Field
                    label="Work Performed"
                    value={log.notes}
                    type="textarea"
                    wide
                    onChange={(value) =>
                      updateDailyLog(log.id, 'notes', value)
                    }
                  />
                </div>

                <div className="actions">
                  <button
                    type="button"
                    className="danger"
                    onClick={() => removeDailyLog(log.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}

            {!values.daily_logs.length && (
              <Empty>No daily logs added</Empty>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Completion Checklist</h2>

          <div style={{ display: 'grid', gap: 12 }}>
            {values.completion_checklist.map((item) => (
              <label
                className="card"
                key={item.id}
                style={{ cursor: 'pointer' }}
              >
                <div className="between">
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={() => toggleChecklist(item.id)}
                  />
                </div>
              </label>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Assign Crew</h2>

          <div className="cards">
            {employees.map((employee) => (
              <label
                className="card"
                key={employee.id}
                style={{
                  cursor: 'pointer',
                }}
              >
                <div className="between">
                  <div>
                    <strong>
                      {employeeName(employee)}
                    </strong>

                    <div className="small">
                      {employee.role ||
                        'Employee'}
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={values.assigned_employee_ids.includes(
                      employee.id
                    )}
                    onChange={() =>
                      toggleEmployee(
                        employee.id
                      )
                    }
                  />
                </div>
              </label>
            ))}

            {!employees.length && (
              <Empty>
                No employees have been added
              </Empty>
            )}
          </div>
        </section>

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
            {saving
              ? 'Saving...'
              : 'Save Job'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

const PHOTO_BUCKET = 'job-photos'

function objectValue(value) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)

      return (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      )
        ? parsed
        : null
    } catch {
      return null
    }
  }

  return null
}

function fileExtension(file) {
  const name = String(file?.name || '')
  const dot = name.lastIndexOf('.')

  if (dot === -1) {
    return 'jpg'
  }

  return name.slice(dot + 1).toLowerCase()
}

function JobFieldWork({
  job,
  employees,
  onJobUpdated,
}) {
  const [beforePhotos, setBeforePhotos] =
    useState(arrayValue(job.before_photos))

  const [afterPhotos, setAfterPhotos] =
    useState(arrayValue(job.after_photos))

  const [activeClock, setActiveClock] =
    useState(objectValue(job.active_clock))

  const [selectedEmployeeId, setSelectedEmployeeId] =
    useState('')

  const [customerSignature, setCustomerSignature] =
    useState(job.customer_signature || '')

  const [technicianSignature, setTechnicianSignature] =
    useState(job.technician_signature || '')

  const [uploading, setUploading] =
    useState(false)

  const [savingClock, setSavingClock] =
    useState(false)

  const [savingSignature, setSavingSignature] =
    useState(false)

  useEffect(() => {
    setBeforePhotos(arrayValue(job.before_photos))
    setAfterPhotos(arrayValue(job.after_photos))
    setActiveClock(objectValue(job.active_clock))
    setCustomerSignature(job.customer_signature || '')
    setTechnicianSignature(
      job.technician_signature || ''
    )
  }, [job])

  async function updateJob(fields) {
    const { data, error } = await supabase
      .from('jobs')
      .update(fields)
      .eq('id', job.id)
      .select()
      .single()

    if (error) {
      throw error
    }

    onJobUpdated?.(data)
    return data
  }

  async function uploadPhotos(
    event,
    photoType
  ) {
    const files = Array.from(
      event.target.files || []
    )

    event.target.value = ''

    if (!files.length) {
      return
    }

    setUploading(true)

    try {
      const uploaded = []

      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          continue
        }

        const path = `${
          job.id
        }/${photoType}/${Date.now()}-${createId()}.${
          fileExtension(file)
        }`

        const { error: uploadError } =
          await supabase.storage
            .from(PHOTO_BUCKET)
            .upload(path, file, {
              cacheControl: '3600',
              upsert: false,
              contentType: file.type,
            })

        if (uploadError) {
          throw uploadError
        }

        const { data: publicData } =
          supabase.storage
            .from(PHOTO_BUCKET)
            .getPublicUrl(path)

        uploaded.push({
          id: createId(),
          path,
          url: publicData.publicUrl,
          name: file.name,
          uploaded_at:
            new Date().toISOString(),
        })
      }

      const current =
        photoType === 'before'
          ? beforePhotos
          : afterPhotos

      const next = [...current, ...uploaded]
      const field =
        photoType === 'before'
          ? 'before_photos'
          : 'after_photos'

      await updateJob({
        [field]: next,
      })

      if (photoType === 'before') {
        setBeforePhotos(next)
      } else {
        setAfterPhotos(next)
      }
    } catch (error) {
      console.error(
        'Unable to upload job photos:',
        error
      )
      alert(error.message)
    } finally {
      setUploading(false)
    }
  }

  async function deletePhoto(
    photo,
    photoType
  ) {
    const confirmed = window.confirm(
      'Delete this job photo?'
    )

    if (!confirmed) {
      return
    }

    try {
      if (photo.path) {
        const { error: storageError } =
          await supabase.storage
            .from(PHOTO_BUCKET)
            .remove([photo.path])

        if (storageError) {
          throw storageError
        }
      }

      const current =
        photoType === 'before'
          ? beforePhotos
          : afterPhotos

      const next = current.filter(
        (item) => item.id !== photo.id
      )

      const field =
        photoType === 'before'
          ? 'before_photos'
          : 'after_photos'

      await updateJob({
        [field]: next,
      })

      if (photoType === 'before') {
        setBeforePhotos(next)
      } else {
        setAfterPhotos(next)
      }
    } catch (error) {
      console.error(
        'Unable to delete job photo:',
        error
      )
      alert(error.message)
    }
  }

  async function clockIn() {
    if (!selectedEmployeeId) {
      alert('Select the employee clocking in.')
      return
    }

    const employee = employees.find(
      (item) =>
        item.id === selectedEmployeeId
    )

    const nextClock = {
      employee_id: selectedEmployeeId,
      employee_name: employeeName(employee),
      started_at: new Date().toISOString(),
    }

    setSavingClock(true)

    try {
      await updateJob({
        active_clock: nextClock,
        status:
          job.status === 'New' ||
          job.status === 'Scheduled' ||
          job.status === 'Dispatched'
            ? 'In Progress'
            : job.status,
      })

      setActiveClock(nextClock)
    } catch (error) {
      console.error(
        'Unable to clock in:',
        error
      )
      alert(error.message)
    } finally {
      setSavingClock(false)
    }
  }

  async function clockOut() {
    if (!activeClock?.started_at) {
      return
    }

    const endedAt = new Date().toISOString()
    const startedAt =
      new Date(activeClock.started_at)

    const endedDate = new Date(endedAt)

    const hours =
      !Number.isNaN(startedAt.getTime()) &&
      !Number.isNaN(endedDate.getTime())
        ? Math.max(
            0,
            (endedDate - startedAt) /
              3600000
          )
        : 0

    const existingEntries = arrayValue(
      job.labor_entries
    )

    const nextEntries = [
      ...existingEntries,
      {
        id: createId(),
        employee_id:
          activeClock.employee_id || '',
        employee_name:
          activeClock.employee_name ||
          'Employee',
        start: activeClock.started_at,
        end: endedAt,
        hours:
          Math.round(hours * 100) / 100,
        notes: 'Field clock entry',
      },
    ]

    setSavingClock(true)

    try {
      await updateJob({
        active_clock: null,
        labor_entries: nextEntries,
      })

      setActiveClock(null)
      setSelectedEmployeeId('')
    } catch (error) {
      console.error(
        'Unable to clock out:',
        error
      )
      alert(error.message)
    } finally {
      setSavingClock(false)
    }
  }

  async function saveSignatures() {
    setSavingSignature(true)

    try {
      await updateJob({
        customer_signature:
          customerSignature || null,
        technician_signature:
          technicianSignature || null,
        customer_signed_at:
          customerSignature
            ? job.customer_signed_at ||
              new Date().toISOString()
            : null,
        technician_signed_at:
          technicianSignature
            ? job.technician_signed_at ||
              new Date().toISOString()
            : null,
      })
    } catch (error) {
      console.error(
        'Unable to save signatures:',
        error
      )
      alert(error.message)
    } finally {
      setSavingSignature(false)
    }
  }

  return (
    <>
      <section className="panel">
        <div className="between">
          <div>
            <h2>Field Time Clock</h2>
            <p className="small">
              Clocked time is added to the
              job's labor entries.
            </p>
          </div>

          {activeClock && (
            <Badge>Clocked In</Badge>
          )}
        </div>

        {activeClock ? (
          <div className="card">
            <p>
              <b>Employee:</b>{' '}
              {activeClock.employee_name ||
                'Employee'}
            </p>

            <p>
              <b>Clocked In:</b>{' '}
              {formatDateTime(
                activeClock.started_at
              )}
            </p>

            <button
              type="button"
              className="primary"
              disabled={savingClock}
              onClick={clockOut}
            >
              {savingClock
                ? 'Saving...'
                : 'Clock Out'}
            </button>
          </div>
        ) : (
          <div className="actions">
            <SelectField
              label="Employee"
              value={selectedEmployeeId}
              onChange={setSelectedEmployeeId}
              options={[
                ['', 'Select employee'],
                ...employees.map((employee) => [
                  employee.id,
                  employeeName(employee),
                ]),
              ]}
            />

            <button
              type="button"
              className="primary"
              disabled={savingClock}
              onClick={clockIn}
            >
              {savingClock
                ? 'Saving...'
                : 'Clock In'}
            </button>
          </div>
        )}
      </section>

      <div className="grid-2">
        <PhotoSection
          title="Before Photos"
          photos={beforePhotos}
          uploading={uploading}
          onUpload={(event) =>
            uploadPhotos(event, 'before')
          }
          onDelete={(photo) =>
            deletePhoto(photo, 'before')
          }
        />

        <PhotoSection
          title="After Photos"
          photos={afterPhotos}
          uploading={uploading}
          onUpload={(event) =>
            uploadPhotos(event, 'after')
          }
          onDelete={(photo) =>
            deletePhoto(photo, 'after')
          }
        />
      </div>

      <section className="panel">
        <div className="between">
          <div>
            <h2>Job Signatures</h2>
            <p className="small">
              Signatures are saved directly
              to this job.
            </p>
          </div>

          <button
            type="button"
            className="primary"
            disabled={savingSignature}
            onClick={saveSignatures}
          >
            {savingSignature
              ? 'Saving...'
              : 'Save Signatures'}
          </button>
        </div>

        <div className="grid-2">
          <SignaturePad
            title="Customer Signature"
            value={customerSignature}
            onChange={setCustomerSignature}
          />

          <SignaturePad
            title="Technician Signature"
            value={technicianSignature}
            onChange={setTechnicianSignature}
          />
        </div>
      </section>
    </>
  )
}

function PhotoSection({
  title,
  photos,
  uploading,
  onUpload,
  onDelete,
}) {
  return (
    <section className="panel">
      <div className="between">
        <h2>{title}</h2>

        <label
          className="primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            cursor: uploading
              ? 'not-allowed'
              : 'pointer',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading
            ? 'Uploading...'
            : '+ Add Photos'}

          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={onUpload}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      <div className="cards">
        {photos.map((photo) => (
          <article
            className="card"
            key={photo.id}
          >
            <img
              src={photo.url}
              alt={photo.name || title}
              style={{
                width: '100%',
                height: 180,
                objectFit: 'cover',
                borderRadius: 10,
              }}
            />

            <div className="small">
              {photo.name || 'Job photo'}
            </div>

            <button
              type="button"
              className="danger"
              onClick={() => onDelete(photo)}
            >
              Delete Photo
            </button>
          </article>
        ))}

        {!photos.length && (
          <Empty>No photos uploaded</Empty>
        )}
      </div>
    </section>
  )
}

function SignaturePad({
  title,
  value,
  onChange,
}) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const context =
      canvas.getContext('2d')

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    )

    context.fillStyle = '#ffffff'
    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    )

    context.strokeStyle = '#0f172a'
    context.lineWidth = 2
    context.lineCap = 'round'

    if (value) {
      const image = new Image()

      image.onload = () => {
        context.drawImage(
          image,
          0,
          0,
          canvas.width,
          canvas.height
        )
      }

      image.src = value
    }
  }, [value])

  function pointerPosition(event) {
    const canvas = canvasRef.current
    const rectangle =
      canvas.getBoundingClientRect()

    return {
      x:
        (event.clientX - rectangle.left) *
        (canvas.width / rectangle.width),
      y:
        (event.clientY - rectangle.top) *
        (canvas.height / rectangle.height),
    }
  }

  function startDrawing(event) {
    event.preventDefault()
    drawingRef.current = true

    const context =
      canvasRef.current.getContext('2d')

    const point = pointerPosition(event)

    context.beginPath()
    context.moveTo(point.x, point.y)

    canvasRef.current.setPointerCapture?.(
      event.pointerId
    )
  }

  function draw(event) {
    if (!drawingRef.current) {
      return
    }

    event.preventDefault()

    const context =
      canvasRef.current.getContext('2d')

    const point = pointerPosition(event)

    context.lineTo(point.x, point.y)
    context.stroke()
  }

  function stopDrawing(event) {
    if (!drawingRef.current) {
      return
    }

    event.preventDefault()
    drawingRef.current = false

    onChange(
      canvasRef.current.toDataURL(
        'image/png'
      )
    )
  }

  function clearSignature() {
    onChange('')
  }

  return (
    <div className="card">
      <div className="between">
        <strong>{title}</strong>

        <button
          type="button"
          className="secondary"
          onClick={clearSignature}
        >
          Clear
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={700}
        height={220}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={stopDrawing}
        style={{
          display: 'block',
          width: '100%',
          height: 180,
          marginTop: 12,
          background: '#ffffff',
          border: '1px solid #d6d9df',
          borderRadius: 10,
          touchAction: 'none',
          cursor: 'crosshair',
        }}
      />
    </div>
  )
}

function JobCompletionCenter({
  job,
  customer,
  property,
  lift,
  employees,
  onJobUpdated,
}) {
  const [inventoryName, setInventoryName] =
    useState('')

  const [inventoryPart, setInventoryPart] =
    useState('')

  const [inventoryQuantity, setInventoryQuantity] =
    useState('1')

  const [inventoryUnit, setInventoryUnit] =
    useState('each')

  const [inventoryCost, setInventoryCost] =
    useState('')

  const [savingInventory, setSavingInventory] =
    useState(false)

  const [savingLocation, setSavingLocation] =
    useState(false)

  const [documentStatus, setDocumentStatus] =
    useState('')

  const currentMaterials = arrayValue(
    job.materials_used
  )

  const currentLogs = arrayValue(
    job.daily_logs
  )

  async function updateJob(fields) {
    const { data, error } = await supabase
      .from('jobs')
      .update(fields)
      .eq('id', job.id)
      .select()
      .single()

    if (error) {
      throw error
    }

    onJobUpdated?.(data)
    return data
  }

  async function checkoutInventory() {
    const name = inventoryName.trim()

    if (!name) {
      alert('Enter an inventory item.')
      return
    }

    const quantity = Number(
      inventoryQuantity || 0
    )

    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert('Enter a quantity greater than zero.')
      return
    }

    const cost = Number(inventoryCost || 0)

    const nextMaterials = [
      ...currentMaterials,
      {
        id: createId(),
        name,
        part_number:
          inventoryPart.trim(),
        quantity,
        unit:
          inventoryUnit.trim() || 'each',
        cost:
          Number.isFinite(cost)
            ? cost
            : 0,
        checked_out_at:
          new Date().toISOString(),
        source: 'job_inventory_checkout',
      },
    ]

    const nextMaterialCost =
      nextMaterials.reduce(
        (total, item) =>
          total +
          Number(item.quantity || 0) *
            Number(item.cost || 0),
        0
      )

    setSavingInventory(true)

    try {
      await updateJob({
        materials_used: nextMaterials,
        material_cost:
          Math.round(nextMaterialCost * 100) /
          100,
      })

      setInventoryName('')
      setInventoryPart('')
      setInventoryQuantity('1')
      setInventoryUnit('each')
      setInventoryCost('')
    } catch (error) {
      console.error(
        'Unable to check out inventory:',
        error
      )
      alert(error.message)
    } finally {
      setSavingInventory(false)
    }
  }

  async function removeInventoryItem(itemId) {
    const confirmed = window.confirm(
      'Remove this item from the job?'
    )

    if (!confirmed) {
      return
    }

    const nextMaterials =
      currentMaterials.filter(
        (item) => item.id !== itemId
      )

    const nextMaterialCost =
      nextMaterials.reduce(
        (total, item) =>
          total +
          Number(item.quantity || 0) *
            Number(item.cost || 0),
        0
      )

    try {
      await updateJob({
        materials_used: nextMaterials,
        material_cost:
          Math.round(nextMaterialCost * 100) /
          100,
      })
    } catch (error) {
      console.error(
        'Unable to remove inventory item:',
        error
      )
      alert(error.message)
    }
  }

  function captureLocation(eventType) {
    if (!navigator.geolocation) {
      alert(
        'Location services are not supported by this browser.'
      )
      return
    }

    setSavingLocation(true)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const timestamp =
          new Date().toISOString()

        const locationEntry = {
          id: createId(),
          date: timestamp.slice(0, 10),
          employee_name:
            eventType === 'arrival'
              ? 'GPS Arrival'
              : 'GPS Departure',
          notes:
            `${eventType === 'arrival' ? 'Arrived' : 'Departed'} at ` +
            `${position.coords.latitude.toFixed(6)}, ` +
            `${position.coords.longitude.toFixed(6)}`,
          type:
            eventType === 'arrival'
              ? 'gps_arrival'
              : 'gps_departure',
          timestamp,
          latitude:
            position.coords.latitude,
          longitude:
            position.coords.longitude,
          accuracy:
            position.coords.accuracy,
        }

        try {
          await updateJob({
            daily_logs: [
              ...currentLogs,
              locationEntry,
            ],
            status:
              eventType === 'arrival' &&
              ['New', 'Scheduled', 'Dispatched'].includes(
                job.status
              )
                ? 'In Progress'
                : job.status,
          })
        } catch (error) {
          console.error(
            'Unable to save location:',
            error
          )
          alert(error.message)
        } finally {
          setSavingLocation(false)
        }
      },
      (error) => {
        setSavingLocation(false)
        alert(
          error.message ||
            'Unable to capture location.'
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    )
  }

  function openPrintableDocument(
    documentType
  ) {
    const printableWindow = window.open(
      '',
      '_blank',
      'width=1000,height=850'
    )

    if (!printableWindow) {
      alert(
        'Allow pop-ups to generate this document.'
      )
      return
    }

    const materials =
      arrayValue(job.materials_used)

    const labor =
      arrayValue(job.labor_entries)

    const logs =
      arrayValue(job.daily_logs)

    const checklist =
      normalizeChecklist(
        job.completion_checklist
      )

    const beforePhotos =
      arrayValue(job.before_photos)

    const afterPhotos =
      arrayValue(job.after_photos)

    const totalCost =
      Number(job.material_cost || 0) +
      Number(job.labor_cost || 0) +
      Number(job.other_cost || 0)

    const grossProfit =
      Number(job.contract_amount || 0) -
      totalCost

    const customerDisplay =
      customerName(customer)

    const title =
      documentType === 'invoice'
        ? `Invoice - ${jobLabel(job)}`
        : `Service Report - ${jobLabel(job)}`

    const materialsRows = materials
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.name || 'Material')}</td>
            <td>${escapeHtml(item.part_number || '')}</td>
            <td>${escapeHtml(String(item.quantity || 0))}</td>
            <td>${escapeHtml(item.unit || '')}</td>
            <td>${escapeHtml(formatCurrency(item.cost))}</td>
            <td>${escapeHtml(
              formatCurrency(
                Number(item.quantity || 0) *
                Number(item.cost || 0)
              )
            )}</td>
          </tr>
        `
      )
      .join('')

    const laborRows = labor
      .map((entry) => {
        const employee =
          employees.find(
            (item) =>
              item.id === entry.employee_id
          )

        const hours =
          entry.hours !== '' &&
          entry.hours !== null &&
          entry.hours !== undefined
            ? Number(entry.hours || 0)
            : calculateLaborHours([entry])

        return `
          <tr>
            <td>${escapeHtml(
              employeeName(employee) ||
              entry.employee_name ||
              'Employee'
            )}</td>
            <td>${escapeHtml(
              formatDateTime(entry.start)
            )}</td>
            <td>${escapeHtml(
              formatDateTime(entry.end)
            )}</td>
            <td>${hours.toFixed(2)}</td>
            <td>${escapeHtml(entry.notes || '')}</td>
          </tr>
        `
      })
      .join('')

    const logRows = logs
      .map(
        (entry) => `
          <tr>
            <td>${escapeHtml(
              formatDateTime(
                entry.timestamp ||
                entry.date
              )
            )}</td>
            <td>${escapeHtml(
              entry.employee_name || ''
            )}</td>
            <td>${escapeHtml(entry.notes || '')}</td>
          </tr>
        `
      )
      .join('')

    const checklistRows = checklist
      .map(
        (item) => `
          <li>
            ${item.completed ? '✓' : '○'}
            ${escapeHtml(item.label)}
          </li>
        `
      )
      .join('')

    const photoHtml = [
      ...beforePhotos.map((photo) => ({
        ...photo,
        category: 'Before',
      })),
      ...afterPhotos.map((photo) => ({
        ...photo,
        category: 'After',
      })),
    ]
      .map(
        (photo) => `
          <figure>
            <img src="${escapeAttribute(photo.url || '')}" alt="${escapeAttribute(photo.name || 'Job photo')}" />
            <figcaption>
              ${escapeHtml(photo.category)}:
              ${escapeHtml(photo.name || 'Job photo')}
            </figcaption>
          </figure>
        `
      )
      .join('')

    const financialSection =
      documentType === 'invoice'
        ? `
          <section>
            <h2>Invoice Summary</h2>
            <table>
              <tbody>
                <tr>
                  <th>Contract Amount</th>
                  <td>${escapeHtml(formatCurrency(job.contract_amount))}</td>
                </tr>
                <tr>
                  <th>Material Cost</th>
                  <td>${escapeHtml(formatCurrency(job.material_cost))}</td>
                </tr>
                <tr>
                  <th>Labor Cost</th>
                  <td>${escapeHtml(formatCurrency(job.labor_cost))}</td>
                </tr>
                <tr>
                  <th>Other Cost</th>
                  <td>${escapeHtml(formatCurrency(job.other_cost))}</td>
                </tr>
                <tr class="total">
                  <th>Amount Due</th>
                  <td>${escapeHtml(formatCurrency(job.contract_amount))}</td>
                </tr>
              </tbody>
            </table>
          </section>
        `
        : `
          <section>
            <h2>Job Financial Summary</h2>
            <p><b>Contract:</b> ${escapeHtml(formatCurrency(job.contract_amount))}</p>
            <p><b>Total Cost:</b> ${escapeHtml(formatCurrency(totalCost))}</p>
            <p><b>Gross Profit:</b> ${escapeHtml(formatCurrency(grossProfit))}</p>
          </section>
        `

    printableWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(title)}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 32px;
              font-family: Arial, sans-serif;
              color: #111827;
              line-height: 1.45;
            }
            header {
              border-bottom: 3px solid #0f172a;
              padding-bottom: 18px;
              margin-bottom: 24px;
            }
            h1, h2 { margin: 0 0 12px; }
            h1 { font-size: 28px; }
            h2 {
              font-size: 18px;
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 6px;
              margin-top: 24px;
            }
            .subtle { color: #475569; }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 18px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 8px;
              text-align: left;
              vertical-align: top;
            }
            th { background: #f1f5f9; }
            .total th, .total td {
              font-size: 18px;
              font-weight: 700;
            }
            ul {
              list-style: none;
              padding: 0;
            }
            figure {
              display: inline-block;
              width: 47%;
              margin: 1%;
              vertical-align: top;
            }
            figure img {
              width: 100%;
              max-height: 260px;
              object-fit: cover;
              border: 1px solid #cbd5e1;
            }
            figcaption {
              font-size: 12px;
              color: #475569;
            }
            .signature {
              width: 100%;
              max-height: 130px;
              object-fit: contain;
              border-bottom: 1px solid #111827;
            }
            .no-print {
              position: fixed;
              top: 12px;
              right: 12px;
              padding: 10px 16px;
              border: 0;
              border-radius: 6px;
              background: #0f172a;
              color: white;
              cursor: pointer;
            }
            @media print {
              body { padding: 0; }
              .no-print { display: none; }
              section { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <button class="no-print" onclick="window.print()">
            Print / Save PDF
          </button>

          <header>
            <h1>Galveston Boat Lifts</h1>
            <div class="subtle">${escapeHtml(title)}</div>
          </header>

          <section class="grid">
            <div>
              <h2>Customer</h2>
              <p><b>Name:</b> ${escapeHtml(customerDisplay)}</p>
              <p><b>Phone:</b> ${escapeHtml(customer?.phone || '')}</p>
              <p><b>Email:</b> ${escapeHtml(customer?.email || '')}</p>
            </div>

            <div>
              <h2>Job</h2>
              <p><b>Job:</b> ${escapeHtml(jobLabel(job))}</p>
              <p><b>Type:</b> ${escapeHtml(job.job_type || '')}</p>
              <p><b>Status:</b> ${escapeHtml(job.status || '')}</p>
              <p><b>Property:</b> ${escapeHtml(property?.address || '')}</p>
              <p><b>Boat Lift:</b> ${escapeHtml(lift?.lift_number || '')}</p>
            </div>
          </section>

          <section>
            <h2>Scope of Work</h2>
            <p>${escapeHtml(job.scope || 'No scope entered.')}</p>
          </section>

          ${financialSection}

          <section>
            <h2>Materials</h2>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Part</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Unit Cost</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${materialsRows || '<tr><td colspan="6">No materials recorded</td></tr>'}
              </tbody>
            </table>
          </section>

          ${
            documentType === 'service-report'
              ? `
                <section>
                  <h2>Labor</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Hours</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${laborRows || '<tr><td colspan="5">No labor recorded</td></tr>'}
                    </tbody>
                  </table>
                </section>

                <section>
                  <h2>Work Log and GPS Events</h2>
                  <table>
                    <thead>
                      <tr>
                        <th>Date / Time</th>
                        <th>Entry</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${logRows || '<tr><td colspan="3">No work-log entries</td></tr>'}
                    </tbody>
                  </table>
                </section>

                <section>
                  <h2>Completion Checklist</h2>
                  <ul>${checklistRows}</ul>
                </section>

                <section>
                  <h2>Photos</h2>
                  ${photoHtml || '<p>No job photos.</p>'}
                </section>

                <section class="grid">
                  <div>
                    <h2>Customer Signature</h2>
                    ${
                      job.customer_signature
                        ? `<img class="signature" src="${escapeAttribute(job.customer_signature)}" alt="Customer signature" />`
                        : '<p>Not signed</p>'
                    }
                    <p>${escapeHtml(formatDateTime(job.customer_signed_at))}</p>
                  </div>

                  <div>
                    <h2>Technician Signature</h2>
                    ${
                      job.technician_signature
                        ? `<img class="signature" src="${escapeAttribute(job.technician_signature)}" alt="Technician signature" />`
                        : '<p>Not signed</p>'
                    }
                    <p>${escapeHtml(formatDateTime(job.technician_signed_at))}</p>
                  </div>
                </section>
              `
              : ''
          }
        </body>
      </html>
    `)

    printableWindow.document.close()
    printableWindow.focus()

    setDocumentStatus(
      documentType === 'invoice'
        ? 'Invoice opened'
        : 'Service report opened'
    )
  }

  const checklist =
    normalizeChecklist(
      job.completion_checklist
    )

  const readiness = [
    {
      label: 'Before photos uploaded',
      complete:
        arrayValue(job.before_photos).length > 0,
    },
    {
      label: 'After photos uploaded',
      complete:
        arrayValue(job.after_photos).length > 0,
    },
    {
      label: 'Customer signature saved',
      complete:
        Boolean(job.customer_signature),
    },
    {
      label: 'Technician signature saved',
      complete:
        Boolean(job.technician_signature),
    },
    {
      label: 'No employee currently clocked in',
      complete:
        !objectValue(job.active_clock),
    },
    {
      label: 'Completion checklist finished',
      complete:
        checklist.length > 0 &&
        checklist.every(
          (item) => item.completed
        ),
    },
  ]

  const readyCount =
    readiness.filter(
      (item) => item.complete
    ).length

  return (
    <>
      <section className="panel">
        <div className="between">
          <div>
            <h2>GPS Arrival and Departure</h2>
            <p className="small">
              Location events are saved in the
              job's daily work log.
            </p>
          </div>

          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={savingLocation}
              onClick={() =>
                captureLocation('arrival')
              }
            >
              {savingLocation
                ? 'Saving Location...'
                : 'Record Arrival'}
            </button>

            <button
              type="button"
              className="secondary"
              disabled={savingLocation}
              onClick={() =>
                captureLocation('departure')
              }
            >
              {savingLocation
                ? 'Saving Location...'
                : 'Record Departure'}
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="between">
          <div>
            <h2>Inventory Checkout</h2>
            <p className="small">
              Checked-out items are added to
              Materials Used and update the
              material cost.
            </p>
          </div>

          <Badge>
            {currentMaterials.length} Items
          </Badge>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              '2fr 1fr 1fr 1fr 1fr auto',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <Field
            label="Item"
            value={inventoryName}
            onChange={setInventoryName}
            placeholder="Cable, motor, pulley..."
          />

          <Field
            label="Part Number"
            value={inventoryPart}
            onChange={setInventoryPart}
          />

          <Field
            label="Quantity"
            type="number"
            value={inventoryQuantity}
            onChange={setInventoryQuantity}
          />

          <Field
            label="Unit"
            value={inventoryUnit}
            onChange={setInventoryUnit}
          />

          <Field
            label="Unit Cost"
            type="number"
            value={inventoryCost}
            onChange={setInventoryCost}
          />

          <button
            type="button"
            className="primary"
            disabled={savingInventory}
            onClick={checkoutInventory}
          >
            {savingInventory
              ? 'Saving...'
              : 'Check Out'}
          </button>
        </div>

        <div className="cards">
          {currentMaterials.map((item) => (
            <article
              className="card"
              key={item.id}
            >
              <div className="between">
                <strong>
                  {item.name || 'Material'}
                </strong>

                <button
                  type="button"
                  className="danger"
                  onClick={() =>
                    removeInventoryItem(item.id)
                  }
                >
                  Remove
                </button>
              </div>

              <p>
                {Number(item.quantity || 0)}
                {' '}
                {item.unit || ''}
                {' · '}
                {formatCurrency(item.cost)}
                {' each'}
              </p>

              <div className="small">
                {item.part_number
                  ? `Part ${item.part_number}`
                  : 'No part number'}
              </div>
            </article>
          ))}

          {!currentMaterials.length && (
            <Empty>
              No inventory checked out
            </Empty>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="between">
          <div>
            <h2>Job Documents</h2>
            <p className="small">
              Open a print-ready document and
              choose Print / Save PDF.
            </p>
          </div>

          {documentStatus && (
            <Badge>{documentStatus}</Badge>
          )}
        </div>

        <div className="actions">
          <button
            type="button"
            className="primary"
            onClick={() =>
              openPrintableDocument(
                'service-report'
              )
            }
          >
            Generate Service Report
          </button>

          <button
            type="button"
            className="secondary"
            onClick={() =>
              openPrintableDocument('invoice')
            }
          >
            Generate Invoice
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="between">
          <div>
            <h2>Completion Readiness</h2>
            <p className="small">
              {readyCount} of {readiness.length}
              {' '}completion requirements met.
            </p>
          </div>

          <Badge>
            {readyCount === readiness.length
              ? 'Ready to Complete'
              : 'Work Remaining'}
          </Badge>
        </div>

        <div className="cards">
          {readiness.map((item) => (
            <article
              className="card"
              key={item.label}
            >
              <div className="between">
                <span>{item.label}</span>
                <Badge>
                  {item.complete
                    ? 'Complete'
                    : 'Open'}
                </Badge>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function escapeAttribute(value) {
  return escapeHtml(value)
}
