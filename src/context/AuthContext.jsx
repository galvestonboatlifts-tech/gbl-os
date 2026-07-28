import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase } from '../lib/supabase'
import {
  getProfile,
  getSafeProfile,
  signInWithEmail,
  signOutUser,
} from '../lib/auth'
import {
  hasPermission,
  isAdmin,
  isCustomer,
  isTechnician,
} from '../lib/permissions'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileLoading, setProfileLoading] =
    useState(false)
  const [authError, setAuthError] = useState('')

  const loadProfile = useCallback(async (authUser) => {
    if (!authUser?.id) {
      setProfile(null)
      return null
    }

    setProfileLoading(true)

    try {
      const profileData = await getProfile(authUser.id)
      const safeProfile = getSafeProfile(
        profileData,
        authUser,
      )

      setProfile(safeProfile)

      return safeProfile
    } catch (error) {
      console.error('Unable to load profile:', error)

      const fallbackProfile = getSafeProfile(
        null,
        authUser,
      )

      setProfile(fallbackProfile)
      setAuthError(
        'Your account is signed in, but the profile could not be loaded.',
      )

      return fallbackProfile
    } finally {
      setProfileLoading(false)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      return null
    }

    return loadProfile(user)
  }, [loadProfile, user])

  useEffect(() => {
    let mounted = true

    async function initializeAuth() {
      try {
        const {
          data: { session: currentSession },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          throw error
        }

        if (!mounted) {
          return
        }

        setSession(currentSession)
        setUser(currentSession?.user || null)

        if (currentSession?.user) {
          await loadProfile(currentSession.user)
        } else {
          setProfile(null)
        }
      } catch (error) {
        console.error(
          'Unable to initialize authentication:',
          error,
        )

        if (mounted) {
          setAuthError(
            error?.message ||
              'Unable to initialize authentication.',
          )
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    initializeAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) {
          return
        }

        const nextUser = nextSession?.user || null

        setSession(nextSession)
        setUser(nextUser)
        setAuthError('')

        if (event === 'SIGNED_OUT' || !nextUser) {
          setProfile(null)
          setLoading(false)
          return
        }

        if (
          event === 'SIGNED_IN' ||
          event === 'INITIAL_SESSION' ||
          event === 'TOKEN_REFRESHED' ||
          event === 'USER_UPDATED' ||
          event === 'PASSWORD_RECOVERY'
        ) {
          window.setTimeout(() => {
            if (mounted) {
              loadProfile(nextUser)
            }
          }, 0)
        }

        setLoading(false)
      },
    )

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email, password) => {
    setAuthError('')

    try {
      const data = await signInWithEmail(
        email,
        password,
      )

      return {
        success: true,
        data,
      }
    } catch (error) {
      const message =
        error?.message ||
        'Unable to sign in. Check your email and password.'

      setAuthError(message)

      return {
        success: false,
        error: message,
      }
    }
  }, [])

  const signOut = useCallback(async () => {
    setAuthError('')

    try {
      await signOutUser()

      setSession(null)
      setUser(null)
      setProfile(null)

      return {
        success: true,
      }
    } catch (error) {
      const message =
        error?.message || 'Unable to sign out.'

      setAuthError(message)

      return {
        success: false,
        error: message,
      }
    }
  }, [])

  const clearAuthError = useCallback(() => {
    setAuthError('')
  }, [])

  const role = profile?.role || null
  const isActive = profile?.active !== false
  const isAuthenticated = Boolean(session?.user)
  const isReady =
    !loading && !profileLoading

  const can = useCallback(
    (permission) => {
      if (!role || !isActive) {
        return false
      }

      return hasPermission(role, permission)
    },
    [isActive, role],
  )

  const value = useMemo(
    () => ({
      session,
      user,
      profile,
      role,

      loading,
      profileLoading,
      isReady,

      authError,
      clearAuthError,

      isAuthenticated,
      isActive,

      isAdmin: isAdmin(role),
      isTechnician: isTechnician(role),
      isCustomer: isCustomer(role),

      can,

      signIn,
      signOut,
      refreshProfile,
    }),
    [
      session,
      user,
      profile,
      role,
      loading,
      profileLoading,
      isReady,
      authError,
      clearAuthError,
      isAuthenticated,
      isActive,
      can,
      signIn,
      signOut,
      refreshProfile,
    ],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error(
      'useAuth must be used inside an AuthProvider.',
    )
  }

  return context
}

export default AuthContext