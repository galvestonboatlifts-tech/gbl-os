import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge, Empty, Field, Modal, SelectField } from '../../components/UI'
import { supabase } from '../../lib/supabase'

const ASSET_TYPE_OPTIONS = [
  'Truck',
  'Trailer',
  'Boat',
  'Forklift',
  'Skid Steer',
  'Generator',
  'Compressor',
  'Welder',
  'Heavy Equipment',
  'Other',
]

const ASSET_STATUS_OPTIONS = [
  'Active',
  'Maintenance',
  'Out of Service',
  'Reserved',
  'Sold',
  'Retired',
]

const OWNERSHIP_OPTIONS = ['Owned', 'Financed', 'Leased', 'Rented']
const FUEL_TYPE_OPTIONS = ['Gasoline', 'Diesel', 'Electric', 'Propane', 'Other']
const SERVICE_STATUS_OPTIONS = ['Scheduled', 'In Progress', 'Completed', 'Cancelled']
const INSPECTION_STATUS_OPTIONS = ['Pass', 'Fail', 'Conditional']
const DOCUMENT_TYPE_OPTIONS = [
  'Registration',
  'Insurance',
  'Title',
  'Inspection',
  'Warranty',
  'Purchase Agreement',
  'Lease Agreement',
  'Photo',
  'Other',
]

const EMPTY_ASSET = {
  asset_number: '',
  name: '',
  type: 'Truck',
  status: 'Active',
  ownership: 'Owned',
  year: '',
  make: '',
  model: '',
  trim: '',
  vin: '',
  serial_number: '',
  license_plate: '',
  license_state: 'TX',
  color: '',
  fuel_type: 'Gasoline',
  tank_capacity: '',
  mileage: '',
  hours: '',
  purchase_date: '',
  purchase_price: '',
  current_value: '',
  loan_balance: '',
  monthly_payment: '',
  lease_end_date: '',
  warranty_expiration: '',
  warranty_mileage: '',
  registration_expiration: '',
  insurance_expiration: '',
  inspection_expiration: '',
  assigned_employee_id: '',
  gps_device_id: '',
  home_location: '',
  next_service_date: '',
  next_service_mileage: '',
  next_service_hours: '',
  service_interval_miles: '',
  service_interval_hours: '',
  service_interval_days: '',
  tire_size: '',
  notes: '',
}

const EMPTY_MAINTENANCE = {
  service_date: new Date().toISOString().slice(0, 10),
  service_type: '',
  status: 'Completed',
  vendor_id: '',
  vendor_name: '',
  odometer: '',
  engine_hours: '',
  labor_cost: '',
  parts_cost: '',
  tax: '',
  total_cost: '',
  invoice_number: '',
  next_service_date: '',
  next_service_mileage: '',
  next_service_hours: '',
  downtime_hours: '',
  description: '',
  technician_notes: '',
}

const EMPTY_FUEL_LOG = {
  fuel_date: new Date().toISOString().slice(0, 10),
  employee_id: '',
  odometer: '',
  engine_hours: '',
  gallons: '',
  price_per_gallon: '',
  total_cost: '',
  vendor: '',
  receipt_number: '',
  full_tank: true,
  notes: '',
}

const EMPTY_INSPECTION = {
  inspection_date: new Date().toISOString().slice(0, 10),
  employee_id: '',
  inspection_type: 'Pre-Trip',
  status: 'Pass',
  odometer: '',
  engine_hours: '',
  tires_ok: true,
  lights_ok: true,
  brakes_ok: true,
  fluids_ok: true,
  safety_equipment_ok: true,
  damage_found: false,
  defects: '',
  corrective_action: '',
  notes: '',
}

const EMPTY_DOCUMENT = {
  document_type: 'Registration',
  title: '',
  document_number: '',
  issue_date: '',
  expiration_date: '',
  file_url: '',
  notes: '',
}

const EMPTY_TIRE = {
  position: '',
  brand: '',
  model: '',
  size: '',
  serial_number: '',
  installed_date: '',
  installed_mileage: '',
  current_tread_depth: '',
  purchase_cost: '',
  status: 'In Service',
  notes: '',
}

function createId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function cleanText(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function cleanNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return '—'
  const text = String(value)
  const date = new Date(text.length === 10 ? `${text}T12:00:00` : text)
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString()
}

function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
  }).format(Number(value || 0))
}

function assetTitle(asset) {
  return (
    asset.name ||
    [asset.year, asset.make, asset.model].filter(Boolean).join(' ') ||
    asset.asset_number ||
    'Unnamed Asset'
  )
}

function daysUntil(value) {
  if (!value) return null
  const target = new Date(`${value}T12:00:00`)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return Math.ceil((target - today) / 86400000)
}

function isPast(value) {
  const days = daysUntil(value)
  return days !== null && days < 0
}

function maintenanceTotal(record) {
  const enteredTotal = cleanNumber(record.total_cost)
  if (enteredTotal !== null) return enteredTotal

  return (
    Number(record.labor_cost || 0) +
    Number(record.parts_cost || 0) +
    Number(record.tax || 0)
  )
}

function fuelTotal(record) {
  const enteredTotal = cleanNumber(record.total_cost)
  if (enteredTotal !== null) return enteredTotal

  return Number(record.gallons || 0) * Number(record.price_per_gallon || 0)
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function downloadFile(filename, content, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function safeFilename(value) {
  return String(value || 'fleet-asset')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function calculateFuelEfficiency(records) {
  const usable = [...records]
    .filter(
      (record) =>
        record.full_tank &&
        cleanNumber(record.odometer) !== null &&
        cleanNumber(record.gallons) !== null
    )
    .sort(
      (a, b) =>
        new Date(a.fuel_date || 0).getTime() -
        new Date(b.fuel_date || 0).getTime()
    )

  let miles = 0
  let gallons = 0

  for (let index = 1; index < usable.length; index += 1) {
    const previousMileage = Number(usable[index - 1].odometer || 0)
    const currentMileage = Number(usable[index].odometer || 0)
    const distance = currentMileage - previousMileage

    if (distance > 0) {
      miles += distance
      gallons += Number(usable[index].gallons || 0)
    }
  }

  return {
    miles,
    gallons,
    mpg: gallons > 0 ? miles / gallons : 0,
  }
}

function calculateAssetHealth(asset, inspectionsForAsset, documentsForAsset) {
  let score = 100

  if (asset.status === 'Out of Service') score -= 45
  if (asset.status === 'Maintenance') score -= 20
  if (serviceDue(asset)) score -= 20

  const failedInspection = inspectionsForAsset.some(
    (record) => record.status === 'Fail'
  )
  if (failedInspection) score -= 20

  const complianceDates = [
    asset.registration_expiration,
    asset.insurance_expiration,
    asset.inspection_expiration,
  ]

  complianceDates.forEach((value) => {
    const remaining = daysUntil(value)
    if (remaining !== null && remaining < 0) score -= 15
    else if (remaining !== null && remaining <= 30) score -= 7
  })

  const expiredDocument = documentsForAsset.some((record) =>
    isPast(record.expiration_date)
  )
  if (expiredDocument) score -= 10

  return Math.max(0, Math.min(100, score))
}

function healthLabel(score) {
  if (score >= 90) return 'Excellent'
  if (score >= 75) return 'Good'
  if (score >= 55) return 'Needs Attention'
  return 'Critical'
}

function buildFleetAlerts(assets, inspections, documents) {
  const alerts = []

  assets.forEach((asset) => {
    const title = assetTitle(asset)

    if (serviceDue(asset)) {
      alerts.push({
        id: `service-${asset.id}`,
        asset_id: asset.id,
        severity: 'High',
        title: 'Service due',
        message: `${title} has reached a service date, mileage, or hour threshold.`,
      })
    }

    ;[
      ['Registration', asset.registration_expiration],
      ['Insurance', asset.insurance_expiration],
      ['Inspection', asset.inspection_expiration],
    ].forEach(([label, value]) => {
      const remaining = daysUntil(value)
      if (remaining === null) return

      if (remaining < 0) {
        alerts.push({
          id: `${label}-${asset.id}`,
          asset_id: asset.id,
          severity: 'Critical',
          title: `${label} expired`,
          message: `${title} expired ${Math.abs(remaining)} day(s) ago.`,
        })
      } else if (remaining <= 30) {
        alerts.push({
          id: `${label}-${asset.id}`,
          asset_id: asset.id,
          severity: 'Medium',
          title: `${label} due soon`,
          message: `${title} expires in ${remaining} day(s).`,
        })
      }
    })

    if (asset.status === 'Out of Service') {
      alerts.push({
        id: `out-${asset.id}`,
        asset_id: asset.id,
        severity: 'Critical',
        title: 'Asset out of service',
        message: `${title} is currently unavailable.`,
      })
    }
  })

  inspections
    .filter((record) => record.status === 'Fail')
    .forEach((record) => {
      const asset = assets.find((item) => item.id === record.asset_id)
      alerts.push({
        id: `inspection-${record.id}`,
        asset_id: record.asset_id,
        severity: 'Critical',
        title: 'Failed inspection',
        message: `${assetTitle(asset || {})}: ${
          record.defects || 'Corrective action is required.'
        }`,
      })
    })

  documents
    .filter((record) => isPast(record.expiration_date))
    .forEach((record) => {
      const asset = assets.find((item) => item.id === record.asset_id)
      alerts.push({
        id: `document-${record.id}`,
        asset_id: record.asset_id,
        severity: 'Medium',
        title: 'Document expired',
        message: `${assetTitle(asset || {})}: ${
          record.title || record.document_type || 'Document'
        } expired.`,
      })
    })

  const priority = { Critical: 0, High: 1, Medium: 2, Low: 3 }
  return alerts.sort(
    (a, b) => (priority[a.severity] ?? 9) - (priority[b.severity] ?? 9)
  )
}

function buildAssetCsv(
  asset,
  maintenanceForAsset,
  fuelForAsset,
  inspectionsForAsset,
  documentsForAsset,
  tiresForAsset
) {
  const rows = [
    ['Section', 'Date', 'Type', 'Description', 'Mileage', 'Hours', 'Cost', 'Status'],
  ]

  maintenanceForAsset.forEach((record) => {
    rows.push([
      'Maintenance',
      record.service_date,
      record.service_type,
      record.description,
      record.odometer,
      record.engine_hours,
      maintenanceTotal(record),
      record.status,
    ])
  })

  fuelForAsset.forEach((record) => {
    rows.push([
      'Fuel',
      record.fuel_date,
      record.vendor,
      `${record.gallons || 0} gallons`,
      record.odometer,
      record.engine_hours,
      fuelTotal(record),
      record.full_tank ? 'Full Tank' : 'Partial',
    ])
  })

  inspectionsForAsset.forEach((record) => {
    rows.push([
      'Inspection',
      record.inspection_date,
      record.inspection_type,
      record.defects || record.notes,
      record.odometer,
      record.engine_hours,
      '',
      record.status,
    ])
  })

  documentsForAsset.forEach((record) => {
    rows.push([
      'Document',
      record.issue_date,
      record.document_type,
      record.title,
      '',
      '',
      '',
      expirationBadge(record.expiration_date),
    ])
  })

  tiresForAsset.forEach((record) => {
    rows.push([
      'Tire',
      record.installed_date,
      record.position,
      [record.brand, record.model, record.size].filter(Boolean).join(' '),
      record.installed_mileage,
      '',
      record.purchase_cost,
      record.status,
    ])
  })

  const header = [
    `Fleet Asset: ${assetTitle(asset)}`,
    `Asset Number: ${asset.asset_number || ''}`,
    `VIN/Serial: ${asset.vin || asset.serial_number || ''}`,
    '',
  ]

  return `${header.join('\n')}\n${rows
    .map((row) => row.map(csvCell).join(','))
    .join('\n')}`
}

function printAssetSummary(
  asset,
  assignedEmployee,
  maintenanceForAsset,
  fuelForAsset,
  inspectionsForAsset,
  documentsForAsset
) {
  const maintenanceCost = maintenanceForAsset.reduce(
    (sum, record) => sum + maintenanceTotal(record),
    0
  )
  const fuelCost = fuelForAsset.reduce(
    (sum, record) => sum + fuelTotal(record),
    0
  )
  const efficiency = calculateFuelEfficiency(fuelForAsset)

  const popup = window.open('', '_blank', 'width=1000,height=800')
  if (!popup) {
    alert('Allow pop-ups to print the fleet report.')
    return
  }

  popup.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${assetTitle(asset)} Fleet Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #172033; }
          h1, h2 { margin-bottom: 8px; }
          .muted { color: #667085; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0; }
          .box { border: 1px solid #d0d5dd; border-radius: 8px; padding: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { text-align: left; border-bottom: 1px solid #eaecf0; padding: 8px; }
          @media print { button { display: none; } body { margin: 12px; } }
        </style>
      </head>
      <body>
        <button onclick="window.print()">Print</button>
        <h1>${assetTitle(asset)}</h1>
        <div class="muted">${asset.asset_number || 'No asset number'} · ${
          asset.type || 'Other'
        } · ${asset.status || 'Active'}</div>

        <div class="grid">
          <div class="box"><b>Mileage</b><br>${formatNumber(asset.mileage)}</div>
          <div class="box"><b>Hours</b><br>${formatNumber(asset.hours, 1)}</div>
          <div class="box"><b>Maintenance</b><br>${formatCurrency(
            maintenanceCost
          )}</div>
          <div class="box"><b>Fuel</b><br>${formatCurrency(fuelCost)}</div>
        </div>

        <h2>Asset Information</h2>
        <table>
          <tr><th>Vehicle</th><td>${[asset.year, asset.make, asset.model]
            .filter(Boolean)
            .join(' ') || '—'}</td></tr>
          <tr><th>VIN / Serial</th><td>${
            asset.vin || asset.serial_number || '—'
          }</td></tr>
          <tr><th>License Plate</th><td>${
            [asset.license_plate, asset.license_state]
              .filter(Boolean)
              .join(' ') || '—'
          }</td></tr>
          <tr><th>Assigned Employee</th><td>${
            assignedEmployee ? employeeName(assignedEmployee) : 'Unassigned'
          }</td></tr>
          <tr><th>Next Service</th><td>${formatDate(
            asset.next_service_date
          )}</td></tr>
          <tr><th>Average MPG</th><td>${
            efficiency.mpg ? efficiency.mpg.toFixed(2) : '—'
          }</td></tr>
        </table>

        <h2>Recent Maintenance</h2>
        <table>
          <thead><tr><th>Date</th><th>Service</th><th>Status</th><th>Cost</th></tr></thead>
          <tbody>
            ${maintenanceForAsset
              .slice(0, 10)
              .map(
                (record) => `
                  <tr>
                    <td>${formatDate(record.service_date)}</td>
                    <td>${record.service_type || 'Service'}</td>
                    <td>${record.status || 'Completed'}</td>
                    <td>${formatCurrency(maintenanceTotal(record))}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>

        <h2>Compliance Documents</h2>
        <table>
          <thead><tr><th>Document</th><th>Expires</th><th>Status</th></tr></thead>
          <tbody>
            ${documentsForAsset
              .map(
                (record) => `
                  <tr>
                    <td>${record.title || record.document_type || 'Document'}</td>
                    <td>${formatDate(record.expiration_date)}</td>
                    <td>${expirationBadge(record.expiration_date)}</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </body>
    </html>
  `)

  popup.document.close()
}

function missingColumnName(error) {
  const message = String(error?.message || '')
  const patterns = [
    /Could not find the ['"]([^'"]+)['"] column/i,
    /column ["']?([^"' ]+)["']? of relation/i,
    /column ([a-zA-Z0-9_]+) does not exist/i,
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) return match[1]
  }

  return null
}

async function adaptiveUpsert(table, payload) {
  const working = { ...payload }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await supabase
      .from(table)
      .upsert(working, { onConflict: 'id' })
      .select()
      .single()

    if (!result.error) return result

    const missing = missingColumnName(result.error)
    if (!missing || !(missing in working)) return result
    delete working[missing]
  }

  return {
    data: null,
    error: new Error(`Unable to save record to ${table}.`),
  }
}

async function safeSelect(table, orderColumn = 'created_at', ascending = false) {
  const result = await supabase
    .from(table)
    .select('*')
    .order(orderColumn, { ascending })

  if (!result.error) {
    return { data: Array.isArray(result.data) ? result.data : [], error: null }
  }

  const message = String(result.error.message || '').toLowerCase()
  if (message.includes('does not exist') || message.includes('schema cache')) {
    return { data: [], error: null }
  }

  return { data: [], error: result.error }
}

function expirationBadge(value) {
  const remaining = daysUntil(value)
  if (remaining === null) return 'Not Set'
  if (remaining < 0) return 'Expired'
  if (remaining <= 30) return 'Due Soon'
  return 'Current'
}

function serviceDue(asset) {
  const mileage = Number(asset.mileage || 0)
  const hours = Number(asset.hours || 0)
  const nextMileage = cleanNumber(asset.next_service_mileage)
  const nextHours = cleanNumber(asset.next_service_hours)

  if (isPast(asset.next_service_date)) return true
  if (nextMileage !== null && mileage >= nextMileage) return true
  if (nextHours !== null && hours >= nextHours) return true
  return false
}

export default function FleetModule() {
  const [assets, setAssets] = useState([])
  const [employees, setEmployees] = useState([])
  const [vendors, setVendors] = useState([])
  const [maintenanceRecords, setMaintenanceRecords] = useState([])
  const [fuelLogs, setFuelLogs] = useState([])
  const [inspections, setInspections] = useState([])
  const [documents, setDocuments] = useState([])
  const [tires, setTires] = useState([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedAssetId, setSelectedAssetId] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')

  const [assetEditor, setAssetEditor] = useState(null)
  const [maintenanceEditor, setMaintenanceEditor] = useState(null)
  const [fuelEditor, setFuelEditor] = useState(null)
  const [inspectionEditor, setInspectionEditor] = useState(null)
  const [documentEditor, setDocumentEditor] = useState(null)
  const [tireEditor, setTireEditor] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    const results = await Promise.all([
      safeSelect('fleet_assets', 'name', true),
      safeSelect('employees', 'last_name', true),
      safeSelect('vendors', 'name', true),
      safeSelect('fleet_maintenance', 'service_date', false),
      safeSelect('fleet_fuel_logs', 'fuel_date', false),
      safeSelect('fleet_inspections', 'inspection_date', false),
      safeSelect('fleet_documents', 'expiration_date', true),
      safeSelect('fleet_tires', 'installed_date', false),
    ])

    const errors = results.map((result) => result.error).filter(Boolean)
    if (errors.length) {
      setErrorMessage(errors.map((error) => error.message).join(' | '))
    }

    setAssets(results[0].data)
    setEmployees(results[1].data)
    setVendors(results[2].data)
    setMaintenanceRecords(results[3].data)
    setFuelLogs(results[4].data)
    setInspections(results[5].data)
    setDocuments(results[6].data)
    setTires(results[7].data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const employeeById = useMemo(
    () => Object.fromEntries(employees.map((employee) => [employee.id, employee])),
    [employees]
  )

  const vendorById = useMemo(
    () => Object.fromEntries(vendors.map((vendor) => [vendor.id, vendor])),
    [vendors]
  )

  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.id === selectedAssetId) || null,
    [assets, selectedAssetId]
  )

  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase()

    return assets.filter((asset) => {
      if (typeFilter && asset.type !== typeFilter) return false
      if (statusFilter && (asset.status || 'Active') !== statusFilter) return false
      if (!query) return true

      return [
        assetTitle(asset),
        asset.asset_number,
        asset.type,
        asset.status,
        asset.make,
        asset.model,
        asset.vin,
        asset.serial_number,
        asset.license_plate,
        asset.home_location,
        asset.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [assets, search, statusFilter, typeFilter])

  const selectedMaintenance = useMemo(
    () => maintenanceRecords.filter((record) => record.asset_id === selectedAssetId),
    [maintenanceRecords, selectedAssetId]
  )

  const selectedFuelLogs = useMemo(
    () => fuelLogs.filter((record) => record.asset_id === selectedAssetId),
    [fuelLogs, selectedAssetId]
  )

  const selectedInspections = useMemo(
    () => inspections.filter((record) => record.asset_id === selectedAssetId),
    [inspections, selectedAssetId]
  )

  const selectedDocuments = useMemo(
    () => documents.filter((record) => record.asset_id === selectedAssetId),
    [documents, selectedAssetId]
  )

  const selectedTires = useMemo(
    () => tires.filter((record) => record.asset_id === selectedAssetId),
    [tires, selectedAssetId]
  )

  const dashboard = useMemo(() => {
    const active = assets.filter((asset) => (asset.status || 'Active') === 'Active').length
    const maintenance = assets.filter((asset) => asset.status === 'Maintenance').length
    const outOfService = assets.filter((asset) => asset.status === 'Out of Service').length
    const serviceOverdue = assets.filter(serviceDue).length

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const maintenanceCost = maintenanceRecords
      .filter((record) => new Date(record.service_date || 0) >= monthStart)
      .reduce((sum, record) => sum + maintenanceTotal(record), 0)

    const fuelCost = fuelLogs
      .filter((record) => new Date(record.fuel_date || 0) >= monthStart)
      .reduce((sum, record) => sum + fuelTotal(record), 0)

    return {
      active,
      maintenance,
      outOfService,
      serviceOverdue,
      maintenanceCost,
      fuelCost,
    }
  }, [assets, fuelLogs, maintenanceRecords])

  const fleetAlerts = useMemo(
    () => buildFleetAlerts(assets, inspections, documents),
    [assets, documents, inspections]
  )

  const upcomingServiceAssets = useMemo(
    () =>
      [...assets]
        .filter(
          (asset) =>
            asset.next_service_date ||
            asset.next_service_mileage ||
            asset.next_service_hours
        )
        .sort((a, b) => {
          const aDays = daysUntil(a.next_service_date)
          const bDays = daysUntil(b.next_service_date)
          return (aDays ?? 999999) - (bDays ?? 999999)
        })
        .slice(0, 8),
    [assets]
  )

  function exportFleetCsv() {
    const rows = [
      [
        'Asset Number',
        'Name',
        'Type',
        'Status',
        'Year',
        'Make',
        'Model',
        'VIN',
        'License Plate',
        'Mileage',
        'Hours',
        'Next Service Date',
        'Registration Expiration',
        'Insurance Expiration',
        'Inspection Expiration',
        'Current Value',
      ],
      ...filteredAssets.map((asset) => [
        asset.asset_number,
        assetTitle(asset),
        asset.type,
        asset.status,
        asset.year,
        asset.make,
        asset.model,
        asset.vin || asset.serial_number,
        asset.license_plate,
        asset.mileage,
        asset.hours,
        asset.next_service_date,
        asset.registration_expiration,
        asset.insurance_expiration,
        asset.inspection_expiration,
        asset.current_value,
      ]),
    ]

    downloadFile(
      'gbl-fleet-export.csv',
      rows.map((row) => row.map(csvCell).join(',')).join('\n'),
      'text/csv;charset=utf-8'
    )
  }

  async function duplicateAsset(asset) {
    const copy = {
      ...asset,
      id: '',
      asset_number: asset.asset_number
        ? `${asset.asset_number}-COPY`
        : '',
      name: `${assetTitle(asset)} Copy`,
      vin: '',
      serial_number: '',
      license_plate: '',
      mileage: 0,
      hours: 0,
      status: 'Reserved',
    }

    setAssetEditor(copy)
  }

  async function saveAsset(values) {
    if (!values.name.trim() && !values.asset_number.trim()) {
      alert('Enter an asset name or asset number.')
      return false
    }

    setSaving(true)
    const { data: authData } = await supabase.auth.getUser()

    const payload = {
      id: values.id || createId(),
      user_id: authData?.user?.id || null,
      asset_number: cleanText(values.asset_number),
      name: cleanText(values.name),
      type: values.type || 'Truck',
      status: values.status || 'Active',
      ownership: values.ownership || 'Owned',
      year: cleanNumber(values.year),
      make: cleanText(values.make),
      model: cleanText(values.model),
      trim: cleanText(values.trim),
      vin: cleanText(values.vin),
      serial_number: cleanText(values.serial_number),
      license_plate: cleanText(values.license_plate),
      license_state: cleanText(values.license_state),
      color: cleanText(values.color),
      fuel_type: cleanText(values.fuel_type),
      tank_capacity: cleanNumber(values.tank_capacity),
      mileage: cleanNumber(values.mileage),
      hours: cleanNumber(values.hours),
      purchase_date: cleanText(values.purchase_date),
      purchase_price: cleanNumber(values.purchase_price),
      current_value: cleanNumber(values.current_value),
      loan_balance: cleanNumber(values.loan_balance),
      monthly_payment: cleanNumber(values.monthly_payment),
      lease_end_date: cleanText(values.lease_end_date),
      warranty_expiration: cleanText(values.warranty_expiration),
      warranty_mileage: cleanNumber(values.warranty_mileage),
      registration_expiration: cleanText(values.registration_expiration),
      insurance_expiration: cleanText(values.insurance_expiration),
      inspection_expiration: cleanText(values.inspection_expiration),
      assigned_employee_id: cleanText(values.assigned_employee_id),
      gps_device_id: cleanText(values.gps_device_id),
      home_location: cleanText(values.home_location),
      next_service_date: cleanText(values.next_service_date),
      next_service_mileage: cleanNumber(values.next_service_mileage),
      next_service_hours: cleanNumber(values.next_service_hours),
      service_interval_miles: cleanNumber(values.service_interval_miles),
      service_interval_hours: cleanNumber(values.service_interval_hours),
      service_interval_days: cleanNumber(values.service_interval_days),
      tire_size: cleanText(values.tire_size),
      notes: cleanText(values.notes),
    }

    const result = await adaptiveUpsert('fleet_assets', payload)
    setSaving(false)

    if (result.error) {
      alert(result.error.message)
      return false
    }

    setAssets((current) => {
      const exists = current.some((asset) => asset.id === result.data.id)
      const updated = exists
        ? current.map((asset) => (asset.id === result.data.id ? result.data : asset))
        : [...current, result.data]

      return updated.sort((a, b) => assetTitle(a).localeCompare(assetTitle(b)))
    })

    setAssetEditor(null)
    setSelectedAssetId(result.data.id)
    return true
  }

  async function deleteAsset(asset) {
    if (!window.confirm(`Delete ${assetTitle(asset)}?`)) return

    const { error } = await supabase.from('fleet_assets').delete().eq('id', asset.id)

    if (error) {
      alert(error.message)
      return
    }

    setAssets((current) => current.filter((item) => item.id !== asset.id))
    setSelectedAssetId(null)
  }

  async function saveChild(table, assetId, values, setter, closeSetter) {
    setSaving(true)

    const result = await adaptiveUpsert(table, {
      ...values,
      id: values.id || createId(),
      asset_id: assetId,
    })

    setSaving(false)

    if (result.error) {
      alert(result.error.message)
      return false
    }

    setter((current) => {
      const exists = current.some((record) => record.id === result.data.id)
      return exists
        ? current.map((record) =>
            record.id === result.data.id ? result.data : record
          )
        : [result.data, ...current]
    })

    closeSetter(null)
    return true
  }

  async function deleteChild(table, record, setter, label) {
    if (!window.confirm(`Delete this ${label}?`)) return

    const { error } = await supabase.from(table).delete().eq('id', record.id)

    if (error) {
      alert(error.message)
      return
    }

    setter((current) => current.filter((item) => item.id !== record.id))
  }

  async function saveMaintenance(values) {
    if (!selectedAsset) return false
    if (!values.service_type.trim()) {
      alert('Enter the service type.')
      return false
    }

    const total = maintenanceTotal(values)

    const saved = await saveChild(
      'fleet_maintenance',
      selectedAsset.id,
      {
        ...values,
        service_date: cleanText(values.service_date),
        service_type: cleanText(values.service_type),
        status: values.status || 'Completed',
        vendor_id: cleanText(values.vendor_id),
        vendor_name: cleanText(values.vendor_name),
        odometer: cleanNumber(values.odometer),
        engine_hours: cleanNumber(values.engine_hours),
        labor_cost: cleanNumber(values.labor_cost),
        parts_cost: cleanNumber(values.parts_cost),
        tax: cleanNumber(values.tax),
        total_cost: total,
        invoice_number: cleanText(values.invoice_number),
        next_service_date: cleanText(values.next_service_date),
        next_service_mileage: cleanNumber(values.next_service_mileage),
        next_service_hours: cleanNumber(values.next_service_hours),
        downtime_hours: cleanNumber(values.downtime_hours),
        description: cleanText(values.description),
        technician_notes: cleanText(values.technician_notes),
      },
      setMaintenanceRecords,
      setMaintenanceEditor
    )

    if (saved && values.status === 'Completed') {
      const assetUpdate = {
        ...selectedAsset,
        mileage: cleanNumber(values.odometer) ?? selectedAsset.mileage,
        hours: cleanNumber(values.engine_hours) ?? selectedAsset.hours,
        next_service_date:
          cleanText(values.next_service_date) ?? selectedAsset.next_service_date,
        next_service_mileage:
          cleanNumber(values.next_service_mileage) ??
          selectedAsset.next_service_mileage,
        next_service_hours:
          cleanNumber(values.next_service_hours) ?? selectedAsset.next_service_hours,
        status:
          selectedAsset.status === 'Maintenance' ? 'Active' : selectedAsset.status,
      }

      const result = await adaptiveUpsert('fleet_assets', assetUpdate)
      if (!result.error) {
        setAssets((current) =>
          current.map((asset) => (asset.id === result.data.id ? result.data : asset))
        )
      }
    }

    return saved
  }

  async function saveFuel(values) {
    if (!selectedAsset) return false

    const total = fuelTotal(values)

    const saved = await saveChild(
      'fleet_fuel_logs',
      selectedAsset.id,
      {
        ...values,
        fuel_date: cleanText(values.fuel_date),
        employee_id: cleanText(values.employee_id),
        odometer: cleanNumber(values.odometer),
        engine_hours: cleanNumber(values.engine_hours),
        gallons: cleanNumber(values.gallons),
        price_per_gallon: cleanNumber(values.price_per_gallon),
        total_cost: total,
        vendor: cleanText(values.vendor),
        receipt_number: cleanText(values.receipt_number),
        full_tank: Boolean(values.full_tank),
        notes: cleanText(values.notes),
      },
      setFuelLogs,
      setFuelEditor
    )

    if (saved) {
      const assetUpdate = {
        ...selectedAsset,
        mileage: cleanNumber(values.odometer) ?? selectedAsset.mileage,
        hours: cleanNumber(values.engine_hours) ?? selectedAsset.hours,
      }

      const result = await adaptiveUpsert('fleet_assets', assetUpdate)
      if (!result.error) {
        setAssets((current) =>
          current.map((asset) => (asset.id === result.data.id ? result.data : asset))
        )
      }
    }

    return saved
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Fleet</h2>
        <p>Loading fleet records...</p>
      </section>
    )
  }

  if (selectedAsset) {
    const assignedEmployee = employeeById[selectedAsset.assigned_employee_id]
    const totalMaintenanceCost = selectedMaintenance.reduce(
      (sum, record) => sum + maintenanceTotal(record),
      0
    )
    const totalFuelCost = selectedFuelLogs.reduce(
      (sum, record) => sum + fuelTotal(record),
      0
    )
    const totalGallons = selectedFuelLogs.reduce(
      (sum, record) => sum + Number(record.gallons || 0),
      0
    )
    const failedInspections = selectedInspections.filter(
      (record) => record.status === 'Fail'
    ).length

    const fuelEfficiency = calculateFuelEfficiency(selectedFuelLogs)
    const healthScore = calculateAssetHealth(
      selectedAsset,
      selectedInspections,
      selectedDocuments
    )
    const recordedOperatingCost = totalMaintenanceCost + totalFuelCost
    const costPerMile =
      Number(selectedAsset.mileage || 0) > 0
        ? recordedOperatingCost / Number(selectedAsset.mileage || 0)
        : 0
    const estimatedEquity =
      Number(selectedAsset.current_value || 0) -
      Number(selectedAsset.loan_balance || 0)

    return (
      <>
        <div className="toolbar">
          <button className="secondary" onClick={() => setSelectedAssetId(null)}>
            ← Back to Fleet
          </button>

          <div className="actions">
            <button
              className="secondary"
              onClick={() =>
                printAssetSummary(
                  selectedAsset,
                  assignedEmployee,
                  selectedMaintenance,
                  selectedFuelLogs,
                  selectedInspections,
                  selectedDocuments
                )
              }
            >
              Print Report
            </button>
            <button
              className="secondary"
              onClick={() =>
                downloadFile(
                  `${safeFilename(assetTitle(selectedAsset))}-fleet-history.csv`,
                  buildAssetCsv(
                    selectedAsset,
                    selectedMaintenance,
                    selectedFuelLogs,
                    selectedInspections,
                    selectedDocuments,
                    selectedTires
                  ),
                  'text/csv;charset=utf-8'
                )
              }
            >
              Export CSV
            </button>
            <button
              className="secondary"
              onClick={() => duplicateAsset(selectedAsset)}
            >
              Duplicate
            </button>
            <button className="primary" onClick={() => setAssetEditor(selectedAsset)}>
              Edit Asset
            </button>
            <button className="danger" onClick={() => deleteAsset(selectedAsset)}>
              Delete
            </button>
          </div>
        </div>

        <section className="panel">
          <div className="between">
            <div>
              <h2>{assetTitle(selectedAsset)}</h2>
              <div className="small">
                {selectedAsset.asset_number || 'No asset number'} ·{' '}
                {selectedAsset.type || 'Other'}
              </div>
            </div>
            <Badge>{selectedAsset.status || 'Active'}</Badge>
          </div>

          <div className="metrics">
            <div className="metric">
              <span>Mileage</span>
              <strong>{formatNumber(selectedAsset.mileage)}</strong>
            </div>
            <div className="metric">
              <span>Engine Hours</span>
              <strong>{formatNumber(selectedAsset.hours, 1)}</strong>
            </div>
            <div className="metric">
              <span>Maintenance Cost</span>
              <strong>{formatCurrency(totalMaintenanceCost)}</strong>
            </div>
            <div className="metric">
              <span>Fuel Cost</span>
              <strong>{formatCurrency(totalFuelCost)}</strong>
            </div>
            <div className="metric">
              <span>Fleet Health</span>
              <strong>{healthScore}%</strong>
              <small>{healthLabel(healthScore)}</small>
            </div>
          </div>
        </section>

        <div className="tabs">
          {[
            ['overview', 'Overview'],
            ['maintenance', 'Maintenance'],
            ['fuel', 'Fuel'],
            ['inspections', 'Inspections'],
            ['documents', 'Documents'],
            ['tires', 'Tires'],
            ['costs', 'Costs'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={activeTab === value ? 'active' : ''}
              onClick={() => setActiveTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <>
            <div className="grid-2">
              <section className="panel">
                <h2>Asset Information</h2>
                <p>
                  <b>Year / Make / Model:</b>{' '}
                  {[selectedAsset.year, selectedAsset.make, selectedAsset.model]
                    .filter(Boolean)
                    .join(' ') || '—'}
                </p>
                <p><b>Trim:</b> {selectedAsset.trim || '—'}</p>
                <p><b>VIN:</b> {selectedAsset.vin || '—'}</p>
                <p><b>Serial Number:</b> {selectedAsset.serial_number || '—'}</p>
                <p>
                  <b>License Plate:</b>{' '}
                  {[selectedAsset.license_plate, selectedAsset.license_state]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
                <p><b>Color:</b> {selectedAsset.color || '—'}</p>
                <p><b>Fuel Type:</b> {selectedAsset.fuel_type || '—'}</p>
                <p><b>Tank Capacity:</b> {selectedAsset.tank_capacity || '—'}</p>
              </section>

              <section className="panel">
                <h2>Assignment & Location</h2>
                <p><b>Assigned Employee:</b> {assignedEmployee ? employeeName(assignedEmployee) : 'Unassigned'}</p>
                <p><b>Home Location:</b> {selectedAsset.home_location || '—'}</p>
                <p><b>GPS Device:</b> {selectedAsset.gps_device_id || '—'}</p>
                <p><b>Ownership:</b> {selectedAsset.ownership || 'Owned'}</p>
                <p><b>Purchase Date:</b> {formatDate(selectedAsset.purchase_date)}</p>
                <p><b>Purchase Price:</b> {formatCurrency(selectedAsset.purchase_price)}</p>
                <p><b>Current Value:</b> {formatCurrency(selectedAsset.current_value)}</p>
                <p><b>Loan Balance:</b> {formatCurrency(selectedAsset.loan_balance)}</p>
              </section>
            </div>

            <div className="grid-2">
              <section className="panel">
                <h2>Service Schedule</h2>
                <p><b>Next Service Date:</b> {formatDate(selectedAsset.next_service_date)}</p>
                <p><b>Next Service Mileage:</b> {formatNumber(selectedAsset.next_service_mileage)}</p>
                <p><b>Next Service Hours:</b> {formatNumber(selectedAsset.next_service_hours, 1)}</p>
                <p><b>Mileage Interval:</b> {formatNumber(selectedAsset.service_interval_miles)}</p>
                <p><b>Hour Interval:</b> {formatNumber(selectedAsset.service_interval_hours, 1)}</p>
                <p><b>Day Interval:</b> {formatNumber(selectedAsset.service_interval_days)}</p>
                <p><b>Service Status:</b> <Badge>{serviceDue(selectedAsset) ? 'Due' : 'Current'}</Badge></p>
              </section>

              <section className="panel">
                <h2>Compliance</h2>
                <p><b>Registration:</b> {formatDate(selectedAsset.registration_expiration)} · <Badge>{expirationBadge(selectedAsset.registration_expiration)}</Badge></p>
                <p><b>Insurance:</b> {formatDate(selectedAsset.insurance_expiration)} · <Badge>{expirationBadge(selectedAsset.insurance_expiration)}</Badge></p>
                <p><b>Inspection:</b> {formatDate(selectedAsset.inspection_expiration)} · <Badge>{expirationBadge(selectedAsset.inspection_expiration)}</Badge></p>
                <p><b>Warranty:</b> {formatDate(selectedAsset.warranty_expiration)}</p>
                <p><b>Warranty Mileage:</b> {formatNumber(selectedAsset.warranty_mileage)}</p>
                <p><b>Lease End:</b> {formatDate(selectedAsset.lease_end_date)}</p>
              </section>
            </div>

            <div className="grid-2">
              <section className="panel">
                <h2>Health & Readiness</h2>
                <p><b>Health Score:</b> {healthScore}% · <Badge>{healthLabel(healthScore)}</Badge></p>
                <p><b>Service:</b> <Badge>{serviceDue(selectedAsset) ? 'Due' : 'Current'}</Badge></p>
                <p><b>Failed Inspections:</b> {failedInspections}</p>
                <p><b>Expired Documents:</b> {selectedDocuments.filter((record) => isPast(record.expiration_date)).length}</p>
                <p><b>Availability:</b> {selectedAsset.status === 'Active' ? 'Ready for assignment' : selectedAsset.status || 'Unknown'}</p>
              </section>

              <section className="panel">
                <h2>Operating Analytics</h2>
                <p><b>Average Fuel Economy:</b> {fuelEfficiency.mpg ? `${fuelEfficiency.mpg.toFixed(2)} MPG` : 'Not enough full-tank data'}</p>
                <p><b>Recorded Operating Cost:</b> {formatCurrency(recordedOperatingCost)}</p>
                <p><b>Recorded Cost Per Mile:</b> {costPerMile ? formatCurrency(costPerMile) : '—'}</p>
                <p><b>Estimated Equity:</b> {formatCurrency(estimatedEquity)}</p>
                <p><b>Monthly Payment:</b> {formatCurrency(selectedAsset.monthly_payment)}</p>
              </section>
            </div>

            <section className="panel">
              <h2>Notes</h2>
              <p>{selectedAsset.notes || 'No notes entered.'}</p>
            </section>
          </>
        )}

        {activeTab === 'maintenance' && (
          <>
            <div className="toolbar">
              <div />
              <button
                className="primary"
                onClick={() =>
                  setMaintenanceEditor({
                    ...EMPTY_MAINTENANCE,
                    odometer: selectedAsset.mileage || '',
                    engine_hours: selectedAsset.hours || '',
                  })
                }
              >
                + Maintenance Record
              </button>
            </div>

            <section className="panel">
              <h2>Maintenance History</h2>
              <div className="cards">
                {selectedMaintenance.map((record) => (
                  <article className="card" key={record.id}>
                    <div className="between">
                      <h3>{record.service_type || 'Service'}</h3>
                      <Badge>{record.status || 'Completed'}</Badge>
                    </div>
                    <p><b>Date:</b> {formatDate(record.service_date)}</p>
                    <p><b>Vendor:</b> {vendorById[record.vendor_id]?.name || record.vendor_name || '—'}</p>
                    <p><b>Odometer:</b> {formatNumber(record.odometer)}</p>
                    <p><b>Engine Hours:</b> {formatNumber(record.engine_hours, 1)}</p>
                    <p><b>Total:</b> {formatCurrency(maintenanceTotal(record))}</p>
                    <p><b>Next Service:</b> {formatDate(record.next_service_date)}</p>
                    <p>{record.description || 'No description entered.'}</p>

                    <div className="actions">
                      <button className="secondary" onClick={() => setMaintenanceEditor(record)}>
                        Edit
                      </button>
                      <button
                        className="danger"
                        onClick={() =>
                          deleteChild(
                            'fleet_maintenance',
                            record,
                            setMaintenanceRecords,
                            'maintenance record'
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}

                {!selectedMaintenance.length && <Empty>No maintenance records</Empty>}
              </div>
            </section>
          </>
        )}

        {activeTab === 'fuel' && (
          <>
            <div className="toolbar">
              <div />
              <button
                className="primary"
                onClick={() =>
                  setFuelEditor({
                    ...EMPTY_FUEL_LOG,
                    odometer: selectedAsset.mileage || '',
                    engine_hours: selectedAsset.hours || '',
                  })
                }
              >
                + Fuel Log
              </button>
            </div>

            <div className="metrics">
              <div className="metric">
                <span>Total Fuel Cost</span>
                <strong>{formatCurrency(totalFuelCost)}</strong>
              </div>
              <div className="metric">
                <span>Total Gallons</span>
                <strong>{formatNumber(totalGallons, 2)}</strong>
              </div>
              <div className="metric">
                <span>Average Price</span>
                <strong>
                  {formatCurrency(totalGallons ? totalFuelCost / totalGallons : 0)}
                </strong>
              </div>
              <div className="metric">
                <span>Fuel Entries</span>
                <strong>{selectedFuelLogs.length}</strong>
              </div>
              <div className="metric">
                <span>Average MPG</span>
                <strong>{fuelEfficiency.mpg ? fuelEfficiency.mpg.toFixed(2) : '—'}</strong>
              </div>
              <div className="metric">
                <span>Fuel Cost / Mile</span>
                <strong>
                  {fuelEfficiency.miles
                    ? formatCurrency(totalFuelCost / fuelEfficiency.miles)
                    : '—'}
                </strong>
              </div>
            </div>

            <section className="panel">
              <h2>Fuel History</h2>
              <div className="cards">
                {selectedFuelLogs.map((record) => (
                  <article className="card" key={record.id}>
                    <div className="between">
                      <h3>{formatDate(record.fuel_date)}</h3>
                      <strong>{formatCurrency(fuelTotal(record))}</strong>
                    </div>
                    <p><b>Driver:</b> {employeeById[record.employee_id] ? employeeName(employeeById[record.employee_id]) : '—'}</p>
                    <p><b>Gallons:</b> {formatNumber(record.gallons, 3)}</p>
                    <p><b>Price/Gallon:</b> {formatCurrency(record.price_per_gallon)}</p>
                    <p><b>Odometer:</b> {formatNumber(record.odometer)}</p>
                    <p><b>Vendor:</b> {record.vendor || '—'}</p>
                    <p>{record.notes || ''}</p>

                    <div className="actions">
                      <button className="secondary" onClick={() => setFuelEditor(record)}>
                        Edit
                      </button>
                      <button
                        className="danger"
                        onClick={() =>
                          deleteChild('fleet_fuel_logs', record, setFuelLogs, 'fuel log')
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}

                {!selectedFuelLogs.length && <Empty>No fuel logs recorded</Empty>}
              </div>
            </section>
          </>
        )}

        {activeTab === 'inspections' && (
          <>
            <div className="toolbar">
              <div />
              <button
                className="primary"
                onClick={() =>
                  setInspectionEditor({
                    ...EMPTY_INSPECTION,
                    odometer: selectedAsset.mileage || '',
                    engine_hours: selectedAsset.hours || '',
                  })
                }
              >
                + Inspection
              </button>
            </div>

            <div className="metrics">
              <div className="metric">
                <span>Total Inspections</span>
                <strong>{selectedInspections.length}</strong>
              </div>
              <div className="metric">
                <span>Failed</span>
                <strong>{failedInspections}</strong>
              </div>
              <div className="metric">
                <span>Passed</span>
                <strong>{selectedInspections.filter((record) => record.status === 'Pass').length}</strong>
              </div>
              <div className="metric">
                <span>Conditional</span>
                <strong>{selectedInspections.filter((record) => record.status === 'Conditional').length}</strong>
              </div>
            </div>

            <section className="panel">
              <h2>Inspection History</h2>
              <div className="cards">
                {selectedInspections.map((record) => (
                  <article className="card" key={record.id}>
                    <div className="between">
                      <h3>{record.inspection_type || 'Inspection'}</h3>
                      <Badge>{record.status || 'Pass'}</Badge>
                    </div>
                    <p><b>Date:</b> {formatDate(record.inspection_date)}</p>
                    <p><b>Inspector:</b> {employeeById[record.employee_id] ? employeeName(employeeById[record.employee_id]) : '—'}</p>
                    <p><b>Odometer:</b> {formatNumber(record.odometer)}</p>
                    <p><b>Defects:</b> {record.defects || 'None reported'}</p>
                    <p><b>Corrective Action:</b> {record.corrective_action || '—'}</p>

                    <div className="actions">
                      <button className="secondary" onClick={() => setInspectionEditor(record)}>
                        Edit
                      </button>
                      <button
                        className="danger"
                        onClick={() =>
                          deleteChild(
                            'fleet_inspections',
                            record,
                            setInspections,
                            'inspection'
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}

                {!selectedInspections.length && <Empty>No inspections recorded</Empty>}
              </div>
            </section>
          </>
        )}

        {activeTab === 'documents' && (
          <>
            <div className="toolbar">
              <div />
              <button
                className="primary"
                onClick={() => setDocumentEditor({ ...EMPTY_DOCUMENT })}
              >
                + Document
              </button>
            </div>

            <section className="panel">
              <h2>Asset Documents</h2>
              <div className="cards">
                {selectedDocuments.map((record) => (
                  <article className="card" key={record.id}>
                    <div className="between">
                      <h3>{record.title || record.document_type || 'Document'}</h3>
                      <Badge>{expirationBadge(record.expiration_date)}</Badge>
                    </div>
                    <p><b>Type:</b> {record.document_type || 'Other'}</p>
                    <p><b>Number:</b> {record.document_number || '—'}</p>
                    <p><b>Issued:</b> {formatDate(record.issue_date)}</p>
                    <p><b>Expires:</b> {formatDate(record.expiration_date)}</p>
                    {record.file_url && record.document_type === 'Photo' && (
                      <a href={record.file_url} target="_blank" rel="noreferrer">
                        <img
                          src={record.file_url}
                          alt={record.title || 'Fleet asset'}
                          style={{
                            width: '100%',
                            maxHeight: 220,
                            objectFit: 'cover',
                            borderRadius: 10,
                            marginBottom: 10,
                          }}
                        />
                      </a>
                    )}
                    {record.file_url && (
                      <p>
                        <a href={record.file_url} target="_blank" rel="noreferrer">
                          {record.document_type === 'Photo' ? 'Open Full Photo' : 'Open Document'}
                        </a>
                      </p>
                    )}
                    <p>{record.notes || ''}</p>

                    <div className="actions">
                      <button className="secondary" onClick={() => setDocumentEditor(record)}>
                        Edit
                      </button>
                      <button
                        className="danger"
                        onClick={() =>
                          deleteChild(
                            'fleet_documents',
                            record,
                            setDocuments,
                            'document'
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}

                {!selectedDocuments.length && <Empty>No documents uploaded</Empty>}
              </div>
            </section>
          </>
        )}

        {activeTab === 'tires' && (
          <>
            <div className="toolbar">
              <div />
              <button className="primary" onClick={() => setTireEditor({ ...EMPTY_TIRE })}>
                + Tire Record
              </button>
            </div>

            <section className="panel">
              <h2>Tire Tracking</h2>
              <div className="cards">
                {selectedTires.map((record) => (
                  <article className="card" key={record.id}>
                    <div className="between">
                      <h3>{record.position || 'Tire'}</h3>
                      <Badge>{record.status || 'In Service'}</Badge>
                    </div>
                    <p><b>Brand / Model:</b> {[record.brand, record.model].filter(Boolean).join(' ') || '—'}</p>
                    <p><b>Size:</b> {record.size || selectedAsset.tire_size || '—'}</p>
                    <p><b>Installed:</b> {formatDate(record.installed_date)}</p>
                    <p><b>Installed Mileage:</b> {formatNumber(record.installed_mileage)}</p>
                    <p><b>Tread Depth:</b> {record.current_tread_depth || '—'}</p>
                    <p><b>Cost:</b> {formatCurrency(record.purchase_cost)}</p>

                    <div className="actions">
                      <button className="secondary" onClick={() => setTireEditor(record)}>
                        Edit
                      </button>
                      <button
                        className="danger"
                        onClick={() =>
                          deleteChild('fleet_tires', record, setTires, 'tire record')
                        }
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}

                {!selectedTires.length && <Empty>No tire records</Empty>}
              </div>
            </section>
          </>
        )}

        {activeTab === 'costs' && (
          <>
            <div className="metrics">
              <div className="metric">
                <span>Purchase Price</span>
                <strong>{formatCurrency(selectedAsset.purchase_price)}</strong>
              </div>
              <div className="metric">
                <span>Current Value</span>
                <strong>{formatCurrency(selectedAsset.current_value)}</strong>
              </div>
              <div className="metric">
                <span>Maintenance Cost</span>
                <strong>{formatCurrency(totalMaintenanceCost)}</strong>
              </div>
              <div className="metric">
                <span>Fuel Cost</span>
                <strong>{formatCurrency(totalFuelCost)}</strong>
              </div>
              <div className="metric">
                <span>Operating Cost</span>
                <strong>{formatCurrency(recordedOperatingCost)}</strong>
              </div>
              <div className="metric">
                <span>Cost Per Mile</span>
                <strong>{costPerMile ? formatCurrency(costPerMile) : '—'}</strong>
              </div>
              <div className="metric">
                <span>Estimated Equity</span>
                <strong>{formatCurrency(estimatedEquity)}</strong>
              </div>
            </div>

            <section className="panel">
              <h2>Total Cost of Ownership</h2>
              <p><b>Purchase Price:</b> {formatCurrency(selectedAsset.purchase_price)}</p>
              <p><b>Maintenance:</b> {formatCurrency(totalMaintenanceCost)}</p>
              <p><b>Fuel:</b> {formatCurrency(totalFuelCost)}</p>
              <p><b>Loan Balance:</b> {formatCurrency(selectedAsset.loan_balance)}</p>
              <p><b>Monthly Payment:</b> {formatCurrency(selectedAsset.monthly_payment)}</p>
              <p>
                <b>Recorded Investment:</b>{' '}
                {formatCurrency(
                  Number(selectedAsset.purchase_price || 0) +
                    totalMaintenanceCost +
                    totalFuelCost
                )}
              </p>
              <p>
                <b>Estimated Equity:</b>{' '}
                {formatCurrency(
                  Number(selectedAsset.current_value || 0) -
                    Number(selectedAsset.loan_balance || 0)
                )}
              </p>
            </section>
          </>
        )}

        {assetEditor && (
          <AssetEditor
            initial={assetEditor}
            employees={employees}
            saving={saving}
            onClose={() => setAssetEditor(null)}
            onSave={saveAsset}
          />
        )}

        {maintenanceEditor && (
          <MaintenanceEditor
            initial={maintenanceEditor}
            vendors={vendors}
            saving={saving}
            onClose={() => setMaintenanceEditor(null)}
            onSave={saveMaintenance}
          />
        )}

        {fuelEditor && (
          <FuelEditor
            initial={fuelEditor}
            employees={employees}
            saving={saving}
            onClose={() => setFuelEditor(null)}
            onSave={saveFuel}
          />
        )}

        {inspectionEditor && (
          <InspectionEditor
            initial={inspectionEditor}
            employees={employees}
            saving={saving}
            onClose={() => setInspectionEditor(null)}
            onSave={(values) =>
              saveChild(
                'fleet_inspections',
                selectedAsset.id,
                {
                  ...values,
                  inspection_date: cleanText(values.inspection_date),
                  employee_id: cleanText(values.employee_id),
                  inspection_type: cleanText(values.inspection_type),
                  status: values.status || 'Pass',
                  odometer: cleanNumber(values.odometer),
                  engine_hours: cleanNumber(values.engine_hours),
                  tires_ok: Boolean(values.tires_ok),
                  lights_ok: Boolean(values.lights_ok),
                  brakes_ok: Boolean(values.brakes_ok),
                  fluids_ok: Boolean(values.fluids_ok),
                  safety_equipment_ok: Boolean(values.safety_equipment_ok),
                  damage_found: Boolean(values.damage_found),
                  defects: cleanText(values.defects),
                  corrective_action: cleanText(values.corrective_action),
                  notes: cleanText(values.notes),
                },
                setInspections,
                setInspectionEditor
              )
            }
          />
        )}

        {documentEditor && (
          <DocumentEditor
            initial={documentEditor}
            saving={saving}
            onClose={() => setDocumentEditor(null)}
            onSave={(values) =>
              saveChild(
                'fleet_documents',
                selectedAsset.id,
                {
                  ...values,
                  document_type: values.document_type || 'Other',
                  title: cleanText(values.title),
                  document_number: cleanText(values.document_number),
                  issue_date: cleanText(values.issue_date),
                  expiration_date: cleanText(values.expiration_date),
                  file_url: cleanText(values.file_url),
                  notes: cleanText(values.notes),
                },
                setDocuments,
                setDocumentEditor
              )
            }
          />
        )}

        {tireEditor && (
          <TireEditor
            initial={tireEditor}
            saving={saving}
            onClose={() => setTireEditor(null)}
            onSave={(values) =>
              saveChild(
                'fleet_tires',
                selectedAsset.id,
                {
                  ...values,
                  position: cleanText(values.position),
                  brand: cleanText(values.brand),
                  model: cleanText(values.model),
                  size: cleanText(values.size),
                  serial_number: cleanText(values.serial_number),
                  installed_date: cleanText(values.installed_date),
                  installed_mileage: cleanNumber(values.installed_mileage),
                  current_tread_depth: cleanNumber(values.current_tread_depth),
                  purchase_cost: cleanNumber(values.purchase_cost),
                  status: cleanText(values.status),
                  notes: cleanText(values.notes),
                },
                setTires,
                setTireEditor
              )
            }
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search fleet..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="actions">
          <SelectField
            label="Type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              ['', 'All types'],
              ...ASSET_TYPE_OPTIONS.map((item) => [item, item]),
            ]}
          />

          <SelectField
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              ['', 'All statuses'],
              ...ASSET_STATUS_OPTIONS.map((item) => [item, item]),
            ]}
          />

          <button className="secondary" onClick={exportFleetCsv}>
            Export Fleet CSV
          </button>

          <button className="primary" onClick={() => setAssetEditor({ ...EMPTY_ASSET })}>
            + Fleet Asset
          </button>
        </div>
      </div>

      {errorMessage && (
        <section className="panel">
          <strong>Fleet error</strong>
          <p>{errorMessage}</p>
          <button className="secondary" onClick={loadData}>
            Try Again
          </button>
        </section>
      )}

      <div className="metrics">
        <div className="metric">
          <span>Total Assets</span>
          <strong>{assets.length}</strong>
        </div>
        <div className="metric">
          <span>Active</span>
          <strong>{dashboard.active}</strong>
        </div>
        <div className="metric">
          <span>Maintenance / Out</span>
          <strong>{dashboard.maintenance + dashboard.outOfService}</strong>
        </div>
        <div className="metric">
          <span>Service Due</span>
          <strong>{dashboard.serviceOverdue}</strong>
        </div>
        <div className="metric">
          <span>Maintenance This Month</span>
          <strong>{formatCurrency(dashboard.maintenanceCost)}</strong>
        </div>
        <div className="metric">
          <span>Fuel This Month</span>
          <strong>{formatCurrency(dashboard.fuelCost)}</strong>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel">
          <div className="between">
            <div>
              <h2>Fleet Alerts</h2>
              <div className="small">Service, compliance, inspection, and availability warnings</div>
            </div>
            <Badge>{fleetAlerts.length}</Badge>
          </div>

          <div className="cards">
            {fleetAlerts.slice(0, 8).map((alert) => (
              <article className="card" key={alert.id}>
                <div className="between">
                  <h3>{alert.title}</h3>
                  <Badge>{alert.severity}</Badge>
                </div>
                <p>{alert.message}</p>
                {alert.asset_id && (
                  <button
                    className="secondary"
                    onClick={() => setSelectedAssetId(alert.asset_id)}
                  >
                    Open Asset
                  </button>
                )}
              </article>
            ))}

            {!fleetAlerts.length && <Empty>No active fleet alerts</Empty>}
          </div>
        </section>

        <section className="panel">
          <h2>Upcoming Service</h2>
          <div className="cards">
            {upcomingServiceAssets.map((asset) => (
              <article className="card" key={asset.id}>
                <div className="between">
                  <h3>{assetTitle(asset)}</h3>
                  <Badge>{serviceDue(asset) ? 'Due' : 'Scheduled'}</Badge>
                </div>
                <p><b>Date:</b> {formatDate(asset.next_service_date)}</p>
                <p><b>Mileage:</b> {formatNumber(asset.next_service_mileage)}</p>
                <p><b>Hours:</b> {formatNumber(asset.next_service_hours, 1)}</p>
                <button
                  className="secondary"
                  onClick={() => setSelectedAssetId(asset.id)}
                >
                  Open Asset
                </button>
              </article>
            ))}

            {!upcomingServiceAssets.length && <Empty>No service schedule entered</Empty>}
          </div>
        </section>
      </div>

      <div className="cards">
        {filteredAssets.map((asset) => {
          const assignedEmployee = employeeById[asset.assigned_employee_id]
          const complianceWarnings = [
            asset.registration_expiration,
            asset.insurance_expiration,
            asset.inspection_expiration,
          ].filter((value) => {
            const remaining = daysUntil(value)
            return remaining !== null && remaining <= 30
          }).length

          const assetInspections = inspections.filter(
            (record) => record.asset_id === asset.id
          )
          const assetDocuments = documents.filter(
            (record) => record.asset_id === asset.id
          )
          const assetHealth = calculateAssetHealth(
            asset,
            assetInspections,
            assetDocuments
          )

          return (
            <article className="card" key={asset.id}>
              <div className="between">
                <div>
                  <h3>{assetTitle(asset)}</h3>
                  <div className="small">
                    {asset.asset_number || 'No asset number'} · {asset.type || 'Other'}
                  </div>
                </div>
                <Badge>{asset.status || 'Active'}</Badge>
              </div>

              <p>
                <b>Vehicle:</b>{' '}
                {[asset.year, asset.make, asset.model].filter(Boolean).join(' ') || '—'}
              </p>
              <p><b>Mileage:</b> {formatNumber(asset.mileage)}</p>
              <p><b>Engine Hours:</b> {formatNumber(asset.hours, 1)}</p>
              <p><b>Assigned To:</b> {assignedEmployee ? employeeName(assignedEmployee) : 'Unassigned'}</p>
              <p><b>Next Service:</b> {formatDate(asset.next_service_date)}</p>
              <p><b>Compliance Warnings:</b> {complianceWarnings}</p>
              <p><b>Fleet Health:</b> {assetHealth}% · {healthLabel(assetHealth)}</p>

              <div className="actions">
                <button className="primary" onClick={() => setSelectedAssetId(asset.id)}>
                  Open
                </button>
                <button className="secondary" onClick={() => setAssetEditor(asset)}>
                  Edit
                </button>
                <button className="secondary" onClick={() => duplicateAsset(asset)}>
                  Duplicate
                </button>
                <button className="danger" onClick={() => deleteAsset(asset)}>
                  Delete
                </button>
              </div>
            </article>
          )
        })}

        {!filteredAssets.length && <Empty>No fleet assets match your filters</Empty>}
      </div>

      {assetEditor && (
        <AssetEditor
          initial={assetEditor}
          employees={employees}
          saving={saving}
          onClose={() => setAssetEditor(null)}
          onSave={saveAsset}
        />
      )}
    </>
  )
}

function employeeName(employee) {
  return (
    employee.preferred_name ||
    [employee.first_name, employee.last_name].filter(Boolean).join(' ') ||
    employee.name ||
    'Employee'
  )
}

function AssetEditor({ initial, employees, saving, onClose, onSave }) {
  const [values, setValues] = useState({ ...EMPTY_ASSET, ...initial })
  const setValue = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))

  return (
    <Modal title={initial.id ? 'Edit Fleet Asset' : 'Add Fleet Asset'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(values) }}>
        <div className="form-grid">
          <Field label="Asset Number" value={values.asset_number} onChange={(value) => setValue('asset_number', value)} />
          <Field label="Asset Name" value={values.name} onChange={(value) => setValue('name', value)} required />

          <SelectField label="Type" value={values.type} onChange={(value) => setValue('type', value)} options={ASSET_TYPE_OPTIONS.map((item) => [item, item])} />
          <SelectField label="Status" value={values.status} onChange={(value) => setValue('status', value)} options={ASSET_STATUS_OPTIONS.map((item) => [item, item])} />
          <SelectField label="Ownership" value={values.ownership} onChange={(value) => setValue('ownership', value)} options={OWNERSHIP_OPTIONS.map((item) => [item, item])} />

          <Field label="Year" type="number" value={values.year ?? ''} onChange={(value) => setValue('year', value)} />
          <Field label="Make" value={values.make} onChange={(value) => setValue('make', value)} />
          <Field label="Model" value={values.model} onChange={(value) => setValue('model', value)} />
          <Field label="Trim" value={values.trim} onChange={(value) => setValue('trim', value)} />
          <Field label="Color" value={values.color} onChange={(value) => setValue('color', value)} />

          <Field label="VIN" value={values.vin} onChange={(value) => setValue('vin', value)} />
          <Field label="Serial Number" value={values.serial_number} onChange={(value) => setValue('serial_number', value)} />
          <Field label="License Plate" value={values.license_plate} onChange={(value) => setValue('license_plate', value)} />
          <Field label="License State" value={values.license_state} onChange={(value) => setValue('license_state', value)} />

          <SelectField label="Fuel Type" value={values.fuel_type} onChange={(value) => setValue('fuel_type', value)} options={FUEL_TYPE_OPTIONS.map((item) => [item, item])} />
          <Field label="Tank Capacity" type="number" value={values.tank_capacity ?? ''} onChange={(value) => setValue('tank_capacity', value)} />
          <Field label="Mileage" type="number" value={values.mileage ?? ''} onChange={(value) => setValue('mileage', value)} />
          <Field label="Engine Hours" type="number" value={values.hours ?? ''} onChange={(value) => setValue('hours', value)} />

          <Field label="Purchase Date" type="date" value={values.purchase_date || ''} onChange={(value) => setValue('purchase_date', value)} />
          <Field label="Purchase Price" type="number" value={values.purchase_price ?? ''} onChange={(value) => setValue('purchase_price', value)} />
          <Field label="Current Value" type="number" value={values.current_value ?? ''} onChange={(value) => setValue('current_value', value)} />
          <Field label="Loan Balance" type="number" value={values.loan_balance ?? ''} onChange={(value) => setValue('loan_balance', value)} />
          <Field label="Monthly Payment" type="number" value={values.monthly_payment ?? ''} onChange={(value) => setValue('monthly_payment', value)} />
          <Field label="Lease End Date" type="date" value={values.lease_end_date || ''} onChange={(value) => setValue('lease_end_date', value)} />

          <Field label="Warranty Expiration" type="date" value={values.warranty_expiration || ''} onChange={(value) => setValue('warranty_expiration', value)} />
          <Field label="Warranty Mileage" type="number" value={values.warranty_mileage ?? ''} onChange={(value) => setValue('warranty_mileage', value)} />
          <Field label="Registration Expiration" type="date" value={values.registration_expiration || ''} onChange={(value) => setValue('registration_expiration', value)} />
          <Field label="Insurance Expiration" type="date" value={values.insurance_expiration || ''} onChange={(value) => setValue('insurance_expiration', value)} />
          <Field label="Inspection Expiration" type="date" value={values.inspection_expiration || ''} onChange={(value) => setValue('inspection_expiration', value)} />

          <SelectField
            label="Assigned Employee"
            value={values.assigned_employee_id || ''}
            onChange={(value) => setValue('assigned_employee_id', value)}
            options={[
              ['', 'Unassigned'],
              ...employees.map((employee) => [employee.id, employeeName(employee)]),
            ]}
          />

          <Field label="GPS Device ID" value={values.gps_device_id} onChange={(value) => setValue('gps_device_id', value)} />
          <Field label="Home Location" value={values.home_location} onChange={(value) => setValue('home_location', value)} />

          <Field label="Next Service Date" type="date" value={values.next_service_date || ''} onChange={(value) => setValue('next_service_date', value)} />
          <Field label="Next Service Mileage" type="number" value={values.next_service_mileage ?? ''} onChange={(value) => setValue('next_service_mileage', value)} />
          <Field label="Next Service Hours" type="number" value={values.next_service_hours ?? ''} onChange={(value) => setValue('next_service_hours', value)} />
          <Field label="Service Interval Miles" type="number" value={values.service_interval_miles ?? ''} onChange={(value) => setValue('service_interval_miles', value)} />
          <Field label="Service Interval Hours" type="number" value={values.service_interval_hours ?? ''} onChange={(value) => setValue('service_interval_hours', value)} />
          <Field label="Service Interval Days" type="number" value={values.service_interval_days ?? ''} onChange={(value) => setValue('service_interval_days', value)} />

          <Field label="Tire Size" value={values.tire_size} onChange={(value) => setValue('tire_size', value)} />
          <Field label="Notes" value={values.notes} onChange={(value) => setValue('notes', value)} multiline />
        </div>

        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Asset'}</button>
        </div>
      </form>
    </Modal>
  )
}

function MaintenanceEditor({ initial, vendors, saving, onClose, onSave }) {
  const [values, setValues] = useState({ ...EMPTY_MAINTENANCE, ...initial })
  const setValue = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))

  const calculatedTotal =
    Number(values.labor_cost || 0) +
    Number(values.parts_cost || 0) +
    Number(values.tax || 0)

  return (
    <Modal title={initial.id ? 'Edit Maintenance Record' : 'Add Maintenance Record'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave({ ...values, total_cost: values.total_cost || calculatedTotal }) }}>
        <div className="form-grid">
          <Field label="Service Date" type="date" value={values.service_date || ''} onChange={(value) => setValue('service_date', value)} />
          <Field label="Service Type" value={values.service_type} onChange={(value) => setValue('service_type', value)} required />
          <SelectField label="Status" value={values.status} onChange={(value) => setValue('status', value)} options={SERVICE_STATUS_OPTIONS.map((item) => [item, item])} />

          <SelectField
            label="Vendor"
            value={values.vendor_id || ''}
            onChange={(value) => setValue('vendor_id', value)}
            options={[
              ['', 'No saved vendor'],
              ...vendors.map((vendor) => [vendor.id, vendor.name || 'Vendor']),
            ]}
          />
          <Field label="Vendor Name" value={values.vendor_name} onChange={(value) => setValue('vendor_name', value)} />
          <Field label="Invoice Number" value={values.invoice_number} onChange={(value) => setValue('invoice_number', value)} />

          <Field label="Odometer" type="number" value={values.odometer ?? ''} onChange={(value) => setValue('odometer', value)} />
          <Field label="Engine Hours" type="number" value={values.engine_hours ?? ''} onChange={(value) => setValue('engine_hours', value)} />

          <Field label="Labor Cost" type="number" value={values.labor_cost ?? ''} onChange={(value) => setValue('labor_cost', value)} />
          <Field label="Parts Cost" type="number" value={values.parts_cost ?? ''} onChange={(value) => setValue('parts_cost', value)} />
          <Field label="Tax" type="number" value={values.tax ?? ''} onChange={(value) => setValue('tax', value)} />
          <Field label="Total Cost" type="number" value={values.total_cost || calculatedTotal} onChange={(value) => setValue('total_cost', value)} />

          <Field label="Next Service Date" type="date" value={values.next_service_date || ''} onChange={(value) => setValue('next_service_date', value)} />
          <Field label="Next Service Mileage" type="number" value={values.next_service_mileage ?? ''} onChange={(value) => setValue('next_service_mileage', value)} />
          <Field label="Next Service Hours" type="number" value={values.next_service_hours ?? ''} onChange={(value) => setValue('next_service_hours', value)} />
          <Field label="Downtime Hours" type="number" value={values.downtime_hours ?? ''} onChange={(value) => setValue('downtime_hours', value)} />

          <Field label="Description" value={values.description} onChange={(value) => setValue('description', value)} multiline />
          <Field label="Technician Notes" value={values.technician_notes} onChange={(value) => setValue('technician_notes', value)} multiline />
        </div>

        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Maintenance'}</button>
        </div>
      </form>
    </Modal>
  )
}

function FuelEditor({ initial, employees, saving, onClose, onSave }) {
  const [values, setValues] = useState({ ...EMPTY_FUEL_LOG, ...initial })
  const setValue = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))

  const calculatedTotal =
    Number(values.gallons || 0) * Number(values.price_per_gallon || 0)

  return (
    <Modal title={initial.id ? 'Edit Fuel Log' : 'Add Fuel Log'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave({ ...values, total_cost: values.total_cost || calculatedTotal }) }}>
        <div className="form-grid">
          <Field label="Fuel Date" type="date" value={values.fuel_date || ''} onChange={(value) => setValue('fuel_date', value)} />
          <SelectField
            label="Employee"
            value={values.employee_id || ''}
            onChange={(value) => setValue('employee_id', value)}
            options={[
              ['', 'Select employee'],
              ...employees.map((employee) => [employee.id, employeeName(employee)]),
            ]}
          />
          <Field label="Odometer" type="number" value={values.odometer ?? ''} onChange={(value) => setValue('odometer', value)} />
          <Field label="Engine Hours" type="number" value={values.engine_hours ?? ''} onChange={(value) => setValue('engine_hours', value)} />
          <Field label="Gallons" type="number" value={values.gallons ?? ''} onChange={(value) => setValue('gallons', value)} />
          <Field label="Price Per Gallon" type="number" value={values.price_per_gallon ?? ''} onChange={(value) => setValue('price_per_gallon', value)} />
          <Field label="Total Cost" type="number" value={values.total_cost || calculatedTotal} onChange={(value) => setValue('total_cost', value)} />
          <Field label="Vendor" value={values.vendor} onChange={(value) => setValue('vendor', value)} />
          <Field label="Receipt Number" value={values.receipt_number} onChange={(value) => setValue('receipt_number', value)} />
          <SelectField
            label="Full Tank"
            value={values.full_tank ? 'yes' : 'no'}
            onChange={(value) => setValue('full_tank', value === 'yes')}
            options={[
              ['yes', 'Yes'],
              ['no', 'No'],
            ]}
          />
          <Field label="Notes" value={values.notes} onChange={(value) => setValue('notes', value)} multiline />
        </div>

        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Fuel Log'}</button>
        </div>
      </form>
    </Modal>
  )
}

function InspectionEditor({ initial, employees, saving, onClose, onSave }) {
  const [values, setValues] = useState({ ...EMPTY_INSPECTION, ...initial })
  const setValue = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))

  const yesNoOptions = [
    ['yes', 'Yes'],
    ['no', 'No'],
  ]

  return (
    <Modal title={initial.id ? 'Edit Inspection' : 'Add Inspection'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(values) }}>
        <div className="form-grid">
          <Field label="Inspection Date" type="date" value={values.inspection_date || ''} onChange={(value) => setValue('inspection_date', value)} />
          <Field label="Inspection Type" value={values.inspection_type} onChange={(value) => setValue('inspection_type', value)} />
          <SelectField label="Status" value={values.status} onChange={(value) => setValue('status', value)} options={INSPECTION_STATUS_OPTIONS.map((item) => [item, item])} />

          <SelectField
            label="Inspector"
            value={values.employee_id || ''}
            onChange={(value) => setValue('employee_id', value)}
            options={[
              ['', 'Select employee'],
              ...employees.map((employee) => [employee.id, employeeName(employee)]),
            ]}
          />

          <Field label="Odometer" type="number" value={values.odometer ?? ''} onChange={(value) => setValue('odometer', value)} />
          <Field label="Engine Hours" type="number" value={values.engine_hours ?? ''} onChange={(value) => setValue('engine_hours', value)} />

          <SelectField label="Tires OK" value={values.tires_ok ? 'yes' : 'no'} onChange={(value) => setValue('tires_ok', value === 'yes')} options={yesNoOptions} />
          <SelectField label="Lights OK" value={values.lights_ok ? 'yes' : 'no'} onChange={(value) => setValue('lights_ok', value === 'yes')} options={yesNoOptions} />
          <SelectField label="Brakes OK" value={values.brakes_ok ? 'yes' : 'no'} onChange={(value) => setValue('brakes_ok', value === 'yes')} options={yesNoOptions} />
          <SelectField label="Fluids OK" value={values.fluids_ok ? 'yes' : 'no'} onChange={(value) => setValue('fluids_ok', value === 'yes')} options={yesNoOptions} />
          <SelectField label="Safety Equipment OK" value={values.safety_equipment_ok ? 'yes' : 'no'} onChange={(value) => setValue('safety_equipment_ok', value === 'yes')} options={yesNoOptions} />
          <SelectField label="Damage Found" value={values.damage_found ? 'yes' : 'no'} onChange={(value) => setValue('damage_found', value === 'yes')} options={yesNoOptions} />

          <Field label="Defects" value={values.defects} onChange={(value) => setValue('defects', value)} multiline />
          <Field label="Corrective Action" value={values.corrective_action} onChange={(value) => setValue('corrective_action', value)} multiline />
          <Field label="Notes" value={values.notes} onChange={(value) => setValue('notes', value)} multiline />
        </div>

        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Inspection'}</button>
        </div>
      </form>
    </Modal>
  )
}

function DocumentEditor({ initial, saving, onClose, onSave }) {
  const [values, setValues] = useState({ ...EMPTY_DOCUMENT, ...initial })
  const setValue = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))

  return (
    <Modal title={initial.id ? 'Edit Document' : 'Add Document'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(values) }}>
        <div className="form-grid">
          <SelectField label="Document Type" value={values.document_type} onChange={(value) => setValue('document_type', value)} options={DOCUMENT_TYPE_OPTIONS.map((item) => [item, item])} />
          <Field label="Title" value={values.title} onChange={(value) => setValue('title', value)} />
          <Field label="Document Number" value={values.document_number} onChange={(value) => setValue('document_number', value)} />
          <Field label="Issue Date" type="date" value={values.issue_date || ''} onChange={(value) => setValue('issue_date', value)} />
          <Field label="Expiration Date" type="date" value={values.expiration_date || ''} onChange={(value) => setValue('expiration_date', value)} />
          <Field label="File URL" value={values.file_url} onChange={(value) => setValue('file_url', value)} />
          <Field label="Notes" value={values.notes} onChange={(value) => setValue('notes', value)} multiline />
        </div>

        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Document'}</button>
        </div>
      </form>
    </Modal>
  )
}

function TireEditor({ initial, saving, onClose, onSave }) {
  const [values, setValues] = useState({ ...EMPTY_TIRE, ...initial })
  const setValue = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))

  return (
    <Modal title={initial.id ? 'Edit Tire Record' : 'Add Tire Record'} onClose={onClose}>
      <form onSubmit={(event) => { event.preventDefault(); onSave(values) }}>
        <div className="form-grid">
          <Field label="Position" value={values.position} onChange={(value) => setValue('position', value)} />
          <Field label="Brand" value={values.brand} onChange={(value) => setValue('brand', value)} />
          <Field label="Model" value={values.model} onChange={(value) => setValue('model', value)} />
          <Field label="Size" value={values.size} onChange={(value) => setValue('size', value)} />
          <Field label="Serial Number" value={values.serial_number} onChange={(value) => setValue('serial_number', value)} />
          <Field label="Installed Date" type="date" value={values.installed_date || ''} onChange={(value) => setValue('installed_date', value)} />
          <Field label="Installed Mileage" type="number" value={values.installed_mileage ?? ''} onChange={(value) => setValue('installed_mileage', value)} />
          <Field label="Current Tread Depth" type="number" value={values.current_tread_depth ?? ''} onChange={(value) => setValue('current_tread_depth', value)} />
          <Field label="Purchase Cost" type="number" value={values.purchase_cost ?? ''} onChange={(value) => setValue('purchase_cost', value)} />
          <SelectField
            label="Status"
            value={values.status}
            onChange={(value) => setValue('status', value)}
            options={[
              ['In Service', 'In Service'],
              ['Spare', 'Spare'],
              ['Removed', 'Removed'],
              ['Disposed', 'Disposed'],
            ]}
          />
          <Field label="Notes" value={values.notes} onChange={(value) => setValue('notes', value)} multiline />
        </div>

        <div className="actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving}>{saving ? 'Saving...' : 'Save Tire Record'}</button>
        </div>
      </form>
    </Modal>
  )
}