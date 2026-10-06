import { supabase } from './supabase-client.js'

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('login-form')
  const logoutBtn = document.getElementById('logout-btn')

  if (loginForm) {
    const { data: { session: existing } } = await supabase.auth.getSession()
    if (existing) {
      window.location.href = 'dashboard.html'
      return
    }

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
      setTimeout(() => (window.location.href = 'dashboard.html'), 800)
    })
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault()
      await supabase.auth.signOut()
      window.location.href = 'login.html'
    })
  }
})