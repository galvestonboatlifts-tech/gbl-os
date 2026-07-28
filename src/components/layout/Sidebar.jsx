import { useMemo } from 'react'

import { useAuth } from '../../context/AuthContext'
import { getNavigation } from '../../navigation/navigationConfig'

export default function Sidebar({
  activeView,
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}) {
  const {
    profile,
    role,
    can,
    signOut,
  } = useAuth()

  const navigationItems = useMemo(
    () => getNavigation(role, can),
    [role, can],
  )

  const displayName =
    profile?.full_name?.trim() ||
    profile?.email ||
    'GBL OS User'

  const displayRole = role
    ? role.charAt(0).toUpperCase() + role.slice(1)
    : ''

  async function handleSignOut() {
    await signOut()
  }

  return (
    <aside
      className={
        collapsed
          ? 'app-sidebar app-sidebar--collapsed'
          : 'app-sidebar'
      }
    >
      <div className="app-sidebar__header">
        <button
          type="button"
          className="app-sidebar__brand"
          onClick={() => onNavigate('dashboard')}
          aria-label="Open dashboard"
        >
          <span className="app-sidebar__brand-mark">
            G
          </span>

          {!collapsed && (
            <span className="app-sidebar__brand-text">
              GBL OS
            </span>
          )}
        </button>

        <button
          type="button"
          className="app-sidebar__toggle"
          onClick={onToggleCollapsed}
          aria-label={
            collapsed
              ? 'Expand sidebar'
              : 'Collapse sidebar'
          }
          title={
            collapsed
              ? 'Expand sidebar'
              : 'Collapse sidebar'
          }
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <nav
        className="app-sidebar__navigation"
        aria-label="Main navigation"
      >
        {navigationItems.map((item) => {
          const isActive = activeView === item.id

          return (
            <button
              key={item.id}
              type="button"
              className={
                isActive
                  ? 'app-sidebar__nav-item app-sidebar__nav-item--active'
                  : 'app-sidebar__nav-item'
              }
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <span className="app-sidebar__nav-icon">
                {item.icon}
              </span>

              {!collapsed && (
                <span className="app-sidebar__nav-label">
                  {item.label}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="app-sidebar__footer">
        <div className="app-sidebar__user">
          <div className="app-sidebar__avatar">
            {displayName.charAt(0).toUpperCase()}
          </div>

          {!collapsed && (
            <div className="app-sidebar__user-details">
              <strong>{displayName}</strong>
              <span>{displayRole}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          className="app-sidebar__logout"
          onClick={handleSignOut}
          title={collapsed ? 'Sign out' : undefined}
        >
          <span>↪</span>

          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}