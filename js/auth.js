import { supabase } from './supabase-client.js'

async function ensureProfile(userId, fullName) {
  const { data } = await supabase.from('profiles').select('id').eq('id', userId).single()
  if (!data) {
    await supabase.from('profiles').insert({
      id: userId,
      full_name: fullName || '',
      role: 'student'
    })
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('login-form')
  const signupForm = document.getElementById('signup-form')
  const logoutBtn = document.getElementById('logout-btn')

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const email = document.getElementById('email').value
      const password = document.getElementById('password').value
      const msg = document.getElementById('msg')
      msg.textContent = 'Signing in...'

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        msg.textContent = error.message
        return
      }
      msg.textContent = 'Success. Redirecting...'
      setTimeout(() => (window.location.href = '/app/dashboard.html'), 800)
    })
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const fullName = document.getElementById('full_name').value
      const email = document.getElementById('email').value
      const password = document.getElementById('password').value
      const msg = document.getElementById('msg')
      msg.textContent = 'Creating account...'

      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        msg.textContent = error.message
        return
      }
      if (data.user) {
        await ensureProfile(data.user.id, fullName)
      }
      msg.textContent = 'Account created. Check email if confirmation required. Redirecting...'
      setTimeout(() => (window.location.href = '/app/dashboard.html'), 1200)
    })
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault()
      await supabase.auth.signOut()
      window.location.href = '/app/login.html'
    })
  }
})
