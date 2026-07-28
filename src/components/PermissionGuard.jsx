import React from 'react'
import { hasPermission } from '../lib/permissions'

export default function PermissionGuard({
  role,
  permission,
  permissions = [],
  requireAny = false,
  fallback = null,
  children,
}) {
  if (!role) {
    return fallback
  }

  if (permission) {
    return hasPermission(role, permission)
      ? children
      : fallback
  }

  if (permissions.length) {
    const allowed = requireAny
      ? permissions.some((item) =>
          hasPermission(role, item),
        )
      : permissions.every((item) =>
          hasPermission(role, item),
        )

    return allowed ? children : fallback
  }

  return children
}