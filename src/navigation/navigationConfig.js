import { USER_ROLES } from '../lib/permissions'

export const NAVIGATION = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: '🏠',
    roles: [
      USER_ROLES.ADMIN,
      USER_ROLES.TECHNICIAN,
      USER_ROLES.CUSTOMER,
    ],
  },

  {
    id: 'customers',
    label: 'Customers',
    icon: '👥',
    roles: [
      USER_ROLES.ADMIN,
      USER_ROLES.TECHNICIAN,
    ],
  },

  {
    id: 'boatLifts',
    label: 'Boat Lifts',
    icon: '⚓',
    roles: [
      USER_ROLES.ADMIN,
      USER_ROLES.TECHNICIAN,
      USER_ROLES.CUSTOMER,
    ],
  },

  {
    id: 'scheduling',
    label: 'Scheduling',
    icon: '📅',
    roles: [
      USER_ROLES.ADMIN,
      USER_ROLES.TECHNICIAN,
    ],
  },

  {
    id: 'jobs',
    label: 'Jobs',
    icon: '🛠️',
    roles: [
      USER_ROLES.ADMIN,
      USER_ROLES.TECHNICIAN,
    ],
  },

  {
    id: 'serviceReports',
    label: 'Service Reports',
    icon: '📋',
    roles: [
      USER_ROLES.ADMIN,
      USER_ROLES.TECHNICIAN,
      USER_ROLES.CUSTOMER,
    ],
  },

  {
    id: 'inventory',
    label: 'Inventory',
    icon: '📦',
    roles: [
      USER_ROLES.ADMIN,
      USER_ROLES.TECHNICIAN,
    ],
  },

  {
    id: 'employees',
    label: 'Employees',
    icon: '👷',
    roles: [USER_ROLES.ADMIN],
  },

  {
    id: 'fleet',
    label: 'Fleet',
    icon: '🚚',
    roles: [USER_ROLES.ADMIN],
  },

  {
    id: 'estimates',
    label: 'Estimates',
    icon: '💰',
    roles: [
      USER_ROLES.ADMIN,
      USER_ROLES.CUSTOMER,
    ],
  },

  {
    id: 'invoices',
    label: 'Invoices',
    icon: '🧾',
    roles: [
      USER_ROLES.ADMIN,
      USER_ROLES.CUSTOMER,
    ],
  },

  {
    id: 'reports',
    label: 'Reports',
    icon: '📈',
    roles: [USER_ROLES.ADMIN],
  },

  {
    id: 'settings',
    label: 'Settings',
    icon: '⚙️',
    roles: [USER_ROLES.ADMIN],
  },
]

export function getNavigation(role) {
  return NAVIGATION.filter((item) => {
    if (!item.roles) {
      return false
    }

    return item.roles.includes(role)
  })
}