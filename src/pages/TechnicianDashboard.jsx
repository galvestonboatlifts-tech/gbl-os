import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase as sharedSupabase } from '../lib/supabase'

const OPEN_STATUSES = [
  'new',
  'scheduled',
  'dispatched',
  'in progress',
  'on hold',
]

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function formatDate(value) {
  if (!value) {
    return 'No date'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(value) {
  if (!value) {
    return 'No time scheduled'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isToday(value) {
  if (!value) {
    return false
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return false
  }

  const today = new Date()

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

function startOfWeek() {
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    diff,
    0,
    0,
    0,
    0
  )
}

function getCustomerName(customer) {
  if (!customer) {
    return 'No customer'
  }

  const fullName = [
    customer.first_name,
    customer.last_name,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    customer.name ||
    customer.company_name ||
    fullName ||
    customer.email ||
    'No customer'
  )
}

function getEmployeeName(employee) {
  if (!employee) {
    return 'Technician'
  }

  const fullName = [
    employee.first_name,
    employee.last_name,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    employee.name ||
    fullName ||
    employee.email ||
    'Technician'
  )
}

function getJobTitle(job) {
  return (
    job.job_number ||
    job.number ||
    job.title ||
    job.name ||
    'Untitled job'
  )
}

function getJobDate(job) {
  return (
    job.scheduled_start ||
    job.start_date ||
    job.scheduled_date ||
    job.due_date ||
    job.created_at
  )
}

function getAssignedEmployeeId(job) {
  return (
    job.employee_id ||
    job.technician_id ||
    job.assigned_employee_id ||
    job.assigned_to ||
    job.user_id ||
    null
  )
}

async function safeQuery(queryPromise) {
  try {
    const result = await queryPromise

    if (result.error) {
      return {
        data: [],
        error: result.error,
      }
    }

    return {
      data: Array.isArray(result.data)
        ? result.data
        : [],
      error: null,
    }
  } catch (error) {
    return {
      data: [],
      error,
    }
  }
}

export default function TechnicianDashboard({
  supabase: suppliedSupabase,
  onNavigate,
} = {}) {
  const supabase =
    suppliedSupabase || sharedSupabase

  const [jobs, setJobs] = useState([])
  const [customers, setCustomers] =
    useState([])
  const [employees, setEmployees] =
    useState([])
  const [serviceReports, setServiceReports] =
    useState([])
  const [timeEntries, setTimeEntries] =
    useState([])

  const [currentUser, setCurrentUser] =
    useState(null)
  const [currentEmployee, setCurrentEmployee] =
    useState(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] =
    useState(false)
  const [notice, setNotice] = useState('')
  const [clockBusy, setClockBusy] =
    useState(false)
  const [lastUpdated, setLastUpdated] =
    useState(null)

  const loadDashboard = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setNotice('')

      const authResult =
        await supabase.auth.getUser()

      const user =
        authResult?.data?.user || null

      setCurrentUser(user)

      const [
        jobsResult,
        customersResult,
        employeesResult,
        reportsResult,
        timeEntriesResult,
      ] = await Promise.all([
        safeQuery(
          supabase
            .from('jobs')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),

        safeQuery(
          supabase
            .from('customers')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),

        safeQuery(
          supabase
            .from('employees')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),

        safeQuery(
          supabase
            .from('service_reports')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),

        safeQuery(
          supabase
            .from('time_entries')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),
      ])

      setJobs(jobsResult.data)
      setCustomers(customersResult.data)
      setEmployees(employeesResult.data)
      setServiceReports(reportsResult.data)
      setTimeEntries(timeEntriesResult.data)

      const employee =
        employeesResult.data.find(
          (item) =>
            item.user_id === user?.id ||
            item.auth_user_id === user?.id ||
            item.email === user?.email
        ) || null

      setCurrentEmployee(employee)

      const errors = [
        jobsResult.error,
        customersResult.error,
        employeesResult.error,
        reportsResult.error,
        timeEntriesResult.error,
      ].filter(Boolean)

      if (errors.length) {
        console.warn(
          'Technician dashboard loaded with limited data:',
          errors
        )

        setNotice(
          'Some technician data could not be loaded. Available information is still shown.'
        )
      }

      setLastUpdated(new Date())
      setLoading(false)
      setRefreshing(false)
    },
    [supabase]
  )

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

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

  const employeeId =
    currentEmployee?.id || null

  const assignedJobs = useMemo(() => {
    if (!employeeId && !currentUser?.id) {
      return jobs
    }

    return jobs.filter((job) => {
      const assignedId =
        getAssignedEmployeeId(job)

      return (
        assignedId === employeeId ||
        assignedId === currentUser?.id ||
        Array.isArray(job.employee_ids) &&
          job.employee_ids.includes(employeeId) ||
        Array.isArray(job.technician_ids) &&
          job.technician_ids.includes(employeeId)
      )
    })
  }, [
    jobs,
    employeeId,
    currentUser,
  ])

  const openAssignedJobs = useMemo(
    () =>
      assignedJobs.filter((job) =>
        OPEN_STATUSES.includes(
          normalize(job.status || 'new')
        )
      ),
    [assignedJobs]
  )

  const todayJobs = useMemo(
    () =>
      openAssignedJobs
        .filter((job) =>
          isToday(getJobDate(job))
        )
        .sort(
          (a, b) =>
            new Date(getJobDate(a)) -
            new Date(getJobDate(b))
        ),
    [openAssignedJobs]
  )

  const activeJob = useMemo(
    () =>
      openAssignedJobs.find(
        (job) =>
          normalize(job.status) ===
          'in progress'
      ) || todayJobs[0] || null,
    [openAssignedJobs, todayJobs]
  )

  const upcomingJobs = useMemo(
    () =>
      openAssignedJobs
        .filter((job) => {
          const date = new Date(
            getJobDate(job) || 0
          )

          return (
            !Number.isNaN(date.getTime()) &&
            !isToday(date) &&
            date > new Date()
          )
        })
        .sort(
          (a, b) =>
            new Date(getJobDate(a)) -
            new Date(getJobDate(b))
        )
        .slice(0, 6),
    [openAssignedJobs]
  )

  const completedThisWeek = useMemo(() => {
    const weekStart = startOfWeek()

    return assignedJobs.filter((job) => {
      if (
        ![
          'completed',
          'closed',
          'done',
        ].includes(normalize(job.status))
      ) {
        return false
      }

      const completedDate = new Date(
        job.completed_at ||
          job.updated_at ||
          0
      )

      return (
        !Number.isNaN(
          completedDate.getTime()
        ) &&
        completedDate >= weekStart
      )
    })
  }, [assignedJobs])

  const technicianReports = useMemo(() => {
    if (!employeeId && !currentUser?.id) {
      return serviceReports
    }

    return serviceReports.filter(
      (report) =>
        report.employee_id === employeeId ||
        report.technician_id === employeeId ||
        report.user_id === currentUser?.id ||
        assignedJobs.some(
          (job) => job.id === report.job_id
        )
    )
  }, [
    serviceReports,
    employeeId,
    currentUser,
    assignedJobs,
  ])

  const incompleteReports = useMemo(
    () =>
      technicianReports.filter(
        (report) =>
          ![
            'completed',
            'submitted',
            'sent',
            'approved',
            'archived',
          ].includes(
            normalize(report.status)
          )
      ),
    [technicianReports]
  )

  const currentTimeEntry = useMemo(() => {
    return (
      timeEntries.find((entry) => {
        const belongsToUser =
          entry.employee_id === employeeId ||
          entry.user_id === currentUser?.id

        const isOpen =
          !entry.clock_out &&
          !entry.ended_at &&
          !entry.end_time

        return belongsToUser && isOpen
      }) || null
    )
  }, [
    timeEntries,
    employeeId,
    currentUser,
  ])

  const isClockedIn =
    Boolean(currentTimeEntry)

  async function handleClockToggle() {
    if (!employeeId && !currentUser?.id) {
      setNotice(
        'No employee record is linked to this login.'
      )
      return
    }

    setClockBusy(true)
    setNotice('')

    try {
      if (isClockedIn) {
        const { error } = await supabase
          .from('time_entries')
          .update({
            clock_out: new Date().toISOString(),
            ended_at: new Date().toISOString(),
          })
          .eq('id', currentTimeEntry.id)

        if (error) {
          throw error
        }
      } else {
        const payload = {
          employee_id: employeeId,
          user_id: currentUser?.id,
          clock_in: new Date().toISOString(),
          started_at: new Date().toISOString(),
          status: 'active',
        }

        const { error } = await supabase
          .from('time_entries')
          .insert(payload)

        if (error) {
          throw error
        }
      }

      await loadDashboard(true)
    } catch (error) {
      console.error(
        'Unable to update time clock:',
        error
      )

      setNotice(
        'Time clock could not be updated. Your database may use a different time-entry table or column setup.'
      )
    } finally {
      setClockBusy(false)
    }
  }

  function navigate(view) {
    if (typeof onNavigate === 'function') {
      onNavigate(view)
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Technician Dashboard</h2>
        <p>Loading technician workspace...</p>
      </section>
    )
  }

  return (
    <>
      <div className="toolbar">
        <div>
          <h1 style={{ margin: 0 }}>
            Technician Dashboard
          </h1>

          <div
            className="small"
            style={{ marginTop: 6 }}
          >
            Welcome,{' '}
            {getEmployeeName(
              currentEmployee
            )}
            {lastUpdated
              ? ` · Updated ${lastUpdated.toLocaleTimeString(
                  'en-US',
                  {
                    hour: 'numeric',
                    minute: '2-digit',
                  }
                )}`
              : ''}
          </div>
        </div>

        <div className="actions">
          <button
            className="secondary"
            disabled={refreshing}
            onClick={() =>
              loadDashboard(true)
            }
          >
            {refreshing
              ? 'Refreshing...'
              : 'Refresh'}
          </button>

          <button
            className={
              isClockedIn
                ? 'secondary'
                : 'primary'
            }
            disabled={clockBusy}
            onClick={handleClockToggle}
          >
            {clockBusy
              ? 'Saving...'
              : isClockedIn
                ? 'Clock Out'
                : 'Clock In'}
          </button>
        </div>
      </div>

      {notice && (
        <section className="panel">
          <strong>Technician notice</strong>
          <p>{notice}</p>
        </section>
      )}

      <div className="metrics">
        <Metric
          label="Jobs Today"
          value={todayJobs.length}
          onClick={() => navigate('jobs')}
        />

        <Metric
          label="Open Assigned Jobs"
          value={openAssignedJobs.length}
          onClick={() => navigate('jobs')}
        />

        <Metric
          label="Reports To Finish"
          value={incompleteReports.length}
          onClick={() =>
            navigate('serviceReports')
          }
        />

        <Metric
          label="Completed This Week"
          value={completedThisWeek.length}
          onClick={() => navigate('jobs')}
        />
      </div>

      <section className="panel">
        <div className="between">
          <div>
            <h2>Quick Actions</h2>
            <p className="small">
              Open the tools needed in the field.
            </p>
          </div>
        </div>

        <div className="actions">
          <button
            className="primary"
            onClick={() => navigate('jobs')}
          >
            Open My Jobs
          </button>

          <button
            className="secondary"
            onClick={() =>
              navigate('serviceReports')
            }
          >
            Service Reports
          </button>

          <button
            className="secondary"
            onClick={() =>
              navigate('scheduling')
            }
          >
            View Schedule
          </button>

          <button
            className="secondary"
            onClick={() =>
              navigate('customers')
            }
          >
            Customer Details
          </button>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="between">
            <div>
              <h2>Active Job</h2>
              <p className="small">
                Your current or next scheduled job.
              </p>
            </div>
          </div>

          {activeJob ? (
            <article className="card">
              <div className="between">
                <div>
                  <strong>
                    {getJobTitle(activeJob)}
                  </strong>

                  <div className="small">
                    {getCustomerName(
                      customerById[
                        activeJob.customer_id
                      ]
                    )}
                  </div>
                </div>

                <StatusBadge
                  value={
                    activeJob.status ||
                    'Scheduled'
                  }
                />
              </div>

              <p>
                <b>Scheduled:</b>{' '}
                {formatDateTime(
                  getJobDate(activeJob)
                )}
              </p>

              <p>
                <b>Address:</b>{' '}
                {activeJob.address ||
                  activeJob.service_address ||
                  activeJob.location ||
                  'No address entered'}
              </p>

              <p>
                <b>Work:</b>{' '}
                {activeJob.description ||
                  activeJob.scope_of_work ||
                  activeJob.notes ||
                  'No work description entered'}
              </p>

              <div className="actions">
                <button
                  className="primary"
                  onClick={() =>
                    navigate('jobs')
                  }
                >
                  Open Job
                </button>

                <button
                  className="secondary"
                  onClick={() =>
                    navigate('serviceReports')
                  }
                >
                  Create Report
                </button>
              </div>
            </article>
          ) : (
            <EmptyState>
              No active job is assigned.
            </EmptyState>
          )}
        </section>

        <section className="panel">
          <div className="between">
            <div>
              <h2>Today’s Schedule</h2>
              <p className="small">
                Assigned jobs scheduled for today.
              </p>
            </div>

            <button
              className="secondary"
              onClick={() =>
                navigate('scheduling')
              }
            >
              Full Schedule
            </button>
          </div>

          <div className="cards">
            {todayJobs.map((job) => (
              <article
                className="card"
                key={job.id}
              >
                <div className="between">
                  <div>
                    <strong>
                      {getJobTitle(job)}
                    </strong>

                    <div className="small">
                      {getCustomerName(
                        customerById[
                          job.customer_id
                        ]
                      )}
                    </div>
                  </div>

                  <StatusBadge
                    value={
                      job.status ||
                      'Scheduled'
                    }
                  />
                </div>

                <p>
                  {formatDateTime(
                    getJobDate(job)
                  )}
                </p>

                <p>
                  {job.address ||
                    job.service_address ||
                    job.location ||
                    'No address entered'}
                </p>

                <button
                  className="secondary"
                  onClick={() =>
                    navigate('jobs')
                  }
                >
                  View Job
                </button>
              </article>
            ))}

            {!todayJobs.length && (
              <EmptyState>
                No jobs are scheduled for today.
              </EmptyState>
            )}
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="between">
            <div>
              <h2>Upcoming Jobs</h2>
              <p className="small">
                Your next assigned jobs.
              </p>
            </div>
          </div>

          <div className="cards">
            {upcomingJobs.map((job) => (
              <article
                className="card"
                key={job.id}
              >
                <div className="between">
                  <strong>
                    {getJobTitle(job)}
                  </strong>

                  <StatusBadge
                    value={
                      job.status ||
                      'Scheduled'
                    }
                  />
                </div>

                <p>
                  {formatDateTime(
                    getJobDate(job)
                  )}
                </p>

                <p>
                  {getCustomerName(
                    customerById[
                      job.customer_id
                    ]
                  )}
                </p>
              </article>
            ))}

            {!upcomingJobs.length && (
              <EmptyState>
                No upcoming jobs are assigned.
              </EmptyState>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="between">
            <div>
              <h2>Reports To Complete</h2>
              <p className="small">
                Draft or unfinished service reports.
              </p>
            </div>

            <button
              className="secondary"
              onClick={() =>
                navigate('serviceReports')
              }
            >
              Open Reports
            </button>
          </div>

          <div className="cards">
            {incompleteReports
              .slice(0, 6)
              .map((report) => (
                <article
                  className="card"
                  key={report.id}
                >
                  <div className="between">
                    <div>
                      <strong>
                        {report.report_number ||
                          report.number ||
                          report.title ||
                          'Service Report'}
                      </strong>

                      <div className="small">
                        {report.job_id
                          ? `Job ${report.job_id}`
                          : 'No linked job'}
                      </div>
                    </div>

                    <StatusBadge
                      value={
                        report.status ||
                        'Draft'
                      }
                    />
                  </div>

                  <p>
                    Updated{' '}
                    {formatDate(
                      report.updated_at ||
                        report.created_at
                    )}
                  </p>
                </article>
              ))}

            {!incompleteReports.length && (
              <EmptyState>
                All service reports are complete.
              </EmptyState>
            )}
          </div>
        </section>
      </div>
    </>
  )
}

function Metric({
  label,
  value,
  onClick,
}) {
  return (
    <button
      type="button"
      className="metric"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        border: 'none',
        cursor: onClick
          ? 'pointer'
          : 'default',
      }}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  )
}

function StatusBadge({ value }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '5px 9px',
        borderRadius: 999,
        background: '#e2e8f0',
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {value}
    </span>
  )
}

function EmptyState({ children }) {
  return (
    <div
      className="card"
      style={{
        textAlign: 'center',
        color: '#64748b',
      }}
    >
      {children}
    </div>
  )
}
