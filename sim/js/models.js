/* EE20 Simulator — behavioural models of the 22 circuits.
   Each model: step(ctl, st, dt) -> out {lamp, T:{}, spk:{id:level}, ear, mA, scope, info}
   Models talk to EE.audio directly; the app silences everything when the circuit changes. */
window.EE20 = window.EE20 || {};

(function (EE) {
  'use strict';
  const A = EE.audio, P = EE.parts;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  // ---- environment helpers ------------------------------------------------------
  function luxOn(ctl) { return ctl.cover ? 0.3 : (ctl.lux * 800 + (ctl.torch ? 3000 : 0)); }
  function ldrOhms(ctl) { return 1e6 * Math.pow(1 + luxOn(ctl), -0.85); }
  function battV(ctl, mA) { const c = clamp(ctl.battery, 0, 1); return Math.max(0, 9.0 * Math.pow(c, 0.12) - (mA || 0) * 0.004); }
  function fault(ctl) { return ctl.fault || null; }
  // what a hidden assembly fault does to the set
  function fx(ctl) {
    const f = fault(ctl); const r = { dead: false, gain: 1, lampDead: false, hum: 0 };
    if (!f) return r;
    if (f.kind === 'battery' || f.kind === 'short') r.dead = true;
    else if (f.kind === 'lamp') r.lampDead = true;
    else if (f.kind === 'electro') { r.gain = 0.25; r.hum = 0.15; }
    else if (f.kind === 'resistor') r.gain = 0.4;
    else r.dead = true; // transistor, diode, wire
    return r;
  }
  function powered(ctl) { const f = fx(ctl); return ctl.vol > 0.02 && battV(ctl, 0) > 5.5 && !f.dead; }
  function soundLevel(ctl) {
    let s = ctl.soundLvl * 0.8;
    if (ctl.clapT) { const age = A.now() - ctl.clapT; if (age >= 0 && age < 0.6) s += ctl.clapAmp * Math.exp(-age * 6); }
    if (ctl.micLive && A.hasMic()) s += A.micLevel() * 6;
    return s;
  }
  function lampOut(drive, st, dt, f) {
    // incandescent lag + fault
    if (f.lampDead) drive = 0;
    st.lampB = st.lampB == null ? drive : st.lampB + (drive - st.lampB) * clamp(dt / 0.06, 0, 1);
    return smooth(st.lampB);
  }
  function base(ctl, mA) { return { lamp: 0, T: {}, spk: {}, ear: 0, mA: mA || 0, scope: 0, info: null, V: battV(ctl, mA || 0) }; }

  // ---- gramophone helper --------------------------------------------------------
  function gramophone(id, ctl, on, level, bus, bus2) {
    if (on && ctl.gram && level > 0.001) { A.startMelody(id, ctl.gramSong, { bus, bus2, level, crackle: level * 0.4 }); A.setMelodyLevel(id, level, level * 0.4); return level; }
    A.stopMelody(id); return 0;
  }
  // microphone / simulated voice into a bus, with acoustic feedback howl
  function micChain(id, ctl, st, on, gain, bus, dt) {
    let level = 0;
    if (on && ctl.micLive && A.hasMic()) { A.micTo(bus, gain * 3); level = clamp(A.micLevel() * 8 * gain, 0, 1); }
    else A.micTo(bus, 0);
    if (on && ctl.speak && !(ctl.micLive && A.hasMic())) { A.startGen(id + ':voice', 'voice', { level: gain * 0.9, bus, pitch: 140 }); A.setGenLevel(id + ':voice', gain * 0.9); level = Math.max(level, gain * 0.7); }
    else A.stopGen(id + ':voice');
    // feedback: loop gain grows as the microphone comes near the loudspeaker
    const loop = on ? gain * 2.2 / (0.12 + ctl.micDist) : 0;
    st.howl = st.howl == null ? 0 : st.howl;
    if (loop > 1) st.howl = clamp(st.howl + dt * (loop - 1) * 1.5, 0, 1); else st.howl = clamp(st.howl - dt * 2.5, 0, 1);
    A.setTone(id + ':howl', st.howl > 0.01 ? { freq: 2100 + 400 * st.howl, level: st.howl * 0.6, wave: 'sine', bus } : null);
    return Math.max(level, st.howl);
  }

  // ---- radio ----------------------------------------------------------------------
  const MW = [
    { f: 585, name: 'Radio Hilversum', bearing: 20, kind: 'music', song: 'odeToJoy', s: 1.0 },
    { f: 675, name: 'Radio Noordzee', bearing: 300, kind: 'music', song: 'greensleeves', s: 0.7 },
    { f: 747, name: 'Rádio Nacional', bearing: 210, kind: 'music', song: 'ciranda', s: 0.9 },
    { f: 900, name: { en: 'Time & weather beacon', pt: 'Sinal horário e meteorologia' }, bearing: 90, kind: 'pips', s: 0.6 },
    { f: 1008, name: 'Radio Luxembourg', bearing: 150, kind: 'music', song: 'frere', s: 0.8 },
    { f: 1170, name: { en: 'Coast station PCH (Morse)', pt: 'Estação costeira PCH (Morse)' }, bearing: 350, kind: 'morse', text: 'CQ CQ DE PCH PCH QTC K', s: 0.5 },
    { f: 1330, name: 'Rádio Popular', bearing: 240, kind: 'music', song: 'caiCai', s: 0.55 },
    { f: 1500, name: { en: 'Talk programme', pt: 'Programa falado' }, bearing: 60, kind: 'voice', s: 0.45 },
  ];
  const TRAWLER = [
    { f: 2182, name: { en: 'Trawler “Maria” calling', pt: 'Pesqueiro “Maria” chamando' }, bearing: 330, kind: 'voice', s: 0.8 },
    { f: 2650, name: { en: 'Trawler “Lisa” — the catch', pt: 'Pesqueiro “Lisa” — a pesca' }, bearing: 10, kind: 'voice', s: 0.6 },
    { f: 3200, name: { en: 'Fishery coast station (Morse)', pt: 'Estação costeira da pesca (Morse)' }, bearing: 300, kind: 'morse', text: 'VVV DE PCH WX GALE WARNING K', s: 0.7 },
    { f: 4500, name: { en: 'Time signal', pt: 'Sinal horário' }, bearing: 120, kind: 'pips', s: 0.5 },
  ];
  function tuneFreq(ctl, trawler) { return trawler ? Math.round(1670 * Math.sqrt(1 + 8 * ctl.tune)) : Math.round(520 * Math.sqrt(1 + 8.7 * ctl.tune)); }
  function radio(id, ctl, st, on, opts) {
    const trawler = !!ctl.trawler && opts.trawler; const list = trawler ? TRAWLER : MW; const f0 = tuneFreq(ctl, trawler);
    const bw = opts.bw; let best = 0, bestSt = null; const rows = [];
    list.forEach((s, i) => {
      const sel = 1 / (1 + Math.pow((f0 - s.f) / bw, 2));
      const dir = ctl.aerial ? 3 : Math.abs(Math.sin((ctl.orient - s.bearing) * Math.PI / 180)) * 1.1 + 0.03;
      const sig = clamp(sel * s.s * dir * opts.sens, 0, 1);
      rows.push({ st: s, sig, f0 });
      if (sig > best) { best = sig; bestSt = s; }
      const key = id + ':st' + i, lvl = on ? sig * ctl.vol * opts.level : 0;
      if (lvl > 0.01) {
        if (s.kind === 'music') { A.startMelody(key, s.song, { bus: opts.bus, level: lvl, wave: 'triangle' }); A.setMelodyLevel(key, lvl, 0); }
        else { A.startGen(key, s.kind, { level: lvl, bus: opts.bus, text: s.text, wpm: 16, freq: 700 }); A.setGenLevel(key, lvl); }
      } else { if (s.kind === 'music') A.stopMelody(key); else A.stopGen(key); }
    });
    // other band's generators must be off
    (trawler ? MW : TRAWLER).forEach((s, i) => { const key = id + ':' + (trawler ? 'st' : 'tw') + i; });
    const noise = on ? ctl.vol * opts.level * (0.06 + 0.12 * (1 - best)) * (ctl.aerial ? 1.3 : 1) : 0;
    A.setNoise(id + ':static', noise > 0.005 ? { level: noise, bus: opts.bus, center: 1200, q: 0.4 } : null);
    st.rows = rows; st.f0 = f0; st.best = best; st.bestSt = bestSt;
    return on ? clamp(best * ctl.vol + noise, 0, 1) : 0;
  }
  function stopRadio(id) { for (let i = 0; i < 8; i++) { A.stopMelody(id + ':st' + i); A.stopGen(id + ':st' + i); } A.setNoise(id + ':static', null); }

  // ---- the models ----------------------------------------------------------------
  const M = {};

  M.A1 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl, on ? 3 : 0);
    const lvl = gramophone('A1:gram', ctl, on, 0.7 * ctl.vol * f.gain, 'ear');
    if (f.hum && on) A.setTone('A1:hum', { freq: 100, level: f.hum, wave: 'sine', bus: 'ear' }); else A.setTone('A1:hum', null);
    o.ear = lvl; o.T = { T1: on ? 0.5 : 0, T2: on ? 0.5 + lvl * 0.5 : 0 }; o.pots = { R4: ctl.vol }; return o;
  } };
  M.A2 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl, on ? 12 : 0);
    const gram = ctl.slide === 'b';
    const g = gramophone('A2:gram', ctl, on && gram, 0.9 * ctl.vol * f.gain, 'spk');
    const m = micChain('A2', ctl, st, on && !gram, ctl.vol * f.gain, 'spk', dt);
    if (f.hum && on) A.setTone('A2:hum', { freq: 100, level: f.hum, wave: 'sine', bus: 'spk' }); else A.setTone('A2:hum', null);
    o.spk = { LS: Math.max(g, m) }; o.T = { T1: on ? 0.5 : 0, T2: on ? 0.5 : 0, T3: on ? 0.4 + 0.6 * Math.max(g, m) : 0 }; o.pots = { R7: ctl.vol }; return o;
  } };
  M.A3 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl, on ? 18 : 0);
    const g = gramophone('A3:gram', ctl, on, 1.2 * ctl.vol * f.gain, 'spk', 'spk2');
    o.spk = { LS1: g, LS2: g }; o.T = { T1: on ? 0.5 : 0, T2: on ? 0.4 + 0.6 * g : 0, T3: on ? 0.4 + 0.6 * g : 0 }; o.pots = { R4: ctl.vol }; return o;
  } };
  M.A4 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl, on ? 16 : 0);
    const g = gramophone('A4:gram', ctl, on, 1.1 * ctl.vol * f.gain, 'bass', 'treble');
    o.spk = { LS1: g, LS2: g * 0.8 }; o.bass = g; o.treble = g * 0.8; o.T = { T1: on ? 0.5 : 0, T2: on ? 0.4 + 0.6 * g : 0, T3: on ? 0.4 + 0.6 * g : 0 }; o.pots = { R2: ctl.vol }; return o;
  } };
  M.A5 = { init(st) { st.tol = [0, 0, 0, 0, 0, 0, 0, 0].map(() => 1 + (Math.random() - 0.5) * 0.04); }, step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl, on ? 6 : 0);
    let key = 0; for (let i = 8; i >= 1; i--) if (ctl.keys['K' + i]) { key = i; break; }
    const tonic = 196 * Math.pow(2, ctl.vol * 1.25);
    if (on && key && !f.dead) {
      const freq = tonic * Math.pow(2, P.SCALE[key - 1] / 12) * st.tol[key - 1];
      A.setTone('A5', { freq, level: 0.45 * f.gain, periodic: A.multivibratorWave(), wave: 'square', bus: 'spk', attack: 0.004 });
      o.spk = { LS: 0.8 }; o.info = { note: key, freq: Math.round(freq) };
    } else A.setTone('A5', null);
    o.T = { T1: on ? (key ? 0.9 : 0.2) : 0, T2: on ? (key ? 0.9 : 0.2) : 0, T3: on ? 0.5 : 0 }; o.pots = { R5: ctl.vol }; o.mA = on ? (key ? 14 : 5) : 0; return o;
  } };

  M.B1 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl, on ? 2.5 : 0);
    const keyed = on && ctl.keys.MK;
    A.setTone('B1', keyed ? { freq: 840, level: 0.55 * ctl.vol * f.gain, wave: 'sine', bus: 'ear', attack: 0.004 } : null);
    o.ear = keyed ? ctl.vol : 0; o.T = { T1: keyed ? 0.9 : (on ? 0.3 : 0) }; o.pots = { R6: ctl.vol }; o.mA = on ? (keyed ? 6 : 2.5) : 0; return o;
  } };
  M.B2 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl, on ? 5 : 0);
    const tx = ctl.twoway === 'tx'; const keyed = on && ctl.keys.MK;
    // your key: heard on the set's loudspeaker (rx) or on the friend's loudspeaker (tx)
    A.setTone('B2', keyed ? { freq: 840, level: 0.7 * ctl.vol * f.gain, wave: 'sine', bus: tx ? 'spk2' : 'spk', attack: 0.004 } : null);
    // the friend's automatic sender is heard when you are receiving
    if (on && ctl.friendSending && !tx) { A.startGen('B2:friend', 'morse', { level: 0.6 * ctl.vol * f.gain, bus: 'spk', text: ctl.friendText, wpm: ctl.friendWpm, freq: 760, once: true, onSymbol: ctl.onFriendSymbol, onDone: ctl.onFriendDone }); A.setGenLevel('B2:friend', 0.6 * ctl.vol * f.gain); }
    else if (!ctl.friendSending || tx) A.stopGen('B2:friend');
    const rx = (on && ctl.friendSending && !tx) ? 0.6 : 0;
    o.spk = { LS: (keyed && !tx ? ctl.vol : 0) + rx, LS2: keyed && tx ? ctl.vol : 0 }; o.T = { T1: keyed ? 0.9 : (on ? 0.3 : 0), T2: on ? 0.5 : 0 }; o.pots = { R6: ctl.vol }; o.slide = tx ? 'b' : 'a'; return o;
  } };
  M.B3 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl, on ? 14 : 0);
    const talk = ctl.slide === 'a';
    // talk: your voice goes to the remote loudspeaker; listen: the remote room comes out of the set
    if (talk) A.micTo('spk2', on && ctl.micLive && A.hasMic() ? ctl.vol * 3 : 0); else A.micTo('spk2', 0);
    let mine = 0; if (on && talk && ctl.micLive && A.hasMic()) mine = clamp(A.micLevel() * 8, 0, 1);
    if (on && talk && ctl.speak && !(ctl.micLive && A.hasMic())) { A.startGen('B3:me', 'voice', { level: 0.8 * ctl.vol * f.gain, bus: 'spk2', pitch: 140 }); A.setGenLevel('B3:me', 0.8 * ctl.vol * f.gain); mine = 0.7; } else A.stopGen('B3:me');
    let theirs = 0;
    if (on && !talk && ctl.friend) { A.startGen('B3:friend', 'voice', { level: 0.8 * ctl.vol * f.gain, bus: 'spk', pitch: 200 }); A.setGenLevel('B3:friend', 0.8 * ctl.vol * f.gain); theirs = 0.7; } else A.stopGen('B3:friend');
    if (on && !talk && ctl.baby) { A.startGen('B3:baby', 'baby', { level: 0.7 * ctl.vol * f.gain, bus: 'spk' }); A.setGenLevel('B3:baby', 0.7 * ctl.vol * f.gain); theirs = Math.max(theirs, 0.6); } else A.stopGen('B3:baby');
    o.spk = { LS1: theirs * ctl.vol, LS2: mine * ctl.vol }; o.T = { T1: on ? 0.5 : 0, T2: on ? 0.5 : 0, T3: on ? 0.4 + 0.6 * Math.max(mine, theirs) : 0 }; o.pots = { R3: ctl.vol }; return o;
  } };
  M.B4 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl, on ? 14 : 0);
    const coil = ctl.slide === 'a'; const g = ctl.vol * f.gain * 1.2; let lvl = 0;
    const src = ctl.pickup;
    // pick-up coil hears the telephone; the earphone-microphone hears the room
    const wantTel = on && coil && src === 'telephone';
    if (wantTel) { A.startGen('B4:tel', 'telephone', { level: g, bus: 'spk' }); A.setGenLevel('B4:tel', g); lvl = 0.7; } else A.stopGen('B4:tel');
    const micSrc = on && !coil ? src : 'silence';
    ['birds', 'clock'].forEach(k => { if (micSrc === k) { A.startGen('B4:' + k, k, { level: g * (k === 'clock' ? 0.5 : 0.8), bus: 'spk' }); A.setGenLevel('B4:' + k, g * (k === 'clock' ? 0.5 : 0.8)); lvl = 0.5; } else A.stopGen('B4:' + k); });
    if (micSrc === 'whisper') { A.startGen('B4:whisper', 'voice', { level: g * 0.5, bus: 'spk', pitch: 90 }); A.setGenLevel('B4:whisper', g * 0.5); lvl = 0.4; } else A.stopGen('B4:whisper');
    const m = micChain('B4', ctl, st, on && !coil, ctl.vol * f.gain * 1.5, 'spk', dt);
    o.spk = { LS: Math.max(lvl * ctl.vol, m) }; o.T = { T1: on ? 0.5 : 0, T2: on ? 0.5 : 0, T3: on ? 0.4 + 0.6 * Math.max(lvl, m) : 0 }; o.pots = { R3: ctl.vol }; return o;
  } };

  M.C1 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl, on ? 1.5 : 0);
    const lvl = radio('C1', ctl, st, on && !f.dead, { bus: 'ear', bw: 14, sens: 0.6 * f.gain, level: 0.7, trawler: true });
    o.ear = lvl; o.T = { T1: on ? 0.4 + 0.6 * lvl : 0 }; o.pots = { R4: ctl.vol }; o.radio = st; return o;
  }, stop() { stopRadio('C1'); } };
  M.C2 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl, on ? 3 : 0);
    const lvl = radio('C2', ctl, st, on && !f.dead, { bus: 'ear', bw: 12, sens: 1.0 * f.gain, level: 0.9, trawler: false });
    o.ear = lvl; o.T = { T1: on ? 0.4 + 0.6 * lvl : 0, T2: on ? 0.4 + 0.6 * lvl : 0 }; o.pots = { R5: ctl.vol }; o.radio = st; return o;
  }, stop() { stopRadio('C2'); } };
  M.C3 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl, on ? 12 : 0);
    const sun = ldrOhms(ctl) < 200e3; // special application: LDR in the base circuit of T3
    const lvl = radio('C3', ctl, st, on && !f.dead && sun, { bus: 'spk', bw: 12, sens: 1.0 * f.gain, level: 1.0, trawler: false });
    o.spk = { LS: lvl }; o.T = { T1: on ? 0.4 + 0.6 * lvl : 0, T2: on ? 0.4 + 0.6 * lvl : 0, T3: on && sun ? 0.4 + 0.6 * lvl : 0 }; o.pots = { R5: ctl.vol }; o.radio = st; o.ldr = clamp(luxOn(ctl) / 800, 0, 1); o.info = { sun }; return o;
  }, stop() { stopRadio('C3'); } };

  M.D1 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl);
    const R = ldrOhms(ctl); const lit = R < 60e3;
    if (!on) st.set = false; else if (ctl.keys.RK) st.set = false; else if (lit) st.set = true;
    const drive = on && st.set ? 1 : 0; o.lamp = lampOut(drive, st, dt, f);
    o.T = { T1: on && st.set ? 0.9 : (on ? 0.1 : 0), T2: on && st.set ? 0.9 : 0 }; o.ldr = clamp(luxOn(ctl) / 800, 0, 1); o.mA = on ? (st.set ? 52 : 1) : 0; o.scope = o.lamp; o.info = { R }; return o;
  } };
  M.D2 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl);
    const tOn = 0.69 * 27e3 * 10e-6 * 1.0, tOff = 0.69 * 15e3 * 100e-6; // R3·C1 and R4·C2
    if (!on) { st.t = 0; st.phase = 0; } else { st.t = (st.t || 0) + dt; const per = st.phase ? tOn : tOff; if (st.t > per) { st.t = 0; st.phase = st.phase ? 0 : 1; } }
    const drive = on && st.phase ? 1 : 0; o.lamp = lampOut(drive, st, dt, f);
    o.T = { T1: on && !st.phase ? 0.9 : 0.1 * on, T2: on && st.phase ? 0.9 : 0.1 * on }; o.mA = on ? (st.phase ? 50 : 1.5) : 0; o.scope = o.lamp; return o;
  } };
  M.D3 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl);
    const s = soundLevel(ctl); const thr = 1.15 - ctl.vol; // knob to the right = more sensitive
    if (!on) st.set = false; else if (ctl.keys.RK) st.set = false; else if (s > thr) st.set = true;
    const drive = on && st.set ? 1 : 0; o.lamp = lampOut(drive, st, dt, f);
    o.T = { T1: on ? 0.3 + 0.7 * clamp(s, 0, 1) : 0, T2: on && !st.set ? 0.8 : 0.1 * on, T3: on && st.set ? 0.9 : 0 }; o.pots = { R2: ctl.vol }; o.mA = on ? (st.set ? 54 : 3) : 0; o.scope = clamp(s, 0, 1); o.info = { s, thr }; return o;
  } };
  function whistle(id, on, level) { A.setTone(id, on ? { freq: 1050, level, periodic: A.multivibratorWave(), wave: 'square', bus: 'spk', attack: 0.02 } : null); }
  M.D4 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl);
    const ldrMode = ctl.slide === 'b'; const R = ldrOhms(ctl);
    const trig = ldrMode ? R < 40e3 : !ctl.contact;
    const sound = on && trig; whistle('D4', sound, 0.45 * f.gain * ctl.vol);
    o.spk = { LS: sound ? 0.8 : 0 }; o.T = { T1: sound ? 0.9 : 0.05 * on, T2: sound ? 0.9 : 0.05 * on }; o.ldr = clamp(luxOn(ctl) / 800, 0, 1); o.mA = on ? (sound ? 22 : 6) : 0; o.info = { R, ldrMode }; return o;
  } };
  M['D4.1'] = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl);
    const ldrMode = ctl.slide === 'a'; const R = ldrOhms(ctl);
    const trig = ldrMode ? R < 40e3 : !ctl.contact;
    const sound = on && trig; whistle('D41', sound, 0.45 * f.gain * ctl.vol);
    o.spk = { LS: sound ? 0.8 : 0 }; o.T = { T1: sound ? 0.9 : 0, T2: sound ? 0.9 : 0, T3: sound ? 0.9 : 0.05 * on }; o.ldr = clamp(luxOn(ctl) / 800, 0, 1); o.mA = on ? (sound ? 20 : 0.4) : 0; o.info = { R, ldrMode }; return o;
  } };
  M.D5 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl);
    const ldrMode = ctl.slide === 'b'; const R = ldrOhms(ctl);
    const trig = ldrMode ? R < 40e3 : (ctl.keys.AK || ctl.contact);
    if (!on) st.set = false; else if (ctl.keys.RK) st.set = false; else if (trig) st.set = true;
    const sound = on && st.set; whistle('D5', sound, 0.5 * f.gain * ctl.vol);
    o.spk = { LS: sound ? 0.85 : 0 }; o.T = { T1: sound ? 0.9 : 0.05 * on, T2: sound ? 0.9 : 0, T3: sound ? 0.9 : 0 }; o.ldr = clamp(luxOn(ctl) / 800, 0, 1); o.mA = on ? (sound ? 24 : 1) : 0; o.info = { R, ldrMode }; return o;
  } };

  M.E1 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl);
    const R = ldrOhms(ctl); const R2 = 680 + ctl.vol * 4700;
    const Vb = 9 * R2 / (R + 270 + R2);
    const d1 = clamp((Vb - 0.15) * 3, 0, 1); const drive = on ? 1 - d1 : 0;
    o.lamp = lampOut(drive, st, dt, f); o.T = { T1: on ? d1 : 0, T2: on ? drive : 0 }; o.ldr = clamp(luxOn(ctl) / 800, 0, 1); o.pots = { R2: ctl.vol }; o.mA = on ? 1 + 50 * o.lamp : 0; o.scope = o.lamp; o.info = { R, Vb }; return o;
  } };
  function probeOhms(ctl) {
    switch (ctl.probe) {
      case 'pencil': return 30e3 + 700e3 * ctl.probeDist;
      case 'dryPaper': return 5e9;
      case 'wetPaper': return 60e3 / (0.15 + ctl.probeWet);
      case 'hands': return 400e3;
      case 'pot': return 40e3 / Math.max(0.01, ctl.probeWet) + 20e3;
      case 'water': return 25e3;
      case 'distilled': return 1e9;
      case 'diodeF': return 4.7e3 + 300;
      case 'diodeR': return 1e8;
      case 'ldr': return ldrOhms(ctl);
      default: return 1e12;
    }
  }
  M.E2 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl);
    const Rp = probeOhms(ctl); const Ib = 8.5 / (Rp + 4700); const Il = Math.min(0.05, Ib * 600);
    const drive = on ? Math.pow(Il / 0.05, 1.2) : 0;
    o.lamp = lampOut(drive, st, dt, f); o.T = { T1: on ? clamp(Ib * 1e5, 0, 1) : 0, T2: on ? drive : 0 }; o.mA = on ? 0.5 + Il * 1000 : 0; o.scope = o.lamp; o.info = { Rp, Il }; o.ldr = clamp(luxOn(ctl) / 800, 0, 1); return o;
  } };
  M.E3 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl);
    const timing = ctl.slide === 'b'; const tau = 0.6 + 14 * ctl.vol;
    if (!on || !timing) { st.q = 0; st.elapsed = 0; st.done = false; }
    else { st.elapsed = (st.elapsed || 0) + dt; st.q = 1 - Math.exp(-st.elapsed / tau); if (st.q > 0.63 && !st.done) { st.done = true; st.finalT = st.elapsed; } }
    const drive = on && timing && !st.done ? 1 : (on && timing && st.q < 0.72 ? clamp((0.72 - st.q) / 0.09, 0, 1) : 0);
    o.lamp = lampOut(drive, st, dt, f); o.T = { T1: on && timing ? st.q : 0, T2: on ? drive : 0 }; o.pots = { R1: ctl.vol }; o.mA = on ? 1 + 50 * o.lamp : 0; o.scope = st.q || 0; o.info = { timing, elapsed: st.elapsed || 0, done: st.done, finalT: st.finalT, tau }; return o;
  } };
  M.E4 = { step(ctl, st, dt) {
    const on = powered(ctl), f = fx(ctl); const o = base(ctl);
    // bridge: fraction at A from S and X, fraction at B from the potentiometer (scale 0.1 … 10, logarithmic)
    const p = ctl.vol; const reading = Math.pow(10, (p - 0.5) * 2); // knob position -> ratio
    const S = ctl.standardVal, X = ctl.unknownVal, kind = ctl.unknownKind;
    let fracA;
    if (kind === 'C') fracA = S / (S + X); else fracA = (kind === 'LDR' ? ldrOhms(ctl) : X) / (S + (kind === 'LDR' ? ldrOhms(ctl) : X));
    const fracB = reading / (1 + reading);
    const imbalance = clamp(Math.abs(fracA - fracB) * 3, 0, 1);
    const lvl = on && !f.dead ? 0.06 + 0.5 * imbalance : 0;
    A.setTone('E4', on ? { freq: 800, level: lvl * f.gain, wave: 'sine', bus: 'ear', attack: 0.02 } : null);
    o.ear = on ? lvl : 0; o.T = { T1: on ? 0.8 : 0, T2: on ? 0.8 : 0 }; o.pots = { R7: ctl.vol }; o.mA = on ? 4 : 0; o.ldr = clamp(luxOn(ctl) / 800, 0, 1); o.info = { reading, imbalance, ldr: ldrOhms(ctl) }; return o;
  } };

  EE.models = { get: id => M[id], helpers: { ldrOhms, luxOn, battV, probeOhms, tuneFreq, MW, TRAWLER, soundLevel, powered, fx } };
})(window.EE20);
