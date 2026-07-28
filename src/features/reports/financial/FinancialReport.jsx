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

function formatMonthKey(value) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, '0')}`
}

function monthLabel(key) {
  if (!key) {
    return ''
  }

  const [year, month] = key.split('-')
  const date = new Date(
    Number(year),
    Number(month) - 1,
    1
  )

  return date.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
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

function getEstimateTotal(estimate) {
  return numberValue(
    estimate.total ||
      estimate.total_amount ||
      estimate.amount ||
      estimate.grand_total
  )
}

function getPaymentAmount(payment) {
  return numberValue(
    payment.amount ||
      payment.payment_amount ||
      payment.total
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

function isAcceptedEstimate(estimate) {
  return [
    'approved',
    'accepted',
    'converted',
    'won',
  ].includes(normalize(estimate.status))
}

function isRejectedEstimate(estimate) {
  return [
    'rejected',
    'declined',
    'lost',
    'cancelled',
    'canceled',
  ].includes(normalize(estimate.status))
}

function invoiceRevenueDate(invoice) {
  return (
    invoice.paid_at ||
    invoice.payment_date ||
    invoice.updated_at ||
    invoice.created_at
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

export default function FinancialReports({
  supabase: suppliedSupabase,
} = {}) {
  const supabase =
    suppliedSupabase || sharedSupabase

  const [invoices, setInvoices] = useState([])
  const [estimates, setEstimates] = useState([])
  const [customers, setCustomers] = useState([])
  const [employees, setEmployees] = useState([])
  const [jobs, setJobs] = useState([])
  const [payments, setPayments] = useState([])

  const [datePreset, setDatePreset] =
    useState('year')
  const [customStart, setCustomStart] =
    useState('')
  const [customEnd, setCustomEnd] =
    useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] =
    useState('all')
  const [sortBy, setSortBy] =
    useState('dueDate')
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
        invoicesResult,
        estimatesResult,
        customersResult,
        employeesResult,
        jobsResult,
        paymentsResult,
      ] = await Promise.all([
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
            .from('jobs')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),
        safeQuery(
          supabase
            .from('payments')
            .select('*')
            .order('created_at', {
              ascending: false,
            })
        ),
      ])

      setInvoices(invoicesResult.data)
      setEstimates(estimatesResult.data)
      setCustomers(customersResult.data)
      setEmployees(employeesResult.data)
      setJobs(jobsResult.data)
      setPayments(paymentsResult.data)

      const errors = [
        invoicesResult.error,
        estimatesResult.error,
        customersResult.error,
        employeesResult.error,
        jobsResult.error,
        paymentsResult.error,
      ].filter(Boolean)

      if (errors.length) {
        console.warn(
          'Financial reports loaded with limited data:',
          errors
        )

        setNotice(
          'Some financial data could not be loaded. Available information is still shown.'
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

  const jobById = useMemo(
    () =>
      Object.fromEntries(
        jobs.map((job) => [job.id, job])
      ),
    [jobs]
  )

  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice) =>
        inRange(
          invoiceRevenueDate(invoice),
          dateRange.start,
          dateRange.end
        )
      ),
    [invoices, dateRange]
  )

  const filteredEstimates = useMemo(
    () =>
      estimates.filter((estimate) =>
        inRange(
          estimate.approved_at ||
            estimate.updated_at ||
            estimate.created_at,
          dateRange.start,
          dateRange.end
        )
      ),
    [estimates, dateRange]
  )

  const filteredPayments = useMemo(
    () =>
      payments.filter((payment) =>
        inRange(
          payment.payment_date ||
            payment.paid_at ||
            payment.created_at,
          dateRange.start,
          dateRange.end
        )
      ),
    [payments, dateRange]
  )

  const paidInvoices = useMemo(
    () =>
      filteredInvoices.filter(
        (invoice) =>
          !isVoidedInvoice(invoice) &&
          isPaidInvoice(invoice)
      ),
    [filteredInvoices]
  )

  const openInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          !isVoidedInvoice(invoice) &&
          !isPaidInvoice(invoice) &&
          getInvoiceBalance(invoice) > 0
      ),
    [invoices]
  )

  const overdueInvoices = useMemo(() => {
    const now = new Date()

    return openInvoices.filter((invoice) => {
      if (!invoice.due_date) {
        return false
      }

      const dueDate = new Date(invoice.due_date)

      return (
        !Number.isNaN(dueDate.getTime()) &&
        dueDate < now
      )
    })
  }, [openInvoices])

  const invoiceRevenue = useMemo(
    () =>
      paidInvoices.reduce(
        (total, invoice) =>
          total +
          (getInvoicePaid(invoice) ||
            getInvoiceTotal(invoice)),
        0
      ),
    [paidInvoices]
  )

  const paymentRevenue = useMemo(
    () =>
      filteredPayments.reduce(
        (total, payment) =>
          total + getPaymentAmount(payment),
        0
      ),
    [filteredPayments]
  )

  const totalRevenue =
    paymentRevenue > 0
      ? paymentRevenue
      : invoiceRevenue

  const invoicedAmount = useMemo(
    () =>
      filteredInvoices
        .filter(
          (invoice) =>
            !isVoidedInvoice(invoice)
        )
        .reduce(
          (total, invoice) =>
            total + getInvoiceTotal(invoice),
          0
        ),
    [filteredInvoices]
  )

  const outstandingBalance = useMemo(
    () =>
      openInvoices.reduce(
        (total, invoice) =>
          total + getInvoiceBalance(invoice),
        0
      ),
    [openInvoices]
  )

  const overdueBalance = useMemo(
    () =>
      overdueInvoices.reduce(
        (total, invoice) =>
          total + getInvoiceBalance(invoice),
        0
      ),
    [overdueInvoices]
  )

  const averageInvoice =
    filteredInvoices.length > 0
      ? invoicedAmount /
        filteredInvoices.length
      : 0

  const collectionRate =
    invoicedAmount > 0
      ? (totalRevenue / invoicedAmount) * 100
      : 0

  const acceptedEstimates = useMemo(
    () =>
      filteredEstimates.filter(
        isAcceptedEstimate
      ),
    [filteredEstimates]
  )

  const rejectedEstimates = useMemo(
    () =>
      filteredEstimates.filter(
        isRejectedEstimate
      ),
    [filteredEstimates]
  )

  const pendingEstimates = useMemo(
    () =>
      filteredEstimates.filter(
        (estimate) =>
          !isAcceptedEstimate(estimate) &&
          !isRejectedEstimate(estimate)
      ),
    [filteredEstimates]
  )

  const estimateAcceptanceRate =
    filteredEstimates.length > 0
      ? (acceptedEstimates.length /
          filteredEstimates.length) *
        100
      : 0

  const acceptedEstimateValue = useMemo(
    () =>
      acceptedEstimates.reduce(
        (total, estimate) =>
          total + getEstimateTotal(estimate),
        0
      ),
    [acceptedEstimates]
  )

  const pendingEstimateValue = useMemo(
    () =>
      pendingEstimates.reduce(
        (total, estimate) =>
          total + getEstimateTotal(estimate),
        0
      ),
    [pendingEstimates]
  )

  const invoiceAging = useMemo(() => {
    const buckets = {
      Current: 0,
      '1–30 Days': 0,
      '31–60 Days': 0,
      '61–90 Days': 0,
      '90+ Days': 0,
    }

    const now = new Date()

    openInvoices.forEach((invoice) => {
      const dueDate = new Date(
        invoice.due_date ||
          invoice.created_at ||
          now
      )

      const days = Math.floor(
        (now.getTime() - dueDate.getTime()) /
          DAY_MS
      )

      const balance =
        getInvoiceBalance(invoice)

      if (days <= 0) {
        buckets.Current += balance
      } else if (days <= 30) {
        buckets['1–30 Days'] += balance
      } else if (days <= 60) {
        buckets['31–60 Days'] += balance
      } else if (days <= 90) {
        buckets['61–90 Days'] += balance
      } else {
        buckets['90+ Days'] += balance
      }
    })

    return Object.entries(buckets).map(
      ([label, value]) => ({
        label,
        value,
      })
    )
  }, [openInvoices])

  const revenueByMonth = useMemo(() => {
    const totals = {}

    const source =
      filteredPayments.length > 0
        ? filteredPayments.map((payment) => ({
            date:
              payment.payment_date ||
              payment.paid_at ||
              payment.created_at,
            amount: getPaymentAmount(payment),
          }))
        : paidInvoices.map((invoice) => ({
            date: invoiceRevenueDate(invoice),
            amount:
              getInvoicePaid(invoice) ||
              getInvoiceTotal(invoice),
          }))

    source.forEach((entry) => {
      const key = formatMonthKey(entry.date)

      if (!key) {
        return
      }

      totals[key] =
        (totals[key] || 0) + entry.amount
    })

    return Object.entries(totals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({
        label: monthLabel(key),
        value,
      }))
  }, [
    filteredPayments,
    paidInvoices,
  ])

  const revenueByCustomer = useMemo(() => {
    const totals = {}

    paidInvoices.forEach((invoice) => {
      const customerId =
        invoice.customer_id || 'unknown'

      totals[customerId] =
        (totals[customerId] || 0) +
        (getInvoicePaid(invoice) ||
          getInvoiceTotal(invoice))
    })

    return Object.entries(totals)
      .map(([customerId, total]) => ({
        id: customerId,
        name: getCustomerName(
          customerById[customerId]
        ),
        total,
      }))
      .sort((a, b) => b.total - a.total)
  }, [paidInvoices, customerById])

  const revenueByTechnician = useMemo(() => {
    const totals = {}

    paidInvoices.forEach((invoice) => {
      const job = jobById[invoice.job_id]

      const employeeId =
        invoice.employee_id ||
        invoice.technician_id ||
        job?.employee_id ||
        job?.technician_id ||
        job?.assigned_employee_id ||
        'unassigned'

      totals[employeeId] =
        (totals[employeeId] || 0) +
        (getInvoicePaid(invoice) ||
          getInvoiceTotal(invoice))
    })

    return Object.entries(totals)
      .map(([employeeId, total]) => ({
        id: employeeId,
        name:
          employeeId === 'unassigned'
            ? 'Unassigned'
            : getEmployeeName(
                employeeById[employeeId]
              ),
        total,
      }))
      .sort((a, b) => b.total - a.total)
  }, [
    paidInvoices,
    jobById,
    employeeById,
  ])

  const revenueByJobType = useMemo(() => {
    const totals = {}

    paidInvoices.forEach((invoice) => {
      const job = jobById[invoice.job_id]

      const label =
        invoice.job_type ||
        job?.job_type ||
        job?.type ||
        job?.category ||
        'Unspecified'

      totals[label] =
        (totals[label] || 0) +
        (getInvoicePaid(invoice) ||
          getInvoiceTotal(invoice))
    })

    return Object.entries(totals)
      .map(([label, value]) => ({
        label,
        value,
      }))
      .sort((a, b) => b.value - a.value)
  }, [paidInvoices, jobById])

  const searchValue = normalize(search)

  const visibleInvoices = useMemo(() => {
    let rows = openInvoices.filter((invoice) => {
      if (
        statusFilter === 'overdue' &&
        !overdueInvoices.some(
          (item) => item.id === invoice.id
        )
      ) {
        return false
      }

      if (
        statusFilter === 'current' &&
        overdueInvoices.some(
          (item) => item.id === invoice.id
        )
      ) {
        return false
      }

      if (searchValue) {
        const customer = getCustomerName(
          customerById[invoice.customer_id]
        )

        const searchable = [
          invoice.invoice_number,
          invoice.number,
          invoice.id,
          customer,
          invoice.status,
          invoice.notes,
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
      } else if (sortBy === 'balance') {
        left = getInvoiceBalance(a)
        right = getInvoiceBalance(b)
      } else if (sortBy === 'invoice') {
        left =
          a.invoice_number ||
          a.number ||
          a.id
        right =
          b.invoice_number ||
          b.number ||
          b.id
      } else {
        left = new Date(
          a.due_date ||
            a.created_at ||
            0
        ).getTime()

        right = new Date(
          b.due_date ||
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
    openInvoices,
    overdueInvoices,
    searchValue,
    statusFilter,
    sortBy,
    sortDirection,
    customerById,
  ])

  function exportFinancialReport() {
    const stamp = new Date()
      .toISOString()
      .slice(0, 10)

    downloadCsv(
      `gbl-financial-report-${stamp}.csv`,
      [
        ['GBL OS Financial Report'],
        [
          'Generated',
          new Date().toLocaleString('en-US'),
        ],
        [],
        ['Key Metric', 'Value'],
        ['Revenue', totalRevenue],
        ['Invoiced Amount', invoicedAmount],
        [
          'Outstanding Balance',
          outstandingBalance,
        ],
        ['Overdue Balance', overdueBalance],
        ['Average Invoice', averageInvoice],
        ['Collection Rate', collectionRate],
        [
          'Estimate Acceptance Rate',
          estimateAcceptanceRate,
        ],
        [
          'Accepted Estimate Value',
          acceptedEstimateValue,
        ],
        [
          'Pending Estimate Value',
          pendingEstimateValue,
        ],
        [],
        ['Invoice Aging', 'Amount'],
        ...invoiceAging.map((item) => [
          item.label,
          item.value,
        ]),
        [],
        ['Month', 'Revenue'],
        ...revenueByMonth.map((item) => [
          item.label,
          item.value,
        ]),
        [],
        ['Customer', 'Revenue'],
        ...revenueByCustomer.map(
          (customer) => [
            customer.name,
            customer.total,
          ]
        ),
        [],
        ['Technician', 'Revenue'],
        ...revenueByTechnician.map(
          (technician) => [
            technician.name,
            technician.total,
          ]
        ),
        [],
        ['Job Type', 'Revenue'],
        ...revenueByJobType.map((item) => [
          item.label,
          item.value,
        ]),
        [],
        [
          'Open Invoice',
          'Customer',
          'Due Date',
          'Balance',
          'Status',
        ],
        ...visibleInvoices.map((invoice) => [
          invoice.invoice_number ||
            invoice.number ||
            invoice.id,
          getCustomerName(
            customerById[invoice.customer_id]
          ),
          invoice.due_date || '',
          getInvoiceBalance(invoice),
          invoice.status || 'Open',
        ]),
      ]
    )
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Financial Reports</h2>
        <p>Loading financial data...</p>
      </section>
    )
  }

  return (
    <div className="financial-reports">
      <div className="toolbar">
        <div>
          <h1 style={{ margin: 0 }}>
            Financial Reports
          </h1>

          <div
            className="small"
            style={{ marginTop: 6 }}
          >
            Revenue, receivables, estimates,
            customer value, and collections
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
            onClick={exportFinancialReport}
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
          label="Revenue"
          value={formatCurrency(totalRevenue)}
          help="Paid invoice or payment revenue in the selected period"
        />
        <Metric
          label="Invoiced"
          value={formatCurrency(invoicedAmount)}
          help="Total invoice value in the selected period"
        />
        <Metric
          label="Outstanding"
          value={formatCurrency(
            outstandingBalance
          )}
          help="Open accounts receivable"
        />
        <Metric
          label="Overdue"
          value={formatCurrency(
            overdueBalance
          )}
          help="Balance past the invoice due date"
        />
      </div>

      <div className="metrics">
        <Metric
          label="Average Invoice"
          value={formatCurrency(
            averageInvoice
          )}
        />
        <Metric
          label="Collection Rate"
          value={formatPercent(
            collectionRate
          )}
        />
        <Metric
          label="Estimate Acceptance"
          value={formatPercent(
            estimateAcceptanceRate
          )}
        />
        <Metric
          label="Pending Estimate Value"
          value={formatCurrency(
            pendingEstimateValue
          )}
        />
      </div>

      <div className="grid-2">
        <BarPanel
          title="Revenue by Month"
          items={revenueByMonth}
          formatter={formatCurrency}
        />

        <BarPanel
          title="Invoice Aging"
          items={invoiceAging}
          formatter={formatCurrency}
        />
      </div>

      <div className="grid-2">
        <BarPanel
          title="Revenue by Customer"
          items={revenueByCustomer
            .slice(0, 10)
            .map((customer) => ({
              label: customer.name,
              value: customer.total,
            }))}
          formatter={formatCurrency}
        />

        <BarPanel
          title="Revenue by Technician"
          items={revenueByTechnician
            .slice(0, 10)
            .map((technician) => ({
              label: technician.name,
              value: technician.total,
            }))}
          formatter={formatCurrency}
        />
      </div>

      <div className="grid-2">
        <BarPanel
          title="Revenue by Job Type"
          items={revenueByJobType}
          formatter={formatCurrency}
        />

        <section className="panel">
          <h2>Estimate Pipeline</h2>

          <div className="metrics">
            <Metric
              label="Accepted"
              value={formatNumber(
                acceptedEstimates.length
              )}
            />
            <Metric
              label="Pending"
              value={formatNumber(
                pendingEstimates.length
              )}
            />
            <Metric
              label="Rejected"
              value={formatNumber(
                rejectedEstimates.length
              )}
            />
          </div>

          <DataTable
            headers={[
              'Status',
              'Count',
              'Value',
            ]}
            rows={[
              [
                'Accepted',
                acceptedEstimates.length,
                formatCurrency(
                  acceptedEstimateValue
                ),
              ],
              [
                'Pending',
                pendingEstimates.length,
                formatCurrency(
                  pendingEstimateValue
                ),
              ],
              [
                'Rejected',
                rejectedEstimates.length,
                formatCurrency(
                  rejectedEstimates.reduce(
                    (total, estimate) =>
                      total +
                      getEstimateTotal(
                        estimate
                      ),
                    0
                  )
                ),
              ],
            ]}
            emptyMessage="No estimate data is available."
          />
        </section>
      </div>

      <section className="panel">
        <div className="between">
          <div>
            <h2 style={{ marginBottom: 4 }}>
              Accounts Receivable
            </h2>
            <div className="small">
              Open and overdue customer invoices
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
                  All Open
                </option>
                <option value="current">
                  Current
                </option>
                <option value="overdue">
                  Overdue
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
                <option value="dueDate">
                  Due Date
                </option>
                <option value="customer">
                  Customer
                </option>
                <option value="balance">
                  Balance
                </option>
                <option value="invoice">
                  Invoice
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

            <label style={{ minWidth: 220 }}>
              <span className="small">
                Search
              </span>

              <input
                type="search"
                value={search}
                placeholder="Invoice or customer..."
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
            'Invoice',
            'Customer',
            'Issued',
            'Due',
            'Total',
            'Paid',
            'Balance',
            'Status',
          ]}
          rows={visibleInvoices.map(
            (invoice) => [
              invoice.invoice_number ||
                invoice.number ||
                invoice.id,
              getCustomerName(
                customerById[
                  invoice.customer_id
                ]
              ),
              formatDate(
                invoice.issue_date ||
                  invoice.invoice_date ||
                  invoice.created_at
              ),
              formatDate(invoice.due_date),
              formatCurrency(
                getInvoiceTotal(invoice)
              ),
              formatCurrency(
                getInvoicePaid(invoice)
              ),
              formatCurrency(
                getInvoiceBalance(invoice)
              ),
              invoice.status || 'Open',
            ]
          )}
          emptyMessage="No invoices match the current filters."
        />
      </section>

      <section className="panel">
        <h2>Recent Payments</h2>

        <DataTable
          headers={[
            'Date',
            'Customer',
            'Invoice',
            'Method',
            'Amount',
            'Reference',
          ]}
          rows={filteredPayments
            .slice(0, 50)
            .map((payment) => [
              formatDateTime(
                payment.payment_date ||
                  payment.paid_at ||
                  payment.created_at
              ),
              getCustomerName(
                customerById[
                  payment.customer_id
                ]
              ),
              payment.invoice_number ||
                payment.invoice_id ||
                '—',
              payment.payment_method ||
                payment.method ||
                '—',
              formatCurrency(
                getPaymentAmount(payment)
              ),
              payment.reference_number ||
                payment.transaction_id ||
                payment.reference ||
                '—',
            ])}
          emptyMessage="No payments were recorded in this period."
        />
      </section>
    </div>
  )
}

function Metric({
  label,
  value,
  help,
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>

      {help && (
        <small
          style={{
            display: 'block',
            marginTop: 6,
            opacity: 0.7,
          }}
        >
          {help}
        </small>
      )}
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
