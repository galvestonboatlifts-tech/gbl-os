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

function getLiftName(lift) {
  return (
    lift.name ||
    lift.lift_name ||
    lift.unit_name ||
    lift.serial_number ||
    lift.id
  )
}

function getLiftType(lift) {
  return (
    lift.lift_type ||
    lift.type ||
    lift.category ||
    'Unspecified'
  )
}

function getLiftCapacity(lift) {
  return numberValue(
    lift.capacity ||
      lift.capacity_lbs ||
      lift.weight_capacity ||
      lift.max_weight
  )
}

function getInstallDate(lift) {
  return (
    lift.install_date ||
    lift.installed_at ||
    lift.commissioned_at ||
    lift.created_at
  )
}

function getLastServiceDate(lift, reports) {
  const values = [
    lift.last_service_date,
    lift.last_serviced_at,
    ...reports.flatMap((report) => [
      report.service_date,
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

function getNextServiceDate(lift, lastServiceDate) {
  const explicit =
    lift.next_service_date ||
    lift.service_due_date ||
    lift.next_inspection_date

  if (explicit) {
    return new Date(explicit)
  }

  if (!lastServiceDate) {
    return null
  }

  const intervalMonths = numberValue(
    lift.service_interval_months ||
      lift.maintenance_interval_months ||
      12
  )

  const next = new Date(lastServiceDate)
  next.setMonth(
    next.getMonth() + intervalMonths
  )

  return next
}

function isActiveLift(lift) {
  return ![
    'inactive',
    'retired',
    'removed',
    'decommissioned',
    'sold',
  ].includes(normalize(lift.status))
}

function isOutOfService(lift) {
  return (
    [
      'out of service',
      'out_of_service',
      'down',
      'disabled',
      'repair needed',
    ].includes(normalize(lift.status)) ||
    lift.out_of_service === true
  )
}

function isWarrantyActive(lift) {
  const endValue =
    lift.warranty_end ||
    lift.warranty_expiration ||
    lift.warranty_expires_at

  if (!endValue) {
    return false
  }

  const endDate = new Date(endValue)

  return (
    !Number.isNaN(endDate.getTime()) &&
    endDate >= new Date()
  )
}

function daysUntil(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return Math.ceil(
    (date.getTime() - Date.now()) / DAY_MS
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

export default function BoatLiftReport({
  supabase: suppliedSupabase,
} = {}) {
  const supabase =
    suppliedSupabase || sharedSupabase

  const [boatLifts, setBoatLifts] =
    useState([])
  const [customers, setCustomers] =
    useState([])
  const [jobs, setJobs] = useState([])
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
  const [serviceFilter, setServiceFilter] =
    useState('all')
  const [typeFilter, setTypeFilter] =
    useState('all')
  const [warrantyFilter, setWarrantyFilter] =
    useState('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] =
    useState('nextService')
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
        liftsResult,
        customersResult,
        jobsResult,
        reportsResult,
        invoicesResult,
      ] = await Promise.all([
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

      setBoatLifts(liftsResult.data)
      setCustomers(customersResult.data)
      setJobs(jobsResult.data)
      setServiceReports(reportsResult.data)
      setInvoices(invoicesResult.data)

      const errors = [
        liftsResult.error,
        customersResult.error,
        jobsResult.error,
        reportsResult.error,
        invoicesResult.error,
      ].filter(Boolean)

      if (errors.length) {
        console.warn(
          'Boat lift reports loaded with limited data:',
          errors
        )

        setNotice(
          'Some boat lift data could not be loaded. Available information is still shown.'
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

  const reportsByLiftId = useMemo(() => {
    const grouped = {}

    serviceReports.forEach((report) => {
      const liftId =
        report.boat_lift_id ||
        report.lift_id

      if (!liftId) {
        return
      }

      if (!grouped[liftId]) {
        grouped[liftId] = []
      }

      grouped[liftId].push(report)
    })

    return grouped
  }, [serviceReports])

  const jobsByLiftId = useMemo(() => {
    const grouped = {}

    jobs.forEach((job) => {
      const liftId =
        job.boat_lift_id ||
        job.lift_id

      if (!liftId) {
        return
      }

      if (!grouped[liftId]) {
        grouped[liftId] = []
      }

      grouped[liftId].push(job)
    })

    return grouped
  }, [jobs])

  const invoicesByLiftId = useMemo(() => {
    const grouped = {}

    invoices.forEach((invoice) => {
      const liftId =
        invoice.boat_lift_id ||
        invoice.lift_id

      if (!liftId) {
        return
      }

      if (!grouped[liftId]) {
        grouped[liftId] = []
      }

      grouped[liftId].push(invoice)
    })

    return grouped
  }, [invoices])

  const liftRows = useMemo(() => {
    return boatLifts.map((lift) => {
      const reports =
        reportsByLiftId[lift.id] || []

      const liftJobs =
        jobsByLiftId[lift.id] || []

      const liftInvoices =
        invoicesByLiftId[lift.id] || []

      const lastServiceDate =
        getLastServiceDate(lift, reports)

      const nextServiceDate =
        getNextServiceDate(
          lift,
          lastServiceDate
        )

      const daysToService =
        daysUntil(nextServiceDate)

      const serviceDue =
        daysToService !== null &&
        daysToService <= 30

      const serviceOverdue =
        daysToService !== null &&
        daysToService < 0

      const revenue = liftInvoices.reduce(
        (total, invoice) =>
          total + getInvoiceTotal(invoice),
        0
      )

      const filteredReports = reports.filter(
        (report) =>
          inRange(
            report.service_date ||
              report.completed_at ||
              report.updated_at ||
              report.created_at,
            dateRange.start,
            dateRange.end
          )
      )

      const filteredJobs = liftJobs.filter(
        (job) =>
          inRange(
            job.completed_at ||
              job.updated_at ||
              job.created_at,
            dateRange.start,
            dateRange.end
          )
      )

      return {
        id: lift.id,
        lift,
        name: getLiftName(lift),
        type: getLiftType(lift),
        customer: getCustomerName(
          customerById[lift.customer_id]
        ),
        capacity: getLiftCapacity(lift),
        status: lift.status || 'Active',
        active: isActiveLift(lift),
        outOfService: isOutOfService(lift),
        warrantyActive:
          isWarrantyActive(lift),
        warrantyEnd:
          lift.warranty_end ||
          lift.warranty_expiration ||
          lift.warranty_expires_at,
        installDate: getInstallDate(lift),
        lastServiceDate,
        nextServiceDate,
        daysToService,
        serviceDue,
        serviceOverdue,
        reports: reports.length,
        recentReports:
          filteredReports.length,
        jobs: liftJobs.length,
        recentJobs: filteredJobs.length,
        revenue,
        manufacturer:
          lift.manufacturer ||
          lift.make ||
          '—',
        model:
          lift.model ||
          lift.model_number ||
          '—',
        serial:
          lift.serial_number ||
          lift.serial ||
          '—',
        location:
          lift.location ||
          lift.slip_number ||
          lift.address ||
          '—',
      }
    })
  }, [
    boatLifts,
    reportsByLiftId,
    jobsByLiftId,
    invoicesByLiftId,
    customerById,
    dateRange,
  ])

  const installedInPeriod = useMemo(
    () =>
      liftRows.filter((row) =>
        inRange(
          row.installDate,
          dateRange.start,
          dateRange.end
        )
      ),
    [liftRows, dateRange]
  )

  const activeLifts = useMemo(
    () =>
      liftRows.filter(
        (row) =>
          row.active && !row.outOfService
      ),
    [liftRows]
  )

  const outOfServiceLifts = useMemo(
    () =>
      liftRows.filter(
        (row) => row.outOfService
      ),
    [liftRows]
  )

  const serviceDueLifts = useMemo(
    () =>
      liftRows.filter(
        (row) =>
          row.serviceDue &&
          !row.serviceOverdue
      ),
    [liftRows]
  )

  const overdueServiceLifts = useMemo(
    () =>
      liftRows.filter(
        (row) => row.serviceOverdue
      ),
    [liftRows]
  )

  const warrantyLifts = useMemo(
    () =>
      liftRows.filter(
        (row) => row.warrantyActive
      ),
    [liftRows]
  )

  const totalCapacity = useMemo(
    () =>
      liftRows.reduce(
        (total, row) =>
          total + row.capacity,
        0
      ),
    [liftRows]
  )

  const averageCapacity =
    liftRows.length > 0
      ? totalCapacity / liftRows.length
      : 0

  const totalRevenue = useMemo(
    () =>
      liftRows.reduce(
        (total, row) =>
          total + row.revenue,
        0
      ),
    [liftRows]
  )

  const liftsByType = useMemo(() => {
    const totals = {}

    liftRows.forEach((row) => {
      totals[row.type] =
        (totals[row.type] || 0) + 1
    })

    return Object.entries(totals)
      .map(([label, value]) => ({
        label,
        value,
      }))
      .sort((a, b) => b.value - a.value)
  }, [liftRows])

  const liftsByManufacturer = useMemo(() => {
    const totals = {}

    liftRows.forEach((row) => {
      totals[row.manufacturer] =
        (totals[row.manufacturer] || 0) + 1
    })

    return Object.entries(totals)
      .map(([label, value]) => ({
        label,
        value,
      }))
      .sort((a, b) => b.value - a.value)
  }, [liftRows])

  const capacityBuckets = useMemo(() => {
    const buckets = {
      'Under 10,000 lb': 0,
      '10,000–19,999 lb': 0,
      '20,000–29,999 lb': 0,
      '30,000–39,999 lb': 0,
      '40,000+ lb': 0,
      Unspecified: 0,
    }

    liftRows.forEach((row) => {
      const capacity = row.capacity

      if (!capacity) {
        buckets.Unspecified += 1
      } else if (capacity < 10000) {
        buckets['Under 10,000 lb'] += 1
      } else if (capacity < 20000) {
        buckets['10,000–19,999 lb'] += 1
      } else if (capacity < 30000) {
        buckets['20,000–29,999 lb'] += 1
      } else if (capacity < 40000) {
        buckets['30,000–39,999 lb'] += 1
      } else {
        buckets['40,000+ lb'] += 1
      }
    })

    return Object.entries(buckets).map(
      ([label, value]) => ({
        label,
        value,
      })
    )
  }, [liftRows])

  const serviceStatus = useMemo(
    () => [
      {
        label: 'Current',
        value: liftRows.filter(
          (row) =>
            !row.serviceDue &&
            !row.serviceOverdue
        ).length,
      },
      {
        label: 'Due in 30 Days',
        value: serviceDueLifts.length,
      },
      {
        label: 'Overdue',
        value: overdueServiceLifts.length,
      },
      {
        label: 'No Schedule',
        value: liftRows.filter(
          (row) => !row.nextServiceDate
        ).length,
      },
    ],
    [
      liftRows,
      serviceDueLifts,
      overdueServiceLifts,
    ]
  )

  const liftTypes = useMemo(
    () =>
      Array.from(
        new Set(
          liftRows
            .map((row) => row.type)
            .filter(Boolean)
        )
      ).sort(),
    [liftRows]
  )

  const visibleLifts = useMemo(() => {
    const searchValue = normalize(search)

    let rows = liftRows.filter((row) => {
      if (
        statusFilter === 'active' &&
        (!row.active || row.outOfService)
      ) {
        return false
      }

      if (
        statusFilter === 'outOfService' &&
        !row.outOfService
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
        serviceFilter === 'due' &&
        !row.serviceDue
      ) {
        return false
      }

      if (
        serviceFilter === 'overdue' &&
        !row.serviceOverdue
      ) {
        return false
      }

      if (
        serviceFilter === 'current' &&
        (row.serviceDue ||
          row.serviceOverdue)
      ) {
        return false
      }

      if (
        typeFilter !== 'all' &&
        normalize(row.type) !==
          normalize(typeFilter)
      ) {
        return false
      }

      if (
        warrantyFilter === 'active' &&
        !row.warrantyActive
      ) {
        return false
      }

      if (
        warrantyFilter === 'expired' &&
        row.warrantyActive
      ) {
        return false
      }

      if (searchValue) {
        const searchable = [
          row.name,
          row.customer,
          row.type,
          row.manufacturer,
          row.model,
          row.serial,
          row.location,
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

      if (sortBy === 'customer') {
        left = a.customer
        right = b.customer
      } else if (sortBy === 'capacity') {
        left = a.capacity
        right = b.capacity
      } else if (sortBy === 'installDate') {
        left = new Date(
          a.installDate || 0
        ).getTime()

        right = new Date(
          b.installDate || 0
        ).getTime()
      } else if (sortBy === 'revenue') {
        left = a.revenue
        right = b.revenue
      } else if (sortBy === 'name') {
        left = a.name
        right = b.name
      } else {
        left = a.nextServiceDate
          ? new Date(
              a.nextServiceDate
            ).getTime()
          : Number.MAX_SAFE_INTEGER

        right = b.nextServiceDate
          ? new Date(
              b.nextServiceDate
            ).getTime()
          : Number.MAX_SAFE_INTEGER
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
    liftRows,
    search,
    statusFilter,
    serviceFilter,
    typeFilter,
    warrantyFilter,
    sortBy,
    sortDirection,
  ])

  function exportBoatLiftReport() {
    const stamp = new Date()
      .toISOString()
      .slice(0, 10)

    downloadCsv(
      `gbl-boat-lift-report-${stamp}.csv`,
      [
        ['GBL OS Boat Lift Report'],
        [
          'Generated',
          new Date().toLocaleString('en-US'),
        ],
        [],
        ['Metric', 'Value'],
        ['Total Boat Lifts', liftRows.length],
        ['Active Boat Lifts', activeLifts.length],
        [
          'Installed in Period',
          installedInPeriod.length,
        ],
        [
          'Out of Service',
          outOfServiceLifts.length,
        ],
        [
          'Service Due',
          serviceDueLifts.length,
        ],
        [
          'Service Overdue',
          overdueServiceLifts.length,
        ],
        [
          'Warranty Active',
          warrantyLifts.length,
        ],
        [
          'Average Capacity',
          averageCapacity,
        ],
        ['Total Lift Revenue', totalRevenue],
        [],
        ['Lift Type', 'Count'],
        ...liftsByType.map((item) => [
          item.label,
          item.value,
        ]),
        [],
        ['Manufacturer', 'Count'],
        ...liftsByManufacturer.map((item) => [
          item.label,
          item.value,
        ]),
        [],
        ['Capacity Range', 'Count'],
        ...capacityBuckets.map((item) => [
          item.label,
          item.value,
        ]),
        [],
        ['Service Status', 'Count'],
        ...serviceStatus.map((item) => [
          item.label,
          item.value,
        ]),
        [],
        [
          'Boat Lift',
          'Customer',
          'Type',
          'Manufacturer',
          'Model',
          'Serial',
          'Capacity',
          'Status',
          'Installed',
          'Last Service',
          'Next Service',
          'Warranty End',
          'Jobs',
          'Service Reports',
          'Revenue',
          'Location',
        ],
        ...visibleLifts.map((row) => [
          row.name,
          row.customer,
          row.type,
          row.manufacturer,
          row.model,
          row.serial,
          row.capacity,
          row.status,
          row.installDate || '',
          row.lastServiceDate || '',
          row.nextServiceDate || '',
          row.warrantyEnd || '',
          row.jobs,
          row.reports,
          row.revenue,
          row.location,
        ]),
      ]
    )
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Boat Lift Reports</h2>
        <p>Loading boat lift data...</p>
      </section>
    )
  }

  return (
    <div className="boat-lift-report">
      <div className="toolbar">
        <div>
          <h1 style={{ margin: 0 }}>
            Boat Lift Reports
          </h1>

          <div
            className="small"
            style={{ marginTop: 6 }}
          >
            Installed lifts, service schedules,
            capacities, warranties, and revenue
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
            onClick={exportBoatLiftReport}
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
          label="Total Boat Lifts"
          value={formatNumber(liftRows.length)}
        />
        <Metric
          label="Active Lifts"
          value={formatNumber(
            activeLifts.length
          )}
        />
        <Metric
          label="Installed in Period"
          value={formatNumber(
            installedInPeriod.length
          )}
        />
        <Metric
          label="Out of Service"
          value={formatNumber(
            outOfServiceLifts.length
          )}
        />
      </div>

      <div className="metrics">
        <Metric
          label="Service Due"
          value={formatNumber(
            serviceDueLifts.length
          )}
        />
        <Metric
          label="Service Overdue"
          value={formatNumber(
            overdueServiceLifts.length
          )}
        />
        <Metric
          label="Warranty Active"
          value={formatNumber(
            warrantyLifts.length
          )}
        />
        <Metric
          label="Average Capacity"
          value={`${formatNumber(
            averageCapacity
          )} lb`}
        />
      </div>

      <div className="metrics">
        <Metric
          label="Total Capacity"
          value={`${formatNumber(
            totalCapacity
          )} lb`}
        />
        <Metric
          label="Lift Revenue"
          value={formatCurrency(totalRevenue)}
        />
        <Metric
          label="Service Reports"
          value={formatNumber(
            serviceReports.length
          )}
        />
        <Metric
          label="Lift-Linked Jobs"
          value={formatNumber(
            liftRows.reduce(
              (total, row) =>
                total + row.jobs,
              0
            )
          )}
        />
      </div>

      <div className="grid-2">
        <BarPanel
          title="Boat Lifts by Type"
          items={liftsByType}
          formatter={formatNumber}
        />

        <BarPanel
          title="Boat Lifts by Manufacturer"
          items={liftsByManufacturer}
          formatter={formatNumber}
        />
      </div>

      <div className="grid-2">
        <BarPanel
          title="Capacity Distribution"
          items={capacityBuckets}
          formatter={formatNumber}
        />

        <BarPanel
          title="Service Schedule Status"
          items={serviceStatus}
          formatter={formatNumber}
        />
      </div>

      <section className="panel">
        <h2>Upcoming and Overdue Service</h2>

        <DataTable
          headers={[
            'Boat Lift',
            'Customer',
            'Last Service',
            'Next Service',
            'Days',
            'Status',
          ]}
          rows={liftRows
            .filter(
              (row) =>
                row.serviceDue ||
                row.serviceOverdue
            )
            .sort((a, b) => {
              const left =
                a.daysToService ??
                Number.MAX_SAFE_INTEGER

              const right =
                b.daysToService ??
                Number.MAX_SAFE_INTEGER

              return left - right
            })
            .map((row) => [
              row.name,
              row.customer,
              formatDate(row.lastServiceDate),
              formatDate(row.nextServiceDate),
              row.daysToService === null
                ? '—'
                : formatNumber(
                    row.daysToService
                  ),
              row.serviceOverdue
                ? 'Overdue'
                : 'Due Soon',
            ])}
          emptyMessage="No boat lifts are due for service."
        />
      </section>

      <section className="panel">
        <div className="between">
          <div>
            <h2 style={{ marginBottom: 4 }}>
              Boat Lift Detail
            </h2>

            <div className="small">
              Search, filter, sort, and export
              the complete lift registry
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
                <option value="outOfService">
                  Out of Service
                </option>
                <option value="inactive">
                  Inactive
                </option>
              </select>
            </label>

            <label>
              <span className="small">
                Service
              </span>

              <select
                value={serviceFilter}
                onChange={(event) =>
                  setServiceFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  All
                </option>
                <option value="current">
                  Current
                </option>
                <option value="due">
                  Due Soon
                </option>
                <option value="overdue">
                  Overdue
                </option>
              </select>
            </label>

            <label>
              <span className="small">
                Lift Type
              </span>

              <select
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(
                    event.target.value
                  )
                }
              >
                <option value="all">
                  All
                </option>

                {liftTypes.map((type) => (
                  <option
                    key={type}
                    value={type}
                  >
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="small">
                Warranty
              </span>

              <select
                value={warrantyFilter}
                onChange={(event) =>
                  setWarrantyFilter(
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
                <option value="expired">
                  Expired / None
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
                <option value="nextService">
                  Next Service
                </option>
                <option value="customer">
                  Customer
                </option>
                <option value="capacity">
                  Capacity
                </option>
                <option value="installDate">
                  Install Date
                </option>
                <option value="revenue">
                  Revenue
                </option>
                <option value="name">
                  Lift Name
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
                placeholder="Lift, customer, serial..."
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
            'Boat Lift',
            'Customer',
            'Type',
            'Manufacturer / Model',
            'Capacity',
            'Status',
            'Installed',
            'Last Service',
            'Next Service',
            'Warranty',
            'Jobs',
            'Reports',
            'Revenue',
          ]}
          rows={visibleLifts.map((row) => [
            <div key={`${row.id}-lift`}>
              <strong>{row.name}</strong>
              <div className="small">
                Serial: {row.serial}
              </div>
            </div>,
            row.customer,
            row.type,
            <div key={`${row.id}-model`}>
              <div>{row.manufacturer}</div>
              <div className="small">
                {row.model}
              </div>
            </div>,
            row.capacity
              ? `${formatNumber(
                  row.capacity
                )} lb`
              : '—',
            row.status,
            formatDate(row.installDate),
            formatDate(row.lastServiceDate),
            formatDate(row.nextServiceDate),
            row.warrantyActive
              ? `Active through ${formatDate(
                  row.warrantyEnd
                )}`
              : 'Expired / None',
            formatNumber(row.jobs),
            formatNumber(row.reports),
            formatCurrency(row.revenue),
          ])}
          emptyMessage="No boat lifts match the current filters."
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
