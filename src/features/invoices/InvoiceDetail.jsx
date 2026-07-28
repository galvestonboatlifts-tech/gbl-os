import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  calculateInvoiceTotals,
  customerName,
  deriveInvoiceStatus,
  employeeName,
  formatCurrency,
  formatDate,
  getDaysPastDue,
  invoiceToPlainText,
  safeSelect,
} from './invoiceUtils'

function addressLines(record, prefix) {
  const street = record?.[`${prefix}_address`]
  const city = record?.[`${prefix}_city`]
  const state = record?.[`${prefix}_state`]
  const postal = record?.[`${prefix}_postal_code`]

  const cityLine = [city, state, postal]
    .filter(Boolean)
    .join(', ')
    .replace(', ,', ',')

  return [street, cityLine].filter(Boolean)
}

function jobLabel(job) {
  return (
    job?.job_number ||
    job?.title ||
    job?.name ||
    'Job'
  )
}

function estimateLabel(estimate) {
  return (
    estimate?.estimate_number ||
    estimate?.number ||
    estimate?.title ||
    'Estimate'
  )
}

function statusClassName(status) {
  const value = String(status || '')
    .trim()
    .toLowerCase()

  if (value === 'paid') {
    return 'invoice-status invoice-status--paid'
  }

  if (value === 'partial') {
    return 'invoice-status invoice-status--partial'
  }

  if (value === 'overdue') {
    return 'invoice-status invoice-status--overdue'
  }

  if (value === 'void') {
    return 'invoice-status invoice-status--void'
  }

  if (value === 'sent') {
    return 'invoice-status invoice-status--sent'
  }

  if (value === 'viewed') {
    return 'invoice-status invoice-status--viewed'
  }

  return 'invoice-status invoice-status--draft'
}

function paymentLabel(payment) {
  const parts = [
    payment.method,
    payment.reference_number
      ? `#${payment.reference_number}`
      : '',
  ].filter(Boolean)

  return parts.join(' · ') || 'Payment'
}

function openPrintWindow(html) {
  const printWindow = window.open(
    '',
    '_blank',
    'noopener,noreferrer'
  )

  if (!printWindow) {
    throw new Error(
      'The browser blocked the print window.'
    )
  }

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()

  window.setTimeout(() => {
    printWindow.print()
  }, 250)
}

function printableHtml({
  invoice,
  customer,
  job,
  employee,
  lineItems,
  payments,
  totals,
  status,
}) {
  const billing = addressLines(
    invoice,
    'billing'
  )
    .map((line) => `<div>${line}</div>`)
    .join('')

  const project = addressLines(
    invoice,
    'project'
  )
    .map((line) => `<div>${line}</div>`)
    .join('')

  const rows = lineItems
    .map((item) => {
      const quantity = Number(
        item.quantity || 0
      )
      const unitPrice = Number(
        item.unit_price || 0
      )

      return `
        <tr>
          <td>${item.description || ''}</td>
          <td>${quantity}</td>
          <td>${item.unit || ''}</td>
          <td>${formatCurrency(unitPrice)}</td>
          <td>${item.taxable === false ? 'No' : 'Yes'}</td>
          <td>${formatCurrency(quantity * unitPrice)}</td>
        </tr>
      `
    })
    .join('')

  const paymentRows = payments
    .map(
      (payment) => `
        <tr>
          <td>${formatDate(payment.payment_date)}</td>
          <td>${payment.method || ''}</td>
          <td>${payment.reference_number || ''}</td>
          <td>${formatCurrency(payment.amount)}</td>
        </tr>
      `
    )
    .join('')

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${invoice.invoice_number || 'Invoice'}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #111;
            margin: 40px;
            line-height: 1.4;
          }

          h1, h2, h3, p {
            margin-top: 0;
          }

          .top {
            display: flex;
            justify-content: space-between;
            gap: 32px;
            margin-bottom: 28px;
          }

          .company h1 {
            margin-bottom: 4px;
          }

          .meta {
            min-width: 260px;
          }

          .meta-row,
          .total-row {
            display: flex;
            justify-content: space-between;
            gap: 20px;
            padding: 4px 0;
          }

          .addresses {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 28px;
            margin: 24px 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin: 18px 0;
          }

          th,
          td {
            padding: 9px;
            border-bottom: 1px solid #ddd;
            text-align: left;
            vertical-align: top;
          }

          th {
            background: #f3f4f6;
          }

          .totals {
            margin-left: auto;
            width: 360px;
          }

          .grand {
            border-top: 2px solid #111;
            margin-top: 6px;
            padding-top: 8px;
            font-size: 1.15rem;
            font-weight: 700;
          }

          .balance {
            font-size: 1.2rem;
            font-weight: 700;
          }

          .notes {
            margin-top: 28px;
          }

          .muted {
            color: #555;
          }

          @media print {
            body {
              margin: 20px;
            }

            .no-print {
              display: none;
            }
          }
        </style>
      </head>

      <body>
        <div class="top">
          <div class="company">
            <h1>Galveston Boat Lifts</h1>
            <p class="muted">Invoice</p>
          </div>

          <div class="meta">
            <div class="meta-row">
              <strong>Invoice</strong>
              <span>${invoice.invoice_number || '—'}</span>
            </div>

            <div class="meta-row">
              <strong>Status</strong>
              <span>${status}</span>
            </div>

            <div class="meta-row">
              <strong>Issued</strong>
              <span>${formatDate(invoice.issue_date)}</span>
            </div>

            <div class="meta-row">
              <strong>Due</strong>
              <span>${formatDate(invoice.due_date)}</span>
            </div>

            ${
              employee
                ? `
                  <div class="meta-row">
                    <strong>Salesperson</strong>
                    <span>${employeeName(employee)}</span>
                  </div>
                `
                : ''
            }
          </div>
        </div>

        <div class="addresses">
          <div>
            <h3>Bill To</h3>
            <strong>${customerName(customer)}</strong>
            ${billing}
            ${
              customer?.email
                ? `<div>${customer.email}</div>`
                : ''
            }
            ${
              customer?.phone
                ? `<div>${customer.phone}</div>`
                : ''
            }
          </div>

          <div>
            <h3>Project</h3>
            ${
              job
                ? `<strong>${jobLabel(job)}</strong>`
                : ''
            }
            ${project}
          </div>
        </div>

        ${
          invoice.title
            ? `<h2>${invoice.title}</h2>`
            : ''
        }

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Unit Price</th>
              <th>Taxable</th>
              <th>Amount</th>
            </tr>
          </thead>

          <tbody>
            ${rows}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span>Subtotal</span>
            <strong>${formatCurrency(totals.subtotal)}</strong>
          </div>

          <div class="total-row">
            <span>Discount</span>
            <strong>-${formatCurrency(totals.discount)}</strong>
          </div>

          <div class="total-row">
            <span>Tax</span>
            <strong>${formatCurrency(totals.tax)}</strong>
          </div>

          <div class="total-row">
            <span>Late Fee</span>
            <strong>${formatCurrency(totals.lateFee)}</strong>
          </div>

          <div class="total-row grand">
            <span>Invoice Total</span>
            <strong>${formatCurrency(totals.invoiceTotal)}</strong>
          </div>

          <div class="total-row">
            <span>Payments/Credits</span>
            <strong>-${formatCurrency(totals.creditsTotal)}</strong>
          </div>

          <div class="total-row balance">
            <span>Balance Due</span>
            <strong>${formatCurrency(totals.balanceDue)}</strong>
          </div>
        </div>

        ${
          invoice.notes
            ? `
              <div class="notes">
                <h3>Notes</h3>
                <p>${invoice.notes}</p>
              </div>
            `
            : ''
        }

        ${
          invoice.terms
            ? `
              <div class="notes">
                <h3>Terms</h3>
                <p>${invoice.terms}</p>
              </div>
            `
            : ''
        }

        ${
          payments.length > 0
            ? `
              <div class="notes">
                <h3>Payment History</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${paymentRows}
                  </tbody>
                </table>
              </div>
            `
            : ''
        }

        ${
          invoice.footer_message
            ? `<p class="notes">${invoice.footer_message}</p>`
            : ''
        }
      </body>
    </html>
  `
}

export default function InvoiceDetail({
  supabase,
  invoiceId,
  onBack,
  onEdit,
  onRecordPayment,
  onDuplicate,
  onDelete,
  onOpenCustomer,
  onOpenJob,
  onOpenEstimate,
  refreshToken = 0,
}) {
  const [invoice, setInvoice] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [payments, setPayments] = useState([])

  const [customers, setCustomers] = useState([])
  const [jobs, setJobs] = useState([])
  const [estimates, setEstimates] = useState([])
  const [employees, setEmployees] = useState([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadInvoice = useCallback(
    async ({ background = false } = {}) => {
      if (!supabase || !invoiceId) {
        setError(
          'An invoice ID and Supabase connection are required.'
        )
        setLoading(false)
        return
      }

      if (background) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')
      setMessage('')

      try {
        const [
          invoiceResult,
          itemResult,
          paymentResult,
          customerResult,
          jobResult,
          estimateResult,
          employeeResult,
        ] = await Promise.all([
          supabase
            .from('invoices')
            .select('*')
            .eq('id', invoiceId)
            .single(),
          supabase
            .from('invoice_line_items')
            .select('*')
            .eq('invoice_id', invoiceId)
            .order('sort_order', {
              ascending: true,
            }),
          supabase
            .from('invoice_payments')
            .select('*')
            .eq('invoice_id', invoiceId)
            .order('payment_date', {
              ascending: false,
            }),
          safeSelect(
            supabase,
            'customers',
            'created_at',
            false
          ),
          safeSelect(
            supabase,
            'jobs',
            'created_at',
            false
          ),
          safeSelect(
            supabase,
            'estimates',
            'created_at',
            false
          ),
          safeSelect(
            supabase,
            'employees',
            'created_at',
            false
          ),
        ])

        if (invoiceResult.error) {
          throw invoiceResult.error
        }

        if (itemResult.error) {
          throw itemResult.error
        }

        if (paymentResult.error) {
          throw paymentResult.error
        }

        const referenceError =
          customerResult.error ||
          jobResult.error ||
          estimateResult.error ||
          employeeResult.error

        if (referenceError) {
          throw referenceError
        }

        setInvoice(invoiceResult.data)
        setLineItems(itemResult.data || [])
        setPayments(paymentResult.data || [])
        setCustomers(customerResult.data)
        setJobs(jobResult.data)
        setEstimates(estimateResult.data)
        setEmployees(employeeResult.data)
      } catch (loadError) {
        console.error(
          'Unable to load invoice detail:',
          loadError
        )

        setError(
          loadError?.message ||
            'Unable to load this invoice.'
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [
      supabase,
      invoiceId,
    ]
  )

  useEffect(() => {
    loadInvoice()
  }, [
    loadInvoice,
    refreshToken,
  ])

  const customer = useMemo(
    () =>
      customers.find(
        (record) =>
          record.id === invoice?.customer_id
      ) || null,
    [
      customers,
      invoice?.customer_id,
    ]
  )

  const job = useMemo(
    () =>
      jobs.find(
        (record) =>
          record.id === invoice?.job_id
      ) || null,
    [
      jobs,
      invoice?.job_id,
    ]
  )

  const estimate = useMemo(
    () =>
      estimates.find(
        (record) =>
          record.id === invoice?.estimate_id
      ) || null,
    [
      estimates,
      invoice?.estimate_id,
    ]
  )

  const salesperson = useMemo(
    () =>
      employees.find(
        (record) =>
          record.id === invoice?.salesperson_id
      ) || null,
    [
      employees,
      invoice?.salesperson_id,
    ]
  )

  const totals = useMemo(
    () =>
      calculateInvoiceTotals(
        invoice || {},
        lineItems,
        payments
      ),
    [
      invoice,
      lineItems,
      payments,
    ]
  )

  const status = useMemo(
    () =>
      invoice
        ? deriveInvoiceStatus(
            invoice,
            totals
          )
        : 'Draft',
    [
      invoice,
      totals,
    ]
  )

  const daysPastDue = useMemo(
    () =>
      invoice
        ? getDaysPastDue(invoice)
        : 0,
    [invoice]
  )

  async function copyInvoiceText() {
    if (!invoice) return

    try {
      await navigator.clipboard.writeText(
        invoiceToPlainText(
          invoice,
          customer,
          lineItems,
          payments
        )
      )

      setMessage(
        'Invoice summary copied.'
      )
    } catch (copyError) {
      console.error(
        'Unable to copy invoice:',
        copyError
      )

      setError(
        'Unable to copy the invoice summary.'
      )
    }
  }

  function printInvoice() {
    if (!invoice) return

    try {
      openPrintWindow(
        printableHtml({
          invoice,
          customer,
          job,
          employee: salesperson,
          lineItems,
          payments,
          totals,
          status,
        })
      )
    } catch (printError) {
      console.error(
        'Unable to print invoice:',
        printError
      )

      setError(
        printError?.message ||
          'Unable to open the print view.'
      )
    }
  }

  if (loading) {
    return (
      <div className="invoice-detail-loading">
        Loading invoice...
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="invoice-detail-empty">
        <h2>Invoice Not Found</h2>

        <p>
          The requested invoice could not
          be loaded.
        </p>

        <button
          type="button"
          onClick={() => onBack?.()}
        >
          Back to Invoices
        </button>
      </div>
    )
  }

  const billingLines = addressLines(
    invoice,
    'billing'
  )

  const projectLines = addressLines(
    invoice,
    'project'
  )

  return (
    <div className="invoice-detail">
      <header className="invoice-detail-header">
        <div>
          <button
            type="button"
            className="invoice-detail-back-button"
            onClick={() => onBack?.()}
          >
            ← Back to Invoices
          </button>

          <div className="invoice-detail-title-row">
            <div>
              <h2>
                {invoice.invoice_number ||
                  'Invoice'}
              </h2>

              <p>
                {invoice.title ||
                  'Customer invoice'}
              </p>
            </div>

            <div>
              <span
                className={statusClassName(
                  status
                )}
              >
                {status}
              </span>

              {status === 'Overdue' &&
                daysPastDue > 0 && (
                  <small className="invoice-overdue-days">
                    {daysPastDue}{' '}
                    {daysPastDue === 1
                      ? 'day overdue'
                      : 'days overdue'}
                  </small>
                )}
            </div>
          </div>
        </div>

        <div className="invoice-detail-header-actions">
          <button
            type="button"
            disabled={refreshing}
            onClick={() =>
              loadInvoice({
                background: true,
              })
            }
          >
            {refreshing
              ? 'Refreshing...'
              : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={copyInvoiceText}
          >
            Copy Summary
          </button>

          <button
            type="button"
            onClick={printInvoice}
          >
            Print
          </button>

          <button
            type="button"
            onClick={() =>
              onDuplicate?.(
                invoice,
                lineItems
              )
            }
          >
            Duplicate
          </button>

          <button
            type="button"
            onClick={() =>
              onEdit?.(invoice.id)
            }
          >
            Edit
          </button>

          {status !== 'Paid' &&
            status !== 'Void' && (
              <button
                type="button"
                onClick={() =>
                  onRecordPayment?.(
                    invoice.id
                  )
                }
              >
                Record Payment
              </button>
            )}

          <button
            type="button"
            className="invoice-delete-button"
            onClick={() =>
              onDelete?.(invoice)
            }
          >
            Delete
          </button>
        </div>
      </header>

      {error && (
        <div
          className="invoice-error-banner"
          role="alert"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          className="invoice-success-banner"
          role="status"
        >
          {message}
        </div>
      )}

      <section className="invoice-detail-summary-grid">
        <article className="invoice-detail-summary-card">
          <small>Invoice Total</small>

          <strong>
            {formatCurrency(
              totals.invoiceTotal
            )}
          </strong>
        </article>

        <article className="invoice-detail-summary-card">
          <small>Payments & Credits</small>

          <strong>
            {formatCurrency(
              totals.creditsTotal
            )}
          </strong>
        </article>

        <article className="invoice-detail-summary-card">
          <small>Balance Due</small>

          <strong>
            {formatCurrency(
              totals.balanceDue
            )}
          </strong>
        </article>

        <article className="invoice-detail-summary-card">
          <small>Estimated Profit</small>

          <strong>
            {formatCurrency(
              totals.profit
            )}
          </strong>

          <span>
            {totals.margin.toFixed(2)}%
            margin
          </span>
        </article>
      </section>

      <section className="invoice-detail-section">
        <div className="invoice-detail-meta-grid">
          <div>
            <span>Invoice Number</span>

            <strong>
              {invoice.invoice_number ||
                '—'}
            </strong>
          </div>

          <div>
            <span>Issue Date</span>

            <strong>
              {formatDate(
                invoice.issue_date
              )}
            </strong>
          </div>

          <div>
            <span>Due Date</span>

            <strong>
              {formatDate(
                invoice.due_date
              )}
            </strong>
          </div>

          <div>
            <span>Salesperson</span>

            <strong>
              {salesperson
                ? employeeName(
                    salesperson
                  )
                : 'Unassigned'}
            </strong>
          </div>

          <div>
            <span>Linked Estimate</span>

            {estimate ? (
              <button
                type="button"
                className="invoice-link-button"
                onClick={() =>
                  onOpenEstimate?.(
                    estimate.id
                  )
                }
              >
                {estimateLabel(
                  estimate
                )}
              </button>
            ) : (
              <strong>—</strong>
            )}
          </div>

          <div>
            <span>Linked Job</span>

            {job ? (
              <button
                type="button"
                className="invoice-link-button"
                onClick={() =>
                  onOpenJob?.(
                    job.id
                  )
                }
              >
                {jobLabel(job)}
              </button>
            ) : (
              <strong>—</strong>
            )}
          </div>
        </div>
      </section>

      <section className="invoice-detail-section">
        <div className="invoice-detail-address-grid">
          <article>
            <h3>Bill To</h3>

            {customer ? (
              <button
                type="button"
                className="invoice-link-button invoice-customer-link"
                onClick={() =>
                  onOpenCustomer?.(
                    customer.id
                  )
                }
              >
                {customerName(
                  customer
                )}
              </button>
            ) : (
              <strong>
                Unknown Customer
              </strong>
            )}

            {billingLines.map(
              (line) => (
                <div key={line}>
                  {line}
                </div>
              )
            )}

            {customer?.email && (
              <div>
                <a
                  href={`mailto:${customer.email}`}
                >
                  {customer.email}
                </a>
              </div>
            )}

            {customer?.phone && (
              <div>
                <a
                  href={`tel:${customer.phone}`}
                >
                  {customer.phone}
                </a>
              </div>
            )}
          </article>

          <article>
            <h3>Project Location</h3>

            {job && (
              <strong>
                {jobLabel(job)}
              </strong>
            )}

            {projectLines.length > 0 ? (
              projectLines.map(
                (line) => (
                  <div key={line}>
                    {line}
                  </div>
                )
              )
            ) : (
              <div className="invoice-muted">
                No project address entered.
              </div>
            )}
          </article>
        </div>
      </section>

      <section className="invoice-detail-section">
        <div className="invoice-section-heading">
          <div>
            <h3>Line Items</h3>

            <p>
              Labor, material, equipment,
              permits, and other billable
              charges.
            </p>
          </div>
        </div>

        <div className="invoice-line-items-scroll">
          <table className="invoice-line-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Category</th>
                <th>Description</th>
                <th>Qty</th>
                <th>Unit</th>
                <th>Unit Cost</th>
                <th>Unit Price</th>
                <th>Taxable</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>
              {lineItems.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="invoice-empty-state"
                  >
                    No line items were
                    found.
                  </td>
                </tr>
              )}

              {lineItems.map(
                (item, index) => {
                  const quantity =
                    Number(
                      item.quantity || 0
                    )

                  const unitPrice =
                    Number(
                      item.unit_price || 0
                    )

                  return (
                    <tr key={item.id}>
                      <td>
                        {index + 1}
                      </td>

                      <td>
                        {item.category ||
                          'Service'}
                      </td>

                      <td>
                        {item.description ||
                          '—'}
                      </td>

                      <td>
                        {quantity}
                      </td>

                      <td>
                        {item.unit ||
                          'each'}
                      </td>

                      <td>
                        {formatCurrency(
                          item.unit_cost
                        )}
                      </td>

                      <td>
                        {formatCurrency(
                          unitPrice
                        )}
                      </td>

                      <td>
                        {item.taxable ===
                        false
                          ? 'No'
                          : 'Yes'}
                      </td>

                      <td>
                        <strong>
                          {formatCurrency(
                            quantity *
                              unitPrice
                          )}
                        </strong>
                      </td>
                    </tr>
                  )
                }
              )}
            </tbody>
          </table>
        </div>

        <div className="invoice-detail-totals">
          <div>
            <span>Subtotal</span>

            <strong>
              {formatCurrency(
                totals.subtotal
              )}
            </strong>
          </div>

          <div>
            <span>Discount</span>

            <strong>
              -
              {formatCurrency(
                totals.discount
              )}
            </strong>
          </div>

          <div>
            <span>Taxable Subtotal</span>

            <strong>
              {formatCurrency(
                totals.taxableAfterDiscount
              )}
            </strong>
          </div>

          <div>
            <span>Tax</span>

            <strong>
              {formatCurrency(
                totals.tax
              )}
            </strong>
          </div>

          <div>
            <span>Late Fee</span>

            <strong>
              {formatCurrency(
                totals.lateFee
              )}
            </strong>
          </div>

          <div className="invoice-detail-total-grand">
            <span>Invoice Total</span>

            <strong>
              {formatCurrency(
                totals.invoiceTotal
              )}
            </strong>
          </div>

          <div>
            <span>Deposit Applied</span>

            <strong>
              -
              {formatCurrency(
                totals.depositApplied
              )}
            </strong>
          </div>

          <div>
            <span>Payments</span>

            <strong>
              -
              {formatCurrency(
                totals.paymentTotal
              )}
            </strong>
          </div>

          <div className="invoice-detail-balance">
            <span>Balance Due</span>

            <strong>
              {formatCurrency(
                totals.balanceDue
              )}
            </strong>
          </div>

          {totals.overpayment > 0 && (
            <div>
              <span>Customer Credit</span>

              <strong>
                {formatCurrency(
                  totals.overpayment
                )}
              </strong>
            </div>
          )}
        </div>
      </section>

      <section className="invoice-detail-section">
        <div className="invoice-section-heading">
          <div>
            <h3>Payment History</h3>

            <p>
              Recorded payments and
              references for this invoice.
            </p>
          </div>

          {status !== 'Paid' &&
            status !== 'Void' && (
              <button
                type="button"
                onClick={() =>
                  onRecordPayment?.(
                    invoice.id
                  )
                }
              >
                + Record Payment
              </button>
            )}
        </div>

        <div className="invoice-line-items-scroll">
          <table className="invoice-payments-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Payment</th>
                <th>Reference</th>
                <th>Notes</th>
                <th>Amount</th>
              </tr>
            </thead>

            <tbody>
              {payments.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="invoice-empty-state"
                  >
                    No payments recorded.
                  </td>
                </tr>
              )}

              {payments.map(
                (payment) => (
                  <tr key={payment.id}>
                    <td>
                      {formatDate(
                        payment.payment_date
                      )}
                    </td>

                    <td>
                      {paymentLabel(
                        payment
                      )}
                    </td>

                    <td>
                      {payment.reference_number ||
                        '—'}
                    </td>

                    <td>
                      {payment.notes ||
                        '—'}
                    </td>

                    <td>
                      <strong>
                        {formatCurrency(
                          payment.amount
                        )}
                      </strong>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="invoice-detail-section">
        <div className="invoice-detail-notes-grid">
          <article>
            <h3>Customer Notes</h3>

            <p>
              {invoice.notes ||
                'No customer notes.'}
            </p>
          </article>

          <article>
            <h3>Terms</h3>

            <p>
              {invoice.terms ||
                'No payment terms entered.'}
            </p>
          </article>

          <article>
            <h3>Internal Notes</h3>

            <p>
              {invoice.internal_notes ||
                'No internal notes.'}
            </p>
          </article>

          <article>
            <h3>Footer Message</h3>

            <p>
              {invoice.footer_message ||
                'No footer message.'}
            </p>
          </article>
        </div>
      </section>

      <footer className="invoice-detail-footer">
        <div>
          <strong>
            {invoice.invoice_number ||
              'Invoice'}
          </strong>

          <span>
            Balance due:{' '}
            {formatCurrency(
              totals.balanceDue
            )}
          </span>
        </div>

        <div>
          <button
            type="button"
            onClick={() => onBack?.()}
          >
            Back
          </button>

          <button
            type="button"
            onClick={printInvoice}
          >
            Print
          </button>

          <button
            type="button"
            onClick={() =>
              onEdit?.(invoice.id)
            }
          >
            Edit Invoice
          </button>
        </div>
      </footer>
    </div>
  )
}