/* EE20 Simulator — SVG renderer.
   One layout (grid units, 1 u = 20 px) is rendered either as a symbolic circuit
   diagram ('sym', blue Philips style) or as the physical mounting board ('phys'). */
window.EE20 = window.EE20 || {};

(function (EE) {
  'use strict';
  const U = 20;
  const NS = 'http://www.w3.org/2000/svg';
  const P = EE.parts;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, cls, anchor) {
    const t = el('text', { x, y, class: cls || 'lab', 'text-anchor': anchor || 'middle' }, parent);
    t.textContent = s; return t;
  }
  const px = v => v * U;

  // geometry helpers for 2-terminal parts
  function seg(a, b) {
    const ax = px(a[0]), ay = px(a[1]), bx = px(b[0]), by = px(b[1]);
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    return { ax, ay, bx, by, cx: (ax + bx) / 2, cy: (ay + by) / 2, len, ang, horiz: Math.abs(dy) < 1 };
  }
  // group centred on the midpoint, rotated so local +x runs from a to b
  function partGroup(parent, a, b, cls, id) {
    const g = seg(a, b);
    const grp = el('g', { class: cls, transform: `translate(${g.cx},${g.cy}) rotate(${g.ang})`, 'data-id': id }, parent);
    grp._geo = g; return grp;
  }
  function leads(grp, halfLen, bodyHalf) {
    el('line', { x1: -halfLen, y1: 0, x2: -bodyHalf, y2: 0, class: 'lead' }, grp);
    el('line', { x1: bodyHalf, y1: 0, x2: halfLen, y2: 0, class: 'lead' }, grp);
  }
  function labelFor(parent, e, geo, lines, mode) {
    // put the label beside the part, perpendicular to its axis
    const off = e.lab === 'l' || e.lab === 't' ? -1 : 1;
    let x = geo.cx, y = geo.cy;
    if (geo.horiz) { y += off * (mode === 'phys' ? 22 : 16) + (off < 0 ? -4 : 8); }
    else { x += off * (mode === 'phys' ? 26 : 22); y += 4 - (lines.length - 1) * 6; }
    const anchor = geo.horiz ? 'middle' : (off < 0 ? 'end' : 'start');
    lines.forEach((s, i) => txt(parent, x, y + i * 12, s, i === 0 ? 'lab id' : 'lab val', anchor));
  }
  function valueText(e, lang) {
    if (e.v === undefined) return null;
    if (e.t === 'R' || e.t === 'P') return P.fmtOhmsLong(e.v);
    if (e.t === 'C' || e.t === 'CE') return P.fmtFarads(e.v, lang);
    return String(e.v);
  }

  // ---------------------------------------------------------------- symbols
  const SYM = {
    R(grp, e) { leads(grp, grp._geo.len / 2, 18);
      el('path', { d: 'M-18 0 l3 -6 l6 12 l6 -12 l6 12 l6 -12 l6 12 l3 -6', class: 'sym' }, grp); },
    P(grp, e) { SYM.R(grp, e); },
    C(grp, e) { leads(grp, grp._geo.len / 2, 4);
      el('line', { x1: -4, y1: -10, x2: -4, y2: 10, class: 'sym thick' }, grp);
      el('line', { x1: 4, y1: -10, x2: 4, y2: 10, class: 'sym thick' }, grp); },
    CE(grp, e) { leads(grp, grp._geo.len / 2, 5);
      el('rect', { x: -5, y: -10, width: 4, height: 20, class: 'sym fill' }, grp);
      el('line', { x1: 5, y1: -10, x2: 5, y2: 10, class: 'sym thick' }, grp);
      const plusAtA = e.plus !== 'b';
      txt(grp, plusAtA ? -12 : 12, -12, '+', 'lab small'); },
    L(grp, e) { const n = e.turns || 4, w = n * 8; leads(grp, grp._geo.len / 2, w / 2);
      let d = `M${-w / 2} 0`; for (let i = 0; i < n; i++) d += ` a4 4 0 0 1 8 0`;
      el('path', { d, class: 'sym' }, grp); },
    D(grp, e) { leads(grp, grp._geo.len / 2, 8);
      el('path', { d: 'M-8 -8 L8 0 L-8 8 Z', class: 'sym fill' }, grp);
      el('line', { x1: 8, y1: -8, x2: 8, y2: 8, class: 'sym thick' }, grp); },
    LDR(grp, e) { SYM.R(grp, e);
      el('path', { d: 'M-16 -22 l6 8 M-8 -24 l6 8 M-12 -14 l-4 1 l1 -4 M-4 -16 l-4 1 l1 -4', class: 'sym thin' }, grp); },
    LAMP(grp, e) { leads(grp, grp._geo.len / 2, 10);
      el('circle', { r: 10, class: 'sym lampglow', 'data-role': 'lamp' }, grp);
      el('circle', { r: 10, class: 'sym' }, grp);
      el('path', { d: 'M-7 -7 L7 7 M-7 7 L7 -7', class: 'sym' }, grp); },
    SPK(grp, e) { leads(grp, grp._geo.len / 2, 6);
      const g = el('g', { transform: 'rotate(90)' }, grp);
      el('rect', { x: -6, y: -8, width: 12, height: 16, class: 'sym' }, g);
      el('path', { d: 'M6 -8 L16 -16 L16 16 L6 8 Z', class: 'sym' }, g);
      el('path', { d: 'M20 -8 q6 8 0 16 M25 -12 q9 12 0 24', class: 'sym thin', 'data-role': 'wave' }, g); },
    EAR(grp, e) { leads(grp, grp._geo.len / 2, 6);
      el('rect', { x: -6, y: -10, width: 12, height: 20, class: 'sym' }, grp);
      el('path', { d: 'M6 -6 l6 -4 v20 l-6 -4', class: 'sym' }, grp); },
    MIC(grp, e) { leads(grp, grp._geo.len / 2, 10);
      el('circle', { r: 9, class: 'sym' }, grp); el('rect', { x: -9, y: -12, width: 4, height: 24, class: 'sym fill' }, grp); },
    PU(grp, e) { leads(grp, grp._geo.len / 2, 10);
      el('circle', { r: 9, class: 'sym' }, grp); el('line', { x1: -9, y1: 9, x2: 9, y2: -9, class: 'sym' }, grp); },
    BAT(grp, e) { // a = negative end, b = positive end (drawn along axis)
      const L = grp._geo.len / 2;
      el('line', { x1: -L, y1: 0, x2: -22, y2: 0, class: 'lead' }, grp);
      el('line', { x1: 22, y1: 0, x2: L, y2: 0, class: 'lead' }, grp);
      el('line', { x1: -22, y1: 0, x2: 22, y2: 0, class: 'lead dashed' }, grp);
      [-22, 22].forEach(x => {
        el('line', { x1: x - 3, y1: -6, x2: x - 3, y2: 6, class: 'sym thin' }, grp);
        el('line', { x1: x + 3, y1: -14, x2: x + 3, y2: 14, class: 'sym thick' }, grp);
      });
      txt(grp, -30, -18, '−', 'lab'); txt(grp, 32, -18, '+', 'lab'); txt(grp, 0, -10, '9V', 'lab id'); },
    SW(grp, e) { leads(grp, grp._geo.len / 2, 12);
      el('circle', { cx: -12, r: 2.5, class: 'sym' }, grp); el('circle', { cx: 12, r: 2.5, class: 'sym' }, grp);
      el('line', { x1: -12, y1: 0, x2: 10, y2: -10, class: 'sym thick blade', 'data-role': 'blade' }, grp); },
    KEY(grp, e) { leads(grp, grp._geo.len / 2, 12);
      el('circle', { cx: -12, r: 2.5, class: 'sym' }, grp); el('circle', { cx: 12, r: 2.5, class: 'sym' }, grp);
      el('line', { x1: -12, y1: 0, x2: 12, y2: -10, class: 'sym thick blade', 'data-role': 'blade' }, grp); },
    VC(grp, e) { SYM.C(grp, e); el('path', { d: 'M-12 12 L14 -14 M9 -14 L14 -14 L14 -9', class: 'sym thin' }, grp); },
  };

  // ---------------------------------------------------------------- physical
  const PHYS = {
    R(grp, e) { const g = grp._geo; leads(grp, g.len / 2, 16);
      el('rect', { x: -16, y: -6, width: 32, height: 12, rx: 5, class: 'ph-res' }, grp);
      const bands = P.resistorBands(e.v || 0);
      [-10, -4, 2].forEach((x, i) => el('rect', { x, y: -6, width: 4, height: 12, fill: P.BAND_COLORS[bands[i]] }, grp));
      el('rect', { x: 10, y: -6, width: 3, height: 12, fill: '#c9a24a' }, grp); },
    P(grp, e) { PHYS_printed(grp, e, 'P'); },
    C(grp, e) { const g = grp._geo; leads(grp, g.len / 2, 16);
      el('rect', { x: -16, y: -8, width: 32, height: 16, rx: 7, class: 'ph-poly' }, grp);
      txt(grp, 0, 3, P.fmtFarads(e.v, 'en'), 'ph-print'); },
    CE(grp, e) { const g = grp._geo; leads(grp, g.len / 2, 16);
      el('rect', { x: -16, y: -8, width: 32, height: 16, rx: 3, class: 'ph-elco' }, grp);
      const plusAtA = e.plus !== 'b';
      el('rect', { x: plusAtA ? -16 : 12, y: -8, width: 4, height: 16, fill: '#1c3f7a' }, grp);
      txt(grp, plusAtA ? -22 : 22, 4, '+', 'ph-plus'); },
    L(grp, e) { const g = grp._geo; leads(grp, g.len / 2, 20);
      el('rect', { x: -20, y: -7, width: 40, height: 14, rx: 2, fill: '#3a2a20' }, grp);
      for (let x = -16; x < 16; x += 4) el('line', { x1: x, y1: -7, x2: x, y2: 7, stroke: '#b0632c', 'stroke-width': 2 }, grp); },
    D(grp, e) { const g = grp._geo; leads(grp, g.len / 2, 12);
      el('rect', { x: -12, y: -5, width: 24, height: 10, rx: 4, class: 'ph-diode' }, grp);
      el('rect', { x: 6, y: -5, width: 3, height: 10, fill: '#222' }, grp); },
    LDR(grp, e) { const g = grp._geo; leads(grp, g.len / 2, 9);
      el('circle', { r: 9, class: 'ph-ldr' }, grp);
      el('path', { d: 'M-6 -3 h12 M-6 0 h12 M-6 3 h12', stroke: '#e8a23a', 'stroke-width': 1.5, fill: 'none' }, grp);
      el('circle', { r: 11, class: 'ph-ldr-light', 'data-role': 'ldr' }, grp); },
    LAMP(grp, e) { const g = grp._geo; leads(grp, g.len / 2, 12);
      el('circle', { r: 20, class: 'ph-lampglow', 'data-role': 'lamp' }, grp);
      el('circle', { r: 12, class: 'ph-lampholder' }, grp);
      el('circle', { r: 5, class: 'ph-bulb', 'data-role': 'bulb' }, grp); },
    SPK(grp, e) { PHYS_printed(grp, e, 'SPK'); SYM.SPK(grp, e); },
    EAR(grp, e) { PHYS_printed(grp, e, 'EAR'); SYM.EAR(grp, e); },
    MIC(grp, e) { PHYS_printed(grp, e, 'MIC'); SYM.MIC(grp, e); },
    PU(grp, e) { PHYS_printed(grp, e, 'PU'); SYM.PU(grp, e); },
    BAT(grp, e) { PHYS_printed(grp, e, 'BAT'); SYM.BAT(grp, e); },
    SW(grp, e) { PHYS_printed(grp, e, 'SW'); SYM.SW(grp, e); },
    KEY(grp, e) { const g = grp._geo; leads(grp, g.len / 2, 14);
      el('rect', { x: -14, y: -7, width: 28, height: 14, rx: 2, class: 'ph-key', 'data-role': 'keycap' }, grp);
      el('circle', { cx: 6, r: 3, fill: '#c9a24a' }, grp); },
    VC(grp, e) { PHYS_printed(grp, e, 'VC'); SYM.VC(grp, e); },
  };
  function PHYS_printed(grp) { grp.classList.add('printed'); }

  // ---------------------------------------------------------------- transistor
  function drawTransistor(parent, e, mode) {
    const x = px(e.x), y = px(e.y), sx = e.flip ? -1 : 1, sy = e.vflip ? -1 : 1;
    const grp = el('g', { class: 'part T', transform: `translate(${x},${y}) scale(${sx},${sy})`, 'data-id': e.id }, parent);
    // leads: base at (-40,0); collector at (30,-40); emitter at (30,40)
    el('path', { d: 'M-40 0 H-10 M-10 -8 L30 -40 M-10 8 L30 40', class: 'lead' }, grp);
    if (mode === 'sym') {
      el('circle', { r: 20, class: 'sym tbody', 'data-role': 'tbody' }, grp);
      el('line', { x1: -10, y1: -12, x2: -10, y2: 12, class: 'sym thick' }, grp);
      // PNP arrow on the emitter, pointing towards the base bar
      el('path', { d: 'M8 22 L-2 15 L4 10 Z', class: 'sym fill' }, grp);
      if (e.typ === 'AF116') el('path', { d: 'M-24 6 A22 22 0 0 0 -4 22 L4 34', class: 'lead dashed' }, grp);
    } else {
      if (e.typ === 'AF116') { el('rect', { x: -14, y: -13, width: 28, height: 26, rx: 3, class: 'ph-can' }, grp); el('rect', { x: 14, y: -9, width: 12, height: 18, rx: 2, class: 'ph-can' }, grp); }
      else { el('rect', { x: -16, y: -12, width: 32, height: 24, rx: 2, class: 'ph-ac' }, grp); el('rect', { x: -22, y: -16, width: 44, height: 6, rx: 1, class: 'ph-sink' }, grp); el('circle', { cx: 10, cy: 8, r: 2, fill: '#d33' }, grp); }
      el('circle', { r: 24, class: 'ph-thot', 'data-role': 'tbody' }, grp);
    }
    const lg = el('g', { transform: `scale(${sx},${sy})` }, grp); // un-mirror text
    txt(lg, sx * -30, sy * -6, 'b', 'lab small'); txt(lg, sx * 22, sy * -30, 'c', 'lab small'); txt(lg, sx * 22, sy * 38, 'e', 'lab small');
    txt(lg, sx * (e.flip ? -4 : 4), sy * 40 + (e.vflip ? 6 : 0) + 14 * (e.vflip ? -1 : 1) * 0 + 14, e.id, 'lab id');
    if (mode === 'phys') txt(lg, sx * 4, sy * 40 + 26, e.typ, 'lab val');
    return grp;
  }

  function drawSlide(parent, e, mode) {
    // three-way sliding switch: common c, contacts a (left) and b (right)
    const grp = el('g', { class: 'part SL', 'data-id': e.id }, parent);
    const c = [px(e.c[0]), px(e.c[1])], a = [px(e.a[0]), px(e.a[1])], b = [px(e.b[0]), px(e.b[1])];
    [c, a, b].forEach(p => el('circle', { cx: p[0], cy: p[1], r: 2.5, class: 'sym' }, grp));
    const blade = el('line', { x1: c[0], y1: c[1], x2: a[0], y2: a[1], class: 'sym thick blade', 'data-role': 'slide' }, grp);
    blade._a = a; blade._b = b; blade._c = c;
    txt(grp, c[0], c[1] + 16, e.id, 'lab id');
    if (e.la) txt(grp, a[0], a[1] - 8, e.la, 'lab small'); if (e.lb) txt(grp, b[0], b[1] - 8, e.lb, 'lab small');
    return grp;
  }

  // ---------------------------------------------------------------- main render
  function render(container, circuit, mode, opts) {
    opts = opts || {};
    const lang = EE.i18n.getLang();
    const L = circuit.layout;
    container.innerHTML = '';
    const W = px(L.w), H = px(L.h);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'schem ' + mode, preserveAspectRatio: 'xMidYMid meet' }, container);
    const defs = el('defs', {}, svg);
    const grad = el('radialGradient', { id: 'lampGrad' }, defs);
    el('stop', { offset: '0', 'stop-color': '#fff4b0', 'stop-opacity': '1' }, grad);
    el('stop', { offset: '1', 'stop-color': '#ffb000', 'stop-opacity': '0' }, grad);

    if (mode === 'phys') {
      // card background with hole grid
      el('rect', { x: 0, y: 0, width: W, height: H, class: 'card' }, svg);
      const holes = el('g', { class: 'holes' }, svg);
      for (let gx = 1; gx < L.w; gx++) for (let gy = 1; gy < L.h; gy++) el('circle', { cx: px(gx), cy: px(gy), r: 1.2 }, holes);
    } else {
      el('rect', { x: 0, y: 0, width: W, height: H, class: 'bg' }, svg);
    }

    const wires = el('g', { class: 'wires' }, svg);
    const parts = el('g', { class: 'parts' }, svg);
    const labels = el('g', { class: 'labels' }, svg);
    const dyn = { lamps: [], keys: {}, slides: [], trans: {}, ldrs: [], spk: {}, blades: {}, wipers: {}, parts: {} };

    // ---- crossings: a horizontal wire crossing a vertical wire/part axis (both strictly interior) gets a hop
    const vsegs = [], junctions = new Set();
    L.el.forEach(e => {
      if (e.t === 'W') { for (let i = 1; i < e.p.length; i++) { const a = e.p[i - 1], b = e.p[i]; if (a[0] === b[0]) vsegs.push({ x: a[0], y1: Math.min(a[1], b[1]), y2: Math.max(a[1], b[1]) }); } }
      else if (e.a && e.b && e.a[0] === e.b[0]) vsegs.push({ x: e.a[0], y1: Math.min(e.a[1], e.b[1]), y2: Math.max(e.a[1], e.b[1]) });
      if (e.t === 'J') e.p.forEach(p => junctions.add(p[0] + ',' + p[1]));
    });
    function wirePath(pts) {
      let d = 'M' + px(pts[0][0]) + ' ' + px(pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        if (a[1] === b[1] && a[0] !== b[0]) {
          const y = a[1], x1 = Math.min(a[0], b[0]), x2 = Math.max(a[0], b[0]);
          const xs = vsegs.filter(s => s.x > x1 + 0.01 && s.x < x2 - 0.01 && y > s.y1 + 0.01 && y < s.y2 - 0.01 && !junctions.has(s.x + ',' + y)).map(s => s.x);
          xs.sort((p, q) => a[0] < b[0] ? p - q : q - p);
          const dir = a[0] < b[0] ? 1 : -1, r = 6;
          xs.forEach(x => { d += ` L${px(x) - dir * r} ${px(y)} A${r} ${r} 0 0 ${dir > 0 ? 1 : 0} ${px(x) + dir * r} ${px(y)}`; });
        }
        d += ' L' + px(b[0]) + ' ' + px(b[1]);
      }
      return d;
    }

    L.el.forEach(e => {
      switch (e.t) {
        case 'W': {
          el('path', { d: wirePath(e.p), class: 'wire' + (e.ins ? ' ins' : '') + (e.dash ? ' under' : '') }, wires);
          break; }
        case 'J': e.p.forEach(p => el('circle', { cx: px(p[0]), cy: px(p[1]), r: mode === 'phys' ? 5 : 3, class: mode === 'phys' ? 'spring' : 'junction' }, wires)); break;
        case 'TXT': txt(labels, px(e.at[0]), px(e.at[1]), e.s, 'lab ' + (e.cls || 'id'), e.anchor); break;
        case 'TERM': el('circle', { cx: px(e.at[0]), cy: px(e.at[1]), r: 4, class: 'sym term' }, parts); if (e.s) txt(labels, px(e.at[0]) + (e.dx || 0), px(e.at[1]) + (e.dy || -8), e.s, 'lab small'); break;
        case 'ANT': { const x = px(e.at[0]), y = px(e.at[1]); el('path', { d: `M${x} ${y} v-24 M${x - 12} ${y - 24} l12 14 l12 -14`, class: 'sym' }, parts); break; }
        case 'GND': { const x = px(e.at[0]), y = px(e.at[1]); el('path', { d: `M${x} ${y} v8 M${x - 12} ${y + 8} h24 M${x - 8} ${y + 13} h16 M${x - 4} ${y + 18} h8`, class: 'sym' }, parts); break; }
        case 'T': { const g = drawTransistor(parts, e, mode); dyn.trans[e.id] = g; dyn.parts[e.id] = g; break; }
        case 'SL': { const g = drawSlide(parts, e, mode); dyn.slides.push(g.querySelector('[data-role=slide]')); dyn.parts[e.id] = g; break; }
        default: {
          const fn = (mode === 'phys' ? PHYS : SYM)[e.t];
          if (!fn) break;
          const g = partGroup(parts, e.a, e.b, 'part ' + e.t, e.id);
          fn(g, e);
          dyn.parts[e.id] = g;
          if (e.t === 'LAMP') dyn.lamps.push(g);
          if (e.t === 'KEY' || e.t === 'SW') dyn.keys[e.id] = g;
          if (e.t === 'LDR') dyn.ldrs.push(g);
          if (e.t === 'SPK' || e.t === 'EAR') dyn.spk[e.id] = g;
          if (e.t === 'P') {
            // wiper arrow from w to the middle of the track
            const wx = px(e.w[0]), wy = px(e.w[1]);
            const wl = el('g', { class: 'wiper' }, parts);
            el('line', { x1: wx, y1: wy, x2: g._geo.cx, y2: g._geo.cy, class: 'lead', 'data-role': 'wiperline' }, wl);
            el('path', { d: 'M0 0 L-9 -4 L-9 4 Z', class: 'sym fill', 'data-role': 'wiperhead', transform: `translate(${g._geo.cx},${g._geo.cy}) rotate(${Math.atan2(g._geo.cy - wy, g._geo.cx - wx) * 180 / Math.PI})` }, wl);
            dyn.wipers[e.id] = { line: wl.firstChild, head: wl.lastChild, geo: g._geo, w: [wx, wy] };
          }
          const lines = [e.id];
          const v = valueText(e, lang); if (v && !e.noval) lines.push(v);
          if (e.t === 'T') lines.push(e.typ);
          if (e.id && e.t !== 'BAT') labelFor(labels, e, g._geo, lines, mode);
        }
      }
    });

    // interactivity: keys (press/release), parts (inspect)
    Object.keys(dyn.keys).forEach(id => {
      const g = dyn.keys[id]; g.classList.add('clickable');
      const down = ev => { ev.preventDefault(); opts.onKey && opts.onKey(id, true); };
      const up = () => opts.onKey && opts.onKey(id, false);
      g.addEventListener('pointerdown', down); g.addEventListener('pointerup', up); g.addEventListener('pointerleave', up);
    });
    dyn.slides.forEach(bl => { bl.parentNode.classList.add('clickable'); bl.parentNode.addEventListener('click', () => opts.onSlide && opts.onSlide()); });
    Object.keys(dyn.parts).forEach(id => {
      const g = dyn.parts[id]; if (dyn.keys[id]) return;
      g.classList.add('inspectable');
      g.addEventListener('click', ev => { ev.stopPropagation(); opts.onInspect && opts.onInspect(id, g); });
    });

    function update(live) {
      svg.classList.toggle('on', !!live.on);
      dyn.lamps.forEach(g => {
        const b = Math.max(0, Math.min(1, live.lamp || 0));
        const glow = g.querySelector('[data-role=lamp]');
        if (glow) { glow.style.opacity = b; glow.style.fill = 'url(#lampGrad)'; }
        const bulb = g.querySelector('[data-role=bulb]'); if (bulb) bulb.style.fill = `rgb(${255},${Math.round(200 + 55 * b)},${Math.round(120 + 135 * (1 - b))})`;
      });
      Object.keys(dyn.keys).forEach(id => {
        const g = dyn.keys[id], on = !!(live.keys && live.keys[id]);
        const bl = g.querySelector('[data-role=blade]'); if (bl) bl.setAttribute('y2', on ? 0 : -10);
        const cap = g.querySelector('[data-role=keycap]'); if (cap) cap.classList.toggle('pressed', on);
        g.classList.toggle('pressed', on);
      });
      dyn.slides.forEach(bl => { const t = live.slide === 'b' ? bl._b : bl._a; bl.setAttribute('x2', t[0]); bl.setAttribute('y2', t[1]); });
      Object.keys(dyn.trans).forEach(id => {
        const v = live.T && live.T[id]; const body = dyn.trans[id].querySelector('[data-role=tbody]');
        if (body) body.style.opacity = v == null ? 0 : Math.max(0, Math.min(1, v)) * 0.35;
      });
      dyn.ldrs.forEach(g => { const l = g.querySelector('[data-role=ldr]'); if (l) l.style.opacity = (live.ldr || 0) * 0.9; });
      Object.keys(dyn.spk).forEach(id => { const g = dyn.spk[id]; const lvl = (live.spk && live.spk[id]) || 0; g.classList.toggle('sounding', lvl > 0.02); g.style.setProperty('--lvl', lvl); });
      Object.keys(dyn.wipers).forEach(id => {
        const w = dyn.wipers[id]; const pos = (live.pots && live.pots[id] != null) ? live.pots[id] : 0.5;
        const g = w.geo; const tx = g.ax + (g.bx - g.ax) * pos, ty = g.ay + (g.by - g.ay) * pos;
        w.line.setAttribute('x2', tx); w.line.setAttribute('y2', ty);
        w.head.setAttribute('transform', `translate(${tx},${ty}) rotate(${Math.atan2(ty - w.w[1], tx - w.w[0]) * 180 / Math.PI})`);
      });
      if (live.faultId !== undefined) Object.keys(dyn.parts).forEach(id => dyn.parts[id].classList.toggle('faulty', live.faultId === id && live.showFault));
    }
    return { svg, update, dyn };
  }

  EE.schematic = { render, U };
})(window.EE20);
