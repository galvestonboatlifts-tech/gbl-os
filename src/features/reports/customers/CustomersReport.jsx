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

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(numberValue(value))
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(
    numberValue(value)
  )
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

function getCustomerPhone(customer) {
  return (
    customer.phone ||
    customer.mobile ||
    customer.phone_number ||
    '—'
  )
}

function getCustomerAddress(customer) {
  const parts = [
    customer.address,
    customer.address_line_1,
    customer.city,
    customer.state,
    customer.zip,
    customer.postal_code,
  ].filter(Boolean)

  return parts.length ? parts.join(', ') : '—'
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

function getInvoiceBalance(invoice) {
  if (
    invoice.balance_due !== undefined &&
    invoice.balance_due !== null
  ) {
    return numberValue(invoice.balance_due)
  }

  if (
    invoice.balance !== undefined &&
    invoice.balance !== null
  ) {
    return numberValue(invoice.balance)
  }

  return Math.max(
    0,
    getInvoiceTotal(invoice) -
      getInvoicePaid(invoice)
  )
}

function isPaidInvoice(invoice) {
  const status = normalize(invoice.status)

  return (
    [
      'paid',
      'completed',
      'settled',
      'closed',
    ].includes(status) ||
    getInvoiceBalance(invoice) <= 0
  )
}

function isVoidedInvoice(invoice) {
  return [
    'void',
    'cancelled',
    'canceled',
    'deleted',
  ].includes(normalize(invoice.status))
}

function getEstimateTotal(estimate) {
  return numberValue(
    estimate.total ||
      estimate.total_amount ||
      estimate.amount ||
      estimate.grand_total
  )
}

function isAcceptedEstimate(estimate) {
  return [
    'approved',
    'accepted',
    'converted',
    'won',
  ].includes(normalize(estimate.status))
}

function isCompletedJob(job) {
  return [
    'completed',
    'closed',
    'done',
    'finished',
  ].includes(normalize(job.status))
}

function isOpenJob(job) {
  return ![
    'completed',
    'closed',
    'done',
    'finished',
    'cancelled',
    'canceled',
    'void',
  ].includes(normalize(job.status))
}

function getLastActivityDate({
  customer,
  jobs,
  invoices,
  estimates,
  reports,
}) {
  const values = [
    customer?.updated_at,
    customer?.created_at,
    ...jobs.flatMap((job) => [
      job.completed_at,
      job.updated_at,
      job.created_at,
    ]),
    ...invoices.flatMap((invoice) => [
      invoice.paid_at,
      invoice.updated_at,
      invoice.created_at,
    ]),
    ...estimates.flatMap((estimate) => [
      estimate.approved_at,
      estimate.updated_at,
      estimate.created_at,
    ]),
    ...reports.flatMap((report) => [
      report.completed_at,
      report.updated_at,
      report.created_at,
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

function daysSince(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return Math.floor(
    (Date.now() - date.getTime()) / DAY_MS
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

export default function CustomersReport({
  supabase: suppliedSupabase,
} = {}) {
  const supabase =
    suppliedSupabase || sharedSupabase

  const [customers, setCustomers] =
    useState([])
  const [jobs, setJobs] = useState([])
  const [invoices, setInvoices] =
    useState([])
  const [estimates, setEstimates] =
    useState([])
  const [boatLifts, setBoatLifts] =
    useState([])
  const [serviceReports, setServiceReports] =
    useState([])

  const [datePreset, setDatePreset] =
    useState('year')
  const [customStart, setCustomStart] =
    useState('')
  const [customEnd, setCustomEnd] =
    useState('')
  const [statusFilter, setStatusFilter] =
    useState('all')
  const [balanceFilter, setBalanceFilter] =
    useState('all')
  const [activityFilter, setActivityFilter] =
    useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] =
    useState('revenue')
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
        customersResult,
        jobsResult,
        invoicesResult,
        estimatesResult,
        boatLiftsResult,
        reportsResult,
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
            .from('invoices')
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
            .from('boat_lifts')
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
      ])

      setCustomers(customersResult.data)
      setJobs(jobsResult.data)
      setInvoices(invoicesResult.data)
      setEstimates(estimatesResult.data)
      setBoatLifts(boatLiftsResult.data)
      setServiceReports(reportsResult.data)

      const errors = [
        customersResult.error,
        jobsResult.error,
        invoicesResult.error,
        estimatesResult.error,
        boatLiftsResult.error,
        reportsResult.error,
      ].filter(Boolean)

      if (errors.length) {
        console.warn(
          'Customer reports loaded with limited data:',
          errors
        )

        setNotice(
          'Some customer data could not be loaded. Available information is still shown.'
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

  const jobsByCustomerId = useMemo(() => {
    const grouped = {}

    jobs.forEach((job) => {
      if (!job.customer_id) {
        return
      }

      if (!grouped[job.customer_id]) {
        grouped[job.customer_id] = []
      }

      grouped[job.customer_id].push(job)
    })

    return grouped
  }, [jobs])

  const invoicesByCustomerId = useMemo(() => {
    const grouped = {}

    invoices.forEach((invoice) => {
      if (!invoice.customer_id) {
        return
      }

      if (!grouped[invoice.customer_id]) {
        grouped[invoice.customer_id] = []
      }

      grouped[invoice.customer_id].push(invoice)
    })

    return grouped
  }, [invoices])

  const estimatesByCustomerId = useMemo(() => {
    const grouped = {}

    estimates.forEach((estimate) => {
      if (!estimate.customer_id) {
        return
      }

      if (!grouped[estimate.customer_id]) {
        grouped[estimate.customer_id] = []
      }

      grouped[estimate.customer_id].push(estimate)
    })

    return grouped
  }, [estimates])

  const liftsByCustomerId = useMemo(() => {
    const grouped = {}

    boatLifts.forEach((lift) => {
      if (!lift.customer_id) {
        return
      }

      if (!grouped[lift.customer_id]) {
        grouped[lift.customer_id] = []
      }

      grouped[lift.customer_id].push(lift)
    })

    return grouped
  }, [boatLifts])

  const reportsByCustomerId = useMemo(() => {
    const grouped = {}

    serviceReports.forEach((report) => {
      if (!report.customer_id) {
        return
      }

      if (!grouped[report.customer_id]) {
        grouped[report.customer_id] = []
      }

      grouped[report.customer_id].push(report)
    })

    return grouped
  }, [serviceReports])

  const customerRows = useMemo(() => {
    return customers.map((customer) => {
      const customerJobs =
        jobsByCustomerId[customer.id] || []

      const customerInvoices =
        invoicesByCustomerId[customer.id] || []

      const customerEstimates =
        estimatesByCustomerId[customer.id] || []

      const customerLifts =
        liftsByCustomerId[customer.id] || []

      const customerReports =
        reportsByCustomerId[customer.id] || []

      const paidInvoices =
        customerInvoices.filter(
          (invoice) =>
            !isVoidedInvoice(invoice) &&
            isPaidInvoice(invoice)
        )

      const openInvoices =
        customerInvoices.filter(
          (invoice) =>
            !isVoidedInvoice(invoice) &&
            !isPaidInvoice(invoice) &&
            getInvoiceBalance(invoice) > 0
        )

      const revenue = paidInvoices.reduce(
        (total, invoice) =>
          total +
          (getInvoicePaid(invoice) ||
            getInvoiceTotal(invoice)),
        0
      )

      const outstanding = openInvoices.reduce(
        (total, invoice) =>
          total + getInvoiceBalance(invoice),
        0
      )

      const filteredCustomerJobs =
        customerJobs.filter((job) =>
          inRange(
            job.completed_at ||
              job.updated_at ||
              job.created_at,
            dateRange.start,
            dateRange.end
          )
        )

      const filteredCustomerInvoices =
        customerInvoices.filter((invoice) =>
          inRange(
            invoice.paid_at ||
              invoice.updated_at ||
              invoice.created_at,
            dateRange.start,
            dateRange.end
          )
        )

      const filteredCustomerEstimates =
        customerEstimates.filter((estimate) =>
          inRange(
            estimate.approved_at ||
              estimate.updated_at ||
              estimate.created_at,
            dateRange.start,
            dateRange.end
          )
        )

      const lastActivity = getLastActivityDate({
        customer,
        jobs: customerJobs,
        invoices: customerInvoices,
        estimates: customerEstimates,
        reports: customerReports,
      })

      const completedJobs =
        customerJobs.filter(isCompletedJob)

      const openJobs =
        customerJobs.filter(isOpenJob)

      const acceptedEstimates =
        customerEstimates.filter(
          isAcceptedEstimate
        )

      const estimateValue =
        filteredCustomerEstimates.reduce(
          (total, estimate) =>
            total + getEstimateTotal(estimate),
          0
        )

      const activityCount =
        filteredCustomerJobs.length +
        filteredCustomerInvoices.length +
        filteredCustomerEstimates.length

      return {
        id: customer.id,
        customer,
        name: getCustomerName(customer),
        email: customer.email || '—',
        phone: getCustomerPhone(customer),
        address: getCustomerAddress(customer),
        createdAt: customer.created_at,
        active:
          customer.active !== false &&
          normalize(customer.status) !==
            'inactive',
        revenue,
        outstanding,
        lifetimeValue:
          revenue + outstanding,
        totalJobs: customerJobs.length,
        completedJobs: completedJobs.length,
        openJobs: openJobs.length,
        totalInvoices: customerInvoices.length,
        paidInvoices: paidInvoices.length,
        openInvoices: openInvoices.length,
        totalEstimates:
          customerEstimates.length,
        acceptedEstimates:
          acceptedEstimates.length,
        estimateValue,
        lifts: customerLifts.length,
        reports: customerReports.length,
        lastActivity,
        daysInactive: daysSince(lastActivity),
        activityCount,
      }
    })
  }, [
    customers,
    jobsByCustomerId,
    invoicesByCustomerId,
    estimatesByCustomerId,
    liftsByCustomerId,
    reportsByCustomerId,
    dateRange,
  ])

  const newCustomers = useMemo(
    () =>
      customers.filter((customer) =>
        inRange(
          customer.created_at,
          dateRange.start,
          dateRange.end
        )
      ),
    [customers, dateRange]
  )

  const activeCustomers = useMemo(
    () =>
      customerRows.filter(
        (row) =>
          row.active &&
          (row.daysInactive === null ||
            row.daysInactive <= 365)
      ),
    [customerRows]
  )

  const inactiveCustomers = useMemo(
    () =>
      customerRows.filter(
        (row) =>
          !row.active ||
          (row.daysInactive !== null &&
            row.daysInactive > 365)
      ),
    [customerRows]
  )

  const repeatCustomers = useMemo(
    () =>
      customerRows.filter(
        (row) =>
          row.completedJobs >= 2 ||
          row.paidInvoices >= 2
      ),
    [customerRows]
  )

  const customersWithBalance = useMemo(
    () =>
      customerRows.filter(
        (row) => row.outstanding > 0
      ),
    [customerRows]
  )

  const totalRevenue = useMemo(
    () =>
      customerRows.reduce(
        (total, row) =>
          total + row.revenue,
        0
      ),
    [customerRows]
  )

  const totalOutstanding = useMemo(
    () =>
      customerRows.reduce(
        (total, row) =>
          total + row.outstanding,
        0
      ),
    [customerRows]
  )

  const averageCustomerValue =
    customerRows.length > 0
      ? totalRevenue / customerRows.length
      : 0

  const repeatCustomerRate =
    customerRows.length > 0
      ? (repeatCustomers.length /
          customerRows.length) *
        100
      : 0

  const topCustomers = useMemo(
    () =>
      [...customerRows]
        .sort(
          (a, b) =>
            b.revenue - a.revenue
        )
        .slice(0, 10),
    [customerRows]
  )

  const topOutstanding = useMemo(
    () =>
      [...customersWithBalance]
        .sort(
          (a, b) =>
            b.outstanding -
            a.outstanding
        )
        .slice(0, 10),
    [customersWithBalance]
  )

  const customersByCity = useMemo(() => {
    const totals = {}

    customers.forEach((customer) => {
      const label =
        customer.city ||
        customer.service_city ||
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
  }, [customers])

  const customerActivity = useMemo(() => {
    const buckets = {
      'Active in 30 Days': 0,
      '31–90 Days': 0,
      '91–180 Days': 0,
      '181–365 Days': 0,
      '365+ Days': 0,
      'No Activity': 0,
    }

    customerRows.forEach((row) => {
      const days = row.daysInactive

      if (days === null) {
        buckets['No Activity'] += 1
      } else if (days <= 30) {
        buckets['Active in 30 Days'] += 1
      } else if (days <= 90) {
        buckets['31–90 Days'] += 1
      } else if (days <= 180) {
        buckets['91–180 Days'] += 1
      } else if (days <= 365) {
        buckets['181–365 Days'] += 1
      } else {
        buckets['365+ Days'] += 1
      }
    })

    return Object.entries(buckets).map(
      ([label, value]) => ({
        label,
        value,
      })
    )
  }, [customerRows])

  const visibleCustomers = useMemo(() => {
    const searchValue = normalize(search)

    let rows = customerRows.filter((row) => {
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
        balanceFilter === 'withBalance' &&
        row.outstanding <= 0
      ) {
        return false
      }

      if (
        balanceFilter === 'noBalance' &&
        row.outstanding > 0
      ) {
        return false
      }

      if (
        activityFilter === 'repeat' &&
        !(
          row.completedJobs >= 2 ||
          row.paidInvoices >= 2
        )
      ) {
        return false
      }

      if (
        activityFilter === 'inactive90' &&
        !(
          row.daysInactive !== null &&
          row.daysInactive > 90
        )
      ) {
        return false
      }

      if (
        activityFilter === 'inactive365' &&
        !(
          row.daysInactive !== null &&
          row.daysInactive > 365
        )
      ) {
        return false
      }

      if (searchValue) {
        const searchable = [
          row.name,
          row.email,
          row.phone,
          row.address,
          row.customer.company_name,
          row.customer.notes,
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
      } else if (sortBy === 'outstanding') {
        left = a.outstanding
        right = b.outstanding
      } else if (sortBy === 'jobs') {
        left = a.totalJobs
        right = b.totalJobs
      } else if (sortBy === 'lastActivity') {
        left = a.lastActivity
          ? new Date(a.lastActivity).getTime()
          : 0

        right = b.lastActivity
          ? new Date(b.lastActivity).getTime()
          : 0
      } else if (sortBy === 'created') {
        left = new Date(
          a.createdAt || 0
        ).getTime()

        right = new Date(
          b.createdAt || 0
        ).getTime()
      } else {
        left = a.revenue
        right = b.revenue
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
    customerRows,
    search,
    statusFilter,
    balanceFilter,
    activityFilter,
    sortBy,
    sortDirection,
  ])

  function exportCustomerReport() {
    const stamp = new Date()
      .toISOString()
      .slice(0, 10)

    downloadCsv(
      `gbl-customer-report-${stamp}.csv`,
      [
        ['GBL OS Customer Report'],
        [
          'Generated',
          new Date().toLocaleString('en-US'),
        ],
        [],
        ['Metric', 'Value'],
        ['Total Customers', customers.length],
        ['New Customers', newCustomers.length],
        ['Active Customers', activeCustomers.length],
        ['Inactive Customers', inactiveCustomers.length],
        ['Repeat Customers', repeatCustomers.length],
        [
          'Repeat Customer Rate',
          repeatCustomerRate.toFixed(1),
        ],
        [
          'Customers with Balance',
          customersWithBalance.length,
        ],
        ['Customer Revenue', totalRevenue],
        [
          'Outstanding Balance',
          totalOutstanding,
        ],
        [
          'Average Customer Value',
          averageCustomerValue,
        ],
        [],
        ['Customer', 'Revenue'],
        ...topCustomers.map((row) => [
          row.name,
          row.revenue,
        ]),
        [],
        ['Customer', 'Outstanding'],
        ...topOutstanding.map((row) => [
          row.name,
          row.outstanding,
        ]),
        [],
        ['City', 'Customers'],
        ...customersByCity.map((item) => [
          item.label,
          item.value,
        ]),
        [],
        ['Activity', 'Customers'],
        ...customerActivity.map((item) => [
          item.label,
          item.value,
        ]),
        [],
        [
          'Customer',
          'Email',
          'Phone',
          'Address',
          'Revenue',
          'Outstanding',
          'Jobs',
          'Completed Jobs',
          'Open Jobs',
          'Invoices',
          'Estimates',
          'Boat Lifts',
          'Service Reports',
          'Last Activity',
          'Created',
        ],
        ...visibleCustomers.map((row) => [
          row.name,
          row.email,
          row.phone,
          row.address,
          row.revenue,
          row.outstanding,
          row.totalJobs,
          row.completedJobs,
          row.openJobs,
          row.totalInvoices,
          row.totalEstimates,
          row.lifts,
          row.reports,
          row.lastActivity || '',
          row.createdAt || '',
        ]),
      ]
    )
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Customer Reports</h2>
        <p>Loading customer data...</p>
      </section>
    )
  }

  return (
    <div className="customers-report">
      <div className="toolbar">
        <div>
          <h1 style={{ margin: 0 }}>
            Customer Reports
          </h1>

          <div
            className="small"
            style={{ marginTop: 6 }}
          >
            Customer growth, value, balances,
            service activity, and retention
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
            onClick={exportCustomerReport}
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
          label="Total Customers"
          value={formatNumber(
            customers.length
          )}
        />
        <Metric
          label="New Customers"
          value={formatNumber(
            newCustomers.length
          )}
        />
        <Metric
          label="Active Customers"
          value={formatNumber(
            activeCustomers.length
          )}
        />
        <Metric
          label="Inactive Customers"
          value={formatNumber(
            inactiveCustomers.length
          )}
        />
      </div>

      <div className="metrics">
        <Metric
          label="Customer Revenue"
          value={formatCurrency(
            totalRevenue
          )}
        />
        <Metric
          label="Outstanding Balance"
          value={formatCurrency(
            totalOutstanding
          )}
        />
        <Metric
          label="Average Customer Value"
          value={formatCurrency(
            averageCustomerValue
          )}
        />
        <Metric
          label="Repeat Customer Rate"
          value={formatPercent(
            repeatCustomerRate
          )}
        />
      </div>

      <div className="grid-2">
        <BarPanel
          title="Top Customers by Revenue"
          items={topCustomers.map((row) => ({
            label: row.name,
            value: row.revenue,
          }))}
          formatter={formatCurrency}
        />

        <BarPanel
          title="Largest Outstanding Balances"
          items={topOutstanding.map(
            (row) => ({
              label: row.name,
              value: row.outstanding,
            })
          )}
          formatter={formatCurrency}
        />
      </div>

      <div className="grid-2">
        <BarPanel
          title="Customers by City"
          items={customersByCity}
          formatter={formatNumber}
        />

        <BarPanel
          title="Customer Activity"
          items={customerActivity}
          formatter={formatNumber}
        />
      </div>

      <section className="panel">
        <div className="between">
          <div>
            <h2 style={{ marginBottom: 4 }}>
              Customer Detail
            </h2>
            <div className="small">
              Search, filter, sort, and export
              customer performance
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
                Balance
              </span>

              <select
                value={balanceFilter}
                onChange={(event) =>
                  setBalanceFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  All
                </option>
                <option value="withBalance">
                  With Balance
                </option>
                <option value="noBalance">
                  No Balance
                </option>
              </select>
            </label>

            <label>
              <span className="small">
                Activity
              </span>

              <select
                value={activityFilter}
                onChange={(event) =>
                  setActivityFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  All
                </option>
                <option value="repeat">
                  Repeat Customers
                </option>
                <option value="inactive90">
                  Inactive 90+ Days
                </option>
                <option value="inactive365">
                  Inactive 365+ Days
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
                <option value="revenue">
                  Revenue
                </option>
                <option value="outstanding">
                  Outstanding
                </option>
                <option value="jobs">
                  Jobs
                </option>
                <option value="lastActivity">
                  Last Activity
                </option>
                <option value="created">
                  Created Date
                </option>
                <option value="name">
                  Customer Name
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
                placeholder="Customer, email, phone..."
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
            'Customer',
            'Contact',
            'Revenue',
            'Outstanding',
            'Jobs',
            'Open Jobs',
            'Estimates',
            'Boat Lifts',
            'Reports',
            'Last Activity',
          ]}
          rows={visibleCustomers.map(
            (row) => [
              <div key={`${row.id}-name`}>
                <strong>{row.name}</strong>
                <div className="small">
                  Since {formatDate(row.createdAt)}
                </div>
              </div>,
              <div key={`${row.id}-contact`}>
                <div>{row.email}</div>
                <div className="small">
                  {row.phone}
                </div>
              </div>,
              formatCurrency(row.revenue),
              formatCurrency(
                row.outstanding
              ),
              formatNumber(row.totalJobs),
              formatNumber(row.openJobs),
              formatNumber(
                row.totalEstimates
              ),
              formatNumber(row.lifts),
              formatNumber(row.reports),
              formatDateTime(
                row.lastActivity
              ),
            ]
          )}
          emptyMessage="No customers match the current filters."
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
