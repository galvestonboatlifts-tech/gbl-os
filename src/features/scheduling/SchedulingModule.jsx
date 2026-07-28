import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Badge,
  Empty,
  Field,
  Modal,
  SelectField,
} from '../../components/UI'

const VIEW_OPTIONS = ['Month', 'Week', 'Day', 'Dispatch']
const STATUS_OPTIONS = [
  'New',
  'Scheduled',
  'Dispatched',
  'In Progress',
  'On Hold',
  'Completed',
  'Cancelled',
]
const PRIORITY_OPTIONS = ['Low', 'Normal', 'High', 'Emergency']
const WORKDAY_START = 7
const WORKDAY_END = 18
const SLOT_HEIGHT = 64

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function arrayValue(value) {
  if (Array.isArray(value)) return value

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

function customerName(customer) {
  return customer?.name || customer?.company || 'Unassigned Customer'
}

function employeeName(employee) {
  return employee?.name || employee?.full_name || employee?.email || 'Employee'
}

function propertyAddress(property) {
  if (!property) return 'No property assigned'

  const cityLine = [property.city, property.state, property.zip_code]
    .filter(Boolean)
    .join(' ')

  return [property.address, cityLine]
    .filter(Boolean)
    .join(', ') || property.name || 'No property address'
}

function jobLabel(job) {
  return job?.number || job?.title || `Job ${String(job?.id || '').slice(0, 8)}`
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function toLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toIso(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function startOfDay(value) {
  const date = new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

function endOfDay(value) {
  const date = new Date(value)
  date.setHours(23, 59, 59, 999)
  return date
}

function addDays(value, amount) {
  const date = new Date(value)
  date.setDate(date.getDate() + amount)
  return date
}

function addMonths(value, amount) {
  const date = new Date(value)
  date.setMonth(date.getMonth() + amount)
  return date
}

function startOfWeek(value) {
  const date = startOfDay(value)
  const day = date.getDay()
  date.setDate(date.getDate() - day)
  return date
}

function startOfMonthGrid(value) {
  const first = new Date(value.getFullYear(), value.getMonth(), 1)
  return startOfWeek(first)
}

function dateKey(value) {
  const date = new Date(value)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function sameDay(a, b) {
  return dateKey(a) === dateKey(b)
}

function formatDate(value, options = {}) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('en-US', options)
}

function formatTime(value) {
  if (!value) return 'Unscheduled'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unscheduled'
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatRange(start, end) {
  if (!start) return 'Unscheduled'
  return `${formatTime(start)}${end ? ` – ${formatTime(end)}` : ''}`
}

function durationHours(start, end) {
  const startDate = new Date(start)
  const endDate = new Date(end)

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate <= startDate
  ) {
    return 0
  }

  return (endDate - startDate) / 3600000
}

function statusTone(status) {
  switch (status) {
    case 'Completed': return '#15803d'
    case 'In Progress': return '#0369a1'
    case 'Dispatched': return '#7c3aed'
    case 'On Hold': return '#a16207'
    case 'Cancelled': return '#b91c1c'
    case 'Scheduled': return '#0f766e'
    default: return '#475569'
  }
}

function priorityTone(priority) {
  switch (priority) {
    case 'Emergency': return '#b91c1c'
    case 'High': return '#c2410c'
    case 'Low': return '#64748b'
    default: return '#0369a1'
  }
}

function sortJobs(a, b) {
  const aStart = a.scheduled_start ? new Date(a.scheduled_start).getTime() : Infinity
  const bStart = b.scheduled_start ? new Date(b.scheduled_start).getTime() : Infinity
  return aStart - bStart || jobLabel(a).localeCompare(jobLabel(b))
}

function defaultEnd(startValue) {
  if (!startValue) return ''
  const date = new Date(startValue)
  date.setHours(date.getHours() + 2)
  return toLocalInput(date)
}

function buildEditor(job, selectedDate) {
  const fallbackStart = new Date(selectedDate || new Date())
  fallbackStart.setHours(8, 0, 0, 0)

  const scheduledStart = job?.scheduled_start
    ? toLocalInput(job.scheduled_start)
    : toLocalInput(fallbackStart)

  return {
    id: job?.id || '',
    scheduled_start: scheduledStart,
    scheduled_end: job?.scheduled_end
      ? toLocalInput(job.scheduled_end)
      : defaultEnd(scheduledStart),
    status: job?.status || 'Scheduled',
    priority: job?.priority || 'Normal',
    assigned_employee_ids: arrayValue(job?.assigned_employee_ids),
    crew: job?.crew || '',
    dispatch_notes: job?.dispatch_notes || '',
  }
}

export default function SchedulingModule({ supabase }) {
  const [jobs, setJobs] = useState([])
  const [customers, setCustomers] = useState([])
  const [properties, setProperties] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState('Month')
  const [anchorDate, setAnchorDate] = useState(new Date())
  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [editor, setEditor] = useState(null)
  const [draggedJobId, setDraggedJobId] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [jobsResult, customersResult, propertiesResult, employeesResult] = await Promise.all([
        supabase.from('jobs').select('*').order('scheduled_start', { ascending: true, nullsFirst: false }),
        supabase.from('customers').select('*').order('name', { ascending: true }),
        supabase.from('properties').select('*').order('address', { ascending: true }),
        supabase.from('employees').select('*').order('name', { ascending: true }),
      ])

      const firstError = [jobsResult, customersResult, propertiesResult, employeesResult]
        .find((result) => result.error)?.error

      if (firstError) throw firstError

      setJobs(jobsResult.data || [])
      setCustomers(customersResult.data || [])
      setProperties(propertiesResult.data || [])
      setEmployees(employeesResult.data || [])
    } catch (loadError) {
      console.error('Unable to load scheduling data:', loadError)
      setError(loadError.message || 'Unable to load scheduling data.')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  const customerById = useMemo(
    () => Object.fromEntries(customers.map((item) => [item.id, item])),
    [customers]
  )

  const propertyById = useMemo(
    () => Object.fromEntries(properties.map((item) => [item.id, item])),
    [properties]
  )

  const employeeById = useMemo(
    () => Object.fromEntries(employees.map((item) => [item.id, item])),
    [employees]
  )

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase()

    return [...jobs]
      .filter((job) => {
        if (statusFilter && job.status !== statusFilter) return false

        const assignedIds = arrayValue(job.assigned_employee_ids)
        if (employeeFilter && !assignedIds.includes(employeeFilter)) return false

        if (!query) return true

        const customer = customerById[job.customer_id]
        const property = propertyById[job.property_id]

        return [
          job.number,
          job.title,
          job.job_type,
          job.status,
          job.priority,
          job.crew,
          job.scope,
          job.dispatch_notes,
          customerName(customer),
          propertyAddress(property),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
      .sort(sortJobs)
  }, [jobs, search, statusFilter, employeeFilter, customerById, propertyById])

  const scheduledJobs = useMemo(
    () => filteredJobs.filter((job) => job.scheduled_start),
    [filteredJobs]
  )

  const unscheduledJobs = useMemo(
    () => filteredJobs.filter((job) => !job.scheduled_start && !['Completed', 'Cancelled'].includes(job.status)),
    [filteredJobs]
  )

  const selectedJob = jobs.find((job) => job.id === selectedJobId) || null

  function movePeriod(amount) {
    if (view === 'Month') setAnchorDate((current) => addMonths(current, amount))
    else setAnchorDate((current) => addDays(current, view === 'Week' || view === 'Dispatch' ? amount * 7 : amount))
  }

  function openEditor(job, date) {
    setSelectedJobId(job.id)
    setEditor(buildEditor(job, date || anchorDate))
  }

  function closeEditor() {
    setEditor(null)
  }

  function toggleEmployee(employeeId) {
    setEditor((current) => {
      const currentIds = arrayValue(current.assigned_employee_ids)
      const nextIds = currentIds.includes(employeeId)
        ? currentIds.filter((id) => id !== employeeId)
        : [...currentIds, employeeId]

      return { ...current, assigned_employee_ids: nextIds }
    })
  }

  async function saveSchedule() {
    if (!editor?.id) return

    if (editor.scheduled_start && editor.scheduled_end) {
      const start = new Date(editor.scheduled_start)
      const end = new Date(editor.scheduled_end)

      if (end <= start) {
        alert('Scheduled end must be after scheduled start.')
        return
      }
    }

    setSaving(true)

    try {
      const payload = {
        scheduled_start: toIso(editor.scheduled_start),
        scheduled_end: toIso(editor.scheduled_end),
        assigned_employee_ids: arrayValue(editor.assigned_employee_ids),
        crew: editor.crew.trim() || null,
        dispatch_notes: editor.dispatch_notes.trim() || null,
        status: editor.scheduled_start && editor.status === 'New'
          ? 'Scheduled'
          : editor.status,
        priority: editor.priority,
      }

      const { data, error: saveError } = await supabase
        .from('jobs')
        .update(payload)
        .eq('id', editor.id)
        .select()
        .single()

      if (saveError) throw saveError

      setJobs((current) => current.map((job) => job.id === data.id ? data : job))
      setSelectedJobId(data.id)
      setEditor(null)
    } catch (saveError) {
      console.error('Unable to save schedule:', saveError)
      alert(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function quickUpdate(jobId, fields) {
    try {
      const { data, error: updateError } = await supabase
        .from('jobs')
        .update(fields)
        .eq('id', jobId)
        .select()
        .single()

      if (updateError) throw updateError
      setJobs((current) => current.map((job) => job.id === data.id ? data : job))
    } catch (updateError) {
      console.error('Unable to update schedule:', updateError)
      alert(updateError.message)
    }
  }

  async function scheduleOnDate(jobId, date) {
    const job = jobs.find((item) => item.id === jobId)
    if (!job) return

    const oldStart = job.scheduled_start ? new Date(job.scheduled_start) : null
    const oldEnd = job.scheduled_end ? new Date(job.scheduled_end) : null
    const duration = oldStart && oldEnd && oldEnd > oldStart
      ? oldEnd - oldStart
      : 2 * 3600000

    const nextStart = new Date(date)
    nextStart.setHours(oldStart ? oldStart.getHours() : 8, oldStart ? oldStart.getMinutes() : 0, 0, 0)
    const nextEnd = new Date(nextStart.getTime() + duration)

    await quickUpdate(jobId, {
      scheduled_start: nextStart.toISOString(),
      scheduled_end: nextEnd.toISOString(),
      status: job.status === 'New' ? 'Scheduled' : job.status,
    })
  }

  async function unscheduleJob(job) {
    const confirmed = window.confirm(`Remove ${jobLabel(job)} from the schedule?`)
    if (!confirmed) return

    await quickUpdate(job.id, {
      scheduled_start: null,
      scheduled_end: null,
      status: job.status === 'Scheduled' ? 'New' : job.status,
    })
  }

  function jobsForDay(date) {
    return scheduledJobs.filter((job) => sameDay(job.scheduled_start, date))
  }

  const periodTitle = useMemo(() => {
    if (view === 'Month') {
      return anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }

    if (view === 'Day') {
      return anchorDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    }

    const start = startOfWeek(anchorDate)
    const end = addDays(start, 6)
    return `${formatDate(start, { month: 'short', day: 'numeric' })} – ${formatDate(end, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }, [view, anchorDate])

  const metrics = useMemo(() => {
    const today = new Date()
    const todayJobs = scheduledJobs.filter((job) => sameDay(job.scheduled_start, today))
    const dispatched = jobs.filter((job) => job.status === 'Dispatched')
    const inProgress = jobs.filter((job) => job.status === 'In Progress')
    const emergencies = jobs.filter((job) => job.priority === 'Emergency' && !['Completed', 'Cancelled'].includes(job.status))

    return {
      today: todayJobs.length,
      unscheduled: unscheduledJobs.length,
      dispatched: dispatched.length,
      inProgress: inProgress.length,
      emergencies: emergencies.length,
    }
  }, [jobs, scheduledJobs, unscheduledJobs])

  if (loading) {
    return <section className="panel"><h2>Loading scheduling...</h2></section>
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section className="panel">
        <div className="between" style={{ gap: 16, alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ margin: 0 }}>Scheduling & Dispatch</h1>
            <p className="small" style={{ marginBottom: 0 }}>
              Schedule jobs, assign technicians, dispatch crews, and manage daily workload.
            </p>
          </div>

          <div className="actions">
            <button type="button" className="secondary" onClick={loadData}>Refresh</button>
            <button type="button" className="primary" onClick={() => setAnchorDate(new Date())}>Today</button>
          </div>
        </div>

        {error && <div style={{ marginTop: 14, color: '#b91c1c', fontWeight: 700 }}>{error}</div>}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
        <MetricCard label="Today's Jobs" value={metrics.today} />
        <MetricCard label="Unscheduled" value={metrics.unscheduled} />
        <MetricCard label="Dispatched" value={metrics.dispatched} />
        <MetricCard label="In Progress" value={metrics.inProgress} />
        <MetricCard label="Emergencies" value={metrics.emergencies} alert={metrics.emergencies > 0} />
      </section>

      <section className="panel">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
          <Field label="Search" value={search} onChange={setSearch} placeholder="Job, customer, address, crew..." />
          <SelectField
            label="Technician"
            value={employeeFilter}
            onChange={setEmployeeFilter}
            options={[
              ['', 'All technicians'],
              ...employees.map((employee) => [employee.id, employeeName(employee)]),
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
        </div>
      </section>

      <section className="panel">
        <div className="between" style={{ gap: 16 }}>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => movePeriod(-1)}>← Previous</button>
            <button type="button" className="secondary" onClick={() => movePeriod(1)}>Next →</button>
          </div>

          <h2 style={{ margin: 0, textAlign: 'center' }}>{periodTitle}</h2>

          <div className="actions">
            {VIEW_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={view === option ? 'primary' : 'secondary'}
                onClick={() => setView(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 290px', gap: 18, alignItems: 'start' }}>
        <main>
          {view === 'Month' && (
            <MonthCalendar
              anchorDate={anchorDate}
              jobsForDay={jobsForDay}
              onOpenJob={openEditor}
              onSelectDate={(date) => { setAnchorDate(date); setView('Day') }}
              draggedJobId={draggedJobId}
              setDraggedJobId={setDraggedJobId}
              onDropJob={scheduleOnDate}
              customerById={customerById}
            />
          )}

          {view === 'Week' && (
            <WeekCalendar
              anchorDate={anchorDate}
              jobsForDay={jobsForDay}
              onOpenJob={openEditor}
              onSelectDate={(date) => { setAnchorDate(date); setView('Day') }}
              draggedJobId={draggedJobId}
              setDraggedJobId={setDraggedJobId}
              onDropJob={scheduleOnDate}
              customerById={customerById}
            />
          )}

          {view === 'Day' && (
            <DayCalendar
              date={anchorDate}
              jobs={jobsForDay(anchorDate)}
              onOpenJob={openEditor}
              customerById={customerById}
              propertyById={propertyById}
              employeeById={employeeById}
            />
          )}

          {view === 'Dispatch' && (
            <DispatchBoard
              anchorDate={anchorDate}
              jobs={filteredJobs}
              employees={employees}
              customerById={customerById}
              propertyById={propertyById}
              employeeById={employeeById}
              onOpenJob={openEditor}
              onUpdate={quickUpdate}
            />
          )}
        </main>

        <aside style={{ display: 'grid', gap: 14 }}>
          <section className="panel" style={{ position: 'sticky', top: 18 }}>
            <div className="between">
              <div>
                <h2 style={{ marginBottom: 4 }}>Unscheduled Jobs</h2>
                <p className="small" style={{ margin: 0 }}>Drag a job onto the month or week calendar.</p>
              </div>
              <Badge>{unscheduledJobs.length}</Badge>
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 14, maxHeight: 620, overflow: 'auto' }}>
              {unscheduledJobs.map((job) => (
                <UnscheduledJobCard
                  key={job.id}
                  job={job}
                  customer={customerById[job.customer_id]}
                  property={propertyById[job.property_id]}
                  onOpen={() => openEditor(job, anchorDate)}
                  onDragStart={() => setDraggedJobId(job.id)}
                  onDragEnd={() => setDraggedJobId('')}
                />
              ))}

              {!unscheduledJobs.length && <Empty>No unscheduled jobs</Empty>}
            </div>
          </section>

          {selectedJob && (
            <section className="panel">
              <div className="between">
                <h2 style={{ margin: 0 }}>Selected Job</h2>
                <Badge>{selectedJob.status || 'New'}</Badge>
              </div>
              <h3>{jobLabel(selectedJob)}</h3>
              <p className="small">{customerName(customerById[selectedJob.customer_id])}</p>
              <p className="small">{propertyAddress(propertyById[selectedJob.property_id])}</p>
              <p><b>{formatRange(selectedJob.scheduled_start, selectedJob.scheduled_end)}</b></p>
              <div className="actions">
                <button type="button" className="primary" onClick={() => openEditor(selectedJob)}>Edit Schedule</button>
                {selectedJob.scheduled_start && (
                  <button type="button" className="danger" onClick={() => unscheduleJob(selectedJob)}>Unschedule</button>
                )}
              </div>
            </section>
          )}
        </aside>
      </div>

      {editor && (
        <ScheduleEditor
          editor={editor}
          setEditor={setEditor}
          job={jobs.find((item) => item.id === editor.id)}
          employees={employees}
          customer={customerById[jobs.find((item) => item.id === editor.id)?.customer_id]}
          property={propertyById[jobs.find((item) => item.id === editor.id)?.property_id]}
          onToggleEmployee={toggleEmployee}
          onClose={closeEditor}
          onSave={saveSchedule}
          saving={saving}
        />
      )}
    </div>
  )
}

function MetricCard({ label, value, alert }) {
  return (
    <section className="panel" style={{ borderColor: alert ? '#dc2626' : undefined }}>
      <div className="small">{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, marginTop: 5, color: alert ? '#b91c1c' : undefined }}>{value}</div>
    </section>
  )
}

function MonthCalendar({ anchorDate, jobsForDay, onOpenJob, onSelectDate, draggedJobId, setDraggedJobId, onDropJob, customerById }) {
  const gridStart = startOfMonthGrid(anchorDate)
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
  const today = new Date()

  return (
    <section className="panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} style={{ padding: 10, textAlign: 'center', fontWeight: 800 }}>{day}</div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {days.map((date) => {
          const dayJobs = jobsForDay(date)
          const inMonth = date.getMonth() === anchorDate.getMonth()

          return (
            <div
              key={dateKey(date)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedJobId) onDropJob(draggedJobId, date)
                setDraggedJobId('')
              }}
              style={{
                minHeight: 142,
                padding: 8,
                borderRight: '1px solid #e2e8f0',
                borderBottom: '1px solid #e2e8f0',
                background: sameDay(date, today) ? '#eff6ff' : inMonth ? '#ffffff' : '#f8fafc',
                opacity: inMonth ? 1 : 0.62,
              }}
            >
              <button
                type="button"
                onClick={() => onSelectDate(date)}
                style={{
                  border: 0,
                  background: sameDay(date, today) ? '#2563eb' : 'transparent',
                  color: sameDay(date, today) ? '#fff' : '#334155',
                  borderRadius: 999,
                  width: 28,
                  height: 28,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {date.getDate()}
              </button>

              <div style={{ display: 'grid', gap: 4, marginTop: 5 }}>
                {dayJobs.slice(0, 4).map((job) => (
                  <CalendarJobChip
                    key={job.id}
                    job={job}
                    customer={customerById[job.customer_id]}
                    onClick={() => onOpenJob(job, date)}
                    onDragStart={() => setDraggedJobId(job.id)}
                    onDragEnd={() => setDraggedJobId('')}
                  />
                ))}

                {dayJobs.length > 4 && (
                  <button type="button" className="secondary" style={{ padding: '4px 7px', fontSize: 11 }} onClick={() => onSelectDate(date)}>
                    +{dayJobs.length - 4} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function WeekCalendar({ anchorDate, jobsForDay, onOpenJob, onSelectDate, draggedJobId, setDraggedJobId, onDropJob, customerById }) {
  const weekStart = startOfWeek(anchorDate)
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
  const today = new Date()

  return (
    <section className="panel" style={{ padding: 0, overflow: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '90px repeat(7, minmax(150px, 1fr))', minWidth: 1140 }}>
        <div style={{ padding: 12, background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }} />
        {days.map((date) => (
          <button
            key={dateKey(date)}
            type="button"
            onClick={() => onSelectDate(date)}
            style={{
              padding: 12,
              border: 0,
              borderLeft: '1px solid #e2e8f0',
              borderBottom: '1px solid #cbd5e1',
              background: sameDay(date, today) ? '#dbeafe' : '#f8fafc',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            {formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}
          </button>
        ))}

        {Array.from({ length: WORKDAY_END - WORKDAY_START + 1 }, (_, index) => WORKDAY_START + index).map((hour) => (
          <React.Fragment key={hour}>
            <div style={{ height: SLOT_HEIGHT, padding: 8, fontSize: 12, color: '#64748b', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              {new Date(2000, 0, 1, hour).toLocaleTimeString('en-US', { hour: 'numeric' })}
            </div>
            {days.map((date) => {
              const hourJobs = jobsForDay(date).filter((job) => new Date(job.scheduled_start).getHours() === hour)

              return (
                <div
                  key={`${dateKey(date)}-${hour}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!draggedJobId) return
                    const dropDate = new Date(date)
                    dropDate.setHours(hour, 0, 0, 0)
                    onDropJob(draggedJobId, dropDate)
                    setDraggedJobId('')
                  }}
                  style={{ minHeight: SLOT_HEIGHT, padding: 4, borderLeft: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}
                >
                  {hourJobs.map((job) => (
                    <CalendarJobChip
                      key={job.id}
                      job={job}
                      customer={customerById[job.customer_id]}
                      onClick={() => onOpenJob(job, date)}
                      onDragStart={() => setDraggedJobId(job.id)}
                      onDragEnd={() => setDraggedJobId('')}
                    />
                  ))}
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>
    </section>
  )
}

function DayCalendar({ date, jobs, onOpenJob, customerById, propertyById, employeeById }) {
  const ordered = [...jobs].sort(sortJobs)

  return (
    <section className="panel">
      <div className="between">
        <h2 style={{ margin: 0 }}>Daily Schedule</h2>
        <Badge>{ordered.length} Jobs</Badge>
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        {ordered.map((job) => (
          <article key={job.id} className="card" style={{ borderLeft: `6px solid ${statusTone(job.status)}` }}>
            <div className="between" style={{ gap: 12, alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#475569' }}>{formatRange(job.scheduled_start, job.scheduled_end)}</div>
                <h3 style={{ margin: '5px 0' }}>{jobLabel(job)}</h3>
                <p className="small" style={{ margin: 0 }}>{customerName(customerById[job.customer_id])}</p>
                <p className="small" style={{ margin: '4px 0' }}>{propertyAddress(propertyById[job.property_id])}</p>
              </div>

              <div className="actions">
                <Badge>{job.status || 'New'}</Badge>
                <Badge>{job.priority || 'Normal'}</Badge>
              </div>
            </div>

            <p>{job.scope || 'No scope entered.'}</p>

            <div className="small">
              <b>Assigned:</b>{' '}
              {arrayValue(job.assigned_employee_ids).map((id) => employeeName(employeeById[id])).join(', ') || job.crew || 'Unassigned'}
            </div>

            {job.dispatch_notes && <p className="small"><b>Dispatch:</b> {job.dispatch_notes}</p>}

            <button type="button" className="primary" onClick={() => onOpenJob(job, date)}>Edit Schedule</button>
          </article>
        ))}

        {!ordered.length && <Empty>No jobs scheduled for this day</Empty>}
      </div>
    </section>
  )
}

function DispatchBoard({ anchorDate, jobs, employees, customerById, propertyById, employeeById, onOpenJob, onUpdate }) {
  const weekStart = startOfWeek(anchorDate)
  const weekEnd = endOfDay(addDays(weekStart, 6))

  const activeJobs = jobs.filter((job) => {
    if (!job.scheduled_start) return !['Completed', 'Cancelled'].includes(job.status)
    const date = new Date(job.scheduled_start)
    return date >= weekStart && date <= weekEnd && !['Completed', 'Cancelled'].includes(job.status)
  })

  const unassigned = activeJobs.filter((job) => arrayValue(job.assigned_employee_ids).length === 0)

  function employeeJobs(employeeId) {
    return activeJobs.filter((job) => arrayValue(job.assigned_employee_ids).includes(employeeId))
  }

  async function assignJob(jobId, employeeId) {
    const job = jobs.find((item) => item.id === jobId)
    if (!job) return

    const assigned = arrayValue(job.assigned_employee_ids)
    if (assigned.includes(employeeId)) return

    await onUpdate(jobId, {
      assigned_employee_ids: [...assigned, employeeId],
      status: job.status === 'New' ? 'Scheduled' : job.status,
    })
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="panel">
        <div className="between">
          <div>
            <h2 style={{ marginBottom: 4 }}>Dispatch Board</h2>
            <p className="small" style={{ margin: 0 }}>Drag unassigned jobs onto a technician.</p>
          </div>
          <Badge>{activeJobs.length} Active Jobs</Badge>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 14 }}>
        <DispatchColumn
          title="Unassigned"
          subtitle={`${unassigned.length} jobs`}
          jobs={unassigned}
          customerById={customerById}
          propertyById={propertyById}
          onOpenJob={onOpenJob}
          onDragStart={() => {}}
        />

        {employees.map((employee) => {
          const assigned = employeeJobs(employee.id)

          return (
            <DispatchColumn
              key={employee.id}
              title={employeeName(employee)}
              subtitle={`${assigned.length} jobs · ${assigned.reduce((total, job) => total + durationHours(job.scheduled_start, job.scheduled_end), 0).toFixed(1)} hrs`}
              jobs={assigned}
              customerById={customerById}
              propertyById={propertyById}
              onOpenJob={onOpenJob}
              onDropJob={(jobId) => assignJob(jobId, employee.id)}
            />
          )
        })}
      </div>
    </div>
  )
}

function DispatchColumn({ title, subtitle, jobs, customerById, propertyById, onOpenJob, onDropJob }) {
  return (
    <section
      className="panel"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const jobId = event.dataTransfer.getData('text/job-id')
        if (jobId && onDropJob) onDropJob(jobId)
      }}
      style={{ minHeight: 280 }}
    >
      <div className="between">
        <div>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <div className="small">{subtitle}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
        {jobs.sort(sortJobs).map((job) => (
          <article
            key={job.id}
            className="card"
            draggable
            onDragStart={(event) => event.dataTransfer.setData('text/job-id', job.id)}
            onClick={() => onOpenJob(job)}
            style={{ cursor: 'grab', borderLeft: `5px solid ${statusTone(job.status)}` }}
          >
            <div className="between" style={{ gap: 8 }}>
              <strong>{jobLabel(job)}</strong>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: priorityTone(job.priority), flex: '0 0 auto' }} />
            </div>
            <div className="small">{formatRange(job.scheduled_start, job.scheduled_end)}</div>
            <div className="small">{customerName(customerById[job.customer_id])}</div>
            <div className="small">{propertyAddress(propertyById[job.property_id])}</div>
          </article>
        ))}

        {!jobs.length && <Empty>Drop jobs here</Empty>}
      </div>
    </section>
  )
}

function CalendarJobChip({ job, customer, onClick, onDragStart, onDragEnd }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      title={`${jobLabel(job)} · ${customerName(customer)}`}
      style={{
        display: 'block',
        width: '100%',
        border: 0,
        borderLeft: `4px solid ${priorityTone(job.priority)}`,
        borderRadius: 5,
        padding: '5px 7px',
        background: statusTone(job.status),
        color: '#fff',
        textAlign: 'left',
        fontSize: 11,
        fontWeight: 800,
        cursor: 'grab',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}
    >
      {formatTime(job.scheduled_start)} · {jobLabel(job)}
    </button>
  )
}

function UnscheduledJobCard({ job, customer, property, onOpen, onDragStart, onDragEnd }) {
  return (
    <article
      className="card"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ cursor: 'grab', borderLeft: `5px solid ${priorityTone(job.priority)}` }}
    >
      <div className="between" style={{ gap: 8 }}>
        <strong>{jobLabel(job)}</strong>
        <Badge>{job.priority || 'Normal'}</Badge>
      </div>
      <div className="small">{customerName(customer)}</div>
      <div className="small">{propertyAddress(property)}</div>
      <button type="button" className="secondary" style={{ marginTop: 8, width: '100%' }} onClick={onOpen}>Schedule</button>
    </article>
  )
}

function ScheduleEditor({ editor, setEditor, job, employees, customer, property, onToggleEmployee, onClose, onSave, saving }) {
  return (
    <Modal title={`Schedule ${jobLabel(job)}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: 16 }}>
        <section className="card">
          <h3 style={{ marginTop: 0 }}>{customerName(customer)}</h3>
          <p className="small">{propertyAddress(property)}</p>
          <p>{job?.scope || 'No scope entered.'}</p>
        </section>

        <div className="grid-2">
          <Field
            label="Scheduled Start"
            type="datetime-local"
            value={editor.scheduled_start}
            onChange={(value) => setEditor((current) => ({
              ...current,
              scheduled_start: value,
              scheduled_end: current.scheduled_end || defaultEnd(value),
            }))}
          />
          <Field
            label="Scheduled End"
            type="datetime-local"
            value={editor.scheduled_end}
            onChange={(value) => setEditor((current) => ({ ...current, scheduled_end: value }))}
          />
        </div>

        <div className="grid-2">
          <SelectField
            label="Status"
            value={editor.status}
            onChange={(value) => setEditor((current) => ({ ...current, status: value }))}
            options={STATUS_OPTIONS.map((status) => [status, status])}
          />
          <SelectField
            label="Priority"
            value={editor.priority}
            onChange={(value) => setEditor((current) => ({ ...current, priority: value }))}
            options={PRIORITY_OPTIONS.map((priority) => [priority, priority])}
          />
        </div>

        <Field
          label="Crew Name / Truck"
          value={editor.crew}
          onChange={(value) => setEditor((current) => ({ ...current, crew: value }))}
          placeholder="Crew 1, Service Truck 2..."
        />

        <div>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Assigned Technicians</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
            {employees.map((employee) => {
              const checked = arrayValue(editor.assigned_employee_ids).includes(employee.id)

              return (
                <label key={employee.id} className="card" style={{ display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer', padding: 10 }}>
                  <input type="checkbox" checked={checked} onChange={() => onToggleEmployee(employee.id)} />
                  <span>{employeeName(employee)}</span>
                </label>
              )
            })}
          </div>
        </div>

        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontWeight: 800 }}>Dispatch Notes</span>
          <textarea
            rows={5}
            value={editor.dispatch_notes}
            onChange={(event) => setEditor((current) => ({ ...current, dispatch_notes: event.target.value }))}
            placeholder="Gate access, parts to bring, customer instructions..."
            style={{ width: '100%', resize: 'vertical', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, font: 'inherit' }}
          />
        </label>

        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" disabled={saving} onClick={onSave}>
            {saving ? 'Saving...' : 'Save Schedule'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
