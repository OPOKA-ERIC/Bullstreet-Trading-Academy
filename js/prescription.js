import { supabase } from './supabase-client.js'

export const DIAGNOSES = {
  'Revenge': {
    label: 'Revenge Trader',
    note: 'You recover losses with urgency and escalate risk after a hit. This path trains impulse control and hard rule enforcement.'
  },
  'FOMO': {
    label: 'FOMO Trader',
    note: 'You enter late because the move feels "already gone". This path trains patience and confirmation discipline.'
  },
  'Analysis_Paralysis': {
    label: 'Analysis Paralysis',
    note: 'You research past the point of decision. This path trains an action threshold and decision speed.'
  },
  'Overconfidence': {
    label: 'Overconfident Trader',
    note: 'Strong results have inflated your position sizing. This path trains humility and risk discipline.'
  },
  'Overtrading': {
    label: 'Overtrader',
    note: 'You take too many low-quality setups. This path trains selectivity and daily trade limits.'
  },
  'Fear_Of_Missing/Impatience': {
    label: 'Impatient / Fearful Closer',
    note: 'You rush entries and hesitate on exits. This path trains execution discipline.'
  },
  'Patience': {
    label: 'Patient Tendency',
    note: 'You wait well but can over-hold. This path refines exits and profit-taking.'
  },
  'Action': {
    label: 'Decisive Tendency',
    note: 'You act fast but can skip confirmation. This path refines setup validation.'
  },
  'Discipline': {
    label: 'Disciplined Baseline',
    note: 'Solid foundation. This path sharpens consistency and stretches your edge.'
  }
}

export function humanDiag(code) {
  if (code && DIAGNOSES[code]) return DIAGNOSES[code].note
  if (code) return code.replace(/_/g, ' ')
  return 'Balanced. Focus on consistency.'
}

export function diagLabel(code) {
  if (code && DIAGNOSES[code]) return DIAGNOSES[code].label
  return code ? code.replace(/_/g, ' ') : 'Not assessed'
}

export function pickTopDiag(tendencies) {
  if (!tendencies) return null
  let best = null
  for (const k of Object.keys(tendencies)) {
    const v = tendencies[k] || 0
    if (!best || v > best.v) best = { k, v }
  }
  if (!best || best.v <= 0) return 'Discipline'
  return best.k
}

export function isPrescribed(task, diagnosisCode) {
  if (!task) return false
  if (!task.diagnosis_code) return true
  return task.diagnosis_code === diagnosisCode
}

export async function loadPrescribedTasks(diagnosisCode) {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data || []).filter(t => isPrescribed(t, diagnosisCode))
}

export async function loadProgress(userId) {
  const { data } = await supabase
    .from('user_progress')
    .select('task_id,status,day_id')
    .eq('user_id', userId)
  const map = {}
  ;(data || []).forEach(r => { map[r.task_id] = r.status })
  return map
}

export async function ensurePrescription(userId, diagnosisCode) {
  if (!userId) return { tasks: [], progress: {} }

  let tasks = []
  try {
    tasks = await loadPrescribedTasks(diagnosisCode)
  } catch (err) {
    console.error('ensurePrescription: could not load tasks', err)
    return { tasks: [], progress: {} }
  }

  const progress = await loadProgress(userId)
  const now = new Date().toISOString()

  const missing = tasks
    .filter(t => !(t.id in progress))
    .map(t => ({
      user_id: userId,
      task_id: t.id,
      day_id: t.day_id,
      status: 'locked'
    }))

  if (missing.length) {
    const { error } = await supabase
      .from('user_progress')
      .upsert(missing, { onConflict: 'user_id,task_id', ignoreDuplicates: true })
    if (error) console.error('ensurePrescription: seed failed', error)
  }

  const statuses = await loadProgress(userId)

  let nextOpen = true
  for (const t of tasks) {
    const st = statuses[t.id]
    if (st === 'passed') continue
    if (nextOpen && st !== 'available') {
      const { error } = await supabase
        .from('user_progress')
        .upsert({
          user_id: userId, task_id: t.id, day_id: t.day_id,
          status: 'available', unlocked_at: now
        }, { onConflict: 'user_id,task_id' })
      if (!error) statuses[t.id] = 'available'
    }
    if (statuses[t.id] !== 'passed') nextOpen = false
  }

  return { tasks, progress: statuses }
}