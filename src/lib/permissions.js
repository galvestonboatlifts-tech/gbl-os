export const USER_ROLES = {
  ADMIN: 'admin',
  TECHNICIAN: 'technician',
  CUSTOMER: 'customer',
}

export const ROLE_LABELS = {
  [USER_ROLES.ADMIN]: 'Admin',
  [USER_ROLES.TECHNICIAN]: 'Technician',
  [USER_ROLES.CUSTOMER]: 'Customer',
}

export const PERMISSIONS = {
  VIEW_ADMIN_DASHBOARD: 'view_admin_dashboard',
  VIEW_TECHNICIAN_DASHBOARD: 'view_technician_dashboard',
  VIEW_CUSTOMER_PORTAL: 'view_customer_portal',

  MANAGE_USERS: 'manage_users',
  MANAGE_EMPLOYEES: 'manage_employees',
  MANAGE_CUSTOMERS: 'manage_customers',
  MANAGE_PROPERTIES: 'manage_properties',
  MANAGE_BOAT_LIFTS: 'manage_boat_lifts',
  MANAGE_ESTIMATES: 'manage_estimates',
  MANAGE_JOBS: 'manage_jobs',
  MANAGE_SCHEDULING: 'manage_scheduling',
  MANAGE_DISPATCH: 'manage_dispatch',
  MANAGE_INVENTORY: 'manage_inventory',
  MANAGE_INVOICES: 'manage_invoices',
  MANAGE_ACCOUNTING: 'manage_accounting',
  MANAGE_REPORTS: 'manage_reports',
  MANAGE_SETTINGS: 'manage_settings',

  VIEW_ASSIGNED_JOBS: 'view_assigned_jobs',
  UPDATE_ASSIGNED_JOBS: 'update_assigned_jobs',
  COMPLETE_SERVICE_REPORTS: 'complete_service_reports',
  UPLOAD_JOB_PHOTOS: 'upload_job_photos',
  VIEW_BOAT_LIFT_DETAILS: 'view_boat_lift_details',
  USE_JOB_INVENTORY: 'use_job_inventory',
  CLOCK_IN_OUT: 'clock_in_out',

  VIEW_OWN_PROPERTIES: 'view_own_properties',
  VIEW_OWN_BOAT_LIFTS: 'view_own_boat_lifts',
  VIEW_OWN_SERVICE_HISTORY: 'view_own_service_history',
  VIEW_OWN_ESTIMATES: 'view_own_estimates',
  VIEW_OWN_INVOICES: 'view_own_invoices',
  REQUEST_SERVICE: 'request_service',
  VIEW_OWN_WARRANTY: 'view_own_warranty',
}

const ADMIN_PERMISSIONS = Object.values(PERMISSIONS)

const TECHNICIAN_PERMISSIONS = [
  PERMISSIONS.VIEW_TECHNICIAN_DASHBOARD,
  PERMISSIONS.VIEW_ASSIGNED_JOBS,
  PERMISSIONS.UPDATE_ASSIGNED_JOBS,
  PERMISSIONS.COMPLETE_SERVICE_REPORTS,
  PERMISSIONS.UPLOAD_JOB_PHOTOS,
  PERMISSIONS.VIEW_BOAT_LIFT_DETAILS,
  PERMISSIONS.USE_JOB_INVENTORY,
  PERMISSIONS.CLOCK_IN_OUT,
]

const CUSTOMER_PERMISSIONS = [
  PERMISSIONS.VIEW_CUSTOMER_PORTAL,
  PERMISSIONS.VIEW_OWN_PROPERTIES,
  PERMISSIONS.VIEW_OWN_BOAT_LIFTS,
  PERMISSIONS.VIEW_OWN_SERVICE_HISTORY,
  PERMISSIONS.VIEW_OWN_ESTIMATES,
  PERMISSIONS.VIEW_OWN_INVOICES,
  PERMISSIONS.REQUEST_SERVICE,
  PERMISSIONS.VIEW_OWN_WARRANTY,
]

export const ROLE_PERMISSIONS = {
  [USER_ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [USER_ROLES.TECHNICIAN]: TECHNICIAN_PERMISSIONS,
  [USER_ROLES.CUSTOMER]: CUSTOMER_PERMISSIONS,
}

export function normalizeRole(role) {
  const value = String(role || '')
    .trim()
    .toLowerCase()

  if (Object.values(USER_ROLES).includes(value)) {
    return value
  }

  return USER_ROLES.CUSTOMER
}

export function getRolePermissions(role) {
  const normalizedRole = normalizeRole(role)

  return ROLE_PERMISSIONS[normalizedRole] || []
}

export function hasPermission(role, permission) {
  return getRolePermissions(role).includes(permission)
}

export function hasAnyPermission(role, permissions = []) {
  return permissions.some((permission) =>
    hasPermission(role, permission),
  )
}

export function hasAllPermissions(role, permissions = []) {
  return permissions.every((permission) =>
    hasPermission(role, permission),
  )
}

export function isAdmin(role) {
  return normalizeRole(role) === USER_ROLES.ADMIN
}

export function isTechnician(role) {
  return normalizeRole(role) === USER_ROLES.TECHNICIAN
}

export function isCustomer(role) {
  return normalizeRole(role) === USER_ROLES.CUSTOMER
}

export function getDefaultViewForRole(role) {
  const normalizedRole = normalizeRole(role)

  if (normalizedRole === USER_ROLES.ADMIN) {
    return 'dashboard'
  }

  if (normalizedRole === USER_ROLES.TECHNICIAN) {
    return 'technicianDashboard'
  }

  return 'customerPortal'
}