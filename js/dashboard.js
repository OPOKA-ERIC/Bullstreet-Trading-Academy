import { supabase } from './supabase-client.js'
import { requireAuth, getCurrentProfile } from './app-utils.js'

async function initDashboard() {
  const session = await requireAuth()
  if (!session) return

  const profile = await getCurrentProfile()
  const profName = document.getElementById('profile-name')
  const diagEl = document.getElementById('diag')
  const roleEl = document.getElementById('role')

  if (profName) profName.textContent = profile?.full_name || session.user.email
  if (diagEl) diagEl.textContent = profile?.diagnosis_code ? profile.diagnosis_code.replaceAll('_',' ') : 'Not taken yet'
  if (roleEl) roleEl.textContent = profile?.role || 'student'

  // Get latest assessment
  const { data: latest } = await supabase
    .from('assessment_results')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const latestEl = document.getElementById('latest-assess')
  if (latestEl) {
    if (latest) {
      latestEl.innerHTML = `Diagnosis: <strong>${(latest.diagnosis_code||'').replaceAll('_',' ')}</strong> • Completed ${new Date(latest.finished_at||latest.created_at).toLocaleString()}`
    } else {
      latestEl.textContent = 'No assessment completed yet.'
    }
  }

  // Check if tutor -> show grading link
  if (profile?.role === 'tutor' || profile?.role === 'admin') {
    const tutorNav = document.getElementById('tutor-nav')
    const tutorCard = document.getElementById('tutor-card')
    if (tutorNav) tutorNav.style.display = ''
    if (tutorCard) tutorCard.style.display = ''
  }

  // Load progress/tasks overview (simple)
  const { data: progress } = await supabase
    .from('user_progress')
    .select('status, task_id, day_id')
    .eq('user_id', session.user.id)
  const progCount = document.getElementById('prog-count')
  if (progCount) {
    const passed = (progress||[]).filter(p=>p.status==='passed').length
    progCount.textContent = `${passed} passed • ${(progress||[]).length} tracked`
  }
}

document.addEventListener('DOMContentLoaded', initDashboard)
