/*
  Unified dot-field — vanilla JS (converted from React component).
  Identical logic — React wrapper removed, canvas created directly.
  Call: initDotField(palette)
  API: window.GADotField = { triggerCascade, setExcludeRect, setExcludeAlpha, dropImpact, sweepCursor }
*/

let SP = 7;
let FG_R = SP * 0.42;
const BG_R = 1.4;
const WARP_AMP = 32;
const WARP_SPEED = 0.45;
const FORCE_RADIUS = 43;
const FORCE_K = 0.06;
const MAX_DRIFT = 200;
const MAX_RETURN_SPEED = 0.72;
const FINAL_GLIDE_DIST = 4;
const FINAL_GLIDE_SPEED = 0.36;
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
const WORDMARK_LINES = ["GENERAL", "ADMISSION"];

function initDotField(palette, onReady) {
  
  const canvas = document.createElement('canvas');
  canvas.className = 'ga-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);

  const palRef = { current: palette };
  const cascadeRef = { current: { active: false } };

  const ctx = canvas.getContext('2d');

  let cssW = 0, cssH = 0, dpr = 1;
  let nx = 0, ny = 0;
  let intensity = null;
  let colDelay = null;
  let colSpeed = null;
  let dotJitter = null;
  let maskAlpha = null;
  let scanX0 = 0, scanY0 = 0, scanX1 = 0, scanY1 = 0;

  const mask = document.createElement('canvas');
  const bg   = document.createElement('canvas');
  const displaced = new Map();

  let excludeRect = null;
  let bgDirty = false;

  // Intro sequence state
  let loaderPhase = 'fill'; // 'fill' → 'ready'
  let fillProgress = 0;
  const FILL_DURATION = 1.3; // seconds to sweep top→bottom
  let fillTile = null;       // fg-sized dot tile for the pour animation

  function isInsideExclude(px, py) {
    if (!excludeRect) return false;
    const r = excludeRect;
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  function rebuild() {
    cssW = window.innerWidth;
    SP = cssW <= 768 ? 6 : 7;
    FG_R = SP * 0.42;
    cssH = window.innerHeight;
    dpr  = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';

    mask.width = cssW; mask.height = cssH;
    const mctx = mask.getContext('2d');
    mctx.clearRect(0, 0, cssW, cssH);
    mctx.fillStyle = '#fff';
    mctx.textAlign = 'center';
    mctx.textBaseline = 'middle';
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
    colDelay = new Float32Array(nx);
    colSpeed = new Float32Array(nx);
    let s = 0x9E3779B9 ^ (nx * 1009);
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xFFFFFFFF; };
    for (let cx = 0; cx < nx; cx++) {
      const start = rand() * 0.5;
      const span  = 0.5 + rand() * 0.5;
      const end   = Math.min(1.0, start + span);
      colDelay[cx] = start;
      colSpeed[cx] = end - start;
    }
    dotJitter = new Float32Array(nx * ny);
    for (let i = 0; i < nx * ny; i++) dotJitter[i] = (rand() - 0.5) * SP * 1.6;
    displaced.clear();
    // Quick solid-color fill so ctx.drawImage(bg) has valid content on frame 0.
    // Full dot-cache (rebuildBgCache) is deferred to the first rAF via bgDirty flag
    // to avoid blocking first paint with 80K+ canvas arc() calls.
    window.__GADiag && window.__GADiag('rebuild() done — deferring bgCache to rAF');
    bg.width  = canvas.width;
    bg.height = canvas.height;
    const bctx0 = bg.getContext('2d');
    bctx0.setTransform(1, 0, 0, 1, 0, 0);
    bctx0.fillStyle = palRef.current.bg;
    bctx0.fillRect(0, 0, canvas.width, canvas.height);
    bgDirty = true;
    fillTile = makeDotTile(palRef.current.fgDots, FG_R);
  }

  const FRONT_MARGIN = 60;
  function getColumnFrontY(cx, progress) {
    if (!colDelay) return -Infinity;
    const delay = colDelay[cx];
    const speed = colSpeed[cx];
    const local = (progress - delay) / speed;
    if (local <= 0) return -Infinity;
    if (local >= 1) return Infinity;
    return -FRONT_MARGIN + local * (cssH + FRONT_MARGIN * 2);
  }

  // Build a tiny SP×SP tile canvas with one dot centered — used as a repeat pattern.
  // This replaces O(nx*ny) individual arc() calls with a single fillRect(), cutting
  // rebuildBgCache from ~54 seconds down to ~1ms on large retina canvases.
  function makeDotTile(color, r) {
    r = (r !== undefined) ? r : BG_R;
    const t = document.createElement('canvas');
    t.width = SP; t.height = SP;
    const tc = t.getContext('2d');
    tc.fillStyle = color;
    tc.beginPath();
    tc.arc(SP / 2, SP / 2, r, 0, Math.PI * 2);
    tc.fill();
    return t;
  }

  function dotPattern(bctx, tile) {
    const pat = bctx.createPattern(tile, 'repeat');
    if (!pat) return;
    bctx.fillStyle = pat;
    bctx.fillRect(0, 0, cssW, cssH);
  }

  function rebuildBgCache(split) {
    bg.width  = canvas.width;
    bg.height = canvas.height;
    const bctx = bg.getContext('2d');
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (split) {
      const { fromPal, toPal, progress, mode = 'cascade' } = split;

      // Background gradient between palettes
      bctx.fillStyle = fromPal.bg;
      bctx.fillRect(0, 0, cssW, cssH);
      bctx.save();
      bctx.globalAlpha = progress;
      bctx.fillStyle = toPal.bg;
      bctx.fillRect(0, 0, cssW, cssH);
      bctx.restore();

      if (mode === 'fade') {
        // Fade: cross-dissolve both dot layers using globalAlpha + tile patterns
        const tileFrom = makeDotTile(fromPal.bgDots);
        const tileTo   = makeDotTile(toPal.bgDots);
        bctx.save();
        bctx.globalAlpha = 1 - progress;
        dotPattern(bctx, tileFrom);
        bctx.restore();
        bctx.save();
        bctx.globalAlpha = progress;
        dotPattern(bctx, tileTo);
        bctx.restore();
        return;
      }

      // Cascade: wave sweeps top-to-bottom column by column.
      // Use per-column clip rects (~nx rect calls) instead of nx*ny arc calls.
      const tileFrom = makeDotTile(fromPal.bgDots);
      const tileTo   = makeDotTile(toPal.bgDots);

      // Draw fromPal dots everywhere as base
      dotPattern(bctx, tileFrom);

      // Clip to the "above front" columns and overdraw with toPal
      bctx.save();
      bctx.beginPath();
      for (let cx = 0; cx < nx; cx++) {
        const front = getColumnFrontY(cx, progress);
        if (front <= 0) continue;
        // Use mid-column jitter for a slightly organic edge
        const jitter = dotJitter ? (dotJitter[Math.floor(ny / 2) * nx + cx] || 0) : 0;
        const frontY = Math.min(Math.max(0, front + jitter), cssH);
        bctx.rect(cx * SP, 0, SP, frontY);
      }
      bctx.clip();
      bctx.fillStyle = toPal.bg;
      bctx.fillRect(0, 0, cssW, cssH);
      dotPattern(bctx, tileTo);
      bctx.restore();
      return;
    }

    // Static (no transition) — fastest path: solid fill + one tiled pattern
    bctx.fillStyle = palRef.current.bg;
    bctx.fillRect(0, 0, cssW, cssH);
    dotPattern(bctx, makeDotTile(palRef.current.bgDots));
  }

  rebuild();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (document.fonts.check('900 100px "Archivo Black"')) { rebuild(); }
    });
  }

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
  window.addEventListener('pointermove', onMove);

  let resizeT;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(rebuild, 100); }
  window.addEventListener('resize', onResize);

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
          if (intensity[idx] < 0.25) continue;
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
  let loaderDone = false;
  let blastModeActive = false;

  function frame(now) {
    const t = (now - t0) / 1000;
    const pal = palRef.current;
    const half = SP / 2;

    // Palette cascade tick
    const cas = cascadeRef.current;
    let cascadeActive = false;
    let cascadeProgress = 0;
    let casFrom = null, casTo = null;
    let casMode = 'cascade';
    if (cas.active) {
      const elapsed = now - cas.start;
      let p = elapsed / cas.dur;
      if (p >= 1) {
        palRef.current = cas.to;
        cas.active = false;
        rebuildBgCache();
      } else {
        cascadeProgress = p;
        cascadeActive = true;
        casFrom = cas.from;
        casTo = cas.to;
        casMode = cas.mode || 'cascade';
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

    if (loaderPhase !== 'fill' && !blastModeActive && pendingSeg) { applyForceAlongSegment(pendingSeg); }
    pendingSeg = null;

    for (const [idx, p] of displaced) {
      if (p.phase === 'fly') {
        p.x += p.vx; p.y += p.vy;
        p.vx *= FLY_DAMPING; p.vy *= FLY_DAMPING;
        const odx = p.x - p.hx, ody = p.y - p.hy;
        const od2 = odx * odx + ody * ody;
        if (!blastModeActive && od2 > MAX_DRIFT * MAX_DRIFT) {
          const od = Math.sqrt(od2);
          const ux = odx / od, uy = ody / od;
          p.x = p.hx + ux * MAX_DRIFT;
          p.y = p.hy + uy * MAX_DRIFT;
          const vOut = p.vx * ux + p.vy * uy;
          if (vOut > 0) { p.vx -= vOut * ux; p.vy -= vOut * uy; }
        }
        if (!blastModeActive && Math.abs(p.vx) + Math.abs(p.vy) < FLY_TO_RETURN_VEL) {
          p.phase = 'return';
          const [tx, ty] = litCellPositions.length ? pickReturnTarget(p, litCellPositions) : [p.hx, p.hy];
          p.tx = tx; p.ty = ty; // cache — avoids re-searching litCellPositions every frame
          const dx = tx - p.x, dy = ty - p.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const kick = Math.min(RETURN_KICK_MAX, d * RETURN_KICK_K);
          p.vx += (dx / d) * kick;
          p.vy += (dy / d) * kick;
        }
      } else {
        const tx = p.tx !== undefined ? p.tx : p.hx;
        const ty = p.ty !== undefined ? p.ty : p.hy;
        const dx = tx - p.x, dy = ty - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < FINAL_GLIDE_DIST && dist > 0.001) {
          const ux = dx / dist, uy = dy / dist;
          p.vx = ux * FINAL_GLIDE_SPEED;
          p.vy = uy * FINAL_GLIDE_SPEED;
        } else {
          p.vx = (p.vx + dx * RETURN_SPRING) * RETURN_DAMPING;
          p.vy = (p.vy + dy * RETURN_SPRING) * RETURN_DAMPING;
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

    if (bgDirty) { rebuildBgCache(); bgDirty = false; }

    // ── Fill intro: fg-sized dots pour top→bottom, then scatter ─────────────
    if (loaderPhase === 'fill') {
      fillProgress = Math.min(1, t / FILL_DURATION);

      // Solid background
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Pour: fg-dot pattern revealed top-to-bottom
      if (fillProgress > 0 && fillTile) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const pat = ctx.createPattern(fillTile, 'repeat');
        if (pat) {
          ctx.fillStyle = pat;
          ctx.fillRect(0, 0, cssW, fillProgress * cssH);
        }
      }

      if (fillProgress >= 1) {
        loaderPhase = 'ready';
        // Scatter only the wordmark dots — no rogue bg particles
        dropImpact({ x: cssW / 2, y: cssH / 2 }, Math.max(cssW, cssH) * 0.5, 54);
        if (onReady) setTimeout(onReady, 700);
      }
      raf = requestAnimationFrame(frame);
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (excludeRect && excludeRect.alpha > 0) {
      const er = excludeRect;
      ctx.save();
      ctx.globalAlpha = er.alpha;
      ctx.fillStyle = pal.bg;
      const rad = er.r || 0;
      if (rad > 0 && ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(er.x, er.y, er.w, er.h, rad);
        ctx.fill();
      } else {
        ctx.fillRect(er.x, er.y, er.w, er.h);
      }
      ctx.restore();
    }

    const fgPasses = cascadeActive
      ? (casMode === 'fade'
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
          // During blast: skip non-displaced lit cells (warp keeps refreshing them)
          // but still let displaced particles draw as they fly off screen
          if (blastModeActive && !displaced.has(idx)) continue;
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
        const it = p.it || 1;
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

    // Signal loader complete on first drawn frame
    if (!loaderDone) {
      loaderDone = true;
      
      window.GALoader && window.GALoader.advance(100);
    }

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  let lastBg = palette.bg, lastBgDots = palette.bgDots;
  const palWatch = setInterval(() => {
    if (cascadeRef.current.active) return;
    const p = palRef.current;
    if (p.bg !== lastBg || p.bgDots !== lastBgDots) {
      lastBg = p.bg; lastBgDots = p.bgDots;
      rebuildBgCache();
    }
  }, 200);

  function triggerCascade(toPalette, durationMs, opts) {
    durationMs = durationMs || 1500;
    opts = opts || {};
    const fromPal = palRef.current;
    if (fromPal.bg === toPalette.bg && fromPal.fgDots === toPalette.fgDots) return;
    cascadeRef.current = {
      active: true,
      start: performance.now(),
      dur: Math.max(200, durationMs),
      from: fromPal,
      to: toPalette,
      mode: opts.mode || 'cascade',
    };
    lastBg = toPalette.bg; lastBgDots = toPalette.bgDots;
  }

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
    if (!rect) { excludeRect = null; return; }
    const half = SP / 2;
    const cxC = rect.x + rect.w / 2;
    const cyC = rect.y + rect.h / 2;
    const cxMin = Math.max(scanX0, Math.floor(rect.x / SP));
    const cxMax = Math.min(scanX1, Math.floor((rect.x + rect.w) / SP));
    const cyMin = Math.max(scanY0, Math.floor(rect.y / SP));
    const cyMax = Math.min(scanY1, Math.floor((rect.y + rect.h) / SP));
    for (let cy = cyMin; cy <= cyMax; cy++) {
      for (let cx = cxMin; cx <= cxMax; cx++) {
        const idx = cy * nx + cx;
        const it = intensity[idx];
        if (it < 0.05) continue;
        const hx = cx * SP + half, hy = cy * SP + half;
        const dx = hx - cxC, dy = hy - cyC;
        const d = Math.hypot(dx, dy) || 1;
        const halfW = rect.w / 2, halfH = rect.h / 2;
        const depth = 1 - Math.max(Math.abs(dx) / halfW, Math.abs(dy) / halfH);
        const speed = (10 + 8 * Math.max(0, depth)) * (0.85 + Math.random() * 0.3);
        pushParticle(idx, hx, hy, (dx / d) * speed, (dy / d) * speed, it);
      }
    }
    excludeRect = Object.assign({}, rect, { alpha: rect.alpha != null ? rect.alpha : 0 });
  }

  function dropImpact(point, radius, peakSpeed) {
    peakSpeed = peakSpeed || 22;
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
        const t = 1 - d / radius;
        const speed = peakSpeed * t * t * (0.85 + Math.random() * 0.3);
        pushParticle(idx, hx, hy, (dx / d) * speed, (dy / d) * speed, it);
      }
    }
  }

  // Like dropImpact but scatters all dots regardless of intensity — used for the
  // intro landing blast. Respects MAX_DISPLACED cap.
  function dropImpactAll(point, radius, peakSpeed) {
    peakSpeed = peakSpeed || 30;
    const half = SP / 2;
    const r2 = radius * radius;
    const cxMin = Math.max(0, Math.floor((point.x - radius) / SP));
    const cxMax = Math.min(nx - 1, Math.floor((point.x + radius) / SP));
    const cyMin = Math.max(0, Math.floor((point.y - radius) / SP));
    const cyMax = Math.min(ny - 1, Math.floor((point.y + radius) / SP));
    outer: for (let cy = cyMin; cy <= cyMax; cy++) {
      for (let cx = cxMin; cx <= cxMax; cx++) {
        if (displaced.size >= MAX_DISPLACED) break outer;
        const idx = cy * nx + cx;
        const hx = cx * SP + half, hy = cy * SP + half;
        const dx = hx - point.x, dy = hy - point.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2) || 1;
        const frac = 1 - d / radius;
        const speed = peakSpeed * frac * frac * (0.85 + Math.random() * 0.3);
        pushParticle(idx, hx, hy, (dx / d) * speed, (dy / d) * speed, Math.max(intensity[idx], 0.15));
      }
    }
  }

  function setExcludeAlpha(a) {
    if (excludeRect) excludeRect.alpha = a;
  }

  function sweepCursor(from, to, durationMs) {
    const start = performance.now();
    const cx = (from.x + to.x) / 2;
    const bowX = cx + (cssW / 2 - cx) * 0.35;
    const bowY = (from.y + to.y) / 2 + (cssH / 2 - (from.y + to.y) / 2) * 0.35;
    function tick() {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const u = 1 - e;
      const px = u * u * from.x + 2 * u * e * bowX + e * e * to.x;
      const py = u * u * from.y + 2 * u * e * bowY + e * e * to.y;
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: px, clientY: py, bubbles: true }));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // Blast all wordmark dots off screen — stone-in-water radial burst.
  // Bypasses MAX_DRIFT so dots actually leave the viewport.
  // Calls onComplete after ~800ms once dots are clear.
  function blastWordmark(onComplete) {
    blastModeActive = true;
    const cx = cssW / 2, cy = cssH / 2;
    const half = SP / 2;
    for (let y = scanY0; y <= scanY1; y++) {
      for (let x = scanX0; x <= scanX1; x++) {
        const idx = y * nx + x;
        const it = intensity ? intensity[idx] : 0;
        if (it < 0.05) continue;
        const hx = x * SP + half, hy = y * SP + half;
        const dx = hx - cx, dy = hy - cy;
        const d = Math.hypot(dx, dy) || 1;
        // outer dots get a bit more speed so they all clear the viewport
        const t = Math.max(0.35, 1 - d / (Math.max(cssW, cssH) * 0.6));
        const speed = 130 * t * (0.75 + Math.random() * 0.5);
        pushParticle(idx, hx, hy, (dx / d) * speed, (dy / d) * speed, it);
      }
    }
    if (onComplete) setTimeout(onComplete, 820);
  }

  // Reset the canvas to replay the fill→impact intro sequence.
  // Called after the chat closes to bring the wordmark back.
  function recallDots() {
    blastModeActive = false;
    displaced.clear();
    loaderPhase = 'fill';
    fillProgress = 0;
    t0 = performance.now();
  }

  window.GADotField = { setExcludeRect, setExcludeAlpha, sweepCursor, dropImpact, triggerCascade, blastWordmark, recallDots };
}

// Lightweight standalone mini wordmark canvas — used as a floating logo in the chat overlay.
// Returns { destroy } so the caller can clean up when done.
function initMiniWordmark(canvas, palette) {
  const MSP = 4, MFG_R = MSP * 0.42, MBG_R = 0.75;
  const MWARP_AMP = 10, MWARP_SPEED = 0.45;
  const LINES = ['GENERAL', 'ADMISSION'];
  const ctx = canvas.getContext('2d');
  let cssW = 0, cssH = 0, dpr = 1;
  let nx = 0, ny = 0;
  let intensity = null, maskAlpha = null;
  let scanX0 = 0, scanY0 = 0, scanX1 = 0, scanY1 = 0;
  const displaced = new Map();
  let raf = 0;
  const t0 = performance.now();
  let alive = true;
  let pal = palette;

  function rebuild() {
    cssW = canvas.offsetWidth || 280;
    cssH = canvas.offsetHeight || 72;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const mask = document.createElement('canvas');
    mask.width = cssW; mask.height = cssH;
    const mctx = mask.getContext('2d');
    mctx.clearRect(0, 0, cssW, cssH);
    mctx.fillStyle = '#fff';
    mctx.textAlign = 'center';
    mctx.textBaseline = 'middle';
    const VPAD = MWARP_AMP + MSP + 2; // vertical padding so warp never clips
    let fs = 40;
    mctx.font = `900 ${fs}px "Archivo Black", system-ui, sans-serif`;
    fs = Math.floor((cssW * 0.86 / mctx.measureText('ADMISSION').width) * fs);
    // Also clamp so two lines + padding fit vertically
    const maxFsByHeight = Math.floor((cssH - VPAD * 2) / (2 * 0.98));
    fs = Math.min(fs, maxFsByHeight);
    mctx.font = `900 ${fs}px "Archivo Black", system-ui, sans-serif`;
    const lh = fs * 0.97;
    const totalH = lh * LINES.length;
    const y0 = (cssH - totalH) / 2 + lh * 0.5;
    LINES.forEach((l, i) => mctx.fillText(l, cssW / 2, y0 + i * lh));

    const data = mctx.getImageData(0, 0, cssW, cssH).data;
    maskAlpha = new Uint8Array(cssW * cssH);
    let minX = cssW, minY = cssH, maxX = 0, maxY = 0;
    for (let i = 0, j = 3; i < maskAlpha.length; i++, j += 4) {
      const a = data[j]; maskAlpha[i] = a;
      if (a > 128) {
        const px = i % cssW, py = (i / cssW) | 0;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
    nx = Math.floor(cssW / MSP); ny = Math.floor(cssH / MSP);
    const mg = MWARP_AMP + MSP;
    scanX0 = Math.max(0, Math.floor((minX - mg) / MSP));
    scanY0 = Math.max(0, Math.floor((minY - mg) / MSP));
    scanX1 = Math.min(nx - 1, Math.ceil((maxX + mg) / MSP));
    scanY1 = Math.min(ny - 1, Math.ceil((maxY + mg) / MSP));
    intensity = new Float32Array(nx * ny);
    displaced.clear();
  }

  rebuild();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { if (alive) rebuild(); });
  }

  canvas.addEventListener('pointermove', function (e) {
    if (!intensity) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const half = MSP / 2, r = 22, r2 = r * r;
    for (let cy = scanY0; cy <= scanY1; cy++) {
      for (let cx = scanX0; cx <= scanX1; cx++) {
        const idx = cy * nx + cx;
        if ((intensity[idx] || 0) < 0.05) continue;
        const hx = cx * MSP + half, hy = cy * MSP + half;
        const dx = hx - mx, dy = hy - my;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2) || 1;
        const spd = 9 * (1 - d / r);
        let p = displaced.get(idx);
        if (!p) { p = { x: hx, y: hy, hx, hy, vx: 0, vy: 0, phase: 'fly', it: intensity[idx] }; displaced.set(idx, p); }
        p.vx += (dx / d) * spd; p.vy += (dy / d) * spd; p.phase = 'fly';
      }
    }
  });

  function frame(now) {
    if (!alive || !canvas.isConnected) { cancelAnimationFrame(raf); return; }
    const t = (now - t0) / 1000;
    const half = MSP / 2;

    for (let cy = scanY0; cy <= scanY1; cy++) {
      const yb = cy * MSP + half;
      for (let cx = scanX0; cx <= scanX1; cx++) {
        const xb = cx * MSP + half;
        const fdx = Math.sin(xb * 0.028 + t * 0.9 * MWARP_SPEED) * MWARP_AMP + Math.cos(yb * 0.032 + t * 0.6 * MWARP_SPEED) * MWARP_AMP * 0.65;
        const fdy = Math.cos(yb * 0.032 + t * 0.85 * MWARP_SPEED) * MWARP_AMP * 0.95 + Math.sin(xb * 0.028 + t * 0.55 * MWARP_SPEED) * MWARP_AMP * 0.6;
        const sx = (xb + fdx) | 0, sy = (yb + fdy) | 0;
        const idx = cy * nx + cx;
        intensity[idx] = (sx >= 0 && sx < cssW && sy >= 0 && sy < cssH) ? maskAlpha[sy * cssW + sx] / 255 : 0;
      }
    }

    for (const [idx, p] of displaced) {
      if (p.phase === 'fly') {
        p.x += p.vx; p.y += p.vy; p.vx *= 0.92; p.vy *= 0.92;
        if (Math.abs(p.vx) + Math.abs(p.vy) < 0.4) {
          p.phase = 'return';
          const dx = p.hx - p.x, dy = p.hy - p.y;
          const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * 0.5; p.vy += (dy / d) * 0.5;
        }
      } else {
        const dx = p.hx - p.x, dy = p.hy - p.y;
        p.vx = (p.vx + dx * 0.012) * 0.95;
        p.vy = (p.vy + dy * 0.012) * 0.95;
        p.x += p.vx; p.y += p.vy;
        if (Math.hypot(p.x - p.hx, p.y - p.hy) < 0.5) displaced.delete(idx);
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pal.fgDots;
    ctx.beginPath();
    for (let cy = scanY0; cy <= scanY1; cy++) {
      for (let cx = scanX0; cx <= scanX1; cx++) {
        const idx = cy * nx + cx;
        const it = intensity[idx];
        if (it < 0.05 || displaced.has(idx)) continue;
        const x = cx * MSP + half, y = cy * MSP + half;
        const r = MBG_R + (MFG_R - MBG_R) * it;
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    for (const p of displaced.values()) {
      const r = MBG_R + (MFG_R - MBG_R) * (p.it || 1);
      ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    destroy: function () { alive = false; cancelAnimationFrame(raf); },
    setPalette: function (p) { pal = p; },
  };
}
