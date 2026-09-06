/* EE20 Simulator — application: UI, widgets, simulation loop */
(function (EE) {
  'use strict';
  const I = EE.i18n, t = I.t, tx = I.tx, A = EE.audio, S = EE.schematic, CIR = EE.circuits, P = EE.parts, H = EE.models.helpers;
  const $ = s => document.querySelector(s);
  const h = (tag, attrs, ...kids) => { const e = document.createElement(tag); if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]); else if (k === 'html') e.innerHTML = attrs[k]; else e.setAttribute(k, attrs[k]); } kids.flat().forEach(c => { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }); return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- global control state ----------------------------------------------------
  const ctl = {
    vol: 0, tune: 0.3, slide: 'a', keys: {}, lux: 0.7, torch: false, cover: false, soundLvl: 0.1, clapT: 0, clapAmp: 0,
    micLive: false, micDist: 0.7, contact: true, probe: 'none', probeDist: 0.3, probeWet: 0.5, gram: false, gramSong: 'odeToJoy',
    speak: false, friend: false, baby: false, pickup: 'telephone', orient: 45, aerial: false, trawler: false,
    twoway: 'rx', friendText: 'CQ DE EE20 HELLO', friendWpm: 10, friendSending: false, onFriendSymbol: null, onFriendDone: null,
    unknownKind: 'R', unknownVal: 15000, standardVal: 1500, unknownRevealed: false, battery: 1, fault: null,
  };
  let cur = null, st = {}, model = null, tab = localStorage.getItem('ee20.tab') || 'board', out = null, lastT = 0;
  const views = {}; let syncers = []; let dockRefs = {}; let faultRevealed = false;
  const slowTrace = new Float32Array(300); let slowIdx = 0, scopeGain = 1;

  // ---- widgets -----------------------------------------------------------------
  function knob(o) { // o: {name, get, set, off, min,max labels, size}
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'knob'); if (o.big) { svg.style.width = svg.style.height = '120px'; }
    const mk = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); svg.appendChild(e); return e; };
    const arc = (a0, a1, r) => { const p = a => [50 + r * Math.sin(a * Math.PI / 180), 50 - r * Math.cos(a * Math.PI / 180)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
    mk('path', { d: arc(-150, 150, 42), class: 'scale' });
    for (let i = 0; i <= 10; i++) { const a = (-150 + 30 * i) * Math.PI / 180; mk('line', { x1: 50 + 36 * Math.sin(a), y1: 50 - 36 * Math.cos(a), x2: 50 + 33 * Math.sin(a), y2: 50 - 33 * Math.cos(a), class: 'tick' }); }
    if (o.labels) o.labels.forEach((s, i) => { const a = (-150 + 300 * i / (o.labels.length - 1)) * Math.PI / 180; const tt = mk('text', { x: 50 + 47 * Math.sin(a), y: 50 - 47 * Math.cos(a) + 3, 'text-anchor': 'middle' }); tt.textContent = s; });
    const body = mk('circle', { cx: 50, cy: 50, r: 27, class: 'body' }); mk('circle', { cx: 50, cy: 50, r: 12, class: 'grip' });
    const ptr = mk('line', { x1: 50, y1: 50, x2: 50, y2: 26, class: 'pointer' });
    const nm = mk('text', { x: 50, y: 96, 'text-anchor': 'middle', class: 'name' }); nm.textContent = o.name;
    function draw() { const v = o.get(); const ang = -150 + 300 * v; ptr.setAttribute('transform', `rotate(${ang} 50 50)`); body.classList.toggle('off', !!o.off && v < 0.03); }
    let dragging = false;
    const angleOf = ev => { const r = svg.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width * 100 - 50, y = (ev.clientY - r.top) / r.height * 100 - 50; let a = Math.atan2(x, -y) * 180 / Math.PI; return clamp(a, -150, 150); };
    svg.addEventListener('pointerdown', ev => { dragging = true; try { svg.setPointerCapture(ev.pointerId); } catch (e) { } o.set(clamp((angleOf(ev) + 150) / 300, 0, 1)); ev.preventDefault(); });
    svg.addEventListener('pointermove', ev => { if (dragging) o.set(clamp((angleOf(ev) + 150) / 300, 0, 1)); });
    svg.addEventListener('pointerup', () => { dragging = false; }); svg.addEventListener('pointercancel', () => { dragging = false; });
    svg.addEventListener('wheel', ev => { ev.preventDefault(); o.set(clamp(o.get() - Math.sign(ev.deltaY) * 0.03, 0, 1)); }, { passive: false });
    syncers.push(draw); draw(); return svg;
  }
  function slideSwitch(get, set, la, lb) {
    const a = h('span', {}, la), b = h('span', {}, lb); const el = h('div', { class: 'slideswitch', onclick: () => set(get() === 'a' ? 'b' : 'a') }, a, b);
    const draw = () => { a.classList.toggle('on', get() === 'a'); b.classList.toggle('on', get() !== 'a'); }; syncers.push(draw); draw(); return el;
  }
  function holdButton(label, id, cls) {
    const b = h('button', { class: 'bigkey ' + (cls || '') }, label);
    const down = ev => { ev.preventDefault(); ctl.keys[id] = true; A.ensure(); }; const up = () => { ctl.keys[id] = false; };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
    syncers.push(() => b.classList.toggle('on', !!ctl.keys[id])); return b;
  }
  function toggleButton(label, get, set, cls) { const b = h('button', { class: 'btn ' + (cls || ''), onclick: () => set(!get()) }, label); syncers.push(() => b.classList.toggle('on', !!get())); return b; }
  function range(get, set, min, max, step) { const r = h('input', { type: 'range', min, max, step: step || 0.01, value: get() }); r.addEventListener('input', () => set(parseFloat(r.value))); syncers.push(() => { if (document.activeElement !== r) r.value = get(); }); return r; }
  function ctlBox(label, ...kids) { return h('div', { class: 'ctl' }, label ? h('div', { class: 'lbl' }, label) : null, ...kids); }
  function fmtR(v) { return P.fmtOhms(Math.round(v), I.getLang()); }

  // ---- sidebar / header ----------------------------------------------------------
  function buildSidebar() {
    const sb = $('#sidebar'); sb.innerHTML = '';
    sb.appendChild(h('h2', {}, t('circuits')));
    let g = null;
    CIR.list.forEach(c => {
      if (c.group !== g) { g = c.group; sb.appendChild(h('div', { class: 'grp ' + g }, t('group' + g))); }
      sb.appendChild(h('div', { class: 'item' + (cur && cur.id === c.id ? ' active' : ''), 'data-id': c.id, onclick: () => selectCircuit(c.id) }, h('span', { class: 'id' }, c.id), h('span', {}, tx(c.name)), c.ee8 ? h('span', { class: 'badge', title: t('ee8hint') }, 'EE8') : null));
    });
  }
  function translateStatic() {
    document.querySelectorAll('[data-t]').forEach(e => { e.textContent = t(e.getAttribute('data-t')); });
    $('#btnLang').textContent = t('language'); $('#btnAudio').textContent = muted ? t('audioOff') : t('audioOn');
    document.documentElement.lang = I.getLang() === 'pt' ? 'pt-BR' : 'en';
    // header links (absolute, so they also work from a downloaded copy)
    const SITE = 'https://mjrovai.github.io/EE20-Simulator/';
    $('#lnkHome').href = SITE;
    $('#lnkBook').href = SITE + 'books/' + t('bookFile');
    $('#lnkZip').href = SITE + 'download/EE20-Simulator-offline.zip';
  }

  // ---- circuit selection ---------------------------------------------------------
  function selectCircuit(id) {
    if (model && model.stop) model.stop(); A.silenceAll(); A.micTo('spk', 0);
    cur = CIR.byId[id]; model = EE.models.get(id); st = {}; if (model.init) model.init(st);
    ctl.keys = {}; ctl.slide = 'a'; ctl.fault = null; ctl.friendSending = false; ctl.gram = false; ctl.speak = false; faultRevealed = false;
    ctl.unknownRevealed = false; if (id === 'E4') newUnknown();
    if (id === 'E3') ctl.vol = Math.max(ctl.vol, 0);
    localStorage.setItem('ee20.circuit', id);
    document.querySelectorAll('#sidebar .item').forEach(e => e.classList.toggle('active', e.getAttribute('data-id') === id));
    $('#cid').textContent = cur.id; $('#cname').textContent = tx(cur.name); $('#cpages').textContent = t('manualSource') + ' ' + cur.pages;
    $('#cbadge').innerHTML = cur.ee8 ? `<span class="badge" title="${t('ee8hint')}">EE 8</span>` : '';
    syncers = []; renderViews(); buildStrip(); buildDock(); buildManual(); buildParts(); buildFaultbar(); setTab(tab);
    decoder.reset(); slowTrace.fill(0);
  }
  const viewHandlers = {
    onKey: (id, down) => { ctl.keys[id] = down; A.ensure(); },
    onSlide: () => { ctl.slide = ctl.slide === 'a' ? 'b' : 'a'; },
    onInspect: (id, g) => inspectPart(id, g),
  };
  function renderViews() {
    views.board = S.render($('#boardCard'), cur, 'phys', viewHandlers);
    views.schem = S.render($('#schemBox'), cur, 'sym', viewHandlers);
  }
  function setTab(name) {
    tab = name; localStorage.setItem('ee20.tab', name);
    document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === name));
    document.querySelectorAll('.stage').forEach(s => s.classList.toggle('active', s.id === 'stage-' + name));
  }

  // ---- board strip (knobs on the mounting board) --------------------------------
  function buildStrip() {
    const strip = $('#boardStrip'); strip.innerHTML = '';
    const box = (lbl, w) => h('div', { class: 'knobbox' }, w, h('div', { class: 'lbl' }, lbl));
    strip.appendChild(box(potLabel(), knob({ name: 'S1 · P', get: () => ctl.vol, set: v => { ctl.vol = v; A.ensure(); }, off: true, labels: ['0', '', '', '', '', '10'] })));
    if (cur.controls.includes('slide')) strip.appendChild(box(t('slide'), slideSwitch(() => ctl.slide, v => { ctl.slide = v; }, t('left'), t('right'))));
    if (cur.controls.includes('tune')) strip.appendChild(box(t('tuning'), knob({ name: 'C10', get: () => ctl.tune, set: v => { ctl.tune = v; }, labels: ['520', '', '', '', '', '1620'] })));
  }
  function potLabel() { return cur.id === 'A5' ? t('volume') + ' — ' + t('tuning') : (cur.id === 'E4' ? t('volume') + ' — ' + t('ratio') : (cur.id === 'E3' ? t('volume') + ' — ' + t('time') : t('volume'))); }

  // ---- instrument dock -----------------------------------------------------------
  function buildDock() {
    const dock = $('#dock'); dock.innerHTML = ''; dockRefs = {};
    const c = cur.controls, o = cur.outputs;
    // Controls
    const pc = h('div', { class: 'panel' }, h('h3', {}, t('controls')));
    const kn = h('div', { class: 'row' });
    kn.appendChild(knob({ name: 'P', get: () => ctl.vol, set: v => { ctl.vol = v; A.ensure(); }, off: true, labels: ['0', '', '', '', '', '10'] }));
    if (c.includes('tune')) kn.appendChild(knob({ name: 'kHz', get: () => ctl.tune, set: v => { ctl.tune = v; }, labels: ['520', '', '', '', '', '1620'] }));
    pc.appendChild(ctlBox(potLabel() + (cur.id === 'A5' ? '' : ''), kn, h('div', { class: 'hint' }, t('poweredOff'))));
    if (c.includes('slide')) pc.appendChild(ctlBox(t('slide'), slideSwitch(() => ctl.slide, v => { ctl.slide = v; }, t('left'), t('right'))));
    if (c.includes('twoway')) pc.appendChild(ctlBox(t('twoWay'), slideSwitch(() => ctl.twoway === 'tx' ? 'a' : 'b', v => { ctl.twoway = v === 'a' ? 'tx' : 'rx'; }, t('send'), t('receive'))));
    if (c.includes('mkey')) pc.appendChild(ctlBox(t('morseKey'), holdButton(t('holdKey'), 'MK'), h('div', { class: 'hint' }, 'Space')));
    if (c.includes('akey')) pc.appendChild(ctlBox(t('alarmKey'), holdButton(t('alarmKey'), 'AK')));
    if (c.includes('rkey')) pc.appendChild(ctlBox(t('resetKey'), holdButton(t('resetKey') + ' (R)', 'RK', 'reset')));
    if (c.includes('keys')) {
      const names = t('keyNames'); const row = h('div', { class: 'keyrow' });
      for (let i = 1; i <= 8; i++) { const b = h('button', { class: 'key' }, String(i), h('small', {}, names[i - 1])); const id = 'K' + i;
        const down = ev => { ev.preventDefault(); ctl.keys[id] = true; A.ensure(); }, up = () => { ctl.keys[id] = false; };
        b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); syncers.push(() => b.classList.toggle('on', !!ctl.keys[id])); row.appendChild(b); }
      pc.appendChild(ctlBox(t('organKeys'), row, h('div', { class: 'hint' }, t('tuneOrgan'))));
      const note = h('div', { class: 'meter' }); syncers.push(() => { note.innerHTML = out && out.info && out.info.note ? `<b>${names[out.info.note - 1]}</b> ${out.info.freq} Hz` : '— Hz'; }); pc.appendChild(note);
    }
    if (c.includes('unknown')) pc.appendChild(unknownPanel());
    dock.appendChild(pc);

    // Surroundings
    const envKeys = ['light', 'sound', 'contact', 'probe', 'gram', 'mic', 'intercom', 'pickup', 'orient', 'aerial', 'trawler', 'friend'];
    if (c.some(k => envKeys.includes(k))) {
      const pe = h('div', { class: 'panel' }, h('h3', {}, t('environment')));
      if (c.includes('light')) {
        const rd = h('span', { class: 'val' });
        pe.appendChild(ctlBox(t('light'), h('div', { class: 'row' }, h('span', { class: 'val' }, t('dark')), range(() => ctl.lux, v => { ctl.lux = v; }, 0, 1), h('span', { class: 'val' }, t('bright'))),
          h('div', { class: 'row' }, toggleButton('🔦 ' + t('torch'), () => ctl.torch, v => { ctl.torch = v; }), toggleButton('✋ ' + t('cover'), () => ctl.cover, v => { ctl.cover = v; }), rd)));
        syncers.push(() => { rd.textContent = t('resistanceNow') + ': ' + fmtR(H.ldrOhms(ctl)); });
      }
      if (c.includes('sound')) {
        const micChk = micCheckbox();
        pe.appendChild(ctlBox(t('sound'), h('div', { class: 'row' }, h('span', { class: 'val' }, t('quiet')), range(() => ctl.soundLvl, v => { ctl.soundLvl = v; }, 0, 1), h('span', { class: 'val' }, t('loud'))),
          h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => clap(0.9, 'clap') }, '👏 ' + t('clap')), h('button', { class: 'btn', onclick: () => clap(1.6, 'slam') }, '🚪 ' + t('slam'))), micChk));
      }
      if (c.includes('contact')) pe.appendChild(ctlBox(t('contact'), slideSwitch(() => ctl.contact ? 'a' : 'b', v => { ctl.contact = v === 'a'; }, t('closed'), t('open'))));
      if (c.includes('probe')) pe.appendChild(probePanel());
      if (c.includes('gram')) {
        const sel = h('select', {}, ...Object.keys(P.MELODIES).map(k => h('option', { value: k }, tx(P.MELODIES[k].title)))); sel.value = ctl.gramSong; sel.addEventListener('change', () => { ctl.gramSong = sel.value; A.stopMelody(cur.id + ':gram'); });
        pe.appendChild(ctlBox(t('gramophone'), h('div', { class: 'row' }, h('span', { class: 'val' }, t('record')), sel), h('div', { class: 'row' }, toggleButton('▶ ' + t('play'), () => ctl.gram, v => { ctl.gram = v; A.ensure(); }), h('button', { class: 'btn', onclick: () => { ctl.gram = false; } }, '■ ' + t('stop')))));
      }
      if (c.includes('mic')) {
        pe.appendChild(ctlBox(t('microphone'), micCheckbox(), h('div', { class: 'row' }, h('span', { class: 'val' }, t('micDistance')), h('span', { class: 'val' }, t('near')), range(() => ctl.micDist, v => { ctl.micDist = v; }, 0, 1), h('span', { class: 'val' }, t('far'))),
          h('div', { class: 'row' }, holdSpeak())));
      }
      if (c.includes('intercom')) {
        pe.appendChild(ctlBox(t('intercomMain'), micCheckbox(), holdSpeak()));
        pe.appendChild(ctlBox(t('intercomRemote'), h('div', { class: 'row' }, toggleButton('🗣 ' + t('friendSpeaks'), () => ctl.friend, v => { ctl.friend = v; A.ensure(); }), toggleButton('👶 ' + t('babyCries'), () => ctl.baby, v => { ctl.baby = v; A.ensure(); }))));
      }
      if (c.includes('pickup')) {
        const sel = h('select', {}, ...['telephone', 'birds', 'whisper', 'clock', 'silence'].map(k => h('option', { value: k }, t('s_' + k)))); sel.value = ctl.pickup; sel.addEventListener('change', () => { ctl.pickup = sel.value; A.ensure(); });
        pe.appendChild(ctlBox(t('pickupSource'), sel, micCheckbox(), h('div', { class: 'row' }, h('span', { class: 'val' }, t('micDistance')), range(() => ctl.micDist, v => { ctl.micDist = v; }, 0, 1))));
      }
      if (c.includes('orient')) {
        const comp = knob({ name: '', get: () => ctl.orient / 360, set: v => { ctl.orient = v * 360; }, labels: ['N', 'E', 'S', 'W', 'N'] }); comp.classList.add('compass');
        const rd = h('span', { class: 'val' }); syncers.push(() => { rd.textContent = Math.round(ctl.orient) + '°'; });
        pe.appendChild(ctlBox(t('orient'), h('div', { class: 'row' }, comp, rd)));
        const chk = h('div', { class: 'row' }, toggleButton('📡 ' + t('aerial'), () => ctl.aerial, v => { ctl.aerial = v; }));
        if (c.includes('trawler')) chk.appendChild(toggleButton('🎣 ' + t('trawler'), () => ctl.trawler, v => { ctl.trawler = v; }));
        pe.appendChild(ctlBox('', chk));
      }
      if (c.includes('friend')) pe.appendChild(friendPanel());
      dock.appendChild(pe);
    }

    // Outputs & instruments
    const po = h('div', { class: 'panel' }, h('h3', {}, t('outputs') + ' · ' + t('instruments')));
    const outRow = h('div', { class: 'row', style: 'gap:18px;align-items:flex-start' });
    if (o.includes('lamp')) { const glow = h('div', { class: 'glow' }), fil = h('div', { class: 'fil' }); const ind = h('div', { class: 'lamp-ind' }, glow, fil); dockRefs.lamp = { glow, fil }; outRow.appendChild(h('div', { class: 'lampbox' }, ind, h('div', {}, h('div', { class: 'lbl' }, t('lamp')), h('div', { class: 'meter', id: 'lampMeter' }, '—')))); }
    const spkInd = (lbl, key) => { const cone = h('div', { class: 'cone' }); const ind = h('div', { class: 'spk-ind' }, cone); dockRefs['spk_' + key] = ind; return h('div', {}, ind, h('div', { class: 'hint', style: 'text-align:center' }, lbl)); };
    if (o.includes('spk')) outRow.appendChild(spkInd(t('speaker'), 'LS'));
    if (o.includes('spk2')) outRow.appendChild(spkInd(t('speaker2'), 'LS2'));
    if (o.includes('bass')) outRow.appendChild(spkInd(t('bass') + ' 𝄢', 'LS1'));
    if (o.includes('treble')) outRow.appendChild(spkInd(t('treble') + ' 𝄞', 'LS2'));
    if (o.includes('ear')) { const e = h('div', { class: 'ear-ind' }); dockRefs.ear = e; outRow.appendChild(h('div', {}, e, h('div', { class: 'hint' }, t('earphone')))); }
    po.appendChild(outRow);
    // battery
    const bar = h('i'); const gauge = h('div', { class: 'batt-gauge' }, bar); const bm = h('span', { class: 'meter' });
    po.appendChild(ctlBox(t('battery'), gauge, h('div', { class: 'row' }, bm, h('button', { class: 'btn small', onclick: () => { ctl.battery = 1; if (ctl.fault && ctl.fault.kind === 'battery') clearFault(); } }, t('replaceBattery')))));
    syncers.push(() => { bar.style.width = (ctl.battery * 100) + '%'; if (out) bm.innerHTML = `${t('voltage')} <b>${out.V.toFixed(1)} V</b> · ${t('current')} <b>${out.mA.toFixed(1)} mA</b>`; });
    // scope
    const cv = h('canvas', { class: 'scope', width: 600, height: 110 }); dockRefs.scope = cv; po.appendChild(ctlBox(t('scope'), cv));
    if (o.includes('stopwatch')) { const sw = h('div', { class: 'stopwatch' }, '0.0 s'); const calib = h('div', { class: 'hint' }); dockRefs.stopwatch = sw; dockRefs.calib = calib; po.appendChild(ctlBox(t('stopwatch'), sw, calib)); }
    if (o.includes('decoder')) { const d = h('div', { class: 'decoded' }); dockRefs.decoded = d; po.appendChild(ctlBox(t('decoded'), d, h('button', { class: 'btn small', onclick: () => decoder.reset() }, t('clear')))); }
    if (o.includes('stations')) { const s = h('div', { class: 'stations' }); dockRefs.stations = s; po.appendChild(ctlBox(t('stations'), s)); }
    dock.appendChild(po);
  }
  function micCheckbox() {
    const cb = h('input', { type: 'checkbox' }); cb.checked = ctl.micLive;
    cb.addEventListener('change', async () => { if (cb.checked) { const ok = await A.enableMic(); if (!ok) { cb.checked = false; toast(t('micDenied')); } ctl.micLive = cb.checked; } else { ctl.micLive = false; A.micTo('spk', 0); } });
    syncers.push(() => { cb.checked = ctl.micLive; }); return h('label', { class: 'check' }, cb, '🎤 ' + t('micLive'));
  }
  function holdSpeak() {
    const b = h('button', { class: 'btn' }, '🗣 ' + t('speak') + ' (' + t('simVoice') + ')');
    const down = ev => { ev.preventDefault(); ctl.speak = true; A.ensure(); }, up = () => { ctl.speak = false; };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); syncers.push(() => b.classList.toggle('on', ctl.speak)); return b;
  }
  function clap(amp, kind) { A.ensure(); ctl.clapT = A.now(); ctl.clapAmp = amp; A.oneShot(kind, { level: 0.4, bus: 'raw' }); }
  function probePanel() {
    const opts = ['none', 'pencil', 'dryPaper', 'wetPaper', 'hands', 'pot', 'water', 'distilled', 'diodeF', 'diodeR', 'ldr'];
    const sel = h('select', {}, ...opts.map(k => h('option', { value: k }, t('p_' + k)))); sel.value = ctl.probe;
    const dist = ctlBox(t('distance'), range(() => ctl.probeDist, v => { ctl.probeDist = v; }, 0, 1)); const wet = ctlBox(t('wetness'), range(() => ctl.probeWet, v => { ctl.probeWet = v; }, 0, 1));
    const light = ctlBox(t('lightMeter'), h('div', { class: 'row' }, h('span', { class: 'val' }, t('dark')), range(() => ctl.lux, v => { ctl.lux = v; }, 0, 1), h('span', { class: 'val' }, t('bright'))), h('div', { class: 'row' }, toggleButton('🔦 ' + t('torch'), () => ctl.torch, v => { ctl.torch = v; }), toggleButton('✋ ' + t('cover'), () => ctl.cover, v => { ctl.cover = v; })));
    const rd = h('div', { class: 'meter' });
    const upd = () => { dist.style.display = ctl.probe === 'pencil' ? '' : 'none'; wet.style.display = (ctl.probe === 'wetPaper' || ctl.probe === 'pot') ? '' : 'none'; light.style.display = ctl.probe === 'ldr' ? '' : 'none'; const r = H.probeOhms(ctl); rd.innerHTML = 'R ≈ <b>' + (r > 5e8 ? '∞' : fmtR(r)) + '</b>'; };
    sel.addEventListener('change', () => { ctl.probe = sel.value; upd(); }); syncers.push(upd);
    return ctlBox(t('probe'), h('div', { class: 'hint' }, t('probeOptions')), sel, dist, wet, light, rd);
  }
  function friendPanel() {
    const txt = h('input', { type: 'text', value: ctl.friendText, style: 'width:100%' }); txt.addEventListener('input', () => { ctl.friendText = txt.value; });
    const wpm = h('select', {}, ...[5, 8, 10, 12, 16, 20].map(v => h('option', { value: v }, v + ' wpm'))); wpm.value = ctl.friendWpm; wpm.addEventListener('change', () => { ctl.friendWpm = parseInt(wpm.value, 10); });
    const sent = h('div', { class: 'decoded' }); let hidden = true; const hideBtn = h('button', { class: 'btn small', onclick: () => { hidden = !hidden; sent.style.filter = hidden ? 'blur(6px)' : ''; hideBtn.textContent = hidden ? '👁 ' + t('reveal') : '🙈'; } }, '👁 ' + t('reveal')); sent.style.filter = 'blur(6px)';
    ctl.onFriendSymbol = ch => { sent.textContent += ch; }; ctl.onFriendDone = () => { ctl.friendSending = false; };
    const send = h('button', { class: 'btn red', onclick: () => { A.ensure(); sent.textContent = ''; ctl.friendSending = false; A.stopGen('B2:friend'); setTimeout(() => { ctl.friendSending = true; }, 50); } }, '📨 ' + t('sendIt'));
    syncers.push(() => send.classList.toggle('on', ctl.friendSending));
    return ctlBox(t('friendSends'), h('div', { class: 'hint' }, t('yourMessage')), txt, h('div', { class: 'row' }, h('span', { class: 'val' }, t('telegraphSpeed')), wpm, send), sent, hideBtn);
  }
  const KIT_R = [47, 120, 150, 180, 220, 270, 560, 680, 1500, 2200, 3300, 4700, 15000, 27000, 100000, 330000, 680000];
  const KIT_C = [47e-9, 0.1e-6, 3.2e-6, 10e-6, 100e-6];
  function newUnknown() {
    if (ctl.unknownKind === 'R') { ctl.standardVal = 1500; const cand = KIT_R.filter(v => v >= 150 && v <= 15000); ctl.unknownVal = cand[Math.floor(Math.random() * cand.length)]; }
    else if (ctl.unknownKind === 'C') { ctl.standardVal = 0.1e-6; const cand = KIT_C.filter(v => v >= 10e-9 && v <= 1e-6); ctl.unknownVal = cand[Math.floor(Math.random() * cand.length)]; }
    else { ctl.standardVal = 15000; ctl.unknownVal = 0; }
    ctl.unknownRevealed = false;
  }
  function unknownPanel() {
    const sel = h('select', {}, h('option', { value: 'R' }, 'R'), h('option', { value: 'C' }, 'C'), h('option', { value: 'LDR' }, 'LDR')); sel.value = ctl.unknownKind; sel.addEventListener('change', () => { ctl.unknownKind = sel.value; newUnknown(); });
    const info = h('div', { class: 'meter' }); const rev = h('button', { class: 'btn small', onclick: () => { ctl.unknownRevealed = true; } }, t('reveal'));
    const light = ctlBox(t('lightMeter'), h('div', { class: 'row' }, range(() => ctl.lux, v => { ctl.lux = v; }, 0, 1), toggleButton('🔦', () => ctl.torch, v => { ctl.torch = v; })));
    syncers.push(() => {
      const lang = I.getLang(); const isC = ctl.unknownKind === 'C'; const S = isC ? P.fmtFarads(ctl.standardVal, lang) : fmtR(ctl.standardVal);
      const reading = out && out.info ? out.info.reading : 1; const est = isC ? P.fmtFarads(ctl.standardVal / reading, lang) : fmtR(ctl.standardVal * reading);
      let x = ctl.unknownKind === 'LDR' ? (out && out.info ? fmtR(out.info.ldr) : '?') : (ctl.unknownRevealed ? (isC ? P.fmtFarads(ctl.unknownVal, lang) : fmtR(ctl.unknownVal)) : '?');
      info.innerHTML = `${t('standard')} = <b>${S}</b><br>${t('ratio')} = <b>${reading.toFixed(2)}</b> → X ≈ <b>${est}</b><br>${t('unknown')} = <b>${x}</b>`;
      light.style.display = ctl.unknownKind === 'LDR' ? '' : 'none'; rev.style.display = ctl.unknownKind === 'LDR' ? 'none' : '';
    });
    return ctlBox(t('unknown'), h('div', { class: 'row' }, sel, h('button', { class: 'btn small', onclick: newUnknown }, '🎲 ' + t('newUnknown')), rev), light, info);
  }

  // ---- manual & parts ------------------------------------------------------------
  function buildManual() {
    const m = $('#manual'); m.innerHTML = '';
    const sec = (key, txt) => { m.appendChild(h('h2', {}, t(key))); m.appendChild(h('p', {}, tx(txt))); };
    sec('description', cur.text.desc); sec('assembly', cur.text.assembly); sec('use', cur.text.use); sec('theory', cur.text.theory); sec('applications', cur.text.apps);
    if (cur.group === 'B') { m.appendChild(h('h2', {}, t('morseTable'))); m.appendChild(h('div', { class: 'morse-table' }, ...Object.keys(P.MORSE).map(k => h('div', {}, k + '  ' + P.MORSE[k].replace(/\./g, '·').replace(/-/g, '—'))))); }
    m.appendChild(h('h2', {}, t('faultTitle'))); m.appendChild(h('ol', { class: 'checklist' }, ...t('faultList').map(s => h('li', {}, s))));
    m.appendChild(h('p', { class: 'src' }, t('manualSource') + ' ' + cur.pages + '. ' + t('madeBy')));
  }
  function buildParts() {
    const box = $('#partsBox'); box.innerHTML = ''; const lang = I.getLang();
    const rows = CIR.partsOf(cur).map(p => {
      let typ = '', val = '', bands = null;
      switch (p.t) {
        case 'R': typ = tx(P.CATALOG.R); val = P.fmtOhmsLong(p.v); { const b = P.resistorBands(p.v); bands = h('span', { class: 'bands' }, ...b.map(i => h('i', { style: 'background:' + P.BAND_COLORS[i] })), h('i', { style: 'background:#c9a24a' })); val = h('span', {}, bands, val + ' (' + b.map(i => P.BAND_NAMES[lang][i]).join(' / ') + ')'); } break;
        case 'C': typ = tx(P.CATALOG.C); val = P.fmtFarads(p.v, lang); break;
        case 'CE': typ = tx(P.CATALOG.CE); val = P.fmtFarads(p.v, lang); break;
        case 'T': typ = tx(P.CATALOG['T_' + p.typ]); val = p.typ; break;
        case 'D': typ = tx(P.CATALOG.D); break; case 'L': typ = tx(cur.group === 'C' ? P.CATALOG.COIL : P.CATALOG.CHOKE); break;
        case 'LDR': typ = tx(P.CATALOG.LDR); break; case 'LAMP': typ = tx(P.CATALOG.LAMP); break; case 'P': typ = tx(P.CATALOG.POT); val = P.fmtOhmsLong(p.v); break;
        case 'VC': typ = tx(P.CATALOG.VC); break; case 'KEY': typ = tx(p.id === 'MK' ? P.CATALOG.MORSE : P.CATALOG.KEY); break; case 'SL': typ = tx(P.CATALOG.SLIDE); break;
        case 'SPK': typ = tx(p.id === 'LS2' ? P.CATALOG.SPK2 : P.CATALOG.SPK); break; case 'EAR': typ = tx(P.CATALOG.EAR); break; case 'MIC': typ = tx(P.CATALOG.MIC); break; case 'PU': typ = tx(P.CATALOG.PU); break; case 'BAT': typ = tx(P.CATALOG.BAT); break;
      }
      return h('tr', {}, h('td', {}, h('b', {}, p.id)), h('td', {}, typ), h('td', {}, val));
    });
    box.appendChild(h('h2', { style: 'font-size:15px' }, t('partsList')));
    box.appendChild(h('table', { class: 'parts' }, h('thead', {}, h('tr', {}, h('th', {}, t('ref')), h('th', {}, t('type')), h('th', {}, t('value') + ' / ' + t('colourCode')))), h('tbody', {}, ...rows)));
  }

  // ---- fault finding -------------------------------------------------------------
  function buildFaultbar() {
    const fb = $('#faultbar'); fb.innerHTML = '';
    const state = h('span', { class: 'state' });
    fb.appendChild(h('button', { class: 'btn', onclick: injectFault }, '🔧 ' + t('injectFault')));
    fb.appendChild(h('button', { class: 'btn small', onclick: () => { clearFault(); st = {}; if (model.init) model.init(st); toast(t('faultFixed')); } }, t('resetBoard')));
    fb.appendChild(state);
    syncers.push(() => { state.textContent = ctl.fault ? '⚠ ' + t('faultActive') : ''; state.classList.toggle('ok', !ctl.fault); });
  }
  function injectFault() {
    const parts = CIR.partsOf(cur); const cands = [];
    parts.forEach(p => { if (p.t === 'T') cands.push({ kind: 'transistor', id: p.id }); if (p.t === 'CE') cands.push({ kind: 'electro', id: p.id }); if (p.t === 'D') cands.push({ kind: 'diode', id: p.id }); if (p.t === 'R' && p.v) cands.push({ kind: 'resistor', id: p.id }); if (p.t === 'LAMP') cands.push({ kind: 'lamp', id: p.id }); });
    cands.push({ kind: 'battery', id: 'B' }); cands.push({ kind: 'wire', id: parts[Math.floor(Math.random() * parts.length)].id });
    ctl.fault = cands[Math.floor(Math.random() * cands.length)]; faultRevealed = false;
    if (ctl.fault.kind === 'battery') ctl.battery = 0.02;
    toast('⚠ ' + t('faultActive') + ' — ' + t('faultIntro').split('.')[0] + '.');
  }
  function clearFault() { if (ctl.fault && ctl.fault.kind === 'battery') ctl.battery = 1; ctl.fault = null; faultRevealed = false; }
  function inspectPart(id, g) {
    const p = CIR.partsOf(cur).find(x => x.id === id) || { id, t: '?' }; const lang = I.getLang();
    let title = id, body = '';
    if (p.t === 'R') { const b = P.resistorBands(p.v); body = P.fmtOhmsLong(p.v) + ' — ' + b.map(i => P.BAND_NAMES[lang][i]).join(' / '); }
    else if (p.t === 'C' || p.t === 'CE') body = tx(P.CATALOG[p.t]) + ' ' + P.fmtFarads(p.v, lang);
    else if (p.t === 'T') body = tx(P.CATALOG['T_' + p.typ]) + (out && out.T && out.T[id] != null ? ' — ' + (out.T[id] > 0.5 ? t('conducting') : t('cutoff')) : '');
    else if (p.t === 'LDR') body = tx(P.CATALOG.LDR) + ' — ' + fmtR(H.ldrOhms(ctl));
    else body = tx(P.CATALOG[p.t] || { en: '', pt: '' });
    const f = ctl.fault; const isFault = f && (f.id === id || (f.kind === 'wire' && f.id === id));
    const pop = $('#popup') || document.body.appendChild(h('div', { id: 'popup' }));
    pop.innerHTML = ''; pop.appendChild(h('button', { class: 'close', onclick: () => pop.remove() }, '×')); pop.appendChild(h('h4', {}, title)); pop.appendChild(h('div', {}, body));
    if (f && isFault) { pop.appendChild(h('div', { class: 'bad' }, t('f_' + f.kind))); pop.appendChild(h('button', { class: 'btn red', style: 'margin-top:8px', onclick: () => { clearFault(); pop.remove(); toast(t('faultFixed')); } }, '🔧 ' + t('fix'))); }
    else if (f) pop.appendChild(h('div', { class: 'good' }, t('looksFine')));
    const r = g.getBoundingClientRect(); pop.style.left = Math.min(window.innerWidth - 340, r.left + r.width / 2) + 'px'; pop.style.top = Math.min(window.innerHeight - 200, r.bottom + 8) + 'px';
    document.body.appendChild(pop);
  }

  // ---- Morse decoder (your own keying) --------------------------------------------
  const decoder = {
    down: false, tDown: 0, tUp: 0, sym: '', text: '', unit: 0.12,
    reset() { this.sym = ''; this.text = ''; if (dockRefs.decoded) dockRefs.decoded.textContent = ''; },
    tick(now, keyed) {
      if (keyed && !this.down) { this.down = true; this.tDown = now; if (this.tUp && now - this.tUp > this.unit * 7 && this.text && !this.text.endsWith(' ')) this.text += ' '; }
      else if (!keyed && this.down) { this.down = false; this.tUp = now; const d = now - this.tDown; this.sym += d < this.unit * 2 ? '.' : '-'; }
      else if (!keyed && this.sym && now - this.tUp > this.unit * 3) { this.text += P.MORSE_REV[this.sym] || '¿'; this.sym = ''; }
      if (dockRefs.decoded) { const s = this.text + (this.sym ? ' ' + this.sym.replace(/\./g, '·').replace(/-/g, '—') : ''); if (dockRefs.decoded.textContent !== s) dockRefs.decoded.textContent = s; }
    },
  };

  // ---- main loop -------------------------------------------------------------------
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (ts - lastT) / 1000 || 0); lastT = ts; if (!model) return;
    // battery drain (accelerated so you can see it) and short-circuit fault
    if (out && out.mA > 0) ctl.battery = clamp(ctl.battery - dt * out.mA * 0.000004 * (ctl.fault && ctl.fault.kind === 'short' ? 400 : 1), 0, 1);
    out = model.step(ctl, st, dt);
    const live = { on: H.powered(ctl), lamp: out.lamp, keys: ctl.keys, slide: out.slide || ctl.slide, T: out.T, ldr: out.ldr, spk: Object.assign({}, out.spk, { EAR: out.ear }), pots: out.pots, faultId: ctl.fault ? ctl.fault.id : null, showFault: false };
    if (tab === 'board' && views.board) views.board.update(live); if (tab === 'schem' && views.schem) views.schem.update(live);
    // dock indicators
    if (dockRefs.lamp) { dockRefs.lamp.glow.style.opacity = out.lamp; dockRefs.lamp.fil.style.opacity = 0.3 + 0.7 * out.lamp; const lm = $('#lampMeter'); if (lm) lm.innerHTML = `<b>${Math.round(out.lamp * 100)} %</b>`; }
    Object.keys(dockRefs).filter(k => k.startsWith('spk_')).forEach(k => { const id = k.slice(4); const lvl = (out.spk && out.spk[id]) || 0; const e = dockRefs[k]; e.classList.toggle('active', lvl > 0.02); e.style.setProperty('--lvl', lvl); });
    if (dockRefs.ear) dockRefs.ear.classList.toggle('active', out.ear > 0.02);
    $('#bat1').classList.toggle('flat', ctl.battery < 0.15); $('#bat2').classList.toggle('flat', ctl.battery < 0.15);
    const anySpk = out.spk && Object.keys(out.spk).some(k => k !== 'EAR' && out.spk[k] > 0.02); $('#grille').classList.toggle('sounding', !!anySpk);
    if (dockRefs.stopwatch && out.info) { const i = out.info; dockRefs.stopwatch.textContent = (i.timing ? (i.done ? i.finalT : i.elapsed) : 0).toFixed(1) + ' s'; dockRefs.calib.textContent = t('calib') + ': ' + [0, 0.25, 0.5, 0.75, 1].map(v => (v * 10) + ' → ' + (0.6 + 14 * v).toFixed(1) + ' s').join(' · '); }
    if (dockRefs.stations && out.radio && out.radio.rows) renderStations(out.radio);
    if (cur.controls.includes('mkey')) decoder.tick(ts / 1000, !!ctl.keys.MK);
    drawScope();
    syncers.forEach(f => f());
  }
  let stationsHtml = '';
  function renderStations(r) {
    const lang = I.getLang();
    let html = `<div class="dial">${t('tunedTo')}: ${r.f0} kHz — ${r.best > 0.08 ? tx(r.bestSt.name) : t('nothing')}</div>`;
    r.rows.forEach(row => { html += `<div class="st"><span class="f">${row.st.f} kHz</span><span class="bar"><i style="width:${Math.round(row.sig * 100)}%"></i></span><span>${tx(row.st.name)}</span></div>`; });
    if (html !== stationsHtml) { dockRefs.stations.innerHTML = html; stationsHtml = html; }
  }
  function drawScope() {
    const cv = dockRefs.scope; if (!cv) return; const g = cv.getContext('2d'); const W = cv.width, Hh = cv.height;
    g.fillStyle = '#0f2b1a'; g.fillRect(0, 0, W, Hh); g.strokeStyle = 'rgba(120,200,140,.25)'; g.lineWidth = 1;
    for (let x = 0; x < W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, Hh); g.stroke(); } for (let y = 0; y < Hh; y += 27.5) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.strokeStyle = '#8ff28f'; g.lineWidth = 2; g.beginPath();
    if (cur.outputs.includes('lamp')) { slowTrace[slowIdx] = out.scope || 0; slowIdx = (slowIdx + 1) % slowTrace.length; for (let i = 0; i < slowTrace.length; i++) { const v = slowTrace[(slowIdx + i) % slowTrace.length]; const x = i / slowTrace.length * W, y = Hh - 8 - v * (Hh - 16); i ? g.lineTo(x, y) : g.moveTo(x, y); } }
    else { const buf = A.scope(); if (buf) { let mx = 0.004; for (let i = 0; i < buf.length; i++) mx = Math.max(mx, Math.abs(buf[i])); scopeGain += (0.42 / mx - scopeGain) * 0.15; const gn = Math.min(scopeGain, 100); for (let i = 0; i < buf.length; i++) { const x = i / buf.length * W, y = Hh / 2 - buf[i] * gn * Hh; i ? g.lineTo(x, y) : g.moveTo(x, y); } } else g.moveTo(0, Hh / 2), g.lineTo(W, Hh / 2); }
    g.stroke();
  }

  // ---- misc ------------------------------------------------------------------------
  let toastTimer = null; function toast(s) { const e = $('#toast'); e.textContent = s; e.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => e.classList.remove('show'), 3500); }
  let muted = localStorage.getItem('ee20.muted') === '1';
  function setMuted(m) { muted = m; A.setMuted(m); localStorage.setItem('ee20.muted', m ? '1' : '0'); $('#btnAudio').textContent = m ? t('audioOff') : t('audioOn'); }
  document.addEventListener('pointerdown', () => A.ensure(), { capture: true });
  document.addEventListener('keydown', ev => {
    if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT' || ev.target.tagName === 'TEXTAREA')) return;
    const k = ev.key; A.ensure();
    if (k === ' ') { ev.preventDefault(); if (cur.controls.includes('mkey')) ctl.keys.MK = true; else if (cur.controls.includes('akey')) ctl.keys.AK = true; }
    else if (k === 'r' || k === 'R') ctl.keys.RK = true;
    else if (k === 's' || k === 'S') { if (!ev.repeat) ctl.slide = ctl.slide === 'a' ? 'b' : 'a'; }
    else if (k === 'ArrowRight' || k === 'ArrowUp') { ev.preventDefault(); ctl.vol = clamp(ctl.vol + 0.02, 0, 1); }
    else if (k === 'ArrowLeft' || k === 'ArrowDown') { ev.preventDefault(); ctl.vol = clamp(ctl.vol - 0.02, 0, 1); }
    else { const i = '12345678'.indexOf(k), j = 'asdfghjk'.indexOf(k.toLowerCase()); const n = i >= 0 ? i : j; if (n >= 0 && cur.controls.includes('keys')) ctl.keys['K' + (n + 1)] = true; }
  });
  document.addEventListener('keyup', ev => {
    const k = ev.key; if (k === ' ') { ctl.keys.MK = false; ctl.keys.AK = false; } if (k === 'r' || k === 'R') ctl.keys.RK = false;
    const i = '12345678'.indexOf(k), j = 'asdfghjk'.indexOf(k.toLowerCase()); const n = i >= 0 ? i : j; if (n >= 0) ctl.keys['K' + (n + 1)] = false;
  });
  document.addEventListener('click', ev => { const p = $('#popup'); if (p && !p.contains(ev.target) && !ev.target.closest('.part')) p.remove(); });
  $('#btnLang').addEventListener('click', () => { I.setLang(I.getLang() === 'pt' ? 'en' : 'pt'); translateStatic(); buildSidebar(); selectCircuit(cur.id); });
  $('#btnAudio').addEventListener('click', () => setMuted(!muted));
  document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => setTab(b.getAttribute('data-tab'))));

  // ---- start -------------------------------------------------------------------------
  translateStatic(); if (muted) A.setMuted(true); buildSidebar();
  const first = localStorage.getItem('ee20.circuit'); selectCircuit(CIR.byId[first] ? first : 'A1');
  requestAnimationFrame(loop);
})(window.EE20);
