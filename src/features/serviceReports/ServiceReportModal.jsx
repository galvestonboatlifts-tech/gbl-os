import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { supabase as sharedSupabase } from '../../lib/supabase'

const REPORT_STATUSES = [
  'Draft',
  'In Progress',
  'Completed',
  'Sent',
  'Archived',
]

const WEATHER_OPTIONS = [
  'Clear',
  'Partly Cloudy',
  'Cloudy',
  'Rain',
  'Storm',
  'Windy',
  'Hot',
  'Cold',
]

const DEFAULT_INSPECTION_ITEMS = [
  'Lift structure inspected',
  'Cables inspected',
  'Pulleys inspected',
  'Motors inspected',
  'Gearbox inspected',
  'Electrical connections inspected',
  'Limit switches inspected',
  'Bunks and cradle inspected',
  'Fasteners checked',
  'Safety concerns reviewed',
]

const DEFAULT_SAFETY_ITEMS = [
  'Power disconnected when required',
  'Work area secured',
  'Fall hazards reviewed',
  'Boat position verified',
  'Tools and equipment inspected',
  'PPE used',
]

const EMPTY_REPORT = {
  id: '',
  job_id: '',
  customer_id: '',
  property_id: '',
  boat_lift_id: '',
  technician_id: '',
  number: '',
  status: 'Draft',
  service_date: new Date()
    .toISOString()
    .slice(0, 10),
  arrival_time: '',
  departure_time: '',
  weather: '',
  temperature: '',
  work_performed: '',
  technician_notes: '',
  customer_notes: '',
  recommendations: '',
  warranty_notes: '',
  lift_condition: '',
  gps_latitude: '',
  gps_longitude: '',
  customer_signature: '',
  technician_signature: '',
  before_photos: [],
  after_photos: [],
  materials_used: [],
  labor_entries: [],
  inspection_checklist: DEFAULT_INSPECTION_ITEMS.map(
    (label) => ({
      id: createId(),
      label,
      completed: false,
      notes: '',
    })
  ),
  safety_checklist: DEFAULT_SAFETY_ITEMS.map(
    (label) => ({
      id: createId(),
      label,
      completed: false,
      notes: '',
    })
  ),
}

function createId() {
  if (
    typeof crypto !== 'undefined' &&
    crypto.randomUUID
  ) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`
}

function money(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0))
}

function dateText(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(
    String(value).length === 10
      ? `${value}T12:00:00`
      : value
  )

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString()
}

function dateTimeText(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString()
}

function customerName(customer) {
  return (
    customer?.name ||
    customer?.full_name ||
    customer?.company ||
    customer?.company_name ||
    'Unknown customer'
  )
}

function employeeName(employee) {
  return (
    employee?.name ||
    employee?.full_name ||
    employee?.email ||
    'Unknown technician'
  )
}

function propertyAddress(property) {
  if (!property) {
    return 'No property selected'
  }

  return [
    property.address,
    property.city,
    property.state,
    property.zip_code,
  ]
    .filter(Boolean)
    .join(', ')
}

function reportNumber(reports) {
  const year = new Date().getFullYear()

  const numbers = reports
    .map((report) => {
      const match = String(
        report.number ||
          report.report_number ||
          ''
      ).match(/(\d+)$/)

      return match ? Number(match[1]) : 0
    })
    .filter(Number.isFinite)

  const next =
    numbers.length > 0
      ? Math.max(...numbers) + 1
      : 1

  return `SR-${year}-${String(next).padStart(
    4,
    '0'
  )}`
}

function parseArray(value) {
  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed)
        ? parsed
        : []
    } catch {
      return []
    }
  }

  return []
}

function parseObject(value) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)

      return (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      )
        ? parsed
        : null
    } catch {
      return null
    }
  }

  return null
}

function normalizeChecklist(
  value,
  defaults
) {
  const existing = parseArray(value)

  if (existing.length) {
    return existing.map((item) => ({
      id: item.id || createId(),
      label: item.label || '',
      completed: Boolean(
        item.completed
      ),
      notes: item.notes || '',
    }))
  }

  return defaults.map((label) => ({
    id: createId(),
    label,
    completed: false,
    notes: '',
  }))
}

function normalizeReport(report) {
  return {
    ...EMPTY_REPORT,
    ...report,
    number:
      report.number ||
      report.report_number ||
      '',
    before_photos: parseArray(
      report.before_photos
    ),
    after_photos: parseArray(
      report.after_photos
    ),
    materials_used: parseArray(
      report.materials_used
    ),
    labor_entries: parseArray(
      report.labor_entries
    ),
    inspection_checklist:
      normalizeChecklist(
        report.inspection_checklist,
        DEFAULT_INSPECTION_ITEMS
      ),
    safety_checklist:
      normalizeChecklist(
        report.safety_checklist,
        DEFAULT_SAFETY_ITEMS
      ),
  }
}

function calculateLaborHours(entries) {
  return parseArray(entries).reduce(
    (total, entry) => {
      if (
        entry.hours !== undefined &&
        entry.hours !== null &&
        entry.hours !== ''
      ) {
        return (
          total +
          Number(entry.hours || 0)
        )
      }

      if (
        entry.start &&
        entry.end
      ) {
        const start =
          new Date(entry.start)
        const end =
          new Date(entry.end)

        if (
          !Number.isNaN(start.getTime()) &&
          !Number.isNaN(end.getTime())
        ) {
          return (
            total +
            Math.max(
              0,
              (end - start) /
                3600000
            )
          )
        }
      }

      return total
    },
    0
  )
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function missingColumnName(error) {
  const message = String(
    error?.message || ''
  )

  const patterns = [
    /column ["']?([a-zA-Z0-9_]+)["']? does not exist/i,
    /could not find the ["']?([a-zA-Z0-9_]+)["']? column/i,
    /schema cache.*["']([a-zA-Z0-9_]+)["']/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)

    if (match?.[1]) {
      return match[1]
    }
  }

  return ''
}

async function safeSelect(
  supabase,
  table,
  orderColumn = 'created_at',
  ascending = false
) {
  let query = supabase
    .from(table)
    .select('*')

  if (orderColumn) {
    query = query.order(orderColumn, {
      ascending,
    })
  }

  const result = await query

  if (!result.error) {
    return {
      data: result.data || [],
      error: null,
      missing: false,
    }
  }

  const message = String(
    result.error.message || ''
  ).toLowerCase()

  if (
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  ) {
    return {
      data: [],
      error: null,
      missing: true,
    }
  }

  return {
    data: [],
    error: result.error,
    missing: false,
  }
}

async function upsertCompatible(
  supabase,
  table,
  payload,
  attempt = 0
) {
  const result = await supabase
    .from(table)
    .upsert(payload)
    .select()
    .single()

  if (!result.error) {
    return result
  }

  if (attempt > 30) {
    return result
  }

  const missing =
    missingColumnName(result.error)

  if (
    missing &&
    Object.prototype.hasOwnProperty.call(
      payload,
      missing
    )
  ) {
    const next = { ...payload }
    delete next[missing]

    return upsertCompatible(
      supabase,
      table,
      next,
      attempt + 1
    )
  }

  return result
}

export default function ServiceReportsModule({
  supabase: suppliedSupabase,
  initialJobId,
  onOpenJob,
  onCreateInvoice,
} = {}) {
  const supabase = suppliedSupabase || sharedSupabase
  const [reports, setReports] =
    useState([])
  const [jobs, setJobs] =
    useState([])
  const [customers, setCustomers] =
    useState([])
  const [properties, setProperties] =
    useState([])
  const [boatLifts, setBoatLifts] =
    useState([])
  const [employees, setEmployees] =
    useState([])

  const [loading, setLoading] =
    useState(true)
  const [saving, setSaving] =
    useState(false)
  const [error, setError] =
    useState('')
  const [message, setMessage] =
    useState('')

  const [search, setSearch] =
    useState('')
  const [statusFilter, setStatusFilter] =
    useState('')
  const [selectedId, setSelectedId] =
    useState(null)
  const [editor, setEditor] =
    useState(null)

  const loadData = useCallback(async () => {
    if (!supabase) {
      setError(
        'Supabase is not available. Check the shared client in src/lib/supabase.js.'
      )
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const [
      reportResult,
      jobResult,
      customerResult,
      propertyResult,
      liftResult,
      employeeResult,
    ] = await Promise.all([
      safeSelect(
        supabase,
        'service_reports',
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
        'customers',
        'created_at',
        false
      ),
      safeSelect(
        supabase,
        'properties',
        'created_at',
        false
      ),
      safeSelect(
        supabase,
        'boat_lifts',
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

    const firstError = [
      reportResult.error,
      jobResult.error,
      customerResult.error,
      propertyResult.error,
      liftResult.error,
      employeeResult.error,
    ].find(Boolean)

    if (firstError) {
      setError(firstError.message)
    }

    setReports(
      reportResult.data.map(
        normalizeReport
      )
    )
    setJobs(jobResult.data)
    setCustomers(customerResult.data)
    setProperties(propertyResult.data)
    setBoatLifts(liftResult.data)
    setEmployees(employeeResult.data)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (
      loading ||
      editor ||
      selectedId ||
      !initialJobId
    ) {
      return
    }

    const existing = reports.find(
      (report) =>
        report.job_id === initialJobId
    )

    if (existing) {
      setSelectedId(existing.id)
      return
    }

    const job = jobs.find(
      (item) =>
        item.id === initialJobId
    )

    if (job) {
      openFromJob(job)
    }
  }, [
    loading,
    editor,
    selectedId,
    initialJobId,
    reports,
    jobs,
  ])

  const filteredReports = useMemo(() => {
    const query = search
      .trim()
      .toLowerCase()

    return reports.filter((report) => {
      if (
        statusFilter &&
        report.status !== statusFilter
      ) {
        return false
      }

      if (!query) {
        return true
      }

      const job = jobs.find(
        (item) =>
          item.id === report.job_id
      )

      const customer = customers.find(
        (item) =>
          item.id ===
          report.customer_id
      )

      return [
        report.number,
        report.report_number,
        report.status,
        report.work_performed,
        report.technician_notes,
        report.recommendations,
        job?.number,
        job?.title,
        customerName(customer),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [
    reports,
    jobs,
    customers,
    search,
    statusFilter,
  ])

  const selectedReport = useMemo(
    () =>
      reports.find(
        (report) =>
          report.id === selectedId
      ) || null,
    [reports, selectedId]
  )

  const metrics = useMemo(() => {
    return {
      total: reports.length,
      draft: reports.filter(
        (report) =>
          report.status === 'Draft'
      ).length,
      inProgress: reports.filter(
        (report) =>
          report.status ===
          'In Progress'
      ).length,
      completed: reports.filter(
        (report) =>
          [
            'Completed',
            'Sent',
            'Archived',
          ].includes(report.status)
      ).length,
      recommendations: reports.filter(
        (report) =>
          String(
            report.recommendations || ''
          ).trim()
      ).length,
    }
  }, [reports])

  function openNewReport() {
    setEditor({
      report: {
        ...EMPTY_REPORT,
        number:
          reportNumber(reports),
      },
    })
  }

  function openFromJob(job) {
    setEditor({
      report: {
        ...EMPTY_REPORT,
        number:
          reportNumber(reports),
        job_id: job.id,
        customer_id:
          job.customer_id || '',
        property_id:
          job.property_id || '',
        boat_lift_id:
          job.boat_lift_id || '',
        technician_id:
          parseObject(
            job.active_clock
          )?.employee_id || '',
        status: 'In Progress',
        work_performed:
          job.scope || '',
        technician_notes:
          job.notes || '',
        before_photos:
          parseArray(
            job.before_photos
          ),
        after_photos:
          parseArray(
            job.after_photos
          ),
        materials_used:
          parseArray(
            job.materials_used
          ),
        labor_entries:
          parseArray(
            job.labor_entries
          ),
      },
    })
  }

  function openReport(report) {
    setEditor({
      report:
        normalizeReport(report),
    })
  }

  async function updateStatus(
    report,
    status
  ) {
    setSaving(true)
    setError('')

    try {
      const { error: updateError } =
        await supabase
          .from('service_reports')
          .update({ status })
          .eq('id', report.id)

      if (updateError) {
        throw updateError
      }

      setMessage(
        `${report.number || 'Service report'} marked ${status}.`
      )

      await loadData()
    } catch (statusError) {
      setError(statusError.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteReport(report) {
    const confirmed = window.confirm(
      `Delete ${report.number || 'this service report'}?`
    )

    if (!confirmed) {
      return
    }

    setSaving(true)
    setError('')

    try {
      const { error: deleteError } =
        await supabase
          .from('service_reports')
          .delete()
          .eq('id', report.id)

      if (deleteError) {
        throw deleteError
      }

      setSelectedId(null)
      await loadData()
    } catch (deleteError) {
      setError(deleteError.message)
    } finally {
      setSaving(false)
    }
  }

  function duplicateReport(report) {
    setEditor({
      report: {
        ...normalizeReport(report),
        id: '',
        number:
          reportNumber(reports),
        status: 'Draft',
        service_date:
          new Date()
            .toISOString()
            .slice(0, 10),
        customer_signature: '',
        technician_signature: '',
      },
    })
  }

  function printReport(report) {
    const job = jobs.find(
      (item) =>
        item.id === report.job_id
    )

    const customer = customers.find(
      (item) =>
        item.id ===
        report.customer_id
    )

    const property = properties.find(
      (item) =>
        item.id ===
        report.property_id
    )

    const lift = boatLifts.find(
      (item) =>
        item.id ===
        report.boat_lift_id
    )

    const technician = employees.find(
      (item) =>
        item.id ===
        report.technician_id
    )

    const laborHours =
      calculateLaborHours(
        report.labor_entries
      )

    const materialsRows =
      parseArray(
        report.materials_used
      )
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.name || item.description || 'Material')}</td>
              <td>${escapeHtml(String(item.quantity || 0))}</td>
              <td>${escapeHtml(item.unit || '')}</td>
              <td>${escapeHtml(money(item.cost || item.unit_cost || 0))}</td>
            </tr>
          `
        )
        .join('')

    const inspectionRows =
      normalizeChecklist(
        report.inspection_checklist,
        DEFAULT_INSPECTION_ITEMS
      )
        .map(
          (item) => `
            <tr>
              <td>${item.completed ? '✓' : '○'}</td>
              <td>${escapeHtml(item.label)}</td>
              <td>${escapeHtml(item.notes || '')}</td>
            </tr>
          `
        )
        .join('')

    const safetyRows =
      normalizeChecklist(
        report.safety_checklist,
        DEFAULT_SAFETY_ITEMS
      )
        .map(
          (item) => `
            <tr>
              <td>${item.completed ? '✓' : '○'}</td>
              <td>${escapeHtml(item.label)}</td>
              <td>${escapeHtml(item.notes || '')}</td>
            </tr>
          `
        )
        .join('')

    const photoHtml = [
      ...parseArray(
        report.before_photos
      ).map((photo) => ({
        ...photo,
        category: 'Before',
      })),
      ...parseArray(
        report.after_photos
      ).map((photo) => ({
        ...photo,
        category: 'After',
      })),
    ]
      .map(
        (photo) => `
          <figure>
            <img src="${escapeHtml(photo.url || '')}" alt="${escapeHtml(photo.name || 'Service photo')}" />
            <figcaption>${escapeHtml(photo.category)} · ${escapeHtml(photo.name || 'Service photo')}</figcaption>
          </figure>
        `
      )
      .join('')

    const popup = window.open(
      '',
      '_blank',
      'width=1000,height=850'
    )

    if (!popup) {
      alert(
        'Allow pop-ups to print the service report.'
      )
      return
    }

    popup.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${escapeHtml(report.number || 'Service Report')}</title>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 36px;
              font-family: Arial, sans-serif;
              color: #0f172a;
              line-height: 1.45;
            }
            header {
              border-bottom: 4px solid #0f172a;
              padding-bottom: 18px;
              margin-bottom: 24px;
            }
            h1, h2, p { margin-top: 0; }
            h2 {
              border-bottom: 1px solid #cbd5e1;
              padding-bottom: 6px;
              margin-top: 24px;
            }
            .grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 24px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 12px;
            }
            th, td {
              border: 1px solid #cbd5e1;
              padding: 8px;
              text-align: left;
              vertical-align: top;
            }
            th { background: #f1f5f9; }
            figure {
              display: inline-block;
              width: 47%;
              margin: 1%;
              vertical-align: top;
            }
            figure img {
              width: 100%;
              max-height: 260px;
              object-fit: cover;
              border: 1px solid #cbd5e1;
            }
            figcaption {
              font-size: 12px;
              color: #475569;
            }
            .signature {
              width: 100%;
              max-height: 130px;
              object-fit: contain;
              border-bottom: 1px solid #0f172a;
            }
            .print {
              position: fixed;
              top: 12px;
              right: 12px;
              padding: 10px 16px;
              background: #0f172a;
              color: white;
              border: 0;
              border-radius: 8px;
            }
            @media print {
              body { padding: 0; }
              .print { display: none; }
              section { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <button class="print" onclick="window.print()">
            Print / Save PDF
          </button>

          <header>
            <h1>Galveston Boat Lifts</h1>
            <p>Service Report ${escapeHtml(report.number || '')}</p>
          </header>

          <div class="grid">
            <section>
              <h2>Customer</h2>
              <p><b>${escapeHtml(customerName(customer))}</b></p>
              <p>${escapeHtml(customer?.phone || '')}</p>
              <p>${escapeHtml(customer?.email || '')}</p>
              <p>${escapeHtml(propertyAddress(property))}</p>
            </section>

            <section>
              <h2>Service Information</h2>
              <p><b>Job:</b> ${escapeHtml(job?.number || '—')}</p>
              <p><b>Service Date:</b> ${escapeHtml(dateText(report.service_date))}</p>
              <p><b>Technician:</b> ${escapeHtml(employeeName(technician))}</p>
              <p><b>Status:</b> ${escapeHtml(report.status || 'Draft')}</p>
              <p><b>Weather:</b> ${escapeHtml(report.weather || '—')}</p>
              <p><b>Labor Hours:</b> ${laborHours.toFixed(2)}</p>
            </section>
          </div>

          <section>
            <h2>Boat Lift</h2>
            <p><b>Lift:</b> ${escapeHtml(lift?.lift_number || lift?.name || '—')}</p>
            <p><b>Condition:</b> ${escapeHtml(report.lift_condition || '—')}</p>
          </section>

          <section>
            <h2>Work Performed</h2>
            <p>${escapeHtml(report.work_performed || 'No work description entered.')}</p>
          </section>

          <section>
            <h2>Technician Notes</h2>
            <p>${escapeHtml(report.technician_notes || '—')}</p>
          </section>

          <section>
            <h2>Customer Notes</h2>
            <p>${escapeHtml(report.customer_notes || '—')}</p>
          </section>

          <section>
            <h2>Recommended Repairs</h2>
            <p>${escapeHtml(report.recommendations || 'No recommendations entered.')}</p>
          </section>

          <section>
            <h2>Warranty Information</h2>
            <p>${escapeHtml(report.warranty_notes || '—')}</p>
          </section>

          <section>
            <h2>Inspection Checklist</h2>
            <table>
              <thead>
                <tr>
                  <th>Done</th>
                  <th>Inspection Item</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>${inspectionRows}</tbody>
            </table>
          </section>

          <section>
            <h2>Safety Checklist</h2>
            <table>
              <thead>
                <tr>
                  <th>Done</th>
                  <th>Safety Item</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>${safetyRows}</tbody>
            </table>
          </section>

          <section>
            <h2>Materials Used</h2>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Unit</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                ${materialsRows || '<tr><td colspan="4">No materials recorded</td></tr>'}
              </tbody>
            </table>
          </section>

          <section>
            <h2>Photos</h2>
            ${photoHtml || '<p>No photos attached.</p>'}
          </section>

          <section class="grid">
            <div>
              <h2>Customer Signature</h2>
              ${
                report.customer_signature
                  ? `<img class="signature" src="${escapeHtml(report.customer_signature)}" alt="Customer signature" />`
                  : '<p>Not signed</p>'
              }
            </div>

            <div>
              <h2>Technician Signature</h2>
              ${
                report.technician_signature
                  ? `<img class="signature" src="${escapeHtml(report.technician_signature)}" alt="Technician signature" />`
                  : '<p>Not signed</p>'
              }
            </div>
          </section>
        </body>
      </html>
    `)

    popup.document.close()
    popup.focus()
  }

  function emailReport(report) {
    const customer = customers.find(
      (item) =>
        item.id ===
        report.customer_id
    )

    const subject = encodeURIComponent(
      `${report.number || 'Service Report'} from Galveston Boat Lifts`
    )

    const body = encodeURIComponent(
      `Hello ${customerName(customer)},\n\n` +
        `Your service report ${report.number || ''} is complete.\n\n` +
        `Service date: ${dateText(report.service_date)}\n\n` +
        `Work performed:\n${report.work_performed || ''}\n\n` +
        `Recommendations:\n${report.recommendations || 'None'}\n\n` +
        `Thank you,\nGalveston Boat Lifts`
    )

    window.location.href =
      `mailto:${customer?.email || ''}` +
      `?subject=${subject}&body=${body}`

    if (
      report.status === 'Completed'
    ) {
      updateStatus(report, 'Sent')
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Loading Service Reports...</h2>
      </section>
    )
  }

  if (editor) {
    return (
      <ServiceReportEditor
        supabase={supabase}
        editor={editor}
        reports={reports}
        jobs={jobs}
        customers={customers}
        properties={properties}
        boatLifts={boatLifts}
        employees={employees}
        onCancel={() =>
          setEditor(null)
        }
        onSaved={async (saved) => {
          setEditor(null)
          setSelectedId(saved.id)
          await loadData()
        }}
      />
    )
  }

  if (selectedReport) {
    const job = jobs.find(
      (item) =>
        item.id ===
        selectedReport.job_id
    )

    const customer = customers.find(
      (item) =>
        item.id ===
        selectedReport.customer_id
    )

    const property = properties.find(
      (item) =>
        item.id ===
        selectedReport.property_id
    )

    const lift = boatLifts.find(
      (item) =>
        item.id ===
        selectedReport.boat_lift_id
    )

    const technician = employees.find(
      (item) =>
        item.id ===
        selectedReport.technician_id
    )

    const inspection =
      normalizeChecklist(
        selectedReport.inspection_checklist,
        DEFAULT_INSPECTION_ITEMS
      )

    const safety =
      normalizeChecklist(
        selectedReport.safety_checklist,
        DEFAULT_SAFETY_ITEMS
      )

    const readiness = [
      {
        label: 'Work performed entered',
        complete: Boolean(
          String(
            selectedReport.work_performed || ''
          ).trim()
        ),
      },
      {
        label: 'Inspection completed',
        complete:
          inspection.length > 0 &&
          inspection.every(
            (item) =>
              item.completed
          ),
      },
      {
        label: 'Safety checklist completed',
        complete:
          safety.length > 0 &&
          safety.every(
            (item) =>
              item.completed
          ),
      },
      {
        label: 'Customer signature saved',
        complete: Boolean(
          selectedReport.customer_signature
        ),
      },
      {
        label: 'Technician signature saved',
        complete: Boolean(
          selectedReport.technician_signature
        ),
      },
      {
        label: 'After photos uploaded',
        complete:
          parseArray(
            selectedReport.after_photos
          ).length > 0,
      },
    ]

    const readyCount =
      readiness.filter(
        (item) => item.complete
      ).length

    return (
      <>
        <section className="panel">
          <div className="between">
            <div>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setSelectedId(null)
                }
              >
                ← All Service Reports
              </button>

              <h1>
                {selectedReport.number ||
                  'Service Report'}
                {' · '}
                {job?.title ||
                  'Service Visit'}
              </h1>

              <p className="small">
                {customerName(customer)}
                {' · '}
                {propertyAddress(property)}
              </p>
            </div>

            <div className="actions">
              <Badge>
                {selectedReport.status ||
                  'Draft'}
              </Badge>

              <button
                type="button"
                className="secondary"
                onClick={() =>
                  openReport(
                    selectedReport
                  )
                }
              >
                Edit
              </button>

              <button
                type="button"
                className="secondary"
                onClick={() =>
                  printReport(
                    selectedReport
                  )
                }
              >
                Print / PDF
              </button>

              <button
                type="button"
                className="primary"
                onClick={() =>
                  emailReport(
                    selectedReport
                  )
                }
              >
                Email Report
              </button>
            </div>
          </div>
        </section>

        {error && (
          <section className="panel">
            <p className="negative">
              {error}
            </p>
          </section>
        )}

        {message && (
          <section className="panel">
            <p className="positive">
              {message}
            </p>
          </section>
        )}

        <div className="metrics">
          <Metric
            label="Status"
            value={
              selectedReport.status ||
              'Draft'
            }
          />
          <Metric
            label="Service Date"
            value={dateText(
              selectedReport.service_date
            )}
          />
          <Metric
            label="Technician"
            value={employeeName(
              technician
            )}
          />
          <Metric
            label="Labor Hours"
            value={calculateLaborHours(
              selectedReport.labor_entries
            ).toFixed(2)}
          />
          <Metric
            label="Completion"
            value={`${readyCount}/${readiness.length}`}
          />
        </div>

        <div className="grid-2">
          <section className="panel">
            <h2>Service Information</h2>

            <p>
              <b>Job:</b>{' '}
              {job?.number || '—'}
            </p>
            <p>
              <b>Customer:</b>{' '}
              {customerName(customer)}
            </p>
            <p>
              <b>Property:</b>{' '}
              {propertyAddress(property)}
            </p>
            <p>
              <b>Boat Lift:</b>{' '}
              {lift?.lift_number ||
                lift?.name ||
                '—'}
            </p>
            <p>
              <b>Weather:</b>{' '}
              {selectedReport.weather ||
                '—'}
            </p>

            {job && (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  onOpenJob?.(job.id)
                }
              >
                Open Job
              </button>
            )}
          </section>

          <section className="panel">
            <h2>Arrival and Departure</h2>

            <p>
              <b>Arrival:</b>{' '}
              {selectedReport.arrival_time ||
                '—'}
            </p>
            <p>
              <b>Departure:</b>{' '}
              {selectedReport.departure_time ||
                '—'}
            </p>
            <p>
              <b>GPS:</b>{' '}
              {selectedReport.gps_latitude &&
              selectedReport.gps_longitude
                ? `${selectedReport.gps_latitude}, ${selectedReport.gps_longitude}`
                : '—'}
            </p>
          </section>
        </div>

        <section className="panel">
          <h2>Work Performed</h2>
          <p>
            {selectedReport.work_performed ||
              'No work description entered.'}
          </p>
        </section>

        <div className="grid-2">
          <section className="panel">
            <h2>Technician Notes</h2>
            <p>
              {selectedReport.technician_notes ||
                '—'}
            </p>
          </section>

          <section className="panel">
            <h2>Customer Notes</h2>
            <p>
              {selectedReport.customer_notes ||
                '—'}
            </p>
          </section>
        </div>

        <div className="grid-2">
          <section className="panel">
            <h2>Lift Condition</h2>
            <p>
              {selectedReport.lift_condition ||
                '—'}
            </p>
          </section>

          <section className="panel">
            <h2>Recommendations</h2>
            <p>
              {selectedReport.recommendations ||
                'No recommendations entered.'}
            </p>
          </section>
        </div>

        <section className="panel">
          <h2>Inspection Checklist</h2>

          <ChecklistViewer
            items={inspection}
          />
        </section>

        <section className="panel">
          <h2>Safety Checklist</h2>

          <ChecklistViewer
            items={safety}
          />
        </section>

        <div className="grid-2">
          <PhotoViewer
            title="Before Photos"
            photos={parseArray(
              selectedReport.before_photos
            )}
          />

          <PhotoViewer
            title="After Photos"
            photos={parseArray(
              selectedReport.after_photos
            )}
          />
        </div>

        <section className="panel">
          <h2>Materials Used</h2>

          <div className="cards">
            {parseArray(
              selectedReport.materials_used
            ).map((item) => (
              <article
                className="card"
                key={item.id || createId()}
              >
                <strong>
                  {item.name ||
                    item.description ||
                    'Material'}
                </strong>

                <p>
                  {Number(
                    item.quantity || 0
                  )}
                  {' '}
                  {item.unit || ''}
                </p>

                <div className="small">
                  {money(
                    item.cost ||
                      item.unit_cost ||
                      0
                  )}
                </div>
              </article>
            ))}

            {!parseArray(
              selectedReport.materials_used
            ).length && (
              <Empty>
                No materials recorded
              </Empty>
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Completion Readiness</h2>

          <div className="cards">
            {readiness.map((item) => (
              <article
                className="card"
                key={item.label}
              >
                <div className="between">
                  <span>{item.label}</span>
                  <Badge>
                    {item.complete
                      ? 'Complete'
                      : 'Open'}
                  </Badge>
                </div>
              </article>
            ))}
          </div>

          <div className="actions">
            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() =>
                updateStatus(
                  selectedReport,
                  'In Progress'
                )
              }
            >
              Mark In Progress
            </button>

            <button
              type="button"
              className="primary"
              disabled={saving}
              onClick={() =>
                updateStatus(
                  selectedReport,
                  'Completed'
                )
              }
            >
              Mark Completed
            </button>

            <button
              type="button"
              className="secondary"
              onClick={() =>
                duplicateReport(
                  selectedReport
                )
              }
            >
              Duplicate
            </button>

            <button
              type="button"
              className="primary"
              onClick={() =>
                onCreateInvoice?.(
                  selectedReport.id
                )
              }
            >
              Create Invoice
            </button>

            <button
              type="button"
              className="secondary"
              disabled={saving}
              onClick={() =>
                updateStatus(
                  selectedReport,
                  'Archived'
                )
              }
            >
              Archive
            </button>
          </div>
        </section>

        <section className="panel">
          <button
            type="button"
            className="danger"
            disabled={saving}
            onClick={() =>
              deleteReport(
                selectedReport
              )
            }
          >
            Delete Service Report
          </button>
        </section>
      </>
    )
  }

  return (
    <>
      <section className="panel">
        <div className="between">
          <div>
            <h1>Service Reports</h1>
            <p className="small">
              Build, sign, send, and archive
              complete field service reports.
            </p>
          </div>

          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={loadData}
            >
              Refresh
            </button>

            <button
              type="button"
              className="primary"
              onClick={openNewReport}
            >
              + New Service Report
            </button>
          </div>
        </div>

        {error && (
          <p className="negative">{error}</p>
        )}

        {message && (
          <p className="positive">{message}</p>
        )}
      </section>

      <div className="metrics">
        <Metric
          label="Total Reports"
          value={metrics.total}
        />
        <Metric
          label="Draft"
          value={metrics.draft}
        />
        <Metric
          label="In Progress"
          value={metrics.inProgress}
        />
        <Metric
          label="Completed"
          value={metrics.completed}
        />
        <Metric
          label="With Recommendations"
          value={metrics.recommendations}
        />
      </div>

      <section className="panel">
        <div className="form-grid">
          <Field
            label="Search"
            value={search}
            onChange={setSearch}
            placeholder="Report, job, customer, recommendations..."
          />

          <SelectField
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ['', 'All statuses'],
              ...REPORT_STATUSES.map(
                (status) => [
                  status,
                  status,
                ]
              ),
            ]}
          />
        </div>
      </section>

      <section className="panel">
        <div className="cards">
          {filteredReports.map(
            (report) => {
              const job = jobs.find(
                (item) =>
                  item.id ===
                  report.job_id
              )

              const customer =
                customers.find(
                  (item) =>
                    item.id ===
                    report.customer_id
                )

              return (
                <article
                  className="card"
                  key={report.id}
                >
                  <div className="between">
                    <div>
                      <h3>
                        {report.number ||
                          'Service Report'}
                        {' · '}
                        {job?.title ||
                          'Service Visit'}
                      </h3>

                      <div className="small">
                        {customerName(
                          customer
                        )}
                        {' · '}
                        {dateText(
                          report.service_date
                        )}
                      </div>
                    </div>

                    <Badge>
                      {report.status ||
                        'Draft'}
                    </Badge>
                  </div>

                  <p>
                    {report.work_performed ||
                      'No work description entered.'}
                  </p>

                  <div className="actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() =>
                        setSelectedId(
                          report.id
                        )
                      }
                    >
                      Open Report
                    </button>

                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        printReport(report)
                      }
                    >
                      PDF
                    </button>

                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        emailReport(report)
                      }
                    >
                      Email
                    </button>

                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        duplicateReport(
                          report
                        )
                      }
                    >
                      Duplicate
                    </button>
                  </div>
                </article>
              )
            }
          )}

          {!filteredReports.length && (
            <Empty>
              No service reports found
            </Empty>
          )}
        </div>
      </section>
    </>
  )
}

function ServiceReportEditor({
  supabase,
  editor,
  reports,
  jobs,
  customers,
  properties,
  boatLifts,
  employees,
  onCancel,
  onSaved,
}) {
  const [report, setReport] =
    useState(
      normalizeReport(
        editor.report
      )
    )

  const [saving, setSaving] =
    useState(false)
  const [error, setError] =
    useState('')
  const [uploading, setUploading] =
    useState(false)

  const filteredProperties =
    useMemo(
      () =>
        properties.filter(
          (property) =>
            !report.customer_id ||
            property.customer_id ===
              report.customer_id
        ),
      [
        properties,
        report.customer_id,
      ]
    )

  const filteredLifts = useMemo(
    () =>
      boatLifts.filter(
        (lift) =>
          (!report.customer_id ||
            lift.customer_id ===
              report.customer_id) &&
          (!report.property_id ||
            lift.property_id ===
              report.property_id)
      ),
    [
      boatLifts,
      report.customer_id,
      report.property_id,
    ]
  )

  const filteredJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          !report.customer_id ||
          job.customer_id ===
            report.customer_id
      ),
    [
      jobs,
      report.customer_id,
    ]
  )

  function updateReport(field, value) {
    setReport((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function applyJob(jobId) {
    const job = jobs.find(
      (item) =>
        item.id === jobId
    )

    if (!job) {
      updateReport('job_id', '')
      return
    }

    setReport((current) => ({
      ...current,
      job_id: job.id,
      customer_id:
        job.customer_id ||
        current.customer_id,
      property_id:
        job.property_id ||
        current.property_id,
      boat_lift_id:
        job.boat_lift_id ||
        current.boat_lift_id,
      work_performed:
        current.work_performed ||
        job.scope ||
        '',
      technician_notes:
        current.technician_notes ||
        job.notes ||
        '',
      before_photos:
        current.before_photos.length
          ? current.before_photos
          : parseArray(
              job.before_photos
            ),
      after_photos:
        current.after_photos.length
          ? current.after_photos
          : parseArray(
              job.after_photos
            ),
      materials_used:
        current.materials_used.length
          ? current.materials_used
          : parseArray(
              job.materials_used
            ),
      labor_entries:
        current.labor_entries.length
          ? current.labor_entries
          : parseArray(
              job.labor_entries
            ),
    }))
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      alert(
        'Location services are not supported by this browser.'
      )
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setReport((current) => ({
          ...current,
          gps_latitude:
            position.coords.latitude,
          gps_longitude:
            position.coords.longitude,
        }))
      },
      (locationError) => {
        alert(
          locationError.message ||
            'Unable to capture location.'
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    )
  }

  function updateChecklist(
    field,
    itemId,
    itemField,
    value
  ) {
    setReport((current) => ({
      ...current,
      [field]: current[field].map(
        (item) =>
          item.id === itemId
            ? {
                ...item,
                [itemField]: value,
              }
            : item
      ),
    }))
  }

  function addChecklistItem(field) {
    setReport((current) => ({
      ...current,
      [field]: [
        ...current[field],
        {
          id: createId(),
          label: 'New checklist item',
          completed: false,
          notes: '',
        },
      ],
    }))
  }

  function removeChecklistItem(
    field,
    itemId
  ) {
    setReport((current) => ({
      ...current,
      [field]: current[field].filter(
        (item) =>
          item.id !== itemId
      ),
    }))
  }

  function addMaterial() {
    setReport((current) => ({
      ...current,
      materials_used: [
        ...current.materials_used,
        {
          id: createId(),
          name: '',
          quantity: 1,
          unit: 'each',
          cost: 0,
        },
      ],
    }))
  }

  function updateMaterial(
    itemId,
    field,
    value
  ) {
    setReport((current) => ({
      ...current,
      materials_used:
        current.materials_used.map(
          (item) =>
            item.id === itemId
              ? {
                  ...item,
                  [field]:
                    [
                      'quantity',
                      'cost',
                    ].includes(field)
                      ? Number(
                          value || 0
                        )
                      : value,
                }
              : item
        ),
    }))
  }

  function removeMaterial(itemId) {
    setReport((current) => ({
      ...current,
      materials_used:
        current.materials_used.filter(
          (item) =>
            item.id !== itemId
        ),
    }))
  }

  async function uploadPhotos(
    event,
    photoType
  ) {
    const files = Array.from(
      event.target.files || []
    )

    event.target.value = ''

    if (!files.length) {
      return
    }

    setUploading(true)

    try {
      const uploaded = []

      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          continue
        }

        const extension =
          String(file.name || '')
            .split('.')
            .pop() ||
          'jpg'

        const path =
          `${report.id || createId()}/` +
          `${photoType}/` +
          `${Date.now()}-${createId()}.${extension}`

        const { error: uploadError } =
          await supabase.storage
            .from('job-photos')
            .upload(path, file, {
              cacheControl: '3600',
              upsert: false,
              contentType: file.type,
            })

        if (uploadError) {
          throw uploadError
        }

        const { data: publicData } =
          supabase.storage
            .from('job-photos')
            .getPublicUrl(path)

        uploaded.push({
          id: createId(),
          path,
          url: publicData.publicUrl,
          name: file.name,
          uploaded_at:
            new Date().toISOString(),
        })
      }

      setReport((current) => ({
        ...current,
        [photoType === 'before'
          ? 'before_photos'
          : 'after_photos']: [
          ...current[
            photoType === 'before'
              ? 'before_photos'
              : 'after_photos'
          ],
          ...uploaded,
        ],
      }))
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setUploading(false)
    }
  }

  async function removePhoto(
    photo,
    photoType
  ) {
    const confirmed = window.confirm(
      'Delete this photo?'
    )

    if (!confirmed) {
      return
    }

    try {
      if (photo.path) {
        const { error: storageError } =
          await supabase.storage
            .from('job-photos')
            .remove([photo.path])

        if (storageError) {
          throw storageError
        }
      }

      setReport((current) => ({
        ...current,
        [photoType === 'before'
          ? 'before_photos'
          : 'after_photos']:
          current[
            photoType === 'before'
              ? 'before_photos'
              : 'after_photos'
          ].filter(
            (item) =>
              item.id !== photo.id
          ),
      }))
    } catch (photoError) {
      setError(photoError.message)
    }
  }

  async function saveReport(event) {
    event.preventDefault()

    if (!report.customer_id) {
      setError(
        'Select a customer.'
      )
      return
    }

    if (!report.job_id) {
      setError(
        'Select a job.'
      )
      return
    }

    setSaving(true)
    setError('')

    try {
      const {
        data: authData,
      } = await supabase.auth.getUser()

      const reportId =
        report.id || createId()

      const payload = {
        ...report,
        id: reportId,
        user_id:
          authData?.user?.id ||
          undefined,
        number:
          report.number ||
          reportNumber(reports),
        report_number:
          report.number ||
          reportNumber(reports),
        created_at:
          report.created_at ||
          new Date().toISOString(),
        updated_at:
          new Date().toISOString(),
      }

      Object.keys(payload).forEach(
        (key) => {
          if (
            payload[key] ===
            undefined
          ) {
            delete payload[key]
          }
        }
      )

      const result =
        await upsertCompatible(
          supabase,
          'service_reports',
          payload
        )

      if (result.error) {
        throw result.error
      }

      await onSaved(
        normalizeReport(
          result.data
        )
      )
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={saveReport}>
      <section className="panel">
        <div className="between">
          <div>
            <h1>
              {report.id
                ? 'Edit Service Report'
                : 'New Service Report'}
            </h1>

            <p className="small">
              Complete the field report,
              inspection, photos, signatures,
              recommendations, and warranty
              information.
            </p>
          </div>

          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={onCancel}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="primary"
              disabled={saving}
            >
              {saving
                ? 'Saving...'
                : 'Save Service Report'}
            </button>
          </div>
        </div>

        {error && (
          <p className="negative">
            {error}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Report Information</h2>

        <div className="form-grid">
          <Field
            label="Report Number"
            value={report.number}
            onChange={(value) =>
              updateReport(
                'number',
                value
              )
            }
          />

          <SelectField
            label="Status"
            value={report.status}
            onChange={(value) =>
              updateReport(
                'status',
                value
              )
            }
            options={REPORT_STATUSES.map(
              (status) => [
                status,
                status,
              ]
            )}
          />

          <Field
            label="Service Date"
            type="date"
            value={report.service_date}
            onChange={(value) =>
              updateReport(
                'service_date',
                value
              )
            }
          />

          <Field
            label="Arrival Time"
            type="time"
            value={report.arrival_time}
            onChange={(value) =>
              updateReport(
                'arrival_time',
                value
              )
            }
          />

          <Field
            label="Departure Time"
            type="time"
            value={report.departure_time}
            onChange={(value) =>
              updateReport(
                'departure_time',
                value
              )
            }
          />

          <SelectField
            label="Technician"
            value={report.technician_id}
            onChange={(value) =>
              updateReport(
                'technician_id',
                value
              )
            }
            options={[
              ['', 'Select technician'],
              ...employees.map(
                (employee) => [
                  employee.id,
                  employeeName(employee),
                ]
              ),
            ]}
          />

          <SelectField
            label="Customer"
            value={report.customer_id}
            onChange={(value) => {
              setReport((current) => ({
                ...current,
                customer_id: value,
                property_id: '',
                boat_lift_id: '',
                job_id: '',
              }))
            }}
            options={[
              ['', 'Select customer'],
              ...customers.map(
                (customer) => [
                  customer.id,
                  customerName(customer),
                ]
              ),
            ]}
          />

          <SelectField
            label="Property"
            value={report.property_id}
            onChange={(value) => {
              setReport((current) => ({
                ...current,
                property_id: value,
                boat_lift_id: '',
              }))
            }}
            options={[
              ['', 'No property'],
              ...filteredProperties.map(
                (property) => [
                  property.id,
                  propertyAddress(property),
                ]
              ),
            ]}
          />

          <SelectField
            label="Boat Lift"
            value={report.boat_lift_id}
            onChange={(value) =>
              updateReport(
                'boat_lift_id',
                value
              )
            }
            options={[
              ['', 'No boat lift'],
              ...filteredLifts.map(
                (lift) => [
                  lift.id,
                  lift.lift_number ||
                    lift.name ||
                    'Boat Lift',
                ]
              ),
            ]}
          />

          <SelectField
            label="Linked Job"
            value={report.job_id}
            onChange={applyJob}
            options={[
              ['', 'Select job'],
              ...filteredJobs.map(
                (job) => [
                  job.id,
                  `${job.number || 'Job'} · ${job.title || ''}`,
                ]
              ),
            ]}
          />
        </div>
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Weather</h2>

          <div className="form-grid">
            <SelectField
              label="Conditions"
              value={report.weather}
              onChange={(value) =>
                updateReport(
                  'weather',
                  value
                )
              }
              options={[
                ['', 'Select weather'],
                ...WEATHER_OPTIONS.map(
                  (weather) => [
                    weather,
                    weather,
                  ]
                ),
              ]}
            />

            <Field
              label="Temperature"
              value={
                report.temperature
              }
              onChange={(value) =>
                updateReport(
                  'temperature',
                  value
                )
              }
              placeholder="Example: 86°F"
            />
          </div>
        </section>

        <section className="panel">
          <div className="between">
            <div>
              <h2>GPS Location</h2>
              <p className="small">
                Capture the technician's
                current service location.
              </p>
            </div>

            <button
              type="button"
              className="secondary"
              onClick={captureLocation}
            >
              Capture Location
            </button>
          </div>

          <p>
            <b>Latitude:</b>{' '}
            {report.gps_latitude ||
              '—'}
          </p>

          <p>
            <b>Longitude:</b>{' '}
            {report.gps_longitude ||
              '—'}
          </p>
        </section>
      </div>

      <section className="panel">
        <h2>Work Performed</h2>

        <TextArea
          label="Work Description"
          value={
            report.work_performed
          }
          onChange={(value) =>
            updateReport(
              'work_performed',
              value
            )
          }
          rows={7}
        />
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2>Technician Notes</h2>

          <TextArea
            label="Technician Notes"
            value={
              report.technician_notes
            }
            onChange={(value) =>
              updateReport(
                'technician_notes',
                value
              )
            }
            rows={6}
          />
        </section>

        <section className="panel">
          <h2>Customer Notes</h2>

          <TextArea
            label="Customer Notes"
            value={
              report.customer_notes
            }
            onChange={(value) =>
              updateReport(
                'customer_notes',
                value
              )
            }
            rows={6}
          />
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>Boat Lift Condition</h2>

          <TextArea
            label="Condition"
            value={
              report.lift_condition
            }
            onChange={(value) =>
              updateReport(
                'lift_condition',
                value
              )
            }
            rows={6}
          />
        </section>

        <section className="panel">
          <h2>Recommended Repairs</h2>

          <TextArea
            label="Recommendations"
            value={
              report.recommendations
            }
            onChange={(value) =>
              updateReport(
                'recommendations',
                value
              )
            }
            rows={6}
          />
        </section>
      </div>

      <section className="panel">
        <h2>Warranty Information</h2>

        <TextArea
          label="Warranty Notes"
          value={
            report.warranty_notes
          }
          onChange={(value) =>
            updateReport(
              'warranty_notes',
              value
            )
          }
          rows={5}
        />
      </section>

      <ChecklistEditor
        title="Inspection Checklist"
        field="inspection_checklist"
        items={report.inspection_checklist}
        onChange={updateChecklist}
        onAdd={addChecklistItem}
        onRemove={removeChecklistItem}
      />

      <ChecklistEditor
        title="Safety Checklist"
        field="safety_checklist"
        items={report.safety_checklist}
        onChange={updateChecklist}
        onAdd={addChecklistItem}
        onRemove={removeChecklistItem}
      />

      <section className="panel">
        <div className="between">
          <h2>Materials Used</h2>

          <button
            type="button"
            className="secondary"
            onClick={addMaterial}
          >
            + Add Material
          </button>
        </div>

        <div className="cards">
          {report.materials_used.map(
            (item) => (
              <article
                className="card"
                key={item.id}
              >
                <div className="between">
                  <strong>Material</strong>

                  <button
                    type="button"
                    className="danger"
                    onClick={() =>
                      removeMaterial(
                        item.id
                      )
                    }
                  >
                    Remove
                  </button>
                </div>

                <div className="form-grid">
                  <Field
                    label="Item"
                    value={
                      item.name ||
                      item.description ||
                      ''
                    }
                    onChange={(value) =>
                      updateMaterial(
                        item.id,
                        'name',
                        value
                      )
                    }
                  />

                  <Field
                    label="Quantity"
                    type="number"
                    value={
                      item.quantity
                    }
                    onChange={(value) =>
                      updateMaterial(
                        item.id,
                        'quantity',
                        value
                      )
                    }
                  />

                  <Field
                    label="Unit"
                    value={item.unit}
                    onChange={(value) =>
                      updateMaterial(
                        item.id,
                        'unit',
                        value
                      )
                    }
                  />

                  <Field
                    label="Cost"
                    type="number"
                    value={
                      item.cost ||
                      item.unit_cost ||
                      0
                    }
                    onChange={(value) =>
                      updateMaterial(
                        item.id,
                        'cost',
                        value
                      )
                    }
                  />
                </div>
              </article>
            )
          )}

          {!report.materials_used.length && (
            <Empty>
              No materials added
            </Empty>
          )}
        </div>
      </section>

      <div className="grid-2">
        <PhotoEditor
          title="Before Photos"
          photos={report.before_photos}
          uploading={uploading}
          onUpload={(event) =>
            uploadPhotos(
              event,
              'before'
            )
          }
          onRemove={(photo) =>
            removePhoto(
              photo,
              'before'
            )
          }
        />

        <PhotoEditor
          title="After Photos"
          photos={report.after_photos}
          uploading={uploading}
          onUpload={(event) =>
            uploadPhotos(
              event,
              'after'
            )
          }
          onRemove={(photo) =>
            removePhoto(
              photo,
              'after'
            )
          }
        />
      </div>

      <section className="panel">
        <h2>Signatures</h2>

        <div className="grid-2">
          <SignaturePad
            title="Customer Signature"
            value={
              report.customer_signature
            }
            onChange={(value) =>
              updateReport(
                'customer_signature',
                value
              )
            }
          />

          <SignaturePad
            title="Technician Signature"
            value={
              report.technician_signature
            }
            onChange={(value) =>
              updateReport(
                'technician_signature',
                value
              )
            }
          />
        </div>
      </section>
    </form>
  )
}

function ChecklistEditor({
  title,
  field,
  items,
  onChange,
  onAdd,
  onRemove,
}) {
  return (
    <section className="panel">
      <div className="between">
        <h2>{title}</h2>

        <button
          type="button"
          className="secondary"
          onClick={() =>
            onAdd(field)
          }
        >
          + Add Item
        </button>
      </div>

      <div className="cards">
        {items.map((item) => (
          <article
            className="card"
            key={item.id}
          >
            <div className="between">
              <label>
                <input
                  type="checkbox"
                  checked={
                    item.completed
                  }
                  onChange={(event) =>
                    onChange(
                      field,
                      item.id,
                      'completed',
                      event.target.checked
                    )
                  }
                />
                {' '}
                Complete
              </label>

              <button
                type="button"
                className="danger"
                onClick={() =>
                  onRemove(
                    field,
                    item.id
                  )
                }
              >
                Remove
              </button>
            </div>

            <div className="form-grid">
              <Field
                label="Checklist Item"
                value={item.label}
                onChange={(value) =>
                  onChange(
                    field,
                    item.id,
                    'label',
                    value
                  )
                }
              />

              <Field
                label="Notes"
                value={item.notes}
                onChange={(value) =>
                  onChange(
                    field,
                    item.id,
                    'notes',
                    value
                  )
                }
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ChecklistViewer({ items }) {
  return (
    <div className="cards">
      {items.map((item) => (
        <article
          className="card"
          key={item.id}
        >
          <div className="between">
            <span>{item.label}</span>

            <Badge>
              {item.completed
                ? 'Complete'
                : 'Open'}
            </Badge>
          </div>

          {item.notes && (
            <p className="small">
              {item.notes}
            </p>
          )}
        </article>
      ))}
    </div>
  )
}

function PhotoEditor({
  title,
  photos,
  uploading,
  onUpload,
  onRemove,
}) {
  return (
    <section className="panel">
      <div className="between">
        <h2>{title}</h2>

        <label
          className="primary"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            cursor: uploading
              ? 'not-allowed'
              : 'pointer',
            opacity:
              uploading ? 0.6 : 1,
          }}
        >
          {uploading
            ? 'Uploading...'
            : '+ Add Photos'}

          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={onUpload}
            style={{
              display: 'none',
            }}
          />
        </label>
      </div>

      <div className="cards">
        {photos.map((photo) => (
          <article
            className="card"
            key={photo.id}
          >
            <img
              src={photo.url}
              alt={
                photo.name ||
                title
              }
              style={{
                width: '100%',
                height: 180,
                objectFit: 'cover',
                borderRadius: 10,
              }}
            />

            <div className="small">
              {photo.name ||
                'Service photo'}
            </div>

            <button
              type="button"
              className="danger"
              onClick={() =>
                onRemove(photo)
              }
            >
              Delete Photo
            </button>
          </article>
        ))}

        {!photos.length && (
          <Empty>
            No photos uploaded
          </Empty>
        )}
      </div>
    </section>
  )
}

function PhotoViewer({
  title,
  photos,
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>

      <div className="cards">
        {photos.map((photo) => (
          <article
            className="card"
            key={photo.id}
          >
            <img
              src={photo.url}
              alt={
                photo.name ||
                title
              }
              style={{
                width: '100%',
                height: 180,
                objectFit: 'cover',
                borderRadius: 10,
              }}
            />

            <div className="small">
              {photo.name ||
                'Service photo'}
            </div>
          </article>
        ))}

        {!photos.length && (
          <Empty>
            No photos uploaded
          </Empty>
        )}
      </div>
    </section>
  )
}

function SignaturePad({
  title,
  value,
  onChange,
}) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const context =
      canvas.getContext('2d')

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height
    )

    context.fillStyle = '#ffffff'
    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    )

    context.strokeStyle = '#0f172a'
    context.lineWidth = 2
    context.lineCap = 'round'

    if (value) {
      const image = new Image()

      image.onload = () => {
        context.drawImage(
          image,
          0,
          0,
          canvas.width,
          canvas.height
        )
      }

      image.src = value
    }
  }, [value])

  function pointerPosition(event) {
    const canvas = canvasRef.current
    const rectangle =
      canvas.getBoundingClientRect()

    return {
      x:
        (event.clientX - rectangle.left) *
        (canvas.width / rectangle.width),
      y:
        (event.clientY - rectangle.top) *
        (canvas.height / rectangle.height),
    }
  }

  function startDrawing(event) {
    event.preventDefault()
    drawingRef.current = true

    const context =
      canvasRef.current.getContext('2d')

    const point =
      pointerPosition(event)

    context.beginPath()
    context.moveTo(
      point.x,
      point.y
    )
  }

  function draw(event) {
    if (!drawingRef.current) {
      return
    }

    event.preventDefault()

    const context =
      canvasRef.current.getContext('2d')

    const point =
      pointerPosition(event)

    context.lineTo(
      point.x,
      point.y
    )
    context.stroke()
  }

  function stopDrawing(event) {
    if (!drawingRef.current) {
      return
    }

    event.preventDefault()
    drawingRef.current = false

    onChange(
      canvasRef.current.toDataURL(
        'image/png'
      )
    )
  }

  return (
    <div className="card">
      <div className="between">
        <strong>{title}</strong>

        <button
          type="button"
          className="secondary"
          onClick={() =>
            onChange('')
          }
        >
          Clear
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={700}
        height={220}
        onPointerDown={
          startDrawing
        }
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={
          stopDrawing
        }
        onPointerLeave={
          stopDrawing
        }
        style={{
          display: 'block',
          width: '100%',
          height: 180,
          marginTop: 12,
          background: '#ffffff',
          border:
            '1px solid #d6d9df',
          borderRadius: 10,
          touchAction: 'none',
          cursor: 'crosshair',
        }}
      />
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
}) {
  return (
    <label>
      <span
        style={{
          display: 'block',
          marginBottom: 6,
          fontWeight: 700,
        }}
      >
        {label}
      </span>

      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(event.target.value)
        }
        style={{
          width: '100%',
          padding: '11px 12px',
          border:
            '1px solid #cbd5e1',
          borderRadius: 8,
          font: 'inherit',
        }}
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}) {
  return (
    <label>
      <span
        style={{
          display: 'block',
          marginBottom: 6,
          fontWeight: 700,
        }}
      >
        {label}
      </span>

      <select
        value={value ?? ''}
        onChange={(event) =>
          onChange(event.target.value)
        }
        style={{
          width: '100%',
          padding: '11px 12px',
          border:
            '1px solid #cbd5e1',
          borderRadius: 8,
          font: 'inherit',
          background: '#ffffff',
        }}
      >
        {options.map(
          ([
            optionValue,
            optionLabel,
          ]) => (
            <option
              key={String(
                optionValue
              )}
              value={optionValue}
            >
              {optionLabel}
            </option>
          )
        )}
      </select>
    </label>
  )
}

function TextArea({
  label,
  value,
  onChange,
  rows = 4,
}) {
  return (
    <label>
      <span
        style={{
          display: 'block',
          marginBottom: 6,
          fontWeight: 700,
        }}
      >
        {label}
      </span>

      <textarea
        value={value ?? ''}
        rows={rows}
        onChange={(event) =>
          onChange(event.target.value)
        }
        style={{
          width: '100%',
          padding: '11px 12px',
          border:
            '1px solid #cbd5e1',
          borderRadius: 8,
          font: 'inherit',
          resize: 'vertical',
        }}
      />
    </label>
  )
}

function Badge({ children }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '5px 9px',
        borderRadius: 999,
        background: '#e2e8f0',
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  )
}

function Metric({
  label,
  value,
}) {
  return (
    <article className="metric">
      <div className="small">
        {label}
      </div>
      <div className="money">
        {value}
      </div>
    </article>
  )
}

function Empty({ children }) {
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
