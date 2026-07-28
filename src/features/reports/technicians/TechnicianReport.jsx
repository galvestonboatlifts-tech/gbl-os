import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase as sharedSupabase } from '../../../lib/supabase'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

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

function formatPercent(value) {
  return `${numberValue(value).toFixed(1)}%`
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
  const month =
    Math.floor(date.getMonth() / 3) * 3

  return new Date(
    date.getFullYear(),
    month,
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

function getJobEmployeeId(job) {
  return (
    job.employee_id ||
    job.technician_id ||
    job.assigned_employee_id ||
    job.assigned_to ||
    null
  )
}

function getReportEmployeeId(report) {
  return (
    report.employee_id ||
    report.technician_id ||
    report.completed_by ||
    report.created_by ||
    null
  )
}

function getTimeEntryEmployeeId(entry) {
  return (
    entry.employee_id ||
    entry.technician_id ||
    entry.user_id ||
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

function isEmergencyJob(job) {
  return (
    normalize(job.priority) === 'emergency' ||
    normalize(job.job_type) === 'emergency' ||
    normalize(job.type) === 'emergency' ||
    job.is_emergency === true
  )
}

function getInvoiceTotal(invoice) {
  return numberValue(
    invoice.total ||
      invoice.total_amount ||
      invoice.amount ||
      invoice.grand_total
  )
}

function getInvoicePaid(invoice) {
  return numberValue(
    invoice.amount_paid ||
      invoice.paid_amount ||
      invoice.payment_amount ||
      invoice.total_paid
  )
}

function isPaidInvoice(invoice) {
  return [
    'paid',
    'completed',
    'settled',
    'closed',
  ].includes(normalize(invoice.status))
}

function getDurationHours(startValue, endValue) {
  if (!startValue || !endValue) {
    return 0
  }

  const start = new Date(startValue)
  const end = new Date(endValue)

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return 0
  }

  return Math.max(
    0,
    (end.getTime() - start.getTime()) /
      HOUR_MS
  )
}

function getJobActiveHours(job) {
  return getDurationHours(
    job.started_at ||
      job.actual_start ||
      job.start_time,
    job.completed_at ||
      job.actual_end ||
      job.end_time
  )
}

function getJobCompletionDays(job) {
  const startValue =
    job.started_at ||
    job.start_date ||
    job.scheduled_start ||
    job.scheduled_date ||
    job.created_at

  const endValue =
    job.completed_at ||
    job.closed_at ||
    job.updated_at

  if (!startValue || !endValue) {
    return 0
  }

  const start = new Date(startValue)
  const end = new Date(endValue)

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    return 0
  }

  return Math.max(
    0,
    (end.getTime() - start.getTime()) /
      DAY_MS
  )
}

function getTimeEntryHours(entry) {
  if (
    entry.hours !== undefined &&
    entry.hours !== null
  ) {
    return numberValue(entry.hours)
  }

  if (
    entry.duration_hours !== undefined &&
    entry.duration_hours !== null
  ) {
    return numberValue(entry.duration_hours)
  }

  if (
    entry.minutes !== undefined &&
    entry.minutes !== null
  ) {
    return numberValue(entry.minutes) / 60
  }

  return getDurationHours(
    entry.clock_in ||
      entry.started_at ||
      entry.start_time,
    entry.clock_out ||
      entry.ended_at ||
      entry.end_time
  )
}

function getLastActivityDate({
  employee,
  jobs,
  reports,
  timeEntries,
}) {
  const values = [
    employee?.updated_at,
    employee?.created_at,
    ...jobs.flatMap((job) => [
      job.completed_at,
      job.updated_at,
      job.created_at,
    ]),
    ...reports.flatMap((report) => [
      report.completed_at,
      report.updated_at,
      report.created_at,
    ]),
    ...timeEntries.flatMap((entry) => [
      entry.clock_out,
      entry.updated_at,
      entry.created_at,
    ]),
  ].filter(Boolean)

  const timestamps = values
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)

  if (!timestamps.length) {
    return null
  }

  return new Date(Math.max(...timestamps))
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

export default function TechnicianReport({
  supabase: suppliedSupabase,
} = {}) {
  const supabase =
    suppliedSupabase || sharedSupabase

  const [employees, setEmployees] =
    useState([])
  const [jobs, setJobs] = useState([])
  const [customers, setCustomers] =
    useState([])
  const [serviceReports, setServiceReports] =
    useState([])
  const [invoices, setInvoices] =
    useState([])
  const [timeEntries, setTimeEntries] =
    useState([])

  const [datePreset, setDatePreset] =
    useState('year')
  const [customStart, setCustomStart] =
    useState('')
  const [customEnd, setCustomEnd] =
    useState('')
  const [statusFilter, setStatusFilter] =
    useState('all')
  const [roleFilter, setRoleFilter] =
    useState('all')
  const [performanceFilter, setPerformanceFilter] =
    useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] =
    useState('completed')
  const [sortDirection, setSortDirection] =
    useState('desc')

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
        employeesResult,
        jobsResult,
        customersResult,
        reportsResult,
        invoicesResult,
        timeEntriesResult,
      ] = await Promise.all([
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
        safeQuery(
          supabase
            .from('time_entries')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),
      ])

      setEmployees(employeesResult.data)
      setJobs(jobsResult.data)
      setCustomers(customersResult.data)
      setServiceReports(reportsResult.data)
      setInvoices(invoicesResult.data)
      setTimeEntries(timeEntriesResult.data)

      const errors = [
        employeesResult.error,
        jobsResult.error,
        customersResult.error,
        reportsResult.error,
        invoicesResult.error,
        timeEntriesResult.error,
      ].filter(Boolean)

      if (errors.length) {
        console.warn(
          'Technician reports loaded with limited data:',
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

  const jobsByEmployeeId = useMemo(() => {
    const grouped = {}

    jobs.forEach((job) => {
      const employeeId = getJobEmployeeId(job)

      if (!employeeId) {
        return
      }

      if (!grouped[employeeId]) {
        grouped[employeeId] = []
      }

      grouped[employeeId].push(job)
    })

    return grouped
  }, [jobs])

  const reportsByEmployeeId = useMemo(() => {
    const grouped = {}

    serviceReports.forEach((report) => {
      const employeeId =
        getReportEmployeeId(report)

      if (!employeeId) {
        return
      }

      if (!grouped[employeeId]) {
        grouped[employeeId] = []
      }

      grouped[employeeId].push(report)
    })

    return grouped
  }, [serviceReports])

  const timeEntriesByEmployeeId = useMemo(() => {
    const grouped = {}

    timeEntries.forEach((entry) => {
      const employeeId =
        getTimeEntryEmployeeId(entry)

      if (!employeeId) {
        return
      }

      if (!grouped[employeeId]) {
        grouped[employeeId] = []
      }

      grouped[employeeId].push(entry)
    })

    return grouped
  }, [timeEntries])

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

  const technicianRows = useMemo(() => {
    return employees.map((employee) => {
      const employeeJobs =
        jobsByEmployeeId[employee.id] || []

      const employeeReports =
        reportsByEmployeeId[employee.id] || []

      const employeeTimeEntries =
        timeEntriesByEmployeeId[employee.id] || []

      const filteredJobs = employeeJobs.filter(
        (job) =>
          inRange(
            getJobDate(job),
            dateRange.start,
            dateRange.end
          )
      )

      const filteredReports =
        employeeReports.filter((report) =>
          inRange(
            report.completed_at ||
              report.updated_at ||
              report.created_at,
            dateRange.start,
            dateRange.end
          )
        )

      const filteredTimeEntries =
        employeeTimeEntries.filter((entry) =>
          inRange(
            entry.clock_in ||
              entry.started_at ||
              entry.created_at,
            dateRange.start,
            dateRange.end
          )
        )

      const completedJobs =
        filteredJobs.filter(isCompletedJob)

      const openJobs =
        filteredJobs.filter(isOpenJob)

      const overdueJobs =
        filteredJobs.filter(isOverdueJob)

      const emergencyJobs =
        filteredJobs.filter(isEmergencyJob)

      const revenue = filteredJobs.reduce(
        (total, job) => {
          const jobInvoices =
            invoicesByJobId[job.id] || []

          return (
            total +
            jobInvoices.reduce(
              (sum, invoice) =>
                sum +
                (isPaidInvoice(invoice)
                  ? getInvoicePaid(invoice) ||
                    getInvoiceTotal(invoice)
                  : getInvoiceTotal(invoice)),
              0
            )
          )
        },
        0
      )

      const trackedHours =
        filteredTimeEntries.reduce(
          (total, entry) =>
            total + getTimeEntryHours(entry),
          0
        )

      const activeJobHours =
        completedJobs.reduce(
          (total, job) =>
            total + getJobActiveHours(job),
          0
        )

      const totalHours =
        trackedHours > 0
          ? trackedHours
          : activeJobHours

      const completionDurations =
        completedJobs
          .map(getJobCompletionDays)
          .filter((value) => value > 0)

      const averageCompletionDays =
        completionDurations.length > 0
          ? completionDurations.reduce(
              (sum, value) => sum + value,
              0
            ) / completionDurations.length
          : 0

      const completionRate =
        filteredJobs.length > 0
          ? (completedJobs.length /
              filteredJobs.length) *
            100
          : 0

      const overdueRate =
        filteredJobs.length > 0
          ? (overdueJobs.length /
              filteredJobs.length) *
            100
          : 0

      const revenuePerJob =
        completedJobs.length > 0
          ? revenue / completedJobs.length
          : 0

      const revenuePerHour =
        totalHours > 0
          ? revenue / totalHours
          : 0

      const reportsPerJob =
        completedJobs.length > 0
          ? filteredReports.length /
            completedJobs.length
          : 0

      const lastActivity = getLastActivityDate({
        employee,
        jobs: employeeJobs,
        reports: employeeReports,
        timeEntries: employeeTimeEntries,
      })

      const active =
        employee.active !== false &&
        normalize(employee.status) !== 'inactive'

      return {
        id: employee.id,
        employee,
        name: getEmployeeName(employee),
        email: employee.email || '—',
        phone:
          employee.phone ||
          employee.mobile ||
          '—',
        role:
          employee.role ||
          employee.job_title ||
          employee.position ||
          'Technician',
        status:
          employee.status ||
          (active ? 'Active' : 'Inactive'),
        active,
        assignedJobs: filteredJobs.length,
        completedJobs: completedJobs.length,
        openJobs: openJobs.length,
        overdueJobs: overdueJobs.length,
        emergencyJobs: emergencyJobs.length,
        serviceReports:
          filteredReports.length,
        totalHours,
        completionRate,
        overdueRate,
        averageCompletionDays,
        revenue,
        revenuePerJob,
        revenuePerHour,
        reportsPerJob,
        lastActivity,
      }
    })
  }, [
    employees,
    jobsByEmployeeId,
    reportsByEmployeeId,
    timeEntriesByEmployeeId,
    invoicesByJobId,
    dateRange,
  ])

  const activeTechnicians = useMemo(
    () =>
      technicianRows.filter(
        (row) => row.active
      ),
    [technicianRows]
  )

  const totalAssignedJobs = useMemo(
    () =>
      technicianRows.reduce(
        (total, row) =>
          total + row.assignedJobs,
        0
      ),
    [technicianRows]
  )

  const totalCompletedJobs = useMemo(
    () =>
      technicianRows.reduce(
        (total, row) =>
          total + row.completedJobs,
        0
      ),
    [technicianRows]
  )

  const totalOpenJobs = useMemo(
    () =>
      technicianRows.reduce(
        (total, row) =>
          total + row.openJobs,
        0
      ),
    [technicianRows]
  )

  const totalOverdueJobs = useMemo(
    () =>
      technicianRows.reduce(
        (total, row) =>
          total + row.overdueJobs,
        0
      ),
    [technicianRows]
  )

  const totalRevenue = useMemo(
    () =>
      technicianRows.reduce(
        (total, row) =>
          total + row.revenue,
        0
      ),
    [technicianRows]
  )

  const totalHours = useMemo(
    () =>
      technicianRows.reduce(
        (total, row) =>
          total + row.totalHours,
        0
      ),
    [technicianRows]
  )

  const overallCompletionRate =
    totalAssignedJobs > 0
      ? (totalCompletedJobs /
          totalAssignedJobs) *
        100
      : 0

  const averageRevenuePerTechnician =
    technicianRows.length > 0
      ? totalRevenue / technicianRows.length
      : 0

  const jobsByTechnician = useMemo(
    () =>
      technicianRows
        .map((row) => ({
          label: row.name,
          value: row.assignedJobs,
        }))
        .sort((a, b) => b.value - a.value),
    [technicianRows]
  )

  const completedByTechnician = useMemo(
    () =>
      technicianRows
        .map((row) => ({
          label: row.name,
          value: row.completedJobs,
        }))
        .sort((a, b) => b.value - a.value),
    [technicianRows]
  )

  const revenueByTechnician = useMemo(
    () =>
      technicianRows
        .map((row) => ({
          label: row.name,
          value: row.revenue,
        }))
        .sort((a, b) => b.value - a.value),
    [technicianRows]
  )

  const hoursByTechnician = useMemo(
    () =>
      technicianRows
        .map((row) => ({
          label: row.name,
          value: row.totalHours,
        }))
        .sort((a, b) => b.value - a.value),
    [technicianRows]
  )

  const roles = useMemo(
    () =>
      Array.from(
        new Set(
          technicianRows
            .map((row) => row.role)
            .filter(Boolean)
        )
      ).sort(),
    [technicianRows]
  )

  const visibleTechnicians = useMemo(() => {
    const searchValue = normalize(search)

    let rows = technicianRows.filter((row) => {
      if (
        statusFilter === 'active' &&
        !row.active
      ) {
        return false
      }

      if (
        statusFilter === 'inactive' &&
        row.active
      ) {
        return false
      }

      if (
        roleFilter !== 'all' &&
        normalize(row.role) !==
          normalize(roleFilter)
      ) {
        return false
      }

      if (
        performanceFilter === 'top' &&
        !(
          row.completionRate >= 80 &&
          row.overdueRate <= 10
        )
      ) {
        return false
      }

      if (
        performanceFilter === 'overdue' &&
        row.overdueJobs <= 0
      ) {
        return false
      }

      if (
        performanceFilter === 'noActivity' &&
        row.assignedJobs > 0
      ) {
        return false
      }

      if (searchValue) {
        const searchable = [
          row.name,
          row.email,
          row.phone,
          row.role,
          row.status,
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

      if (sortBy === 'name') {
        left = a.name
        right = b.name
      } else if (sortBy === 'assigned') {
        left = a.assignedJobs
        right = b.assignedJobs
      } else if (sortBy === 'open') {
        left = a.openJobs
        right = b.openJobs
      } else if (sortBy === 'overdue') {
        left = a.overdueJobs
        right = b.overdueJobs
      } else if (sortBy === 'completionRate') {
        left = a.completionRate
        right = b.completionRate
      } else if (sortBy === 'revenue') {
        left = a.revenue
        right = b.revenue
      } else if (sortBy === 'hours') {
        left = a.totalHours
        right = b.totalHours
      } else if (sortBy === 'lastActivity') {
        left = a.lastActivity
          ? new Date(a.lastActivity).getTime()
          : 0

        right = b.lastActivity
          ? new Date(b.lastActivity).getTime()
          : 0
      } else {
        left = a.completedJobs
        right = b.completedJobs
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
    technicianRows,
    search,
    statusFilter,
    roleFilter,
    performanceFilter,
    sortBy,
    sortDirection,
  ])

  const recentCompletedJobs = useMemo(
    () =>
      jobs
        .filter(
          (job) =>
            isCompletedJob(job) &&
            inRange(
              job.completed_at ||
                job.updated_at,
              dateRange.start,
              dateRange.end
            )
        )
        .sort(
          (a, b) =>
            new Date(
              b.completed_at ||
                b.updated_at ||
                0
            ).getTime() -
            new Date(
              a.completed_at ||
                a.updated_at ||
                0
            ).getTime()
        )
        .slice(0, 50),
    [jobs, dateRange]
  )

  function exportTechnicianReport() {
    const stamp = new Date()
      .toISOString()
      .slice(0, 10)

    downloadCsv(
      `gbl-technician-report-${stamp}.csv`,
      [
        ['GBL OS Technician Report'],
        [
          'Generated',
          new Date().toLocaleString('en-US'),
        ],
        [],
        ['Metric', 'Value'],
        [
          'Total Technicians',
          technicianRows.length,
        ],
        [
          'Active Technicians',
          activeTechnicians.length,
        ],
        ['Assigned Jobs', totalAssignedJobs],
        ['Completed Jobs', totalCompletedJobs],
        ['Open Jobs', totalOpenJobs],
        ['Overdue Jobs', totalOverdueJobs],
        [
          'Completion Rate',
          overallCompletionRate.toFixed(1),
        ],
        ['Tracked Hours', totalHours],
        ['Technician Revenue', totalRevenue],
        [
          'Average Revenue per Technician',
          averageRevenuePerTechnician,
        ],
        [],
        [
          'Technician',
          'Role',
          'Status',
          'Assigned',
          'Completed',
          'Open',
          'Overdue',
          'Emergency',
          'Service Reports',
          'Hours',
          'Completion Rate',
          'Average Completion Days',
          'Revenue',
          'Revenue per Job',
          'Revenue per Hour',
          'Last Activity',
        ],
        ...visibleTechnicians.map((row) => [
          row.name,
          row.role,
          row.status,
          row.assignedJobs,
          row.completedJobs,
          row.openJobs,
          row.overdueJobs,
          row.emergencyJobs,
          row.serviceReports,
          row.totalHours,
          row.completionRate,
          row.averageCompletionDays,
          row.revenue,
          row.revenuePerJob,
          row.revenuePerHour,
          row.lastActivity || '',
        ]),
      ]
    )
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Technician Reports</h2>
        <p>Loading technician data...</p>
      </section>
    )
  }

  return (
    <div className="technician-report">
      <div className="toolbar">
        <div>
          <h1 style={{ margin: 0 }}>
            Technician Reports
          </h1>

          <div
            className="small"
            style={{ marginTop: 6 }}
          >
            Technician workload, productivity,
            completion, hours, and revenue
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
            onClick={exportTechnicianReport}
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
                setDatePreset(
                  event.target.value
                )
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
          label="Total Technicians"
          value={formatNumber(
            technicianRows.length
          )}
        />
        <Metric
          label="Active Technicians"
          value={formatNumber(
            activeTechnicians.length
          )}
        />
        <Metric
          label="Assigned Jobs"
          value={formatNumber(
            totalAssignedJobs
          )}
        />
        <Metric
          label="Completed Jobs"
          value={formatNumber(
            totalCompletedJobs
          )}
        />
      </div>

      <div className="metrics">
        <Metric
          label="Open Jobs"
          value={formatNumber(totalOpenJobs)}
        />
        <Metric
          label="Overdue Jobs"
          value={formatNumber(
            totalOverdueJobs
          )}
        />
        <Metric
          label="Completion Rate"
          value={formatPercent(
            overallCompletionRate
          )}
        />
        <Metric
          label="Tracked Hours"
          value={`${formatNumber(
            totalHours.toFixed(1)
          )} hrs`}
        />
      </div>

      <div className="metrics">
        <Metric
          label="Technician Revenue"
          value={formatCurrency(totalRevenue)}
        />
        <Metric
          label="Average Revenue"
          value={formatCurrency(
            averageRevenuePerTechnician
          )}
        />
        <Metric
          label="Service Reports"
          value={formatNumber(
            technicianRows.reduce(
              (total, row) =>
                total + row.serviceReports,
              0
            )
          )}
        />
        <Metric
          label="Emergency Jobs"
          value={formatNumber(
            technicianRows.reduce(
              (total, row) =>
                total + row.emergencyJobs,
              0
            )
          )}
        />
      </div>

      <div className="grid-2">
        <BarPanel
          title="Assigned Jobs by Technician"
          items={jobsByTechnician}
          formatter={formatNumber}
        />

        <BarPanel
          title="Completed Jobs by Technician"
          items={completedByTechnician}
          formatter={formatNumber}
        />
      </div>

      <div className="grid-2">
        <BarPanel
          title="Revenue by Technician"
          items={revenueByTechnician}
          formatter={formatCurrency}
        />

        <BarPanel
          title="Tracked Hours by Technician"
          items={hoursByTechnician}
          formatter={(value) =>
            `${numberValue(value).toFixed(1)} hrs`
          }
        />
      </div>

      <section className="panel">
        <div className="between">
          <div>
            <h2 style={{ marginBottom: 4 }}>
              Technician Performance
            </h2>

            <div className="small">
              Search, filter, sort, and export
              technician activity
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
                <option value="active">
                  Active
                </option>
                <option value="inactive">
                  Inactive
                </option>
              </select>
            </label>

            <label>
              <span className="small">
                Role
              </span>

              <select
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  All
                </option>

                {roles.map((role) => (
                  <option
                    key={role}
                    value={role}
                  >
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="small">
                Performance
              </span>

              <select
                value={performanceFilter}
                onChange={(event) =>
                  setPerformanceFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  All
                </option>
                <option value="top">
                  Top Performers
                </option>
                <option value="overdue">
                  Has Overdue Jobs
                </option>
                <option value="noActivity">
                  No Activity
                </option>
              </select>
            </label>

            <label>
              <span className="small">
                Sort by
              </span>

              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(
                    event.target.value
                  )
                }
              >
                <option value="completed">
                  Completed Jobs
                </option>
                <option value="assigned">
                  Assigned Jobs
                </option>
                <option value="open">
                  Open Jobs
                </option>
                <option value="overdue">
                  Overdue Jobs
                </option>
                <option value="completionRate">
                  Completion Rate
                </option>
                <option value="revenue">
                  Revenue
                </option>
                <option value="hours">
                  Hours
                </option>
                <option value="lastActivity">
                  Last Activity
                </option>
                <option value="name">
                  Name
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
                <option value="desc">
                  Descending
                </option>
                <option value="asc">
                  Ascending
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
                placeholder="Technician, role, email..."
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
              />
            </label>
          </div>
        </div>

        <DataTable
          headers={[
            'Technician',
            'Role',
            'Assigned',
            'Completed',
            'Open',
            'Overdue',
            'Completion',
            'Reports',
            'Hours',
            'Revenue',
            'Revenue / Job',
            'Last Activity',
          ]}
          rows={visibleTechnicians.map(
            (row) => [
              <div key={`${row.id}-name`}>
                <strong>{row.name}</strong>
                <div className="small">
                  {row.email}
                </div>
              </div>,
              row.role,
              formatNumber(row.assignedJobs),
              formatNumber(row.completedJobs),
              formatNumber(row.openJobs),
              formatNumber(row.overdueJobs),
              formatPercent(
                row.completionRate
              ),
              formatNumber(
                row.serviceReports
              ),
              `${row.totalHours.toFixed(
                1
              )} hrs`,
              formatCurrency(row.revenue),
              formatCurrency(
                row.revenuePerJob
              ),
              formatDateTime(
                row.lastActivity
              ),
            ]
          )}
          emptyMessage="No technicians match the current filters."
        />
      </section>

      <section className="panel">
        <h2>Recent Completed Jobs</h2>

        <DataTable
          headers={[
            'Job',
            'Technician',
            'Customer',
            'Completed',
            'Duration',
            'Revenue',
          ]}
          rows={recentCompletedJobs.map(
            (job) => {
              const employee =
                employees.find(
                  (item) =>
                    item.id ===
                    getJobEmployeeId(job)
                )

              const jobInvoices =
                invoicesByJobId[job.id] || []

              const revenue =
                jobInvoices.reduce(
                  (total, invoice) =>
                    total +
                    getInvoiceTotal(invoice),
                  0
                )

              return [
                job.job_number ||
                  job.number ||
                  job.title ||
                  job.id,
                getEmployeeName(employee),
                getCustomerName(
                  customerById[
                    job.customer_id
                  ]
                ),
                formatDateTime(
                  job.completed_at ||
                    job.updated_at
                ),
                `${getJobCompletionDays(
                  job
                ).toFixed(1)} days`,
                formatCurrency(revenue),
              ]
            }
          )}
          emptyMessage="No completed jobs are available for this period."
        />
      </section>
    </div>
  )
}

function Metric({
  label,
  value,
}) {
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
