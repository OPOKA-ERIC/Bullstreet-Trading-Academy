(function () {
  'use strict';

  /* ============ NAV MOBILE MENU ============ */
  const navToggle = document.getElementById('nav-toggle');
  const mobileMenu = document.getElementById('mobile-menu');
  if (navToggle && mobileMenu) {
    navToggle.addEventListener('click', () => mobileMenu.classList.toggle('open'));
    mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileMenu.classList.remove('open')));
  }

  /* ============ MODALS ============ */
  const loginModal = document.getElementById('login-modal');
  const joinModal = document.getElementById('join-modal');

  function openModal(el) { if (el) el.classList.add('open'); }
  function closeModal(el) { if (el) el.classList.remove('open'); }

  document.addEventListener('click', function (e) {
    if (e.target.closest('#nav-login-btn') || e.target.closest('#mobile-login-btn') || e.target.closest('.footer-login')) {
      e.preventDefault();
      openModal(loginModal);
    }
    if (e.target.closest('[data-close]')) {
      closeModal(document.getElementById(e.target.closest('[data-close]').dataset.close));
    }
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('open');
    }
  });

  /* ============ JOIN (ENROLL) BUTTONS ============ */
  document.querySelectorAll('.join-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      const plan = btn.dataset.plan;
      const price = btn.dataset.price;
      document.getElementById('join-plan-label').textContent = plan + ' — Institutional Track / Retail Track';
      document.getElementById('join-total').textContent = '$' + Number(price).toLocaleString();
      openModal(joinModal);
    });
  });

  /* ============ TABS (SYLLABUS + PRICING) ============ */
  document.querySelectorAll('.syllabus-tabs .tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.syllabus-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('tab-' + tab);
      if (panel) panel.classList.add('active');
    });
  });

  document.querySelectorAll('.pricing-tabs .tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.pricing-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.price-grid').forEach(g => g.classList.remove('active'));
      const grid = document.getElementById('price-' + (tab === 'inst-price' ? 'inst' : 'retail'));
      if (grid) grid.classList.add('active');
    });
  });

  /* ============ FAQ ACCORDION ============ */
  document.querySelectorAll('.faq-question').forEach(function (q) {
    q.addEventListener('click', function () {
      const item = q.closest('.faq-item');
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });

  /* ============ HERO COUNTER ============ */
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseInt(el.dataset.count, 10);
          let start = 0;
          const dur = 1000;
          const t0 = performance.now();
          function tick(now) {
            const p = Math.min((now - t0) / dur, 1);
            el.textContent = Math.floor(p * target);
            if (p < 1) requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
    counters.forEach(c => observer.observe(c));
  }

  /* ============ LOGIN FORM ============ */
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value.trim();
      if (!email || !password) return;
      // Persist minimal session for the student portal
      localStorage.setItem('bsa_logged_in', JSON.stringify({ email: email }));
      // Ask which track they enrolled in, then enter the portal
      openTrackChoice(email);
    });
  }

  function openTrackChoice(email) {
    const track = confirm('Which track did you enroll in?\n\nClick OK for INSTITUTIONAL track\nClick Cancel for RETAIL track');
    const t = track ? 'institutional' : 'retail';
    localStorage.setItem('bsa_track', t);
    window.location.href = 'student.html?track=' + t;
  }

  /* ============ JOIN FORM ============ */
  const joinForm = document.getElementById('join-form');
  if (joinForm) {
    joinForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const name = document.getElementById('join-name').value.trim();
      const email = document.getElementById('join-email').value.trim();
      if (!name || !email) return;
      // Simulate payment completion
      alert('Proceeding to secure payment...\n\n(Demo) Payment confirmed for ' + name + '.' + '\nYour login credentials will be sent to ' + email + '.');
      closeModal(joinModal);
    });
  }
})();
