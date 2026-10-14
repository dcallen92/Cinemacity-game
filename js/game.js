/* DON'T LOSE YOUR HEAD — game engine
   Inhaus Digital × Cinemacity, Halloween 2026. */
(function () {
  'use strict';
  const CFG = window.DLYH_CONFIG, DATA = window.DLYH_LEVELS;
  const W = DATA.W, H = DATA.H, LEVELS = DATA.levels;
  const $ = id => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const QA = { noScare: qs.get('scare') === 'off', startLevel: Math.max(0, Math.min(LEVELS.length - 1, (parseInt(qs.get('level')) || 1) - 1)) };
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const now = () => performance.now();

  /* ---------- analytics ---------- */
  const utm = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'].forEach(k => { if (qs.get(k)) utm[k] = qs.get(k); });
  function track(ev, params) {
    const p = Object.assign({}, utm, params || {});
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: ev }, p)); } catch (e) {}
    try { if (window.gtag) gtag('event', ev, p); } catch (e) {}
    try { if (window.fbq) fbq('trackCustom', ev, p); } catch (e) {}
  }

  /* ---------- screens ---------- */
  const screens = ['s-landing', 's-howto', 's-card', 's-game', 's-lose', 's-win', 's-board', 's-form', 's-thanks'];
  function show(id) {
    screens.forEach(s => $(s).classList.toggle('active', s === id));
    document.body.classList.toggle('playing', id === 's-game' && G.state === 'play');
  }

  /* ---------- draw-closed state ---------- */
  const closed = Date.now() > new Date(CFG.closesAt).getTime();
  if (closed) document.body.classList.add('closed');

  /* ---------- audio ---------- */
  const audio = {
    ctx: null, buf: {}, ok: false,
    async preload() {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      this.master = this.ctx.createGain(); this.master.gain.value = 1;
      this.meter = this.ctx.createAnalyser(); this.meter.fftSize = 512;
      this.master.connect(this.meter).connect(this.ctx.destination);
      const list = Object.assign({}, CFG.sfx);
      CFG.screams.forEach((s, i) => list['scream' + i] = s);
      await Promise.all(Object.entries(list).map(async ([k, url]) => {
        try {
          const r = await fetch(url); const ab = await r.arrayBuffer();
          const b = await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));
          const lv = CFG.levels || {};
          normalize(b, k.startsWith('scream') ? (lv.scream || 0.89) : (lv[k] || 0.8));
          this.buf[k] = b;
        } catch (e) { console.warn('audio load failed', k, e); }
      }));
      this.ok = Object.keys(this.buf).length > 0;
      // HTMLAudio fallback in case the AudioContext never leaves 'suspended' (some Safari builds)
      try { this.html = new Audio(CFG.screams[0]); this.html.preload = 'auto'; this.html.volume = 1; } catch (e) {}
    },
    silentEl: null,
    keepAlive() { // iOS: a playing <audio> element switches the session to playback, so Web Audio ignores the ringer switch
      try {
        if (!this.silentEl) {
          const sr = 8000, n = sr / 10, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
          const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
          str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
          v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
          const el = document.createElement('audio'); el.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })); el.loop = true; el.setAttribute('playsinline', ''); el.volume = 0.01;
          this.silentEl = el;
        }
        if (this.silentEl.paused) this.silentEl.play().catch(() => {});
      } catch (e) {}
    },
    unlock() {
      if (!this.ctx) return;
      this.keepAlive();
      try { this.ctx.resume(); } catch (e) {}
      try { const s = this.ctx.createBufferSource(); s.buffer = this.ctx.createBuffer(1, 1, 22050); s.connect(this.master); s.start(0); } catch (e) {}
      if (this.html && this.ctx.state !== 'running') { try { this.html.muted = true; this.html.play().then(() => { this.html.pause(); this.html.currentTime = 0; this.html.muted = false; }).catch(() => {}); } catch (e) {} }
    },
    amb: null,
    startAmbience() {
      if (!this.ctx) return;
      this.unlock(); // always try to resume: the first call may have happened before any gesture
      if (this.amb || !$('opt-sound').checked || !this.buf.ambience) return;
      const start = () => {
        if (this.amb) return;
        this.amb = this.play('ambience', { loop: true, gain: 0, bedEq: true });
        if (this.amb) this.setAmbience(ambLevel(), 1.2);
      };
      if (this.ctx.state === 'running') start();
      else { const once = () => { this.ctx.removeEventListener('statechange', once); if (this.ctx.state === 'running') start(); }; this.ctx.addEventListener('statechange', once); }
    },
    level() { if (!this.meter) return -1; const d = new Float32Array(this.meter.fftSize); this.meter.getFloatTimeDomainData(d); let e = 0; for (let i = 0; i < d.length; i++) e += d[i] * d[i]; return Math.sqrt(e / d.length); },
    setAmbience(g, tc) { if (this.amb) this.amb.gain.gain.setTargetAtTime(g, this.ctx.currentTime, tc || 0.4); },
    stopAmbience(fade) {
      if (!this.amb) return; const a = this.amb; this.amb = null;
      a.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade || 0.6); setTimeout(() => a.stop(), (fade || 0.6) * 4000);
    },
    play(name, opt) {
      opt = opt || {};
      if (!this.ctx || !this.buf[name]) return null;
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
      s.buffer = this.buf[name]; s.loop = !!opt.loop; g.gain.value = opt.gain == null ? 1 : opt.gain;
      if (opt.bedEq) { // ambience bed: drop the inaudible rumble, lift the mids so phone speakers can carry it
        const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 80; hp.Q.value = 0.7;
        const sh = this.ctx.createBiquadFilter(); sh.type = 'lowshelf'; sh.frequency.value = 160; sh.gain.value = -4;
        const pk = this.ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 600; pk.Q.value = 0.7; pk.gain.value = 7;
        s.connect(hp).connect(sh).connect(pk).connect(g).connect(this.master);
      } else s.connect(g).connect(this.master);
      s.start(0);
      return { src: s, gain: g, stop() { try { s.stop(0); } catch (e) {} } };
    },
    scream(i) {
      if (this.ctx && this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) {} }
      let h = null;
      if (this.ctx && this.ctx.state === 'running') h = this.play('scream' + i, { gain: 1 });
      if (!h && this.html) { try { this.html.currentTime = 0; this.html.play().catch(() => {}); h = true; } catch (e) {} }
      if (!h) synthScream(this.ctx); // last resort
    }
  };
  const ambLevel = () => (CFG.ambienceGain || 0.22) * (matchMedia('(pointer:coarse)').matches ? (CFG.ambienceMobileBoost || 1.6) : 1);
  function normalize(b, peak) {
    let m = 0;
    for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); }
    if (!m) return; const k = peak / m;
    for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; }
  }
  function synthScream(ctx) {
    if (!ctx) return;
    try {
      const t = ctx.currentTime, dur = 1.4, buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const n = ctx.createBufferSource(); n.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
      bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(2600, t + .25); bp.frequency.exponentialRampToValueAtTime(1400, t + dur);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(1100, t + .2); o.frequency.exponentialRampToValueAtTime(700, t + dur);
      const og = ctx.createGain(); og.gain.value = .25; const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.9, t + .02); g.gain.exponentialRampToValueAtTime(.01, t + dur);
      n.connect(bp).connect(g); o.connect(og).connect(g); g.connect(ctx.destination); n.start(t); o.start(t); n.stop(t + dur); o.stop(t + dur);
    } catch (e) {}
  }

  /* ---------- images ---------- */
  const img = { scares: [], sprites: {}, shareBg: null };
  function load(src) {
    // decode() can stall in a background tab, so never wait on it for more than 1.5s
    return new Promise(res => {
      const i = new Image();
      i.onload = () => { const d = (i.decode && !document.hidden) ? i.decode().catch(() => {}) : Promise.resolve(); Promise.race([d, new Promise(r => setTimeout(r, 1500))]).then(() => res(i)); };
      i.onerror = () => res(i); i.src = src;
    });
  }
  const isWide = () => window.innerWidth > window.innerHeight;
  const scareSrc = (i) => (isWide() && CFG.scares[i].wide) ? CFG.scares[i].wide : CFG.scares[i].src;
  async function preloadImages() {
    const keys = Object.keys(CFG.sprites);
    const all = await Promise.all([...CFG.scares.map((s, i) => load(scareSrc(i))), ...keys.map(k => load(CFG.sprites[k])), load(CFG.shareBg)]);
    img.scares = all.slice(0, CFG.scares.length);
    // warm the other orientation's scares in the background so a rotate mid-game still lands instantly
    setTimeout(() => CFG.scares.forEach(s => { if (s.wide) { load(s.src); load(s.wide); } }), 2500);
    keys.forEach((k, i) => img.sprites[k] = all[CFG.scares.length + i]);
    img.shareBg = all[all.length - 1];
    applyPlates();
    window.addEventListener('resize', applyPlates);
  }

  // Landing + end-screen plates: portrait on phones, 16:9 on desktop / landscape
  let plateMode = null;
  function applyPlates() {
    const wide = isWide(); if (plateMode === wide) return; plateMode = wide;
    const lb = (wide && CFG.landingBgWide) || CFG.landingBg, kv = (wide && CFG.winKvWide) || CFG.winKv;
    if (lb) load(lb).then(i => { if (i.width) $('landing-bg').style.backgroundImage = 'url(' + lb + ')'; });
    if (kv) load(kv).then(i => { if (i.width) ['s-win', 's-form', 's-thanks'].forEach(id => $(id).style.setProperty('--kv', 'url(' + new URL(kv, location.href).href + ')')); });
  }

  /* ---------- counter ---------- */
  const counter = {
    local() { let v = parseInt(localStorage.getItem('dlyh_count')); if (!v) v = CFG.counterSeed; return v; },
    async bump() {
      let v = this.local() + 1;
      try { localStorage.setItem('dlyh_count', v); } catch (e) {}
      if (CFG.apiBase) {
        try { const r = await fetch(CFG.apiBase + '/scare', { method: 'POST' }); const j = await r.json(); if (j && j.count) v = j.count; } catch (e) {}
      }
      return v;
    }
  };
  const fmt = n => n.toLocaleString('en-US');

  /* ---------- geometry ---------- */
  function cumLens(p) { const o = [0]; for (let i = 1; i < p.length; i++) o.push(o[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])); return o; }
  function nearest(p, cum, x, y) {
    let best = 1e9, along = 0, seg = 0;
    for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1][0], ay = p[i - 1][1], dx = p[i][0] - ax, dy = p[i][1] - ay, l2 = dx * dx + dy * dy;
      let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
      if (d < best) { best = d; along = cum[i - 1] + t * Math.sqrt(l2); seg = i; }
    }
    return { d: best, f: along / cum[cum.length - 1], seg };
  }
  function pointAt(p, cum, f) { // point + unit tangent at fraction f
    const L = f * cum[cum.length - 1];
    for (let i = 1; i < p.length; i++) if (cum[i] >= L) {
      const t = (L - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1], l = Math.hypot(dx, dy) || 1;
      return { x: p[i - 1][0] + t * dx, y: p[i - 1][1] + t * dy, tx: dx / l, ty: dy / l };
    }
    const n = p.length - 1; return { x: p[n][0], y: p[n][1], tx: 0, ty: 1 };
  }
  const segDist = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)); };

  /* ---------- game state ---------- */
  const board = $('board'), ctx = board.getContext('2d');
  const G = {
    L: 0, lv: null, cum: [], w: 0, state: 'idle', t0: 0, progress: 0, cur: null, last: null,
    rot: 0, rotT: 0, lastMoveT: 0, screen: null, runMs: 0, finalMs: 0, hz: [], loops: {}, creaked: [], trail: [], lastScare: -1, bestLevel: 1, won: false, raf: 0, dpr: 1, scale: 1
  };

  function fit() {
    const wrap = $('board-wrap'), r = wrap.getBoundingClientRect();
    let h = r.height, w = h * 0.75; if (w > r.width) { w = r.width; h = w / 0.75; }
    G.dpr = Math.min(2, window.devicePixelRatio || 1);
    board.style.width = w + 'px'; board.style.height = h + 'px';
    board.width = Math.round(w * G.dpr); board.height = Math.round(h * G.dpr);
    G.scale = board.width / W;
  }
  window.addEventListener('resize', () => { if ($('s-game').classList.contains('active')) { fit(); draw(); } });

  function setLevel(i) {
    G.L = i; G.lv = LEVELS[i]; G.cum = cumLens(G.lv.pts); G.w = G.lv.widthPct / 100 * W;
    G.state = 'idle'; G.progress = 0; G.cur = null; document.body.classList.remove('playing'); G.last = null; G.rot = 0; G.rotT = 0; G.screen = null; G.creaked = []; G.trail = [];
    stopLoops();
    G.hz = (G.lv.hazards || []).map(h => Object.assign({}, h, { active: false }));
    $('hud-level').textContent = 'LEVEL 0' + G.lv.id + ' · ' + G.lv.name.toUpperCase();
    setLevelPlate();
    $('hud-timer').textContent = G.lv.timer ? G.lv.timer.toFixed(1) : '';
    $('hud-timer').classList.remove('low');
    $('progress-fill').style.width = '0%';
    $('hud-hint').textContent = (matchMedia('(pointer:coarse)').matches ? 'Press just below the light to start · the dot floats above your finger' : 'Move your cursor onto the light to start');
    fit(); draw();
  }
  function setLevelPlate() {
    const pl = (CFG.levelPlates || [])[G.L]; const el = $('level-plate'); if (!pl) { el.classList.remove('on'); return; }
    const src = (isWide() && pl.wide) || pl.src;
    el.classList.remove('on');
    load(src).then(i => { if (i.width && G.lv === LEVELS[G.L]) { el.style.backgroundImage = 'url(' + src + ')'; el.classList.add('on'); } });
  }
  function stopLoops() { for (const k in G.loops) { if (G.loops[k]) G.loops[k].stop(); } G.loops = {}; }

  function corridorWidth(t) {
    const b = G.lv.breathe; if (!b || G.state !== 'play') return G.w;
    return G.w * (1 + b.amp * Math.sin((t - G.t0) / b.period * Math.PI * 2));
  }

  /* ---------- hazards ---------- */
  function doorState(h, t) {
    const a = pointAt(G.lv.pts, G.cum, h.at); const nx = -a.ty, ny = a.tx; // left normal
    const hinge = [a.x + nx * (G.w / 2 + 3), a.y + ny * (G.w / 2 + 3)];
    const len = G.w * (h.lengthPct || 0.85) + 3;
    const ph = G.state === 'play' ? (t - G.t0) / h.period : 0.5;
    const sw = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2), dw = h.dwell || 0;
    const u = Math.max(0, Math.min(1, (sw - dw) / (1 - 2 * dw)));
    const phi = Math.PI / 2 * u; // 0 = open (flush with the wall), 90° = closed across the corridor
    const dx = Math.cos(phi) * (-a.tx) + Math.sin(phi) * (-nx), dy = Math.cos(phi) * (-a.ty) + Math.sin(phi) * (-ny);
    return { hinge, tip: [hinge[0] + dx * len, hinge[1] + dy * len], ang: Math.atan2(dy, dx), len };
  }
  function tickHazards(t) {
    G.hz.forEach(h => {
      if (h.type === 'scuttle') {
        if (!h.next) h.next = t + rand(h.minGap, h.maxGap);
        if (!h.active && t >= h.next) {
          const f = rand(0.08, 0.92), a = pointAt(G.lv.pts, G.cum, f), nx = -a.ty, ny = a.tx, dir = Math.random() < .5 ? 1 : -1;
          h.active = true; h.dir = dir; h.x0 = a.x + nx * 70 * dir; h.y0 = a.y + ny * 70 * dir; h.vx = -nx * dir; h.vy = -ny * dir; h.start = t;
        }
        if (h.active) {
          const d = (t - h.start) / 1000 * h.speed; h.x = h.x0 + h.vx * d; h.y = h.y0 + h.vy * d;
          if (d > 140) { h.active = false; h.next = t + rand(h.minGap, h.maxGap); }
        }
      }
    });
  }
  function hazardHit(x, y, t) {
    for (const h of G.hz) {
      if (h.type === 'door') { const s = doorState(h, t); if (segDist(x, y, s.hinge[0], s.hinge[1], s.tip[0], s.tip[1]) < 2.5) return 'door'; }
      if (h.type === 'scuttle' && h.active && Math.hypot(x - h.x, y - h.y) < 9) return 'scuttle';
    }
    return null;
  }
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---------- drawing ---------- */
  function draw(t) {
    t = t || now();
    const s = G.scale, p = G.lv.pts, w = corridorWidth(t);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.fillStyle = '#07241B'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    
    ctx.translate(W / 2, H / 2); ctx.rotate(G.rot); ctx.translate(-W / 2, -H / 2);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const bo = G.lv.blackout, dark = !!(bo && G.state === 'play' && ((t - G.t0) % bo.every) > bo.every - bo.dark);
    G.dark = dark;
    if (!dark) {
      // glow
      ctx.strokeStyle = 'rgba(237,230,214,.10)'; ctx.lineWidth = w + 10; path(p); ctx.stroke();
      ctx.strokeStyle = '#EDE6D6'; ctx.lineWidth = w; path(p); ctx.stroke();
    }
    // start / end
    const st = p[0], en = p[p.length - 1], pulse = G.state === 'idle' ? 0.5 + 0.5 * Math.sin(t / 300) : 0;
    ctx.fillStyle = `rgba(255,255,255,${0.35 + pulse * 0.65})`; ctx.beginPath(); ctx.arc(st[0], st[1], Math.max(3, w / 2 - 1.5), 0, 7); ctx.fill();
    if (G.state === 'idle') { ctx.strokeStyle = `rgba(255,255,255,${0.6 * pulse})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(st[0], st[1], w / 2 + 4 + pulse * 4, 0, 7); ctx.stroke(); }
    ctx.fillStyle = '#FD4334'; ctx.beginPath(); ctx.arc(en[0], en[1], Math.max(3, w / 2 - 1.5), 0, 7); ctx.fill();
    // idle: show the player where the cursor will start
    if (G.state === 'idle') {
      ctx.fillStyle = '#FD4334'; ctx.beginPath(); ctx.arc(st[0], st[1], 3, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(237,230,214,.85)'; ctx.font = '500 7px "IBM Plex Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText('START HERE', st[0], st[1] - w / 2 - 9);
    }
    // hazards
    G.hz.forEach(h => {
      if (h.type === 'door' && !dark) {
        const d = doorState(h, t), spr = img.sprites.door;
        ctx.save(); ctx.translate(d.hinge[0], d.hinge[1]); ctx.rotate(d.ang - Math.PI / 2);
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(-4, 0, 8, d.len);
        if (spr && spr.width) ctx.drawImage(spr, -8, -1, 16, d.len + 2); else { ctx.fillStyle = '#1C1C1C'; ctx.fillRect(-2.5, 0, 5, d.len); }
        ctx.restore();
        ctx.fillStyle = '#c9c4ba'; ctx.beginPath(); ctx.arc(d.hinge[0], d.hinge[1], 1.6, 0, 7); ctx.fill();
      }
      if (h.type === 'scuttle' && h.active) {
        const spr = img.sprites.scuttle; ctx.save(); ctx.translate(h.x, h.y);
        const ang = Math.atan2(h.vy, h.vx); ctx.rotate(ang);
        if (spr && spr.width) ctx.drawImage(spr, -24, -16, 48, 32); else { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 10, 0, 0, 7); ctx.fill(); }
        ctx.restore();
      }
    });
    // trail the player has drawn so far
    if (G.trail.length > 1) {
      ctx.strokeStyle = 'rgba(253,67,52,.85)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(G.trail[0][0], G.trail[0][1]); for (let i = 1; i < G.trail.length; i++) ctx.lineTo(G.trail[i][0], G.trail[i][1]); ctx.stroke();
    }
    // finger tether (touch): faint ring where the finger is, line up to the floating cursor
    if (G.cur && G.touch) {
      ctx.strokeStyle = 'rgba(237,230,214,.35)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(G.touch[0], G.touch[1]); ctx.lineTo(G.cur[0], G.cur[1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(G.touch[0], G.touch[1], 7, 0, 7); ctx.stroke();
    }
    // cursor
    if (G.cur) {
      ctx.fillStyle = 'rgba(253,67,52,.3)'; ctx.beginPath(); ctx.arc(G.cur[0], G.cur[1], 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#FD4334'; ctx.beginPath(); ctx.arc(G.cur[0], G.cur[1], 2.5, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  function path(p) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); }

  /* ---------- loop ---------- */
  function loop() {
    const t = now();
    if (G.state === 'play') {
      if (G.lv.rotate) {
        const dt = Math.min(50, t - (G.prevT || t)); G.prevT = t;
        if (t - G.lastMoveT < 120) G.rotT += dt; // the board only turns while the player moves
        G.rot = Math.min(1, G.rotT / ((G.lv.rotate.seconds || 30) * 1000)) * G.lv.rotate.degrees * Math.PI / 180;
        if (G.screen) { const pt = toBoard(G.screen); if (Math.hypot(pt[0] - G.cur[0], pt[1] - G.cur[1]) > 0.05) { processPoint(pt, t); if (G.state !== 'play') return; } }
      }
      tickHazards(t);
      if (G.lv.timer) {
        const r = G.lv.timer - (t - G.t0) / 1000;
        $('hud-timer').textContent = Math.max(0, r).toFixed(1); $('hud-timer').classList.toggle('low', r < 5);
        if (r <= 0) { lose('time'); return; }
      }
      if (G.cur && hazardHit(G.cur[0], G.cur[1], t)) { lose('hazard'); return; }
      if (G.cur) { const n = nearest(G.lv.pts, G.cum, G.cur[0], G.cur[1]); if (n.d > corridorWidth(t) / 2 - 2.5) { lose('wall'); return; } }
      if (G.lv.whisper && G.loops.whisper) {
        const g = G.progress > 0.9 ? 0 : 0.05 + 0.95 * G.progress * G.progress;
        G.loops.whisper.gain.gain.setTargetAtTime(g, audio.ctx.currentTime, g === 0 ? 0.001 : 0.1);
      }
    }
    draw(t);
    G.raf = requestAnimationFrame(loop);
  }

  /* ---------- input ---------- */
  const game = $('s-game');
  function toBoard(ev) {
    const r = board.getBoundingClientRect(); let cy = ev.clientY;
    if (ev.pointerType === 'touch' && $('opt-offset').checked) cy -= CFG.fingerOffsetMm * 96 / 25.4;
    let x = (ev.clientX - r.left) / r.width * W, y = (cy - r.top) / r.height * H;
    if (G.rot) { const cx = W / 2, cyy = H / 2, c = Math.cos(-G.rot), s = Math.sin(-G.rot), dx = x - cx, dy = y - cyy; x = cx + dx * c - dy * s; y = cyy + dx * s + dy * c; }
    return [x, y];
  }
  function onMove(ev) {
    if (!game.classList.contains('active') || G.state === 'dead' || G.state === 'clear') return;
    ev.preventDefault();
    if (ev.pointerType === 'touch' && ev.type === 'pointermove' && !ev.buttons && !ev.pressure) return;
    const pt = toBoard(ev), t = now(), p = G.lv.pts;
    G.screen = { clientX: ev.clientX, clientY: ev.clientY, pointerType: ev.pointerType };
    G.touch = ev.pointerType === 'touch' && $('opt-offset').checked ? toBoard({ clientX: ev.clientX, clientY: ev.clientY, pointerType: 'mouse' }) : null;
    if (G.state === 'idle') {
      G.cur = pt;
      if (Math.hypot(pt[0] - p[0][0], pt[1] - p[0][1]) < G.w / 2) startLevel(t);
      return;
    }
    G.lastMoveT = t;
    processPoint(pt, t);
  }
  function processPoint(pt, t) {
    const p = G.lv.pts;
    // swept collision between last and current position
    const CURSOR_R = 2.5; // the red dot's own radius: touching the wall with its edge counts
    const a = G.last || pt, steps = Math.max(1, Math.ceil(Math.hypot(pt[0] - a[0], pt[1] - a[1]) / 1.5)), w2 = corridorWidth(t) / 2 - CURSOR_R;
    for (let i = 1; i <= steps; i++) {
      const x = a[0] + (pt[0] - a[0]) * i / steps, y = a[1] + (pt[1] - a[1]) * i / steps;
      if (x < 0 || y < 0 || x > W || y > H) { G.cur = [x, y]; lose('left'); return; }
      const n = nearest(p, G.cum, x, y);
      if (n.d > w2) { G.cur = [x, y]; lose('wall'); return; }
      if (hazardHit(x, y, t)) { G.cur = [x, y]; lose('hazard'); return; }
      if (n.f > G.progress && n.f - G.progress < 0.2) G.progress = n.f;
    }
    G.cur = pt; G.last = pt;
    const tl = G.trail[G.trail.length - 1];
    if (!tl || Math.hypot(pt[0] - tl[0], pt[1] - tl[1]) > 0.8) G.trail.push(pt);
    $('progress-fill').style.width = (G.progress * 100) + '%';
    if (G.lv.cornerCreak) for (let i = 1; i < p.length - 1; i++) if (!G.creaked[i] && G.progress * G.cum[G.cum.length - 1] >= G.cum[i]) { G.creaked[i] = true; audio.play('creak', { gain: 0.5 }); }
    const e = p[p.length - 1];
    if (G.progress > 0.93 && Math.hypot(pt[0] - e[0], pt[1] - e[1]) < G.w / 2) clearLevel();
  }
  function onUp(ev) { if (ev.pointerType === 'touch' && G.state === 'play') lose('lift'); }
  function onLeave(ev) { if (G.state === 'play' && ev.pointerType !== 'touch') lose('left'); }
  game.addEventListener('pointermove', onMove, { passive: false });
  game.addEventListener('pointerdown', onMove, { passive: false });
  game.addEventListener('pointerup', onUp); game.addEventListener('pointercancel', onUp);
  game.addEventListener('pointerleave', onLeave);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play') lose('left'); });

  function startLevel(t) {
    G.state = 'play'; G.t0 = t; G.prevT = t; G.lastMoveT = t; G.last = G.cur; G.progress = 0; G.trail = [G.cur];
    document.body.classList.add('playing');
    $('hud-hint').textContent = "Don't touch the walls";
    if (G.lv.hazards.some(h => h.type === 'door')) G.loops.door = audio.play('door', { loop: true, gain: 0.35 });
    if (G.lv.whisper) G.loops.whisper = audio.play('whisper', { loop: true, gain: 0.05 });
    track('level_start_' + G.lv.id, { level: G.lv.id });
  }
  function clearLevel() {
    G.state = 'clear'; stopLoops(); G.bestLevel = Math.max(G.bestLevel, G.lv.id);
    G.runMs += now() - G.t0;
    audio.play('clear', { gain: 0.9 });
    track('level_clear_' + G.lv.id, { level: G.lv.id });
    if (G.L < LEVELS.length - 1) {
      $('card-label').textContent = 'Level cleared'; $('card-title').textContent = G.lv.name; show('s-card');
      setTimeout(() => levelCard(G.L + 1), 1500);
    } else { win(); }
  }
  function levelCard(i) {
    setLevel(i); $('card-label').textContent = 'Level ' + G.lv.id; $('card-title').textContent = G.lv.name; show('s-card');
    setTimeout(() => { show('s-game'); fit(); draw(); }, 1200);
  }

  /* ---------- the jump scare ---------- */
  function pickScare() {
    const pool = CFG.scares.map((s, i) => i).filter(i => CFG.scares[i].intensity <= G.lv.id + 2 && i !== G.lastScare);
    const i = pool[Math.floor(Math.random() * pool.length)]; G.lastScare = i; return i;
  }
  function lose(why) {
    if (G.state !== 'play' && G.state !== 'idle') return;
    G.state = 'dead'; stopLoops(); draw();
    track('scare_' + G.lv.id, { level: G.lv.id, reason: why });
    const reached = G.lv.id;
    if (QA.noScare) { afterScare(reached); return; }
    const i = pickScare(), ov = $('s-scare'), im = $('scare-img');
    im.src = scareSrc(i);
    ov.classList.remove('cut'); ov.classList.add('on', 'flash');
    audio.setAmbience(0, 0.02); setTimeout(() => audio.setAmbience(ambLevel() * 0.55, 1), 1700);
    audio.scream(Math.floor(Math.random() * CFG.screams.length));
    try { navigator.vibrate && navigator.vibrate([250, 80, 400]); } catch (e) {}
    setTimeout(() => ov.classList.remove('flash'), 70);
    setTimeout(() => ov.classList.add('cut'), 1400);
    setTimeout(() => { ov.classList.remove('on', 'cut'); afterScare(reached); }, 1650);
  }
  async function afterScare(reached) {
    $('lose-level').textContent = 'Level ' + reached;
    $('lose-count').textContent = '#' + fmt(counter.local() + 1);
    show('s-lose');
    const n = await counter.bump(); G.count = n; $('lose-count').textContent = '#' + fmt(n);
  }
  const fmtTime = ms => { const m = Math.floor(ms / 60000), sec = (ms % 60000) / 1000; return m + ':' + (sec < 10 ? '0' : '') + sec.toFixed(2); };
  function win() {
    G.won = true; G.finalMs = G.runMs; track('win', { ms: Math.round(G.finalMs) });
    $('win-time').textContent = fmtTime(G.finalMs); show('s-win');
  }
  function resetRun() { G.runMs = 0; G.finalMs = 0; G.won = false; G.saved = false; }

  /* ---------- flow ---------- */
  function begin() {
    audio.startAmbience(); audio.setAmbience(ambLevel() * 0.55, 1.5); // stays under the game, quieter
    if (!isIOS && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait').catch(() => {}); } catch (e) {}
    track('game_start');
    show('s-howto'); runHint();
    resetRun();
    setTimeout(() => levelCard(QA.startLevel), 3000);
  }
  function playAgain() { resetRun(); track('play_again'); levelCard(0); }

  $('btn-begin').addEventListener('click', begin);
  ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'].forEach(ev => $('s-landing').addEventListener(ev, () => audio.startAmbience(), { passive: true }));
  $('opt-sound').addEventListener('change', e => { if (e.target.checked) audio.startAmbience(); else audio.stopAmbience(0.3); });
  ['pointerdown', 'touchend', 'click'].forEach(ev => document.addEventListener(ev, () => audio.unlock(), { passive: true }));
  document.querySelectorAll('[data-act="again"]').forEach(b => b.addEventListener('click', playAgain));
  document.querySelectorAll('[data-act="enter"]').forEach(b => b.addEventListener('click', openForm));
  document.querySelectorAll('[data-act="share"]').forEach(b => b.addEventListener('click', share));
  document.querySelector('[data-act="back"]').addEventListener('click', () => show('s-win'));
  $('s-scare').addEventListener('pointerdown', e => e.preventDefault());

  /* ---------- leaderboard ---------- */
  const scores = {
    key: 'dlyh_scores',
    local() { try { return JSON.parse(localStorage.getItem(this.key) || '[]'); } catch (e) { return []; } },
    async list() {
      if (CFG.apiBase) { try { const r = await fetch(CFG.apiBase + '/scores?limit=' + (CFG.leaderboardSize || 10)); if (r.ok) return await r.json(); } catch (e) {} }
      return this.local().sort((a, b) => a.ms - b.ms).slice(0, CFG.leaderboardSize || 10);
    },
    async save(name, ms) {
      const entry = { name, ms: Math.round(ms), ts: Date.now(), id: Math.random().toString(36).slice(2) };
      const l = this.local(); l.push(entry); l.sort((a, b) => a.ms - b.ms); try { localStorage.setItem(this.key, JSON.stringify(l.slice(0, 50))); localStorage.setItem('dlyh_name', name); } catch (e) {}
      if (CFG.apiBase) { try { await fetch(CFG.apiBase + '/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, ms: entry.ms }) }); } catch (e) {} }
      return entry;
    }
  };
  async function openBoard() {
    if (!G.won || !G.finalMs) return; // the board is for finished runs only
    $('board-time').textContent = fmtTime(G.finalMs);
    const f = $('board-form'); f.classList.toggle('saved', !!G.saved);
    f.elements.name.value = f.elements.name.value || localStorage.getItem('dlyh_name') || '';
    $('board-scope').textContent = CFG.apiBase ? 'Global · fastest clean runs' : 'Scores on this device · global board goes live with the campaign site';
    show('s-board'); renderBoard();
  }
  async function renderBoard() {
    const list = await scores.list(), ol = $('board-list'); ol.innerHTML = '';
    list.forEach((e, i) => { const li = document.createElement('li'); if (G.savedId && e.id === G.savedId) li.className = 'me';
      li.innerHTML = '<span class="rank">' + String(i + 1).padStart(2, '0') + '</span><span class="name"></span><span class="ms">' + fmtTime(e.ms) + '</span>';
      li.querySelector('.name').textContent = e.name; ol.appendChild(li); });
    if (!list.length) ol.innerHTML = '<li><span class="rank">—</span><span class="name">Nobody has kept their head yet.</span><span></span></li>';
    if (G.savedId) { const all = scores.local().sort((a, b) => a.ms - b.ms), r = all.findIndex(e => e.id === G.savedId) + 1; G.rank = r; $('board-rank').textContent = r ? '#' + r + ' of ' + all.length + ' steady hands' : ''; }
    else $('board-rank').textContent = G.finalMs ? 'Save your time to see where you land.' : '';
  }
  $('board-form').addEventListener('submit', async ev => {
    ev.preventDefault(); const name = $('board-form').elements.name.value.trim().slice(0, 18); if (!name || G.saved) return;
    const e = await scores.save(name, G.finalMs); G.saved = true; G.savedId = e.id; track('leaderboard_save', { ms: e.ms });
    $('board-form').classList.add('saved'); renderBoard();
  });
  document.querySelectorAll('[data-act="board"]').forEach(b => b.addEventListener('click', openBoard));

  /* ---------- how-to hint ---------- */
  function runHint() {
    const c = $('hint'), x = c.getContext('2d'), p = [[30, 100], [110, 100], [110, 50], [190, 50], [190, 150], [270, 150]], cum = cumLens(p), t0 = now();
    (function f() {
      if (!$('s-howto').classList.contains('active')) return;
      const k = Math.min(1, ((now() - t0) % 2600) / 2200);
      x.fillStyle = '#0C3E30'; x.fillRect(0, 0, 300, 200); x.lineCap = x.lineJoin = 'round';
      x.strokeStyle = '#EDE6D6'; x.lineWidth = 22; x.beginPath(); x.moveTo(p[0][0], p[0][1]); p.forEach(q => x.lineTo(q[0], q[1])); x.stroke();
      x.fillStyle = '#fff'; x.beginPath(); x.arc(30, 100, 8, 0, 7); x.fill();
      x.fillStyle = '#FD4334'; x.beginPath(); x.arc(270, 150, 8, 0, 7); x.fill();
      const a = pointAt(p, cum, k); x.fillStyle = '#FD4334'; x.beginPath(); x.arc(a.x, a.y, 4, 0, 7); x.fill();
      requestAnimationFrame(f);
    })();
  }

  /* ---------- entry form ---------- */
  const form = $('entry');
  function openForm() {
    if (closed || !G.won) return; // the draw is only for players who clear all five levels
    const sel = n => form.elements[n];
    sel('cinema').innerHTML = CFG.cinemas.map(c => `<option>${c}</option>`).join('');
    sel('night').innerHTML = CFG.nights.map(c => `<option>${c}</option>`).join('');
    sel('level').value = G.won ? LEVELS.length : G.lv.id; sel('bonus').value = G.won ? 1 : 0; sel('utm').value = JSON.stringify(utm);
    $('form-error').textContent = '';
    $('terms-link').href = CFG.termsUrl; $('privacy-link').href = CFG.privacyUrl;
    if (CFG.turnstileSiteKey && !$('turnstile').children.length) {
      $('turnstile').innerHTML = `<div class="cf-turnstile" data-sitekey="${CFG.turnstileSiteKey}" data-theme="dark"></div>`;
      const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; s.async = true; document.head.appendChild(s);
    }
    show('s-form');
  }
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(form).entries()), err = $('form-error');
    const mobile = (f.mobile || '').replace(/[\s-]/g, '');
    if (!f.name || f.name.trim().length < 2) return err.textContent = 'Please enter your full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email || '')) return err.textContent = 'Please enter a valid email.';
    if (!/^(\+?971|0)5[0-9]{8}$/.test(mobile)) return err.textContent = 'Please enter a UAE mobile number, e.g. 050 123 4567.';
    if (!f.terms) return err.textContent = 'You need to accept the terms & conditions.';
    if (CFG.turnstileSiteKey && !f['cf-turnstile-response']) return err.textContent = 'Please complete the verification.';
    const entry = { name: f.name.trim(), email: f.email.trim().toLowerCase(), mobile: mobile.replace(/^0/, '+971').replace(/^971/, '+971'), cinema: f.cinema, night: f.night,
      instagram: (f.instagram || '').trim(), marketing: !!f.marketing, level: +f.level, bonus: +f.bonus, utm, turnstile: f['cf-turnstile-response'] || '', ts: new Date().toISOString() };
    const btn = form.querySelector('[type=submit]'); btn.disabled = true; err.textContent = '';
    try {
      if (CFG.apiBase) {
        const r = await fetch(CFG.apiBase + '/entries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
        if (r.status === 409) throw new Error('That email has already entered. One entry per person.');
        if (!r.ok) throw new Error('Something went wrong. Try again.');
      } else {
        const list = JSON.parse(localStorage.getItem('dlyh_entries') || '[]');
        if (list.some(e => e.email === entry.email)) throw new Error('That email has already entered. One entry per person.');
        list.push(entry); localStorage.setItem('dlyh_entries', JSON.stringify(list));
      }
      track('entry_submit', { level: entry.level, bonus: entry.bonus });
      $('book-link').href = CFG.bookingUrl; show('s-thanks');
    } catch (e) { err.textContent = e.message; }
    btn.disabled = false;
  });

  /* ---------- share: copy the link, then offer every channel ---------- */
  function shareText() {
    const n = LEVELS.length, count = G.count || counter.local(), level = G.won ? n : (G.lv ? G.lv.id : 1);
    const cleared = G.won ? n : level - 1;
    const grid = Array.from({ length: n }, (_, i) => i < cleared ? '🟩' : i === cleared && !G.won ? '🟥' : '⬛').join('');
    const lines = ["DON'T LOSE YOUR HEAD 🔪"];
    if (G.won) { lines.push('I kept my head in ' + fmtTime(G.finalMs) + (G.rank ? ' · #' + G.rank + ' on the leaderboard' : '')); lines.push(grid + ' ' + n + '/' + n + ' levels'); lines.push('Beat my time if your hands are steady enough.'); }
    else { lines.push('I lost my head on Level ' + level + '. Scared person #' + fmt(count) + '.'); lines.push(grid + ' ' + cleared + '/' + n + ' levels'); lines.push('Think you can do better? Your turn.'); }
    return lines.join('\n');
  }
  const shareLink = () => CFG.shareUrl || location.href.split('?')[0];
  async function copyShare() { return copyLink(shareText() + '\n' + shareLink()); }
  async function copyLink(txt) {
    const url = txt || shareLink();
    try { await navigator.clipboard.writeText(url); return true; } catch (e) {}
    try { const ta = document.createElement('textarea'); ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch (e) { return false; }
  }
  async function share() {
    track('share', { level: G.won ? LEVELS.length : (G.lv && G.lv.id) });
    const ok = await copyShare();
    $('share-status').textContent = ok ? 'Message + link copied. Now pick where it goes.' : 'Pick where it goes.';
    $('share-link').textContent = shareText() + '\n' + shareLink().replace(/^https?:\/\//, '');
    const text = shareText(), url = shareLink(), enc = encodeURIComponent;
    $('sh-wa').href = 'https://wa.me/?text=' + enc(text + ' ' + url);
    $('sh-tg').href = 'https://t.me/share/url?url=' + enc(url) + '&text=' + enc(text);
    $('sh-x').href = 'https://twitter.com/intent/tweet?text=' + enc(text.replace(/\n/g, ' ')) + '&url=' + enc(url);
    $('sh-mail').href = 'mailto:?subject=' + enc("Don't Lose Your Head") + '&body=' + enc(text + '\n' + url);
    $('sh-native').style.display = navigator.share ? '' : 'none';
    $('s-share').classList.add('on');
  }
  $('sh-close').addEventListener('click', () => $('s-share').classList.remove('on'));
  $('sh-copy').addEventListener('click', async () => { const ok = await copyShare(); $('share-status').textContent = ok ? 'Message + link copied.' : 'Could not copy. Long-press the link instead.'; });
  $('sh-native').addEventListener('click', async () => {
    const blob = await renderCard(), file = blob && new File([blob], 'dont-lose-your-head.png', { type: 'image/png' });
    try {
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: shareText(), url: shareLink() });
      else await navigator.share({ text: shareText(), url: shareLink() });
    } catch (e) {}
  });
  $('sh-story').addEventListener('click', async () => {
    const blob = await renderCard(); if (!blob) return;
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'dont-lose-your-head.png'; a.click();
    $('share-status').textContent = 'Story image saved. Post it and tag @cinemacity.';
  });

  /* 1080×1920 story card */
  async function renderCard() {
    const c = $('sharecard'), x = c.getContext('2d'), count = G.count || counter.local(), level = G.won ? 5 : (G.lv ? G.lv.id : 1);
    x.fillStyle = '#0C3E30'; x.fillRect(0, 0, 1080, 1920);
    if (img.shareBg && img.shareBg.width) x.drawImage(img.shareBg, 0, 0, 1080, 1920);
    x.globalCompositeOperation = 'color'; x.fillStyle = '#0C3E30'; x.fillRect(0, 0, 1080, 1920);
    x.globalCompositeOperation = 'multiply'; x.fillStyle = 'rgba(12,62,48,.55)'; x.fillRect(0, 0, 1080, 1920);
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = '#EDE6D6'; x.textAlign = 'center';
    x.font = '500 34px "IBM Plex Mono", monospace'; x.letterSpacing = '8px';
    x.fillText('HALLOWEEN AT CINEMACITY', 540, 300);
    x.font = '900 150px Fraunces, Georgia, serif'; x.letterSpacing = '-4px';
    const lines = G.won ? ['I kept', 'my head.'] : ['I made it', 'to Level ' + level + '.'];
    x.fillText(lines[0], 540, 760); x.fillText(lines[1], 540, 900);
    x.font = '500 56px Fraunces, Georgia, serif'; x.letterSpacing = '0px';
    x.fillText(G.won ? 'Time ' + fmtTime(G.finalMs) + (G.rank ? '  ·  #' + G.rank : '') : 'Scared person #' + fmt(count) + '.', 540, 1040);
    x.font = '900 110px Fraunces, Georgia, serif'; x.letterSpacing = '-3px'; x.fillStyle = '#FD4334';
    x.fillText('Your turn.', 540, 1240);
    x.font = '500 30px "IBM Plex Mono", monospace'; x.letterSpacing = '6px'; x.fillStyle = '#9d9890';
    x.fillText(shareLink().replace(/^https?:\/\//, '').toUpperCase(), 540, 1760);
    return new Promise(r => c.toBlob(r, 'image/png'));
  }

  window.__DLYH_DEBUG = { G, doorState, LEVELS, tickHazards, draw, hazardHit, loop, audio };

  /* ---------- boot ---------- */
  (async function boot() {
    $('btn-begin').disabled = true;
    const t = now();
    const ti = now(); const pImg = preloadImages().then(() => console.log('images', ((now() - ti) / 1000).toFixed(2) + 's'));
    const pAud = audio.preload().then(() => console.log('audio', ((now() - ti) / 1000).toFixed(2) + 's'));
    await Promise.all([pImg, pAud]);
    $('loadstate').textContent = 'Loaded in ' + ((now() - t) / 1000).toFixed(1) + 's';
    $('btn-begin').disabled = false;
    audio.startAmbience();
    const soundState = () => { if (!audio.ctx) return; const on = audio.ctx.state === 'running'; $('loadstate').textContent = on ? 'Sound on · ' + (audio.ok ? 'headphones recommended' : 'files missing, synth fallback') : 'Tap anywhere to turn the sound on'; };
    if (audio.ctx) { audio.ctx.addEventListener('statechange', soundState); setTimeout(soundState, 300); }
    // tiny output meter on the landing page so a muted device is obvious
    (function vu() { if ($('s-landing').classList.contains('active')) { const l = Math.min(1, audio.level() * 6); $('vu').style.transform = 'scaleX(' + l.toFixed(3) + ')'; } requestAnimationFrame(vu); })();
    setLevel(0); G.raf = requestAnimationFrame(loop);
    if (closed) $('btn-begin').textContent = "I'm in (draw closed)";
  })();
})();
