import { supabase } from './supabase-client.js'
import { requireAuth, getCurrentProfile } from './app-utils.js'
import { ensurePrescription, diagLabel, DIAGNOSES } from './prescription.js'

function el(tag, styles, text) {
  const n = document.createElement(tag)
  if (styles) n.style.cssText = styles
  if (text != null) n.textContent = text
  return n
}

const STATUS_STYLE = {
  passed:   { label: 'Passed',   color: '#22c55e' },
  available:{ label: 'Ready',    color: '#38bdf8' },
  submitted:{ label: 'In review',color: '#d4af37' },
  failed:   { label: 'Needs redo',color: '#f87171' },
  locked:   { label: 'Locked',   color: '#64748b' }
}

function renderRx(tasks, progress) {
  const list = document.getElementById('rx-list')
  const empty = document.getElementById('rx-empty')
  if (!list) return
  list.innerHTML = ''

  if (!tasks.length) {
    if (empty) empty.style.display = ''
    return
  }
  if (empty) empty.style.display = 'none'

  let lastDay = null
  tasks.forEach((t, i) => {
    const status = progress[t.id] || 'locked'
    const meta = STATUS_STYLE[status] || STATUS_STYLE.locked
    const locked = status === 'locked'

    if (t.day_id !== lastDay) {
      lastDay = t.day_id
      list.appendChild(el('div', 'color:#d4af37;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-top:' + (i ? '14px' : '0') + ';padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.08)', `Day ${t.day_id}`))
    }

    const card = el('div', 'padding:16px;background:#0f1720;border:1px solid rgba(255,255,255,.08);border-radius:12px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap')

    const left = el('div', 'flex:1;min-width:200px')
    left.appendChild(el('div', 'color:#e2e8f0;font-weight:700;font-size:16px', t.title))
    if (t.summary) left.appendChild(el('div', 'color:#94a3b8;font-size:14px;margin-top:4px', t.summary))
    left.appendChild(el('div', `color:${meta.color};font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-top:8px`, meta.label))
    card.appendChild(left)

    const btn = el('button', `btn ${locked ? 'btn-outline' : 'btn-primary'} btn-sm`, locked ? 'Locked' : (status === 'passed' ? 'Review' : 'Start'))
    btn.disabled = locked
    if (!locked) btn.addEventListener('click', () => { window.location.href = `task.html?id=${encodeURIComponent(t.id)}` })
    card.appendChild(btn)

    list.appendChild(card)
  })
}

async function initDashboard() {
  const session = await requireAuth()
  if (!session) return

  const profile = await getCurrentProfile()
  const profName = document.getElementById('profile-name')
  const diagEl = document.getElementById('diag')
  const roleEl = document.getElementById('role')
  const code = profile?.diagnosis_code || null

  if (profName) profName.textContent = profile?.full_name || session.user.email
  if (diagEl) diagEl.textContent = diagLabel(code)
  if (roleEl) roleEl.textContent = profile?.role || 'student'

  const { data: latest } = await supabase
    .from('assessment_results')
    .select('diagnosis_code,finished_at,created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const latestEl = document.getElementById('latest-assess')
  if (latestEl) {
    if (latest) {
      latestEl.textContent = `${diagLabel(latest.diagnosis_code)} — completed ${new Date(latest.finished_at || latest.created_at).toLocaleString()}`
    } else {
      latestEl.textContent = 'No assessment completed yet.'
    }
  }

  if (profile?.role === 'tutor' || profile?.role === 'admin') {
    const tutorNav = document.getElementById('tutor-nav')
    const tutorCard = document.getElementById('tutor-card')
    if (tutorNav) tutorNav.style.display = ''
    if (tutorCard) tutorCard.style.display = ''
  }

  const noteEl = document.getElementById('rx-note')
  if (noteEl) {
    noteEl.textContent = DIAGNOSES[code]
      ? DIAGNOSES[code].note
      : 'Take the Impulse Test to generate a diagnosis and unlock your personalised task path.'
  }

  let tasks = []
  let progress = {}
  try {
    const rx = await ensurePrescription(session.user.id, code)
    tasks = rx.tasks
    progress = rx.progress
  } catch (err) {
    if (noteEl) noteEl.textContent = 'Could not load your tasks. If you just added tasks, the database may need the schema migration in supabase/migrations/.'
    console.error(err)
  }

  renderRx(tasks, progress)

  const progCount = document.getElementById('prog-count')
  if (progCount) {
    const passed = Object.values(progress).filter(s => s === 'passed').length
    const ready = Object.values(progress).filter(s => s === 'available').length
    progCount.textContent = `${passed} passed • ${ready} ready • ${tasks.length} assigned`
  }
}

document.addEventListener('DOMContentLoaded', initDashboard)