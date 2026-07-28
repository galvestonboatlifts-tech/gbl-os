import { useEffect, useState } from 'react'

import { useAuth } from './context/AuthContext'
import LoginPage from './features/authentication/LoginPage'
import BoatLiftsModule from './features/boatLifts/BoatLiftsModule'
import CustomersModule from './features/customers/CustomersModule'
import EmployeesModule from './features/employees/EmployeesModule'
import EstimatesModule from './features/estimates/EstimatesModule'
import FleetModule from './features/fleet/FleetModule'
import InventoryModule from './features/inventory/InventoryModule'
import InvoicesModule from './features/invoices/InvoicesModule'
import JobsModule from './features/jobs/JobsModule'
import SchedulingModule from './features/scheduling/SchedulingModule'
import ServiceReportsModule from './features/serviceReports/ServiceReportModal'
import AppLayout from './layouts/AppLayout'
import { supabase } from './lib/supabase'
import AdminDashboard from './pages/AdminDashboard'
import CustomerDashboard from './pages/CustomerDashboard'
import ModulePlaceholder from './pages/ModulePlaceholder'
import TechnicianDashboard from './pages/TechnicianDashboard'

const MODULES = {
  dashboard: {
    title: 'Dashboard',
    description:
      'Overview of jobs, estimates, invoices, employees, and business activity.',
  },

  customers: {
    title: 'Customers',
    description:
      'Manage customer profiles, properties, contact information, and service history.',
  },

  boatLifts: {
    title: 'Boat Lifts',
    description:
      'View and manage installed boat lifts, equipment details, warranties, and maintenance records.',
  },

  scheduling: {
    title: 'Scheduling',
    description:
      'Plan jobs, assign technicians, manage appointments, and organize the work calendar.',
  },

  jobs: {
    title: 'Jobs',
    description:
      'Track active jobs, assigned technicians, job status, materials, and completion progress.',
  },

  serviceReports: {
    title: 'Service Reports',
    description:
      'Create, review, and manage technician service reports, photos, notes, and customer approvals.',
  },

  inventory: {
    title: 'Inventory',
    description:
      'Track parts, equipment, stock levels, job usage, purchasing, and inventory alerts.',
  },

  employees: {
    title: 'Employees',
    description:
      'Manage technicians, employee records, roles, schedules, and account access.',
  },

  fleet: {
    title: 'Fleet',
    description:
      'Manage company vehicles, trailers, maintenance, inspections, and assigned drivers.',
  },

  estimates: {
    title: 'Estimates',
    description:
      'Build, send, approve, and track customer estimates and proposed work.',
  },

  invoices: {
    title: 'Invoices',
    description:
      'Create invoices, track balances, record payments, and review customer billing history.',
  },

  reports: {
    title: 'Reports',
    description:
      'Review business performance, job activity, revenue, inventory, and operational reports.',
  },

  settings: {
    title: 'Settings',
    description:
      'Configure company information, user access, notifications, integrations, and system preferences.',
  },
}

function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isTechnicianRole(role) {
  return (
    role === 'technician' ||
    role === 'tech' ||
    role.includes('technician') ||
    role.includes('installer') ||
    role.includes('service')
  )
}

function isCustomerRole(role) {
  return (
    role === 'customer' ||
    role === 'client' ||
    role.includes('customer') ||
    role.includes('client')
  )
}

export default function App() {
  const {
    loading,
    profileLoading,
    isAuthenticated,
    profile,
    user,
  } = useAuth()

  const [activeView, setActiveView] = useState('dashboard')
  const [resolvedRole, setResolvedRole] = useState('')
  const [roleLoading, setRoleLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function resolveUserRole() {
      if (!isAuthenticated) {
        if (isMounted) {
          setResolvedRole('')
          setRoleLoading(false)
        }

        return
      }

      setRoleLoading(true)

      const roleFromProfile = normalizeRole(
        profile?.role ||
          profile?.user_role ||
          profile?.account_type ||
          profile?.type
      )

      if (roleFromProfile) {
        if (isMounted) {
          setResolvedRole(roleFromProfile)
          setRoleLoading(false)
        }

        return
      }

      try {
        const authResult = user
          ? { data: { user } }
          : await supabase.auth.getUser()

        const authUser = authResult?.data?.user

        if (!authUser) {
          if (isMounted) {
            setResolvedRole('admin')
            setRoleLoading(false)
          }

          return
        }

        const metadataRole = normalizeRole(
          authUser.user_metadata?.role ||
            authUser.user_metadata?.user_role ||
            authUser.app_metadata?.role ||
            authUser.app_metadata?.user_role
        )

        if (metadataRole) {
          if (isMounted) {
            setResolvedRole(metadataRole)
            setRoleLoading(false)
          }

          return
        }

        const { data: employeeRecord } = await supabase
          .from('employees')
          .select('*')
          .or(
            `user_id.eq.${authUser.id},auth_user_id.eq.${authUser.id},email.eq.${authUser.email}`
          )
          .maybeSingle()

        const employeeRole = normalizeRole(
          employeeRecord?.role ||
            employeeRecord?.user_role ||
            employeeRecord?.position ||
            employeeRecord?.job_title
        )

        if (isTechnicianRole(employeeRole)) {
          if (isMounted) {
            setResolvedRole('technician')
            setRoleLoading(false)
          }

          return
        }

        const { data: customerRecord } = await supabase
          .from('customers')
          .select('*')
          .or(
            `user_id.eq.${authUser.id},auth_user_id.eq.${authUser.id},email.eq.${authUser.email}`
          )
          .maybeSingle()

        if (isMounted) {
          if (customerRecord) {
            setResolvedRole('customer')
          } else {
            setResolvedRole('admin')
          }

          setRoleLoading(false)
        }
      } catch (error) {
        console.warn(
          'Unable to determine account role. Defaulting to admin dashboard.',
          error
        )

        if (isMounted) {
          setResolvedRole('admin')
          setRoleLoading(false)
        }
      }
    }

    resolveUserRole()

    return () => {
      isMounted = false
    }
  }, [
    isAuthenticated,
    profile,
    user,
  ])

  if (
    loading ||
    profileLoading ||
    roleLoading
  ) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#ffffff',
          fontSize: '1.25rem',
          fontWeight: 700,
        }}
      >
        Loading GBL OS...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  const currentModule =
    MODULES[activeView] || MODULES.dashboard

  function navigateTo(view) {
    setActiveView(view)
  }

  function renderDashboard() {
    if (isCustomerRole(resolvedRole)) {
      return (
        <CustomerDashboard
          supabase={supabase}
          onNavigate={navigateTo}
        />
      )
    }

    if (isTechnicianRole(resolvedRole)) {
      return (
        <TechnicianDashboard
          supabase={supabase}
          onNavigate={navigateTo}
        />
      )
    }

    return (
      <AdminDashboard
        supabase={supabase}
        onNavigate={navigateTo}
      />
    )
  }

  function renderActiveModule() {
    switch (activeView) {
      case 'dashboard':
        return renderDashboard()

      case 'customers':
        return <CustomersModule />

      case 'boatLifts':
        return <BoatLiftsModule supabase={supabase} />

      case 'scheduling':
        return <SchedulingModule supabase={supabase} />

      case 'jobs':
        return <JobsModule />

      case 'serviceReports':
        return (
          <ServiceReportsModule
            supabase={supabase}
            onOpenJob={() => navigateTo('jobs')}
            onCreateInvoice={() => navigateTo('invoices')}
          />
        )

      case 'inventory':
        return <InventoryModule />

      case 'employees':
        return <EmployeesModule supabase={supabase} />

      case 'fleet':
        return <FleetModule supabase={supabase} />

      case 'estimates':
        return (
          <EstimatesModule
            supabase={supabase}
            onOpenCustomer={() => navigateTo('customers')}
            onOpenJob={() => navigateTo('jobs')}
            onCreateInvoice={() => navigateTo('invoices')}
          />
        )

      case 'invoices':
        return (
          <InvoicesModule
            supabase={supabase}
            onOpenCustomer={() => navigateTo('customers')}
            onOpenJob={() => navigateTo('jobs')}
            onOpenEstimate={() => navigateTo('estimates')}
          />
        )

      default:
        return (
          <ModulePlaceholder
            title={currentModule.title}
            description={currentModule.description}
          />
        )
    }
  }

  return (
    <AppLayout
      activeView={activeView}
      onNavigate={navigateTo}
    >
      {renderActiveModule()}
    </AppLayout>
  )
}
