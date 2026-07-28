import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  buildAgingSummary,
  calculateInvoiceTotals,
  customerName,
  deriveInvoiceStatus,
  formatCurrency,
  formatDate,
  getDaysPastDue,
  safeSelect,
} from './invoiceUtils'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const STATUS_FILTERS = [
  'All',
  'Draft',
  'Sent',
  'Viewed',
  'Partial',
  'Paid',
  'Overdue',
  'Void',
]

const DATE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Dates' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
]

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'due_soonest', label: 'Due Date: Soonest' },
  { value: 'due_latest', label: 'Due Date: Latest' },
  { value: 'total_high', label: 'Total: High to Low' },
  { value: 'total_low', label: 'Total: Low to High' },
  { value: 'balance_high', label: 'Balance: High to Low' },
  { value: 'customer_az', label: 'Customer: A–Z' },
]

function startOfDay(date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function endOfDay(date) {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

function startOfWeek(date) {
  const result = startOfDay(date)
  const day = result.getDay()
  const difference = day === 0 ? 6 : day - 1
  result.setDate(result.getDate() - difference)
  return result
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfQuarter(date) {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3
  return new Date(date.getFullYear(), quarterStartMonth, 1)
}

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1)
}

function parseInvoiceDate(value) {
  if (!value) return null

  const text = String(value)
  const date = new Date(text.length === 10 ? `${text}T12:00:00` : text)

  return Number.isNaN(date.getTime()) ? null : date
}

function isWithinDateFilter(value, filter) {
  if (filter === 'all') return true

  const invoiceDate = parseInvoiceDate(value)
  if (!invoiceDate) return false

  const now = new Date()
  const maximum = endOfDay(now)

  let minimum = null

  if (filter === 'today') minimum = startOfDay(now)
  if (filter === 'week') minimum = startOfWeek(now)
  if (filter === 'month') minimum = startOfMonth(now)
  if (filter === 'quarter') minimum = startOfQuarter(now)
  if (filter === 'year') minimum = startOfYear(now)

  if (!minimum) return true

  return (
    invoiceDate.getTime() >= minimum.getTime() &&
    invoiceDate.getTime() <= maximum.getTime()
  )
}

function normalizeSearchValue(value) {
  return String(value || '').trim().toLowerCase()
}

function statusClassName(status) {
  const normalized = normalizeSearchValue(status)

  if (normalized === 'paid') return 'invoice-status invoice-status--paid'
  if (normalized === 'partial') return 'invoice-status invoice-status--partial'
  if (normalized === 'overdue') return 'invoice-status invoice-status--overdue'
  if (normalized === 'void') return 'invoice-status invoice-status--void'
  if (normalized === 'sent') return 'invoice-status invoice-status--sent'
  if (normalized === 'viewed') return 'invoice-status invoice-status--viewed'

  return 'invoice-status invoice-status--draft'
}

function compareNullableDates(
  firstValue,
  secondValue,
  direction = 'ascending'
) {
  const firstDate = parseInvoiceDate(firstValue)
  const secondDate = parseInvoiceDate(secondValue)

  if (!firstDate && !secondDate) return 0
  if (!firstDate) return 1
  if (!secondDate) return -1

  const difference = firstDate.getTime() - secondDate.getTime()

  return direction === 'descending' ? difference * -1 : difference
}

function escapeCsv(value) {
  const text = String(value ?? '')

  if (
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r')
  ) {
    return `"${text.replaceAll('"', '""')}"`
  }

  return text
}

function jobLabel(job) {
  return (
    job?.job_number ||
    job?.title ||
    job?.name ||
    'Job'
  )
}

export default function InvoiceDashboard({
  supabase,
  onCreateInvoice,
  onOpenInvoice,
  onEditInvoice,
  onRecordPayment,
  onDeleteInvoice,
  refreshToken = 0,
}) {
  const [invoices, setInvoices] = useState([])
  const [lineItems, setLineItems] = useState([])
  const [payments, setPayments] = useState([])
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [customerFilter, setCustomerFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const loadDashboardData = useCallback(
    async ({ background = false } = {}) => {
      if (!supabase) {
        setError('Supabase is not available for the invoice dashboard.')
        setLoading(false)
        return
      }

      if (background) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')

      try {
        const [
          invoiceResult,
          lineItemResult,
          paymentResult,
          customerResult,
          jobResult,
        ] = await Promise.all([
          safeSelect(supabase, 'invoices', 'created_at', false),
          safeSelect(supabase, 'invoice_line_items', 'sort_order', true),
          safeSelect(supabase, 'invoice_payments', 'payment_date', false),
          safeSelect(supabase, 'customers', 'created_at', false),
          safeSelect(supabase, 'jobs', 'created_at', false),
        ])

        const firstError =
          invoiceResult.error ||
          lineItemResult.error ||
          paymentResult.error ||
          customerResult.error ||
          jobResult.error

        if (firstError) throw firstError

        setInvoices(invoiceResult.data)
        setLineItems(lineItemResult.data)
        setPayments(paymentResult.data)
        setCustomers(customerResult.data)
        setJobs(jobResult.data)
      } catch (loadError) {
        console.error('Unable to load invoice dashboard:', loadError)

        setError(
          loadError?.message ||
            'Unable to load invoice information.'
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [supabase]
  )

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData, refreshToken])

  const customerById = useMemo(
    () =>
      new Map(
        customers.map((customer) => [
          customer.id,
          customer,
        ])
      ),
    [customers]
  )

  const jobById = useMemo(
    () =>
      new Map(
        jobs.map((job) => [
          job.id,
          job,
        ])
      ),
    [jobs]
  )

  const lineItemsByInvoiceId = useMemo(() => {
    const map = new Map()

    lineItems.forEach((item) => {
      const current = map.get(item.invoice_id) || []
      current.push(item)
      map.set(item.invoice_id, current)
    })

    return map
  }, [lineItems])

  const paymentsByInvoiceId = useMemo(() => {
    const map = new Map()

    payments.forEach((payment) => {
      const current = map.get(payment.invoice_id) || []
      current.push(payment)
      map.set(payment.invoice_id, current)
    })

    return map
  }, [payments])

  const invoiceRows = useMemo(
    () =>
      invoices.map((invoice) => {
        const invoiceLineItems =
          lineItemsByInvoiceId.get(invoice.id) || []

        const invoicePayments =
          paymentsByInvoiceId.get(invoice.id) || []

        const totals = calculateInvoiceTotals(
          invoice,
          invoiceLineItems,
          invoicePayments
        )

        const status = deriveInvoiceStatus(invoice, totals)
        const customer = customerById.get(invoice.customer_id)
        const job = jobById.get(invoice.job_id)

        return {
          invoice,
          customer,
          job,
          lineItems: invoiceLineItems,
          payments: invoicePayments,
          totals,
          status,
          daysPastDue: getDaysPastDue(invoice),
          customerLabel: customerName(customer),
        }
      }),
    [
      invoices,
      lineItemsByInvoiceId,
      paymentsByInvoiceId,
      customerById,
      jobById,
    ]
  )

  const filteredRows = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(search)

    const results = invoiceRows.filter((row) => {
      const { invoice, customer, job, status } = row

      const matchesStatus =
        statusFilter === 'All' ||
        status === statusFilter

      const matchesCustomer =
        customerFilter === 'all' ||
        invoice.customer_id === customerFilter

      const matchesDate = isWithinDateFilter(
        invoice.issue_date || invoice.created_at,
        dateFilter
      )

      const searchableText = [
        invoice.invoice_number,
        invoice.title,
        invoice.notes,
        invoice.internal_notes,
        customerName(customer),
        customer?.email,
        customer?.phone,
        customer?.company_name,
        job?.job_number,
        job?.title,
        job?.name,
        job?.service_address,
        status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesSearch =
        !normalizedSearch ||
        searchableText.includes(normalizedSearch)

      return (
        matchesStatus &&
        matchesCustomer &&
        matchesDate &&
        matchesSearch
      )
    })

    return [...results].sort((first, second) => {
      if (sortBy === 'oldest') {
        return compareNullableDates(
          first.invoice.issue_date || first.invoice.created_at,
          second.invoice.issue_date || second.invoice.created_at,
          'ascending'
        )
      }

      if (sortBy === 'due_soonest') {
        return compareNullableDates(
          first.invoice.due_date,
          second.invoice.due_date,
          'ascending'
        )
      }

      if (sortBy === 'due_latest') {
        return compareNullableDates(
          first.invoice.due_date,
          second.invoice.due_date,
          'descending'
        )
      }

      if (sortBy === 'total_high') {
        return second.totals.invoiceTotal - first.totals.invoiceTotal
      }

      if (sortBy === 'total_low') {
        return first.totals.invoiceTotal - second.totals.invoiceTotal
      }

      if (sortBy === 'balance_high') {
        return second.totals.balanceDue - first.totals.balanceDue
      }

      if (sortBy === 'customer_az') {
        return first.customerLabel.localeCompare(second.customerLabel)
      }

      return compareNullableDates(
        first.invoice.issue_date || first.invoice.created_at,
        second.invoice.issue_date || second.invoice.created_at,
        'descending'
      )
    })
  }, [
    invoiceRows,
    search,
    statusFilter,
    customerFilter,
    dateFilter,
    sortBy,
  ])

  useEffect(() => {
    setPage(1)
  }, [
    search,
    statusFilter,
    customerFilter,
    dateFilter,
    sortBy,
    pageSize,
  ])

  const totalPages = Math.max(
    1,
    Math.ceil(filteredRows.length / pageSize)
  )

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const paginatedRows = useMemo(() => {
    const startIndex = (page - 1) * pageSize

    return filteredRows.slice(
      startIndex,
      startIndex + pageSize
    )
  }, [filteredRows, page, pageSize])

  const dashboardTotals = useMemo(
    () =>
      invoiceRows.reduce(
        (summary, row) => {
          const { invoice, totals, status } = row

          summary.invoiced += totals.invoiceTotal
          summary.collected += totals.creditsTotal

          if (status !== 'Paid' && status !== 'Void') {
            summary.outstanding += totals.balanceDue
          }

          if (status === 'Overdue') {
            summary.overdue += totals.balanceDue
            summary.overdueCount += 1
          }

          if (
            isWithinDateFilter(
              invoice.issue_date || invoice.created_at,
              'month'
            )
          ) {
            summary.thisMonth += totals.invoiceTotal
          }

          if (
            isWithinDateFilter(
              invoice.issue_date || invoice.created_at,
              'today'
            )
          ) {
            summary.today += totals.invoiceTotal
          }

          return summary
        },
        {
          invoiced: 0,
          collected: 0,
          outstanding: 0,
          overdue: 0,
          overdueCount: 0,
          thisMonth: 0,
          today: 0,
        }
      ),
    [invoiceRows]
  )

  const agingSummary = useMemo(
    () =>
      buildAgingSummary(
        invoices,
        lineItems,
        payments
      ),
    [invoices, lineItems, payments]
  )

  const customerOptions = useMemo(
    () =>
      [...customers].sort((a, b) =>
        customerName(a).localeCompare(customerName(b))
      ),
    [customers]
  )

  const allVisibleSelected =
    paginatedRows.length > 0 &&
    paginatedRows.every((row) =>
      selectedInvoiceIds.includes(row.invoice.id)
    )

  function toggleVisibleInvoices() {
    if (allVisibleSelected) {
      setSelectedInvoiceIds((current) =>
        current.filter(
          (id) =>
            !paginatedRows.some(
              (row) => row.invoice.id === id
            )
        )
      )
      return
    }

    const ids = paginatedRows.map((row) => row.invoice.id)

    setSelectedInvoiceIds((current) => [
      ...new Set([...current, ...ids]),
    ])
  }

  function toggleInvoice(id) {
    setSelectedInvoiceIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    )
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('All')
    setCustomerFilter('all')
    setDateFilter('all')
    setSortBy('newest')
  }

  function exportRows(rows, filename) {
    const csvRows = [
      [
        'Invoice',
        'Customer',
        'Job',
        'Status',
        'Issue Date',
        'Due Date',
        'Total',
        'Paid/Credits',
        'Balance',
      ],
      ...rows.map((row) => [
        row.invoice.invoice_number || '',
        row.customerLabel,
        jobLabel(row.job),
        row.status,
        row.invoice.issue_date || '',
        row.invoice.due_date || '',
        row.totals.invoiceTotal,
        row.totals.creditsTotal,
        row.totals.balanceDue,
      ]),
    ]

    const csv = csvRows
      .map((row) => row.map(escapeCsv).join(','))
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
    link.remove()

    URL.revokeObjectURL(url)
  }

  function exportSelected() {
    const selectedRows = invoiceRows.filter((row) =>
      selectedInvoiceIds.includes(row.invoice.id)
    )

    if (selectedRows.length === 0) return

    exportRows(selectedRows, 'selected-invoices.csv')
  }

  function exportFiltered() {
    if (filteredRows.length === 0) return
    exportRows(filteredRows, 'invoices.csv')
  }

  if (loading) {
    return (
      <div className="invoice-dashboard-loading">
        Loading invoice dashboard...
      </div>
    )
  }

  return (
    <div className="invoice-dashboard">
      {error && (
        <div className="invoice-error-banner" role="alert">
          <span>{error}</span>

          <button
            type="button"
            onClick={() => loadDashboardData()}
          >
            Try Again
          </button>
        </div>
      )}

      <header className="invoice-dashboard-header">
        <div>
          <h2>Invoices</h2>

          <p>
            Manage invoices, payments, balances, and
            accounts receivable.
          </p>
        </div>

        <div className="invoice-header-actions">
          <button
            type="button"
            disabled={refreshing}
            onClick={() =>
              loadDashboardData({
                background: true,
              })
            }
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={() => onCreateInvoice?.()}
          >
            + New Invoice
          </button>
        </div>
      </header>

      <section
        className="invoice-kpi-grid"
        aria-label="Invoice summary"
      >
        <article className="invoice-kpi-card">
          <small>Today's Invoices</small>

          <strong>
            {formatCurrency(dashboardTotals.today)}
          </strong>
        </article>

        <article className="invoice-kpi-card">
          <small>This Month</small>

          <strong>
            {formatCurrency(dashboardTotals.thisMonth)}
          </strong>
        </article>

        <article className="invoice-kpi-card">
          <small>Outstanding</small>

          <strong>
            {formatCurrency(dashboardTotals.outstanding)}
          </strong>
        </article>

        <article className="invoice-kpi-card">
          <small>Overdue</small>

          <strong>
            {formatCurrency(dashboardTotals.overdue)}
          </strong>

          <span>
            {dashboardTotals.overdueCount}{' '}
            {dashboardTotals.overdueCount === 1
              ? 'invoice'
              : 'invoices'}
          </span>
        </article>
      </section>

      <section
        className="invoice-aging-grid"
        aria-label="Accounts receivable aging"
      >
        {Object.entries(agingSummary).map(([label, value]) => (
          <article
            key={label}
            className="invoice-aging-card"
          >
            <small>{label}</small>

            <strong>{formatCurrency(value)}</strong>
          </article>
        ))}
      </section>

      <section
        className="invoice-filter-bar"
        aria-label="Invoice filters"
      >
        <input
          type="search"
          placeholder="Search invoices..."
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
        />

        <select
          value={statusFilter}
          aria-label="Filter by status"
          onChange={(event) =>
            setStatusFilter(event.target.value)
          }
        >
          {STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>

        <select
          value={customerFilter}
          aria-label="Filter by customer"
          onChange={(event) =>
            setCustomerFilter(event.target.value)
          }
        >
          <option value="all">All Customers</option>

          {customerOptions.map((customer) => (
            <option
              key={customer.id}
              value={customer.id}
            >
              {customerName(customer)}
            </option>
          ))}
        </select>

        <select
          value={dateFilter}
          aria-label="Filter by date"
          onChange={(event) =>
            setDateFilter(event.target.value)
          }
        >
          {DATE_FILTER_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          aria-label="Sort invoices"
          onChange={(event) =>
            setSortBy(event.target.value)
          }
        >
          {SORT_OPTIONS.map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={clearFilters}
        >
          Clear
        </button>
      </section>

      <section className="invoice-table-panel">
        <div className="invoice-table-toolbar">
          <div>
            <strong>
              {filteredRows.length}{' '}
              {filteredRows.length === 1
                ? 'invoice'
                : 'invoices'}
            </strong>

            {selectedInvoiceIds.length > 0 && (
              <span>
                {' '}
                · {selectedInvoiceIds.length} selected
              </span>
            )}
          </div>

          <div className="invoice-table-toolbar-actions">
            <button
              type="button"
              disabled={filteredRows.length === 0}
              onClick={exportFiltered}
            >
              Export CSV
            </button>

            {selectedInvoiceIds.length > 0 && (
              <button
                type="button"
                onClick={exportSelected}
              >
                Export Selected
              </button>
            )}

            <label>
              Rows

              <select
                value={pageSize}
                onChange={(event) =>
                  setPageSize(Number(event.target.value))
                }
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option
                    key={option}
                    value={option}
                  >
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="invoice-table-scroll">
          <table className="invoice-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleVisibleInvoices}
                    aria-label="Select visible invoices"
                  />
                </th>

                <th>Invoice</th>
                <th>Customer</th>
                <th>Job</th>
                <th>Status</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {paginatedRows.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="invoice-empty-state"
                  >
                    <strong>No invoices found</strong>

                    <p>
                      Change the filters or create a new invoice.
                    </p>

                    <button
                      type="button"
                      onClick={() => onCreateInvoice?.()}
                    >
                      + New Invoice
                    </button>
                  </td>
                </tr>
              )}

              {paginatedRows.map((row) => {
                const {
                  invoice,
                  customer,
                  job,
                  totals,
                  status,
                  daysPastDue,
                } = row

                const selected =
                  selectedInvoiceIds.includes(invoice.id)

                return (
                  <tr
                    key={invoice.id}
                    className={
                      selected
                        ? 'invoice-table-row invoice-table-row--selected'
                        : 'invoice-table-row'
                    }
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          toggleInvoice(invoice.id)
                        }
                        aria-label={`Select ${
                          invoice.invoice_number || 'invoice'
                        }`}
                      />
                    </td>

                    <td>
                      <button
                        type="button"
                        className="invoice-number-button"
                        onClick={() =>
                          onOpenInvoice?.(invoice.id)
                        }
                      >
                        {invoice.invoice_number || 'Unnumbered'}
                      </button>

                      {invoice.title && (
                        <small className="invoice-title">
                          {invoice.title}
                        </small>
                      )}
                    </td>

                    <td>
                      <strong>
                        {customerName(customer)}
                      </strong>

                      {customer?.email && (
                        <small>{customer.email}</small>
                      )}

                      {!customer?.email && customer?.phone && (
                        <small>{customer.phone}</small>
                      )}
                    </td>

                    <td>
                      {job ? (
                        <>
                          <strong>{jobLabel(job)}</strong>

                          {job.service_address && (
                            <small>
                              {job.service_address}
                            </small>
                          )}
                        </>
                      ) : (
                        <span className="invoice-muted">—</span>
                      )}
                    </td>

                    <td>
                      <span className={statusClassName(status)}>
                        {status}
                      </span>

                      {status === 'Overdue' &&
                        daysPastDue > 0 && (
                          <small className="invoice-overdue-days">
                            {daysPastDue}{' '}
                            {daysPastDue === 1
                              ? 'day late'
                              : 'days late'}
                          </small>
                        )}
                    </td>

                    <td>{formatDate(invoice.issue_date)}</td>
                    <td>{formatDate(invoice.due_date)}</td>

                    <td>
                      <strong>
                        {formatCurrency(totals.invoiceTotal)}
                      </strong>
                    </td>

                    <td>
                      {formatCurrency(totals.creditsTotal)}
                    </td>

                    <td>
                      <strong
                        className={
                          totals.balanceDue > 0
                            ? 'invoice-balance-due'
                            : 'invoice-balance-paid'
                        }
                      >
                        {formatCurrency(totals.balanceDue)}
                      </strong>

                      {totals.overpayment > 0 && (
                        <small>
                          Credit:{' '}
                          {formatCurrency(totals.overpayment)}
                        </small>
                      )}
                    </td>

                    <td>
                      <div className="invoice-row-actions">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenInvoice?.(invoice.id)
                          }
                        >
                          View
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            onEditInvoice?.(invoice.id)
                          }
                        >
                          Edit
                        </button>

                        {status !== 'Paid' &&
                          status !== 'Void' && (
                            <button
                              type="button"
                              onClick={() =>
                                onRecordPayment?.(invoice.id)
                              }
                            >
                              Payment
                            </button>
                          )}

                        <button
                          type="button"
                          className="invoice-delete-button"
                          onClick={() =>
                            onDeleteInvoice?.(invoice)
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="invoice-pagination">
          <div>
            Showing{' '}
            {filteredRows.length === 0
              ? 0
              : (page - 1) * pageSize + 1}{' '}
            to{' '}
            {Math.min(
              page * pageSize,
              filteredRows.length
            )}{' '}
            of {filteredRows.length}
          </div>

          <div className="invoice-pagination-controls">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(1)}
            >
              First
            </button>

            <button
              type="button"
              disabled={page <= 1}
              onClick={() =>
                setPage((current) =>
                  Math.max(1, current - 1)
                )
              }
            >
              Previous
            </button>

            <span>
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() =>
                setPage((current) =>
                  Math.min(totalPages, current + 1)
                )
              }
            >
              Next
            </button>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
            >
              Last
            </button>
          </div>
        </div>
      </section>

      <footer className="invoice-dashboard-footer">
        <div className="invoice-footer-summary">
          <strong>
            Total Invoiced:{' '}
            {formatCurrency(dashboardTotals.invoiced)}
          </strong>

          <span>
            Collected:{' '}
            {formatCurrency(dashboardTotals.collected)}
          </span>

          <span>
            Outstanding:{' '}
            {formatCurrency(dashboardTotals.outstanding)}
          </span>
        </div>

        <div className="invoice-footer-actions">
          {selectedInvoiceIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedInvoiceIds([])}
            >
              Clear Selection
            </button>
          )}

          <button
            type="button"
            disabled={refreshing}
            onClick={() =>
              loadDashboardData({
                background: true,
              })
            }
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </footer>
    </div>
  )
}