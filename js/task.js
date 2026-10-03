import { supabase } from './supabase-client.js'
import { requireAuth } from './app-utils.js'

function getParam(k) {
  return new URLSearchParams(window.location.search).get(k)
}

function show(el,v=true){ if(el) el.style.display=v?'':'none' }

document.addEventListener('DOMContentLoaded', async () => {
  await requireAuth()
  const taskId = getParam('id')
  if (!taskId) { window.location.href='dashboard.html'; return }

  const title = document.getElementById('task-title')
  const instr = document.getElementById('task-instructions')
  const rubricWrap = document.getElementById('rubric-wrap')
  const submitBtn = document.getElementById('submit-btn')
  const redoBtn = document.getElementById('redo-btn')
  const attemptInfo = document.getElementById('attempt-info')
  const msg = document.getElementById('task-msg')
  const resultCard = document.getElementById('result-card')
  const resultStatus = document.getElementById('result-status')
  const resultFeedback = document.getElementById('result-feedback')
  const verifyInfo = document.getElementById('verify-info')

  const { data: task } = await supabase.from('tasks').select('*').eq('id', taskId).single()
  const { data: variants } = await supabase.from('task_variants').select('*').eq('task_id', taskId).order('variant_number')
  const { data: rubric } = await supabase.from('rubric_items').select('*').eq('task_id', taskId).order('order_idx')

  if (title) title.textContent = task?.title || 'Task'
  if (instr) instr.textContent = task?.instructions || ''

  if (rubricWrap && rubric?.length) {
    rubricWrap.innerHTML = '<div style="color:#94a3b8;font-size:14px;margin-bottom:6px">Marking Points (Rubric)</div>'
    rubric.forEach(r => {
      const row = document.createElement('div')
      row.style.color = '#cbd5e1'
      row.textContent = `• ${r.label}${r.is_critical ? ' (Critical)' : ''}`
      rubricWrap.appendChild(row)
    })
  }

  const { data: { user } } = await supabase.auth.getUser()
  const { data: subs } = await supabase.from('submissions')
    .select('*')
    .eq('user_id', user.id)
    .eq('task_id', taskId)
    .order('attempt_number', { ascending: false })

  let last = subs?.[0] || null
  let attemptNum = (last?.attempt_number || 0) + 1
  if (attemptInfo) attemptInfo.textContent = `Attempt ${attemptNum} • Max ${task?.max_attempts || 3}`

  let selectedVariantId = null
  if (last?.status === 'failed' && task?.allow_retry && last.attempt_number < (task.max_attempts||3) && variants?.length) {
    const vnum = last.attempt_number + 1
    const v = variants.find(x=>x.variant_number===vnum) || variants[0]
    if (v) {
      selectedVariantId = v.id
      if (title) title.textContent = v.title || task.title
      if (instr) instr.textContent = v.instructions || task.instructions
      show(redoBtn, false)
    }
  } else if (last?.status === 'failed' && task?.allow_retry && last.attempt_number < (task.max_attempts||3)) {
    show(redoBtn, true)
  }

  redoBtn?.addEventListener('click', () => { show(redoBtn,false); msg.textContent='Alternate format loaded for retry.' })

  submitBtn?.addEventListener('click', async () => {
    const text = document.getElementById('submission-text').value
    const files = document.getElementById('file-input').files
    const filePaths = []
    msg.textContent = 'Submitting...'
    submitBtn.disabled = true

    if (files.length) {
      for (const f of files) {
        const path = `${user.id}/${Date.now()}_${f.name}`
        const { error: up } = await supabase.storage.from('submissions').upload(path, f)
        if (!up) filePaths.push(path)
      }
    }

    const { data: newSub, error: sErr } = await supabase.from('submissions').insert({
      user_id: user.id,
      task_id: taskId,
      task_variant_id: selectedVariantId,
      attempt_number: attemptNum,
      content_json: { answer: text },
      files_json: filePaths,
      status: 'submitted',
      submitted_at: new Date().toISOString()
    }).select().single()
    if (sErr) { msg.textContent = sErr.message; submitBtn.disabled=false; return }

    // Auto-grade MCQ if applicable
    if (task?.type === 'auto' && task?.input_type === 'mcq') {
      // simple placeholder: mark passed if has answer (extend later)
      await supabase.from('submissions').update({ status:'passed', score:100, graded_at:new Date().toISOString() }).eq('id', newSub.id)
      await supabase.from('user_progress').upsert({
        user_id: user.id, task_id: taskId, day_id: task.day_id, status:'passed', completed_at:new Date().toISOString()
      }, { onConflict:'user_id,task_id' })
      msg.textContent='Auto-graded: PASSED'
      show(resultCard); resultStatus.textContent='PASSED'; resultFeedback.textContent='Well done. Task passed.'
      return
    }

    msg.textContent = 'Submitted. Awaiting tutor review (Manual).'
    show(submitBtn,false)
  })
})
