import { supabase } from './supabase-client.js'

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('login-form')
  const logoutBtn = document.getElementById('logout-btn')

  if (loginForm) {
    const { data: { session: existing } } = await supabase.auth.getSession()
    if (existing) {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (!error && user) {
        window.location.href = 'dashboard.html'
        return
      }
      await supabase.auth.signOut()
      const msg = document.getElementById('msg')
      if (msg) msg.textContent = 'A saved session was invalid and has been cleared. Sign in again.'
    }

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const email = document.getElementById('email').value
      const password = document.getElementById('password').value
      const msg = document.getElementById('msg')
      const btn = loginForm.querySelector('button[type="submit"]')
      msg.textContent = 'Signing in...'
      if (btn) { btn.disabled = true; btn.textContent = 'Signing in...' }

      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        msg.textContent = error.message
        if (btn) { btn.disabled = false; btn.textContent = 'Login' }
        return
      }
      msg.textContent = 'Success. Redirecting...'
      setTimeout(() => (window.location.href = 'dashboard.html'), 400)
    })
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault()
      await supabase.auth.signOut()
      window.location.href = '../index.html'
    })
  }
})