import { supabase } from './supabase-client.js'
import { requireTutor } from './app-utils.js'

let currentSub = null
let rubricItems = []
let rubricState = {} // rubric_item_id -> bool

async function loadQueue() {
  const { data } = await supabase
    .from('submissions')
    .select('id,user_id,task_id,attempt_number,status,submitted_at, content_json, files_json, tasks(title), profiles(full_name)')
    .in('status', ['submitted','in_review'])
    .order('submitted_at', { ascending: true })
  const queue = document.getElementById('queue')
  const empty = document.getElementById('queue-empty')
  if (!queue) return
  queue.innerHTML = ''
  if (!data?.length) { if(empty) empty.style.display=''; return }
  if(empty) empty.style.display='none'
  for (const s of data) {
    const row = document.createElement('div')
    row.className = 'form-card'
    row.style.cssText = 'padding:14px;background:#0f1720;border:1px solid rgba(255,255,255,.08);border-radius:10px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap'
    row.innerHTML = `<div><div style="color:#e2e8f0">${s.tasks?.title||'Task'} • Attempt ${s.attempt_number}</div><div style="color:#94a3b8;font-size:14px">${s.profiles?.full_name||s.user_id} • ${new Date(s.submitted_at).toLocaleString()} • ${s.status}</div></div><button class="btn btn-primary btn-sm" data-id="${s.id}">Grade</button>`
    row.querySelector('button').addEventListener('click', ()=>openGrader(s))
    queue.appendChild(row)
  }
}

async function openGrader(s) {
  currentSub = s
  document.getElementById('grader-wrap').style.display=''
  document.getElementById('sub-meta').textContent = `Task: ${s.tasks?.title} • Student: ${s.profiles?.full_name||s.user_id} • Attempt ${s.attempt_number}`
  document.getElementById('sub-answer').textContent = s.content_json?.answer || ''
  const files = document.getElementById('sub-files')
  files.innerHTML = ''
  if (s.files_json?.length) {
    s.files_json.forEach(p => {
      const a = document.createElement('a')
      a.href = '#'
      a.textContent = 'View file: ' + p
      a.style.color = '#38bdf8'
      a.addEventListener('click', async (e)=>{
        e.preventDefault()
        const { data } = await supabase.storage.from('submissions').createSignedUrl(p, 3600)
        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
      })
      files.appendChild(a)
    })
  }
  const { data: r } = await supabase.from('rubric_items').select('*').eq('task_id', s.task_id).order('order_idx')
  rubricItems = r||[]
  const rg = document.getElementById('rubric-grader')
  rg.innerHTML = ''
  rubricState = {}
  rubricItems.forEach(it=>{
    const row = document.createElement('div')
    row.style.cssText='display:flex;align-items:center;gap:10px'
    row.innerHTML = `<input type="checkbox" id="rb-${it.id}"><label for="rb-${it.id}" style="color:#cbd5e1">${it.label}${it.is_critical?' (Critical)':''}</label>`
    row.querySelector('input').addEventListener('change', e=>{ rubricState[it.id]=e.target.checked })
    rg.appendChild(row)
  })
  document.getElementById('feedback').value = ''
  document.getElementById('grade-msg').textContent=''
}

async function mark(status) {
  if (!currentSub) return
  document.getElementById('grade-msg').textContent='Saving...'
  const fb = document.getElementById('feedback').value
  const { data: { user } } = await supabase.auth.getUser()

  // save rubric
  for (const it of rubricItems) {
    await supabase.from('submission_rubric').upsert({
      submission_id: currentSub.id,
      rubric_item_id: it.id,
      passed: !!rubricState[it.id]
    }, { onConflict:'submission_id,rubric_item_id' })
  }

  const allCritOk = rubricItems.filter(x=>x.is_critical).every(x=>rubricState[x.id])
  let passed = (status === 'passed')
  if (rubricItems.length && !allCritOk) passed = false

  await supabase.from('submissions').update({
    status: passed ? 'passed' : 'failed',
    graded_by: user.id,
    graded_at: new Date().toISOString(),
    feedback: fb
  }).eq('id', currentSub.id)

  if (passed) {
    const { data: sub } = await supabase.from('submissions').select('task_id,tasks(day_id)').eq('id', currentSub.id).single()
    await supabase.from('user_progress').upsert({
      user_id: currentSub.user_id,
      task_id: sub.task_id,
      day_id: sub.tasks.day_id,
      status: 'passed',
      completed_at: new Date().toISOString()
    }, { onConflict:'user_id,task_id' })
    const { data: vlink } = await supabase.from('verification_links').select('verification_task_id').eq('source_task_id', sub.task_id).maybeSingle()
    if (vlink) {
      const { data: vt } = await supabase.from('tasks').select('day_id').eq('id', vlink.verification_task_id).single()
      await supabase.from('user_progress').upsert({
        user_id: currentSub.user_id,
        task_id: vlink.verification_task_id,
        day_id: vt?.day_id,
        status: 'available',
        unlocked_at: new Date().toISOString()
      }, { onConflict:'user_id,task_id' })
    }
  }

  document.getElementById('grade-msg').textContent = passed ? 'Marked as PASSED' : 'Marked as FAILED'
  setTimeout(()=>{ document.getElementById('grader-wrap').style.display='none'; loadQueue() }, 600)
}

document.addEventListener('DOMContentLoaded', async ()=>{
  await requireTutor()
  loadQueue()
  document.getElementById('pass-btn').addEventListener('click', ()=>mark('passed'))
  document.getElementById('fail-btn').addEventListener('click', ()=>mark('failed'))
  document.getElementById('close-grader').addEventListener('click', ()=>{ document.getElementById('grader-wrap').style.display='none' })
})
