import { supabase } from './supabase-client.js'
import { requireAuth } from './app-utils.js'

let questions = []
let currentIndex = 0
let answers = []
let timerId = null
let startTimeQ = 0
let timeLeft = 0
let assessmentId = null
let startTs = null

function clearTimer() {
  if (timerId) clearInterval(timerId)
  timerId = null
}

function show(el, v = true) {
  if (!el) return
  el.style.display = v ? '' : 'none'
}

function humanDiag(code) {
  const map = {
    'Revenge': 'Revenge Trader – Needs impulse control & rule enforcement.',
    'FOMO': 'FOMO Trader – Needs patience & confirmation discipline.',
    'Analysis_Paralysis': 'Analysis Paralysis – Needs action threshold & decision training.',
    'Overconfidence': 'Overconfident Trader – Needs humility & risk discipline.',
    'Overtrading': 'Overtrader – Needs selectivity & daily limits.',
    'Fear_Of_Missing/Impatience': 'Impatient/Fearful Closer – Needs execution discipline.',
    'Patience': 'Patient Tendency – Can be refined.',
    'Action': 'Decisive Tendency – Can be refined.',
    'Discipline': 'Disciplined Baseline – Solid foundation.'
  }
  if (code && map[code]) return map[code]
  if (code) return code.replaceAll('_', ' ')
  return 'Balanced. Focus on consistency.'
}

function pickTopDiag(tendencies) {
  if (!tendencies) return null
  let best = null
  for (const k of Object.keys(tendencies)) {
    const v = tendencies[k] || 0
    if (!best || v > best.v) best = { k, v }
    if (best && v === best.v && best.v > 0 && k === 'Discipline') best = { k, v }
  }
  if (!best || best.v <= 0) return 'Discipline'
  const neg = ['Revenge','FOMO','Analysis_Paralysis','Overconfidence','Overtrading','Fear_Of_Missing/Impatience']
  if (neg.includes(best.k)) return best.k
  return best.k || 'Discipline'
}

async function savePartial() {
  if (!assessmentId) return
  await supabase.from('assessment_results').update({
    results_json: answers,
    tendency_scores: buildTendencies(),
    total_time_ms: startTs ? (Date.now() - new Date(startTs).getTime()) : null
  }).eq('id', assessmentId)
}

function buildTendencies() {
  const t = {}
  for (const a of answers) {
    const ta = a.tendencyA
    const tb = a.tendencyB
    if (ta) t[ta] = (t[ta] || 0) + (a.choice === 'A' ? 1 : 0)
    if (tb) t[tb] = (t[tb] || 0) + (a.choice === 'B' ? 1 : 0)
  }
  return t
}

function renderQuestion() {
  const q = questions[currentIndex]
  if (!q) return finish()
  const qnum = document.getElementById('qnum')
  const qtotal = document.getElementById('qtotal')
  const scenario = document.getElementById('scenario')
  const labelA = document.getElementById('label-a')
  const labelB = document.getElementById('label-b')
  const timerEl = document.getElementById('timer')

  if (qnum) qnum.textContent = currentIndex + 1
  if (qtotal) qtotal.textContent = questions.length
  if (scenario) scenario.textContent = q.scenario
  if (labelA) labelA.textContent = q.option_a
  if (labelB) labelB.textContent = q.option_b
  if (timerEl) timerEl.textContent = q.time_limit_secs

  timeLeft = q.time_limit_secs
  startTimeQ = Date.now()

  clearTimer()
  timerId = setInterval(() => {
    timeLeft--
    if (timerEl) timerEl.textContent = Math.max(0, timeLeft)
    if (timeLeft <= 0) {
      clearTimer()
      recordAnswer(null, true)
    }
  }, 1000)
}

function recordAnswer(choice, timedOut = false) {
  const q = questions[currentIndex]
  const tookMs = timedOut ? (q.time_limit_secs * 1000) : (Date.now() - startTimeQ)
  answers.push({
    questionId: q.id,
    index: currentIndex,
    choice, // 'A'|'B'|null
    timedOut,
    timeMs: tookMs,
    tendencyA: q.tendency_a,
    tendencyB: q.tendency_b
  })
  savePartial()
  currentIndex++
  if (currentIndex < questions.length) {
    renderQuestion()
  } else {
    finish()
  }
}

async function finish() {
  clearTimer()
  const tend = buildTendencies()
  const top = pickTopDiag(tend)
  const avgClick = answers.length ? Math.round(answers.reduce((s,a)=>s+a.timeMs,0)/answers.length) : 0

  await supabase.from('assessment_results').update({
    finished_at: new Date().toISOString(),
    results_json: answers,
    tendency_scores: tend,
    diagnosis_code: top,
    click_speed_avg_ms: avgClick
  }).eq('id', assessmentId)

  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    await supabase.from('profiles').update({
      diagnosis_code: top
    }).eq('id', session.user.id)
  }

  show(document.getElementById('test-wrap'), false)
  const diagCode = document.getElementById('diag-code')
  const diagDetail = document.getElementById('diag-detail')
  const tendWrap = document.getElementById('tendencies')
  if (diagCode) diagCode.textContent = top.replaceAll('_',' ')
  if (diagDetail) diagDetail.textContent = humanDiag(top)
  if (tendWrap) {
    tendWrap.innerHTML = ''
    Object.entries(tend).forEach(([k,v]) => {
      const chip = document.createElement('span')
      chip.style.padding = '4px 8px'
      chip.style.border = '1px solid rgba(255,255,255,.12)'
      chip.style.borderRadius = '999px'
      chip.textContent = `${k.replaceAll('_',' ')}: ${v}`
      tendWrap.appendChild(chip)
    })
  }
  show(document.getElementById('result-wrap'))
}

async function startTest() {
  const { data, error } = await supabase
    .from('test_questions')
    .select('*')
    .eq('is_active', true)
    .order('order_idx', { ascending: true })
  if (error) {
    alert('Failed to load test: ' + error.message)
    return
  }
  questions = data || []
  currentIndex = 0
  answers = []
  startTs = new Date().toISOString()

  const { data: resIns, error: e2 } = await supabase.from('assessment_results').insert({
    user_id: (await supabase.auth.getUser()).data.user?.id,
    started_at: startTs
  }).select().single()
  if (e2) {
    alert(e2.message)
    return
  }
  assessmentId = resIns.id

  show(document.getElementById('intro'), false)
  show(document.getElementById('test-wrap'))
  renderQuestion()
}

document.addEventListener('DOMContentLoaded', async () => {
  await requireAuth()
  const startBtn = document.getElementById('start-test')
  const optA = document.getElementById('opt-a')
  const optB = document.getElementById('opt-b')
  const retake = document.getElementById('retake')

  if (startBtn) startBtn.addEventListener('click', startTest)
  if (optA) optA.addEventListener('click', () => { clearTimer(); recordAnswer('A') })
  if (optB) optB.addEventListener('click', () => { clearTimer(); recordAnswer('B') })
  if (retake) retake.addEventListener('click', () => {
    show(document.getElementById('result-wrap'), false)
    show(document.getElementById('intro'))
  })
})
