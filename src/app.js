(function () {
  const { B, bytesOf } = FX;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SVGNS = 'http://www.w3.org/2000/svg';
  const CATS = [['all', 'All'], ['platform', 'Platform'], ['buses', 'Buses'], ['gpu', 'GPU'], ['mgmt', 'Mgmt'], ['firmware', 'Firmware']];
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
  };

  /* ---------------- lesson list ---------------- */
  function renderCats() {
    $('#cats').innerHTML = CATS.map(([k, n]) => `<button data-c="${k}" class="${st.cat === k ? 'on' : ''}">${n.toUpperCase()}<b>${k === 'all' ? LESSONS.length : LESSONS.filter(l => l.cat === k).length}</b></button>`).join('');
  }
  function renderList() {
    const q = st.q.toLowerCase();
    const items = LESSONS.filter(l => (st.cat === 'all' || l.cat === st.cat) && (!q || (l.title + ' ' + l.subtitle + ' ' + (l.keywords || '')).toLowerCase().includes(q)));
    const curStep = st.lesson && st.cur >= 0 ? st.lesson.msgs[st.cur].step : -1;
    $('#list').innerHTML = items.map(l => {
      const on = st.lesson === l;
      let html = `<div class="les ${on ? 'on' : ''}" data-l="${l.id}"><span class="dot ${st.done[l.id] ? 'done' : ''}"></span><div style="flex:1"><div class="t">${esc(l.title)}</div><div class="s">${esc(l.subtitle)}</div></div><span>${on ? '▾' : '›'}</span></div>`;
      if (on) html += `<div class="steps">` + l.steps.map((s, i) => `<div class="stp ${i === curStep ? 'on' : i < curStep ? 'past' : ''}" data-s="${i}"><span class="n">${i + 1}</span><div><div class="t">${esc(s.title)}</div><div class="s">${esc(s.sub || '')}</div></div></div>`).join('') + `</div>`;
      return html;
    }).join('') || '<p class="muted" style="padding:10px">No lessons match.</p>';
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
      const p = el('path', { d: `M${a.x} ${a.y} L${b.x} ${b.y}`, class: 'link', stroke: col, 'stroke-dasharray': dash, id: 'lk' + i }, lg);
      k.el = p;
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
      n.el = g;
    });
    packetLayer = el('g', {}, svg);
    const kinds = [...new Set(l.links.map(k => k.kind))];
    $('#linklegend').innerHTML = kinds.map(k => { const [c, d, n] = LINK[k] || LINK.sw; return `<span><i style="border-top-color:${c};border-top-style:${d ? 'dashed' : 'solid'}"></i>${n}</span>`; }).join('');
    highlight();
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
    else { const m = l.msgs[st.cur], s = l.steps[m.step]; head = `STEP ${m.step + 1}/${l.steps.length} · ${s.title.toUpperCase()}`; body = s.text; }
    t.className = 'tut' + (st.tutMin ? ' min' : '');
    t.innerHTML = `<span class="mn" title="minimise">${st.tutMin ? '▴' : '▾'}</span><span class="hd">${esc(head)}</span><div class="tx">${body}</div>`;
    t.querySelector('.mn').onclick = () => { st.tutMin = !st.tutMin; renderTut(); };
  }

  /* ---------------- side panel ---------------- */
  function renderOverview() {
    const l = st.lesson;
    $('#side').innerHTML = `<div class="ph">LESSON OVERVIEW</div><div class="body">
      <span class="badge">${st.done[l.id] ? '✓ COMPLETED' : '● ACTIVE'}</span><h2>${esc(l.title)}</h2><div class="st">${esc(l.subtitle)}</div>
      ${l.overview.map(p => `<p>${p}</p>`).join('')}
      <table class="facts">${(l.facts || []).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      ${l.terms ? `<h4>KEY TERMS</h4><dl class="terms">${l.terms.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}
      ${l.atWork ? `<h4>AT WORK (HPE CONTEXT)</h4><p>${l.atWork}</p>` : ''}
      ${l.refs ? `<h4>FURTHER READING</h4><ul>${l.refs.map(([n, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(n)}</a></li>`).join('')}</ul>` : ''}
    </div>`;
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
      <div class="nav"><button class="btn" data-n="-1">‹</button><button class="btn" data-n="1">›</button><button class="btn" data-n="x">✕</button></div></div>`;
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
    $('#side').querySelectorAll('.nav button').forEach(bn => bn.onclick = () => { const n = bn.dataset.n; if (n === 'x') closeInsp(); else select(Math.max(0, Math.min(l.msgs.length - 1, st.sel + +n))); });
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
    highlight(); renderTut(); renderList();
    if (st.view === 'seq') renderSeq();
    $('#play').textContent = st.playing ? '❚❚ PAUSE' : '▶ PLAY';
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
    while (st.playing && st.cur < st.lesson.msgs.length - 1) {
      await go(st.cur + 1);
      await new Promise(r => setTimeout(r, (st.view === 'net' ? 350 : 900) / st.speed));
    }
    st.playing = false; updateCur();
  }
  function select(i) { st.playing = false; st.sel = i; st.fsel = null; renderInspector(); go(i, true); }
  function openLesson(id, keepHash) {
    const l = LESSONS.find(x => x.id === id) || LESSONS[0];
    st.playing = false; st.lesson = l; st.cur = -1; st.sel = null; st.fsel = null;
    if (!keepHash) history.replaceState(null, '', '#' + l.id);
    renderList(); renderCanvas(); renderTable(); renderSide(); renderTut(); updateCur();
  }

  /* ---------------- events ---------------- */
  $('#cats').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.cat = b.dataset.c; renderCats(); renderList(); };
  $('#list').onclick = e => {
    const s = e.target.closest('.stp'); if (s) { const k = +s.dataset.s; const first = st.lesson.msgs.findIndex(m => m.step === k); st.playing = false; if (first >= 0) go(first); return; }
    const d = e.target.closest('.les'); if (d) openLesson(d.dataset.l);
  };
  $('#q').oninput = e => { st.q = e.target.value; renderList(); };
  $('#viewseg').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.view = b.dataset.v; document.querySelectorAll('#viewseg button').forEach(x => x.classList.toggle('on', x === b)); renderCanvas(); };
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
    else if ((e.key === 'i' || e.key === 'I') && st.cur >= 0) select(st.cur);
    else if (e.key === 'Escape') { $('#modal').hidden = true; closeInsp(); }
    else if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
  });
  if (store && store.getItem('fwx-dark')) document.documentElement.classList.add('dark');
  renderCats();
  openLesson(location.hash.slice(1), true);
})();
