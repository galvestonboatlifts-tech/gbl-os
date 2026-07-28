import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase as sharedSupabase } from '../../../lib/supabase'

const DAY_MS = 24 * 60 * 60 * 1000

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(
    numberValue(value)
  )
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numberValue(value))
}

function formatDate(value) {
  if (!value) {
    return '—'
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
    return '—'
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

function startOfDay(date = new Date()) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  )
}

function startOfWeek(date = new Date()) {
  const result = startOfDay(date)
  result.setDate(result.getDate() - result.getDay())
  return result
}

function startOfMonth(date = new Date()) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  )
}

function startOfQuarter(date = new Date()) {
  const quarterStartMonth =
    Math.floor(date.getMonth() / 3) * 3

  return new Date(
    date.getFullYear(),
    quarterStartMonth,
    1
  )
}

function startOfYear(date = new Date()) {
  return new Date(date.getFullYear(), 0, 1)
}

function inRange(value, start, end) {
  if (!value) {
    return false
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return false
  }

  if (start && date < start) {
    return false
  }

  if (end) {
    const inclusiveEnd = new Date(end)
    inclusiveEnd.setHours(23, 59, 59, 999)

    if (date > inclusiveEnd) {
      return false
    }
  }

  return true
}

function getCustomerName(customer) {
  if (!customer) {
    return 'Unknown customer'
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
    'Unknown customer'
  )
}

function getEmployeeName(employee) {
  if (!employee) {
    return 'Unassigned'
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
    'Unassigned'
  )
}

function getJobEmployeeId(job) {
  return (
    job.employee_id ||
    job.technician_id ||
    job.assigned_employee_id ||
    job.assigned_to ||
    null
  )
}

function getJobDate(job) {
  return (
    job.completed_at ||
    job.scheduled_start ||
    job.start_date ||
    job.scheduled_date ||
    job.created_at
  )
}

function getJobStartDate(job) {
  return (
    job.started_at ||
    job.start_date ||
    job.scheduled_start ||
    job.scheduled_date ||
    job.created_at
  )
}

function getJobEndDate(job) {
  return (
    job.completed_at ||
    job.closed_at ||
    job.updated_at
  )
}

function getJobRevenue(job, invoicesByJobId) {
  const invoices = invoicesByJobId[job.id] || []

  return invoices.reduce((total, invoice) => {
    return (
      total +
      numberValue(
        invoice.total ||
          invoice.total_amount ||
          invoice.amount ||
          invoice.grand_total
      )
    )
  }, 0)
}

function getJobDurationDays(job) {
  const start = new Date(getJobStartDate(job))
  const end = new Date(getJobEndDate(job))

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return null
  }

  return Math.max(
    0,
    (end.getTime() - start.getTime()) /
      DAY_MS
  )
}

function getJobDurationHours(job) {
  const start = new Date(
    job.started_at ||
      job.actual_start ||
      job.start_time ||
      0
  )

  const end = new Date(
    job.completed_at ||
      job.actual_end ||
      job.end_time ||
      0
  )

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return null
  }

  return Math.max(
    0,
    (end.getTime() - start.getTime()) /
      (60 * 60 * 1000)
  )
}

function isCompletedJob(job) {
  return [
    'completed',
    'closed',
    'done',
    'finished',
  ].includes(normalize(job.status))
}

function isCancelledJob(job) {
  return [
    'cancelled',
    'canceled',
    'void',
  ].includes(normalize(job.status))
}

function isOpenJob(job) {
  return !isCompletedJob(job) && !isCancelledJob(job)
}

function isEmergencyJob(job) {
  return (
    normalize(job.priority) === 'emergency' ||
    normalize(job.job_type) === 'emergency' ||
    normalize(job.type) === 'emergency' ||
    job.is_emergency === true
  )
}

function isWarrantyJob(job) {
  return (
    normalize(job.job_type) === 'warranty' ||
    normalize(job.type) === 'warranty' ||
    normalize(job.category) === 'warranty' ||
    job.is_warranty === true
  )
}

function isOverdueJob(job) {
  if (!isOpenJob(job)) {
    return false
  }

  const dueValue =
    job.due_date ||
    job.scheduled_end ||
    job.scheduled_date ||
    job.scheduled_start

  if (!dueValue) {
    return false
  }

  const dueDate = new Date(dueValue)

  return (
    !Number.isNaN(dueDate.getTime()) &&
    dueDate < new Date()
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

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row.map((value) => csvCell(value)).join(',')
    )
    .join('\n')

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function JobsReport({
  supabase: suppliedSupabase,
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
  const [invoices, setInvoices] =
    useState([])

  const [datePreset, setDatePreset] =
    useState('year')
  const [customStart, setCustomStart] =
    useState('')
  const [customEnd, setCustomEnd] =
    useState('')
  const [statusFilter, setStatusFilter] =
    useState('all')
  const [priorityFilter, setPriorityFilter] =
    useState('all')
  const [technicianFilter, setTechnicianFilter] =
    useState('all')
  const [jobTypeFilter, setJobTypeFilter] =
    useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] =
    useState('scheduled')
  const [sortDirection, setSortDirection] =
    useState('asc')

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] =
    useState(false)
  const [notice, setNotice] = useState('')
  const [lastUpdated, setLastUpdated] =
    useState(null)

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setNotice('')

      const [
        jobsResult,
        customersResult,
        employeesResult,
        reportsResult,
        invoicesResult,
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
            .from('invoices')
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
      setInvoices(invoicesResult.data)

      const errors = [
        jobsResult.error,
        customersResult.error,
        employeesResult.error,
        reportsResult.error,
        invoicesResult.error,
      ].filter(Boolean)

      if (errors.length) {
        console.warn(
          'Job reports loaded with limited data:',
          errors
        )

        setNotice(
          'Some job data could not be loaded. Available information is still shown.'
        )
      }

      setLastUpdated(new Date())
      setLoading(false)
      setRefreshing(false)
    },
    [supabase]
  )

  useEffect(() => {
    loadData()
  }, [loadData])

  const dateRange = useMemo(() => {
    const now = new Date()

    if (datePreset === 'today') {
      return {
        start: startOfDay(now),
        end: now,
      }
    }

    if (datePreset === 'week') {
      return {
        start: startOfWeek(now),
        end: now,
      }
    }

    if (datePreset === 'month') {
      return {
        start: startOfMonth(now),
        end: now,
      }
    }

    if (datePreset === 'quarter') {
      return {
        start: startOfQuarter(now),
        end: now,
      }
    }

    if (datePreset === 'year') {
      return {
        start: startOfYear(now),
        end: now,
      }
    }

    return {
      start: customStart
        ? new Date(`${customStart}T00:00:00`)
        : null,
      end: customEnd
        ? new Date(`${customEnd}T23:59:59`)
        : null,
    }
  }, [datePreset, customStart, customEnd])

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

  const employeeById = useMemo(
    () =>
      Object.fromEntries(
        employees.map((employee) => [
          employee.id,
          employee,
        ])
      ),
    [employees]
  )

  const invoicesByJobId = useMemo(() => {
    const grouped = {}

    invoices.forEach((invoice) => {
      if (!invoice.job_id) {
        return
      }

      if (!grouped[invoice.job_id]) {
        grouped[invoice.job_id] = []
      }

      grouped[invoice.job_id].push(invoice)
    })

    return grouped
  }, [invoices])

  const reportsByJobId = useMemo(() => {
    const grouped = {}

    serviceReports.forEach((report) => {
      if (!report.job_id) {
        return
      }

      if (!grouped[report.job_id]) {
        grouped[report.job_id] = []
      }

      grouped[report.job_id].push(report)
    })

    return grouped
  }, [serviceReports])

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) =>
        inRange(
          getJobDate(job),
          dateRange.start,
          dateRange.end
        )
      ),
    [jobs, dateRange]
  )

  const openJobs = useMemo(
    () => filteredJobs.filter(isOpenJob),
    [filteredJobs]
  )

  const completedJobs = useMemo(
    () => filteredJobs.filter(isCompletedJob),
    [filteredJobs]
  )

  const cancelledJobs = useMemo(
    () => filteredJobs.filter(isCancelledJob),
    [filteredJobs]
  )

  const overdueJobs = useMemo(
    () => filteredJobs.filter(isOverdueJob),
    [filteredJobs]
  )

  const emergencyJobs = useMemo(
    () => filteredJobs.filter(isEmergencyJob),
    [filteredJobs]
  )

  const warrantyJobs = useMemo(
    () => filteredJobs.filter(isWarrantyJob),
    [filteredJobs]
  )

  const averageCompletionDays = useMemo(() => {
    const durations = completedJobs
      .map(getJobDurationDays)
      .filter((value) => value !== null)

    if (!durations.length) {
      return 0
    }

    return (
      durations.reduce(
        (sum, value) => sum + value,
        0
      ) / durations.length
    )
  }, [completedJobs])

  const averageActiveHours = useMemo(() => {
    const durations = completedJobs
      .map(getJobDurationHours)
      .filter((value) => value !== null)

    if (!durations.length) {
      return 0
    }

    return (
      durations.reduce(
        (sum, value) => sum + value,
        0
      ) / durations.length
    )
  }, [completedJobs])

  const completionRate =
    filteredJobs.length > 0
      ? (completedJobs.length /
          filteredJobs.length) *
        100
      : 0

  const totalJobRevenue = useMemo(
    () =>
      filteredJobs.reduce(
        (total, job) =>
          total +
          getJobRevenue(job, invoicesByJobId),
        0
      ),
    [filteredJobs, invoicesByJobId]
  )

  const averageJobRevenue =
    filteredJobs.length > 0
      ? totalJobRevenue / filteredJobs.length
      : 0

  const jobsByStatus = useMemo(() => {
    const totals = {}

    filteredJobs.forEach((job) => {
      const label =
        job.status || 'Unspecified'

      totals[label] =
        (totals[label] || 0) + 1
    })

    return Object.entries(totals)
      .map(([label, value]) => ({
        label,
        value,
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredJobs])

  const jobsByType = useMemo(() => {
    const totals = {}

    filteredJobs.forEach((job) => {
      const label =
        job.job_type ||
        job.type ||
        job.category ||
        'Unspecified'

      totals[label] =
        (totals[label] || 0) + 1
    })

    return Object.entries(totals)
      .map(([label, value]) => ({
        label,
        value,
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredJobs])

  const jobsByPriority = useMemo(() => {
    const totals = {}

    filteredJobs.forEach((job) => {
      const label =
        job.priority || 'Normal'

      totals[label] =
        (totals[label] || 0) + 1
    })

    return Object.entries(totals)
      .map(([label, value]) => ({
        label,
        value,
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredJobs])

  const jobsByTechnician = useMemo(() => {
    const totals = {}

    filteredJobs.forEach((job) => {
      const employeeId =
        getJobEmployeeId(job) || 'unassigned'

      if (!totals[employeeId]) {
        totals[employeeId] = {
          id: employeeId,
          name:
            employeeId === 'unassigned'
              ? 'Unassigned'
              : getEmployeeName(
                  employeeById[employeeId]
                ),
          assigned: 0,
          completed: 0,
          open: 0,
          overdue: 0,
          emergency: 0,
          revenue: 0,
        }
      }

      totals[employeeId].assigned += 1

      if (isCompletedJob(job)) {
        totals[employeeId].completed += 1
      }

      if (isOpenJob(job)) {
        totals[employeeId].open += 1
      }

      if (isOverdueJob(job)) {
        totals[employeeId].overdue += 1
      }

      if (isEmergencyJob(job)) {
        totals[employeeId].emergency += 1
      }

      totals[employeeId].revenue +=
        getJobRevenue(job, invoicesByJobId)
    })

    return Object.values(totals).sort(
      (a, b) =>
        b.completed - a.completed ||
        b.assigned - a.assigned
    )
  }, [
    filteredJobs,
    employeeById,
    invoicesByJobId,
  ])

  const jobTypes = useMemo(
    () =>
      Array.from(
        new Set(
          jobs
            .map(
              (job) =>
                job.job_type ||
                job.type ||
                job.category
            )
            .filter(Boolean)
        )
      ).sort(),
    [jobs]
  )

  const visibleJobs = useMemo(() => {
    const searchValue = normalize(search)

    let rows = filteredJobs.filter((job) => {
      if (
        statusFilter === 'open' &&
        !isOpenJob(job)
      ) {
        return false
      }

      if (
        statusFilter === 'completed' &&
        !isCompletedJob(job)
      ) {
        return false
      }

      if (
        statusFilter === 'overdue' &&
        !isOverdueJob(job)
      ) {
        return false
      }

      if (
        statusFilter === 'cancelled' &&
        !isCancelledJob(job)
      ) {
        return false
      }

      if (
        priorityFilter !== 'all' &&
        normalize(job.priority) !==
          normalize(priorityFilter)
      ) {
        return false
      }

      if (
        technicianFilter !== 'all' &&
        String(getJobEmployeeId(job) || '') !==
          technicianFilter
      ) {
        return false
      }

      if (
        jobTypeFilter !== 'all' &&
        normalize(
          job.job_type ||
            job.type ||
            job.category
        ) !== normalize(jobTypeFilter)
      ) {
        return false
      }

      if (searchValue) {
        const customer = getCustomerName(
          customerById[job.customer_id]
        )

        const technician = getEmployeeName(
          employeeById[getJobEmployeeId(job)]
        )

        const searchable = [
          job.job_number,
          job.number,
          job.title,
          job.description,
          job.status,
          job.priority,
          job.job_type,
          job.type,
          job.category,
          customer,
          technician,
          job.address,
          job.city,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if (!searchable.includes(searchValue)) {
          return false
        }
      }

      return true
    })

    rows = [...rows].sort((a, b) => {
      let left
      let right

      if (sortBy === 'customer') {
        left = getCustomerName(
          customerById[a.customer_id]
        )
        right = getCustomerName(
          customerById[b.customer_id]
        )
      } else if (sortBy === 'technician') {
        left = getEmployeeName(
          employeeById[getJobEmployeeId(a)]
        )
        right = getEmployeeName(
          employeeById[getJobEmployeeId(b)]
        )
      } else if (sortBy === 'status') {
        left = a.status || ''
        right = b.status || ''
      } else if (sortBy === 'priority') {
        left = a.priority || ''
        right = b.priority || ''
      } else if (sortBy === 'revenue') {
        left = getJobRevenue(
          a,
          invoicesByJobId
        )
        right = getJobRevenue(
          b,
          invoicesByJobId
        )
      } else {
        left = new Date(
          a.scheduled_start ||
            a.scheduled_date ||
            a.start_date ||
            a.created_at ||
            0
        ).getTime()

        right = new Date(
          b.scheduled_start ||
            b.scheduled_date ||
            b.start_date ||
            b.created_at ||
            0
        ).getTime()
      }

      if (
        typeof left === 'number' &&
        typeof right === 'number'
      ) {
        return sortDirection === 'asc'
          ? left - right
          : right - left
      }

      const comparison = String(left).localeCompare(
        String(right)
      )

      return sortDirection === 'asc'
        ? comparison
        : -comparison
    })

    return rows
  }, [
    filteredJobs,
    search,
    statusFilter,
    priorityFilter,
    technicianFilter,
    jobTypeFilter,
    sortBy,
    sortDirection,
    customerById,
    employeeById,
    invoicesByJobId,
  ])

  function exportJobReport() {
    const stamp = new Date()
      .toISOString()
      .slice(0, 10)

    downloadCsv(
      `gbl-job-report-${stamp}.csv`,
      [
        ['GBL OS Job Report'],
        [
          'Generated',
          new Date().toLocaleString('en-US'),
        ],
        [],
        ['Metric', 'Value'],
        ['Total Jobs', filteredJobs.length],
        ['Open Jobs', openJobs.length],
        ['Completed Jobs', completedJobs.length],
        ['Overdue Jobs', overdueJobs.length],
        ['Emergency Jobs', emergencyJobs.length],
        ['Warranty Jobs', warrantyJobs.length],
        ['Cancelled Jobs', cancelledJobs.length],
        [
          'Completion Rate',
          completionRate.toFixed(1),
        ],
        [
          'Average Completion Days',
          averageCompletionDays.toFixed(1),
        ],
        [
          'Average Active Hours',
          averageActiveHours.toFixed(1),
        ],
        ['Total Job Revenue', totalJobRevenue],
        ['Average Job Revenue', averageJobRevenue],
        [],
        ['Status', 'Jobs'],
        ...jobsByStatus.map((item) => [
          item.label,
          item.value,
        ]),
        [],
        ['Job Type', 'Jobs'],
        ...jobsByType.map((item) => [
          item.label,
          item.value,
        ]),
        [],
        ['Priority', 'Jobs'],
        ...jobsByPriority.map((item) => [
          item.label,
          item.value,
        ]),
        [],
        [
          'Technician',
          'Assigned',
          'Completed',
          'Open',
          'Overdue',
          'Emergency',
          'Revenue',
        ],
        ...jobsByTechnician.map(
          (technician) => [
            technician.name,
            technician.assigned,
            technician.completed,
            technician.open,
            technician.overdue,
            technician.emergency,
            technician.revenue,
          ]
        ),
        [],
        [
          'Job',
          'Customer',
          'Technician',
          'Type',
          'Priority',
          'Status',
          'Scheduled',
          'Completed',
          'Revenue',
          'Service Reports',
        ],
        ...visibleJobs.map((job) => [
          job.job_number ||
            job.number ||
            job.title ||
            job.id,
          getCustomerName(
            customerById[job.customer_id]
          ),
          getEmployeeName(
            employeeById[getJobEmployeeId(job)]
          ),
          job.job_type ||
            job.type ||
            job.category ||
            '',
          job.priority || '',
          job.status || '',
          job.scheduled_start ||
            job.scheduled_date ||
            job.start_date ||
            '',
          job.completed_at || '',
          getJobRevenue(
            job,
            invoicesByJobId
          ),
          (reportsByJobId[job.id] || []).length,
        ]),
      ]
    )
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Job Reports</h2>
        <p>Loading job data...</p>
      </section>
    )
  }

  return (
    <div className="jobs-report">
      <div className="toolbar">
        <div>
          <h1 style={{ margin: 0 }}>
            Job Reports
          </h1>

          <div
            className="small"
            style={{ marginTop: 6 }}
          >
            Job volume, completion, productivity,
            exceptions, and revenue
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
            type="button"
            className="secondary"
            disabled={refreshing}
            onClick={() => loadData(true)}
          >
            {refreshing
              ? 'Refreshing...'
              : 'Refresh'}
          </button>

          <button
            type="button"
            className="secondary"
            onClick={() => window.print()}
          >
            Print / Save PDF
          </button>

          <button
            type="button"
            className="primary"
            onClick={exportJobReport}
          >
            Export CSV
          </button>
        </div>
      </div>

      {notice && (
        <section className="panel">
          <strong>Report notice</strong>
          <p>{notice}</p>
        </section>
      )}

      <section className="panel">
        <div
          className="actions"
          style={{
            alignItems: 'end',
            flexWrap: 'wrap',
          }}
        >
          <label>
            <span className="small">
              Date range
            </span>

            <select
              value={datePreset}
              onChange={(event) =>
                setDatePreset(event.target.value)
              }
            >
              <option value="today">
                Today
              </option>
              <option value="week">
                This week
              </option>
              <option value="month">
                This month
              </option>
              <option value="quarter">
                This quarter
              </option>
              <option value="year">
                This year
              </option>
              <option value="custom">
                Custom
              </option>
            </select>
          </label>

          {datePreset === 'custom' && (
            <>
              <label>
                <span className="small">
                  Start
                </span>

                <input
                  type="date"
                  value={customStart}
                  onChange={(event) =>
                    setCustomStart(
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                <span className="small">
                  End
                </span>

                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) =>
                    setCustomEnd(
                      event.target.value
                    )
                  }
                />
              </label>
            </>
          )}
        </div>
      </section>

      <div className="metrics">
        <Metric
          label="Total Jobs"
          value={formatNumber(
            filteredJobs.length
          )}
        />
        <Metric
          label="Open Jobs"
          value={formatNumber(openJobs.length)}
        />
        <Metric
          label="Completed Jobs"
          value={formatNumber(
            completedJobs.length
          )}
        />
        <Metric
          label="Overdue Jobs"
          value={formatNumber(
            overdueJobs.length
          )}
        />
      </div>

      <div className="metrics">
        <Metric
          label="Completion Rate"
          value={`${completionRate.toFixed(1)}%`}
        />
        <Metric
          label="Average Completion"
          value={`${averageCompletionDays.toFixed(
            1
          )} days`}
        />
        <Metric
          label="Average Active Time"
          value={`${averageActiveHours.toFixed(
            1
          )} hrs`}
        />
        <Metric
          label="Job Revenue"
          value={formatCurrency(
            totalJobRevenue
          )}
        />
      </div>

      <div className="metrics">
        <Metric
          label="Emergency Jobs"
          value={formatNumber(
            emergencyJobs.length
          )}
        />
        <Metric
          label="Warranty Jobs"
          value={formatNumber(
            warrantyJobs.length
          )}
        />
        <Metric
          label="Cancelled Jobs"
          value={formatNumber(
            cancelledJobs.length
          )}
        />
        <Metric
          label="Average Job Revenue"
          value={formatCurrency(
            averageJobRevenue
          )}
        />
      </div>

      <div className="grid-2">
        <BarPanel
          title="Jobs by Status"
          items={jobsByStatus}
          formatter={formatNumber}
        />

        <BarPanel
          title="Jobs by Type"
          items={jobsByType}
          formatter={formatNumber}
        />
      </div>

      <div className="grid-2">
        <BarPanel
          title="Jobs by Priority"
          items={jobsByPriority}
          formatter={formatNumber}
        />

        <BarPanel
          title="Jobs by Technician"
          items={jobsByTechnician.map(
            (technician) => ({
              label: technician.name,
              value: technician.assigned,
            })
          )}
          formatter={formatNumber}
        />
      </div>

      <section className="panel">
        <h2>Technician Job Performance</h2>

        <DataTable
          headers={[
            'Technician',
            'Assigned',
            'Completed',
            'Open',
            'Overdue',
            'Emergency',
            'Revenue',
          ]}
          rows={jobsByTechnician.map(
            (technician) => [
              technician.name,
              formatNumber(
                technician.assigned
              ),
              formatNumber(
                technician.completed
              ),
              formatNumber(technician.open),
              formatNumber(
                technician.overdue
              ),
              formatNumber(
                technician.emergency
              ),
              formatCurrency(
                technician.revenue
              ),
            ]
          )}
          emptyMessage="No technician activity is available for this period."
        />
      </section>

      <section className="panel">
        <div className="between">
          <div>
            <h2 style={{ marginBottom: 4 }}>
              Job Detail
            </h2>
            <div className="small">
              Search, filter, sort, and export job
              activity
            </div>
          </div>

          <div
            className="actions"
            style={{
              alignItems: 'end',
              flexWrap: 'wrap',
            }}
          >
            <label>
              <span className="small">
                Status
              </span>

              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  All
                </option>
                <option value="open">
                  Open
                </option>
                <option value="completed">
                  Completed
                </option>
                <option value="overdue">
                  Overdue
                </option>
                <option value="cancelled">
                  Cancelled
                </option>
              </select>
            </label>

            <label>
              <span className="small">
                Priority
              </span>

              <select
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  All
                </option>
                <option value="low">
                  Low
                </option>
                <option value="normal">
                  Normal
                </option>
                <option value="high">
                  High
                </option>
                <option value="emergency">
                  Emergency
                </option>
              </select>
            </label>

            <label>
              <span className="small">
                Technician
              </span>

              <select
                value={technicianFilter}
                onChange={(event) =>
                  setTechnicianFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  All
                </option>

                {employees.map((employee) => (
                  <option
                    key={employee.id}
                    value={employee.id}
                  >
                    {getEmployeeName(employee)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="small">
                Job Type
              </span>

              <select
                value={jobTypeFilter}
                onChange={(event) =>
                  setJobTypeFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  All
                </option>

                {jobTypes.map((jobType) => (
                  <option
                    key={jobType}
                    value={jobType}
                  >
                    {jobType}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="small">
                Sort by
              </span>

              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value)
                }
              >
                <option value="scheduled">
                  Scheduled Date
                </option>
                <option value="customer">
                  Customer
                </option>
                <option value="technician">
                  Technician
                </option>
                <option value="status">
                  Status
                </option>
                <option value="priority">
                  Priority
                </option>
                <option value="revenue">
                  Revenue
                </option>
              </select>
            </label>

            <label>
              <span className="small">
                Direction
              </span>

              <select
                value={sortDirection}
                onChange={(event) =>
                  setSortDirection(
                    event.target.value
                  )
                }
              >
                <option value="asc">
                  Ascending
                </option>
                <option value="desc">
                  Descending
                </option>
              </select>
            </label>

            <label style={{ minWidth: 240 }}>
              <span className="small">
                Search
              </span>

              <input
                type="search"
                value={search}
                placeholder="Job, customer, technician..."
                onChange={(event) =>
                  setSearch(event.target.value)
                }
              />
            </label>
          </div>
        </div>

        <DataTable
          headers={[
            'Job',
            'Customer',
            'Technician',
            'Type',
            'Priority',
            'Status',
            'Scheduled',
            'Completed',
            'Revenue',
            'Reports',
          ]}
          rows={visibleJobs.map((job) => [
            job.job_number ||
              job.number ||
              job.title ||
              job.id,
            getCustomerName(
              customerById[job.customer_id]
            ),
            getEmployeeName(
              employeeById[
                getJobEmployeeId(job)
              ]
            ),
            job.job_type ||
              job.type ||
              job.category ||
              '—',
            job.priority || 'Normal',
            job.status || 'Open',
            formatDateTime(
              job.scheduled_start ||
                job.scheduled_date ||
                job.start_date
            ),
            formatDateTime(
              job.completed_at
            ),
            formatCurrency(
              getJobRevenue(
                job,
                invoicesByJobId
              )
            ),
            formatNumber(
              (
                reportsByJobId[job.id] || []
              ).length
            ),
          ])}
          emptyMessage="No jobs match the current filters."
        />
      </section>
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function BarPanel({
  title,
  items,
  formatter,
}) {
  const max = Math.max(
    1,
    ...items.map((item) =>
      numberValue(item.value)
    )
  )

  return (
    <section className="panel">
      <h2>{title}</h2>

      <div className="cards">
        {items.map((item) => (
          <div
            className="card"
            key={item.label}
          >
            <div className="between">
              <strong>{item.label}</strong>
              <span>
                {formatter(item.value)}
              </span>
            </div>

            <div
              style={{
                marginTop: 10,
                width: '100%',
                height: 10,
                borderRadius: 999,
                background: '#e2e8f0',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max(
                    2,
                    (numberValue(
                      item.value
                    ) /
                      max) *
                      100
                  )}%`,
                  height: '100%',
                  background: '#0f172a',
                }}
              />
            </div>
          </div>
        ))}

        {!items.length && (
          <EmptyState>
            No data is available for this period.
          </EmptyState>
        )}
      </div>
    </section>
  )
}

function DataTable({
  headers,
  rows,
  emptyMessage,
}) {
  if (!rows.length) {
    return (
      <EmptyState>
        {emptyMessage}
      </EmptyState>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        overflowX: 'auto',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}
      >
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                style={{
                  textAlign: 'left',
                  padding: '12px 10px',
                  borderBottom:
                    '1px solid #cbd5e1',
                  whiteSpace: 'nowrap',
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map(
                (value, columnIndex) => (
                  <td
                    key={columnIndex}
                    style={{
                      padding: '12px 10px',
                      borderBottom:
                        '1px solid #e2e8f0',
                      verticalAlign: 'top',
                      whiteSpace:
                        columnIndex === 0
                          ? 'nowrap'
                          : 'normal',
                    }}
                  >
                    {value}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
