import { useEffect, useState } from 'react'

import './AppLayout.css'
import Sidebar from '../components/layout/Sidebar'

export default function AppLayout({
  children,
  activeView,
  onNavigate,
}) {
  const [sidebarCollapsed, setSidebarCollapsed] =
    useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false)

  useEffect(() => {
    function handleResize() {
      if (window.innerWidth > 768) {
        setMobileMenuOpen(false)
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [activeView])

  function handleToggleSidebar() {
    setSidebarCollapsed((currentValue) => !currentValue)
  }

  function handleToggleMobileMenu() {
    setMobileMenuOpen((currentValue) => !currentValue)
  }

  function handleCloseMobileMenu() {
    setMobileMenuOpen(false)
  }

  function handleNavigate(view) {
    onNavigate(view)
    setMobileMenuOpen(false)
  }

  return (
    <div
      className={[
        'app-shell',
        sidebarCollapsed
          ? 'app-shell--sidebar-collapsed'
          : '',
        mobileMenuOpen
          ? 'app-shell--mobile-menu-open'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="mobile-menu-button"
        onClick={handleToggleMobileMenu}
        aria-label={
          mobileMenuOpen
            ? 'Close navigation menu'
            : 'Open navigation menu'
        }
        aria-expanded={mobileMenuOpen}
      >
        <span aria-hidden="true">
          {mobileMenuOpen ? '✕' : '☰'}
        </span>
      </button>

      {mobileMenuOpen && (
        <button
          type="button"
          className="mobile-sidebar-overlay"
          onClick={handleCloseMobileMenu}
          aria-label="Close navigation menu"
        />
      )}

      <aside
        className={[
          'app-sidebar-wrapper',
          mobileMenuOpen
            ? 'app-sidebar-wrapper--open'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Sidebar
          activeView={activeView}
          onNavigate={handleNavigate}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={handleToggleSidebar}
        />
      </aside>

      <main className="app-main">
        <div className="app-mobile-header">
          <button
            type="button"
            className="app-mobile-header__menu"
            onClick={handleToggleMobileMenu}
            aria-label="Open navigation menu"
          >
            ☰
          </button>

          <div className="app-mobile-header__title">
            GBL OS
          </div>
        </div>

        <div className="app-main__content">
          {children}
        </div>
      </main>
    </div>
  )
}