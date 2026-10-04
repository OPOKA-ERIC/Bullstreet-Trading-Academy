import { supabase } from './supabase-client.js'
import { requireAuth } from './app-utils.js'

function getParam(k) {
  return new URLSearchParams(window.location.search).get(k)
}

function show(el, v = true) {
  if (el) el.style.display = v ? '' : 'none'
}

let selectedOption = null

function renderMcq(task, variant) {
  const wrap = document.getElementById('mcq-wrap')
  const textarea = document.getElementById('submission-text')
  const answerLabel = document.getElementById('answer-label')
  const fileWrap = document.getElementById('file-wrap')
  if (!wrap) return

  const options = (variant && variant.options) || task.options
  if (task.input_type !== 'mcq' || !Array.isArray(options) || options.length < 2) {
    show(wrap, false)
    if (textarea) textarea.style.display = ''
    if (answerLabel) answerLabel.textContent = 'Your Answer / Submission'
    return
  }

  wrap.innerHTML = ''
  wrap.style.display = ''
  if (textarea) textarea.style.display = 'none'
  if (fileWrap) show(fileWrap, false)
  if (answerLabel) answerLabel.textContent = 'Select one answer'

  wrap.appendChild(Object.assign(document.createElement('div'), {
    textContent: 'Choose the correct answer:',
    style: 'color:#cbd5e1;font-size:14px;margin-bottom:10px'
  }))

  options.forEach((opt, i) => {
    const id = `opt-${i}`
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px;margin-bottom:8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;cursor:pointer;background:#0b131a'
    row.dataset.opt = i

    const input = document.createElement('input')
    input.type = 'radio'
    input.name = 'mcq'
    input.id = id
    input.value = String(i)

    const label = document.createElement('label')
    label.htmlFor = id
    label.textContent = opt
    label.style.cssText = 'color:#e2e8f0;cursor:pointer;flex:1'

    row.addEventListener('click', () => {
      selectedOption = i
      input.checked = true
      wrap.querySelectorAll('[data-opt]').forEach(n => { n.style.borderColor = 'rgba(255,255,255,.12)' })
      row.style.borderColor = '#38bdf8'
    })

    row.appendChild(input)
    row.appendChild(label)
    wrap.appendChild(row)
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await requireAuth()
  if (!session) return

  const taskId = getParam('id')
  if (!taskId) { window.location.href = 'dashboard.html'; return }

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
  const textarea = document.getElementById('submission-text')
  const fileInput = document.getElementById('file-input')

  const { data: task } = await supabase.from('tasks').select('*').eq('id', taskId).single()
  if (!task) {
    if (msg) msg.textContent = 'Task not found.'
    return
  }

  const { data: variants } = await supabase.from('task_variants').select('*').eq('task_id', taskId).order('variant_number')
  const { data: rubric } = await supabase.from('rubric_items').select('*').eq('task_id', taskId).order('order_idx')

  if (title) title.textContent = task.title || 'Task'
  if (instr) instr.textContent = task.instructions || ''

  if (rubricWrap && rubric?.length) {
    rubricWrap.innerHTML = '<div style="color:#94a3b8;font-size:14px;margin-bottom:6px">Marking Points (Rubric)</div>'
    rubric.forEach(r => {
      const row = document.createElement('div')
      row.style.color = '#cbd5e1'
      row.textContent = `• ${r.label}${r.is_critical ? ' (Critical)' : ''}`
      rubricWrap.appendChild(row)
    })
  }

  const { data: subs } = await supabase.from('submissions')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('task_id', taskId)
    .order('attempt_number', { ascending: false })

  const { data: progressRows } = await supabase
    .from('user_progress')
    .select('status')
    .eq('user_id', session.user.id)
    .eq('task_id', taskId)
    .maybeSingle()

  const progressStatus = progressRows?.status || null
  if (!progressStatus) {
    if (msg) msg.textContent = 'This task is not part of your prescription yet.'
    show(submitBtn, false)
    show(redoBtn, false)
    if (textarea) textarea.disabled = true
    if (fileInput) fileInput.disabled = true
    if (resultCard) show(resultCard, false)
    return
  }

  const last = subs?.[0] || null
  const maxAttempts = task.max_attempts || 3
  const attemptNum = (last?.attempt_number || 0) + 1
  const attemptsUsed = last?.attempt_number || 0
  const exhausted = attemptsUsed >= maxAttempts
  const canRetry = !!task.allow_retry && !exhausted

  if (attemptInfo) {
    attemptInfo.textContent = `Attempt ${attemptNum} of ${maxAttempts}${task.type === 'auto' ? ' • auto-graded' : ' • tutor graded'}`
  }

  let selectedVariantId = null
  let activeVariant = null

  function applyVariant(v) {
    activeVariant = v || null
    selectedOption = null
    if (v) {
      selectedVariantId = v.id
      if (title) title.textContent = v.title || task.title
      if (instr) instr.textContent = v.instructions || task.instructions
    } else {
      selectedVariantId = null
      if (title) title.textContent = task.title || 'Task'
      if (instr) instr.textContent = task.instructions || ''
    }
    renderMcq(task, activeVariant)
  }

  if (last?.status === 'failed' && canRetry) {
    const vnum = last.attempt_number + 1
    applyVariant((variants || []).find(x => x.variant_number === vnum) || (variants || [])[0] || null)
  } else {
    applyVariant(null)
  }

  const lockedNow = progressStatus === 'locked'
  if (lockedNow) {
    if (msg) msg.textContent = 'This task is locked. Pass the previous task to unlock it.'
    show(submitBtn, false)
    show(redoBtn, false)
    if (textarea) textarea.disabled = true
    if (fileInput) fileInput.disabled = true
  } else if (last?.status === 'failed' && !canRetry) {
    if (msg) msg.textContent = 'No attempts remaining. Your tutor will review this and unlock the next step.'
    show(submitBtn, false)
    show(redoBtn, false)
    if (textarea) textarea.disabled = true
    if (fileInput) fileInput.disabled = true
  } else if (last?.status === 'submitted') {
    if (msg) msg.textContent = 'Your submission is awaiting tutor review.'
    show(submitBtn, false)
  } else if (last?.status === 'passed') {
    if (msg) msg.textContent = 'You have passed this task. Review it any time.'
  }

  redoBtn?.addEventListener('click', () => {
    const pool = variants || []
    const currentNum = activeVariant?.variant_number || 0
    const next = pool.find(x => x.variant_number > currentNum)
      || pool.find(x => x.variant_number !== currentNum)
      || null
    applyVariant(next)
    show(redoBtn, false)
    if (msg) msg.textContent = next ? 'Alternate format loaded for your retry.' : 'No alternate format exists for this task.'
    if (textarea) textarea.value = ''
  })

  submitBtn?.addEventListener('click', async () => {
    const text = textarea ? textarea.value.trim() : ''
    const files = fileInput ? fileInput.files : []
    const isMcq = task.input_type === 'mcq'

    if (isMcq && selectedOption === null) {
      if (msg) msg.textContent = 'Please choose an answer before submitting.'
      return
    }
    if (!isMcq && !text && !files.length) {
      if (msg) msg.textContent = 'Please write an answer or attach a file.'
      return
    }

    const answer = isMcq ? String(selectedOption) : text
    const filePaths = []
    if (msg) msg.textContent = 'Submitting...'
    submitBtn.disabled = true

    for (const f of files) {
      const safeName = String(f.name).replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${session.user.id}/${Date.now()}_${safeName}`
      const { error: up } = await supabase.storage.from('submissions').upload(path, f)
      if (up) {
        if (msg) msg.textContent = `Upload failed for ${f.name}: ${up.message}`
        submitBtn.disabled = false
        return
      }
      filePaths.push(path)
    }

    const { data: newSub, error: sErr } = await supabase.from('submissions').insert({
      user_id: session.user.id,
      task_id: taskId,
      task_variant_id: selectedVariantId,
      attempt_number: attemptNum,
      content_json: { answer },
      files_json: filePaths,
      status: 'submitted',
      submitted_at: new Date().toISOString()
    }).select().single()

    if (sErr) {
      if (msg) msg.textContent = sErr.message
      submitBtn.disabled = false
      return
    }

    if (task.type === 'auto' && task.input_type === 'mcq') {
      const correct = String(task.correct_answer ?? '').trim()
      const passed = correct !== '' && answer === correct

      await supabase.from('submissions').update({
        status: passed ? 'passed' : 'failed',
        score: passed ? 100 : 0,
        graded_at: new Date().toISOString(),
        feedback: passed ? 'Correct.' : 'Not correct yet. Review the lesson and try the alternate format.'
      }).eq('id', newSub.id)

      if (passed) {
        await supabase.from('user_progress').upsert({
          user_id: session.user.id, task_id: taskId, day_id: task.day_id,
          status: 'passed', completed_at: new Date().toISOString()
        }, { onConflict: 'user_id,task_id' })

        const { data: vlink } = await supabase.from('verification_links')
          .select('verification_task_id')
          .eq('source_task_id', taskId)
          .maybeSingle()

        if (vlink) {
          const { data: vt } = await supabase.from('tasks').select('day_id,title').eq('id', vlink.verification_task_id).single()
          await supabase.from('user_progress').upsert({
            user_id: session.user.id, task_id: vlink.verification_task_id, day_id: vt?.day_id,
            status: 'available', unlocked_at: new Date().toISOString()
          }, { onConflict: 'user_id,task_id' })
          if (verifyInfo) verifyInfo.textContent = `Unlocked: ${vt?.title || 'verification task'}.`
        } else {
          if (verifyInfo) verifyInfo.textContent = ''
        }
      } else {
        await supabase.from('user_progress').upsert({
          user_id: session.user.id, task_id: taskId, day_id: task.day_id,
          status: 'failed'
        }, { onConflict: 'user_id,task_id' })
      }

      if (msg) msg.textContent = passed ? 'Auto-graded: PASSED' : 'Auto-graded: not correct yet.'
      show(resultCard)
      if (resultStatus) {
        resultStatus.textContent = passed ? 'PASSED' : 'NOT PASSED YET'
        resultStatus.style.color = passed ? '#22c55e' : '#f87171'
      }
      if (resultFeedback) {
        resultFeedback.textContent = passed
          ? 'Well done. This task is complete.'
          : 'Not correct yet. Use the alternate format button to retry, or review the lesson.'
      }
      return
    }

    if (msg) msg.textContent = 'Submitted. Awaiting tutor review.'
    show(submitBtn, false)
  })
})