/*
  Unified dot-field — the working version.
  - Grid is fixed; wordmark is a moving highlight that lights up grid cells
    inside its warped silhouette.
  - Soft edge contour: dot size scales with fractional mask alpha.
  - Cursor force: directional, along motion vector, ~130px radius.
  - Disruption: lit cells fly off, then return.
    * Phase 1 'fly': inertia + damping (cursor momentum).
    * Phase 2 'return': spring + slight under-damping → small organic bounce.
    * Kick on fly→return so the home stretch stays brisk.
  - Return target: nearest currently-lit grid cell within ~140px of the
    dot's original grid home → G-dots return to the G even after warp,
    not across the whole wordmark.
  - Soft cap on displaced particles to keep whole-word sweeps stable.
*/

const { useEffect, useRef } = React;

const WORDMARK_LINES = ["GENERAL", "ADMISSION"];
const SP = 7;
const FG_R = SP * 0.42;
const BG_R = 1.4;
const WARP_AMP = 32;
const WARP_SPEED = 0.45;
const FORCE_RADIUS = 43;
const FORCE_K = 0.06;
const MAX_DRIFT = 200;            // hard cap on how far a dot can leave its home
const MAX_RETURN_SPEED = 0.72;    // cap on return-phase velocity → even pace from any distance
const FINAL_GLIDE_DIST = 4;      // within this many px of home, swap spring for constant glide
const FINAL_GLIDE_SPEED = 0.36;  // px/frame on final approach
const MAX_RETURN_RADIUS = 140;
const SEG_MAX_STEP = 16;
const FLY_DAMPING = 0.92;
const RETURN_SPRING = 0.0096;
const RETURN_DAMPING = 0.95;
const FLY_TO_RETURN_VEL = 0.4;
const RETURN_KICK_K = 0.08;
const RETURN_KICK_MAX = 1.6;
const SETTLE_DIST = 0.5;
const LIT_THRESHOLD = 0.5;
const MAX_DISPLACED = 600;

function DotField({ palette }) {
  const canvasRef = useRef(null);
  const palRef = useRef(palette);
  const cascadeRef = useRef({ active: false });
  // Don't auto-sync palRef on prop change — App calls triggerCascade() instead, which animates.
  // We only sync if no cascade is active (e.g. initial mount or external state change).
  useEffect(() => {
    if (!cascadeRef.current.active) palRef.current = palette;
  }, [palette]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let cssW = 0, cssH = 0, dpr = 1;
    let nx = 0, ny = 0;
    let intensity = null;
    // Cascade metadata — per-column delay/speed and per-dot vertical jitter.
    // Regenerated on resize. Used by triggerCascade for the sand-flow effect.
    let colDelay = null;     // Float32Array length nx — when this column starts (0..0.5 of total dur)
    let colSpeed = null;     // Float32Array length nx — fraction of dur the column takes (0.5..0.85)
    let dotJitter = null;    // Float32Array length nx*ny — per-dot vertical jitter (px) so the front isn't a flat line
    let maskAlpha = null;
    let scanX0 = 0, scanY0 = 0, scanX1 = 0, scanY1 = 0;

    const mask = document.createElement("canvas");
    const bg = document.createElement("canvas");
    const displaced = new Map();

    // Exclusion rectangle — a region cleared of dots (the contact form sits inside it).
    // { x, y, w, h, r, alpha } in css px. alpha drives the bg fill opacity.
    let excludeRect = null;

    function isInsideExclude(px, py) {
      if (!excludeRect) return false;
      const r = excludeRect;
      return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
    }

    function rebuild() {
      cssW = window.innerWidth;
      cssH = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";

      mask.width = cssW; mask.height = cssH;
      const mctx = mask.getContext("2d");
      mctx.clearRect(0, 0, cssW, cssH);
      mctx.fillStyle = "#fff";
      mctx.textAlign = "center";
      mctx.textBaseline = "middle";
      const targetW = cssW * 0.78;
      let fontSize = 100;
      mctx.font = `900 ${fontSize}px "Archivo Black", system-ui, sans-serif`;
      const longest = WORDMARK_LINES.reduce((a, b) => a.length >= b.length ? a : b);
      fontSize = Math.floor((targetW / mctx.measureText(longest).width) * fontSize);
      mctx.font = `900 ${fontSize}px "Archivo Black", system-ui, sans-serif`;
      const lh = fontSize * 0.95;
      const totalH = lh * WORDMARK_LINES.length;
      const y0 = cssH / 2 - totalH / 2 + lh / 2 + cssH * 0.04;
      WORDMARK_LINES.forEach((line, i) => mctx.fillText(line, cssW / 2, y0 + i * lh));

      const data = mctx.getImageData(0, 0, cssW, cssH).data;
      maskAlpha = new Uint8Array(cssW * cssH);
      let minX = cssW, minY = cssH, maxX = 0, maxY = 0;
      for (let i = 0, j = 3; i < maskAlpha.length; i++, j += 4) {
        const a = data[j];
        maskAlpha[i] = a;
        if (a > 128) {
          const px = i % cssW, py = (i / cssW) | 0;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
      }
      const margin = WARP_AMP + SP;
      nx = Math.floor(cssW / SP);
      ny = Math.floor(cssH / SP);
      scanX0 = Math.max(0, Math.floor((minX - margin) / SP));
      scanY0 = Math.max(0, Math.floor((minY - margin) / SP));
      scanX1 = Math.min(nx - 1, Math.ceil((maxX + margin) / SP));
      scanY1 = Math.min(ny - 1, Math.ceil((maxY + margin) / SP));
      intensity = new Float32Array(nx * ny);
      // Per-column cascade timing — each column is a sand stream with its own start + speed.
      // Use a deterministic LCG seeded by nx so it stays stable per resize, varies per column.
      colDelay = new Float32Array(nx);
      colSpeed = new Float32Array(nx);
      let s = 0x9E3779B9 ^ (nx * 1009);
      const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xFFFFFFFF; };
      for (let cx = 0; cx < nx; cx++) {
        const start = rand() * 0.5;            // column begins flowing at 0..0.5 of total
        const span = 0.5 + rand() * 0.5;       // column takes 0.5..1.0 to fill
        const end = Math.min(1.0, start + span);
        colDelay[cx] = start;
        colSpeed[cx] = end - start;            // effective duration; guaranteed ≥ 0.5, end ≤ 1
      }
      // Per-dot jitter so within-column boundary is fuzzy like grains, not a flat line.
      dotJitter = new Float32Array(nx * ny);
      for (let i = 0; i < nx * ny; i++) dotJitter[i] = (rand() - 0.5) * SP * 1.6;
      displaced.clear();
      rebuildBgCache();
    }

    // Sand-flow front per column. Returns the y boundary in column cx at given progress.
    // Each column has its own start delay and flow speed (set in rebuild) — some columns
    // are still empty when others have already finished, like grains streaming down an hourglass.
    // Returns -Infinity when the column hasn't started, +Infinity when it's fully filled.
    const FRONT_MARGIN = 60;
    function getColumnFrontY(cx, progress) {
      if (!colDelay) return -Infinity;
      const delay = colDelay[cx];
      const speed = colSpeed[cx];
      const local = (progress - delay) / speed;
      if (local <= 0) return -Infinity;
      if (local >= 1) return Infinity;
      // Local progress maps to y from -FRONT_MARGIN to cssH+FRONT_MARGIN
      return -FRONT_MARGIN + local * (cssH + FRONT_MARGIN * 2);
    }

    // Optional split: when provided, paints toPal above the per-column front + fromPal below.
    function rebuildBgCache(split) {
      bg.width = canvas.width;
      bg.height = canvas.height;
      const bctx = bg.getContext("2d");
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const half = SP / 2;

      if (split) {
        const { fromPal, toPal, progress, mode = "cascade" } = split;
        // Background — uniform crossfade across whole canvas (no spatial split, no hard lines).
        // Two fillRects: full fromPal then toPal at alpha = progress.
        bctx.fillStyle = fromPal.bg;
        bctx.fillRect(0, 0, cssW, cssH);
        bctx.save();
        bctx.globalAlpha = progress;
        bctx.fillStyle = toPal.bg;
        bctx.fillRect(0, 0, cssW, cssH);
        bctx.restore();

        if (mode === "fade") {
          // Uniform bg-dots crossfade — toPal at full alpha, fromPal overlaid at (1-progress).
          bctx.fillStyle = toPal.bgDots;
          bctx.beginPath();
          for (let cy = 0; cy < ny; cy++) {
            for (let cx = 0; cx < nx; cx++) {
              const x = cx * SP + half, y = cy * SP + half;
              bctx.moveTo(x + BG_R, y);
              bctx.arc(x, y, BG_R, 0, Math.PI * 2);
            }
          }
          bctx.fill();
          bctx.save();
          bctx.globalAlpha = 1 - progress;
          bctx.fillStyle = fromPal.bgDots;
          bctx.beginPath();
          for (let cy = 0; cy < ny; cy++) {
            for (let cx = 0; cx < nx; cx++) {
              const x = cx * SP + half, y = cy * SP + half;
              bctx.moveTo(x + BG_R, y);
              bctx.arc(x, y, BG_R, 0, Math.PI * 2);
            }
          }
          bctx.fill();
          bctx.restore();
          return;
        }

        // mode === 'cascade' — sand-stream per-column with per-dot jitter.
        bctx.fillStyle = toPal.bgDots;
        bctx.beginPath();
        for (let cx = 0; cx < nx; cx++) {
          const front = getColumnFrontY(cx, progress);
          if (front === -Infinity) continue;
          for (let cy = 0; cy < ny; cy++) {
            const y = cy * SP + half;
            const dotFront = front === Infinity ? Infinity : front + dotJitter[cy * nx + cx];
            if (y < dotFront) {
              const x = cx * SP + half;
              bctx.moveTo(x + BG_R, y);
              bctx.arc(x, y, BG_R, 0, Math.PI * 2);
            }
          }
        }
        bctx.fill();
        bctx.fillStyle = fromPal.bgDots;
        bctx.beginPath();
        for (let cx = 0; cx < nx; cx++) {
          const front = getColumnFrontY(cx, progress);
          if (front === Infinity) continue;
          for (let cy = 0; cy < ny; cy++) {
            const y = cy * SP + half;
            const dotFront = front === -Infinity ? -Infinity : front + dotJitter[cy * nx + cx];
            if (y >= dotFront) {
              const x = cx * SP + half;
              bctx.moveTo(x + BG_R, y);
              bctx.arc(x, y, BG_R, 0, Math.PI * 2);
            }
          }
        }
        bctx.fill();
        return;
      }

      bctx.fillStyle = palRef.current.bg;
      bctx.fillRect(0, 0, cssW, cssH);
      bctx.fillStyle = palRef.current.bgDots;
      bctx.beginPath();
      for (let cy = 0; cy < ny; cy++) {
        for (let cx = 0; cx < nx; cx++) {
          const x = cx * SP + half, y = cy * SP + half;
          bctx.moveTo(x + BG_R, y);
          bctx.arc(x, y, BG_R, 0, Math.PI * 2);
        }
      }
      bctx.fill();
    }

    rebuild();
    if (document.fonts?.ready) document.fonts.ready.then(() => {
      if (document.fonts.check('900 100px "Archivo Black"')) rebuild();
    });

    let mx = -9999, my = -9999, lmt = 0;
    let pendingSeg = null;
    function onMove(e) {
      const t = performance.now();
      const nmx = e.clientX, nmy = e.clientY;
      if (mx < -1000) { mx = nmx; my = nmy; lmt = t; return; }
      const dt = Math.max(8, t - lmt) / 1000;
      const dx = nmx - mx, dy = nmy - my;
      const dist = Math.hypot(dx, dy);
      const speed = dist / dt;
      pendingSeg = { x0: mx, y0: my, x1: nmx, y1: nmy, dirX: dist > 0 ? dx / dist : 0, dirY: dist > 0 ? dy / dist : 0, speed };
      mx = nmx; my = nmy; lmt = t;
    }
    window.addEventListener("pointermove", onMove);

    let resizeT;
    function onResize() { clearTimeout(resizeT); resizeT = setTimeout(rebuild, 100); }
    window.addEventListener("resize", onResize);

    function applyForceAlongSegment(seg) {
      const { x0, y0, x1, y1, dirX, dirY, speed } = seg;
      if (speed < 1) return;
      const segLen = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(segLen / SEG_MAX_STEP));
      const forceMag = FORCE_K * speed / steps;
      const r = FORCE_RADIUS, r2 = r * r;
      const half = SP / 2;
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        const px = x0 + (x1 - x0) * u;
        const py = y0 + (y1 - y0) * u;
        const cxMin = Math.max(0, Math.floor((px - r) / SP));
        const cxMax = Math.min(nx - 1, Math.floor((px + r) / SP));
        const cyMin = Math.max(0, Math.floor((py - r) / SP));
        const cyMax = Math.min(ny - 1, Math.floor((py + r) / SP));
        for (let cy = cyMin; cy <= cyMax; cy++) {
          for (let cx = cxMin; cx <= cxMax; cx++) {
            const idx = cy * nx + cx;
            if (intensity[idx] < 0.25) continue; // soft contour included, not just core
            const hx = cx * SP + half, hy = cy * SP + half;
            let p = displaced.get(idx);
            const curX = p ? p.x : hx, curY = p ? p.y : hy;
            const ddx = curX - px, ddy = curY - py;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 > r2) continue;
            const d = Math.sqrt(d2);
            const fall = 1 - d / r;
            const f = forceMag * fall * fall;
            if (!p) {
              p = { x: hx, y: hy, hx, hy, vx: 0, vy: 0, phase: 'fly', it: intensity[idx] };
              displaced.set(idx, p);
            } else {
              p.it = intensity[idx];
            }
            p.vx += dirX * f;
            p.vy += dirY * f;
            p.phase = 'fly';
          }
        }
      }
    }

    function pickReturnTarget(p, litCells) {
      const R2 = MAX_RETURN_RADIUS * MAX_RETURN_RADIUS;
      let bestD2 = Infinity, bx = p.hx, by = p.hy;
      for (let i = 0; i < litCells.length; i += 2) {
        const lx = litCells[i], ly = litCells[i + 1];
        const dx = lx - p.hx, dy = ly - p.hy;
        const d2 = dx * dx + dy * dy;
        if (d2 > R2) continue;
        const cdx = lx - p.x, cdy = ly - p.y;
        const cd2 = cdx * cdx + cdy * cdy;
        if (cd2 < bestD2) { bestD2 = cd2; bx = lx; by = ly; }
      }
      return [bx, by];
    }

    let raf = 0;
    let t0 = performance.now();
    let litCellPositions = [];

    function frame(now) {
      const t = (now - t0) / 1000;
      const pal = palRef.current;
      const half = SP / 2;

      // ===== Palette cascade tick =====
      const cas = cascadeRef.current;
      let cascadeActive = false;
      let cascadeProgress = 0;
      let casFrom = null, casTo = null;
      let casMode = "cascade";
      if (cas.active) {
        const elapsed = now - cas.start;
        let p = elapsed / cas.dur;
        if (p >= 1) {
          // Cascade complete — swap palette ref + redraw clean cache.
          palRef.current = cas.to;
          cas.active = false;
          rebuildBgCache();
        } else {
          cascadeProgress = p;
          cascadeActive = true;
          casFrom = cas.from;
          casTo = cas.to;
          casMode = cas.mode || "cascade";
          rebuildBgCache({ fromPal: casFrom, toPal: casTo, progress: cascadeProgress, mode: casMode });
        }
      }

      litCellPositions.length = 0;
      const a = WARP_AMP, sp = WARP_SPEED;
      for (let cy = scanY0; cy <= scanY1; cy++) {
        const yBase = cy * SP + half;
        for (let cx = scanX0; cx <= scanX1; cx++) {
          const xBase = cx * SP + half;
          const fdx = Math.sin(xBase * 0.012 + t * 0.9 * sp) * a + Math.cos(yBase * 0.014 + t * 0.6 * sp) * a * 0.65;
          const fdy = Math.cos(yBase * 0.014 + t * 0.85 * sp) * a * 0.95 + Math.sin(xBase * 0.012 + t * 0.55 * sp) * a * 0.60;
          const sx = (xBase + fdx) | 0;
          const sy = (yBase + fdy) | 0;
          const idx = cy * nx + cx;
          let it = 0;
          if (sx >= 0 && sx < cssW && sy >= 0 && sy < cssH) {
            it = maskAlpha[sy * cssW + sx] / 255;
          }
          intensity[idx] = it;
          if (it >= LIT_THRESHOLD) litCellPositions.push(xBase, yBase);
        }
      }

      if (pendingSeg) { applyForceAlongSegment(pendingSeg); pendingSeg = null; }

      for (const [idx, p] of displaced) {
        if (p.phase === 'fly') {
          p.x += p.vx; p.y += p.vy;
          p.vx *= FLY_DAMPING; p.vy *= FLY_DAMPING;
          // Hard-cap drift distance: if dot has flown past MAX_DRIFT, pin it to the ring
          // and kill the outward component of its velocity so it doesn't fight the cap.
          const odx = p.x - p.hx, ody = p.y - p.hy;
          const od2 = odx * odx + ody * ody;
          if (od2 > MAX_DRIFT * MAX_DRIFT) {
            const od = Math.sqrt(od2);
            const ux = odx / od, uy = ody / od;
            p.x = p.hx + ux * MAX_DRIFT;
            p.y = p.hy + uy * MAX_DRIFT;
            const vOut = p.vx * ux + p.vy * uy;
            if (vOut > 0) { p.vx -= vOut * ux; p.vy -= vOut * uy; }
          }
          if (Math.abs(p.vx) + Math.abs(p.vy) < FLY_TO_RETURN_VEL) {
            p.phase = 'return';
            const [tx, ty] = litCellPositions.length ? pickReturnTarget(p, litCellPositions) : [p.hx, p.hy];
            const dx = tx - p.x, dy = ty - p.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
            const kick = Math.min(RETURN_KICK_MAX, d * RETURN_KICK_K);
            p.vx += (dx / d) * kick;
            p.vy += (dy / d) * kick;
          }
        } else {
          const [tx, ty] = litCellPositions.length ? pickReturnTarget(p, litCellPositions) : [p.hx, p.hy];
          const dx = tx - p.x, dy = ty - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < FINAL_GLIDE_DIST && dist > 0.001) {
            // Final approach: constant glide → last couple of mm close promptly
            const ux = dx / dist, uy = dy / dist;
            p.vx = ux * FINAL_GLIDE_SPEED;
            p.vy = uy * FINAL_GLIDE_SPEED;
          } else {
            // Slow, fluid spring with mild under-damping for the bulk of the return
            p.vx = (p.vx + dx * RETURN_SPRING) * RETURN_DAMPING;
            p.vy = (p.vy + dy * RETURN_SPRING) * RETURN_DAMPING;
            // Cap return speed so far-flung dots don't whip back — even pace
            const sp2 = p.vx * p.vx + p.vy * p.vy;
            if (sp2 > MAX_RETURN_SPEED * MAX_RETURN_SPEED) {
              const s = MAX_RETURN_SPEED / Math.sqrt(sp2);
              p.vx *= s; p.vy *= s;
            }
          }
          p.x += p.vx; p.y += p.vy;
          if (dist < SETTLE_DIST) displaced.delete(idx);
        }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Exclusion rect — paint clean bg color over the region. Alpha drives the wipe-in.
      if (excludeRect && excludeRect.alpha > 0) {
        const er = excludeRect;
        ctx.save();
        ctx.globalAlpha = er.alpha;
        ctx.fillStyle = pal.bg;
        const rad = er.r ?? 0;
        if (rad > 0 && ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(er.x, er.y, er.w, er.h, rad);
          ctx.fill();
        } else {
          ctx.fillRect(er.x, er.y, er.w, er.h);
        }
        ctx.restore();
      }

      // Foreground dots — passes vary by cascade mode.
      // mode='cascade' (sand): split by per-column wave front (no alpha).
      // mode='fade' (uniform): toPal full alpha, fromPal at (1-progress) overlay.
      // not cascading: single pass at full alpha.
      const fgPasses = cascadeActive
        ? (casMode === "fade"
            ? [
                { color: casTo.fgDots || casTo.fg, sideAbove: null, alpha: 1 },
                { color: casFrom.fgDots || casFrom.fg, sideAbove: null, alpha: 1 - cascadeProgress },
              ]
            : [
                { color: casTo.fgDots || casTo.fg, sideAbove: true, alpha: 1 },
                { color: casFrom.fgDots || casFrom.fg, sideAbove: false, alpha: 1 },
              ])
        : [{ color: pal.fgDots || pal.fg, sideAbove: null, alpha: 1 }];

      for (const pass of fgPasses) {
        ctx.save();
        if (pass.alpha < 1) ctx.globalAlpha = pass.alpha;
        ctx.fillStyle = pass.color;
        ctx.beginPath();
        for (let cy = scanY0; cy <= scanY1; cy++) {
          for (let cx = scanX0; cx <= scanX1; cx++) {
            const idx = cy * nx + cx;
            const it = intensity[idx];
            if (it < 0.05) continue;
            if (displaced.has(idx)) continue;
            const x = cx * SP + half, y = cy * SP + half;
            if (excludeRect && excludeRect.alpha > 0 && isInsideExclude(x, y)) continue;
            if (pass.sideAbove !== null) {
              const front = getColumnFrontY(cx, cascadeProgress);
              const dotFront = front === Infinity ? Infinity
                            : front === -Infinity ? -Infinity
                            : front + dotJitter[idx];
              const above = y < dotFront;
              if (above !== pass.sideAbove) continue;
            }
            const r = BG_R + (FG_R - BG_R) * it;
            ctx.moveTo(x + r, y);
            ctx.arc(x, y, r, 0, Math.PI * 2);
          }
        }
        for (const p of displaced.values()) {
          const it = p.it ?? 1;
          const r = BG_R + (FG_R - BG_R) * it;
          if (excludeRect && excludeRect.alpha > 0 && isInsideExclude(p.x, p.y)) continue;
          if (pass.sideAbove !== null) {
            const cxHome = Math.max(0, Math.min(nx - 1, Math.floor(p.hx / SP)));
            const cyHome = Math.max(0, Math.min(ny - 1, Math.floor(p.hy / SP)));
            const front = getColumnFrontY(cxHome, cascadeProgress);
            const dotFront = front === Infinity ? Infinity
                          : front === -Infinity ? -Infinity
                          : front + dotJitter[cyHome * nx + cxHome];
            const above = p.y < dotFront;
            if (above !== pass.sideAbove) continue;
          }
          ctx.moveTo(p.x + r, p.y);
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    let lastBg = palette.bg, lastBgDots = palette.bgDots;
    const palWatch = setInterval(() => {
      // Fallback only — if palette ref changed without going through triggerCascade
      // (e.g. initial mount), refresh the bg cache. Cascade-driven swaps are handled inline.
      if (cascadeRef.current.active) return;
      const p = palRef.current;
      if (p.bg !== lastBg || p.bgDots !== lastBgDots) {
        lastBg = p.bg; lastBgDots = p.bgDots;
        rebuildBgCache();
      }
    }, 200);

    function triggerCascade(toPalette, durationMs = 1500, opts = {}) {
      const fromPal = palRef.current;
      // No-op if already at target
      if (fromPal.bg === toPalette.bg && fromPal.fgDots === toPalette.fgDots) return;
      cascadeRef.current = {
        active: true,
        start: performance.now(),
        dur: Math.max(200, durationMs),
        from: fromPal,
        to: toPalette,
        mode: opts.mode || "cascade", // 'cascade' (sand stream) | 'fade' (uniform crossfade)
      };
      lastBg = toPalette.bg; lastBgDots = toPalette.bgDots;
    }

    // ===== External API: set exclusion rect (with explosion impulse), clear it, sweep cursor =====
    function pushParticle(idx, hx, hy, vx, vy, it) {
      let p = displaced.get(idx);
      if (!p) {
        p = { x: hx, y: hy, hx, hy, vx, vy, phase: 'fly', it };
        displaced.set(idx, p);
      } else {
        p.vx += vx; p.vy += vy;
        p.phase = 'fly';
      }
    }

    function setExcludeRect(rect) {
      // rect: { x, y, w, h, r? } | null
      if (!rect) {
        // Springs everything back home; we just animate alpha→0 then null on caller side.
        excludeRect = null;
        return;
      }
      // Explosion impulse: push every cell whose home is inside the rect outward from rect center.
      const half = SP / 2;
      const cxC = rect.x + rect.w / 2;
      const cyC = rect.y + rect.h / 2;
      const cxMin = Math.max(scanX0, Math.floor((rect.x) / SP));
      const cxMax = Math.min(scanX1, Math.floor((rect.x + rect.w) / SP));
      const cyMin = Math.max(scanY0, Math.floor((rect.y) / SP));
      const cyMax = Math.min(scanY1, Math.floor((rect.y + rect.h) / SP));
      for (let cy = cyMin; cy <= cyMax; cy++) {
        for (let cx = cxMin; cx <= cxMax; cx++) {
          const idx = cy * nx + cx;
          const it = intensity[idx];
          if (it < 0.05) continue;
          const hx = cx * SP + half, hy = cy * SP + half;
          const dx = hx - cxC, dy = hy - cyC;
          const d = Math.hypot(dx, dy) || 1;
          // Force scales with how deep inside the rect the cell is (closer to center → more force)
          const halfW = rect.w / 2, halfH = rect.h / 2;
          const depth = 1 - Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
          const speed = (10 + 8 * Math.max(0, depth)) * (0.85 + Math.random() * 0.3);
          pushParticle(idx, hx, hy, (dx / d) * speed, (dy / d) * speed, it);
        }
      }
      excludeRect = { ...rect, alpha: rect.alpha ?? 0 };
    }

    // Stone-drop shockwave — push every lit dot within `radius` outward from `point` with
    // a strong impulse, falling off with distance. Use independently of any exclusion rect.
    function dropImpact(point, radius, peakSpeed = 22) {
      const half = SP / 2;
      const r2 = radius * radius;
      const cxMin = Math.max(scanX0, Math.floor((point.x - radius) / SP));
      const cxMax = Math.min(scanX1, Math.floor((point.x + radius) / SP));
      const cyMin = Math.max(scanY0, Math.floor((point.y - radius) / SP));
      const cyMax = Math.min(scanY1, Math.floor((point.y + radius) / SP));
      for (let cy = cyMin; cy <= cyMax; cy++) {
        for (let cx = cxMin; cx <= cxMax; cx++) {
          const idx = cy * nx + cx;
          const it = intensity[idx];
          if (it < 0.05) continue;
          const hx = cx * SP + half, hy = cy * SP + half;
          const dx = hx - point.x, dy = hy - point.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          const d = Math.sqrt(d2) || 1;
          // Quadratic falloff with distance for a clean shockwave shape
          const t = 1 - d / radius;
          const speed = peakSpeed * t * t * (0.85 + Math.random() * 0.3);
          pushParticle(idx, hx, hy, (dx / d) * speed, (dy / d) * speed, it);
        }
      }
    }

    function setExcludeAlpha(a) {
      if (excludeRect) excludeRect.alpha = a;
    }

    function sweepCursor(from, to, durationMs) {
      // Synthesizes pointermove events along a quadratic path from `from` → `to`.
      // Drives the existing displacement physics for free.
      const start = performance.now();
      const cx = (from.x + to.x) / 2;
      // Bow the path slightly toward the center of the screen for a graceful arc.
      const bowX = cx + (cssW / 2 - cx) * 0.35;
      const bowY = (from.y + to.y) / 2 + (cssH / 2 - (from.y + to.y) / 2) * 0.35;
      function tick() {
        const t = Math.min(1, (performance.now() - start) / durationMs);
        // easeInOutCubic
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const u = 1 - e;
        const px = u * u * from.x + 2 * u * e * bowX + e * e * to.x;
        const py = u * u * from.y + 2 * u * e * bowY + e * e * to.y;
        window.dispatchEvent(new PointerEvent('pointermove', { clientX: px, clientY: py, bubbles: true }));
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    window.GADotField = { setExcludeRect, setExcludeAlpha, sweepCursor, dropImpact, triggerCascade };

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(palWatch);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      if (window.GADotField && window.GADotField.setExcludeRect === setExcludeRect) {
        delete window.GADotField;
      }
    };
  }, []);

  return <canvas ref={canvasRef} className="ga-canvas" aria-hidden="true" />;
}

window.DotField = DotField;
