import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge, Empty, Field, Modal, SelectField } from '../../components/UI'
import { supabase } from '../../lib/supabase'

const ROLE_OPTIONS = [
  'Owner',
  'Administrator',
  'Office Manager',
  'Estimator',
  'Project Manager',
  'Lead Technician',
  'Technician',
  'Helper',
  'Subcontractor',
]

const STATUS_OPTIONS = ['Active', 'Inactive', 'Leave', 'Terminated']
const PAY_TYPE_OPTIONS = ['Hourly', 'Salary', 'Contract']
const PTO_TYPE_OPTIONS = ['Vacation', 'Sick', 'Personal', 'Unpaid Leave', 'Bereavement']
const PTO_STATUS_OPTIONS = ['Requested', 'Approved', 'Denied', 'Cancelled']
const TIME_STATUS_OPTIONS = ['Open', 'Submitted', 'Approved', 'Rejected']
const CERT_STATUS_OPTIONS = ['Current', 'Expiring Soon', 'Expired']

const EMPTY_EMPLOYEE = {
  first_name: '',
  last_name: '',
  preferred_name: '',
  email: '',
  phone: '',
  alternate_phone: '',
  role: 'Technician',
  status: 'Active',
  pay_type: 'Hourly',
  hourly_rate: '',
  overtime_rate: '',
  annual_salary: '',
  hire_date: '',
  termination_date: '',
  birthday: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  state: 'TX',
  postal_code: '',
  emergency_contact_name: '',
  emergency_contact_relationship: '',
  emergency_contact_phone: '',
  shirt_size: '',
  driver_license_number: '',
  driver_license_state: 'TX',
  driver_license_expiration: '',
  skills: '',
  notes: '',
}

const EMPTY_CERTIFICATION = {
  name: '',
  issuing_organization: '',
  certification_number: '',
  issue_date: '',
  expiration_date: '',
  status: 'Current',
  notes: '',
}

const EMPTY_TIME_ENTRY = {
  job_id: '',
  work_date: new Date().toISOString().slice(0, 10),
  clock_in: '',
  clock_out: '',
  regular_hours: '',
  overtime_hours: '',
  break_minutes: '',
  status: 'Open',
  notes: '',
}

const EMPTY_PTO = {
  type: 'Vacation',
  start_date: '',
  end_date: '',
  hours: '',
  status: 'Requested',
  reason: '',
}

const EMPTY_EQUIPMENT = {
  inventory_item_id: '',
  assigned_date: new Date().toISOString().slice(0, 10),
  return_due_date: '',
  returned_date: '',
  condition_out: '',
  condition_in: '',
  notes: '',
}

function createId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function cleanText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function cleanNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString()
}

function employeeName(employee) {
  const legalName = [employee.first_name, employee.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return employee.preferred_name || legalName || employee.name || 'Unnamed Employee'
}

function daysUntil(value) {
  if (!value) return null
  const target = new Date(`${value}T12:00:00`)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return Math.ceil((target - today) / 86400000)
}

function computedCertificationStatus(record) {
  const remaining = daysUntil(record.expiration_date)
  if (remaining === null) return record.status || 'Current'
  if (remaining < 0) return 'Expired'
  if (remaining <= 60) return 'Expiring Soon'
  return 'Current'
}

function calculateTime(entry) {
  const regularOverride = cleanNumber(entry.regular_hours)
  const overtimeOverride = cleanNumber(entry.overtime_hours)

  if (regularOverride !== null || overtimeOverride !== null) {
    const regular = regularOverride || 0
    const overtime = overtimeOverride || 0
    return { regular, overtime, total: regular + overtime }
  }

  if (!entry.work_date || !entry.clock_in || !entry.clock_out) {
    return { regular: 0, overtime: 0, total: 0 }
  }

  const start = new Date(`${entry.work_date}T${entry.clock_in}`)
  const finish = new Date(`${entry.work_date}T${entry.clock_out}`)

  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime())) {
    return { regular: 0, overtime: 0, total: 0 }
  }

  let total = (finish - start) / 3600000
  if (total < 0) total += 24
  total = Math.max(0, total - Number(entry.break_minutes || 0) / 60)

  return {
    regular: Math.min(8, total),
    overtime: Math.max(0, total - 8),
    total,
  }
}

function missingColumnName(error) {
  const message = String(error?.message || '')
  const patterns = [
    /Could not find the ['"]([^'"]+)['"] column/i,
    /column ["']?([^"' ]+)["']? of relation/i,
    /column ([a-zA-Z0-9_]+) does not exist/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

async function adaptiveUpsert(table, payload) {
  const working = { ...payload }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await supabase
      .from(table)
      .upsert(working, { onConflict: 'id' })
      .select()
      .single()

    if (!result.error) return result

    const missing = missingColumnName(result.error)
    if (!missing || !(missing in working)) return result
    delete working[missing]
  }

  return {
    data: null,
    error: new Error(`Unable to save record to ${table}.`),
  }
}

async function safeSelect(table, orderColumn = 'created_at', ascending = false) {
  const result = await supabase
    .from(table)
    .select('*')
    .order(orderColumn, { ascending })

  if (!result.error) return { data: result.data || [], error: null }

  const message = String(result.error.message || '').toLowerCase()
  if (message.includes('does not exist') || message.includes('schema cache')) {
    return { data: [], error: null }
  }

  return { data: [], error: result.error }
}

export default function EmployeesModule() {
  const [employees, setEmployees] = useState([])
  const [jobs, setJobs] = useState([])
  const [certifications, setCertifications] = useState([])
  const [timeEntries, setTimeEntries] = useState([])
  const [ptoRequests, setPtoRequests] = useState([])
  const [equipmentAssignments, setEquipmentAssignments] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [fleetAssets, setFleetAssets] = useState([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  const [employeeEditor, setEmployeeEditor] = useState(null)
  const [certificationEditor, setCertificationEditor] = useState(null)
  const [timeEditor, setTimeEditor] = useState(null)
  const [ptoEditor, setPtoEditor] = useState(null)
  const [equipmentEditor, setEquipmentEditor] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    const results = await Promise.all([
      safeSelect('employees', 'last_name', true),
      safeSelect('jobs', 'created_at', false),
      safeSelect('employee_certifications', 'expiration_date', true),
      safeSelect('time_entries', 'work_date', false),
      safeSelect('employee_pto', 'start_date', false),
      safeSelect('employee_equipment', 'assigned_date', false),
      safeSelect('inventory_items', 'name', true),
      safeSelect('fleet_assets', 'name', true),
    ])

    const errors = results.map((result) => result.error).filter(Boolean)
    if (errors.length) {
      setErrorMessage(errors.map((error) => error.message).join(' | '))
    }

    setEmployees(results[0].data)
    setJobs(results[1].data)
    setCertifications(results[2].data)
    setTimeEntries(results[3].data)
    setPtoRequests(results[4].data)
    setEquipmentAssignments(results[5].data)
    setInventoryItems(results[6].data)
    setFleetAssets(results[7].data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) || null,
    [employees, selectedEmployeeId]
  )

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase()

    return employees.filter((employee) => {
      if (roleFilter && employee.role !== roleFilter) return false
      if (statusFilter && (employee.status || 'Active') !== statusFilter) return false
      if (!query) return true

      return [
        employeeName(employee),
        employee.email,
        employee.phone,
        employee.role,
        employee.status,
        employee.city,
        employee.skills,
        employee.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [employees, roleFilter, search, statusFilter])

  const selectedJobs = useMemo(() => {
    if (!selectedEmployeeId) return []

    return jobs.filter((job) => {
      if (job.employee_id === selectedEmployeeId) return true
      if (job.assigned_employee_id === selectedEmployeeId) return true
      return Array.isArray(job.assigned_employee_ids)
        ? job.assigned_employee_ids.includes(selectedEmployeeId)
        : false
    })
  }, [jobs, selectedEmployeeId])

  const selectedCertifications = useMemo(
    () => certifications.filter((record) => record.employee_id === selectedEmployeeId),
    [certifications, selectedEmployeeId]
  )

  const selectedTimeEntries = useMemo(
    () => timeEntries.filter((entry) => entry.employee_id === selectedEmployeeId),
    [timeEntries, selectedEmployeeId]
  )

  const selectedPto = useMemo(
    () => ptoRequests.filter((request) => request.employee_id === selectedEmployeeId),
    [ptoRequests, selectedEmployeeId]
  )

  const selectedEquipment = useMemo(
    () => equipmentAssignments.filter((record) => record.employee_id === selectedEmployeeId),
    [equipmentAssignments, selectedEmployeeId]
  )

  const selectedFleet = useMemo(
    () => fleetAssets.filter((asset) => asset.assigned_employee_id === selectedEmployeeId),
    [fleetAssets, selectedEmployeeId]
  )

  const jobById = useMemo(
    () => Object.fromEntries(jobs.map((job) => [job.id, job])),
    [jobs]
  )

  const inventoryById = useMemo(
    () => Object.fromEntries(inventoryItems.map((item) => [item.id, item])),
    [inventoryItems]
  )

  const dashboard = useMemo(() => {
    const active = employees.filter(
      (employee) => (employee.status || 'Active') === 'Active'
    ).length

    const leave = employees.filter((employee) => employee.status === 'Leave').length

    const expiring = certifications.filter(
      (record) => computedCertificationStatus(record) === 'Expiring Soon'
    ).length

    const expired = certifications.filter(
      (record) => computedCertificationStatus(record) === 'Expired'
    ).length

    return { active, leave, expiring, expired }
  }, [certifications, employees])

  async function saveEmployee(values) {
    if (!values.first_name.trim() && !values.last_name.trim()) {
      alert('Enter the employee name.')
      return false
    }

    setSaving(true)
    const { data: authData } = await supabase.auth.getUser()

    const payload = {
      id: values.id || createId(),
      user_id: authData?.user?.id || null,
      first_name: cleanText(values.first_name),
      last_name: cleanText(values.last_name),
      preferred_name: cleanText(values.preferred_name),
      name: cleanText([values.first_name, values.last_name].filter(Boolean).join(' ')),
      email: cleanText(values.email),
      phone: cleanText(values.phone),
      alternate_phone: cleanText(values.alternate_phone),
      role: values.role || 'Technician',
      status: values.status || 'Active',
      pay_type: values.pay_type || 'Hourly',
      hourly_rate: cleanNumber(values.hourly_rate),
      overtime_rate: cleanNumber(values.overtime_rate),
      annual_salary: cleanNumber(values.annual_salary),
      hire_date: cleanText(values.hire_date),
      termination_date: cleanText(values.termination_date),
      birthday: cleanText(values.birthday),
      address_line_1: cleanText(values.address_line_1),
      address_line_2: cleanText(values.address_line_2),
      city: cleanText(values.city),
      state: cleanText(values.state),
      postal_code: cleanText(values.postal_code),
      emergency_contact_name: cleanText(values.emergency_contact_name),
      emergency_contact_relationship: cleanText(values.emergency_contact_relationship),
      emergency_contact_phone: cleanText(values.emergency_contact_phone),
      shirt_size: cleanText(values.shirt_size),
      driver_license_number: cleanText(values.driver_license_number),
      driver_license_state: cleanText(values.driver_license_state),
      driver_license_expiration: cleanText(values.driver_license_expiration),
      skills: cleanText(values.skills),
      notes: cleanText(values.notes),
    }

    const result = await adaptiveUpsert('employees', payload)
    setSaving(false)

    if (result.error) {
      alert(result.error.message)
      return false
    }

    setEmployees((current) => {
      const exists = current.some((employee) => employee.id === result.data.id)
      const updated = exists
        ? current.map((employee) =>
            employee.id === result.data.id ? result.data : employee
          )
        : [...current, result.data]

      return updated.sort((a, b) => employeeName(a).localeCompare(employeeName(b)))
    })

    setEmployeeEditor(null)
    setSelectedEmployeeId(result.data.id)
    return true
  }

  async function deleteEmployee(employee) {
    if (!window.confirm(`Delete ${employeeName(employee)}?`)) return

    const { error } = await supabase.from('employees').delete().eq('id', employee.id)

    if (error) {
      alert(error.message)
      return
    }

    setEmployees((current) => current.filter((item) => item.id !== employee.id))
    setSelectedEmployeeId(null)
  }

  async function saveChild(table, employeeId, values, setter, closeSetter) {
    setSaving(true)

    const result = await adaptiveUpsert(table, {
      ...values,
      id: values.id || createId(),
      employee_id: employeeId,
    })

    setSaving(false)

    if (result.error) {
      alert(result.error.message)
      return false
    }

    setter((current) => {
      const exists = current.some((record) => record.id === result.data.id)
      return exists
        ? current.map((record) =>
            record.id === result.data.id ? result.data : record
          )
        : [result.data, ...current]
    })

    closeSetter(null)
    return true
  }

  async function deleteChild(table, record, setter, label) {
    if (!window.confirm(`Delete this ${label}?`)) return

    const { error } = await supabase.from(table).delete().eq('id', record.id)

    if (error) {
      alert(error.message)
      return
    }

    setter((current) => current.filter((item) => item.id !== record.id))
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Employees</h2>
        <p>Loading employee records...</p>
      </section>
    )
  }

  if (selectedEmployee) {
    const payroll = selectedTimeEntries.reduce(
      (totals, entry) => {
        const hours = calculateTime(entry)
        const regularRate = Number(selectedEmployee.hourly_rate || 0)
        const overtimeRate = Number(
          selectedEmployee.overtime_rate || regularRate * 1.5
        )

        totals.regularHours += hours.regular
        totals.overtimeHours += hours.overtime
        totals.regularPay += hours.regular * regularRate
        totals.overtimePay += hours.overtime * overtimeRate
        return totals
      },
      {
        regularHours: 0,
        overtimeHours: 0,
        regularPay: 0,
        overtimePay: 0,
      }
    )

    return (
      <>
        <div className="toolbar">
          <button className="secondary" onClick={() => setSelectedEmployeeId(null)}>
            ← Back to Employees
          </button>

          <div className="actions">
            <button className="primary" onClick={() => setEmployeeEditor(selectedEmployee)}>
              Edit Employee
            </button>
            <button className="danger" onClick={() => deleteEmployee(selectedEmployee)}>
              Delete
            </button>
          </div>
        </div>

        <section className="panel">
          <div className="between">
            <div>
              <h2>{employeeName(selectedEmployee)}</h2>
              <div className="small">
                {selectedEmployee.role || 'Technician'} ·{' '}
                {selectedEmployee.pay_type || 'Hourly'}
              </div>
            </div>
            <Badge>{selectedEmployee.status || 'Active'}</Badge>
          </div>

          <div className="metrics">
            <div className="metric">
              <span>Assigned Jobs</span>
              <strong>{selectedJobs.length}</strong>
            </div>
            <div className="metric">
              <span>Regular Hours</span>
              <strong>{payroll.regularHours.toFixed(1)}</strong>
            </div>
            <div className="metric">
              <span>Overtime Hours</span>
              <strong>{payroll.overtimeHours.toFixed(1)}</strong>
            </div>
            <div className="metric">
              <span>Estimated Pay</span>
              <strong>{formatCurrency(payroll.regularPay + payroll.overtimePay)}</strong>
            </div>
          </div>
        </section>

        <div className="tabs">
          {[
            ['overview', 'Overview'],
            ['jobs', 'Jobs'],
            ['time', 'Time & Payroll'],
            ['certifications', 'Certifications'],
            ['pto', 'PTO'],
            ['equipment', 'Equipment'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={activeTab === value ? 'active' : ''}
              onClick={() => setActiveTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <>
            <div className="grid-2">
              <section className="panel">
                <h2>Contact Information</h2>
                <p><b>Email:</b> {selectedEmployee.email || '—'}</p>
                <p><b>Phone:</b> {selectedEmployee.phone || '—'}</p>
                <p><b>Alternate Phone:</b> {selectedEmployee.alternate_phone || '—'}</p>
                <p>
                  <b>Address:</b>{' '}
                  {[
                    selectedEmployee.address_line_1,
                    selectedEmployee.address_line_2,
                    selectedEmployee.city,
                    selectedEmployee.state,
                    selectedEmployee.postal_code,
                  ]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </p>
              </section>

              <section className="panel">
                <h2>Employment Information</h2>
                <p><b>Hire Date:</b> {formatDate(selectedEmployee.hire_date)}</p>
                <p><b>Pay Type:</b> {selectedEmployee.pay_type || 'Hourly'}</p>
                <p><b>Hourly Rate:</b> {formatCurrency(selectedEmployee.hourly_rate)}</p>
                <p><b>Overtime Rate:</b> {formatCurrency(selectedEmployee.overtime_rate)}</p>
                <p><b>Annual Salary:</b> {formatCurrency(selectedEmployee.annual_salary)}</p>
              </section>
            </div>

            <div className="grid-2">
              <section className="panel">
                <h2>Emergency Contact</h2>
                <p><b>Name:</b> {selectedEmployee.emergency_contact_name || '—'}</p>
                <p>
                  <b>Relationship:</b>{' '}
                  {selectedEmployee.emergency_contact_relationship || '—'}
                </p>
                <p><b>Phone:</b> {selectedEmployee.emergency_contact_phone || '—'}</p>
              </section>

              <section className="panel">
                <h2>Driver & Uniform Information</h2>
                <p><b>License:</b> {selectedEmployee.driver_license_number || '—'}</p>
                <p><b>License State:</b> {selectedEmployee.driver_license_state || '—'}</p>
                <p>
                  <b>License Expiration:</b>{' '}
                  {formatDate(selectedEmployee.driver_license_expiration)}
                </p>
                <p><b>Shirt Size:</b> {selectedEmployee.shirt_size || '—'}</p>
              </section>
            </div>

            <section className="panel">
              <h2>Skills & Notes</h2>
              <p><b>Skills:</b> {selectedEmployee.skills || '—'}</p>
              <p><b>Notes:</b> {selectedEmployee.notes || 'No notes entered.'}</p>
            </section>

            <section className="panel">
              <h2>Assigned Fleet Assets</h2>
              <div className="cards">
                {selectedFleet.map((asset) => (
                  <article className="card" key={asset.id}>
                    <div className="between">
                      <h3>{asset.name || asset.asset_number || 'Fleet Asset'}</h3>
                      <Badge>{asset.status || 'Active'}</Badge>
                    </div>
                    <p>
                      {[asset.year, asset.make, asset.model].filter(Boolean).join(' ') || '—'}
                    </p>
                    <p><b>Plate:</b> {asset.license_plate || '—'}</p>
                  </article>
                ))}
                {!selectedFleet.length && <Empty>No fleet assets assigned</Empty>}
              </div>
            </section>
          </>
        )}

        {activeTab === 'jobs' && (
          <section className="panel">
            <h2>Assigned Jobs</h2>
            <div className="cards">
              {selectedJobs.map((job) => (
                <article className="card" key={job.id}>
                  <div className="between">
                    <h3>
                      {job.number || job.job_number || 'Unnumbered'} ·{' '}
                      {job.title || 'Untitled Job'}
                    </h3>
                    <Badge>{job.status || 'New'}</Badge>
                  </div>
                  <p><b>Start:</b> {formatDate(job.start_date)}</p>
                  <p><b>Due:</b> {formatDate(job.due_date)}</p>
                  <p>{job.scope || job.description || 'No scope entered.'}</p>
                </article>
              ))}
              {!selectedJobs.length && <Empty>No jobs assigned</Empty>}
            </div>
          </section>
        )}

        {activeTab === 'time' && (
          <>
            <div className="toolbar">
              <div />
              <button className="primary" onClick={() => setTimeEditor({ ...EMPTY_TIME_ENTRY })}>
                + Time Entry
              </button>
            </div>

            <div className="metrics">
              <div className="metric">
                <span>Regular Hours</span>
                <strong>{payroll.regularHours.toFixed(1)}</strong>
              </div>
              <div className="metric">
                <span>Overtime Hours</span>
                <strong>{payroll.overtimeHours.toFixed(1)}</strong>
              </div>
              <div className="metric">
                <span>Regular Pay</span>
                <strong>{formatCurrency(payroll.regularPay)}</strong>
              </div>
              <div className="metric">
                <span>Overtime Pay</span>
                <strong>{formatCurrency(payroll.overtimePay)}</strong>
              </div>
            </div>

            <section className="panel">
              <h2>Time Entries</h2>
              <div className="cards">
                {selectedTimeEntries.map((entry) => {
                  const hours = calculateTime(entry)

                  return (
                    <article className="card" key={entry.id}>
                      <div className="between">
                        <h3>{formatDate(entry.work_date)}</h3>
                        <Badge>{entry.status || 'Open'}</Badge>
                      </div>
                      <p><b>Job:</b> {jobById[entry.job_id]?.title || 'General / Shop'}</p>
                      <p><b>Clock:</b> {entry.clock_in || '—'} – {entry.clock_out || '—'}</p>
                      <p><b>Regular:</b> {hours.regular.toFixed(1)} hours</p>
                      <p><b>Overtime:</b> {hours.overtime.toFixed(1)} hours</p>
                      <p>{entry.notes || ''}</p>

                      <div className="actions">
                        <button className="secondary" onClick={() => setTimeEditor(entry)}>
                          Edit
                        </button>
                        <button
                          className="danger"
                          onClick={() =>
                            deleteChild('time_entries', entry, setTimeEntries, 'time entry')
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  )
                })}

                {!selectedTimeEntries.length && <Empty>No time entries recorded</Empty>}
              </div>
            </section>
          </>
        )}

        {activeTab === 'certifications' && (
          <>
            <div className="toolbar">
              <div />
              <button
                className="primary"
                onClick={() => setCertificationEditor({ ...EMPTY_CERTIFICATION })}
              >
                + Certification
              </button>
            </div>

            <section className="panel">
              <h2>Certifications & Licenses</h2>
              <div className="cards">
                {selectedCertifications.map((record) => (
                  <article className="card" key={record.id}>
                    <div className="between">
                      <h3>{record.name || 'Certification'}</h3>
                      <Badge>{computedCertificationStatus(record)}</Badge>
                    </div>
                    <p><b>Issuer:</b> {record.issuing_organization || '—'}</p>
                    <p><b>Number:</b> {record.certification_number || '—'}</p>
                    <p><b>Issued:</b> {formatDate(record.issue_date)}</p>
                    <p><b>Expires:</b> {formatDate(record.expiration_date)}</p>
                    <p>{record.notes || ''}</p>

                    <div className="actions">
                      <button
                        className="secondary"
                        onClick={() => setCertificationEditor(record)}
                      >
                        Edit
                      </button>
                      <button
                        className="danger"
                        onClick={() =>
                          deleteChild(
                            'employee_certifications',
                            record,
                            setCertifications,
                            'certification'
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}

                {!selectedCertifications.length && (
                  <Empty>No certifications recorded</Empty>
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === 'pto' && (
          <>
            <div className="toolbar">
              <div />
              <button className="primary" onClick={() => setPtoEditor({ ...EMPTY_PTO })}>
                + PTO Request
              </button>
            </div>

            <section className="panel">
              <h2>PTO & Leave</h2>
              <div className="cards">
                {selectedPto.map((request) => (
                  <article className="card" key={request.id}>
                    <div className="between">
                      <h3>{request.type || 'PTO'}</h3>
                      <Badge>{request.status || 'Requested'}</Badge>
                    </div>
                    <p>
                      <b>Dates:</b> {formatDate(request.start_date)} –{' '}
                      {formatDate(request.end_date)}
                    </p>
                    <p><b>Hours:</b> {request.hours || '—'}</p>
                    <p>{request.reason || 'No reason entered.'}</p>

                    <div className="actions">
                      <button className="secondary" onClick={() => setPtoEditor(request)}>
                        Edit
                      </button>
                      <button
                        className="danger"
                        onClick={() =>
                          deleteChild('employee_pto', request, setPtoRequests, 'PTO request')
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}

                {!selectedPto.length && <Empty>No PTO requests</Empty>}
              </div>
            </section>
          </>
        )}

        {activeTab === 'equipment' && (
          <>
            <div className="toolbar">
              <div />
              <button
                className="primary"
                onClick={() => setEquipmentEditor({ ...EMPTY_EQUIPMENT })}
              >
                + Assign Equipment
              </button>
            </div>

            <section className="panel">
              <h2>Assigned Equipment</h2>
              <div className="cards">
                {selectedEquipment.map((record) => {
                  const item = inventoryById[record.inventory_item_id]

                  return (
                    <article className="card" key={record.id}>
                      <div className="between">
                        <h3>{item?.name || record.item_name || 'Equipment'}</h3>
                        <Badge>{record.returned_date ? 'Returned' : 'Assigned'}</Badge>
                      </div>
                      <p><b>Assigned:</b> {formatDate(record.assigned_date)}</p>
                      <p><b>Due:</b> {formatDate(record.return_due_date)}</p>
                      <p><b>Returned:</b> {formatDate(record.returned_date)}</p>
                      <p><b>Condition Out:</b> {record.condition_out || '—'}</p>
                      <p><b>Condition In:</b> {record.condition_in || '—'}</p>
                      <p>{record.notes || ''}</p>

                      <div className="actions">
                        <button
                          className="secondary"
                          onClick={() => setEquipmentEditor(record)}
                        >
                          Edit
                        </button>
                        <button
                          className="danger"
                          onClick={() =>
                            deleteChild(
                              'employee_equipment',
                              record,
                              setEquipmentAssignments,
                              'equipment assignment'
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  )
                })}

                {!selectedEquipment.length && <Empty>No equipment assigned</Empty>}
              </div>
            </section>
          </>
        )}

        {employeeEditor && (
          <EmployeeEditor
            initial={employeeEditor}
            saving={saving}
            onClose={() => setEmployeeEditor(null)}
            onSave={saveEmployee}
          />
        )}

        {certificationEditor && (
          <CertificationEditor
            initial={certificationEditor}
            saving={saving}
            onClose={() => setCertificationEditor(null)}
            onSave={(values) =>
              saveChild(
                'employee_certifications',
                selectedEmployee.id,
                {
                  ...values,
                  name: cleanText(values.name),
                  issuing_organization: cleanText(values.issuing_organization),
                  certification_number: cleanText(values.certification_number),
                  issue_date: cleanText(values.issue_date),
                  expiration_date: cleanText(values.expiration_date),
                  status: computedCertificationStatus(values),
                  notes: cleanText(values.notes),
                },
                setCertifications,
                setCertificationEditor
              )
            }
          />
        )}

        {timeEditor && (
          <TimeEntryEditor
            initial={timeEditor}
            jobs={jobs}
            saving={saving}
            onClose={() => setTimeEditor(null)}
            onSave={(values) => {
              const hours = calculateTime(values)

              return saveChild(
                'time_entries',
                selectedEmployee.id,
                {
                  ...values,
                  job_id: cleanText(values.job_id),
                  work_date: cleanText(values.work_date),
                  clock_in: cleanText(values.clock_in),
                  clock_out: cleanText(values.clock_out),
                  regular_hours: hours.regular,
                  overtime_hours: hours.overtime,
                  break_minutes: cleanNumber(values.break_minutes),
                  notes: cleanText(values.notes),
                },
                setTimeEntries,
                setTimeEditor
              )
            }}
          />
        )}

        {ptoEditor && (
          <PtoEditor
            initial={ptoEditor}
            saving={saving}
            onClose={() => setPtoEditor(null)}
            onSave={(values) =>
              saveChild(
                'employee_pto',
                selectedEmployee.id,
                {
                  ...values,
                  start_date: cleanText(values.start_date),
                  end_date: cleanText(values.end_date),
                  hours: cleanNumber(values.hours),
                  reason: cleanText(values.reason),
                },
                setPtoRequests,
                setPtoEditor
              )
            }
          />
        )}

        {equipmentEditor && (
          <EquipmentEditor
            initial={equipmentEditor}
            inventoryItems={inventoryItems}
            saving={saving}
            onClose={() => setEquipmentEditor(null)}
            onSave={(values) =>
              saveChild(
                'employee_equipment',
                selectedEmployee.id,
                {
                  ...values,
                  inventory_item_id: cleanText(values.inventory_item_id),
                  assigned_date: cleanText(values.assigned_date),
                  return_due_date: cleanText(values.return_due_date),
                  returned_date: cleanText(values.returned_date),
                  condition_out: cleanText(values.condition_out),
                  condition_in: cleanText(values.condition_in),
                  notes: cleanText(values.notes),
                },
                setEquipmentAssignments,
                setEquipmentEditor
              )
            }
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
          placeholder="Search employees..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="actions">
          <SelectField
            label="Role"
            value={roleFilter}
            onChange={setRoleFilter}
            options={[
              ['', 'All roles'],
              ...ROLE_OPTIONS.map((role) => [role, role]),
            ]}
          />

          <SelectField
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ['', 'All statuses'],
              ...STATUS_OPTIONS.map((status) => [status, status]),
            ]}
          />

          <button
            className="primary"
            onClick={() => setEmployeeEditor({ ...EMPTY_EMPLOYEE })}
          >
            + Employee
          </button>
        </div>
      </div>

      {errorMessage && (
        <section className="panel">
          <strong>Employees error</strong>
          <p>{errorMessage}</p>
          <button className="secondary" onClick={loadData}>
            Try Again
          </button>
        </section>
      )}

      <div className="metrics">
        <div className="metric">
          <span>Total Employees</span>
          <strong>{employees.length}</strong>
        </div>
        <div className="metric">
          <span>Active</span>
          <strong>{dashboard.active}</strong>
        </div>
        <div className="metric">
          <span>On Leave</span>
          <strong>{dashboard.leave}</strong>
        </div>
        <div className="metric">
          <span>Certification Warnings</span>
          <strong>{dashboard.expiring + dashboard.expired}</strong>
        </div>
      </div>

      <div className="cards">
        {filteredEmployees.map((employee) => {
          const jobCount = jobs.filter((job) => {
            if (job.employee_id === employee.id) return true
            if (job.assigned_employee_id === employee.id) return true
            return Array.isArray(job.assigned_employee_ids)
              ? job.assigned_employee_ids.includes(employee.id)
              : false
          }).length

          const warningCount = certifications.filter(
            (record) =>
              record.employee_id === employee.id &&
              ['Expiring Soon', 'Expired'].includes(
                computedCertificationStatus(record)
              )
          ).length

          return (
            <article className="card" key={employee.id}>
              <div className="between">
                <div>
                  <h3>{employeeName(employee)}</h3>
                  <div className="small">{employee.role || 'Technician'}</div>
                </div>
                <Badge>{employee.status || 'Active'}</Badge>
              </div>

              <p><b>Phone:</b> {employee.phone || '—'}</p>
              <p><b>Email:</b> {employee.email || '—'}</p>
              <p><b>Hire Date:</b> {formatDate(employee.hire_date)}</p>
              <p><b>Assigned Jobs:</b> {jobCount}</p>
              <p><b>Certification Warnings:</b> {warningCount}</p>

              <div className="actions">
                <button
                  className="primary"
                  onClick={() => setSelectedEmployeeId(employee.id)}
                >
                  Open
                </button>
                <button
                  className="secondary"
                  onClick={() => setEmployeeEditor(employee)}
                >
                  Edit
                </button>
                <button className="danger" onClick={() => deleteEmployee(employee)}>
                  Delete
                </button>
              </div>
            </article>
          )
        })}

        {!filteredEmployees.length && <Empty>No employees match your filters</Empty>}
      </div>

      {employeeEditor && (
        <EmployeeEditor
          initial={employeeEditor}
          saving={saving}
          onClose={() => setEmployeeEditor(null)}
          onSave={saveEmployee}
        />
      )}
    </>
  )
}

function EmployeeEditor({ initial, saving, onClose, onSave }) {
  const [values, setValues] = useState({ ...EMPTY_EMPLOYEE, ...initial })
  const setValue = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))

  return (
    <Modal title={initial.id ? 'Edit Employee' : 'Add Employee'} onClose={onClose}>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          await onSave(values)
        }}
      >
        <div className="form-grid">
          <Field label="First Name" value={values.first_name} onChange={(value) => setValue('first_name', value)} required />
          <Field label="Last Name" value={values.last_name} onChange={(value) => setValue('last_name', value)} required />
          <Field label="Preferred Name" value={values.preferred_name} onChange={(value) => setValue('preferred_name', value)} />
          <Field label="Email" type="email" value={values.email} onChange={(value) => setValue('email', value)} />
          <Field label="Phone" value={values.phone} onChange={(value) => setValue('phone', value)} />
          <Field label="Alternate Phone" value={values.alternate_phone} onChange={(value) => setValue('alternate_phone', value)} />

          <SelectField label="Role" value={values.role} onChange={(value) => setValue('role', value)} options={ROLE_OPTIONS.map((item) => [item, item])} />
          <SelectField label="Status" value={values.status} onChange={(value) => setValue('status', value)} options={STATUS_OPTIONS.map((item) => [item, item])} />
          <SelectField label="Pay Type" value={values.pay_type} onChange={(value) => setValue('pay_type', value)} options={PAY_TYPE_OPTIONS.map((item) => [item, item])} />

          <Field label="Hourly Rate" type="number" value={values.hourly_rate ?? ''} onChange={(value) => setValue('hourly_rate', value)} />
          <Field label="Overtime Rate" type="number" value={values.overtime_rate ?? ''} onChange={(value) => setValue('overtime_rate', value)} />
          <Field label="Annual Salary" type="number" value={values.annual_salary ?? ''} onChange={(value) => setValue('annual_salary', value)} />

          <Field label="Hire Date" type="date" value={values.hire_date || ''} onChange={(value) => setValue('hire_date', value)} />
          <Field label="Termination Date" type="date" value={values.termination_date || ''} onChange={(value) => setValue('termination_date', value)} />
          <Field label="Birthday" type="date" value={values.birthday || ''} onChange={(value) => setValue('birthday', value)} />

          <Field label="Address Line 1" value={values.address_line_1} onChange={(value) => setValue('address_line_1', value)} />
          <Field label="Address Line 2" value={values.address_line_2} onChange={(value) => setValue('address_line_2', value)} />
          <Field label="City" value={values.city} onChange={(value) => setValue('city', value)} />
          <Field label="State" value={values.state} onChange={(value) => setValue('state', value)} />
          <Field label="ZIP Code" value={values.postal_code} onChange={(value) => setValue('postal_code', value)} />

          <Field label="Emergency Contact" value={values.emergency_contact_name} onChange={(value) => setValue('emergency_contact_name', value)} />
          <Field label="Relationship" value={values.emergency_contact_relationship} onChange={(value) => setValue('emergency_contact_relationship', value)} />
          <Field label="Emergency Phone" value={values.emergency_contact_phone} onChange={(value) => setValue('emergency_contact_phone', value)} />

          <Field label="Driver License Number" value={values.driver_license_number} onChange={(value) => setValue('driver_license_number', value)} />
          <Field label="Driver License State" value={values.driver_license_state} onChange={(value) => setValue('driver_license_state', value)} />
          <Field label="Driver License Expiration" type="date" value={values.driver_license_expiration || ''} onChange={(value) => setValue('driver_license_expiration', value)} />
          <Field label="Shirt Size" value={values.shirt_size} onChange={(value) => setValue('shirt_size', value)} />

          <Field label="Skills" value={values.skills} onChange={(value) => setValue('skills', value)} multiline />
          <Field label="Notes" value={values.notes} onChange={(value) => setValue('notes', value)} multiline />
        </div>

        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Employee'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CertificationEditor({ initial, saving, onClose, onSave }) {
  const [values, setValues] = useState({ ...EMPTY_CERTIFICATION, ...initial })
  const setValue = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))

  return (
    <Modal title={initial.id ? 'Edit Certification' : 'Add Certification'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(values) }}>
        <div className="form-grid">
          <Field label="Certification Name" value={values.name} onChange={(value) => setValue('name', value)} required />
          <Field label="Issuing Organization" value={values.issuing_organization} onChange={(value) => setValue('issuing_organization', value)} />
          <Field label="Certification Number" value={values.certification_number} onChange={(value) => setValue('certification_number', value)} />
          <Field label="Issue Date" type="date" value={values.issue_date || ''} onChange={(value) => setValue('issue_date', value)} />
          <Field label="Expiration Date" type="date" value={values.expiration_date || ''} onChange={(value) => setValue('expiration_date', value)} />
          <SelectField label="Status" value={values.status} onChange={(value) => setValue('status', value)} options={CERT_STATUS_OPTIONS.map((item) => [item, item])} />
          <Field label="Notes" value={values.notes} onChange={(value) => setValue('notes', value)} multiline />
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Certification'}</button>
        </div>
      </form>
    </Modal>
  )
}

function TimeEntryEditor({ initial, jobs, saving, onClose, onSave }) {
  const [values, setValues] = useState({ ...EMPTY_TIME_ENTRY, ...initial })
  const setValue = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))

  return (
    <Modal title={initial.id ? 'Edit Time Entry' : 'Add Time Entry'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(values) }}>
        <div className="form-grid">
          <SelectField
            label="Job"
            value={values.job_id || ''}
            onChange={(value) => setValue('job_id', value)}
            options={[
              ['', 'General / Shop'],
              ...jobs.map((job) => [
                job.id,
                `${job.number || job.job_number || ''} ${job.title || 'Untitled Job'}`.trim(),
              ]),
            ]}
          />
          <Field label="Work Date" type="date" value={values.work_date || ''} onChange={(value) => setValue('work_date', value)} />
          <Field label="Clock In" type="time" value={values.clock_in || ''} onChange={(value) => setValue('clock_in', value)} />
          <Field label="Clock Out" type="time" value={values.clock_out || ''} onChange={(value) => setValue('clock_out', value)} />
          <Field label="Regular Hours Override" type="number" value={values.regular_hours ?? ''} onChange={(value) => setValue('regular_hours', value)} />
          <Field label="Overtime Hours Override" type="number" value={values.overtime_hours ?? ''} onChange={(value) => setValue('overtime_hours', value)} />
          <Field label="Break Minutes" type="number" value={values.break_minutes ?? ''} onChange={(value) => setValue('break_minutes', value)} />
          <SelectField label="Status" value={values.status} onChange={(value) => setValue('status', value)} options={TIME_STATUS_OPTIONS.map((item) => [item, item])} />
          <Field label="Notes" value={values.notes} onChange={(value) => setValue('notes', value)} multiline />
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Time Entry'}</button>
        </div>
      </form>
    </Modal>
  )
}

function PtoEditor({ initial, saving, onClose, onSave }) {
  const [values, setValues] = useState({ ...EMPTY_PTO, ...initial })
  const setValue = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))

  return (
    <Modal title={initial.id ? 'Edit PTO Request' : 'Add PTO Request'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(values) }}>
        <div className="form-grid">
          <SelectField label="Type" value={values.type} onChange={(value) => setValue('type', value)} options={PTO_TYPE_OPTIONS.map((item) => [item, item])} />
          <Field label="Start Date" type="date" value={values.start_date || ''} onChange={(value) => setValue('start_date', value)} />
          <Field label="End Date" type="date" value={values.end_date || ''} onChange={(value) => setValue('end_date', value)} />
          <Field label="Hours" type="number" value={values.hours ?? ''} onChange={(value) => setValue('hours', value)} />
          <SelectField label="Status" value={values.status} onChange={(value) => setValue('status', value)} options={PTO_STATUS_OPTIONS.map((item) => [item, item])} />
          <Field label="Reason" value={values.reason} onChange={(value) => setValue('reason', value)} multiline />
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save PTO Request'}</button>
        </div>
      </form>
    </Modal>
  )
}

function EquipmentEditor({ initial, inventoryItems, saving, onClose, onSave }) {
  const [values, setValues] = useState({ ...EMPTY_EQUIPMENT, ...initial })
  const setValue = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))

  return (
    <Modal title={initial.id ? 'Edit Equipment Assignment' : 'Assign Equipment'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(values) }}>
        <div className="form-grid">
          <SelectField
            label="Inventory Item"
            value={values.inventory_item_id || ''}
            onChange={(value) => setValue('inventory_item_id', value)}
            options={[
              ['', 'Select equipment'],
              ...inventoryItems.map((item) => [
                item.id,
                item.name || item.sku || 'Inventory Item',
              ]),
            ]}
          />
          <Field label="Assigned Date" type="date" value={values.assigned_date || ''} onChange={(value) => setValue('assigned_date', value)} />
          <Field label="Return Due Date" type="date" value={values.return_due_date || ''} onChange={(value) => setValue('return_due_date', value)} />
          <Field label="Returned Date" type="date" value={values.returned_date || ''} onChange={(value) => setValue('returned_date', value)} />
          <Field label="Condition Out" value={values.condition_out} onChange={(value) => setValue('condition_out', value)} />
          <Field label="Condition In" value={values.condition_in} onChange={(value) => setValue('condition_in', value)} />
          <Field label="Notes" value={values.notes} onChange={(value) => setValue('notes', value)} multiline />
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Assignment'}</button>
        </div>
      </form>
    </Modal>
  )
}