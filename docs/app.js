'use strict';

/* ================= Хранилище ================= */

const STORE_KEY = 'gymlog.v1';

const DEFAULT_EXERCISES = [
  'Жим штанги лёжа', 'Жим гантелей лёжа', 'Жим на наклонной скамье', 'Приседания со штангой',
  'Жим ногами', 'Становая тяга', 'Румынская тяга', 'Тяга верхнего блока', 'Тяга горизонтального блока',
  'Тяга штанги в наклоне', 'Подтягивания', 'Отжимания на брусьях', 'Жим штанги стоя', 'Жим гантелей сидя',
  'Махи гантелями в стороны', 'Подъём штанги на бицепс', 'Молотки', 'Французский жим',
  'Разгибание рук на блоке', 'Разгибание ног в тренажёре', 'Сгибание ног в тренажёре',
  'Икры в тренажёре', 'Пресс',
];

let db = load();

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY));
    if (d && Array.isArray(d.workouts)) return { workouts: d.workouts.map(normalizeWorkout) };
  } catch (e) { /* повреждённые данные — начинаем с нуля */ }
  return { workouts: [] };
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(db));
}

function normalizeWorkout(w) {
  return {
    id: String(w.id || uid()),
    date: /^\d{4}-\d{2}-\d{2}$/.test(w.date) ? w.date : todayISO(),
    note: String(w.note || ''),
    created: Number(w.created) || Date.now(),
    exercises: (Array.isArray(w.exercises) ? w.exercises : []).map(ex => ({
      name: String(ex.name || '').trim() || 'Без названия',
      sets: (Array.isArray(ex.sets) ? ex.sets : []).map(s => ({ w: num(s.w), r: int(s.r) })),
    })),
  };
}

/* ================= Утилиты ================= */

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const keyOf = name => String(name || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function int(v) {
  const n = num(v);
  return n === null ? null : Math.round(n);
}
const fmtNum = n => (n === null || n === undefined) ? '' : String(Math.round(n * 100) / 100).replace('.', ',');

function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtDate(iso) {
  const d = parseISO(iso);
  const opts = { weekday: 'short', day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('ru-RU', opts).replace(/\s?г\.$/, '');
}
function fmtDateShort(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y.slice(2)}`;
}
function monthLabel(iso) {
  const s = parseISO(iso).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(/\s?г\.$/, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ================= Доменная логика ================= */

const filledSets = sets => sets.filter(s => s.w !== null || s.r !== null);

function setLabel(s) {
  if (s.w !== null && s.r !== null) return `${fmtNum(s.w)}×${s.r}`;
  if (s.w !== null) return `${fmtNum(s.w)} кг`;
  if (s.r !== null) return `${s.r} повт.`;
  return '';
}
const setsText = sets => filledSets(sets).map(setLabel).join(', ');

const byDateDesc = (a, b) => b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0);
const sortedWorkouts = () => [...db.workouts].sort(byDateDesc);
const getWorkout = id => db.workouts.find(w => w.id === id);

/** Карта: ключ упражнения -> { name, entries: [{ workout, sets }] } (entries — от новых к старым). */
function exerciseIndex() {
  const map = new Map();
  for (const w of sortedWorkouts()) {
    for (const ex of w.exercises) {
      const k = keyOf(ex.name);
      if (!k) continue;
      let e = map.get(k);
      if (!e) { e = { key: k, name: ex.name.trim(), entries: [] }; map.set(k, e); }
      const sets = filledSets(ex.sets);
      if (sets.length) e.entries.push({ workout: w, sets });
    }
  }
  return map;
}

/** Последний результат по упражнению до текущей тренировки. */
function previousEntry(name, current) {
  const k = keyOf(name);
  for (const w of sortedWorkouts()) {
    if (w.id === current.id || w.date > current.date) continue;
    const ex = w.exercises.find(e => keyOf(e.name) === k && filledSets(e.sets).length);
    if (ex) return { workout: w, sets: filledSets(ex.sets) };
  }
  return null;
}

function bestSet(sets) {
  let best = null;
  const weighted = sets.filter(s => s.w !== null);
  if (weighted.length) {
    for (const s of weighted) {
      if (!best || s.w > best.w || (s.w === best.w && (s.r || 0) > (best.r || 0))) best = s;
    }
  } else {
    for (const s of sets) if (s.r !== null && (!best || s.r > best.r)) best = s;
  }
  return best;
}

/** Расчётный одноповторный максимум (формула Эпли). */
function e1rm(s) {
  if (!s.w || !s.r) return null;
  return s.r === 1 ? s.w : s.w * (1 + s.r / 30);
}

function maxWeight(sets) {
  const ws = sets.map(s => s.w).filter(w => w !== null);
  return ws.length ? Math.max(...ws) : null;
}

function allExerciseNames() {
  const idx = exerciseIndex();
  const used = [...idx.values()].sort((a, b) => b.entries.length - a.entries.length).map(e => e.name);
  return used.concat(DEFAULT_EXERCISES.filter(n => !idx.has(keyOf(n))));
}

function newWorkout() {
  const w = { id: uid(), date: todayISO(), note: '', exercises: [], created: Date.now() };
  db.workouts.push(w);
  save();
  return w;
}

function addExercise(w, name) {
  const prev = previousEntry(name, w);
  const n = prev ? prev.sets.length : 1;
  w.exercises.push({ name: name.trim(), sets: Array.from({ length: n }, () => ({ w: null, r: null })) });
}

function repeatWorkout(src) {
  const w = newWorkout();
  for (const ex of src.exercises) addExercise(w, ex.name);
  save();
  return w;
}

/* ================= Каркас UI ================= */

let currentBack = null;

function setHeader(title, backHash, rightHtml = '') {
  const t = $('#title');
  if (t.textContent !== title) { t.textContent = title; restartAnim(t, 'tfade'); }
  currentBack = backHash;
  const b = $('#backBtn');
  b.hidden = !backHash;
  b.onclick = () => { location.hash = backHash; };
  $('#topRight').innerHTML = rightHtml;
}

function setTab(tab) {
  document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
}

let modalTimer = 0;

function openModal(html, { top = false } = {}) {
  clearTimeout(modalTimer);
  const m = $('#modal');
  m.className = top ? 'top' : '';
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.hidden = false;
  void m.offsetWidth; // стартовое положение за краем экрана, затем выезд
  m.classList.add('open');
  m.onclick = e => { if (e.target === m) closeModal(); };
  return $('.sheet', m);
}

function closeModal(instant = false) {
  const m = $('#modal');
  if (m.hidden) return;
  m.classList.remove('open');
  clearTimeout(modalTimer);
  const done = () => { m.hidden = true; m.innerHTML = ''; };
  if (instant || reduceMotion) done(); else modalTimer = setTimeout(done, 280);
}

/* ================= Анимации ================= */

const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const ANIM_CLASSES = ['in-r', 'in-l', 'in-f', 'full'];

/** Появление блока: from = 'r' (справа), 'l' (слева), 'f' (плавно). full — въезд на всю ширину (после свайпа). */
function animateIn(el, from = 'f', full = false) {
  if (!el) return;
  el.classList.remove(...ANIM_CLASSES);
  el.style.transition = '';
  el.style.transform = '';
  void el.offsetWidth;
  el.classList.add('in-' + from);
  if (full) el.classList.add('full');
  const done = e => {
    if (e.target !== el) return;
    el.classList.remove(...ANIM_CLASSES);
    el.removeEventListener('animationend', done);
  };
  el.addEventListener('animationend', done);
}

function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Подсветить появление последнего элемента (новый подход / упражнение). */
function popLast(root, sel) {
  const els = root ? root.querySelectorAll(sel) : [];
  if (els.length) els[els.length - 1].classList.add('pop');
}

/** Цифры «набегают» от 0 до значения из data-count. */
function countUp(root) {
  if (reduceMotion) return;
  root.querySelectorAll('[data-count]').forEach(el => {
    const target = Number(el.dataset.count);
    if (!target) return;
    const dec = target % 1 ? 1 : 0, f = 10 ** dec, t0 = performance.now(), dur = 650;
    const final = el.textContent;
    let finished = false;
    el.textContent = '0';
    const step = now => {
      if (finished) return;
      const p = Math.min(1, (now - t0) / dur), k = 1 - (1 - p) ** 3;
      el.textContent = p < 1 ? fmtNum(Math.round(target * k * f) / f) : final;
      if (p < 1) requestAnimationFrame(step); else finished = true;
    };
    requestAnimationFrame(step);
    // Страховка: если анимация приостановилась (фон, экономия заряда) — ставим итоговое значение
    setTimeout(() => { finished = true; el.textContent = final; }, dur + 150);
  });
}

/** Переключатель с ездящей плашкой. items: [[значение, подпись], ...] */
function segHtml(items, cur, attr) {
  const i = Math.max(0, items.findIndex(([k]) => String(k) === String(cur)));
  return `<div class="seg" style="--n:${items.length};--i:${i}"><span class="seg-ind"></span>${items.map(([k, l], j) =>
    `<button data-${attr}="${k}" class="${j === i ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}

function segSelect(btn) {
  const seg = btn.parentElement;
  const btns = [...seg.querySelectorAll('button')];
  btns.forEach(b => b.classList.toggle('on', b === btn));
  seg.style.setProperty('--i', btns.indexOf(btn));
}

/* ================= Свайпы ================= */

const TABS = [['workouts', '#/'], ['exercises', '#/exercises'], ['stats', '#/stats'], ['settings', '#/settings']];
const tabIdx = tab => TABS.findIndex(t => t[0] === tab);

let pageSwipe = null;   // свайп экрана: соседние вкладки или «назад»
let innerSwipe = null;  // свайп внутри экрана (календарь): { area, body, can(dir), go(dir) }
let swipeNav = false;   // переход сделан свайпом — новый экран въезжает целиком
let gesture = null;

function navigate(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}

function slideX(el, x, after) {
  el.style.transition = reduceMotion ? 'none' : `transform .2s ${EASE}`;
  el.style.transform = x ? `translateX(${x}px)` : '';
  setTimeout(() => {
    if (after) after(); else el.style.transition = '';
  }, reduceMotion ? 0 : 200);
}

document.addEventListener('touchstart', e => {
  gesture = null;
  if (e.touches.length !== 1) return;
  const target = e.target;
  if (target === document.activeElement && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
  const t = e.touches[0];
  const g = { x0: t.clientX, y0: t.clientY, t0: e.timeStamp, axis: null, dx: 0, dy: 0 };
  const modal = $('#modal');

  if (!modal.hidden) {
    // Шторку можно смахнуть: нижнюю — вниз, верхнюю (выбор упражнения) — вверх
    const sheet = target.closest('.sheet');
    if (!sheet || !modal.classList.contains('open')) return;
    g.top = modal.classList.contains('top');
    if (g.top ? target.closest('.sug') : sheet.scrollTop > 0) return;
    Object.assign(g, { kind: 'sheet', el: sheet });
  } else if (innerSwipe && target.closest(innerSwipe.area)) {
    Object.assign(g, { kind: 'x', el: $(innerSwipe.body), sw: innerSwipe });
  } else if (pageSwipe && !target.closest('#topbar, #tabbar')) {
    Object.assign(g, { kind: 'x', el: view, sw: pageSwipe });
  } else return;

  if (g.el) gesture = g;
}, { passive: true });

document.addEventListener('touchmove', e => {
  const g = gesture;
  if (!g || e.touches.length !== 1) return;
  const t = e.touches[0];
  const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
  const s = g.top ? -1 : 1;

  if (!g.axis) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    g.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
    const wrong = g.kind === 'x' ? g.axis !== 'x' : (g.axis !== 'y' || dy * s < 0);
    if (wrong) { gesture = null; return; }   // обычная прокрутка
    g.el.style.transition = 'none';
  }
  if (e.cancelable) e.preventDefault();

  if (g.kind === 'x') {
    const dir = dx < 0 ? 1 : -1;
    g.dx = g.sw.can(dir) ? dx : dx * 0.25;     // «резинка», если дальше идти некуда
    g.el.style.transform = `translateX(${g.dx}px)`;
  } else {
    const d = dy * s;
    g.dy = d > 0 ? d : d * 0.2;
    g.el.style.transform = `translateY(${g.dy * s}px)`;
  }
}, { passive: false });

function endGesture(e, cancelled) {
  const g = gesture;
  gesture = null;
  if (!g || !g.axis) return;
  const dt = Math.max(1, e.timeStamp - g.t0);

  if (g.kind === 'x') {
    const dir = g.dx < 0 ? 1 : -1;
    const dist = Math.abs(g.dx), w = g.el.offsetWidth || window.innerWidth;
    const ok = !cancelled && g.sw.can(dir) && (dist > w * 0.28 || (dist > 40 && dist / dt > 0.45));
    if (ok) slideX(g.el, -dir * w, () => g.sw.go(dir));
    else slideX(g.el, 0);
  } else {
    const ok = !cancelled && (g.dy > 90 || (g.dy > 30 && g.dy / dt > 0.45));
    g.el.style.transition = '';
    g.el.style.transform = '';
    if (ok) closeModal();
  }
}

document.addEventListener('touchend', e => endGesture(e, false));
document.addEventListener('touchcancel', e => endGesture(e, true));

/* ================= Маршрутизация ================= */

let lastRoute = null;

function route() {
  closeModal(true);
  view.onclick = view.oninput = view.onchange = null;
  innerSwipe = null;
  gesture = null;
  $('#fab').hidden = true;

  const hash = location.hash || '#/';
  const [p0, p1] = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const detail = (p0 === 'w' || p0 === 'exercise') && !!p1;
  const tab = detail ? null : (TABS.find(t => t[0] === p0) || TABS[0])[0];

  // Направление анимации: вкладки — по порядку, вглубь — справа, назад — слева
  const cur = { key: hash, depth: detail ? 1 : 0, tab };
  let from = 'f';
  if (lastRoute && lastRoute.key !== cur.key) {
    from = !cur.depth && !lastRoute.depth
      ? (tabIdx(cur.tab) > tabIdx(lastRoute.tab) ? 'r' : 'l')
      : (cur.depth >= lastRoute.depth ? 'r' : 'l');
  }
  const full = swipeNav && from !== 'f';
  swipeNav = false;
  lastRoute = cur;

  pageSwipe = detail
    ? { can: d => d < 0 && !!currentBack, go: () => { swipeNav = true; navigate(currentBack); } }
    : { can: d => !!TABS[tabIdx(tab) + d], go: d => { swipeNav = true; navigate(TABS[tabIdx(tab) + d][1]); } };

  window.scrollTo(0, 0);
  if (p0 === 'w' && p1) renderWorkout(p1);
  else if (p0 === 'exercises') renderExercises();
  else if (p0 === 'exercise' && p1) renderExercise(p1);
  else if (p0 === 'stats') renderStats();
  else if (p0 === 'settings') renderSettings();
  else renderWorkouts();
  animateIn(view, from, full);
}

/* ================= Экран: список тренировок ================= */

let workoutsQuery = '';

function renderWorkouts() {
  setTab('workouts');
  setHeader('Тренировки', null);

  // Убираем пустые тренировки (созданные, но не заполненные)
  const before = db.workouts.length;
  db.workouts = db.workouts.filter(w => w.exercises.length || w.note.trim());
  if (db.workouts.length !== before) save();

  view.innerHTML = `
    <input class="search" type="search" id="wq" placeholder="🔍 Поиск: упражнение или заметка" value="${esc(workoutsQuery)}">
    <div id="wlist"></div>`;

  const draw = () => { $('#wlist').innerHTML = workoutsListHtml(workoutsQuery); };
  $('#wq').oninput = e => { workoutsQuery = e.target.value; draw(); };
  const fab = $('#fab');
  fab.hidden = false;
  fab.onclick = () => { location.hash = '#/w/' + newWorkout().id; };
  draw();
}

function workoutsListHtml(q) {
  const list = sortedWorkouts();
  if (!list.length) {
    return `<div class="empty">Пока нет тренировок.<br>Нажмите <b>+</b>, чтобы записать первую.</div>`;
  }
  const qk = keyOf(q);
  let html = '', month = '', found = 0;
  for (const w of list) {
    let matched = [];
    if (qk) {
      matched = w.exercises.filter(e => keyOf(e.name).includes(qk));
      if (!matched.length && !keyOf(w.note).includes(qk)) continue;
    }
    found++;
    const m = monthLabel(w.date);
    if (m !== month) { month = m; html += `<h2 class="month">${esc(m)}</h2>`; }

    const body = matched.length
      ? matched.map(e => `<div class="line"><b>${esc(e.name)}</b> ${esc(setsText(e.sets)) || '—'}</div>`).join('')
      : `<div class="muted">${esc(w.exercises.map(e => e.name).join(' · ')) || 'Без упражнений'}</div>`;

    html += `<a class="card" href="#/w/${w.id}">
      <div class="card-title">${esc(fmtDate(w.date))}</div>
      ${body}
      ${w.note.trim() ? `<div class="note-preview">📝 ${esc(w.note)}</div>` : ''}
    </a>`;
  }
  return found ? html : `<div class="empty">Ничего не найдено</div>`;
}

/* ================= Экран: тренировка ================= */

function renderWorkout(id) {
  const w = getWorkout(id);
  if (!w) { location.hash = '#/'; return; }
  setTab('workouts');
  setHeader(fmtDate(w.date), '#/');

  const draw = () => {
    view.innerHTML = `
      <label class="field"><span>Дата</span><input type="date" id="wdate" value="${w.date}"></label>
      <div id="exlist">${w.exercises.map((ex, i) => exerciseCardHtml(w, ex, i)).join('')}</div>
      <button class="btn primary block" data-act="add-ex">+ Упражнение</button>
      <label class="field"><span>Заметка</span>
        <textarea id="wnote" rows="3" placeholder="Самочувствие, сон, что угодно">${esc(w.note)}</textarea>
      </label>
      <div class="row-btns">
        ${w.exercises.length ? '<button class="btn" data-act="repeat">🔁 Повторить</button>' : ''}
        <button class="btn danger" data-act="del-w">Удалить</button>
      </div>`;
  };
  draw();

  view.onchange = e => {
    if (e.target.id === 'wdate' && e.target.value) {
      w.date = e.target.value;
      save();
      setHeader(fmtDate(w.date), '#/');
      draw();
    }
  };

  view.oninput = e => {
    const t = e.target;
    if (t.id === 'wnote') { w.note = t.value; save(); return; }
    if (t.dataset.f) {
      const set = w.exercises[+t.dataset.ei].sets[+t.dataset.si];
      if (t.dataset.f === 'w') set.w = num(t.value); else set.r = int(t.value);
      save();
    }
  };

  view.onclick = e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const ei = +b.dataset.ei, si = +b.dataset.si;
    const ex = w.exercises[ei];
    switch (b.dataset.act) {
      case 'add-ex':
        pickExercise(name => {
          addExercise(w, name);
          save();
          draw();
          popLast(view, '.ex-card');
          const cards = view.querySelectorAll('.ex-card');
          cards[cards.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        break;
      case 'add-set': {
        const last = ex.sets[ex.sets.length - 1];
        ex.sets.push({ w: last ? last.w : null, r: last ? last.r : null });
        save();
        draw();
        popLast(view.querySelectorAll('.ex-card')[ei], '.set-row:not(.set-head)');
        break;
      }
      case 'del-set': {
        const row = b.closest('.set-row');
        if (row.classList.contains('removing')) break;
        row.classList.add('removing');
        const set = ex.sets[si];
        setTimeout(() => {
          const idx = ex.sets.indexOf(set);
          if (idx >= 0) ex.sets.splice(idx, 1);
          save();
          draw();
        }, reduceMotion ? 0 : 170);
        break;
      }
      case 'fill-prev': {
        const prev = previousEntry(ex.name, w);
        if (prev) { ex.sets = prev.sets.map(s => ({ w: s.w, r: s.r })); save(); draw(); }
        break;
      }
      case 'ex-menu':
        exerciseMenu(w, ei, draw);
        break;
      case 'repeat':
        location.hash = '#/w/' + repeatWorkout(w).id;
        break;
      case 'del-w':
        if (confirm('Удалить эту тренировку?')) {
          db.workouts = db.workouts.filter(x => x !== w);
          save();
          location.hash = '#/';
        }
        break;
    }
  };
}

function exerciseCardHtml(w, ex, i) {
  const prev = previousEntry(ex.name, w);
  const rows = ex.sets.map((s, si) => {
    const ps = prev && prev.sets[si];
    return `<div class="set-row">
      <span class="set-n">${si + 1}</span>
      <input data-f="w" data-ei="${i}" data-si="${si}" inputmode="decimal" autocomplete="off"
             placeholder="${ps && ps.w !== null ? fmtNum(ps.w) : 'кг'}" value="${s.w !== null ? fmtNum(s.w) : ''}">
      <input data-f="r" data-ei="${i}" data-si="${si}" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
             placeholder="${ps && ps.r !== null ? ps.r : 'раз'}" value="${s.r !== null ? s.r : ''}">
      <button class="icon-btn del" data-act="del-set" data-ei="${i}" data-si="${si}" aria-label="Удалить подход">✕</button>
    </div>`;
  }).join('');

  const prevHtml = prev
    ? `<div class="prev">
         <span>Прошлый раз ${esc(fmtDateShort(prev.workout.date))}: <b>${esc(setsText(prev.sets))}</b></span>
         <button class="link" data-act="fill-prev" data-ei="${i}">Заполнить</button>
       </div>`
    : `<div class="prev">Первый раз 💪</div>`;

  return `<div class="ex-card">
    <div class="ex-head">
      <a href="#/exercise/${encodeURIComponent(ex.name)}" class="ex-name">${esc(ex.name)} ›</a>
      <button class="icon-btn" data-act="ex-menu" data-ei="${i}" aria-label="Действия">⋯</button>
    </div>
    ${prevHtml}
    <div class="set-row set-head"><span>#</span><span>Вес, кг</span><span>Повторы</span><span></span></div>
    ${rows}
    <button class="btn small" data-act="add-set" data-ei="${i}">+ Подход</button>
  </div>`;
}

function exerciseMenu(w, ei, redraw) {
  const ex = w.exercises[ei];
  const sheet = openModal(`
    <div class="sheet-title">${esc(ex.name)}</div>
    <button class="btn block" data-m="up" ${ei === 0 ? 'disabled' : ''}>↑ Переместить выше</button>
    <button class="btn block" data-m="down" ${ei === w.exercises.length - 1 ? 'disabled' : ''}>↓ Переместить ниже</button>
    <button class="btn block" data-m="replace">Заменить упражнение</button>
    <button class="btn block danger" data-m="del">Удалить из тренировки</button>
    <button class="btn block" data-m="cancel">Отмена</button>`);

  sheet.onclick = e => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const a = b.dataset.m;
    closeModal();
    const swap = (i, j) => { [w.exercises[i], w.exercises[j]] = [w.exercises[j], w.exercises[i]]; };
    if (a === 'up' && ei > 0) swap(ei, ei - 1);
    else if (a === 'down' && ei < w.exercises.length - 1) swap(ei, ei + 1);
    else if (a === 'replace') return pickExercise(name => { ex.name = name.trim(); save(); redraw(); });
    else if (a === 'del') { if (!confirm(`Удалить «${ex.name}» из тренировки?`)) return; w.exercises.splice(ei, 1); }
    else return;
    save();
    redraw();
  };
}

function pickExercise(onPick) {
  const sheet = openModal(`
    <div class="sheet-title">Выберите упражнение</div>
    <input class="search" id="exq" placeholder="Название, например «Жим лёжа»" autocomplete="off">
    <div id="exsug" class="sug"></div>`, { top: true });

  const names = allExerciseNames();
  const input = $('#exq', sheet);
  const findExact = q => names.find(n => keyOf(n) === keyOf(q));

  const draw = () => {
    const q = input.value.trim();
    const qk = keyOf(q);
    const list = names.filter(n => !qk || keyOf(n).includes(qk)).slice(0, 60);
    $('#exsug', sheet).innerHTML =
      (q && !findExact(q) ? `<button class="sug-item add" data-name="${esc(q)}">+ Новое: «${esc(q)}»</button>` : '') +
      list.map(n => `<button class="sug-item" data-name="${esc(n)}">${esc(n)}</button>`).join('');
  };

  const choose = name => { closeModal(); onPick(name); };
  input.oninput = draw;
  input.onkeydown = e => {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      choose(findExact(input.value) || input.value.trim());
    }
  };
  sheet.onclick = e => {
    const b = e.target.closest('[data-name]');
    if (b) choose(b.dataset.name);
  };
  draw();
  input.focus();
}

/* ================= Экран: список упражнений ================= */

let exercisesQuery = '';

function renderExercises() {
  setTab('exercises');
  setHeader('Упражнения', null);
  view.innerHTML = `
    <input class="search" type="search" id="eq" placeholder="🔍 Найти упражнение" value="${esc(exercisesQuery)}">
    <div id="elist"></div>`;

  const all = [...exerciseIndex().values()].filter(e => e.entries.length);

  const draw = () => {
    const qk = keyOf(exercisesQuery);
    const list = all.filter(e => !qk || e.key.includes(qk));
    if (!list.length) {
      $('#elist').innerHTML = `<div class="empty">${all.length
        ? 'Ничего не найдено'
        : 'Здесь появятся упражнения из ваших тренировок с историей весов'}</div>`;
      return;
    }
    $('#elist').innerHTML = list.map(e => {
      const last = e.entries[0];
      const best = bestSet(e.entries.flatMap(x => x.sets));
      return `<a class="card" href="#/exercise/${encodeURIComponent(e.name)}">
        <div class="card-title">${esc(e.name)}</div>
        <div class="muted">Последний раз ${esc(fmtDateShort(last.workout.date))}: ${esc(setsText(last.sets))}</div>
        ${best ? `<div class="muted">🏆 Рекорд: ${esc(setLabel(best))}</div>` : ''}
      </a>`;
    }).join('');
  };

  $('#eq').oninput = e => { exercisesQuery = e.target.value; draw(); };
  draw();
}

/* ================= Экран: история упражнения ================= */

let exChartMode = 'w';

function renderExercise(name) {
  setTab('exercises');
  const e = exerciseIndex().get(keyOf(name));
  if (!e) { location.hash = '#/exercises'; return; }
  setHeader(e.name, '#/exercises', `<button class="icon-btn" id="renameEx">Изм.</button>`);

  const all = e.entries.flatMap(x => x.sets);
  const best = bestSet(all);
  const e1s = all.map(e1rm).filter(Boolean);
  const best1rm = e1s.length ? Math.max(...e1s) : null;
  const chron = [...e.entries].reverse();
  const series = {
    w: chron.map(x => ({ date: x.workout.date, v: maxWeight(x.sets) })).filter(p => p.v !== null),
    e: chron.map(x => {
      const v = x.sets.map(e1rm).filter(Boolean);
      return { date: x.workout.date, v: v.length ? Math.round(Math.max(...v) * 10) / 10 : null };
    }).filter(p => p.v !== null),
  };
  const modes = ['w', 'e'].filter(m => series[m].length >= 2);

  const chartMode = () => modes.includes(exChartMode) ? exChartMode : modes[0];
  const chartBodyHtml = m => `<div class="muted">${m === 'w'
    ? 'Максимальный вес по тренировкам, кг'
    : 'Расчётный 1ПМ по тренировкам, кг — учитывает и вес, и повторы'}</div>${chartSvg(series[m])}`;
  const chartHtml = () => {
    if (!modes.length) return '';
    const m = chartMode();
    const seg = modes.length > 1 ? segHtml([['w', 'Макс. вес'], ['e', 'Расч. 1ПМ']], m, 'chart') : '';
    return `<div class="card">${seg}<div id="chartBody">${chartBodyHtml(m)}</div></div>`;
  };

  view.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="stat-v">${best ? esc(setLabel(best)) : '—'}</div><div class="stat-l">Рекорд</div></div>
      <div class="stat"><div class="stat-v" ${best1rm ? `data-count="${Math.round(best1rm * 10) / 10}"` : ''}>${best1rm ? fmtNum(Math.round(best1rm * 10) / 10) : '—'}</div><div class="stat-l">Расч. 1ПМ, кг</div></div>
      <div class="stat"><div class="stat-v" data-count="${e.entries.length}">${e.entries.length}</div><div class="stat-l">Тренировок</div></div>
    </div>
    ${chartHtml()}
    <h2 class="month">История</h2>
    ${e.entries.map(x => `
      <a class="card" href="#/w/${x.workout.id}">
        <div class="card-title">${esc(fmtDate(x.workout.date))}</div>
        <div class="chips">${x.sets.map(s => `<span class="chip ${s === best ? 'pr' : ''}">${esc(setLabel(s))}</span>`).join('')}</div>
      </a>`).join('')}`;

  countUp(view);

  view.onclick = ev => {
    const b = ev.target.closest('[data-chart]');
    if (!b || b.classList.contains('on')) return;
    exChartMode = b.dataset.chart;
    segSelect(b);
    $('#chartBody').innerHTML = chartBodyHtml(chartMode());
    animateIn($('#chartBody'), 'f');
  };

  $('#renameEx').onclick = () => {
    const nn = prompt('Новое название (изменится во всех тренировках). Если такое упражнение уже есть — записи объединятся.', e.name);
    if (!nn || !nn.trim()) return;
    for (const w of db.workouts) {
      for (const ex of w.exercises) if (keyOf(ex.name) === e.key) ex.name = nn.trim();
    }
    save();
    const target = '#/exercise/' + encodeURIComponent(nn.trim());
    if (location.hash === target) route(); else location.hash = target;
  };
}

function chartSvg(pts) {
  const W = 320, H = 150, L = 36, R = 10, T = 12, B = 22;
  const vs = pts.map(p => p.v);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (min === max) { min -= 5; max += 5; }
  const x = i => L + i * (W - L - R) / (pts.length - 1);
  const y = v => T + (max - v) / (max - min) * (H - T - B);
  const line = 'M' + pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' L');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart">
    <line x1="${L}" y1="${y(max)}" x2="${W - R}" y2="${y(max)}" class="grid"/>
    <line x1="${L}" y1="${y(min)}" x2="${W - R}" y2="${y(min)}" class="grid"/>
    <text x="${L - 6}" y="${y(max) + 4}" text-anchor="end">${fmtNum(max)}</text>
    <text x="${L - 6}" y="${y(min) + 4}" text-anchor="end">${fmtNum(min)}</text>
    <path d="${line}" pathLength="1" class="ln"/>
    ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3"/>`).join('')}
    <text x="${L}" y="${H - 5}">${fmtDateShort(pts[0].date)}</text>
    <text x="${W - R}" y="${H - 5}" text-anchor="end">${fmtDateShort(pts[pts.length - 1].date)}</text>
  </svg>`;
}

/* ================= Экран: статистика ================= */

let statsMonth = todayISO().slice(0, 7);
let statsPeriod = 90;

const DAY_MS = 864e5;
const pad2 = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}
/** Понедельник недели, в которую попадает дата. */
function weekStart(iso) {
  const d = parseISO(iso);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return isoOf(d);
}
const weeksBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / (7 * DAY_MS));

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

const visitWorkouts = () => db.workouts.filter(w => w.exercises.length);

/** Походы в зал считаются по дням: две тренировки в один день — один поход. */
function visitStats() {
  const days = [...new Set(visitWorkouts().map(w => w.date))].sort();
  const res = { total: days.length, week: 0, month: 0, avg: 0, streak: 0, bestStreak: 0 };
  if (!days.length) return res;

  const today = todayISO();
  const thisWeek = weekStart(today);
  res.week = days.filter(d => d >= thisWeek && d <= addDays(thisWeek, 6)).length;
  res.month = days.filter(d => d.startsWith(today.slice(0, 7))).length;

  // Среднее за последние 13 недель (или с первой тренировки, если она была позже)
  const span = Math.max(1, Math.min(13, weeksBetween(weekStart(days[0]), thisWeek) + 1));
  const from = addDays(thisWeek, -7 * (span - 1));
  res.avg = days.filter(d => d >= from && d <= addDays(thisWeek, 6)).length / span;

  // Серия недель подряд хотя бы с одним походом; текущая неделя без похода серию ещё не обрывает
  const weeks = new Set(days.map(weekStart));
  let wk = weeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  while (weeks.has(wk)) { res.streak++; wk = addDays(wk, -7); }

  let run = 0, prev = null;
  for (const w of [...weeks].sort()) {
    run = prev && weeksBetween(prev, w) === 1 ? run + 1 : 1;
    res.bestStreak = Math.max(res.bestStreak, run);
    prev = w;
  }
  return res;
}

/** Чем сравнивать результаты упражнения: 1ПМ (вес+повторы), вес или повторы (без веса). */
function scoreKind(sets) {
  if (sets.some(s => e1rm(s))) return 'e';
  if (sets.some(s => s.w !== null)) return 'w';
  return 'r';
}

function topSet(sets, kind) {
  const val = s => kind === 'e' ? e1rm(s) : kind === 'w' ? s.w : s.r;
  let best = null, bv = null;
  for (const s of sets) {
    const v = val(s);
    if (v && (bv === null || v > bv)) { best = s; bv = v; }
  }
  return best && { set: best, v: bv };
}

/** Изменение результата: начало периода (или первая тренировка в нём) против последней тренировки. */
function progressList(days) {
  const start = addDays(todayISO(), -days);
  const out = [];
  for (const e of exerciseIndex().values()) {
    const chron = [...e.entries].reverse();
    const kind = scoreKind(chron.flatMap(x => x.sets));
    const scored = chron.map(x => ({ x, t: topSet(x.sets, kind) })).filter(p => p.t);
    if (scored.length < 2) continue;
    const cur = scored[scored.length - 1];
    if (cur.x.workout.date < start) continue;
    let base = null;
    for (const p of scored) {
      if (p.x.workout.date <= start) base = p; else break;
    }
    base = base || scored[0];
    if (base === cur) continue;
    out.push({ name: e.name, base, cur, pct: (cur.t.v - base.t.v) / base.t.v * 100 });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

/** Личные рекорды по весу (для упражнений без веса — по повторам), от новых к старым. */
function recentRecords(limit = 5) {
  const recs = [];
  for (const e of exerciseIndex().values()) {
    const chron = [...e.entries].reverse();
    const kind = scoreKind(chron.flatMap(x => x.sets)) === 'r' ? 'r' : 'w';
    let best = null;
    for (const x of chron) {
      const t = topSet(x.sets, kind);
      if (!t) continue;
      if (best && t.v > best.v) recs.push({ name: e.name, workout: x.workout, set: t.set, prev: best.set });
      if (!best || t.v > best.v) best = t;
    }
  }
  return recs.sort((a, b) => byDateDesc(a.workout, b.workout)).slice(0, limit);
}

function calendarHtml() {
  const [y, m] = statsMonth.split('-').map(Number);
  const byDay = new Map();
  for (const w of visitWorkouts()) {
    if (!w.date.startsWith(statsMonth)) continue;
    if (!byDay.has(w.date)) byDay.set(w.date, []);
    byDay.get(w.date).push(w);
  }
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = todayISO();

  let cells = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => `<div class="cal-wd">${d}</div>`).join('');
  cells += '<div></div>'.repeat(offset);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${statsMonth}-${pad2(d)}`;
    const cls = iso === today ? ' today' : '';
    cells += byDay.has(iso)
      ? `<button class="cal-day has${cls}" data-act="day" data-date="${iso}">${d}</button>`
      : `<div class="cal-day${cls}">${d}</div>`;
  }

  const n = byDay.size;
  return `<div class="cal-head">
      <button class="icon-btn" data-act="month" data-d="-1" aria-label="Предыдущий месяц">‹</button>
      <div class="cal-title" id="calTitle">${esc(monthLabel(statsMonth + '-01'))}
        <div class="muted">${n} ${plural(n, 'поход', 'похода', 'походов')}</div></div>
      <button class="icon-btn" data-act="month" data-d="1" aria-label="Следующий месяц" ${calIsCurrent() ? 'disabled' : ''}>›</button>
    </div>
    <div class="cal" id="calBody">${cells}</div>`;
}

const calIsCurrent = () => statsMonth >= todayISO().slice(0, 7);

function progressRowHtml(p) {
  const pct = Math.round(p.pct);
  const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : '';
  return `<a class="prog-row" href="#/exercise/${encodeURIComponent(p.name)}">
    <div><div class="prog-name">${esc(p.name)}</div>
      <div class="muted">${esc(setLabel(p.base.t.set))} → ${esc(setLabel(p.cur.t.set))}</div></div>
    <div class="prog-pct ${cls}">${pct > 0 ? '+' : ''}${pct}%</div>
  </a>`;
}

function recordRowHtml(r) {
  return `<a class="prog-row" href="#/w/${r.workout.id}">
    <div><div class="prog-name">🏆 ${esc(r.name)}</div>
      <div class="muted">${esc(fmtDateShort(r.workout.date))} · было ${esc(setLabel(r.prev))}</div></div>
    <div class="prog-pct up">${esc(setLabel(r.set))}</div>
  </a>`;
}

function renderStats() {
  setTab('stats');
  setHeader('Статистика', null);

  const v = visitStats();
  if (!v.total) {
    view.innerHTML = `<div class="empty">Здесь появится статистика,<br>когда вы запишете первую тренировку</div>`;
    return;
  }

  const stat = (n, l) => `<div class="stat"><div class="stat-v" data-count="${n}">${fmtNum(n)}</div><div class="stat-l">${esc(l)}</div></div>`;

  const progHtml = () => {
    const prog = progressList(statsPeriod);
    return prog.length
      ? `<div class="card list">${prog.map(progressRowHtml).join('')}</div>
         <div class="footnote">Начало периода против последней тренировки. % — по расчётному 1ПМ, он учитывает и вес, и повторы.</div>`
      : `<div class="empty small">Нужно хотя бы две тренировки с одним упражнением, и последняя — в выбранном периоде</div>`;
  };
  const recs = recentRecords();

  view.innerHTML = `
    <h2 class="month">Походы в зал</h2>
    <div class="stats two">
      ${stat(v.week, 'на этой неделе')}
      ${stat(v.month, 'в этом месяце')}
      ${stat(Math.round(v.avg * 10) / 10, 'в среднем в неделю')}
      ${stat(v.streak, `${plural(v.streak, 'неделя', 'недели', 'недель')} подряд · рекорд ${v.bestStreak}`)}
    </div>
    <div class="card cal-card" id="calCard">${calendarHtml()}</div>
    <div class="footnote center">Листайте месяцы свайпом по календарю</div>

    <h2 class="month">Прогресс</h2>
    ${segHtml([[30, 'Месяц'], [90, '3 месяца'], [365, 'Год']], statsPeriod, 'p')}
    <div id="progBox">${progHtml()}</div>

    ${recs.length ? `<h2 class="month">Последние рекорды</h2><div class="card list">${recs.map(recordRowHtml).join('')}</div>` : ''}`;

  countUp(view);

  /** Смена месяца в календаре: стрелками или свайпом (тогда месяц въезжает целиком). */
  const changeMonth = (d, bySwipe) => {
    if (d > 0 && calIsCurrent()) return;
    const [y, m] = statsMonth.split('-').map(Number);
    statsMonth = isoOf(new Date(y, m - 1 + d, 1)).slice(0, 7);
    $('#calCard').innerHTML = calendarHtml();
    animateIn($('#calBody'), d > 0 ? 'r' : 'l', bySwipe);
    restartAnim($('#calTitle'), 'tfade');
  };

  innerSwipe = {
    area: '#calCard',
    body: '#calBody',
    can: d => d < 0 || !calIsCurrent(),
    go: d => changeMonth(d, true),
  };

  view.onclick = e => {
    const p = e.target.closest('[data-p]');
    if (p) {
      if (p.classList.contains('on')) return;
      statsPeriod = +p.dataset.p;
      segSelect(p);
      $('#progBox').innerHTML = progHtml();
      animateIn($('#progBox'), 'f');
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'month') {
      changeMonth(Number(b.dataset.d), false);
    } else if (act === 'day') {
      const list = sortedWorkouts().filter(w => w.date === b.dataset.date && w.exercises.length);
      if (list.length === 1) { location.hash = '#/w/' + list[0].id; return; }
      openModal(`<div class="sheet-title">${esc(fmtDate(b.dataset.date))}</div>` +
        list.map(w => `<a class="card" href="#/w/${w.id}"><div class="muted">${esc(w.exercises.map(x => x.name).join(' · '))}</div></a>`).join(''));
    }
  };
}

/* ================= Экран: настройки / резервная копия ================= */

function renderSettings() {
  setTab('settings');
  setHeader('Ещё', null);
  const nE = [...exerciseIndex().values()].filter(e => e.entries.length).length;

  view.innerHTML = `
    <div class="card">
      <div class="card-title">Данные</div>
      <div class="muted">Тренировок: ${db.workouts.length} · Упражнений: ${nE}</div>
      <div class="muted" style="margin-top:6px">Всё хранится только на этом телефоне. Раз в неделю-две сохраняйте резервную копию (например, в «Файлы» → iCloud Drive).</div>
    </div>
    <button class="btn block primary" id="exportBtn">💾 Сохранить резервную копию</button>
    <label class="btn block">📂 Восстановить из файла
      <input type="file" id="importFile" accept=".json,application/json" class="file-input">
    </label>
    <div class="card">
      <div class="card-title">Установка на iPhone</div>
      <ol class="muted steps">
        <li>Откройте адрес приложения в <b>Safari</b></li>
        <li>Нажмите «Поделиться» → «На экран „Домой“»</li>
        <li>Запускайте с иконки — работает и без интернета</li>
      </ol>
    </div>
    <button class="btn block danger" id="wipeBtn">Удалить все данные</button>`;

  $('#exportBtn').onclick = exportData;
  $('#importFile').onchange = async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !Array.isArray(d.workouts)) throw new Error('bad format');
      if (!confirm(`В файле тренировок: ${d.workouts.length}. Заменить текущие данные?`)) return;
      db = { workouts: d.workouts.map(normalizeWorkout) };
      save();
      alert('Данные восстановлены');
      renderSettings();
    } catch (err) {
      alert('Не удалось прочитать файл резервной копии');
    }
  };
  $('#wipeBtn').onclick = () => {
    if (confirm('Удалить ВСЕ тренировки?') && confirm('Точно? Это нельзя отменить.')) {
      db = { workouts: [] };
      save();
      renderSettings();
    }
  };
}

async function exportData() {
  const json = JSON.stringify({ app: 'gymlog', version: 1, exported: new Date().toISOString(), workouts: db.workouts }, null, 2);
  const name = `gym-backup-${todayISO()}.json`;
  const file = new File([json], name, { type: 'application/json' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ================= Запуск ================= */

window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
