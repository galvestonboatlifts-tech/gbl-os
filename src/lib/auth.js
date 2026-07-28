import { supabase } from './supabase'
import { normalizeRole, USER_ROLES } from './permissions'

export async function signInWithEmail(email, password) {
  const cleanEmail = String(email || '')
    .trim()
    .toLowerCase()

  if (!cleanEmail) {
    throw new Error('Email is required.')
  }

  if (!password) {
    throw new Error('Password is required.')
  }

  const { data, error } =
    await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

  if (error) {
    throw error
  }

  return data
}

export async function signOutUser() {
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}

export async function sendPasswordReset(email) {
  const cleanEmail = String(email || '')
    .trim()
    .toLowerCase()

  if (!cleanEmail) {
    throw new Error('Email is required.')
  }

  const redirectTo = `${window.location.origin}/`

  const { data, error } =
    await supabase.auth.resetPasswordForEmail(
      cleanEmail,
      {
        redirectTo,
      },
    )

  if (error) {
    throw error
  }

  return data
}

export async function updatePassword(password) {
  if (!password || password.length < 8) {
    throw new Error(
      'Password must be at least 8 characters.',
    )
  }

  const { data, error } =
    await supabase.auth.updateUser({
      password,
    })

  if (error) {
    throw error
  }

  return data
}

export async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  return session
}

export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  return user
}

export async function getProfile(userId) {
  if (!userId) {
    return null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      full_name,
      phone,
      role,
      active,
      employee_id,
      customer_id,
      avatar_url,
      created_at,
      updated_at
    `)
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return {
    ...data,
    role: normalizeRole(data.role),
  }
}

export async function getCurrentProfile() {
  const user = await getCurrentUser()

  if (!user) {
    return null
  }

  return getProfile(user.id)
}

export function getSafeProfile(profile, user) {
  if (profile) {
    return {
      ...profile,
      role: normalizeRole(profile.role),
    }
  }

  return {
    id: user?.id || null,
    email: user?.email || '',
    full_name:
      user?.user_metadata?.full_name ||
      user?.email ||
      'GBL OS User',
    phone: user?.phone || '',
    role: USER_ROLES.CUSTOMER,
    active: true,
    employee_id: null,
    customer_id: null,
    avatar_url: null,
  }
}