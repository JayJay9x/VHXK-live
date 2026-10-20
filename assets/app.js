/* =====================================================================
   VHXK LIVE WAR ROOM · app.js
   Nguồn dữ liệu: Google Sheet "VHXK · LIVE WAR ROOM DB" ← n8n ← lịch quét Outlook mỗi giờ
   Ngôn ngữ chuyển động (chuyển thể từ thư viện Lemo-Opuscar):
     • Scan sweep (Satellite Briefing)    – mỗi lượt quét mới quét một dải sáng qua màn hình
     • Target lock + rolling digits (HUD) – việc 🔴 mới bị "khoá mục tiêu", số liệu cuộn rồi khoá
     • Leader line (HUD)                  – rê chuột vào thẻ: kẻ đường dẫn tới PIC & mốc thời gian
     • Magnets + stamp (Briefing Board)   – tải việc PIC là "nam châm", xử lý xong đóng dấu
     • Ratchet gauge (Data Storytelling)  – thanh báo động bật từng nấc
   ===================================================================== */
(() => {
'use strict';
const CFG = Object.assign({ API_BASE: '', REFRESH_MS: 60000, SCAN_HOURS: [7, 19], SCAN_DAYS: [1,2,3,4,5,6], STALE_AFTER_MIN: 90, TZ: 'Asia/Saigon' }, window.VHXK_CONFIG || {});
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TZ_OFFSET = '+07:00';

/* ---------- storage (an toàn khi bị chặn) ---------- */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
(function takeKeyFromHash() {
  const m = location.hash.match(/k=([^&]+)/);
  if (m) { store.set('vhxk_key', decodeURIComponent(m[1])); history.replaceState(null, '', location.pathname + location.search); }
})();

/* ---------- helpers ---------- */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
function parseDT(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v;
  let s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return new Date(`${m[3]}-${pad(m[2])}-${pad(m[1])}T${pad(m[4] || 0)}:${m[5] || '00'}:${m[6] || '00'}${TZ_OFFSET}`);
  m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return new Date(`${m[1]}T${pad(m[2] || 0)}:${m[3] || '00'}:${m[4] || '00'}${TZ_OFFSET}`);
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}
const fmtParts = (d) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: CFG.TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hour12: false }).formatToParts(d);
  const o = {}; p.forEach((x) => (o[x.type] = x.value)); if (o.hour === '24') o.hour = '00'; return o;
};
const fHM = (d) => { if (!d) return '—'; const o = fmtParts(d); return `${o.hour}:${o.minute}`; };
const fDM = (d) => { if (!d) return '—'; const o = fmtParts(d); return `${o.day}/${o.month}`; };
const fDMHM = (d) => (d ? `${fDM(d)} ${fHM(d)}` : '—');
const WD = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
function dur(ms) {
  const neg = ms < 0; ms = Math.abs(ms);
  const h = Math.floor(ms / 3600e3), m = Math.floor((ms % 3600e3) / 60e3), s = Math.floor((ms % 60e3) / 1e3);
  if (h >= 48) return `${neg ? '+' : ''}${Math.floor(h / 24)}N ${pad(h % 24)}H`;
  return `${neg ? '+' : ''}${pad(h)}:${pad(m)}:${pad(s)}`;
}
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
const initials = (name) => { const w = String(name || '?').trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : (w[0][1] || ''))).toUpperCase(); };
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : ''); clearTimeout(toast._t); toast._t = setTimeout(() => (t.className = 'toast'), 3200); }

const CATS = [
  ['BOOKING', 'BOOKING', ['BOOKING']], ['SI_VGM', 'SI/VGM', ['SI', 'VGM', 'SI_VGM']], ['CONTAINER', 'CONTAINER', ['CONTAINER', 'RONG', 'CONT']],
  ['LICH_TAU', 'LỊCH TÀU', ['LICH_TAU', 'TAU', 'VESSEL', 'DELAY', 'ROLL', 'DOI_TAU']], ['CHUNG_TU', 'CHỨNG TỪ', ['CHUNG_TU', 'DOCS', 'BL', 'B_L']],
  ['CHUNG_THU', 'CHỨNG THƯ', ['CHUNG_THU', 'CERT', 'KIEM_DICH', 'GIAM_DINH']], ['LC', 'L/C', ['LC', 'L_C', 'LC_DISCREPANCY']],
  ['DEM_DET', 'DEM/DET', ['DEM_DET', 'DEM', 'DET', 'FREE_TIME']], ['THANH_TOAN', 'THANH TOÁN', ['THANH_TOAN', 'PAYMENT', 'CONG_NO']],
  ['KHACH_HANG', 'KHÁCH HÀNG', ['KHACH_HANG', 'CUSTOMER', 'HUY', 'TAM_DUNG']], ['CHI_PHI', 'CHI PHÍ', ['CHI_PHI', 'COST']], ['KHAC', 'KHÁC', ['KHAC', 'OTHER']]
];
function catOf(raw) {
  const s = slug(raw);
  for (const [code, label, keys] of CATS) if (keys.includes(s) || s === slug(label)) return { code, label };
  for (const [code, label, keys] of CATS) if (keys.some((k) => s.includes(k))) return { code, label };
  return { code: s || 'KHAC', label: raw ? String(raw).toUpperCase() : 'KHÁC' };
}

/* ---------- state ---------- */
const S = { data: null, incidents: [], open: [], resolved: [], scans: [], emails: [], pics: [], latestScan: null,
  filter: { level: 'ALL', cat: 'ALL', pic: params.get('pic') || 'ALL', q: '' }, seen: new Set(), first: true, lastScanId: null, kpiPrev: {} };
try { JSON.parse(store.get('vhxk_seen') || '[]').forEach((x) => S.seen.add(x)); } catch (e) {}

/* ---------- normalise ---------- */
function normalise(raw) {
  const now = Date.now();
  const inc = (raw.incidents || []).map((r) => {
    const c = catOf(r.category);
    const lvl = /RED|ĐỎ|DO|🔴/i.test(r.level) ? 'RED' : (/AMBER|VANG|VÀNG|🟡/i.test(r.level) ? 'AMBER' : 'INFO');
    const deadline = parseDT(r.deadline) || parseDT(r.cutoff) || parseDT(r.etd);
    const received = parseDT(r.received_at);
    return Object.assign({}, r, {
      lvl, cat: c.code, catLabel: c.label, status: String(r.status || 'OPEN').toUpperCase(),
      dDeadline: deadline, dCutoff: parseDT(r.cutoff), dEtd: parseDT(r.etd), dReceived: received, dResolved: parseDT(r.resolved_at),
      amount: num(r.amount_usd), verify: /TRUE|1|YES|CÓ/i.test(String(r.needs_verification || '')), pic: r.pic || 'Cần xác minh'
    });
  });
  const open = inc.filter((i) => i.status !== 'DONE' && i.lvl !== 'INFO');
  const rank = (i) => (i.status === 'SNOOZE' ? 2 : 0) + (i.lvl === 'RED' ? 0 : 1);
  open.sort((a, b) => {
    const ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb;
    const oa = a.dDeadline && a.dDeadline < now ? 0 : 1, ob = b.dDeadline && b.dDeadline < now ? 0 : 1; if (oa !== ob) return oa - ob;
    const da = a.dDeadline ? +a.dDeadline : 9e15, db = b.dDeadline ? +b.dDeadline : 9e15; if (da !== db) return da - db;
    return (b.dReceived || 0) - (a.dReceived || 0);
  });
  const scans = (raw.scans || []).map((s) => Object.assign({}, s, { d: parseDT(s.scan_time), status: String(s.status || 'OK').toUpperCase() })).filter((s) => s.d).sort((a, b) => a.d - b.d);
  S.data = raw; S.incidents = inc; S.open = open; S.resolved = inc.filter((i) => i.status === 'DONE').sort((a, b) => (b.dResolved || 0) - (a.dResolved || 0));
  S.scans = scans; S.latestScan = scans[scans.length - 1] || null; S.emails = raw.emails || [];
  const known = new Map();
  (raw.pics || []).forEach((p) => known.set(p.pic, p));
  open.forEach((i) => { if (!known.has(i.pic)) known.set(i.pic, { pic: i.pic, initials: initials(i.pic), role: i.pic_role || '—' }); });
  S.pics = Array.from(known.values());
}

/* ---------- fetch ---------- */
async function load() {
  if (DEMO) { await ensureDemo(); return window.VHXK_DEMO(new Date()); }
  const key = store.get('vhxk_key');
  if (!key) throw Object.assign(new Error('NO_KEY'), { auth: true });
  const res = await fetch(`${CFG.API_BASE}/data?k=${encodeURIComponent(key)}&t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { auth: res.status === 500 || res.status === 401 || res.status === 403 });
  const j = await res.json();
  if (!j || !j.ok) throw new Error('BAD_PAYLOAD');
  return j;
}
function ensureDemo() {
  if (window.VHXK_DEMO) return Promise.resolve();
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'data/demo.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
}
async function postAction(inc, action, note) {
  if (DEMO) return { ok: true };
  const body = JSON.stringify({ key: store.get('vhxk_key'), incident_id: inc.incident_id, action, by: store.get('vhxk_name') || 'Dashboard', note: note || '' });
  const r = await fetch(`${CFG.API_BASE}/action`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* =====================================================================
   MOTION PRIMITIVES
   ===================================================================== */
const GLYPHS = '0123456789#$%&@*+=<>/?';
function rollTo(el, text, opts = {}) {
  text = String(text);
  if (el.dataset.v === text) return;
  el.dataset.v = text;
  if (REDUCED) { el.textContent = text; return; }
  const chars = text.split('');
  el.classList.add('roll', 'locking');
  el.innerHTML = chars.map(() => '<span class="ch scr"></span>').join('');
  const spans = $$('.ch', el);
  let locked = chars.length; const t0 = performance.now(); const hold = opts.hold || 260;
  function frame(t) {
    const elapsed = t - t0;
    const shouldLock = Math.max(0, Math.floor((elapsed - hold) / 55));
    const target = chars.length - Math.min(chars.length, shouldLock);
    while (locked > target) { locked--; spans[locked].textContent = chars[locked]; spans[locked].classList.remove('scr'); }
    for (let i = 0; i < locked; i++) spans[i].textContent = /[0-9]/.test(chars[i]) ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : chars[i];
    if (locked > 0) requestAnimationFrame(frame);
    else { el.classList.remove('locking'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash', 'pop'); setTimeout(() => el.classList.remove('pop'), 400); }
  }
  requestAnimationFrame(frame);
}
function scanSweep() {
  if (REDUCED) return;
  const s = $('#scanSweep'); s.classList.remove('run'); void s.offsetWidth; s.classList.add('run');
}
function lockOn(card) {
  if (REDUCED || !card) return;
  const l = document.createElement('div'); l.className = 'lock snap'; l.innerHTML = '<i></i><i></i><i></i><i></i>';
  card.appendChild(l);
}

/* =====================================================================
   RENDER: header / clock / next scan
   ===================================================================== */
function nextScanAt(now) {
  const o = fmtParts(now); const wd = WD[o.weekday]; const h = +o.hour;
  const [h0, h1] = CFG.SCAN_HOURS;
  const base = new Date(`${o.year}-${o.month}-${o.day}T00:00:00${TZ_OFFSET}`);
  if (CFG.SCAN_DAYS.includes(wd) && h < h1) { const nh = Math.max(h + 1, h0); return new Date(+base + nh * 3600e3); }
  for (let k = 1; k < 8; k++) { const d = new Date(+base + k * 864e5); if (CFG.SCAN_DAYS.includes((wd + k) % 7)) return new Date(+d + h0 * 3600e3); }
  return null;
}
function inWorkingWindow(now) { const o = fmtParts(now); const h = +o.hour; return CFG.SCAN_DAYS.includes(WD[o.weekday]) && h >= CFG.SCAN_HOURS[0] && h <= CFG.SCAN_HOURS[1]; }
function tick() {
  const now = new Date(); const o = fmtParts(now);
  $('#clock').textContent = `${o.day}/${o.month}/${o.year} | ${o.hour}:${o.minute}:${o.second}`;
  const ns = nextScanAt(now);
  if (ns) {
    const left = ns - now; const mm = Math.floor(left / 60e3), ss = Math.floor((left % 60e3) / 1e3);
    $('#nextScan').textContent = left > 3600e3 ? fDMHM(ns).replace(' ', ' · ') : `${pad(mm)}:${pad(ss)}`;
    const frac = Math.max(0, Math.min(1, left / 3600e3));
    $('#ringFg').style.strokeDashoffset = String(119.4 * (1 - frac));
  }
  $$('[data-cd]').forEach((el) => {
    const d = +el.dataset.cd; const left = d - now;
    const box = el; const wasOver = box.classList.contains('over');
    box.textContent = left < 0 ? `QUÁ HẠN ${dur(left)}` : `CÒN ${dur(left)}`;
    if (left < 0 && !wasOver) { box.classList.add('over'); if (!S.first) { box.classList.remove('glitch'); void box.offsetWidth; box.classList.add('glitch'); } }
    const card = box.closest('.inc'); if (card) card.classList.toggle('urgent2h', left >= 0 && left < 2 * 3600e3);
  });
  $$('[data-drain]').forEach((el) => {
    const [st, en] = el.dataset.drain.split('|').map(Number); const left = en - now; const pct = Math.max(0, Math.min(100, (left / Math.max(1, en - st)) * 100));
    el.firstElementChild.style.width = pct + '%'; el.classList.toggle('lt24', left < 864e5);
  });
  const nowEl = $('#tl .now'); if (nowEl && S.tl) nowEl.style.left = S.tl.x(+now) + '%';
}

/* ---------- threat ---------- */
function renderThreat() {
  const now = Date.now();
  const reds = S.open.filter((i) => i.lvl === 'RED' && i.status !== 'SNOOZE');
  const ambers = S.open.filter((i) => i.lvl === 'AMBER' && i.status !== 'SNOOZE');
  const overdue = S.open.filter((i) => i.dDeadline && i.dDeadline < now);
  const score = Math.min(20, reds.length * 3 + ambers.length + overdue.length * 3);
  const lv = score >= 15 ? ['NGUY CẤP (CRITICAL)', 1] : score >= 9 ? ['CAO (ELEVATED THREAT)', 2] : score >= 4 ? ['TRUNG BÌNH (GUARDED)', 3] : score > 0 ? ['THẤP (LOW)', 4] : ['ỔN ĐỊNH (ALL CLEAR)', 5];
  const calm = lv[1] >= 4;
  $('#threat').classList.toggle('calm', calm);
  $('#threatLevel').textContent = lv[0];
  $('#defcon').classList.toggle('calm', calm);
  rollTo($('#defconNum'), lv[1]);
  $('#vignette').classList.toggle('on', lv[1] <= 2 && !REDUCED);
  const g = $('#threatGauge');
  if (!g.children.length) g.innerHTML = Array.from({ length: 20 }, (_, i) => `<i class="${i < 6 ? 'g' : i < 12 ? 'a' : 'r'}"></i>`).join('');
  const segs = $$('i', g); const prev = S.gauge || 0; S.gauge = score;
  segs.forEach((s, i) => { const on = i < score; const delay = REDUCED ? 0 : Math.abs(i - prev) * 45; setTimeout(() => s.classList.toggle('on', on), delay); });
  $('#threatStats').innerHTML = `<span><i class="sq r"></i>${reds.length} VIỆC CẦN XỬ LÝ NGAY</span><span><i class="sq a"></i>${ambers.length} VIỆC THEO DÕI</span><span style="color:var(--red)"><span class="material-symbols-outlined">warning</span>${overdue.length} QUÁ HẠN</span>`;
  const ls = S.latestScan; $('#threatConf').textContent = ls ? `LƯỢT QUÉT ${fHM(ls.d)} · ${ls.emails_scanned || 0} EMAIL` : 'CHƯA CÓ LƯỢT QUÉT';
  $('#navQueue').textContent = S.open.length; $('#queueBadge').textContent = `${reds.length} KHẨN CẤP`;
}

/* ---------- KPI ---------- */
function spark(vals, color) {
  if (!vals.length) vals = [0];
  const w = 96, h = 30, max = Math.max(1, ...vals), n = vals.length;
  const pts = vals.map((v, i) => [n === 1 ? w : (i / (n - 1)) * w, h - 3 - (v / max) * (h - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path class="area" d="${d} L${w} ${h} L0 ${h}Z" fill="${color}"/><path d="${d}" stroke="${color}"/><circle cx="${pts[n - 1][0]}" cy="${pts[n - 1][1]}" r="2.2" fill="${color}"/></svg>`;
}
function renderKPI() {
  const now = Date.now(); const last = S.scans.slice(-13); const prev = S.scans[S.scans.length - 2];
  const live = S.open.filter((i) => i.status !== 'SNOOZE');
  const reds = live.filter((i) => i.lvl === 'RED'), ambers = live.filter((i) => i.lvl === 'AMBER');
  const overdue = S.open.filter((i) => i.dDeadline && i.dDeadline < now);
  const due24 = S.open.filter((i) => i.dDeadline && i.dDeadline >= now && i.dDeadline - now <= 864e5);
  const exposure = S.open.reduce((a, i) => a + i.amount, 0);
  const ls = S.latestScan;
  const delta = (cur, key) => { if (!prev) return 'lượt quét đầu tiên'; const d = cur - num(prev[key]); return `${d >= 0 ? '+' : ''}${d} so với ${fHM(prev.d)}`; };
  const tiles = [
    { id: 'red', cls: 'red', icon: 'emergency', label: 'XỬ LÝ NGAY', tag: 'SLA <4H', val: pad(reds.length), sub: delta(reds.length, 'open_red'), sub2: `${last.length} lượt`, sp: spark(last.map((s) => num(s.open_red)), '#EF4444') },
    { id: 'amb', cls: 'amber', icon: 'visibility', label: 'THEO DÕI', tag: 'IN PROGRESS', val: pad(ambers.length), sub: delta(ambers.length, 'open_amber'), sub2: 'ổn định', sp: spark(last.map((s) => num(s.open_amber)), '#F59E0B') },
    { id: 'ovd', cls: 'red', icon: 'warning', label: 'QUÁ HẠN', tag: 'ESCALATED', val: pad(overdue.length), sub: overdue.slice(0, 2).map((i) => i.customer || i.contract_lot).join(' + ') || 'không có', sub2: overdue.length ? 'CRITICAL' : '', sp: '' },
    { id: 'd24', cls: 'green', icon: 'hourglass_top', label: 'HẠN ≤ 24H', tag: 'URGENT', val: pad(due24.length), sub: 'Cut-off · ETD · deadline', sub2: 'T-24H', sp: '' },
    { id: 'eml', cls: 'green', icon: 'mail', label: 'EMAIL GIỜ NÀY', tag: ls ? 'SCAN ' + fHM(ls.d) : 'SCAN —', val: pad(num(ls && ls.emails_scanned)), sub: ls ? `${num(ls.new_red)} cờ đỏ · ${num(ls.new_amber)} cờ vàng` : '—', sub2: ls ? `${num(ls.normal_skipped)} bỏ qua` : '', sp: spark(last.map((s) => num(s.emails_scanned)), '#6CDE6B') },
    { id: 'exp', cls: 'gold', icon: 'payments', label: 'GIÁ TRỊ RỦI RO', tag: 'EXPOSURE', val: money(exposure), sub: `${S.open.filter((i) => i.amount > 0).length} lô có giá trị`, sub2: 'USD', sp: '' }
  ];
  const wrap = $('#kpis');
  if (!wrap.children.length) wrap.innerHTML = tiles.map((t) => `<div class="card kpi ${t.cls}" id="kpi-${t.id}"><div class="k-top"><span class="label-caps"><span class="material-symbols-outlined">${t.icon}</span> ${t.label}</span><span class="k-tag"></span></div><div class="k-val"><span class="num"></span><span class="sp"></span></div><div class="k-sub"><span class="s1"></span><span class="s2"></span></div></div>`).join('');
  tiles.forEach((t) => {
    const el = $('#kpi-' + t.id); $('.k-tag', el).textContent = t.tag; rollTo($('.num', el), t.val);
    $('.sp', el).innerHTML = t.sp; $('.s1', el).textContent = t.sub; $('.s2', el).textContent = t.sub2;
  });
}

/* ---------- filters ---------- */
function renderFilters() {
  const f = S.filter; const open = S.open;
  const cnt = (fn) => open.filter(fn).length;
  const cats = CATS.filter(([c]) => open.some((i) => i.cat === c)).map(([c, l]) => [c, l]);
  open.forEach((i) => { if (!cats.some(([c]) => c === i.cat)) cats.push([i.cat, i.catLabel]); });
  const picOpts = ['ALL', ...new Set(open.map((i) => i.pic))];
  $('#filters').innerHTML =
    `<button class="chipf ${f.level === 'ALL' ? 'on' : ''}" data-lv="ALL">TẤT CẢ<span class="n">(${open.length})</span></button>` +
    `<button class="chipf r ${f.level === 'RED' ? 'on' : ''}" data-lv="RED">🔴 KHẨN<span class="n">(${cnt((i) => i.lvl === 'RED')})</span></button>` +
    `<button class="chipf a ${f.level === 'AMBER' ? 'on' : ''}" data-lv="AMBER">🟡 THEO DÕI<span class="n">(${cnt((i) => i.lvl === 'AMBER')})</span></button>` +
    `<span class="chipf sep"></span>` +
    `<button class="chipf ${f.cat === 'ALL' ? 'on' : ''}" data-cat="ALL">MỌI DANH MỤC</button>` +
    cats.map(([c, l]) => `<button class="chipf ${f.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${esc(l)}<span class="n">${cnt((i) => i.cat === c)}</span></button>`).join('') +
    `<span class="chipf sep"></span>` +
    `<select class="chipf" id="picSel">${picOpts.map((p) => `<option value="${esc(p)}" ${f.pic === p ? 'selected' : ''}>${p === 'ALL' ? 'THEO PIC: TẤT CẢ' : 'PIC: ' + esc(p)}</option>`).join('')}</select>`;
}
function applyFilter(list) {
  const f = S.filter; const q = f.q.trim().toLowerCase();
  return list.filter((i) => (f.level === 'ALL' || i.lvl === f.level) && (f.cat === 'ALL' || i.cat === f.cat) && (f.pic === 'ALL' || i.pic === f.pic) &&
    (!q || [i.contract_lot, i.customer, i.pic, i.fact, i.action, i.vessel_booking, i.catLabel].join(' ').toLowerCase().includes(q)));
}

/* ---------- incident cards ---------- */
function picOf(name) { return S.pics.find((p) => p.pic === name) || { pic: name, initials: initials(name) }; }
function cardHTML(i, isNew) {
  const now = Date.now(); const p = picOf(i.pic);
  const st = i.dReceived ? +i.dReceived : (i.dDeadline ? +i.dDeadline - 72 * 3600e3 : 0);
  const statusBadge = i.status === 'ACK' ? '<span class="badge ack">ĐÃ NHẬN</span>' : i.status === 'SNOOZE' ? '<span class="badge snz">HOÃN</span>' : '';
  const sec = [i.vessel_booking && `TÀU/BKG: <b>${esc(i.vessel_booking)}</b>`, i.dEtd && `ETD ${fDMHM(i.dEtd)}`, i.dCutoff && `CUT-OFF ${fDMHM(i.dCutoff)}`].filter(Boolean).join(' · ');
  const subj = encodeURIComponent(`[VHXK][${i.lvl}] ${i.contract_lot || ''} – ${i.catLabel} – ${(i.action || '').slice(0, 60)}`);
  const body = encodeURIComponent(`Chào ${i.pic},\n\nViệc cần làm: ${i.action || ''}\nHạn: ${i.dDeadline ? fDMHM(i.dDeadline) : 'cần xác minh'}\n\nSự việc (từ email ${i.sender || ''} ${i.dReceived ? fDMHM(i.dReceived) : ''}): ${i.fact || ''}\n\nNhờ em phản hồi khi xong.\n— Gửi từ VHXK Live War Room`);
  const mail = `mailto:${encodeURIComponent(p.email || '')}?cc=${encodeURIComponent(CFG.OWNER_EMAIL || '')}&subject=${subj}&body=${body}`;
  const open = i.email_link ? `<a class="btn" href="${esc(i.email_link)}" target="_blank" rel="noopener"><span class="material-symbols-outlined">mail</span>MỞ EMAIL</a>`
    : `<button class="btn" data-act="FIND"><span class="material-symbols-outlined">search</span>TÌM EMAIL</button>`;
  return `<article class="inc ${i.lvl} ${i.status === 'ACK' ? 'ack' : ''} ${i.status === 'SNOOZE' ? 'snooze' : ''} ${isNew ? 'enter' : ''}" data-id="${esc(i.incident_id)}" data-pic="${esc(i.pic)}">
    <div class="inc-top">
      <div class="inc-id"><span class="cat">${esc(i.catLabel)}</span><span class="lot">${esc(i.contract_lot || '—')}</span>
        <span class="cust">· KHÁCH: <b>${esc(i.customer || 'cần xác minh')}</b></span>${isNew ? '<span class="badge new">MỚI</span>' : ''}${statusBadge}${num(i.seen_count) > 1 ? `<span class="badge">×${num(i.seen_count)} LƯỢT</span>` : ''}</div>
      <div class="cd">${i.dDeadline ? `<span class="cd-box" data-cd="${+i.dDeadline}">—</span><span class="cd-lbl">${esc(i.deadline_label || 'HẠN')} ${fDMHM(i.dDeadline)}</span>` : '<span class="cd-lbl">HẠN: CẦN XÁC MINH</span>'}${i.amount ? `<span class="cd-lbl" style="color:#F7BE1D">${money(i.amount)}</span>` : ''}</div>
    </div>
    ${i.dDeadline && st ? `<div class="drain" data-drain="${st}|${+i.dDeadline}"><i></i></div>` : ''}
    <div class="row"><span class="k">[EMAIL]</span><div class="v"><span class="meta">Từ: ${esc(i.sender || '—')}${i.sender_email ? ' &lt;' + esc(i.sender_email) + '&gt;' : ''} (${i.dReceived ? fDMHM(i.dReceived) : '—'})</span> › ${esc(i.fact || '')}${sec ? `<div class="meta">${sec}</div>` : ''}</div></div>
    ${i.ai_assessment ? `<div class="row ai"><span class="k">[AI ASSIST]</span><div class="v">Nhận định: ${esc(i.ai_assessment)}</div></div>` : ''}
    <div class="row act"><span class="k">→ VIỆC CẦN LÀM:</span><div class="v">${esc(i.action || 'cần xác minh')}</div></div>
    ${i.note ? `<div class="row"><span class="k">GHI CHÚ</span><div class="v meta">${esc(i.note)}</div></div>` : ''}
    <div class="inc-ftr">
      <div class="pic"><span class="av ${i.lvl === 'RED' ? 'hot' : ''}">${esc(p.initials || initials(i.pic))}</span>PIC: <b>${esc(i.pic)}</b>
        ${num(i.unanswered_hours) ? `<span class="age">⏳ Chưa trả lời ${num(i.unanswered_hours)}h</span>` : ''}${i.verify ? '<span class="verify">CẦN XÁC MINH</span>' : ''}</div>
      <div class="btns">${open}<a class="btn" href="${mail}"><span class="material-symbols-outlined">forward_to_inbox</span>GIAO VIỆC</a>
        ${i.status !== 'ACK' ? '<button class="btn" data-act="ACK">ĐÃ NHẬN</button>' : ''}<button class="btn btn-done" data-act="DONE">ĐÃ XỬ LÝ</button>${i.status !== 'SNOOZE' ? '<button class="btn" data-act="SNOOZE">HOÃN 2H</button>' : '<button class="btn" data-act="REOPEN">MỞ LẠI</button>'}</div>
    </div></article>`;
}
function renderQueue(newIds) {
  const list = applyFilter(S.open);
  const wrap = $('#queueList');
  wrap.innerHTML = list.map((i) => cardHTML(i, newIds.has(i.incident_id))).join('');
  const none = S.open.length === 0;
  $('#allClear').classList.toggle('hidden', !none);
  if (none) $('#allClearSub').textContent = S.latestScan ? `Lượt quét ${fHM(S.latestScan.d)} · ${num(S.latestScan.emails_scanned)} email · 0 việc cần xử lý · Hôm nay đã xử lý ${S.resolved.length}` : 'Chưa có lượt quét nào được ghi nhận';
  else if (!list.length) wrap.innerHTML = '<div class="tl-empty" style="padding:20px">Không có việc khớp bộ lọc.</div>';
  setTimeout(() => list.forEach((i, k) => { if (newIds.has(i.incident_id) && i.lvl === 'RED') setTimeout(() => lockOn(wrap.querySelector(`[data-id="${CSS.escape(i.incident_id)}"]`)), k * 120); }), 60);
  $('#resolvedCount').textContent = S.resolved.length;
  $('#resolvedList').innerHTML = S.resolved.map((i) => `<div class="res-row"><span><b>✓</b> ${esc(i.contract_lot)} · ${esc(i.catLabel)} · ${esc(i.customer || '')}</span><span>${esc(i.resolved_by || '')} ${i.dResolved ? fDMHM(i.dResolved) : ''}</span></div>`).join('') || '<div class="tl-empty">Chưa có.</div>';
}

/* ---------- timeline 72h ---------- */
function renderTimeline() {
  const now = Date.now(); const t0 = now - 6 * 3600e3, t1 = now + 72 * 3600e3;
  const x = (t) => ((t - t0) / (t1 - t0)) * 100; S.tl = { x };
  const ev = [];
  S.open.forEach((i) => {
    const add = (d, type) => { if (d && +d >= t0 && +d <= t1 && !ev.some((e) => e.id === i.incident_id && Math.abs(e.t - d) < 60e3)) ev.push({ id: i.incident_id, t: +d, type, lot: i.contract_lot, lvl: i.lvl, cust: i.customer }); };
    add(i.dCutoff, 'CUT-OFF'); add(i.dEtd, 'ETD'); if (i.dDeadline && (!i.dCutoff || +i.dDeadline !== +i.dCutoff) && (!i.dEtd || +i.dDeadline !== +i.dEtd)) add(i.dDeadline, i.deadline_label || 'HẠN');
  });
  ev.sort((a, b) => a.t - b.t);
  const lanes = []; ev.forEach((e) => { let l = 0; while (lanes[l] != null && x(e.t) - lanes[l] < 9) l++; lanes[l] = x(e.t); e.lane = Math.min(l, 3); });
  let html = '';
  for (let t = Math.ceil(t0 / (12 * 3600e3)) * 12 * 3600e3; t <= t1; t += 12 * 3600e3) html += `<div class="tick" style="left:${x(t)}%"></div><div class="axis" style="left:${x(t)}%">${fDM(new Date(t))} ${fHM(new Date(t))}</div>`;
  html += ev.map((e) => { const short = String(e.lot || '').replace(/^AAN-/, '').slice(0, 14); return `<div class="mk ${e.lvl} ${e.t < now ? 'past' : ''}" data-id="${esc(e.id)}" style="left:${x(e.t)}%;top:${14 + e.lane * 26}px;bottom:0" title="${esc(e.lot)} · ${esc(e.type)} · ${fDMHM(new Date(e.t))}"><div class="ret"></div><div class="lbl"><b>${esc(short)}</b>${esc(e.type)}</div><div class="stem"></div></div>`; }).join('');
  html += `<div class="now" style="left:${x(now)}%"></div>`;
  $('#tl').innerHTML = html;
  const up = ev.filter((e) => e.t >= now - 3600e3);
  $('#tlList').innerHTML = up.length ? up.map((e) => `<div class="tl-item ${e.lvl}"><span class="t">${fDMHM(new Date(e.t)).slice(0, 11)}</span><span>${esc(e.lot)} · ${esc(e.type)} · ${esc(e.cust || '')}</span><span>${e.t < now ? 'ĐÃ QUA' : 'T-' + dur(e.t - now).replace(/:\d\d$/, '')}</span></div>`).join('') : '<div class="tl-empty">Không có mốc cut-off / ETD / deadline nào trong 72h tới.</div>';
}

/* ---------- PIC board ---------- */
function renderPics(newIds) {
  const now = Date.now();
  const rows = S.pics.map((p) => {
    const mine = S.open.filter((i) => i.pic === p.pic);
    const r = mine.filter((i) => i.lvl === 'RED').length, a = mine.filter((i) => i.lvl === 'AMBER').length;
    const oldest = mine.reduce((m, i) => Math.max(m, i.dReceived ? now - i.dReceived : 0), 0);
    return { p, mine, r, a, oldest, load: r * 3 + a };
  }).filter((x) => x.mine.length || x.p.pic !== 'Cần xác minh').sort((a, b) => b.load - a.load || b.oldest - a.oldest);
  const max = Math.max(1, ...rows.map((x) => x.load));
  $('#picCount').textContent = `${rows.length} NHÂN SỰ`;
  $('#pics').innerHTML = rows.map((x) => {
    const mags = x.mine.map((i) => `<span class="mag ${i.status === 'ACK' ? 'k' : i.lvl === 'RED' ? 'r' : 'a'} ${newIds.has(i.incident_id) ? 'drop' : ''}" title="${esc(i.contract_lot)} · ${esc(i.catLabel)}">${i.status === 'ACK' ? '✓' : ''}</span>`).join('');
    const hot = x.r >= 2 || x.oldest > 48 * 3600e3;
    return `<div class="prow" data-pic="${esc(x.p.pic)}"><span class="av ${x.r ? 'hot' : ''}">${esc(x.p.initials || initials(x.p.pic))}</span><div><div class="nm">${esc(x.p.pic)}</div><div class="rl">${esc(x.p.role || '')}${x.p.scope ? ' · ' + esc(x.p.scope) : ''}</div></div><div class="mags">${mags || '<span class="rl">—</span>'}</div><div class="old ${hot ? 'hot' : ''}">${x.oldest ? 'cũ: ' + Math.round(x.oldest / 3600e3) + 'h' : ''}</div><div class="load ${x.r ? 'hot' : x.a ? 'warm' : ''}"><i style="width:${(x.load / max) * 100}%"></i></div></div>`;
  }).join('');
  $$('.prow').forEach((el, k) => { $$('.mag.drop', el).forEach((m, j) => (m.style.animationDelay = (k * 60 + j * 70) + 'ms')); });
  $$('.prow').forEach((el) => el.addEventListener('click', () => { S.filter.pic = S.filter.pic === el.dataset.pic ? 'ALL' : el.dataset.pic; renderFilters(); renderQueue(new Set()); }));
}

/* ---------- scan strip + terminal ---------- */
function renderScanLog(typeNew) {
  const now = new Date(); const o = fmtParts(now); const today = `${o.year}-${o.month}-${o.day}`;
  const todays = S.scans.filter((s) => { const q = fmtParts(s.d); return `${q.year}-${q.month}-${q.day}` === today; });
  const ns = nextScanAt(now); const nsH = ns ? +fmtParts(ns).hour : -1;
  let cells = '';
  for (let h = CFG.SCAN_HOURS[0]; h <= CFG.SCAN_HOURS[1]; h++) {
    const s = todays.filter((x) => +fmtParts(x.d).hour === h).pop();
    let cls = '';
    if (s) { cls = s.status !== 'OK' ? 'err' : num(s.new_red) >= 2 ? 'r2' : num(s.new_red) ? 'r' : num(s.new_amber) ? 'a' : 'ok'; }
    if (h === nsH && fmtParts(ns).day === o.day) cls += ' cur';
    cells += `<div class="cell ${cls}" title="${s ? `${fHM(s.d)} · ${num(s.emails_scanned)} email · ${num(s.new_red)}🔴 ${num(s.new_amber)}🟡 · ${s.status}` : 'chưa quét'}">${pad(h)}<b>${s ? (s.status !== 'OK' ? '!' : num(s.new_red) + num(s.new_amber)) : '·'}</b></div>`;
  }
  $('#strip').innerHTML = cells;
  $('#stripLabel').textContent = `TIẾN ĐỘ QUÉT HÔM NAY (${pad(CFG.SCAN_HOURS[0])}:00–${pad(CFG.SCAN_HOURS[1])}:00) · ${todays.length}/${CFG.SCAN_HOURS[1] - CFG.SCAN_HOURS[0] + 1} LƯỢT`;
  const lines = [];
  S.scans.slice(-12).forEach((s) => {
    const st = s.status === 'OK' ? '' : ` <span class="a">[${esc(s.status)}]</span>`;
    lines.push(`<span class="d">[${fDM(s.d)} ${fHM(s.d)}:${pad(fmtParts(s.d).second)}]</span> INIT AI PARSER › outlook inbox ${esc(s.window_from ? fHM(parseDT(s.window_from)) : '')}→${esc(s.window_to ? fHM(parseDT(s.window_to)) : fHM(s.d))}${st}`);
    lines.push(`  › ĐÃ QUÉT ${num(s.emails_scanned)} EMAIL · Phân loại: <span class="r">${num(s.new_red)} 🔴 MỚI</span> · <span class="a">${num(s.new_amber)} 🟡</span> · ${num(s.normal_skipped)} bỏ qua${s.message ? ' · ' + esc(s.message) : ''}`);
    S.emails.filter((e) => e.scan_id === s.scan_id && /RED|AMBER/i.test(e.classification)).slice(0, 6).forEach((e) => {
      lines.push(`  <span class="${/RED/i.test(e.classification) ? 'r' : 'a'}">! ALERT ${esc(String(e.classification).toUpperCase())}</span>: ${esc(e.contract_lot || '')} ${esc(e.subject || e.summary || '')} <span class="d">(${esc(e.sender || '')})</span>`);
    });
  });
  if (!lines.length) lines.push('<span class="d">[--:--]</span> Đang chờ lượt quét đầu tiên từ lịch "Check email Outlook hàng giờ"…');
  const term = $('#term');
  if (typeNew && !REDUCED && term.dataset.ready) {
    const html = lines.join('\n'); term.innerHTML = ''; let k = 0; const plain = html;
    const step = () => { k = Math.min(plain.length, k + 24); let cut = plain.slice(0, k); const lt = cut.lastIndexOf('<'), gt = cut.lastIndexOf('>'); if (lt > gt) cut = cut.slice(0, lt); term.innerHTML = cut + '<span class="cursor"></span>'; term.scrollTop = term.scrollHeight; if (k < plain.length) requestAnimationFrame(step); };
    step();
  } else { term.innerHTML = lines.join('\n') + '\n<span class="cursor"></span>'; term.scrollTop = term.scrollHeight; }
  term.dataset.ready = '1';
}

/* ---------- heatmap ---------- */
function renderHeat() {
  const custs = [...new Set(S.open.map((i) => i.customer || i.contract_lot || '—'))];
  const cats = CATS.filter(([c]) => S.open.some((i) => i.cat === c));
  S.open.forEach((i) => { if (!cats.some(([c]) => c === i.cat)) cats.push([i.cat, i.catLabel]); });
  if (!custs.length) { $('#heat').innerHTML = '<div class="tl-empty">Không có rủi ro đang mở.</div>'; return; }
  $('#heat').innerHTML = `<table><thead><tr><th>KHÁCH HÀNG / HỢP ĐỒNG</th>${cats.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${custs.map((c) => {
    const mine = S.open.filter((i) => (i.customer || i.contract_lot || '—') === c);
    return `<tr><td>${esc(c)}</td>${cats.map(([code]) => { const x = mine.filter((i) => i.cat === code); const lv = x.some((i) => i.lvl === 'RED') ? 'r' : x.length ? 'a' : ''; return `<td><span class="hc ${lv}">${x.length || 0}</span></td>`; }).join('')}</tr>`;
  }).join('')}</tbody></table>`;
}

/* ---------- trend ---------- */
function renderTrend() {
  const sc = S.scans.slice(-24); const el = $('#trend');
  if (sc.length < 2) { el.innerHTML = '<div class="tl-empty">Cần ít nhất 2 lượt quét để vẽ xu hướng.</div>'; $('#trendNote').textContent = ''; $('#trendRange').textContent = ''; return; }
  const W = 600, H = 190, L = 28, B = 22, T = 8, R = 8;
  const rs = sc.map((s) => num(s.open_red)), as = sc.map((s) => num(s.open_amber));
  const max = Math.max(2, ...rs.map((r, i) => r + as[i]));
  const X = (i) => L + (i / (sc.length - 1)) * (W - L - R), Y = (v) => H - B - (v / max) * (H - B - T);
  const line = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
  const stack = as.map((a, i) => a + rs[i]);
  let g = '<g class="grid">'; for (let k = 0; k <= 4; k++) { const v = (max / 4) * k; g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`; } g += '</g>';
  const step = Math.ceil(sc.length / 8);
  const xl = sc.map((s, i) => (i % step === 0 || i === sc.length - 1) ? `<text x="${X(i)}" y="${H - 6}" text-anchor="${i === sc.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}">${fHM(s.d)}</text>` : '').join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}
    <path d="${line(stack)} L${X(sc.length - 1)} ${Y(0)} L${X(0)} ${Y(0)}Z" fill="rgba(245,158,11,.14)"/>
    <path d="${line(rs)} L${X(sc.length - 1)} ${Y(0)} L${X(0)} ${Y(0)}Z" fill="rgba(239,68,68,.22)"/>
    <path class="ln" d="${line(stack)}" stroke="#F59E0B"/><path class="ln" d="${line(rs)}" stroke="#EF4444"/>
    <circle cx="${X(sc.length - 1)}" cy="${Y(rs[rs.length - 1])}" r="4" fill="#EF4444"/>${xl}</svg>`;
  $$('.ln', el).forEach((p) => { const len = p.getTotalLength(); p.style.setProperty('--len', len); });
  const peakI = stack.indexOf(Math.max(...stack));
  $('#trendRange').textContent = `${fDMHM(sc[0].d)} → ${fHM(sc[sc.length - 1].d)}`;
  $('#trendNote').innerHTML = `Đường đỏ: việc 🔴 đang mở · vùng vàng: tổng 🔴+🟡. Đỉnh: <b style="color:var(--amber)">${fHM(sc[peakI].d)}</b> (${rs[peakI]} 🔴 / ${as[peakI]} 🟡).`;
}

/* ---------- status banner / outlook chip ---------- */
function renderStatus() {
  const ls = S.latestScan; const now = new Date(); const chip = $('#outlookChip'); const b = $('#banner');
  let banner = '', red = false, stale = false;
  if (!ls) { $('#outlookStatus').textContent = '◌ CHƯA CÓ LƯỢT QUÉT'; chip.classList.add('err'); }
  else {
    const age = (now - ls.d) / 60e3;
    $('#outlookStatus').textContent = (ls.status === 'OK' ? '✓ ĐÃ QUÉT ' : '⚠ ' + ls.status + ' ') + fHM(ls.d) + ' · ' + num(ls.emails_scanned) + ' EMAIL';
    chip.classList.toggle('err', ls.status !== 'OK');
    if (ls.status === 'LOGIN_REQUIRED') { banner = `⚠ OUTLOOK CẦN ĐĂNG NHẬP LẠI — dữ liệu dừng ở ${fDMHM(ls.d)}. Mở Outlook trên máy và đăng nhập, lượt quét kế sẽ tự chạy.`; stale = true; }
    else if (ls.status === 'OFFLINE') { banner = `⚠ MÁY QUÉT KHÔNG TRUY CẬP ĐƯỢC OUTLOOK (máy tắt / ngủ) — dữ liệu dừng ở ${fDMHM(ls.d)}.`; stale = true; }
    else if (ls.status === 'ERROR') { banner = `⚠ LƯỢT QUÉT ${fHM(ls.d)} LỖI: ${ls.message || 'không rõ'}`; }
    else if (inWorkingWindow(now) && age > CFG.STALE_AFTER_MIN) { banner = `⚠ DỮ LIỆU CŨ — không có lượt quét mới từ ${fDMHM(ls.d)} (${Math.round(age)} phút).`; stale = true; }
  }
  if (DEMO) { banner = 'CHẾ ĐỘ DEMO · dữ liệu mẫu, không ghi vào Google Sheet. Bỏ ?demo=1 khỏi địa chỉ để xem dữ liệu thật.'; }
  b.classList.toggle('hidden', !banner); b.classList.toggle('red', red); b.innerHTML = banner ? `<span class="material-symbols-outlined">report</span>${esc(banner)}` : '';
  document.body.classList.toggle('stale', stale);
  $('#buildInfo').textContent = `DỮ LIỆU ${S.data && S.data.generated_at ? fDMHM(parseDT(S.data.generated_at)) : '—'} · LÀM MỚI ${Math.round(CFG.REFRESH_MS / 1000)}s`;
}

/* =====================================================================
   LEADER LINES (hover)
   ===================================================================== */
function drawLeaders(card) {
  const svg = $('#leaders'); svg.innerHTML = '';
  $$('.prow.hl').forEach((x) => x.classList.remove('hl')); $$('.mk.ping').forEach((x) => x.classList.remove('ping'));
  if (!card || innerWidth < 1280) return;
  const c = card.getBoundingClientRect(); const x1 = c.right, y1 = c.top + Math.min(40, c.height / 2);
  const targets = [];
  const pr = $(`.prow[data-pic="${CSS.escape(card.dataset.pic)}"]`); if (pr) { pr.classList.add('hl'); targets.push(pr); }
  $$(`.mk[data-id="${CSS.escape(card.dataset.id)}"]`).forEach((m) => { m.classList.add('ping'); targets.push($('.ret', m)); });
  let out = `<circle cx="${x1}" cy="${y1}" r="4"/>`;
  targets.forEach((t) => {
    const r = t.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    const x2 = r.left - 4, y2 = r.top + r.height / 2; const mid = x2 - 24;
    out += `<path d="M${x1 + 4} ${y1} L${x1 + 18} ${y1} L${mid} ${y2} L${x2} ${y2}"/><circle cx="${x2}" cy="${y2}" r="2.5"/>`;
  });
  svg.innerHTML = out;
  $$('path', svg).forEach((p) => p.style.setProperty('--len', p.getTotalLength()));
}

/* =====================================================================
   MAIN RENDER
   ===================================================================== */
function renderAll() {
  const latestId = S.latestScan && S.latestScan.scan_id;
  const newScan = !S.first && latestId && latestId !== S.lastScanId;
  const newIds = new Set();
  S.open.forEach((i) => { if (S.first ? (i.first_seen_scan && i.first_seen_scan === latestId && !S.seen.has(i.incident_id)) : !S.seen.has(i.incident_id)) newIds.add(i.incident_id); });
  if (newScan) scanSweep();
  const go = () => {
    renderStatus(); renderThreat(); renderKPI(); renderFilters(); renderQueue(newIds); renderTimeline(); renderPics(newIds); renderScanLog(newScan); renderHeat(); renderTrend(); tick();
    S.open.forEach((i) => S.seen.add(i.incident_id)); store.set('vhxk_seen', JSON.stringify([...S.seen].slice(-500)));
    S.lastScanId = latestId; S.first = false;
  };
  if (newScan && !REDUCED) setTimeout(go, 380); else go();
}

let refreshing = false;
async function refresh() {
  if (refreshing) return; refreshing = true;
  try { const raw = await load(); normalise(raw); renderAll(); $('#auth').classList.add('hidden'); }
  catch (e) {
    if (e.auth) { showAuth(e.message === 'NO_KEY' ? '' : 'Khoá không hợp lệ hoặc máy chủ từ chối. Kiểm tra lại khoá.'); }
    else { toast('Không tải được dữ liệu: ' + e.message, true); $('#outlookStatus').textContent = '⚠ MẤT KẾT NỐI API'; $('#outlookChip').classList.add('err'); }
  } finally { refreshing = false; }
}

/* ---------- auth ---------- */
function showAuth(msg) { $('#auth').classList.remove('hidden'); $('#authErr').textContent = msg || ''; $('#authName').value = store.get('vhxk_name') || ''; hideBoot(); setTimeout(() => $('#authKey').focus(), 50); }
$('#authForm').addEventListener('submit', (ev) => { ev.preventDefault(); store.set('vhxk_key', $('#authKey').value.trim()); if ($('#authName').value.trim()) store.set('vhxk_name', $('#authName').value.trim()); refresh(); });

/* ---------- boot ---------- */
const BOOT = ['[00.01] RICE-CORE OPS v3 · LIVE WAR ROOM', '[00.08] mount DATA LINK › n8n mekongfishmeal.com', '[00.14] source of truth › Google Sheets "VHXK · LIVE WAR ROOM DB"', '[00.21] feed › Outlook hourly AI scan (07:00–19:00 · T2–T7)', '[00.29] load RAG classifier 🔴 / 🟡 · PIC router · SLA clock', '[00.36] arm target-lock · scan-sweep · leader-lines', '[00.42] HANDSHAKE ……… OK'];
let bootDone = false;
function runBoot() {
  if (REDUCED) return; let k = 0;
  const step = () => { if (bootDone) return; $('#bootLog').textContent = BOOT.slice(0, k + 1).join('\n'); $('#bootBar').style.width = ((k + 1) / BOOT.length * 100) + '%'; if (++k < BOOT.length) setTimeout(step, 150); };
  step();
}
function hideBoot() { bootDone = true; $('#boot').classList.add('out'); setTimeout(() => $('#boot').classList.add('hidden'), 600); }

/* ---------- events ---------- */
document.addEventListener('click', async (ev) => {
  const lv = ev.target.closest('[data-lv]'); if (lv) { S.filter.level = lv.dataset.lv; renderFilters(); renderQueue(new Set()); return; }
  const ct = ev.target.closest('[data-cat]'); if (ct) { S.filter.cat = ct.dataset.cat; renderFilters(); renderQueue(new Set()); return; }
  const btn = ev.target.closest('[data-act]'); if (!btn) return;
  const card = btn.closest('.inc'); const inc = S.open.find((i) => i.incident_id === card.dataset.id); if (!inc) return;
  const act = btn.dataset.act;
  if (act === 'FIND') { const q = inc.contract_lot || inc.customer || ''; try { await navigator.clipboard.writeText(q); toast(`Đã chép "${q}" — dán vào ô tìm kiếm Outlook`); } catch (e) { toast(`Tìm trong Outlook: ${q}`); } window.open('https://outlook.cloud.microsoft/mail/', '_blank', 'noopener'); return; }
  let note = '';
  if (act === 'DONE') { note = prompt(`Xác nhận ĐÃ XỬ LÝ: ${inc.contract_lot} · ${inc.catLabel}\nGhi chú kết quả (tuỳ chọn):`, ''); if (note === null) return; }
  $$('button', card).forEach((b) => (b.disabled = true));
  try {
    await postAction(inc, act, note);
    if (act === 'DONE') {
      const s = document.createElement('div'); s.className = 'stamp'; s.textContent = `ĐÃ XỬ LÝ ${fHM(new Date())}`; card.appendChild(s);
      setTimeout(() => card.classList.add('collapse'), REDUCED ? 0 : 750);
      inc.status = 'DONE'; inc.resolved_at = new Date().toISOString(); inc.dResolved = new Date(); inc.resolved_by = store.get('vhxk_name') || 'Dashboard';
      setTimeout(() => { S.open = S.open.filter((i) => i !== inc); S.resolved.unshift(inc); renderThreat(); renderKPI(); renderFilters(); renderQueue(new Set()); renderPics(new Set()); renderTimeline(); renderHeat(); }, REDUCED ? 50 : 1300);
    } else { inc.status = act === 'REOPEN' ? 'OPEN' : act; renderQueue(new Set()); renderPics(new Set()); toast(act === 'ACK' ? 'Đã ghi nhận: PIC đã nhận việc' : act === 'SNOOZE' ? 'Đã hoãn 2 giờ' : 'Đã mở lại'); }
    setTimeout(refresh, 2500);
  } catch (e) { toast('Ghi thất bại: ' + e.message, true); $$('button', card).forEach((b) => (b.disabled = false)); }
});
document.addEventListener('change', (ev) => { if (ev.target.id === 'picSel') { S.filter.pic = ev.target.value; renderQueue(new Set()); } });
$('#search').addEventListener('input', (ev) => { S.filter.q = ev.target.value; renderQueue(new Set()); });
let hovered = null;
document.addEventListener('mouseover', (ev) => { const c = ev.target.closest('.inc'); if (c !== hovered) { hovered = c; drawLeaders(c); } });
addEventListener('scroll', () => { if (hovered) drawLeaders(hovered); }, { passive: true });
$('#tvToggle').addEventListener('click', (ev) => { ev.preventDefault(); document.body.classList.toggle('tv'); if (document.body.classList.contains('tv') && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); });
$$('#nav a[href^="#"]:not(#tvToggle)').forEach((a) => a.addEventListener('click', () => { $$('#nav a').forEach((x) => x.classList.remove('active')); a.classList.add('active'); }));
if (params.get('mode') === 'tv') document.body.classList.add('tv');
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
$('#sheetLink').href = CFG.SHEET_URL || '#';

/* ---------- start ---------- */
runBoot();
setInterval(tick, 1000); tick();
const t0 = Date.now();
setTimeout(hideBoot, 4000);
refresh().finally(() => setTimeout(hideBoot, Math.max(0, (REDUCED ? 0 : 1300) - (Date.now() - t0))));
setInterval(refresh, CFG.REFRESH_MS);
setInterval(() => { if (S.data) { renderTimeline(); renderStatus(); } }, 60000);
})();
