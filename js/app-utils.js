import { supabase } from './supabase-client.js'

export async function requireAuth(redirectTo = 'login.html') {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.href = redirectTo
    return null
  }
  return session
}

export async function requireTutor(redirectTo = 'dashboard.html') {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.href = 'login.html'
    return null
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()
  if (!profile || !['tutor', 'admin'].includes(profile.role)) {
    window.location.href = redirectTo
    return null
  }
  return session
}

export async function getCurrentProfile() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single()
  return profile
}

export function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleString()
}
