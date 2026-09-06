/* EE20 Simulator — Web Audio engine */
window.EE20 = window.EE20 || {};

(function (EE) {
  'use strict';
  const P = EE.parts;
  let ctx = null, master, analyser, buses = {}, voices = {}, noises = {}, melodies = {}, gens = {}, micNode = null, micStream = null, muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 6;
    master.connect(analyser); analyser.connect(comp); comp.connect(ctx.destination);
    // loudspeaker: small paper cone in a hardboard baffle -> bandpass + soft clip
    buses.spk = makeBus({ lo: 220, hi: 4500, peak: 1800, drive: 1.6, gain: 1.0, pan: 0 });
    buses.spk2 = makeBus({ lo: 220, hi: 4500, peak: 1800, drive: 1.6, gain: 1.0, pan: 0.6 });
    buses.bass = makeBus({ lo: 60, hi: 900, peak: 200, drive: 1.3, gain: 1.2, pan: -0.6 });
    buses.treble = makeBus({ lo: 1200, hi: 9000, peak: 3000, drive: 1.2, gain: 0.8, pan: 0.6 });
    // crystal earphone: thin, tinny
    buses.ear = makeBus({ lo: 500, hi: 3800, peak: 2200, drive: 1.0, gain: 0.55, pan: 0 });
    buses.raw = makeBus({ lo: 20, hi: 20000, peak: 1000, drive: 1.0, gain: 1.0, pan: 0 });
    return ctx;
  }
  function makeBus(o) {
    const input = ctx.createGain();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = o.lo; hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.hi; lp.Q.value = 0.9;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = o.peak; pk.Q.value = 1.2; pk.gain.value = 4;
    const ws = ctx.createWaveShaper(); ws.curve = softClip(o.drive); ws.oversample = '2x';
    const out = ctx.createGain(); out.gain.value = o.gain;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pan) pan.pan.value = o.pan;
    input.connect(hp); hp.connect(lp); lp.connect(pk); pk.connect(ws); ws.connect(out);
    if (pan) { out.connect(pan); pan.connect(master); } else out.connect(master);
    return { input, out, level: 1 };
  }
  function softClip(drive) {
    const n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
    return c;
  }
  function bus(name) { return buses[name] || buses.spk; }
  function now() { return ctx ? ctx.currentTime : 0; }
  function ramp(param, v, t) { const T = now(); param.cancelScheduledValues(T); param.setTargetAtTime(v, T, t || 0.01); }

  // ---- steady tones (oscillators) ------------------------------------------
  function setTone(id, o) {
    // o: {freq, level, wave, bus, attack, harmonics}
    if (!ctx) { if (!o || !o.level) return; ensure(); }
    let v = voices[id];
    if (!o || !o.level || o.level <= 0) { if (v) { ramp(v.g.gain, 0, o && o.release || 0.015); } return; }
    if (!v) {
      const osc = ctx.createOscillator(); osc.type = o.wave || 'sine'; osc.frequency.value = o.freq || 440;
      const g = ctx.createGain(); g.gain.value = 0; osc.connect(g); osc.start();
      v = voices[id] = { osc, g, busName: null };
    }
    if (o.wave && v.osc.type !== o.wave) v.osc.type = o.wave;
    if (o.periodic) { if (v.pw !== o.periodic) { v.osc.setPeriodicWave(o.periodic); v.pw = o.periodic; } }
    if (v.busName !== (o.bus || 'spk')) { try { v.g.disconnect(); } catch (e) { } v.g.connect(bus(o.bus).input); v.busName = o.bus || 'spk'; }
    if (o.freq) ramp(v.osc.frequency, o.freq, o.glide || 0.005);
    ramp(v.g.gain, Math.min(1, o.level), o.attack || 0.01);
  }
  function stopTone(id) { setTone(id, null); }
  // "multivibrator" wave: square with RC-rounded edges -> use a periodic wave
  let mvWave = null;
  function multivibratorWave() {
    if (mvWave) return mvWave; ensure();
    const N = 32, re = new Float32Array(N), im = new Float32Array(N);
    for (let k = 1; k < N; k += 2) im[k] = (4 / (Math.PI * k)) * Math.exp(-k / 12);
    mvWave = ctx.createPeriodicWave(re, im); return mvWave;
  }

  // ---- noise ----------------------------------------------------------------
  let noiseBuf = null, crackleBuf = null;
  function getNoiseBuffer() {
    if (noiseBuf) return noiseBuf;
    const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf = b;
  }
  function getCrackleBuffer() {
    if (crackleBuf) return crackleBuf;
    const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() - 0.5) * 0.04;
    for (let n = 0; n < 60; n++) { const p = Math.floor(Math.random() * (len - 200)); const a = 0.3 + Math.random() * 0.7; for (let k = 0; k < 40; k++) d[p + k] += a * (Math.random() * 2 - 1) * Math.exp(-k / 8); }
    return crackleBuf = b;
  }
  function setNoise(id, o) {
    // o: {level, bus, lo, hi, q, crackle}
    if (!ctx) { if (!o || !o.level) return; ensure(); }
    let n = noises[id];
    if (!o || !o.level) { if (n) ramp(n.g.gain, 0, 0.03); return; }
    if (!n) {
      const src = ctx.createBufferSource(); src.buffer = o.crackle ? getCrackleBuffer() : getNoiseBuffer(); src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = o.center || 1500; bp.Q.value = o.q || 0.5;
      const g = ctx.createGain(); g.gain.value = 0; src.connect(bp); bp.connect(g); src.start();
      n = noises[id] = { src, bp, g, busName: null };
    }
    if (n.busName !== (o.bus || 'spk')) { try { n.g.disconnect(); } catch (e) { } n.g.connect(bus(o.bus).input); n.busName = o.bus || 'spk'; }
    if (o.center) ramp(n.bp.frequency, o.center, 0.05); if (o.q) n.bp.Q.value = o.q;
    ramp(n.g.gain, o.level, 0.03);
  }

  // ---- melody player ---------------------------------------------------------
  function startMelody(id, key, o) {
    ensure(); if (melodies[id]) { setMelodyLevel(id, o.level); return; }
    const mel = P.MELODIES[key] || P.MELODIES.odeToJoy;
    const g = ctx.createGain(); g.gain.value = o.level || 0.3; g.connect(bus(o.bus).input);
    if (o.bus2) g.connect(bus(o.bus2).input);
    const m = melodies[id] = { g, key, idx: 0, next: now() + 0.1, timer: null, busName: o.bus, wave: o.wave || 'triangle' };
    const beat = 60 / mel.bpm;
    function schedule() {
      while (m.next < now() + 0.5) {
        const [n, len] = mel.notes[m.idx]; const dur = len * beat; const f = P.NOTE[n] || 0;
        if (f) {
          const osc = ctx.createOscillator(); osc.type = m.wave; osc.frequency.value = f;
          const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = f * 2;
          const eg = ctx.createGain(); eg.gain.setValueAtTime(0, m.next); eg.gain.linearRampToValueAtTime(0.5, m.next + 0.02);
          eg.gain.setTargetAtTime(0.25, m.next + 0.05, 0.15); eg.gain.setTargetAtTime(0, m.next + dur * 0.85, 0.03);
          const eg2 = ctx.createGain(); eg2.gain.value = 0.15;
          osc.connect(eg); osc2.connect(eg2); eg2.connect(eg); eg.connect(m.g);
          osc.start(m.next); osc.stop(m.next + dur + 0.2); osc2.start(m.next); osc2.stop(m.next + dur + 0.2);
        }
        m.next += dur; m.idx = (m.idx + 1) % mel.notes.length;
      }
    }
    schedule(); m.timer = setInterval(schedule, 150);
    if (o.crackle) setNoise(id + ':crackle', { level: o.crackle, bus: o.bus, crackle: true, center: 3000, q: 0.3 });
  }
  function setMelodyLevel(id, level, crackle) {
    const m = melodies[id]; if (!m) return; ramp(m.g.gain, level, 0.05);
    if (noises[id + ':crackle']) ramp(noises[id + ':crackle'].g.gain, crackle == null ? level * 0.5 : crackle, 0.05);
  }
  function stopMelody(id) {
    const m = melodies[id]; if (!m) return; clearInterval(m.timer); ramp(m.g.gain, 0, 0.05);
    setTimeout(() => { try { m.g.disconnect(); } catch (e) { } }, 500); delete melodies[id];
    setNoise(id + ':crackle', null);
  }

  // ---- generators (voice, birds, telephone, clock, morse sender) ------------
  function startGen(id, kind, o) {
    ensure(); if (gens[id]) { gens[id].setLevel(o.level); return gens[id]; }
    let g;
    if (kind === 'voice') g = genVoice(id, o);
    else if (kind === 'birds') g = genBirds(id, o);
    else if (kind === 'telephone') g = genTelephone(id, o);
    else if (kind === 'clock') g = genClock(id, o);
    else if (kind === 'pips') g = genPips(id, o);
    else if (kind === 'morse') g = genMorse(id, o);
    else if (kind === 'baby') g = genBaby(id, o);
    gens[id] = g; return g;
  }
  function stopGen(id) { const g = gens[id]; if (!g) return; g.stop(); delete gens[id]; }
  function setGenLevel(id, level) { const g = gens[id]; if (g) g.setLevel(level); }

  function genVoice(id, o) {
    // muffled "speech": band-limited noise with random formant and syllable envelope
    const src = ctx.createBufferSource(); src.buffer = getNoiseBuffer(); src.loop = true;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6; f1.frequency.value = 500;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 8; f2.frequency.value = 1400;
    const buzz = ctx.createOscillator(); buzz.type = 'sawtooth'; buzz.frequency.value = o.pitch || 130;
    const bg = ctx.createGain(); bg.gain.value = 0.6;
    const env = ctx.createGain(); env.gain.value = 0; const out = ctx.createGain(); out.gain.value = o.level || 0.3;
    src.connect(f1); src.connect(f2); buzz.connect(bg); bg.connect(f1); bg.connect(f2);
    f1.connect(env); f2.connect(env); env.connect(out); out.connect(bus(o.bus).input); src.start(); buzz.start();
    let alive = true;
    (function syllable() {
      if (!alive) return; const T = now();
      const voiced = Math.random() < 0.8, dur = 0.08 + Math.random() * 0.18;
      f1.frequency.setTargetAtTime(300 + Math.random() * 500, T, 0.03); f2.frequency.setTargetAtTime(900 + Math.random() * 1600, T, 0.03);
      buzz.frequency.setTargetAtTime((o.pitch || 130) * (0.85 + Math.random() * 0.4), T, 0.05);
      env.gain.setTargetAtTime(voiced ? 0.9 : 0.2, T, 0.02); env.gain.setTargetAtTime(0, T + dur, 0.03);
      const pause = Math.random() < 0.18 ? 0.35 + Math.random() * 0.5 : 0.03 + Math.random() * 0.08;
      setTimeout(syllable, (dur + pause) * 1000);
    })();
    return { setLevel: v => ramp(out.gain, v, 0.05), stop: () => { alive = false; ramp(out.gain, 0, 0.05); setTimeout(() => { try { src.stop(); buzz.stop(); out.disconnect(); } catch (e) { } }, 300); } };
  }
  function genBaby(id, o) {
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500;
    const env = ctx.createGain(); env.gain.value = 0; const out = ctx.createGain(); out.gain.value = o.level || 0.3;
    osc.connect(f); f.connect(env); env.connect(out); out.connect(bus(o.bus).input); osc.start();
    let alive = true;
    (function cry() { if (!alive) return; const T = now(); osc.frequency.setValueAtTime(420, T); osc.frequency.linearRampToValueAtTime(560, T + 0.4); osc.frequency.linearRampToValueAtTime(380, T + 1.1);
      env.gain.setTargetAtTime(0.5, T, 0.08); env.gain.setTargetAtTime(0, T + 0.9, 0.15); setTimeout(cry, 1600 + Math.random() * 800); })();
    return { setLevel: v => ramp(out.gain, v, 0.05), stop: () => { alive = false; ramp(out.gain, 0, 0.05); setTimeout(() => { try { osc.stop(); out.disconnect(); } catch (e) { } }, 300); } };
  }
  function genBirds(id, o) {
    const out = ctx.createGain(); out.gain.value = o.level || 0.3; out.connect(bus(o.bus).input); let alive = true;
    (function chirp() {
      if (!alive) return; const T = now(); const n = 2 + Math.floor(Math.random() * 5); const base = 2200 + Math.random() * 2000;
      for (let i = 0; i < n; i++) {
        const t0 = T + i * (0.09 + Math.random() * 0.05); const osc = ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.setValueAtTime(base, t0); osc.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.5), t0 + 0.04); osc.frequency.exponentialRampToValueAtTime(base * 0.9, t0 + 0.08);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.5, t0 + 0.01); g.gain.linearRampToValueAtTime(0, t0 + 0.08);
        osc.connect(g); g.connect(out); osc.start(t0); osc.stop(t0 + 0.1);
      }
      setTimeout(chirp, 600 + Math.random() * 2200);
    })();
    return { setLevel: v => ramp(out.gain, v, 0.05), stop: () => { alive = false; ramp(out.gain, 0, 0.05); setTimeout(() => { try { out.disconnect(); } catch (e) { } }, 300); } };
  }
  function genTelephone(id, o) {
    // ring, then a conversation (two voices taking turns) as heard through the pick-up coil (hum + voice)
    const out = ctx.createGain(); out.gain.value = o.level || 0.3; out.connect(bus(o.bus).input);
    const hum = ctx.createOscillator(); hum.frequency.value = 50; const hg = ctx.createGain(); hg.gain.value = 0.03; hum.connect(hg); hg.connect(out); hum.start();
    const sub = makeSubBus(out);
    const v1 = genVoice(id + 'v1', { level: 0, bus: sub, pitch: 120 }), v2 = genVoice(id + 'v2', { level: 0, bus: sub, pitch: 210 });
    let alive = true, who = 0;
    (function turn() { if (!alive) return; who = 1 - who; v1.setLevel(who ? 0.9 : 0); v2.setLevel(who ? 0 : 0.9); setTimeout(turn, 1500 + Math.random() * 3500); })();
    return { setLevel: v => ramp(out.gain, v, 0.05), stop: () => { alive = false; v1.stop(); v2.stop(); ramp(out.gain, 0, 0.05); setTimeout(() => { try { hum.stop(); out.disconnect(); } catch (e) { } }, 300); } };
  }
  function makeSubBus(dest) { const g = ctx.createGain(); g.connect(dest); const name = 'sub' + Math.random().toString(36).slice(2); buses[name] = { input: g, out: g }; return name; }
  function genClock(id, o) {
    const out = ctx.createGain(); out.gain.value = o.level || 0.3; out.connect(bus(o.bus).input); let alive = true;
    (function tick() { if (!alive) return; const T = now(); const s = ctx.createBufferSource(); s.buffer = getNoiseBuffer(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 4000; f.Q.value = 3;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.8, T); g.gain.exponentialRampToValueAtTime(0.001, T + 0.03); s.connect(f); f.connect(g); g.connect(out); s.start(T); s.stop(T + 0.05); setTimeout(tick, 200); })();
    return { setLevel: v => ramp(out.gain, v, 0.05), stop: () => { alive = false; ramp(out.gain, 0, 0.05); setTimeout(() => { try { out.disconnect(); } catch (e) { } }, 300); } };
  }
  function genPips(id, o) {
    const out = ctx.createGain(); out.gain.value = o.level || 0.3; out.connect(bus(o.bus).input); let alive = true;
    const sub = makeSubBus(out); const v = genVoice(id + 'v', { level: 0, bus: sub, pitch: 110 });
    (function cycle() {
      if (!alive) return; const T = now();
      for (let i = 0; i < 6; i++) { const osc = ctx.createOscillator(); osc.frequency.value = 1000; const g = ctx.createGain(); g.gain.setValueAtTime(0.4, T + i); g.gain.setValueAtTime(0, T + i + (i === 5 ? 0.5 : 0.1)); osc.connect(g); g.connect(out); osc.start(T + i); osc.stop(T + i + 0.6); }
      setTimeout(() => v.setLevel(0.8), 6500); setTimeout(() => v.setLevel(0), 15000); setTimeout(cycle, 20000);
    })();
    return { setLevel: x => ramp(out.gain, x, 0.05), stop: () => { alive = false; v.stop(); ramp(out.gain, 0, 0.05); setTimeout(() => { try { out.disconnect(); } catch (e) { } }, 300); } };
  }
  function genMorse(id, o) {
    // automatic sender: text at wpm, repeats; o.onSymbol(char) callback
    const out = ctx.createGain(); out.gain.value = o.level || 0.3; out.connect(bus(o.bus).input);
    const osc = ctx.createOscillator(); osc.type = o.wave || 'sine'; osc.frequency.value = o.freq || 800; const kg = ctx.createGain(); kg.gain.value = 0; osc.connect(kg); kg.connect(out); osc.start();
    let alive = true, timer = null; const wpm = o.wpm || 12, dot = 1.2 / wpm; const text = (o.text || 'CQ CQ DE EE20').toUpperCase();
    function schedule() {
      let T = now() + 0.2; const evs = [];
      for (const ch of text) {
        if (ch === ' ') { T += dot * 4; continue; }
        const code = P.MORSE[ch]; if (!code) continue; evs.push([T, ch]);
        for (const s of code) { const d = s === '.' ? dot : dot * 3; kg.gain.setValueAtTime(0.9, T); kg.gain.setValueAtTime(0, T + d); T += d + dot; }
        T += dot * 2;
      }
      if (o.onSymbol) evs.forEach(([t, c]) => setTimeout(() => alive && o.onSymbol(c), Math.max(0, (t - now()) * 1000)));
      timer = setTimeout(() => alive && !o.once && schedule(), (T - now() + dot * 10) * 1000);
      if (o.once && o.onDone) setTimeout(() => alive && o.onDone(), (T - now() + 0.3) * 1000);
    }
    schedule();
    return { setLevel: v => ramp(out.gain, v, 0.05), stop: () => { alive = false; clearTimeout(timer); ramp(out.gain, 0, 0.02); setTimeout(() => { try { osc.stop(); out.disconnect(); } catch (e) { } }, 300); } };
  }

  // ---- microphone --------------------------------------------------------------
  let micGain = null;
  async function enableMic() {
    ensure(); if (micNode) return true;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      micNode = ctx.createMediaStreamSource(micStream); micGain = ctx.createGain(); micGain.gain.value = 0; micNode.connect(micGain);
      micAn = ctx.createAnalyser(); micAn.fftSize = 512; micNode.connect(micAn); micBuf = new Float32Array(micAn.fftSize);
      return true;
    } catch (e) { return false; }
  }
  let micAn = null, micBuf = null, micBusName = null;
  function micTo(busName, level) {
    if (!micGain) return; if (micBusName !== busName) { try { micGain.disconnect(); } catch (e) { } micGain.connect(bus(busName).input); micBusName = busName; }
    ramp(micGain.gain, level, 0.03);
  }
  function micLevel() { if (!micAn) return 0; micAn.getFloatTimeDomainData(micBuf); let s = 0; for (let i = 0; i < micBuf.length; i++) s += micBuf[i] * micBuf[i]; return Math.sqrt(s / micBuf.length); }
  function hasMic() { return !!micNode; }

  // ---- scope / util ----------------------------------------------------------
  const scopeBuf = new Float32Array(1024);
  function scope() { if (!analyser) return null; analyser.getFloatTimeDomainData(scopeBuf); return scopeBuf; }
  function setMuted(m) { muted = m; if (master) ramp(master.gain, m ? 0 : 0.8, 0.05); }
  function silenceAll() {
    Object.keys(voices).forEach(id => setTone(id, null)); Object.keys(noises).forEach(id => setNoise(id, null));
    Object.keys(melodies).forEach(stopMelody); Object.keys(gens).forEach(stopGen); if (micGain) ramp(micGain.gain, 0, 0.02);
  }
  function oneShot(kind, o) {
    // clap / door slam: short noise burst on the given bus
    ensure(); const T = now(); const s = ctx.createBufferSource(); s.buffer = getNoiseBuffer();
    const f = ctx.createBiquadFilter(); f.type = kind === 'slam' ? 'lowpass' : 'bandpass'; f.frequency.value = kind === 'slam' ? 300 : 2500; f.Q.value = 1;
    const g = ctx.createGain(); g.gain.setValueAtTime(o.level || 0.5, T); g.gain.exponentialRampToValueAtTime(0.001, T + (kind === 'slam' ? 0.35 : 0.12));
    s.connect(f); f.connect(g); g.connect(bus(o.bus || 'raw').input); s.start(T); s.stop(T + 0.5);
  }

  EE.audio = { ensure, get ctx() { return ctx; }, now, setTone, stopTone, multivibratorWave, setNoise, startMelody, setMelodyLevel, stopMelody, startGen, stopGen, setGenLevel, enableMic, micTo, micLevel, hasMic, scope, setMuted, silenceAll, oneShot, bus };
})(window.EE20);
