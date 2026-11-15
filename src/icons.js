/* Isometric (3D-style) device icons drawn with SVG polygons. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const C = 0.866, S = 0.5, INK = '#16213e';
  const el = (tag, a, p) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); p && p.appendChild(e); return e; };
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (h, t, w = '#ffffff') => { const a = hex(h), b = hex(w); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const dark = (h, t) => mix(h, t, '#0b1020');
  const P = (x, y, z) => [(x - y) * C, (x + y) * S - z];
  const pts = a => a.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  const poly = (g, a, fill, extra) => el('polygon', Object.assign({ points: pts(a), fill, stroke: INK, 'stroke-width': 1.1, 'stroke-linejoin': 'round' }, extra || {}), g);
  const line = (g, a, b, stroke = INK, w = 1) => el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke, 'stroke-width': w, 'stroke-linecap': 'round' }, g);

  /* axis-aligned box; returns face helpers */
  function box(g, x, y, z, w, d, h, col, o = {}) {
    const top = o.top || mix(col, .55), left = o.left || mix(col, .2), right = o.right || dark(col, .18);
    poly(g, [P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], left);
    poly(g, [P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], right);
    poly(g, [P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], top);
    return {
      top: (u, v) => P(x + u, y + v, z + h), front: (u, zz) => P(x + u, y + d, z + zz), side: (v, zz) => P(x + w, y + v, z + zz),
      x, y, z, w, d, h,
    };
  }
  const rectOn = (g, f, a, b, fill, extra) => poly(g, [f(a[0], a[1]), f(b[0], a[1]), f(b[0], b[1]), f(a[0], b[1])], fill, extra);
  const circleTop = (g, cx, cy, z, r, fill, extra) => { const c = P(cx, cy, z); return el('ellipse', Object.assign({ cx: c[0], cy: c[1], rx: r * 1.2247, ry: r * .7071, fill, stroke: INK, 'stroke-width': 1.1 }, extra || {}), g); };
  const textTop = (g, cx, cy, z, s, size, fill) => { const c = P(cx, cy, z); const t = el('text', { transform: `matrix(${C},${S},${-C},${S},${c[0]},${c[1]})`, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': size, 'font-weight': 700, 'font-family': 'ui-monospace,Menlo,Consolas,monospace', fill }, g); t.textContent = s; return t; };
  const textFront = (g, f, u, zz, s, size, fill) => { const c = f(u, zz); const t = el('text', { transform: `matrix(${C},${S},0,1,${c[0]},${c[1]})`, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': size, 'font-weight': 700, 'font-family': 'ui-monospace,Menlo,Consolas,monospace', fill }, g); t.textContent = s; return t; };

  /* ---------- parts ---------- */
  function chip(g, w, d, col, label, o = {}) {
    const x = -w / 2, y = -d / 2, ph = 2.2, pin = '#c7cedb';
    const n = o.pins || Math.max(3, Math.round(w / 8));
    if (!o.noPins) {
      for (let i = 0; i < n; i++) { const u = (i + .5) * w / n - 1.5; box(g, x + u, y + d - 1, 0, 3, 5, ph, pin, { top: '#e5e9f0', left: '#c7cedb', right: '#9aa3b5' }); }
      const m = o.pinsSide === false ? 0 : Math.max(3, Math.round(d / 8));
      for (let i = 0; i < m; i++) { const v = (i + .5) * d / m - 1.5; box(g, x + w - 1, y + v, 0, 5, 3, ph, pin, { top: '#e5e9f0', left: '#c7cedb', right: '#9aa3b5' }); }
    }
    const body = o.body || '#2a3352';
    const b = box(g, x, y, 1, w, d, o.h || 6, body, { top: o.topCol || '#3a4466', left: '#2a3352', right: '#1b2238' });
    circleTop(g, x + 4, y + 4, 1 + (o.h || 6), 1.4, '#8892ad', { 'stroke-width': .6 });
    if (o.spreader) box(g, x + w * .15, y + d * .15, 1 + (o.h || 6), w * .7, d * .7, 3, '#b8c0cf', { top: '#dfe4ec', left: '#c3cad7', right: '#9aa3b5' });
    const tz = 1 + (o.h || 6) + (o.spreader ? 3 : 0);
    if (label) textTop(g, 0, 0, tz, label, o.fs || Math.min(11, w / label.length * 1.5), o.spreader ? '#2a3352' : mix(col, .45));
    return b;
  }
  function pcb(g, w, d, col) { return box(g, -w / 2, -d / 2, 0, w, d, 3, col, { top: mix(col, .35), left: dark(col, .05), right: dark(col, .3) }); }
  function rj45(g, x, y, z) { const b = box(g, x, y, z, 11, 9, 8, '#c7cedb', { top: '#e5e9f0', left: '#b6bfcf', right: '#8e98ab' }); rectOn(g, b.front, [2.5, 1.5], [8.5, 6], '#1b2238', { 'stroke-width': .6 }); }
  function rackUnit(g, z, w, d, h, col, leds) {
    const b = box(g, -w / 2, -d / 2, z, w, d, h, col);
    for (let i = 0; i < 4; i++) rectOn(g, b.front, [4 + i * 9, 2.2], [11 + i * 9, h - 2.2], dark(col, .45), { 'stroke-width': .5 });
    (leds || ['#22c55e', '#3b82f6']).forEach((c, i) => circleTop(g, -w / 2 + w - 8 - i * 5, d / 2, z + h / 2, 1.1, c, { 'stroke-width': .4 }));
    return b;
  }

  const DRAW = {
    cpu: (g, c) => chip(g, 54, 54, c, 'CPU', { spreader: true, fs: 10 }),
    pch: (g, c) => chip(g, 44, 44, c, 'PCH', { fs: 10 }),
    cpld: (g, c) => chip(g, 38, 38, c, 'CPLD', { fs: 8 }),
    mux: (g, c) => chip(g, 34, 26, c, 'MUX', { fs: 7 }),
    eeprom: (g, c) => chip(g, 26, 18, c, 'FRU', { fs: 6, pins: 4, pinsSide: false }),
    sensor: (g, c) => { pcb(g, 34, 34, '#2f8f5b'); const s = el('g', { transform: 'translate(0,-3)' }, g); chip(s, 18, 14, c, '°C', { fs: 6, pins: 3, pinsSide: false }); },
    flash: (g, c) => { const b = chip(g, 34, 22, c, 'FLASH', { fs: 5.5, pins: 4, pinsSide: false, h: 5 }); },
    vr: (g, c) => { pcb(g, 50, 36, '#2f8f5b'); [[-18, -12], [-2, -12], [-18, 3], [-2, 3]].forEach(([x, y]) => box(g, x, y, 3, 12, 12, 10, '#3a4466', { top: '#58627f', left: '#2a3352', right: '#1b2238' })); box(g, 14, -10, 3, 8, 20, 4, '#c7cedb'); },
    bmc: (g, c) => {
      pcb(g, 64, 50, c);
      const s = el('g', { transform: `translate(${P(-6, -4, 3)[0]},${P(-6, -4, 3)[1]})` }, g); chip(s, 26, 26, c, 'BMC', { fs: 7, h: 4 });
      rj45(g, 14, 12, 3); box(g, -28, 14, 3, 14, 8, 3, '#d97706', { top: '#f6c66b' });
    },
    psu: (g, c) => {
      const b = box(g, -34, -20, 0, 68, 40, 26, '#cfd6e2', { top: '#eef1f6', left: '#cfd6e2', right: '#a9b2c3' });
      const cc = b.front(20, 13); el('ellipse', { cx: cc[0], cy: cc[1], rx: 9, ry: 11, fill: '#3a4466', stroke: INK, 'stroke-width': 1 }, g);
      for (let i = -2; i <= 2; i++) { const a = b.front(20 + i * 3, 4), z = b.front(20 + i * 3, 22); line(g, a, z, '#8892ad', .8); }
      rectOn(g, b.front, [42, 8], [60, 18], '#2a3352', { 'stroke-width': .6 }); circleTop(g, 26, -14, 26, 2, c, { 'stroke-width': .6 });
      textTop(g, -10, 0, 26, 'PSU', 9, dark(c, .1));
    },
    fan: (g, c) => {
      const b = box(g, -24, -24, 0, 48, 48, 14, '#3a4466', { top: '#4b5677', left: '#2a3352', right: '#1b2238' });
      circleTop(g, 0, 0, 14, 19, '#1b2238'); circleTop(g, 0, 0, 14, 5, c);
      for (let k = 0; k < 5; k++) { const t = k * 2 * Math.PI / 5; line(g, P(5 * Math.cos(t), 5 * Math.sin(t), 14), P(17 * Math.cos(t + .5), 17 * Math.sin(t + .5), 14), mix(c, .4), 2.2); }
    },
    switch: (g, c) => {
      const b = box(g, -46, -18, 0, 92, 36, 13, '#d7dde8', { top: '#f1f4f8', left: '#cfd6e2', right: '#a9b2c3' });
      for (let i = 0; i < 8; i++) { rectOn(g, b.front, [8 + i * 9.5, 3], [15 + i * 9.5, 9], '#1b2238', { 'stroke-width': .5 }); const l = b.front(11.5 + i * 9.5, 11); el('circle', { cx: l[0], cy: l[1], r: .9, fill: i % 3 ? '#22c55e' : '#f59e0b' }, g); }
      textTop(g, -10, 0, 13, 'SWITCH', 7, dark(c, .1));
    },
    laptop: (g, c) => {
      const b = box(g, -28, -18, 0, 56, 36, 3, '#cfd6e2', { top: '#e9edf3', left: '#bfc7d5', right: '#9aa3b5' });
      for (let r = 0; r < 3; r++) line(g, b.top(8, 8 + r * 6), b.top(48, 8 + r * 6), '#a9b2c3', 1.3);
      poly(g, [P(-28, -18, 3), P(28, -18, 3), P(28, -24, 40), P(-28, -24, 40)], '#cfd6e2');
      poly(g, [P(-24, -18.6, 7), P(24, -18.6, 7), P(24, -23.4, 36), P(-24, -23.4, 36)], mix(c, .1));
      for (let r = 0; r < 3; r++) poly(g, [P(-20, -19.5, 28 - r * 7), P(6 - r * 6, -19.5, 28 - r * 7)], 'none', { stroke: mix(c, .7), 'stroke-width': 1.6 });
    },
    console: (g, c) => { rackUnit(g, 0, 56, 44, 11, '#cfd6e2'); rackUnit(g, 11, 56, 44, 11, '#cfd6e2'); const t = rackUnit(g, 22, 56, 44, 11, '#cfd6e2', [c, '#22c55e']); textTop(g, 0, 0, 33, 'MGMT', 8, dark(c, .1)); },
    server: (g, c) => { rackUnit(g, 0, 56, 44, 11, '#cfd6e2'); rackUnit(g, 11, 56, 44, 11, '#cfd6e2'); },
    dhcp: (g, c) => { rackUnit(g, 0, 50, 40, 11, '#cfd6e2'); rackUnit(g, 11, 50, 40, 11, '#cfd6e2', ['#22c55e']); textTop(g, 0, 0, 22, 'DHCP', 8, dark(c, .1)); },
    host: (g, c) => {
      rackUnit(g, 0, 56, 44, 12, '#cfd6e2');
      const b = box(g, -22, -16, 12, 44, 30, 16, c, { top: mix(c, .6), left: mix(c, .25), right: dark(c, .15) });
      textFront(g, b.front, 22, 8, 'OS', 9, '#fff');
    },
    svc: (g, c) => {
      const b = box(g, -20, -20, 4, 40, 40, 26, c, { top: mix(c, .6), left: mix(c, .2), right: dark(c, .2) });
      textFront(g, b.front, 20, 13, '</>', 11, '#fff');
      circleTop(g, 0, 0, 30, 9, mix(c, .85)); circleTop(g, 0, 0, 30, 3.5, c);
      for (let k = 0; k < 6; k++) { const t = k * Math.PI / 3; box(g, 11 * Math.cos(t) - 2, 11 * Math.sin(t) - 2, 30, 4, 4, 2, mix(c, .5)); }
    },
    bus: (g, c) => {
      const b = box(g, -50, -8, 6, 100, 16, 12, c, { top: mix(c, .55), left: mix(c, .2), right: dark(c, .2) });
      for (let i = 1; i < 6; i++) rectOn(g, b.front, [i * 16.6 - 1.5, 0], [i * 16.6 + 1.5, 12], dark(c, .35), { 'stroke-width': .5 });
      textTop(g, -18, 0, 18, 'D-BUS', 7, dark(c, .15));
    },
    kernel: (g, c) => {
      [0, 9, 18].forEach((z, i) => box(g, -30 + i * 2, -22 + i * 2, z, 60 - i * 4, 44 - i * 4, 7, i === 2 ? c : mix(c, .35 + i * .1), { top: mix(c, .55 + i * .1), left: mix(c, .2 + i * .1), right: dark(c, .1) }));
      textTop(g, 0, 0, 25, 'LINUX', 8, '#fff');
    },
    disk: (g, c) => { const b = box(g, -34, -10, 0, 68, 20, 3, '#1f6f4a', { top: '#2f8f5b', left: '#1f6f4a', right: '#155238' }); [[-26, -6], [-6, -6], [12, -6]].forEach(([x, y]) => box(g, x, y, 3, 14, 12, 2.5, '#2a3352', { top: '#3a4466' })); box(g, 30, -8, 0, 4, 16, 3.4, '#d4a017', { top: '#f0c94a' }); },
    nic: (g, c) => { pcb(g, 60, 38, c); rj45(g, 16, 6, 3); rj45(g, 16, -6, 3); const s = el('g', { transform: `translate(${P(-10, -2, 3)[0]},${P(-10, -2, 3)[1]})` }, g); chip(s, 18, 18, c, 'NIC', { fs: 5.5, h: 3, noPins: true }); box(g, -30, 19, 0, 30, 3, 6, '#d4a017', { top: '#f0c94a' }); },
    device: (g, c) => {
      pcb(g, 66, 48, '#2f8f5b');
      const hs = box(g, -26, -18, 3, 52, 36, 14, '#c7cedb', { top: '#e5e9f0', left: '#b6bfcf', right: '#8e98ab' });
      for (let i = 1; i < 9; i++) line(g, hs.top(i * 5.8, 2), hs.top(i * 5.8, 34), '#9aa3b5', 1);
      textFront(g, hs.front, 26, 7, 'GPU', 8, dark(c, .1));
      box(g, -26, 18, 3, 52, 4, 5, c);
    },
    button: (g, c) => {
      box(g, -16, -16, 0, 32, 32, 6, '#cfd6e2', { top: '#e9edf3' });
      const a = P(0, 0, 6), b2 = P(0, 0, 12), r = 9;
      el('rect', { x: a[0] - r * 1.2247, y: b2[1], width: r * 2.449, height: a[1] - b2[1], fill: dark(c, .1), stroke: 'none' }, g);
      el('ellipse', { cx: a[0], cy: a[1], rx: r * 1.2247, ry: r * .7071, fill: dark(c, .1), stroke: INK, 'stroke-width': 1.1 }, g);
      el('rect', { x: a[0] - r * 1.2247, y: b2[1], width: r * 2.449, height: a[1] - b2[1], fill: dark(c, .1), stroke: 'none' }, g);
      line(g, [a[0] - r * 1.2247, a[1]], [a[0] - r * 1.2247, b2[1]]); line(g, [a[0] + r * 1.2247, a[1]], [a[0] + r * 1.2247, b2[1]]);
      el('ellipse', { cx: b2[0], cy: b2[1], rx: r * 1.2247, ry: r * .7071, fill: mix(c, .3), stroke: INK, 'stroke-width': 1.1 }, g);
      textTop(g, 0, 0, 12, '⏻', 9, '#fff');
    },
    chassis: (g, c) => { const b = box(g, -30, -22, 0, 60, 44, 44, '#cfd6e2', { top: '#eef1f6', left: '#cfd6e2', right: '#a9b2c3' }); for (let i = 0; i < 4; i++) rectOn(g, b.front, [4, 4 + i * 10], [56, 11 + i * 10], i === 0 ? mix(c, .2) : '#9aa3b5', { 'stroke-width': .6 }); },
    blade: (g, c) => { const b = box(g, -32, -24, 0, 64, 48, 10, '#cfd6e2', { top: '#eef1f6' }); rectOn(g, b.front, [4, 2], [20, 8], mix(c, .2), { 'stroke-width': .6 }); circleTop(g, 20, 24, 5, 1.2, '#22c55e', { 'stroke-width': .4 }); const s = el('g', { transform: `translate(${P(0, -4, 10)[0]},${P(0, -4, 10)[1]})` }, g); chip(s, 18, 18, c, 'BMC', { fs: 5, h: 3, noPins: true }); },
    gpio: (g, c) => chip(g, 24, 24, c, 'IO', { fs: 6 }),
    usb: (g, c) => {
      const b = box(g, -34, -14, 0, 68, 28, 4, '#cfd6e2', { top: '#e9edf3', left: '#bfc7d5', right: '#9aa3b5' });
      for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) rectOn(g, b.top, [3 + k * 7.1, 3 + r * 7.5], [8.6 + k * 7.1, 8.6 + r * 7.5], '#f8fafc', { 'stroke-width': .5 });
      const m = box(g, 22, 18, 0, 10, 14, 5, c, { top: mix(c, .5) });
      box(g, -30, 18, 0, 16, 8, 4, '#3a4466', { top: '#58627f' });
    },
  };

  function draw(parent, type, color) {
    const g = el('g', { class: 'ico' }, parent);
    el('ellipse', { cx: 0, cy: 6, rx: 52, ry: 22, fill: 'rgba(22,33,62,.07)' }, g);
    (DRAW[type] || DRAW.gpio)(g, color);
    return g;
  }
  window.FXI = { draw, mix };
})();
