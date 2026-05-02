/* General Admission — landing
   Locked to paper palette (white bg, black dots).
   Contact form posts to FormSubmit (matthias@generaladmission.la) in the background.
*/

const { useEffect, useRef, useState } = React;

const SETTLE_SPEED = 0.005;

// Palettes — paper (light) and ink (dark)
const LIGHT_PALETTE = {
  bg:      "#FFFFFF",
  bgDots:  "#E4E4E4",
  fgDots:  "#0A0A0A",
  ink:     "#0A0A0A",
  inkSoft: "#3A3A3A",
  pill:    "#0A0A0A",
  pillText:"#FFFFFF",
};
const DARK_PALETTE = {
  bg:      "#0A0A0A",
  bgDots:  "#202020",
  fgDots:  "#F5F5F5",
  ink:     "#F5F5F5",
  inkSoft: "#B5B5B5",
  pill:    "#F5F5F5",
  pillText:"#0A0A0A",
};

// ===== Random palette generator (used by the scroll easter egg) =====
// Pick a harmonic hue pair (complementary / split-comp / triadic / analogous-with-shift),
// then assign one as the "ground" (low-sat large area) and one as the "ink" (saturated
// text/dots). Lightness pair is chosen for high contrast (≥55 L apart) so text always
// reads clean. Either side can end up dark or light — no monochrome bias.
function randomPalette(mode = "any") {
  const h1 = Math.floor(Math.random() * 360);
  // Hue relationship
  const rel = Math.random();
  let dh;
  if (rel < 0.32)      dh = 180 + (Math.random() * 16 - 8);   // complementary
  else if (rel < 0.58) dh = (Math.random() < 0.5 ? 150 : 210) + (Math.random() * 14 - 7); // split-comp
  else if (rel < 0.80) dh = (Math.random() < 0.5 ? 120 : 240) + (Math.random() * 14 - 7); // triadic
  else                 dh = (Math.random() < 0.5 ? -1 : 1) * (28 + Math.random() * 22);   // analogous-with-shift
  const h2 = (h1 + dh + 360) % 360;

  // Decide which side is ground (bg) vs ink (fg). Mode locks this:
  //   'dark'  → ground always dark (variations stay in dark territory)
  //   'light' → ground always light
  //   'any'   → coin-flip (legacy behavior)
  const groundDark = mode === "dark"  ? true
                    : mode === "light" ? false
                    : Math.random() < 0.5;
  const lGround = groundDark ? 7 + Math.random() * 11   // 7..18  deep ground
                              : 90 + Math.random() * 7;  // 90..97 paper ground
  const lInk    = groundDark ? 88 + Math.random() * 8   // 88..96
                              : 6  + Math.random() * 12; // 6..18

  // Saturation: ground stays muted so it reads as a surface; ink can be richer.
  const sGround = 18 + Math.random() * 32;  // 18..50
  const sInk    = 35 + Math.random() * 50;  // 35..85

  // bgDots is a tonal step toward the ink — visible, but quieter than fg.
  const lBgDots = groundDark ? Math.min(lGround + 9 + Math.random() * 6, 28)
                              : Math.max(lGround - 12 - Math.random() * 6, 78);
  const sBgDots = sGround * 0.85;

  // inkSoft is ink pulled ~22 L toward ground — a half-strength version for sub copy.
  const lInkSoft = groundDark ? Math.max(lInk - 22, 55) : Math.min(lInk + 22, 45);

  // Hue assignment: ground uses h1, ink uses h2 (or swap occasionally for variety).
  const swapHues = Math.random() < 0.35;
  const hG = swapHues ? h2 : h1;
  const hI = swapHues ? h1 : h2;

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

// Apply a palette + crossfade the canvas in lockstep with CSS vars.
// Uniform soft fade — no spatial cascade.
function runCascade(targetPal, dur = 120) {
  try { window.GADotField?.triggerCascade?.(targetPal, dur, { mode: "fade" }); } catch (e) {}
  const root = document.documentElement;
  root.style.setProperty("--bg", targetPal.bg);
  root.style.setProperty("--bg-dots", targetPal.bgDots);
  root.style.setProperty("--fg", targetPal.fgDots);
  root.style.setProperty("--ink", targetPal.ink);
  root.style.setProperty("--ink-soft", targetPal.inkSoft);
  root.style.setProperty("--pill", targetPal.pill);
  root.style.setProperty("--pill-text", targetPal.pillText);
  root.setAttribute("data-cascading", "1");
  clearTimeout(window.__gaCascadeT);
  window.__gaCascadeT = setTimeout(() => {
    root.removeAttribute("data-cascading");
  }, dur + 200);
}

// Email backend — FormSubmit AJAX endpoint. Address is assembled at runtime so it
// doesn't sit as a plaintext mailto target in shipped source. Not real protection
// against a determined scraper, but a meaningful speed bump.
// One-time activation required: submit once, click the confirmation link FormSubmit
// emails to the address, then the endpoint stays live.
const CONTACT_ENDPOINT = (() => {
  const u = ["matthias", "generaladmission", "la"];
  return `https://formsubmit.co/ajax/${u[0]}@${u[1]}.${u[2]}`;
})();

const DotField = window.DotField;

// ---------- Corners ----------
function CornerIntro() {
  return (
    <div className="ga-corner ga-corner-tl">
      <p className="ga-intro">
        <strong>GENERAL ADMISSION</strong> is a privately held holding company that builds, operates, and scales category&#8209;defining brands alongside the world&rsquo;s leading influencers, manufacturers, and retailers.
      </p>
    </div>
  );
}

function CornerFooter() {
  return (
    <div className="ga-corner ga-corner-bl">
      <p className="ga-footer-copy">
        Led by repeat operators with deep experience across product invention, supply chain, world&#8209;building, consumer marketing, influencer partnerships, omni&#8209;channel retail, and scaling.
      </p>
    </div>
  );
}

function ProjectStats() {
  return (
    <div className="ga-corner ga-corner-br">
      <ul className="ga-stats">
        <li><span>Projects in development</span><b>03</b></li>
        <li><span>Projects live</span><b>02</b></li>
      </ul>
    </div>
  );
}

function ThemeToggle({ mode, onToggle }) {
  const isDark = mode === "dark";
  return (
    <button
      type="button"
      className="ga-theme-toggle"
      onClick={onToggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        // Sun — shown in dark mode (click to go light)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4"></circle>
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path>
        </svg>
      ) : (
        // Moon — shown in light mode (click to go dark)
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"></path>
        </svg>
      )}
    </button>
  );
}

function ContactPill({ onClick, mode, onToggleMode }) {
  return (
    <div className="ga-corner ga-corner-tr">
      <ThemeToggle mode={mode} onToggle={onToggleMode} />
      <button className="ga-pill" onClick={onClick} aria-label="Build with us">
        <span className="ga-pill-text">BUILD WITH US</span>
        <span className="ga-pill-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="1.5"/>
            <path d="M3.5 6.5l8.5 6 8.5-6"/>
          </svg>
        </span>
      </button>
    </div>
  );
}

// ---------- Contact reveal — emerges from the CONTACT pill, displaces dots,
//             materializes as a cleared rectangle on the dotfield ----------
function ContactReveal({ open, onClose, pillRect }) {
  const [phase, setPhase] = useState("closed"); // closed | opening | open | closing
  const [rect, setRect] = useState(null);
  const [compact, setCompact] = useState(false);
  const alphaRef = useRef(0);
  const rafRef = useRef(0);
  const innerRef = useRef(null);

  // Animate excludeRect alpha from `to` to `from` over duration
  function animateAlpha(from, to, duration, after) {
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    function step() {
      const t = Math.min(1, (performance.now() - start) / duration);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      const a = from + (to - from) * e;
      alphaRef.current = a;
      if (window.GADotField) window.GADotField.setExcludeAlpha(a);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else if (after) after();
    }
    rafRef.current = requestAnimationFrame(step);
  }

  // Compute the centered rect for the form, in viewport px
  function computeRect(opts = {}) {
    const compactMode = !!opts.compact;
    const isMobile = window.innerWidth < 640;
    const w = isMobile ? window.innerWidth - 32 : Math.min(620, window.innerWidth - 80);
    const h = compactMode
      ? (isMobile ? 220 : 240)
      : (isMobile ? Math.min(window.innerHeight - 80, 560) : Math.min(580, window.innerHeight - 80));
    const x = (window.innerWidth - w) / 2;
    const y = (window.innerHeight - h) / 2;
    return { x, y, w, h, r: 18 };
  }

  // Open
  useEffect(() => {
    if (!open || phase !== "closed") return;
    if (!window.GADotField) return;
    const r = computeRect();
    setRect(r);
    setPhase("opening");

    // Stone-drop: a single shockwave centered on the form, scattering all dots in a wide radius.
    const center = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const splashRadius = Math.max(r.w, r.h) * 1.45 + 220;
    window.GADotField.dropImpact(center, splashRadius, 44);

    // Drop the cleared rect almost immediately and ramp the wipe in
    const t1 = setTimeout(() => {
      window.GADotField.setExcludeRect({ ...r, alpha: 0 });
      animateAlpha(0, 1, 480, () => setPhase("open"));
    }, 90);

    return () => clearTimeout(t1);
  }, [open, phase, pillRect]);

  // Close
  useEffect(() => {
    if (open || phase === "closed" || phase === "closing") return;
    setPhase("closing");
    animateAlpha(alphaRef.current, 0, 380, () => {
      if (window.GADotField) window.GADotField.setExcludeRect(null);
      setPhase("closed");
      setRect(null);
    });
  }, [open, phase, pillRect, rect]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // Reset compact when fully closed so next open uses full size
  useEffect(() => { if (phase === "closed") setCompact(false); }, [phase]);

  // Shrink to compact when ContactBody enters sent state
  function shrinkToCompact() {
    if (compact) return;
    setCompact(true);
    const r = computeRect({ compact: true });
    setRect(r);
    if (window.GADotField) window.GADotField.setExcludeRect({ ...r, alpha: alphaRef.current });
  }

  if (phase === "closed" || !rect) return null;
  const isOpen = phase === "opening" || phase === "open";

  return (
    <div className={`ga-contact-stage ${isOpen ? "is-open" : "is-closing"}`} onClick={onClose}>
      <div
        ref={innerRef}
        className="ga-contact-frame"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* form content */}
        <ContactBody onClose={onClose} onSent={shrinkToCompact} />
      </div>
    </div>
  );
}

// ---------- Contact form ----------
// States: idle | sending | sent | error
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ContactBody({ onClose, onSent }) {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [emailErr, setEmailErr] = useState(false);
  const rootRef = useRef(null);
  const sentTimerRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    if (state === "sending" || state === "sent") return;
    if (!EMAIL_RE.test(form.email.trim())) { setEmailErr(true); return; }
    setEmailErr(false);
    setState("sending");
    const minDelay = new Promise((r) => setTimeout(r, 900));
    try {
      const res = fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          message: form.message,
          _subject: `New inquiry from ${form.name} — generaladmission.la`,
        }),
      }).then(async (r) => {
        if (!r.ok) throw new Error();
        const data = await r.json().catch(() => ({}));
        if (data.success === "false" || data.success === false) throw new Error();
        return data;
      });
      await Promise.all([res, minDelay]);
      setState("sent");
      if (onSent) onSent();
    } catch {
      await minDelay;
      setState("error");
    }
  }

  // Auto-dismiss the sent state with a dot-field impact
  useEffect(() => {
    if (state !== "sent") return;
    sentTimerRef.current = setTimeout(() => {
      const el = rootRef.current;
      if (el && window.GADotField) {
        const b = el.getBoundingClientRect();
        const cx = b.left + b.width / 2;
        const cy = b.top + b.height / 2;
        const radius = Math.max(b.width, b.height) * 1.4 + 220;
        window.GADotField.dropImpact({ x: cx, y: cy }, radius, 38);
      }
      onClose();
    }, 1800);
    return () => clearTimeout(sentTimerRef.current);
  }, [state, onClose]);

  if (state === "sent") {
    const firstName = (form.name || "").trim().split(/\s+/)[0];
    return (
      <div className="ga-contact-body ga-contact-sent" ref={rootRef}>
        <h2 className="ga-panel-title ga-sent-title">Received{firstName ? `, ${firstName}` : ""}.</h2>
        <p className="ga-sent-meta">We&rsquo;ll be in touch soon.</p>
      </div>
    );
  }

  return (
    <div className="ga-contact-body" ref={rootRef}>
      <button className="ga-panel-close" onClick={onClose} aria-label="Close" disabled={state === "sending"}>
        <CloseIcon />
      </button>
      <h2 className="ga-panel-title">Hi there.</h2>
      <p className="ga-panel-sub">Want to build with us? Say hello.</p>

      <form className="ga-form" onSubmit={submit} noValidate>
        <UnderlineField label="Your name" value={form.name}
          onChange={(v) => setForm({ ...form, name: v })} required disabled={state === "sending"} />
        <UnderlineField label="Email" type="email" value={form.email}
          onChange={(v) => { setForm({ ...form, email: v }); if (emailErr) setEmailErr(false); }}
          required disabled={state === "sending"} error={emailErr ? "Please enter a valid email." : null} />
        <UnderlineField label="What&rsquo;s on your mind?" textarea value={form.message}
          onChange={(v) => setForm({ ...form, message: v })} required disabled={state === "sending"} />

        {state === "error" && (
          <div className="ga-form-error" role="alert">
            Something didn&rsquo;t go through. Email us directly at{" "}
            <a href="mailto:matthias@generaladmission.la">matthias@generaladmission.la</a>.
          </div>
        )}

        <div className="ga-form-actions">
          <button type="button" className="ga-btn ga-btn-ghost" onClick={onClose} disabled={state === "sending"}>
            Cancel
          </button>
          <button type="submit" className={`ga-btn ga-btn-solid ga-btn-send ${state === "sending" ? "is-sending" : ""}`} disabled={state === "sending"}>
            <span className="ga-btn-label">
              {state === "sending" ? "Transmitting" : "Send message"}
            </span>
            <span className="ga-btn-dots" aria-hidden="true">
              <i></i><i></i><i></i><i></i><i></i>
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}

function UnderlineField({ label, value, onChange, type = "text", required, optional, textarea, error }) {
  const [focused, setFocused] = useState(false);
  const filled = value && value.length > 0;
  const Tag = textarea ? "textarea" : "input";
  return (
    <label className={`ga-uf ${focused ? "is-focused" : ""} ${filled ? "is-filled" : ""} ${error ? "is-error" : ""}`}>
      <span className="ga-uf-label">
        {label}
        {optional && <em> (optional)</em>}
        {error && <em className="ga-uf-err"> — {error}</em>}
      </span>
      <Tag
        className="ga-uf-input"
        type={textarea ? undefined : type}
        rows={textarea ? 2 : undefined}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      <span className="ga-uf-rule" aria-hidden="true">
        <span className="ga-uf-rule-base"></span>
        <span className="ga-uf-rule-fill"></span>
      </span>
    </label>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14">
      <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" fill="none"/>
    </svg>
  );
}

// Dot success mark — three dots converging into one
function DotMark() {
  return (
    <div className="ga-dotmark" aria-hidden="true">
      <i></i><i></i><i></i>
    </div>
  );
}

// ---------- App ----------
const WORDMARK = ["GENERAL", "ADMISSION"];
function App() {
  const [contactOpen, setContactOpen] = useState(false);
  const [pillRect, setPillRect] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState(() => {
    try {
      const saved = localStorage.getItem("ga-mode");
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) {}
    // No saved preference — pick by user's local clock.
    // Daytime: 07:00–18:59 → light. Otherwise → dark.
    const h = new Date().getHours();
    return (h >= 7 && h < 19) ? "light" : "dark";
  });
  const palette = mode === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    try { localStorage.setItem("ga-mode", mode); } catch (e) {}
  }, [mode]);

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 250);
    return () => clearTimeout(t);
  }, []);

  // ===== Easter egg — scrolling cycles infinite random palette pairings =====
  // No actual page scroll happens; we capture wheel/touch deltas, accumulate, and
  // trigger a cascade once a threshold is crossed. Cooldown matches cascade duration.
  useEffect(() => {
    let accum = 0;
    let lastTrigger = 0;
    const THRESH = 320;
    const COOLDOWN = 200;
    const isPassthroughTarget = (target) => {
      if (!target || !target.closest) return false;
      // Let the contact form, tweaks panel, and any modal scroll naturally.
      return !!target.closest(".ga-contact-body, .ga-contact-stage, .twk-panel");
    };
    const tryTrigger = () => {
      const now = performance.now();
      if (now - lastTrigger < COOLDOWN) return false;
      if (Math.abs(accum) < THRESH) return false;
      accum = 0;
      lastTrigger = now;
      runCascade(randomPalette(modeRef.current));
      return true;
    };
    const onWheel = (e) => {
      if (isPassthroughTarget(e.target)) return;
      e.preventDefault();
      accum += e.deltaY;
      tryTrigger();
    };
    let touchY = 0;
    const onTouchStart = (e) => {
      if (isPassthroughTarget(e.target)) return;
      touchY = e.touches[0].clientY;
    };
    const onTouchMove = (e) => {
      if (isPassthroughTarget(e.target)) return;
      e.preventDefault();
      const y = e.touches[0].clientY;
      accum += (touchY - y);
      touchY = y;
      tryTrigger();
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  // Sync palette CSS vars (re-runs when mode flips)
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--bg", palette.bg);
    root.style.setProperty("--bg-dots", palette.bgDots);
    root.style.setProperty("--fg", palette.fgDots);
    root.style.setProperty("--ink", palette.ink);
    root.style.setProperty("--ink-soft", palette.inkSoft);
    root.style.setProperty("--pill", palette.pill);
    root.style.setProperty("--pill-text", palette.pillText);
    document.documentElement.dataset.mode = mode;
  }, [palette, mode]);

  const openContact = (e) => {
    if (e?.currentTarget) {
      const b = e.currentTarget.getBoundingClientRect();
      setPillRect({ x: b.left, y: b.top, w: b.width, h: b.height });
    }
    setContactOpen(true);
  };

  return (
    <>
      <DotField
        wordmark={WORDMARK}
        settleSpeed={SETTLE_SPEED}
        palette={palette}
      />

      <div className={`ga-overlay ${revealed ? "is-revealed" : ""}`}>
        <CornerIntro />
        <ContactPill
          onClick={openContact}
          mode={mode}
          onToggleMode={() => {
            setMode((m) => {
              const next = m === "dark" ? "light" : "dark";
              runCascade(next === "dark" ? DARK_PALETTE : LIGHT_PALETTE);
              return next;
            });
          }}
        />
        <CornerFooter />
        <ProjectStats />
      </div>

      <ContactReveal
        open={contactOpen}
        pillRect={pillRect}
        onClose={() => setContactOpen(false)}
      />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
