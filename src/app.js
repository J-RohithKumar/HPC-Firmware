(function () {
  const { B, bytesOf } = FX;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SVGNS = 'http://www.w3.org/2000/svg';
  const CATS = [['all', 'All'], ['foundations', 'Foundations'], ['hardware', 'Hardware'], ['protocols', 'Protocols'], ['ilo', 'iLO'], ['firmware', 'Firmware'], ['xd685', 'XD685 / Cray']];
  const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#8b5cf6', '#ef4444', '#0891b2', '#db2777', '#65a30d', '#475569'];
  const TYPE = {
    bmc: ['BMC', '#1d4ed8'], cpu: ['CPU', '#7c3aed'], flash: ['SPI FLASH', '#d97706'], psu: ['PSU', '#dc2626'], cpld: ['CPLD', '#0891b2'],
    pch: ['PCH', '#4f46e5'], laptop: ['ADMIN', '#475569'], switch: ['SWITCH', '#16a34a'], sensor: ['SENSOR', '#ea580c'], nic: ['NIC', '#0d9488'],
    console: ['CONSOLE', '#1e40af'], host: ['HOST OS', '#7c3aed'], svc: ['SERVICE', '#2563eb'], disk: ['DISK', '#64748b'], fan: ['FAN', '#0284c7'],
    mux: ['MUX', '#a16207'], eeprom: ['EEPROM', '#ca8a04'], vr: ['VR', '#be123c'], chassis: ['CHASSIS MGR', '#334155'], button: ['BUTTON', '#6b7280'],
    device: ['DEVICE', '#0d9488'], usb: ['USB', '#475569'], kernel: ['KERNEL', '#9333ea'], bus: ['D-BUS', '#0369a1'], server: ['SERVER', '#334155'], dhcp: ['DHCP', '#15803d'],
    blade: ['BLADE', '#475569'], gpio: ['GPIO', '#6b7280'],
  };
  const LINK = {
    lan: ['#16a34a', '', 'Ethernet'], i2c: ['#ea580c', '6 4', 'I²C / SMBus'], spi: ['#d97706', '2 3', 'SPI'], power: ['#dc2626', '', 'Power'],
    gpio: ['#6b7280', '1 4', 'GPIO / signal'], pcie: ['#7c3aed', '', 'PCIe'], espi: ['#4f46e5', '8 3', 'eSPI / LPC'], dbus: ['#0369a1', '4 3', 'D-Bus (software)'],
    ncsi: ['#0d9488', '8 3 2 3', 'NC-SI (RBT)'], usb: ['#475569', '5 2', 'USB'], sw: ['#94a3b8', '3 3', 'Software call'], mctp: ['#be185d', '6 2', 'MCTP'],
    wire: ['#334155', '', 'Wire / cable'], trace: ['#d97706', '', 'PCB trace'], opt: ['#eab308', '', 'Optical fiber'], rf: ['#c026d3', '2 6', 'Wireless / sideband'],
  };
  const LESSONS = window.LESSONS;
  LESSONS.forEach(l => {
    l.msgs.forEach((m, i) => { m.i = i; m.bytes = l && m.layers ? m.layers.flatMap(x => bytesOf(x.fields)) : []; });
    const protos = [...new Set(l.msgs.map(m => m.proto))];
    l.pcolor = {}; protos.forEach((p, i) => l.pcolor[p] = (l.colors && l.colors[p]) || PALETTE[i % PALETTE.length]);
    l.nodeMap = Object.fromEntries(l.nodes.map(n => [n.id, n]));
  });

  const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
  const st = {
    cat: 'all', q: '', lesson: null, cur: -1, sel: null, fsel: null, playing: false, anim: false, view: 'net', speed: 1,
    done: JSON.parse((store && store.getItem('fwx-done')) || '{}'), tutMin: false,
    pauseSteps: !store || store.getItem('fwx-pausesteps') !== '0',
  };

  /* ---------------- lesson validation (dev aid) ---------------- */
  function validateLessons() {
    const warn = (l, msg) => console.warn(`[firmware-explorer] lesson "${l.id}": ${msg}`);
    LESSONS.forEach(l => {
      if (!l.nodes || !l.nodes.length || !l.msgs || !l.msgs.length) return warn(l, 'missing nodes or msgs');
      const ids = new Set(l.nodes.map(n => n.id));
      if (ids.size !== l.nodes.length) warn(l, 'duplicate node ids');
      l.nodes.forEach(n => { if (!TYPE[n.type]) warn(l, `node "${n.id}" has unknown type "${n.type}"`); });
      l.links.forEach((k, i) => {
        if (!ids.has(k.a) || !ids.has(k.b)) warn(l, `link ${i} references missing node (${k.a} → ${k.b})`);
        if (!LINK[k.kind]) warn(l, `link ${i} has unknown kind "${k.kind}"`);
      });
      const nsteps = (l.steps || []).length;
      l.msgs.forEach((m, i) => {
        [m.from, m.to, ...(m.via || [])].forEach(id => { if (!ids.has(id)) warn(l, `msg ${i} references missing node "${id}"`); });
        if (!(m.step >= 0 && m.step < nsteps)) warn(l, `msg ${i} has step ${m.step} out of range (0–${nsteps - 1})`);
        if (!m.layers || !m.layers.length) warn(l, `msg ${i} has no layers`);
        if (m.from === m.to && (m.via || []).length) warn(l, `msg ${i} is a self-message but has via hops`);
      });
      (l.steps || []).forEach((s, i) => { if (!l.msgs.some(m => m.step === i)) warn(l, `step ${i} ("${s.title}") has no messages`); });
    });
  }
  validateLessons();

  /* ---------------- lesson list ---------------- */
  function renderCats() {
    $('#cats').innerHTML = CATS.map(([k, n]) => `<button data-c="${k}" class="${st.cat === k ? 'on' : ''}">${n.toUpperCase()}<b>${k === 'all' ? LESSONS.length : LESSONS.filter(l => l.cat === k).length}</b></button>`).join('');
  }
  function renderList() {
    const q = st.q.toLowerCase();
    const hay = l => (l.title + ' ' + l.subtitle + ' ' + (l.keywords || '') + ' ' + (l.tags || []).join(' ') + ' ' + (l.overview || []).join(' ') + ' ' + (l.steps || []).map(s => s.title + ' ' + (s.text || '')).join(' ') + ' ' + (l.msgs || []).map(m => m.proto + ' ' + m.info + ' ' + (m.short || '')).join(' ')).toLowerCase();
    const items = LESSONS.filter(l => (st.cat === 'all' || l.cat === st.cat) && (!q || hay(l).includes(q))).sort((a, b) => (a.ord || 999) - (b.ord || 999));
    const curStep = st.lesson && st.cur >= 0 ? st.lesson.msgs[st.cur].step : -1;
    const item = l => {
      const on = st.lesson === l;
      const need = (l.prereq || []).filter(p => !st.done[p]).length;
      let html = `<div class="les ${on ? 'on' : ''}" data-l="${l.id}"><span class="dot ${st.done[l.id] ? 'done' : ''}"></span><div style="flex:1"><div class="t">${esc(l.title)}${need ? '<span class="pre">PREREQ</span>' : ''}</div><div class="s">${esc(l.subtitle)}${l.mins ? ' · ' + l.mins + ' min' : ''}</div></div><span>${on ? '▾' : '›'}</span></div>`;
      if (on) html += `<div class="steps">` + l.steps.map((s, i) => `<div class="stp ${i === curStep ? 'on' : i < curStep ? 'past' : ''}" data-s="${i}"><span class="n">${i + 1}</span><div><div class="t">${esc(s.title)}</div><div class="s">${esc(s.sub || '')}</div></div></div>`).join('') + `</div>`;
      return html;
    };
    let html = '';
    if (st.cat === 'all' && !q) {
      for (const [k, name] of CATS.slice(1)) {
        const g = items.filter(l => l.cat === k);
        if (!g.length) continue;
        const dn = g.filter(l => st.done[l.id]).length;
        html += `<div class="lgroup">${name}<span>${dn}/${g.length}</span></div>` + g.map(item).join('');
      }
    } else html = items.map(item).join('');
    $('#list').innerHTML = html || '<p class="muted" style="padding:10px">No lessons match.</p>';
    const n = Object.keys(st.done).filter(k => st.done[k]).length;
    $('#progress').textContent = `${n}/${LESSONS.length} done`;
  }

  /* ---------------- diagram ---------------- */
  function el(tag, attrs, parent) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  let svg, packetLayer;
  function renderNet() {
    const l = st.lesson, c = $('#canvas'); c.innerHTML = '';
    svg = el('svg', { viewBox: '0 0 1000 560', preserveAspectRatio: 'xMidYMid meet' }, c);
    const defs = el('defs', {}, svg), pat = el('pattern', { id: 'isodots', width: 26, height: 15, patternUnits: 'userSpaceOnUse' }, defs);
    el('circle', { cx: 1, cy: 1, r: 1, class: 'gdot' }, pat); el('circle', { cx: 14, cy: 8.5, r: 1, class: 'gdot' }, pat);
    el('rect', { x: -500, y: -300, width: 2000, height: 1200, fill: 'url(#isodots)' }, svg);
    (l.zones || []).forEach(z => { const g = el('g', { class: 'zone' }, svg); el('rect', { x: z.x, y: z.y, width: z.w, height: z.h, rx: 8 }, g); const t = el('text', { x: z.x + 10, y: z.y + z.h - 8 }, g); t.textContent = z.label.toUpperCase(); });
    const lg = el('g', {}, svg);
    l.links.forEach((k, i) => {
      const a = l.nodeMap[k.a], b = l.nodeMap[k.b]; const [col, dash] = LINK[k.kind] || LINK.sw;
      const g = el('g', { class: 'lkgrp' }, lg);
      const mk = d => { const p = el('path', { d, class: 'link', stroke: col, 'stroke-dasharray': dash }, g); return p; };
      const straight = `M${a.x} ${a.y} L${b.x} ${b.y}`;
      if (k.kind === 'opt') {
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len * 3.5, ny = dx / len * 3.5;
        mk(`M${a.x + nx} ${a.y + ny} L${b.x + nx} ${b.y + ny}`); mk(`M${a.x - nx} ${a.y - ny} L${b.x - nx} ${b.y - ny}`);
      } else if (k.kind === 'wire') {
        mk(straight).setAttribute('stroke-width', 3.2);
        el('circle', { cx: a.x, cy: a.y, r: 3.6, fill: col, stroke: 'var(--panel)', 'stroke-width': 1.4 }, g);
        el('circle', { cx: b.x, cy: b.y, r: 3.6, fill: col, stroke: 'var(--panel)', 'stroke-width': 1.4 }, g);
      } else if (k.kind === 'trace') {
        const mx = (a.x + b.x) / 2;
        mk(Math.abs(b.x - a.x) > 8 && Math.abs(b.y - a.y) > 8 ? `M${a.x} ${a.y} L${mx} ${a.y} L${mx} ${b.y} L${b.x} ${b.y}` : straight).setAttribute('stroke-width', 1.6);
      } else if (k.kind === 'rf') {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const lift = Math.min(90, Math.max(28, len * 0.28));
        mk(`M${a.x} ${a.y} Q${mx + dy / len * lift} ${my - dx / len * lift} ${b.x} ${b.y}`);
      } else mk(straight);
      const [, , lkName] = LINK[k.kind] || LINK.sw;
      el('title', {}, g).textContent = `${lkName}${k.label ? ' · ' + k.label : ''}`;
      k.el = g;
    });
    const lblg = el('g', {}, svg);
    l.links.forEach(k => {
      if (!k.label) return;
      const a = l.nodeMap[k.a], b = l.nodeMap[k.b]; const t = k.t == null ? 0.5 : k.t;
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const w = k.label.length * 5.9 + 8;
      el('rect', { x: x - w / 2, y: y - 8, width: w, height: 14, rx: 3, class: 'llbl-bg' }, lblg);
      const tx = el('text', { x, y: y + 3, 'text-anchor': 'middle', class: 'llbl' }, lblg); tx.textContent = k.label;
    });
    const ng = el('g', {}, svg);
    l.nodes.forEach(n => {
      const [, col] = TYPE[n.type] || ['', '#334155'];
      const g = el('g', { class: 'node', transform: `translate(${n.x},${n.y})`, id: 'nd-' + n.id }, ng);
      const ig = el('g', { transform: 'translate(0,-12) scale(1.18)' }, g);
      FXI.draw(ig, n.type, col);
      const lb = el('text', { y: 40, class: 'lbl', 'text-anchor': 'middle' }, g); lb.textContent = n.label;
      if (n.sub) { const sb = el('text', { y: 53, class: 'sub', 'text-anchor': 'middle' }, g); sb.textContent = n.sub; }
      const tg = el('text', { y: 40, class: 'dot', 'text-anchor': 'end', fill: col }, g); tg.textContent = '●';
      tg.setAttribute('x', -(n.label.length * 3.7) - 4);
      const [ty, tcol] = TYPE[n.type] || ['', '#334155'];
      el('title', {}, g).textContent = `${ty} · ${n.label}${n.sub ? ' — ' + n.sub : ''}`;
      g.addEventListener('click', ev => { ev.stopPropagation(); showNodePop(n, ev); });
      n.el = g;
    });
    svg.addEventListener('click', () => { const p = $('#npop'); if (p) p.hidden = true; });
    const vb = { x: 0, y: 0, w: 1000, h: 560 };
    const applyVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    svg.addEventListener('wheel', e => { e.preventDefault(); const f = e.deltaY > 0 ? 1.15 : 0.87, r = svg.getBoundingClientRect(); const cx = (e.clientX - r.left) / r.width * vb.w + vb.x, cy = (e.clientY - r.top) / r.height * vb.h + vb.y; vb.w *= f; vb.h *= f; vb.x = cx - (cx - vb.x) * f; vb.y = cy - (cy - vb.y) * f; applyVB(); }, { passive: false });
    let drag = null; svg.style.cursor = 'grab';
    svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; svg.setPointerCapture(e.pointerId); svg.style.cursor = 'grabbing'; });
    svg.addEventListener('pointermove', e => { if (!drag) return; const r = svg.getBoundingClientRect(); vb.x = drag.vx - (e.clientX - drag.x) / r.width * vb.w; vb.y = drag.vy - (e.clientY - drag.y) / r.height * vb.h; applyVB(); });
    svg.addEventListener('pointerup', () => { drag = null; svg.style.cursor = 'grab'; });
    packetLayer = el('g', {}, svg);
    const kinds = [...new Set(l.links.map(k => k.kind))];
    $('#linklegend').innerHTML = kinds.map(k => { const [c, d, n] = LINK[k] || LINK.sw; return `<span><i style="border-top-color:${c};border-top-style:${d ? 'dashed' : 'solid'}"></i>${n}</span>`; }).join('');
    highlight();
  }
  function showNodePop(n, ev) {
    const p = $('#npop'); if (!p || !st.lesson) return;
    const ty = (TYPE[n.type] || ['', ''])[0];
    const con = st.lesson.links.filter(k => k.a === n.id || k.b === n.id).map(k => { const [c, d, nm] = LINK[k.kind] || LINK.sw; const o = k.a === n.id ? k.b : k.a; const on = st.lesson.nodeMap[o]; return `<div>↔ ${esc(on ? on.label : '?')} · ${esc(nm)}${k.label ? ' · ' + esc(k.label) : ''}</div>`; });
    p.innerHTML = `<b>${esc(n.label)}</b><div class="muted">${esc(ty)}${n.sub ? ' · ' + esc(n.sub) : ''}</div>${con.join('')}`;
    p.hidden = false; p.style.left = Math.min(ev.clientX + 12, innerWidth - 250) + 'px'; p.style.top = Math.min(ev.clientY + 12, innerHeight - 160) + 'px';
  }
  function pathOf(m) { return [m.from, ...(m.via || []), m.to].map(id => st.lesson.nodeMap[id]); }
  function findLink(a, b) { return st.lesson.links.find(k => (k.a === a && k.b === b) || (k.a === b && k.b === a)); }
  function highlight() {
    const l = st.lesson; if (!l) return;
    l.nodes.forEach(n => n.el && n.el.classList.remove('active'));
    l.links.forEach(k => k.el && k.el.classList.remove('hot'));
    if (st.cur < 0 || st.view !== 'net') return;
    const m = l.msgs[st.cur], p = pathOf(m);
    p.forEach(n => n.el && n.el.classList.add('active'));
    for (let i = 0; i < p.length - 1; i++) { const k = findLink(p[i].id, p[i + 1].id); if (k && k.el) k.el.classList.add('hot'); }
  }
  function animate(m) {
    return new Promise(res => {
      if (st.view !== 'net' || !packetLayer) return res();
      const pts = pathOf(m), col = st.lesson.pcolor[m.proto];
      packetLayer.innerHTML = '';
      if (m.from === m.to) { // internal processing: pulse
        const n = pts[0]; const c = el('circle', { cx: n.x, cy: n.y, r: 10, fill: 'none', stroke: col, 'stroke-width': 3 }, packetLayer);
        const t0 = performance.now(), dur = 700 / st.speed;
        const f = t => { const k = Math.min(1, (t - t0) / dur); c.setAttribute('r', 10 + 50 * k); c.setAttribute('opacity', 1 - k); k < 1 ? requestAnimationFrame(f) : (packetLayer.innerHTML = '', res()); };
        return requestAnimationFrame(f);
      }
      const g = el('g', {}, packetLayer);
      el('circle', { r: 13, fill: col, opacity: .25 }, g); el('circle', { r: 7, fill: col, stroke: '#fff', 'stroke-width': 2 }, g);
      const segs = []; let total = 0;
      for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); segs.push(d); total += d; }
      const dur = Math.max(500, Math.min(1400, total * 2.2)) / st.speed, t0 = performance.now();
      const f = t => {
        let k = Math.min(1, (t - t0) / dur); k = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        let d = k * total, i = 0; while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
        const r = segs[i] ? d / segs[i] : 0, a = pts[i], b = pts[i + 1];
        g.setAttribute('transform', `translate(${a.x + (b.x - a.x) * r},${a.y + (b.y - a.y) * r})`);
        if (t - t0 < dur) requestAnimationFrame(f); else { setTimeout(() => { packetLayer.innerHTML = ''; res(); }, 120); }
      };
      requestAnimationFrame(f);
    });
  }

  /* ---------------- sequence ---------------- */
  function renderSeq() {
    const l = st.lesson, c = $('#canvas'); c.innerHTML = '';
    const order = l.seqOrder || l.nodes.map(n => n.id).filter(id => l.msgs.some(m => m.from === id || m.to === id));
    const W = Math.max(c.clientWidth - 10, order.length * 130), colW = W / order.length, rowH = 30, top = 52;
    const H = top + l.msgs.length * rowH + 20;
    const s = el('svg', { width: W, height: H, class: 'seqsvg' }, c); s.style.height = H + 'px'; s.style.width = W + 'px';
    order.forEach((id, i) => {
      const n = l.nodeMap[id], x = colW * i + colW / 2, [, col] = TYPE[n.type] || ['', '#334155'];
      el('line', { x1: x, y1: top - 6, x2: x, y2: H - 6, stroke: 'var(--line)', 'stroke-dasharray': '4 4' }, s);
      el('rect', { x: x - colW / 2 + 6, y: 8, width: colW - 12, height: 30, rx: 4, fill: 'var(--panel)', stroke: col, 'stroke-width': 1.5 }, s);
      const t = el('text', { x, y: 27, 'text-anchor': 'middle', class: 'hd' }, s); t.textContent = n.label.length > colW / 7.5 ? n.label.slice(0, Math.floor(colW / 7.5) - 1) + '…' : n.label;
    });
    const X = id => colW * order.indexOf(id) + colW / 2;
    l.msgs.forEach((m, i) => {
      const y = top + i * rowH + 18, col = l.pcolor[m.proto];
      const g = el('g', { class: 'row' + (i === st.cur ? ' cur' : ''), 'data-i': i }, s);
      el('rect', { class: 'bg', x: 0, y: y - 18, width: W, height: rowH, fill: 'transparent' }, g);
      const x1 = X(m.from), x2 = X(m.to);
      const lab = el('text', { y: y - 5, 'text-anchor': 'middle', fill: col }, g);
      lab.textContent = `${i + 1}. ${m.short || m.info}`.slice(0, Math.max(14, Math.floor((Math.abs(x2 - x1) || 160) / 6.6)));
      if (m.from === m.to) {
        el('path', { d: `M${x1} ${y - 2} h28 v10 h-28`, fill: 'none', stroke: col, 'stroke-width': 2 }, g);
        lab.setAttribute('x', x1 + 34); lab.setAttribute('text-anchor', 'start'); lab.setAttribute('y', y + 6);
      } else {
        const dir = x2 > x1 ? 1 : -1;
        el('line', { x1, y1: y, x2: x2 - dir * 6, y2: y, stroke: col, 'stroke-width': 2 }, g);
        el('path', { d: `M${x2} ${y} l${-dir * 9} -5 v10 z`, fill: col }, g);
        lab.setAttribute('x', (x1 + x2) / 2);
      }
      g.addEventListener('click', () => select(i));
    });
    $('#linklegend').innerHTML = '';
    const cur = c.querySelector('.row.cur'); if (cur) { const y = top + st.cur * rowH; if (y < c.scrollTop || y > c.scrollTop + c.clientHeight - 60) c.scrollTop = y - 60; }
  }
  function renderCanvas() { st.view === 'net' ? renderNet() : renderSeq(); }

  /* ---------------- tutorial card ---------------- */
  function renderTut() {
    const l = st.lesson, t = $('#tut');
    let head, body;
    if (st.cur < 0) { head = 'START HERE'; body = l.intro || 'Press PLAY to watch the exchange, or STEP through it one message at a time. Click any message to inspect its bytes.'; }
    else { const m = l.msgs[st.cur], s = l.steps[m.step]; head = `STEP ${m.step + 1}/${l.steps.length} · ${s.title.toUpperCase()} · MSG ${st.cur + 1}/${l.msgs.length}`; body = s.text; }
    t.className = 'tut' + (st.tutMin ? ' min' : '');
    t.innerHTML = `<span class="mn" title="minimise">${st.tutMin ? '▴' : '▾'}</span><span class="hd">${esc(head)}</span><div class="tx">${body}</div>`;
    t.querySelector('.mn').onclick = () => { st.tutMin = !st.tutMin; renderTut(); };
  }

  /* ---------------- side panel ---------------- */
  function renderOverview() {
    const l = st.lesson;
    const nxt = LESSONS.slice().sort((a, b) => (a.ord || 999) - (b.ord || 999)).find(x => x.ord > l.ord);
    $('#side').innerHTML = `<div class="ph">LESSON OVERVIEW</div><div class="body">
      ${nxt ? `<div class="nxt"><button class="btn primary" id="nextles">NEXT →</button><span class="muted">${esc(nxt.title)} · ${esc(nxt.subtitle)}</span></div>` : ''}
      <span class="badge">${st.done[l.id] ? '✓ COMPLETED' : '● ACTIVE'}</span><h2>${esc(l.title)}</h2><div class="st">${esc(l.subtitle)}${l.mins ? ' · ~' + l.mins + ' min' : ''}</div>
      ${l.tags ? `<div class="tags">${l.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      ${(l.prereq || []).length ? `<h4>PREREQUISITES</h4><div class="preq">${l.prereq.map(pid => { const p = LESSONS.find(x => x.id === pid); return p ? `<a href="#/${pid}" data-l="${pid}" class="${st.done[pid] ? '' : 'todo'}">${esc(p.title)}</a>` : ''; }).join(' · ')}</div>` : ''}
      ${l.overview.map(p => `<p>${p}</p>`).join('')}
      <table class="facts">${(l.facts || []).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      ${l.terms ? `<h4>KEY TERMS</h4><dl class="terms">${l.terms.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}
      ${l.atWork ? `<h4>AT WORK (HPE CONTEXT)</h4><p>${l.atWork}</p>` : ''}
      ${l.refs ? `<h4>FURTHER READING</h4><ul>${l.refs.map(([n, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(n)}</a></li>`).join('')}</ul>` : ''}
    </div>`;
    $('#side').querySelectorAll('a[data-l]').forEach(a => a.onclick = e => { e.preventDefault(); openLesson(a.dataset.l); });
    const nb = $('#nextles'); if (nb && nxt) nb.onclick = () => openLesson(nxt.id);
  }
  function renderInspector() {
    const l = st.lesson, m = l.msgs[st.sel], col = l.pcolor[m.proto];
    const a = l.nodeMap[m.from], b = l.nodeMap[m.to];
    let off = 0; const ranges = [];
    m.layers.forEach((ly, li) => ly.fields.forEach((f, fi) => { const n = (f.b || []).length; ranges.push({ li, fi, s: off, e: off + n }); off += n; }));
    const lens = m.layers.map(ly => bytesOf(ly.fields).length), tot = Math.max(1, lens.reduce((x, y) => x + y, 0));
    const LC = ['#94a3b8', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4'];
    const sel = st.fsel;
    const r = sel ? ranges.find(x => x.li === sel[0] && x.fi === sel[1]) : null;
    let html = `<div class="insp-h"><div><div class="ttl"><span class="num" style="background:${col}">${st.sel + 1}</span>${esc(m.short || m.proto)}</div>
      <div class="meta">${esc(m.t)} · ${esc(a.label)} → ${esc(b.label)} · ${esc(m.proto)} · ${m.bytes.length} B</div></div>
      <div class="nav"><button class="btn" data-n="-1">‹</button><button class="btn" data-n="1">›</button><button class="btn" data-n="c" title="Copy raw bytes as hex">⧉</button><button class="btn" data-n="x">✕</button></div></div>`;
    if (m.note) html += `<div class="note">${m.note}</div>`;
    html += `<div class="lbar">${lens.map((n, i) => n ? `<div style="flex:${n / tot};background:${LC[i % LC.length]}"></div>` : '').join('')}</div>`;
    html += `<div class="lbar-t">${lens.map((n, i) => n ? `<div style="flex:${n / tot}">${esc(m.layers[i].name.split(' ·')[0])}</div>` : '').join('')}</div>`;
    html += `<div class="layers">` + m.layers.map((ly, li) => `<div class="layer"><div class="lh" style="border-left:4px solid ${LC[li % LC.length]}"><span>${esc(ly.name)}</span><span class="muted">${lens[li]} B</span></div>
      ${ly.note ? `<div class="ln">${ly.note}</div>` : ''}
      ${ly.fields.map((f, fi) => `<div class="fld ${sel && sel[0] === li && sel[1] === fi ? 'on' : ''}" data-f="${li},${fi}"><span>${esc(f.n)}</span><span class="fv">${esc(f.v)}${f.eg ? '<span class="eg">E.G.</span>' : ''}</span>
        <div class="fd">${f.d}${f.json ? `<pre class="json">${esc(f.json)}</pre>` : ''}</div></div>`).join('')}</div>`).join('') + `</div>`;
    if (m.bytes.length) {
      html += `<div class="hex-h">BYTES · ${m.bytes.length} in this message</div><div class="hex">`;
      for (let i = 0; i < m.bytes.length; i += 16) {
        const row = m.bytes.slice(i, i + 16);
        const hx = row.map((v, j) => { const k = i + j; const on = r && k >= r.s && k < r.e; return `<span class="b ${on ? 'on' : ''} ${v < 0 ? 'e' : ''}" data-k="${k}">${v < 0 ? '--' : v.toString(16).padStart(2, '0')}</span>`; }).join(' ');
        const asc = row.map((v, j) => { const k = i + j; const on = r && k >= r.s && k < r.e; const ch = v >= 32 && v < 127 ? esc(String.fromCharCode(v)) : '.'; return `<span class="b ${on ? 'on' : ''}" data-k="${k}">${ch}</span>`; }).join('');
        html += `<div class="h"><span class="off">${i.toString(16).padStart(4, '0')}</span><span>${hx}${'   '.repeat(16 - row.length)}</span><span>${asc}</span></div>`;
      }
      html += `</div>`;
    }
    $('#side').innerHTML = html;
    $('#side').querySelectorAll('.fld').forEach(d => d.onclick = () => { const [li, fi] = d.dataset.f.split(',').map(Number); st.fsel = sel && sel[0] === li && sel[1] === fi ? null : [li, fi]; renderInspector(); });
    $('#side').querySelectorAll('.hex span.b').forEach(s => s.onclick = () => { const k = +s.dataset.k; const rr = ranges.find(x => k >= x.s && k < x.e); if (rr) { st.fsel = [rr.li, rr.fi]; renderInspector(); const f = $('#side .fld.on'); f && f.scrollIntoView({ block: 'nearest' }); } });
    $('#side').querySelectorAll('.nav button').forEach(bn => bn.onclick = () => {
      const n = bn.dataset.n;
      if (n === 'x') return closeInsp();
      if (n === 'c') {
        const done = ok => { bn.textContent = ok ? '✓' : '!'; setTimeout(() => bn.textContent = '⧉', 900); };
        if (navigator.clipboard && m.bytes.length) navigator.clipboard.writeText(B.toHex(m.bytes)).then(() => done(true), () => done(false));
        else done(false);
        return;
      }
      select(Math.max(0, Math.min(l.msgs.length - 1, st.sel + +n)));
    });
  }
  function renderSide() { st.sel == null ? renderOverview() : renderInspector(); }
  function closeInsp() { st.sel = null; st.fsel = null; renderSide(); }

  /* ---------------- table ---------------- */
  function renderTable() {
    const l = st.lesson;
    $('#protolegend').innerHTML = Object.entries(l.pcolor).map(([p, c]) => `<span><i class="c" style="background:${c}"></i>${esc(p)}</span>`).join('');
    $('#tbl tbody').innerHTML = l.msgs.map((m, i) => `<tr data-i="${i}" class="${i === st.cur ? 'cur' : i > st.cur ? 'future' : ''}"><td><span class="num" style="background:${l.pcolor[m.proto]};width:20px;height:20px;line-height:20px;font-size:10px">${i + 1}</span></td>
      <td>${esc(m.t)}</td><td>${esc(l.nodeMap[m.from].label)}</td><td>${esc(l.nodeMap[m.to].label)}</td><td>${esc(m.proto)}</td><td class="info">${esc(m.info)}</td><td>${m.bytes.length ? m.bytes.length + ' B' : '—'}</td></tr>`).join('');
  }
  function updateCur() {
    document.querySelectorAll('#tbl tbody tr').forEach((tr, i) => tr.className = i === st.cur ? 'cur' : i > st.cur ? 'future' : '');
    const tr = document.querySelector('#tbl tr.cur'); if (tr) tr.scrollIntoView({ block: 'nearest' });
    highlight(); renderTut(); renderList(); syncHash();
    const grp = LESSONS.filter(x => x.cat === st.lesson.cat).sort((a, b) => (a.ord || 999) - (b.ord || 999));
    const cn = CATS.find(c => c[0] === st.lesson.cat);
    $('#crumb').textContent = cn ? `${cn[1].toUpperCase()} · ${grp.indexOf(st.lesson) + 1}/${grp.length}` : '';
    if (st.view === 'seq') renderSeq();
    $('#play').textContent = st.playing ? '❚❚ PAUSE' : '▶ PLAY';
  }

  /* ---------------- URL state: #lesson[/msgIndex][/seq] ---------------- */
  function parseHash() {
    const m = location.hash.slice(1).match(/^([^/]+?)(?:\/(\d+))?(?:\/(seq|net))?$/);
    if (!m || !m[1]) return { id: null, cur: -1, view: 'net' };
    return { id: m[1], cur: m[2] != null ? +m[2] : -1, view: m[3] === 'seq' ? 'seq' : 'net' };
  }
  function syncHash() {
    if (!st.lesson) return;
    const h = '#' + st.lesson.id + (st.cur >= 0 ? '/' + st.cur : '') + (st.view === 'seq' ? '/seq' : '');
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  /* ---------------- control ---------------- */
  function markDone() { if (st.cur === st.lesson.msgs.length - 1 && !st.done[st.lesson.id]) { st.done[st.lesson.id] = 1; store && store.setItem('fwx-done', JSON.stringify(st.done)); renderList(); if (st.sel == null) renderOverview(); } }
  async function go(i, anim = true) {
    if (st.anim) return; const l = st.lesson;
    if (i < -1 || i >= l.msgs.length) return;
    st.cur = i; updateCur();
    if (st.sel != null && i >= 0) { st.sel = i; st.fsel = null; renderInspector(); }
    if (anim && i >= 0) { st.anim = true; await animate(l.msgs[i]); st.anim = false; }
    if (i >= 0) markDone();
  }
  async function play() {
    if (st.playing) { st.playing = false; updateCur(); return; }
    st.playing = true; if (st.cur >= st.lesson.msgs.length - 1) st.cur = -1; updateCur();
    let lastStep = st.cur >= 0 ? st.lesson.msgs[st.cur].step : -1;
    while (st.playing && st.cur < st.lesson.msgs.length - 1) {
      await go(st.cur + 1);
      if (!st.playing) break;
      const s = st.lesson.msgs[st.cur].step;
      if (st.pauseSteps && lastStep >= 0 && s !== lastStep) {
        lastStep = s; st.playing = false; updateCur();
        const t = $('#tut'); t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse');
        break;
      }
      lastStep = s;
      await new Promise(r => setTimeout(r, (st.view === 'net' ? 350 : 900) / st.speed));
    }
    st.playing = false; updateCur();
  }
  function select(i) { st.playing = false; st.sel = i; st.fsel = null; renderInspector(); go(i, true); }
  function openLesson(id) {
    const l = LESSONS.find(x => x.id === id) || LESSONS[0];
    st.playing = false; st.lesson = l; st.cur = -1; st.sel = null; st.fsel = null;
    renderList(); renderCanvas(); renderTable(); renderSide(); renderTut(); updateCur();
  }

  /* ---------------- events ---------------- */
  $('#cats').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.cat = b.dataset.c; renderCats(); renderList(); };
  $('#list').onclick = e => {
    const s = e.target.closest('.stp'); if (s) { const k = +s.dataset.s; const first = st.lesson.msgs.findIndex(m => m.step === k); st.playing = false; if (first >= 0) go(first); return; }
    const d = e.target.closest('.les'); if (d) openLesson(d.dataset.l);
  };
  $('#q').oninput = e => { st.q = e.target.value; renderList(); };
  $('#viewseg').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.view = b.dataset.v; document.querySelectorAll('#viewseg button').forEach(x => x.classList.toggle('on', x === b)); renderCanvas(); syncHash(); };
  $('#pauseSteps').onclick = () => {
    st.pauseSteps = !st.pauseSteps;
    store && store.setItem('fwx-pausesteps', st.pauseSteps ? '1' : '0');
    syncPauseBtn();
  };
  function syncPauseBtn() { const b = $('#pauseSteps'); b.classList.toggle('on', st.pauseSteps); b.textContent = st.pauseSteps ? '❚❚ STEPS' : 'STEPS'; }
  $('#tbl').onclick = e => { const tr = e.target.closest('tbody tr'); if (tr) select(+tr.dataset.i); };
  $('#play').onclick = play;
  $('#step').onclick = () => { st.playing = false; go(st.cur + 1); };
  $('#back').onclick = () => { st.playing = false; go(st.cur - 1, false); };
  $('#reset').onclick = () => { st.playing = false; st.anim = false; go(-1, false); };
  $('#speed').onchange = e => st.speed = +e.target.value;
  $('#theme').onclick = () => { document.documentElement.classList.toggle('dark'); store && store.setItem('fwx-dark', document.documentElement.classList.contains('dark') ? 1 : ''); };
  $('#help').onclick = () => $('#modal').hidden = false;
  $('#closemodal').onclick = () => $('#modal').hidden = true;
  window.addEventListener('resize', () => st.view === 'seq' && renderSeq());
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === ' ') { e.preventDefault(); play(); }
    else if (e.key === 'ArrowRight') { st.playing = false; go(st.cur + 1); }
    else if (e.key === 'ArrowLeft') { st.playing = false; go(st.cur - 1, false); }
    else if (e.key === 'r' || e.key === 'R') go(-1, false);
    else if (e.key === 'v' || e.key === 'V') $(`#viewseg button[data-v="${st.view === 'net' ? 'seq' : 'net'}"]`).click();
    else if (e.key === 'p' || e.key === 'P') $('#pauseSteps').click();
    else if ((e.key === 'i' || e.key === 'I') && st.cur >= 0) select(st.cur);
    else if (e.key === 'Escape') { $('#modal').hidden = true; closeInsp(); const p = $('#npop'); if (p) p.hidden = true; }
    else if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
  });
  if (store && store.getItem('fwx-dark')) document.documentElement.classList.add('dark');
  syncPauseBtn();
  renderCats();
  const h = parseHash();
  st.view = h.view;
  document.querySelectorAll('#viewseg button').forEach(x => x.classList.toggle('on', x.dataset.v === st.view));
  openLesson(h.id);
  if (h.cur >= 0 && st.lesson.msgs[h.cur]) go(h.cur, false);
})();
