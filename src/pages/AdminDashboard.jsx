import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase as sharedSupabase } from '../lib/supabase'

const OPEN_JOB_STATUSES = [
  'New',
  'Scheduled',
  'Dispatched',
  'In Progress',
  'On Hold',
]

const CLOSED_JOB_STATUSES = [
  'Completed',
  'Cancelled',
]

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
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
    return 'No time'
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

function customerName(customer) {
  if (!customer) {
    return 'No customer'
  }

  const personName = [
    customer.first_name,
    customer.last_name,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    customer.name ||
    customer.company_name ||
    personName ||
    customer.email ||
    'No customer'
  )
}

function jobLabel(job) {
  return (
    job.number ||
    job.job_number ||
    job.title ||
    'Untitled job'
  )
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

function isPastDue(value) {
  if (!value) {
    return false
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return false
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  date.setHours(0, 0, 0, 0)

  return date < today
}

function startOfCurrentMonth() {
  const now = new Date()

  return new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  )
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase()
}

function invoiceBalance(invoice) {
  if (
    invoice.balance_due !== undefined &&
    invoice.balance_due !== null
  ) {
    return Number(invoice.balance_due || 0)
  }

  const total = Number(
    invoice.total ||
      invoice.total_amount ||
      invoice.amount ||
      0
  )

  const paid = Number(
    invoice.amount_paid ||
      invoice.paid_amount ||
      0
  )

  return Math.max(0, total - paid)
}

function invoiceTotal(invoice) {
  return Number(
    invoice.total ||
      invoice.total_amount ||
      invoice.amount ||
      0
  )
}

async function safeSelect(table, queryBuilder) {
  try {
    const result = await queryBuilder(
      sharedSupabase.from(table)
    )

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

export default function AdminDashboard({
  supabase: suppliedSupabase,
  onNavigate,
} = {}) {
  const supabase =
    suppliedSupabase || sharedSupabase

  const [jobs, setJobs] = useState([])
  const [customers, setCustomers] = useState([])
  const [estimates, setEstimates] = useState([])
  const [invoices, setInvoices] = useState([])
  const [serviceReports, setServiceReports] =
    useState([])
  const [employees, setEmployees] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] =
    useState(false)
  const [errorMessage, setErrorMessage] =
    useState('')
  const [lastUpdated, setLastUpdated] =
    useState(null)

  const loadDashboard = useCallback(
    async (showRefreshState = false) => {
      if (showRefreshState) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setErrorMessage('')

      const results = await Promise.all([
        safeSelect('jobs', (query) =>
          query
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),

        safeSelect('customers', (query) =>
          query
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),

        safeSelect('estimates', (query) =>
          query
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),

        safeSelect('invoices', (query) =>
          query
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),

        safeSelect('service_reports', (query) =>
          query
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),

        safeSelect('employees', (query) =>
          query
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),
      ])

      const [
        jobsResult,
        customersResult,
        estimatesResult,
        invoicesResult,
        serviceReportsResult,
        employeesResult,
      ] = results

      setJobs(jobsResult.data)
      setCustomers(customersResult.data)
      setEstimates(estimatesResult.data)
      setInvoices(invoicesResult.data)
      setServiceReports(serviceReportsResult.data)
      setEmployees(employeesResult.data)

      const errors = results
        .map((result) => result.error)
        .filter(Boolean)

      if (errors.length) {
        console.warn(
          'Dashboard loaded with some unavailable data:',
          errors
        )

        setErrorMessage(
          'Some dashboard sections could not load. The available information is still shown.'
        )
      }

      setLastUpdated(new Date())
      setLoading(false)
      setRefreshing(false)
    },
    []
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

  const todayJobs = useMemo(
    () =>
      jobs
        .filter((job) =>
          isToday(
            job.scheduled_start ||
              job.start_date ||
              job.due_date
          )
        )
        .sort((a, b) => {
          const aDate = new Date(
            a.scheduled_start ||
              a.start_date ||
              a.due_date ||
              0
          )

          const bDate = new Date(
            b.scheduled_start ||
              b.start_date ||
              b.due_date ||
              0
          )

          return aDate - bDate
        }),
    [jobs]
  )

  const openJobs = useMemo(
    () =>
      jobs.filter((job) =>
        OPEN_JOB_STATUSES.includes(
          job.status || 'New'
        )
      ),
    [jobs]
  )

  const overdueJobs = useMemo(
    () =>
      openJobs.filter((job) =>
        isPastDue(
          job.due_date ||
            job.scheduled_start
        )
      ),
    [openJobs]
  )

  const emergencyJobs = useMemo(
    () =>
      openJobs.filter(
        (job) =>
          String(job.priority || '')
            .toLowerCase() === 'emergency'
      ),
    [openJobs]
  )

  const pendingEstimates = useMemo(
    () =>
      estimates.filter((estimate) => {
        const status = normalizeStatus(
          estimate.status
        )

        return ![
          'approved',
          'accepted',
          'declined',
          'rejected',
          'expired',
          'converted',
        ].includes(status)
      }),
    [estimates]
  )

  const unpaidInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          invoiceBalance(invoice) > 0 &&
          ![
            'paid',
            'void',
            'cancelled',
            'canceled',
          ].includes(
            normalizeStatus(invoice.status)
          )
      ),
    [invoices]
  )

  const unpaidTotal = useMemo(
    () =>
      unpaidInvoices.reduce(
        (total, invoice) =>
          total + invoiceBalance(invoice),
        0
      ),
    [unpaidInvoices]
  )

  const monthlyRevenue = useMemo(() => {
    const monthStart = startOfCurrentMonth()

    return invoices.reduce(
      (total, invoice) => {
        const status = normalizeStatus(
          invoice.status
        )

        const paidDate = new Date(
          invoice.paid_at ||
            invoice.payment_date ||
            invoice.updated_at ||
            invoice.created_at ||
            0
        )

        if (
          Number.isNaN(paidDate.getTime()) ||
          paidDate < monthStart
        ) {
          return total
        }

        if (
          status === 'paid' ||
          Number(
            invoice.amount_paid ||
              invoice.paid_amount ||
              0
          ) > 0
        ) {
          return (
            total +
            Number(
              invoice.amount_paid ||
                invoice.paid_amount ||
                invoiceTotal(invoice)
            )
          )
        }

        return total
      },
      0
    )
  }, [invoices])

  const completedThisMonth = useMemo(() => {
    const monthStart = startOfCurrentMonth()

    return jobs.filter((job) => {
      if (
        !CLOSED_JOB_STATUSES.includes(
          job.status
        )
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
        completedDate >= monthStart
      )
    }).length
  }, [jobs])

  const activeTechnicians = useMemo(
    () =>
      employees.filter((employee) => {
        const status = normalizeStatus(
          employee.status
        )

        return ![
          'inactive',
          'terminated',
          'disabled',
        ].includes(status)
      }).length,
    [employees]
  )

  const pendingReports = useMemo(
    () =>
      serviceReports.filter((report) =>
        ![
          'completed',
          'sent',
          'archived',
        ].includes(
          normalizeStatus(report.status)
        )
      ),
    [serviceReports]
  )

  const recentActivity = useMemo(() => {
    const activity = [
      ...jobs.map((job) => ({
        id: `job-${job.id}`,
        type: 'Job',
        title: jobLabel(job),
        detail:
          customerName(
            customerById[job.customer_id]
          ) +
          ` · ${job.status || 'New'}`,
        date:
          job.updated_at ||
          job.created_at,
        view: 'jobs',
      })),

      ...estimates.map((estimate) => ({
        id: `estimate-${estimate.id}`,
        type: 'Estimate',
        title:
          estimate.number ||
          estimate.estimate_number ||
          estimate.title ||
          'Estimate',
        detail:
          estimate.status ||
          'Draft',
        date:
          estimate.updated_at ||
          estimate.created_at,
        view: 'estimates',
      })),

      ...invoices.map((invoice) => ({
        id: `invoice-${invoice.id}`,
        type: 'Invoice',
        title:
          invoice.number ||
          invoice.invoice_number ||
          'Invoice',
        detail:
          `${invoice.status || 'Open'} · ${formatCurrency(
            invoiceTotal(invoice)
          )}`,
        date:
          invoice.updated_at ||
          invoice.created_at,
        view: 'invoices',
      })),

      ...serviceReports.map((report) => ({
        id: `report-${report.id}`,
        type: 'Service Report',
        title:
          report.report_number ||
          report.number ||
          report.title ||
          'Service report',
        detail:
          report.status ||
          'Draft',
        date:
          report.updated_at ||
          report.created_at,
        view: 'serviceReports',
      })),
    ]

    return activity
      .filter((item) => item.date)
      .sort(
        (a, b) =>
          new Date(b.date) -
          new Date(a.date)
      )
      .slice(0, 8)
  }, [
    jobs,
    estimates,
    invoices,
    serviceReports,
    customerById,
  ])

  function navigate(view) {
    if (typeof onNavigate === 'function') {
      onNavigate(view)
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Dashboard</h2>
        <p>Loading business overview...</p>
      </section>
    )
  }

  return (
    <>
      <div className="toolbar">
        <div>
          <h1 style={{ margin: 0 }}>
            Business Dashboard
          </h1>

          <div
            className="small"
            style={{ marginTop: 6 }}
          >
            {lastUpdated
              ? `Updated ${lastUpdated.toLocaleTimeString(
                  'en-US',
                  {
                    hour: 'numeric',
                    minute: '2-digit',
                  }
                )}`
              : 'Live business overview'}
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
            className="primary"
            onClick={() =>
              navigate('jobs')
            }
          >
            + New Job
          </button>
        </div>
      </div>

      {errorMessage && (
        <section className="panel">
          <strong>Dashboard notice</strong>
          <p>{errorMessage}</p>
        </section>
      )}

      <div className="metrics">
        <Metric
          label="Jobs Today"
          value={todayJobs.length}
          action={() => navigate('scheduling')}
        />

        <Metric
          label="Open Jobs"
          value={openJobs.length}
          action={() => navigate('jobs')}
        />

        <Metric
          label="Overdue Jobs"
          value={overdueJobs.length}
          action={() => navigate('jobs')}
        />

        <Metric
          label="Emergency Jobs"
          value={emergencyJobs.length}
          action={() => navigate('jobs')}
        />

        <Metric
          label="Unpaid Invoices"
          value={formatCurrency(unpaidTotal)}
          action={() => navigate('invoices')}
        />

        <Metric
          label="Pending Estimates"
          value={pendingEstimates.length}
          action={() => navigate('estimates')}
        />

        <Metric
          label="Revenue This Month"
          value={formatCurrency(monthlyRevenue)}
          action={() => navigate('invoices')}
        />

        <Metric
          label="Jobs Completed"
          value={completedThisMonth}
          action={() => navigate('jobs')}
        />
      </div>

      <section className="panel">
        <div className="between">
          <div>
            <h2>Quick Actions</h2>
            <p className="small">
              Open the most-used business tools.
            </p>
          </div>
        </div>

        <div className="actions">
          <button
            className="primary"
            onClick={() =>
              navigate('customers')
            }
          >
            New Customer
          </button>

          <button
            className="primary"
            onClick={() =>
              navigate('jobs')
            }
          >
            New Job
          </button>

          <button
            className="secondary"
            onClick={() =>
              navigate('estimates')
            }
          >
            New Estimate
          </button>

          <button
            className="secondary"
            onClick={() =>
              navigate('invoices')
            }
          >
            New Invoice
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
            Open Schedule
          </button>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="between">
            <div>
              <h2>Today’s Jobs</h2>
              <p className="small">
                Jobs scheduled or due today.
              </p>
            </div>

            <button
              className="secondary"
              onClick={() =>
                navigate('jobs')
              }
            >
              View All
            </button>
          </div>

          <div className="cards">
            {todayJobs.slice(0, 6).map((job) => (
              <article
                className="card"
                key={job.id}
              >
                <div className="between">
                  <div>
                    <strong>
                      {jobLabel(job)}
                    </strong>

                    <div className="small">
                      {customerName(
                        customerById[
                          job.customer_id
                        ]
                      )}
                    </div>
                  </div>

                  <StatusBadge
                    value={job.status || 'New'}
                  />
                </div>

                <p>
                  <b>Time:</b>{' '}
                  {formatDateTime(
                    job.scheduled_start ||
                      job.start_date ||
                      job.due_date
                  )}
                </p>

                <p>
                  <b>Crew:</b>{' '}
                  {job.crew || 'Unassigned'}
                </p>

                <button
                  className="secondary"
                  onClick={() =>
                    navigate('jobs')
                  }
                >
                  Open Jobs
                </button>
              </article>
            ))}

            {!todayJobs.length && (
              <EmptyMessage>
                No jobs are scheduled for today.
              </EmptyMessage>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="between">
            <div>
              <h2>Needs Attention</h2>
              <p className="small">
                Overdue work and unpaid balances.
              </p>
            </div>
          </div>

          <div className="cards">
            {overdueJobs
              .slice(0, 4)
              .map((job) => (
                <article
                  className="card"
                  key={`overdue-${job.id}`}
                >
                  <div className="between">
                    <strong>
                      {jobLabel(job)}
                    </strong>

                    <StatusBadge value="Overdue" />
                  </div>

                  <p>
                    Due {formatDate(job.due_date)}
                  </p>

                  <button
                    className="secondary"
                    onClick={() =>
                      navigate('jobs')
                    }
                  >
                    Review Job
                  </button>
                </article>
              ))}

            {unpaidInvoices
              .slice(0, 4)
              .map((invoice) => (
                <article
                  className="card"
                  key={`invoice-${invoice.id}`}
                >
                  <div className="between">
                    <strong>
                      {invoice.number ||
                        invoice.invoice_number ||
                        'Invoice'}
                    </strong>

                    <StatusBadge value="Unpaid" />
                  </div>

                  <p>
                    Balance:{' '}
                    {formatCurrency(
                      invoiceBalance(invoice)
                    )}
                  </p>

                  <button
                    className="secondary"
                    onClick={() =>
                      navigate('invoices')
                    }
                  >
                    Review Invoice
                  </button>
                </article>
              ))}

            {!overdueJobs.length &&
              !unpaidInvoices.length && (
                <EmptyMessage>
                  Nothing urgent needs attention.
                </EmptyMessage>
              )}
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="between">
            <div>
              <h2>Operations</h2>
              <p className="small">
                Current staffing and document workload.
              </p>
            </div>
          </div>

          <div className="metrics">
            <Metric
              label="Active Technicians"
              value={activeTechnicians}
              action={() => navigate('employees')}
            />

            <Metric
              label="Pending Reports"
              value={pendingReports.length}
              action={() =>
                navigate('serviceReports')
              }
            />

            <Metric
              label="Customers"
              value={customers.length}
              action={() =>
                navigate('customers')
              }
            />

            <Metric
              label="Total Jobs"
              value={jobs.length}
              action={() => navigate('jobs')}
            />
          </div>
        </section>

        <section className="panel">
          <div className="between">
            <div>
              <h2>Recent Activity</h2>
              <p className="small">
                Latest updates across the system.
              </p>
            </div>
          </div>

          <div className="cards">
            {recentActivity.map((item) => (
              <article
                className="card"
                key={item.id}
                style={{ cursor: 'pointer' }}
                onClick={() =>
                  navigate(item.view)
                }
              >
                <div className="between">
                  <div>
                    <strong>{item.title}</strong>

                    <div className="small">
                      {item.type}
                    </div>
                  </div>

                  <div className="small">
                    {formatDateTime(item.date)}
                  </div>
                </div>

                <p>{item.detail}</p>
              </article>
            ))}

            {!recentActivity.length && (
              <EmptyMessage>
                No recent activity is available.
              </EmptyMessage>
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
  action,
}) {
  return (
    <button
      type="button"
      className="metric"
      onClick={action}
      style={{
        width: '100%',
        textAlign: 'left',
        cursor: action
          ? 'pointer'
          : 'default',
        border: 'none',
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

function EmptyMessage({ children }) {
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
