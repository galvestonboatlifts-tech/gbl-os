import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase as sharedSupabase } from '../lib/supabase'

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0))
}

function formatDate(value) {
  if (!value) {
    return 'No date available'
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
    return 'No date scheduled'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function customerDisplayName(customer) {
  if (!customer) {
    return 'Customer'
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
    'Customer'
  )
}

function jobDisplayName(job) {
  return (
    job.job_number ||
    job.number ||
    job.title ||
    job.name ||
    'Service Job'
  )
}

function estimateDisplayName(estimate) {
  return (
    estimate.estimate_number ||
    estimate.number ||
    estimate.title ||
    'Estimate'
  )
}

function invoiceDisplayName(invoice) {
  return (
    invoice.invoice_number ||
    invoice.number ||
    invoice.title ||
    'Invoice'
  )
}

function reportDisplayName(report) {
  return (
    report.report_number ||
    report.number ||
    report.title ||
    'Service Report'
  )
}

function boatLiftDisplayName(lift) {
  return (
    lift.name ||
    lift.nickname ||
    lift.model ||
    lift.manufacturer ||
    'Boat Lift'
  )
}

function invoiceTotal(invoice) {
  return Number(
    invoice.total ||
      invoice.total_amount ||
      invoice.amount ||
      0
  )
}

function invoiceBalance(invoice) {
  if (
    invoice.balance_due !== undefined &&
    invoice.balance_due !== null
  ) {
    return Number(invoice.balance_due || 0)
  }

  const total = invoiceTotal(invoice)

  const paid = Number(
    invoice.amount_paid ||
      invoice.paid_amount ||
      0
  )

  return Math.max(0, total - paid)
}

function isUpcoming(value) {
  if (!value) {
    return false
  }

  const date = new Date(value)

  return (
    !Number.isNaN(date.getTime()) &&
    date >= new Date()
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

export default function CustomerDashboard({
  supabase: suppliedSupabase,
  onNavigate,
} = {}) {
  const supabase =
    suppliedSupabase || sharedSupabase

  const [currentUser, setCurrentUser] =
    useState(null)
  const [customer, setCustomer] =
    useState(null)

  const [jobs, setJobs] = useState([])
  const [boatLifts, setBoatLifts] =
    useState([])
  const [estimates, setEstimates] =
    useState([])
  const [invoices, setInvoices] =
    useState([])
  const [serviceReports, setServiceReports] =
    useState([])
  const [properties, setProperties] =
    useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] =
    useState(false)
  const [notice, setNotice] = useState('')
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
        customersResult,
        jobsResult,
        liftsResult,
        estimatesResult,
        invoicesResult,
        reportsResult,
        propertiesResult,
      ] = await Promise.all([
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
            .from('jobs')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),

        safeQuery(
          supabase
            .from('boat_lifts')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),

        safeQuery(
          supabase
            .from('estimates')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),

        safeQuery(
          supabase
            .from('invoices')
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
            .from('properties')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),
      ])

      const matchedCustomer =
        customersResult.data.find(
          (item) =>
            item.user_id === user?.id ||
            item.auth_user_id === user?.id ||
            normalize(item.email) ===
              normalize(user?.email)
        ) || null

      setCustomer(matchedCustomer)

      const customerId =
        matchedCustomer?.id || null

      const ownsRecord = (item) => {
        if (!customerId && !user?.id) {
          return false
        }

        return (
          item.customer_id === customerId ||
          item.user_id === user?.id ||
          normalize(item.customer_email) ===
            normalize(user?.email) ||
          normalize(item.email) ===
            normalize(user?.email)
        )
      }

      setJobs(
        jobsResult.data.filter(ownsRecord)
      )

      setBoatLifts(
        liftsResult.data.filter(ownsRecord)
      )

      setEstimates(
        estimatesResult.data.filter(
          ownsRecord
        )
      )

      setInvoices(
        invoicesResult.data.filter(
          ownsRecord
        )
      )

      const customerJobs =
        jobsResult.data.filter(ownsRecord)

      setServiceReports(
        reportsResult.data.filter(
          (report) =>
            ownsRecord(report) ||
            customerJobs.some(
              (job) =>
                job.id === report.job_id
            )
        )
      )

      setProperties(
        propertiesResult.data.filter(
          ownsRecord
        )
      )

      const errors = [
        customersResult.error,
        jobsResult.error,
        liftsResult.error,
        estimatesResult.error,
        invoicesResult.error,
        reportsResult.error,
        propertiesResult.error,
      ].filter(Boolean)

      if (!matchedCustomer) {
        setNotice(
          'No customer record is linked to this login yet.'
        )
      } else if (errors.length) {
        console.warn(
          'Customer dashboard loaded with limited data:',
          errors
        )

        setNotice(
          'Some customer information could not be loaded. Available information is still shown.'
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

  const upcomingJobs = useMemo(
    () =>
      jobs
        .filter((job) => {
          const status = normalize(
            job.status
          )

          const date =
            job.scheduled_start ||
            job.start_date ||
            job.scheduled_date ||
            job.due_date

          return (
            ![
              'completed',
              'closed',
              'cancelled',
              'canceled',
            ].includes(status) &&
            isUpcoming(date)
          )
        })
        .sort(
          (a, b) =>
            new Date(
              a.scheduled_start ||
                a.start_date ||
                a.scheduled_date ||
                a.due_date ||
                0
            ) -
            new Date(
              b.scheduled_start ||
                b.start_date ||
                b.scheduled_date ||
                b.due_date ||
                0
            )
        ),
    [jobs]
  )

  const completedJobs = useMemo(
    () =>
      jobs.filter((job) =>
        [
          'completed',
          'closed',
          'done',
        ].includes(normalize(job.status))
      ),
    [jobs]
  )

  const pendingEstimates = useMemo(
    () =>
      estimates.filter((estimate) =>
        ![
          'approved',
          'accepted',
          'declined',
          'rejected',
          'expired',
          'converted',
        ].includes(
          normalize(estimate.status)
        )
      ),
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
            normalize(invoice.status)
          )
      ),
    [invoices]
  )

  const outstandingBalance = useMemo(
    () =>
      unpaidInvoices.reduce(
        (total, invoice) =>
          total + invoiceBalance(invoice),
        0
      ),
    [unpaidInvoices]
  )

  const latestReports = useMemo(
    () =>
      [...serviceReports]
        .sort(
          (a, b) =>
            new Date(
              b.completed_at ||
                b.updated_at ||
                b.created_at ||
                0
            ) -
            new Date(
              a.completed_at ||
                a.updated_at ||
                a.created_at ||
                0
            )
        )
        .slice(0, 6),
    [serviceReports]
  )

  const recentActivity = useMemo(() => {
    const activity = [
      ...jobs.map((job) => ({
        id: `job-${job.id}`,
        type: 'Job',
        title: jobDisplayName(job),
        detail:
          job.status || 'Scheduled',
        date:
          job.updated_at ||
          job.created_at,
        view: 'jobs',
      })),

      ...estimates.map((estimate) => ({
        id: `estimate-${estimate.id}`,
        type: 'Estimate',
        title:
          estimateDisplayName(estimate),
        detail:
          `${estimate.status || 'Draft'} · ${formatCurrency(
            estimate.total ||
              estimate.total_amount ||
              estimate.amount ||
              0
          )}`,
        date:
          estimate.updated_at ||
          estimate.created_at,
        view: 'estimates',
      })),

      ...invoices.map((invoice) => ({
        id: `invoice-${invoice.id}`,
        type: 'Invoice',
        title:
          invoiceDisplayName(invoice),
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
          reportDisplayName(report),
        detail:
          report.status || 'Available',
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
  ])

  function navigate(view) {
    if (typeof onNavigate === 'function') {
      onNavigate(view)
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Customer Dashboard</h2>
        <p>Loading your account...</p>
      </section>
    )
  }

  return (
    <>
      <div className="toolbar">
        <div>
          <h1 style={{ margin: 0 }}>
            Customer Dashboard
          </h1>

          <div
            className="small"
            style={{ marginTop: 6 }}
          >
            Welcome,{' '}
            {customerDisplayName(customer)}
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
            className="primary"
            onClick={() =>
              navigate('serviceReports')
            }
          >
            Request Service
          </button>
        </div>
      </div>

      {notice && (
        <section className="panel">
          <strong>Account notice</strong>
          <p>{notice}</p>
        </section>
      )}

      <div className="metrics">
        <Metric
          label="Upcoming Appointments"
          value={upcomingJobs.length}
          onClick={() =>
            navigate('scheduling')
          }
        />

        <Metric
          label="Boat Lifts"
          value={boatLifts.length}
          onClick={() =>
            navigate('boatLifts')
          }
        />

        <Metric
          label="Pending Estimates"
          value={pendingEstimates.length}
          onClick={() =>
            navigate('estimates')
          }
        />

        <Metric
          label="Outstanding Balance"
          value={formatCurrency(
            outstandingBalance
          )}
          onClick={() =>
            navigate('invoices')
          }
        />
      </div>

      <section className="panel">
        <div className="between">
          <div>
            <h2>Quick Actions</h2>
            <p className="small">
              Manage your account and service history.
            </p>
          </div>
        </div>

        <div className="actions">
          <button
            className="primary"
            onClick={() =>
              navigate('serviceReports')
            }
          >
            Request Service
          </button>

          <button
            className="secondary"
            onClick={() =>
              navigate('estimates')
            }
          >
            View Estimates
          </button>

          <button
            className="secondary"
            onClick={() =>
              navigate('invoices')
            }
          >
            View Invoices
          </button>

          <button
            className="secondary"
            onClick={() =>
              navigate('boatLifts')
            }
          >
            My Boat Lifts
          </button>

          <button
            className="secondary"
            onClick={() =>
              navigate('serviceReports')
            }
          >
            Service History
          </button>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="between">
            <div>
              <h2>Next Appointment</h2>
              <p className="small">
                Your next scheduled service visit.
              </p>
            </div>
          </div>

          {upcomingJobs[0] ? (
            <article className="card">
              <div className="between">
                <div>
                  <strong>
                    {jobDisplayName(
                      upcomingJobs[0]
                    )}
                  </strong>

                  <div className="small">
                    {upcomingJobs[0]
                      .service_type ||
                      upcomingJobs[0]
                        .job_type ||
                      'Boat lift service'}
                  </div>
                </div>

                <StatusBadge
                  value={
                    upcomingJobs[0].status ||
                    'Scheduled'
                  }
                />
              </div>

              <p>
                <b>Date:</b>{' '}
                {formatDateTime(
                  upcomingJobs[0]
                    .scheduled_start ||
                    upcomingJobs[0]
                      .start_date ||
                    upcomingJobs[0]
                      .scheduled_date ||
                    upcomingJobs[0]
                      .due_date
                )}
              </p>

              <p>
                <b>Location:</b>{' '}
                {upcomingJobs[0]
                  .service_address ||
                  upcomingJobs[0].address ||
                  upcomingJobs[0].location ||
                  'Address not entered'}
              </p>

              <p>
                <b>Work:</b>{' '}
                {upcomingJobs[0]
                  .description ||
                  upcomingJobs[0]
                    .scope_of_work ||
                  upcomingJobs[0].notes ||
                  'Service details will appear here.'}
              </p>
            </article>
          ) : (
            <EmptyState>
              No upcoming appointments are scheduled.
            </EmptyState>
          )}
        </section>

        <section className="panel">
          <div className="between">
            <div>
              <h2>Account Summary</h2>
              <p className="small">
                Your customer and property information.
              </p>
            </div>
          </div>

          <article className="card">
            <p>
              <b>Name:</b>{' '}
              {customerDisplayName(customer)}
            </p>

            <p>
              <b>Email:</b>{' '}
              {customer?.email ||
                currentUser?.email ||
                'Not entered'}
            </p>

            <p>
              <b>Phone:</b>{' '}
              {customer?.phone ||
                customer?.phone_number ||
                'Not entered'}
            </p>

            <p>
              <b>Properties:</b>{' '}
              {properties.length}
            </p>

            <p>
              <b>Completed Jobs:</b>{' '}
              {completedJobs.length}
            </p>
          </article>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="between">
            <div>
              <h2>My Boat Lifts</h2>
              <p className="small">
                Equipment linked to your account.
              </p>
            </div>

            <button
              className="secondary"
              onClick={() =>
                navigate('boatLifts')
              }
            >
              View All
            </button>
          </div>

          <div className="cards">
            {boatLifts
              .slice(0, 6)
              .map((lift) => (
                <article
                  className="card"
                  key={lift.id}
                >
                  <div className="between">
                    <div>
                      <strong>
                        {boatLiftDisplayName(
                          lift
                        )}
                      </strong>

                      <div className="small">
                        {lift.capacity
                          ? `${lift.capacity} lb capacity`
                          : 'Capacity not entered'}
                      </div>
                    </div>

                    <StatusBadge
                      value={
                        lift.status ||
                        'Active'
                      }
                    />
                  </div>

                  <p>
                    <b>Manufacturer:</b>{' '}
                    {lift.manufacturer ||
                      'Not entered'}
                  </p>

                  <p>
                    <b>Model:</b>{' '}
                    {lift.model ||
                      'Not entered'}
                  </p>

                  <p>
                    <b>Installed:</b>{' '}
                    {formatDate(
                      lift.installation_date ||
                        lift.installed_at
                    )}
                  </p>

                  <p>
                    <b>Warranty:</b>{' '}
                    {lift.warranty_status ||
                      lift.warranty ||
                      'Not entered'}
                  </p>
                </article>
              ))}

            {!boatLifts.length && (
              <EmptyState>
                No boat lifts are linked to this account.
              </EmptyState>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="between">
            <div>
              <h2>Open Estimates</h2>
              <p className="small">
                Estimates waiting for a decision.
              </p>
            </div>

            <button
              className="secondary"
              onClick={() =>
                navigate('estimates')
              }
            >
              View All
            </button>
          </div>

          <div className="cards">
            {pendingEstimates
              .slice(0, 6)
              .map((estimate) => (
                <article
                  className="card"
                  key={estimate.id}
                >
                  <div className="between">
                    <strong>
                      {estimateDisplayName(
                        estimate
                      )}
                    </strong>

                    <StatusBadge
                      value={
                        estimate.status ||
                        'Pending'
                      }
                    />
                  </div>

                  <p>
                    <b>Total:</b>{' '}
                    {formatCurrency(
                      estimate.total ||
                        estimate.total_amount ||
                        estimate.amount ||
                        0
                    )}
                  </p>

                  <p>
                    <b>Created:</b>{' '}
                    {formatDate(
                      estimate.created_at
                    )}
                  </p>
                </article>
              ))}

            {!pendingEstimates.length && (
              <EmptyState>
                No estimates are waiting for approval.
              </EmptyState>
            )}
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="between">
            <div>
              <h2>Open Invoices</h2>
              <p className="small">
                Current balances on your account.
              </p>
            </div>

            <button
              className="secondary"
              onClick={() =>
                navigate('invoices')
              }
            >
              View All
            </button>
          </div>

          <div className="cards">
            {unpaidInvoices
              .slice(0, 6)
              .map((invoice) => (
                <article
                  className="card"
                  key={invoice.id}
                >
                  <div className="between">
                    <strong>
                      {invoiceDisplayName(
                        invoice
                      )}
                    </strong>

                    <StatusBadge
                      value={
                        invoice.status ||
                        'Unpaid'
                      }
                    />
                  </div>

                  <p>
                    <b>Total:</b>{' '}
                    {formatCurrency(
                      invoiceTotal(invoice)
                    )}
                  </p>

                  <p>
                    <b>Balance:</b>{' '}
                    {formatCurrency(
                      invoiceBalance(invoice)
                    )}
                  </p>

                  <p>
                    <b>Due:</b>{' '}
                    {formatDate(
                      invoice.due_date
                    )}
                  </p>
                </article>
              ))}

            {!unpaidInvoices.length && (
              <EmptyState>
                No unpaid invoices are on your account.
              </EmptyState>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="between">
            <div>
              <h2>Service Reports</h2>
              <p className="small">
                Reports from completed service visits.
              </p>
            </div>

            <button
              className="secondary"
              onClick={() =>
                navigate('serviceReports')
              }
            >
              View All
            </button>
          </div>

          <div className="cards">
            {latestReports.map((report) => (
              <article
                className="card"
                key={report.id}
              >
                <div className="between">
                  <strong>
                    {reportDisplayName(
                      report
                    )}
                  </strong>

                  <StatusBadge
                    value={
                      report.status ||
                      'Available'
                    }
                  />
                </div>

                <p>
                  <b>Date:</b>{' '}
                  {formatDate(
                    report.completed_at ||
                      report.updated_at ||
                      report.created_at
                  )}
                </p>

                <p>
                  {report.summary ||
                    report.notes ||
                    'Service report available for review.'}
                </p>
              </article>
            ))}

            {!latestReports.length && (
              <EmptyState>
                No service reports are available yet.
              </EmptyState>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="between">
          <div>
            <h2>Recent Activity</h2>
            <p className="small">
              Latest updates to your account.
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
            <EmptyState>
              No recent account activity is available.
            </EmptyState>
          )}
        </div>
      </section>
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
