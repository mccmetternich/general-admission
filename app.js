/* General Admission — vanilla JS app (no React, no Babel) */

// ─── Palettes ─────────────────────────────────────────────────────────────────

const LIGHT_PALETTE = {
  bg: '#FFFFFF', bgDots: '#E4E4E4', fgDots: '#0A0A0A',
  ink: '#0A0A0A', inkSoft: '#3A3A3A', pill: '#0A0A0A', pillText: '#FFFFFF',
};
const DARK_PALETTE = {
  bg: '#0A0A0A', bgDots: '#202020', fgDots: '#F5F5F5',
  ink: '#F5F5F5', inkSoft: '#B5B5B5', pill: '#F5F5F5', pillText: '#0A0A0A',
};

function randomPalette(mode) {
  mode = mode || 'any';
  const h1 = Math.floor(Math.random() * 360);
  const rel = Math.random();
  let dh;
  if (rel < 0.32)      dh = 180 + (Math.random() * 16 - 8);
  else if (rel < 0.58) dh = (Math.random() < 0.5 ? 150 : 210) + (Math.random() * 14 - 7);
  else if (rel < 0.80) dh = (Math.random() < 0.5 ? 120 : 240) + (Math.random() * 14 - 7);
  else                 dh = (Math.random() < 0.5 ? -1 : 1) * (28 + Math.random() * 22);
  const h2 = (h1 + dh + 360) % 360;
  const groundDark = mode === 'dark' ? true : mode === 'light' ? false : Math.random() < 0.5;
  const lGround = groundDark ? 7 + Math.random() * 11 : 90 + Math.random() * 7;
  const lInk    = groundDark ? 88 + Math.random() * 8  : 6  + Math.random() * 12;
  const sGround = 18 + Math.random() * 32;
  const sInk    = 35 + Math.random() * 50;
  const lBgDots = groundDark
    ? Math.min(lGround + 9 + Math.random() * 6, 28)
    : Math.max(lGround - 12 - Math.random() * 6, 78);
  const sBgDots = sGround * 0.85;
  const lInkSoft = groundDark ? Math.max(lInk - 22, 55) : Math.min(lInk + 22, 45);
  const swapHues = Math.random() < 0.35;
  const hG = swapHues ? h2 : h1, hI = swapHues ? h1 : h2;
  const f = (h, s, l) => `hsl(${h|0}, ${s|0}%, ${l|0}%)`;
  return {
    bg:       f(hG, sGround, lGround),
    bgDots:   f(hG, sBgDots, lBgDots),
    fgDots:   f(hI, sInk, lInk),
    ink:      f(hI, sInk, lInk),
    inkSoft:  f(hI, sInk * 0.55, lInkSoft),
    pill:     f(hI, sInk, lInk),
    pillText: f(hG, sGround, lGround),
  };
}

function runCascade(targetPal, dur) {
  dur = dur || 120;
  try { window.GADotField && window.GADotField.triggerCascade(targetPal, dur, { mode: 'fade' }); } catch (e) {}
  const root = document.documentElement;
  root.style.setProperty('--bg',       targetPal.bg);
  root.style.setProperty('--bg-dots',  targetPal.bgDots);
  root.style.setProperty('--fg',       targetPal.fgDots);
  root.style.setProperty('--ink',      targetPal.ink);
  root.style.setProperty('--ink-soft', targetPal.inkSoft);
  root.style.setProperty('--pill',     targetPal.pill);
  root.style.setProperty('--pill-text',targetPal.pillText);
  root.setAttribute('data-cascading', '1');
  clearTimeout(window.__gaCascadeT);
  window.__gaCascadeT = setTimeout(() => root.removeAttribute('data-cascading'), dur + 200);
}

function applyCssVars(pal) {
  const root = document.documentElement;
  root.style.setProperty('--bg',       pal.bg);
  root.style.setProperty('--bg-dots',  pal.bgDots);
  root.style.setProperty('--fg',       pal.fgDots);
  root.style.setProperty('--ink',      pal.ink);
  root.style.setProperty('--ink-soft', pal.inkSoft);
  root.style.setProperty('--pill',     pal.pill);
  root.style.setProperty('--pill-text',pal.pillText);
  root.dataset.mode = mode;
}

// ─── Theme state ─────────────────────────────────────────────────────────────

let mode = (() => {
  try {
    const s = localStorage.getItem('ga-mode');
    if (s === 'light' || s === 'dark') return s;
  } catch (e) {}
  const h = new Date().getHours();
  return (h >= 7 && h < 19) ? 'light' : 'dark';
})();

// ─── Contact state ────────────────────────────────────────────────────────────

let contactOpen = false;
let contactPhase = 'closed'; // closed | opening | open | closing
let contactAlpha = 0;
let contactRaf = 0;
let contactRect = null;
let contactCompact = false;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_ENDPOINT = (() => {
  const u = ['matthias', 'generaladmission', 'la'];
  return `https://formsubmit.co/ajax/${u[0]}@${u[1]}.${u[2]}`;
})();

// ─── Icons ────────────────────────────────────────────────────────────────────

const ICON_SUN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>`;
const ICON_MOON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>`;
const ICON_CLOSE = `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;

// ─── Init ─────────────────────────────────────────────────────────────────────

function init() {
  applyCssVars(mode === 'dark' ? DARK_PALETTE : LIGHT_PALETTE);

  // Init dotfield — overlay reveals after the fill+impact intro sequence
  initDotField(mode === 'dark' ? DARK_PALETTE : LIGHT_PALETTE, function onDotFieldReady() {
    // Clear any forced-hide set by openChat() before revealing
    document.querySelectorAll('.ga-corner').forEach(function(el) {
      el.style.transition = '';
      el.style.opacity = '';
    });
    document.getElementById('ga-overlay').classList.add('is-revealed');
  });

  // Theme toggle icon
  updateThemeIcon();

  // Wire theme toggle
  document.getElementById('ga-theme-btn').addEventListener('click', toggleMode);

  // Wire contact button → new chat experience (original openContact kept below)
  document.getElementById('ga-contact-btn').addEventListener('click', openChat);

  // Wire keyboard close
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (chatOpen) closeChat();
      else if (contactOpen) closeContact();
    }
  });

  // Scroll easter egg
  setupScrollEasterEgg();
}

// ─── Theme ────────────────────────────────────────────────────────────────────

function updateThemeIcon() {
  ['ga-theme-btn', 'gac-theme-btn'].forEach(function(id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    btn.innerHTML = mode === 'dark' ? ICON_SUN : ICON_MOON;
  });
}

function toggleMode() {
  mode = mode === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('ga-mode', mode); } catch (e) {}
  document.documentElement.setAttribute('data-mode', mode);
  runCascade(mode === 'dark' ? DARK_PALETTE : LIGHT_PALETTE);
  updateThemeIcon();
  // Sync mini wordmark palette if chat is open
  const chatEl = document.getElementById('ga-chat');
  if (chatEl && chatEl._miniWordmark) {
    const mw = chatEl._miniWordmark.get();
    if (mw && mw.setPalette) mw.setPalette(mode === 'dark' ? DARK_PALETTE : LIGHT_PALETTE);
  }
}

// ─── Scroll easter egg ────────────────────────────────────────────────────────

function setupScrollEasterEgg() {
  let accum = 0, lastTrigger = 0;
  const THRESH = 320, COOLDOWN = 200;

  const isPassthrough = (t) => t && t.closest && !!t.closest('.ga-contact-body, .ga-contact-stage');

  const tryTrigger = () => {
    const now = performance.now();
    if (now - lastTrigger < COOLDOWN || Math.abs(accum) < THRESH) return;
    accum = 0; lastTrigger = now;
    runCascade(randomPalette(mode));
  };

  window.addEventListener('wheel', (e) => {
    if (isPassthrough(e.target)) return;
    e.preventDefault(); accum += e.deltaY; tryTrigger();
  }, { passive: false });

  let touchY = 0;
  window.addEventListener('touchstart', (e) => {
    if (isPassthrough(e.target)) return;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (isPassthrough(e.target)) return;
    e.preventDefault();
    accum += touchY - e.touches[0].clientY;
    touchY = e.touches[0].clientY;
    tryTrigger();
  }, { passive: false });
}

// ─── Contact open/close ───────────────────────────────────────────────────────

function computeContactRect(compact) {
  const isMobile = window.innerWidth < 640;
  const w = isMobile ? window.innerWidth - 32 : Math.min(620, window.innerWidth - 80);
  const h = compact
    ? (isMobile ? 220 : 240)
    : (isMobile ? Math.min(window.innerHeight - 80, 560) : Math.min(580, window.innerHeight - 80));
  return { x: (window.innerWidth - w) / 2, y: (window.innerHeight - h) / 2, w, h, r: 18 };
}

function animateAlpha(from, to, duration, after) {
  cancelAnimationFrame(contactRaf);
  const start = performance.now();
  function step() {
    const t = Math.min(1, (performance.now() - start) / duration);
    const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
    const a = from + (to - from) * e;
    contactAlpha = a;
    window.GADotField && window.GADotField.setExcludeAlpha(a);
    if (t < 1) { contactRaf = requestAnimationFrame(step); }
    else if (after) after();
  }
  contactRaf = requestAnimationFrame(step);
}

function positionFrame(rect) {
  const frame = document.getElementById('ga-contact-frame');
  if (!frame) return;
  frame.style.left   = rect.x + 'px';
  frame.style.top    = rect.y + 'px';
  frame.style.width  = rect.w + 'px';
  frame.style.height = rect.h + 'px';
}

function openContact() {
  if (contactOpen || contactPhase !== 'closed') return;
  contactOpen = true;
  contactCompact = false;
  contactPhase = 'opening';

  const stage = document.getElementById('ga-contact-stage');
  stage.style.display = 'block';
  stage.classList.remove('is-open', 'is-closing');
  showContactForm();

  const rect = computeContactRect(false);
  contactRect = rect;
  positionFrame(rect);

  const center = { x: rect.x + rect.w/2, y: rect.y + rect.h/2 };
  window.GADotField && window.GADotField.dropImpact(center, Math.max(rect.w, rect.h) * 1.45 + 220, 44);

  setTimeout(() => {
    window.GADotField && window.GADotField.setExcludeRect(Object.assign({}, rect, { alpha: 0 }));
    animateAlpha(0, 1, 480, () => {
      contactPhase = 'open';
      stage.classList.add('is-open');
    });
  }, 90);
}

function closeContact() {
  if (!contactOpen || contactPhase === 'closing' || contactPhase === 'closed') return;
  contactOpen = false;
  contactPhase = 'closing';
  const stage = document.getElementById('ga-contact-stage');
  stage.classList.remove('is-open');
  stage.classList.add('is-closing');
  animateAlpha(contactAlpha, 0, 380, () => {
    window.GADotField && window.GADotField.setExcludeRect(null);
    contactPhase = 'closed';
    stage.classList.remove('is-closing');
    stage.style.display = 'none';
    resetContactForm();
  });
}

function shrinkToCompact() {
  if (contactCompact) return;
  contactCompact = true;
  const rect = computeContactRect(true);
  contactRect = rect;
  positionFrame(rect);
  window.GADotField && window.GADotField.setExcludeRect(Object.assign({}, rect, { alpha: contactAlpha }));
}

// ─── Contact form UI ──────────────────────────────────────────────────────────

function showContactForm() {
  const body = document.getElementById('ga-contact-body');
  body.classList.remove('ga-contact-sent');
  body.innerHTML = `
    <button class="ga-panel-close" id="ga-panel-close-btn" aria-label="Close">${ICON_CLOSE}</button>
    <h2 class="ga-panel-title">Hi there.</h2>
    <p class="ga-panel-sub">Want to build with us? Say hello.</p>
    <form class="ga-form" id="ga-contact-form" novalidate>
      ${underlineField('name', 'Your name', 'text')}
      ${underlineField('email', 'Email', 'email')}
      ${underlineField('message', "What's on your mind?", 'text', true)}
      <div class="ga-form-actions">
        <button type="button" class="ga-btn ga-btn-ghost" id="ga-form-cancel">Cancel</button>
        <button type="submit" class="ga-btn ga-btn-solid ga-btn-send" id="ga-form-submit">
          <span class="ga-btn-label">Send message</span>
          <span class="ga-btn-dots" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
        </button>
      </div>
    </form>
  `;
  document.getElementById('ga-panel-close-btn').addEventListener('click', closeContact);
  document.getElementById('ga-form-cancel').addEventListener('click', closeContact);
  document.getElementById('ga-contact-stage').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeContact();
  });
  document.getElementById('ga-contact-form').addEventListener('submit', submitContact);
  wireUnderlineFields();
}

function underlineField(name, label, type, isTextarea) {
  const tag = isTextarea ? 'textarea' : 'input';
  const attrs = isTextarea
    ? `rows="2"`
    : `type="${type}"`;
  return `
    <label class="ga-uf" data-field="${name}">
      <span class="ga-uf-label" id="ga-label-${name}">${label}</span>
      <${tag} class="ga-uf-input" name="${name}" ${attrs} required></${tag}>
      <span class="ga-uf-rule" aria-hidden="true">
        <span class="ga-uf-rule-base"></span>
        <span class="ga-uf-rule-fill"></span>
      </span>
    </label>
  `;
}

function wireUnderlineFields() {
  document.querySelectorAll('#ga-contact-form .ga-uf-input').forEach((input) => {
    const label = input.closest('.ga-uf');
    input.addEventListener('focus',  () => label.classList.add('is-focused'));
    input.addEventListener('blur',   () => {
      label.classList.remove('is-focused');
      if (input.value) label.classList.add('is-filled');
      else label.classList.remove('is-filled');
    });
    input.addEventListener('input',  () => {
      label.classList.remove('is-error');
      const errEl = label.querySelector('.ga-uf-err');
      if (errEl) errEl.remove();
    });
  });
}

function showFieldError(name, msg) {
  const label = document.querySelector(`[data-field="${name}"]`);
  if (!label) return;
  label.classList.add('is-error');
  const labelSpan = label.querySelector('.ga-uf-label');
  if (labelSpan && !labelSpan.querySelector('.ga-uf-err')) {
    const em = document.createElement('em');
    em.className = 'ga-uf-err';
    em.textContent = ` — ${msg}`;
    labelSpan.appendChild(em);
  }
}

async function submitContact(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = document.getElementById('ga-form-submit');
  const cancelBtn = document.getElementById('ga-form-cancel');
  const closeBtn  = document.getElementById('ga-panel-close-btn');

  const name    = form.elements.name.value.trim();
  const email   = form.elements.email.value.trim();
  const message = form.elements.message.value.trim();

  if (!EMAIL_RE.test(email)) {
    showFieldError('email', 'Please enter a valid email.');
    return;
  }

  // Sending state
  submitBtn.classList.add('is-sending');
  submitBtn.disabled = true;
  cancelBtn.disabled = true;
  closeBtn.disabled  = true;
  submitBtn.querySelector('.ga-btn-label').textContent = 'Transmitting';

  // Remove stale error banner
  const prevErr = form.querySelector('.ga-form-error');
  if (prevErr) prevErr.remove();

  const minDelay = new Promise((r) => setTimeout(r, 900));
  try {
    const res = fetch(CONTACT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name, email, message,
        _subject: `New inquiry from ${name} — generaladmission.la`,
      }),
    }).then(async (r) => {
      if (!r.ok) throw new Error();
      const data = await r.json().catch(() => ({}));
      if (data.success === 'false' || data.success === false) throw new Error();
      return data;
    });
    await Promise.all([res, minDelay]);
    showSentState(name);
  } catch {
    await minDelay;
    submitBtn.classList.remove('is-sending');
    submitBtn.disabled = false;
    cancelBtn.disabled = false;
    closeBtn.disabled  = false;
    submitBtn.querySelector('.ga-btn-label').textContent = 'Send message';
    if (!form.querySelector('.ga-form-error')) {
      const err = document.createElement('div');
      err.className = 'ga-form-error';
      err.setAttribute('role', 'alert');
      err.textContent = "Something didn\u2019t go through. Please try again or reach out to us directly.";
      form.querySelector('.ga-form-actions').before(err);
    }
  }
}

function showSentState(name) {
  shrinkToCompact();
  const body = document.getElementById('ga-contact-body');
  body.classList.add('ga-contact-sent');
  const firstName = (name || '').split(/\s+/)[0];
  body.innerHTML = `
    <h2 class="ga-panel-title ga-sent-title">Received${firstName ? `, ${firstName}` : ''}.</h2>
    <p class="ga-sent-meta">We\u2019ll be in touch soon.</p>
  `;

  setTimeout(() => {
    const b = body.getBoundingClientRect();
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    window.GADotField && window.GADotField.dropImpact({ x: cx, y: cy }, Math.max(b.width, b.height) * 1.4 + 220, 38);
    closeContact();
  }, 1800);
}

function resetContactForm() {
  contactCompact = false;
  // form is rebuilt fresh on next open — nothing to reset
}

// ─── Chat (AI conversation) ───────────────────────────────────────────────────

let chatOpen = false;
let chatPhase = 'idle'; // idle | typing | replying | closing
let chatMessages = []; // { role: 'user'|'assistant', content }

function openChat() {
  if (chatOpen) return;
  chatOpen = true;
  chatPhase = 'idle';
  chatMessages = [];

  // Hide overlay corners instantly (skip 900ms CSS transition) — onReady restores them
  document.querySelectorAll('.ga-corner').forEach(function(el) {
    el.style.transition = 'none';
    el.style.opacity = '0';
  });
  document.getElementById('ga-overlay').classList.remove('is-revealed');

  // Blast wordmark dots off screen, then reveal chat
  window.GADotField && window.GADotField.blastWordmark(function () {
    buildChatUI();
    requestAnimationFrame(() => {
      document.getElementById('ga-chat') && document.getElementById('ga-chat').classList.add('is-active');
    });
  });
}

function closeChat() {
  if (!chatOpen) return;
  chatOpen = false;
  chatPhase = 'idle';
  const el = document.getElementById('ga-chat');
  if (el) el.classList.remove('is-active');
  setTimeout(function () {
    if (el && el._miniWordmark && el._miniWordmark.get()) el._miniWordmark.get().destroy();
    if (el && el.parentNode) el.parentNode.removeChild(el);
    window.GADotField && window.GADotField.recallDots();
  }, 500);
}

function buildChatUI() {
  const existing = document.getElementById('ga-chat');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  const el = document.createElement('div');
  el.id = 'ga-chat';
  el.className = 'ga-chat';
  el.innerHTML = `
    <canvas class="gac-logo" id="gac-logo" aria-hidden="true"></canvas>
    <button class="ga-theme-toggle gac-theme-toggle" id="gac-theme-btn" aria-label="Toggle theme"></button>
    <button class="gac-back" id="gac-back" aria-label="Back">
      <svg width="14" height="14" viewBox="0 0 14 14"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>
    </button>
    <div class="gac-group" id="gac-body">
      <p class="gac-header">Hey, how can we help?</p>
      <p class="gac-subheader">Ask us anything, or type your message and email — we'll send it straight to the team.</p>
      <div class="gac-thread" id="gac-thread"></div>
      <div class="gac-compose">
        <div class="gac-input is-empty" id="gac-input"
             contenteditable="true" spellcheck="false"
             role="textbox" aria-label="Your message" aria-multiline="true"></div>
      </div>
      <div class="gac-footer">
        <span class="gac-hint" id="gac-hint">Start typing</span>
        <button class="gac-submit" id="gac-submit" aria-label="Send">
          <span class="gac-submit-label">Submit</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 10 4 15 9 20"/>
            <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  const input  = document.getElementById('gac-input');
  const hint   = document.getElementById('gac-hint');
  const submit = document.getElementById('gac-submit');
  const back   = document.getElementById('gac-back');
  const logoCanvas = document.getElementById('gac-logo');

  back.addEventListener('click', closeChat);

  // Chat theme toggle — mirrors the main page toggle
  const chatThemeBtn = document.getElementById('gac-theme-btn');
  if (chatThemeBtn) {
    chatThemeBtn.innerHTML = mode === 'dark' ? ICON_SUN : ICON_MOON;
    chatThemeBtn.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    chatThemeBtn.addEventListener('click', toggleMode);
  }

  // Mini wordmark — init after a frame so CSS sizes are resolved
  var miniWordmark = null;
  requestAnimationFrame(function () {
    if (logoCanvas && typeof initMiniWordmark === 'function') {
      var curPal = (typeof mode !== 'undefined' && mode === 'dark') ? DARK_PALETTE : LIGHT_PALETTE;
      miniWordmark = initMiniWordmark(logoCanvas, curPal);
    }
  });

  // Store reference for cleanup
  el._miniWordmark = { get: function() { return miniWordmark; } };
  setTimeout(function () { input && input.focus(); }, 80);

  input.addEventListener('input', function () {
    const len = input.textContent.length;
    const isMobile = window.innerWidth <= 720;
    const baseSize = isMobile ? 52 : 160;
    const decay    = isMobile ? 0.978 : 0.992;
    const minSize  = isMobile ? 14 : 16;
    const size = Math.max(minSize, Math.round(baseSize * Math.pow(decay, len)));
    input.style.fontSize = size + 'px';
    const empty = len === 0;
    input.classList.toggle('is-empty', empty);
    hint.style.opacity = empty ? '1' : '0';
    if (chatPhase === 'idle') chatPhase = 'typing';
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitChat(); }
  });

  submit.addEventListener('click', submitChat);
}

async function submitChat() {
  const input = document.getElementById('gac-input');
  if (!input || chatPhase === 'replying' || chatPhase === 'closing') return;
  const text = (input.textContent || '').trim();
  if (!text) return;

  // Clear input
  input.textContent = '';
  input.style.fontSize = '160px';
  input.classList.add('is-empty');
  const hint = document.getElementById('gac-hint');
  if (hint) hint.style.opacity = '1';

  // Hide header and hint permanently after first message
  const group = document.getElementById('gac-body');
  if (group) {
    const hdr = group.querySelector('.gac-header');
    if (hdr) hdr.style.display = 'none';
    const sub = group.querySelector('.gac-subheader');
    if (sub) sub.style.display = 'none';
  }
  if (hint) { hint.style.opacity = '0'; hint.style.pointerEvents = 'none'; }

  chatMessages.push({ role: 'user', content: text });
  appendChatMsg('user', text);
  chatPhase = 'replying';

  const thinkId = 'gac-think-' + Date.now();
  appendChatThinking(thinkId);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatMessages }),
    });
    if (!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();
    const raw = (data.content && data.content[0] && data.content[0].text) || 'Something went wrong. Please try again.';

    const thinkEl = document.getElementById(thinkId);
    if (thinkEl) thinkEl.parentNode && thinkEl.parentNode.removeChild(thinkEl);

    const isDone    = raw.indexOf('[DONE]') !== -1;
    const isAbusive = raw.indexOf('[ABUSIVE]') !== -1;
    const isExit    = raw.indexOf('[EXIT]') !== -1;
    const reply     = raw.replace('[DONE]', '').replace('[ABUSIVE]', '').replace('[EXIT]', '').trim();

    if (reply) {
      chatMessages.push({ role: 'assistant', content: reply });
      appendChatMsg('claude', reply);
    }

    if (isAbusive) {
      chatPhase = 'closing';
      setTimeout(function () {
        showChatThanks();
        var btn = document.getElementById('ga-contact-btn');
        if (btn) btn.style.display = 'none';
      }, 600);
    } else if (isDone) {
      chatPhase = 'closing';
      setTimeout(showChatThanks, 900);
    } else if (isExit) {
      chatPhase = 'closing';
      setTimeout(showChatExit, 900);
    } else {
      chatPhase = 'typing';
      setTimeout(function () { document.getElementById('gac-input') && document.getElementById('gac-input').focus(); }, 80);
    }
  } catch (e) {
    const thinkEl = document.getElementById(thinkId);
    if (thinkEl) thinkEl.parentNode && thinkEl.parentNode.removeChild(thinkEl);
    appendChatMsg('claude', 'Something went wrong. Please try again.');
    chatPhase = 'typing';
  }
}

function appendChatMsg(role, text) {
  const thread = document.getElementById('gac-thread');
  if (!thread) return;
  const div = document.createElement('div');
  div.className = 'gac-msg ' + (role === 'user' ? 'gac-msg-user' : 'gac-msg-claude');
  div.textContent = text;
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
}

function appendChatThinking(id) {
  const thread = document.getElementById('gac-thread');
  if (!thread) return;
  const div = document.createElement('div');
  div.id = id;
  div.className = 'gac-msg gac-msg-thinking';
  div.innerHTML = '<span></span><span></span><span></span>';
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
}

function submitChatTranscript() {
  var transcript = chatMessages.map(function (m) {
    return (m.role === 'user' ? 'Visitor' : 'General Admission') + ': ' + m.content;
  }).join('\n\n');

  // Extract email from conversation with a simple regex
  var emailMatch = transcript.match(/\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/);
  var email = emailMatch ? emailMatch[0] : 'not provided — see transcript';

  fetch(CONTACT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      name: 'Website Chat',
      email: email,
      message: transcript,
      _subject: 'New chat submission — generaladmission.la',
    }),
  }).catch(function () {}); // fire and forget
}

function showChatThanks() {
  const body = document.getElementById('gac-body');
  if (!body) return;

  submitChatTranscript();

  // Step 1: fake processing state for 4 seconds
  body.innerHTML = `
    <div class="gac-processing">
      <span class="gac-processing-text">Processing</span>
      <span class="gac-proc-dots"><i></i><i></i><i></i></span>
    </div>
  `;

  setTimeout(function () {
    // Step 2: thanks + dot smiley for 2.5 seconds
    if (!document.getElementById('gac-body')) return;
    body.innerHTML = `
      <div class="gac-thanks">
        <p class="gac-thanks-text">Thanks\u2014 we\u2019ll be in touch.</p>
        <svg class="gac-smiley" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="35" cy="38" r="5" fill="currentColor"/>
          <circle cx="65" cy="38" r="5" fill="currentColor"/>
          <circle cx="26" cy="63" r="3.5" fill="currentColor"/>
          <circle cx="36" cy="72" r="3.5" fill="currentColor"/>
          <circle cx="50" cy="76" r="3.5" fill="currentColor"/>
          <circle cx="64" cy="72" r="3.5" fill="currentColor"/>
          <circle cx="74" cy="63" r="3.5" fill="currentColor"/>
        </svg>
      </div>
    `;
    setTimeout(closeChat, 2500);
  }, 4000);
}

function showChatExit() {
  const body = document.getElementById('gac-body');
  if (!body) return;
  body.innerHTML = `
    <div class="gac-thanks">
      <svg class="gac-smiley" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="35" cy="38" r="5" fill="currentColor"/>
        <circle cx="65" cy="38" r="5" fill="currentColor"/>
        <circle cx="26" cy="63" r="3.5" fill="currentColor"/>
        <circle cx="36" cy="72" r="3.5" fill="currentColor"/>
        <circle cx="50" cy="76" r="3.5" fill="currentColor"/>
        <circle cx="64" cy="72" r="3.5" fill="currentColor"/>
        <circle cx="74" cy="63" r="3.5" fill="currentColor"/>
      </svg>
    </div>
  `;
  setTimeout(closeChat, 2000);
}

// ─── Run ──────────────────────────────────────────────────────────────────────

init();
