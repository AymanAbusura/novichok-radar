(function () {
  'use strict';
  var S = window.Scoring, Seed = window.Seed;
  var KEY = 'novichok.v1';
  var DEPTS = ['Склад', 'Магазин', 'Отдел продаж', 'Офис'];
  var MENTORS = { 'Склад': ['Виктор Л.', 'Олег С.', 'Дмитрий Ш.'], 'Магазин': ['Анна К.', 'Татьяна В.', 'Максим Г.'], 'Отдел продаж': ['Кирилл Д.', 'Наталья Р.'], 'Офис': ['Алла П.'] };
  var LEVEL_NAME = { high: 'Позвонить сегодня', mid: 'Присмотреться', low: 'В норме' };

  var state = { people: [], tasks: [], settings: { webhook: '', responsibleId: 1 }, offset: 0 };
  var ui = { tab: 'today', open: null, pulseFor: null, adding: false, dept: 'all', level: 'all', taskView: null };
  var memory = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function realToday() { return S.todayStr(new Date()); }
  function today() { return S.addDays(realToday(), state.offset); }
  function fmt(d) { var p = d.split('-'); return p[2] + '.' + p[1]; }
  function plural(n, a, b, c) { var m = n % 100, k = n % 10; if (m > 10 && m < 20) return c; if (k === 1) return a; if (k > 1 && k < 5) return b; return c; }

  /* ---------- хранилище ---------- */
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = memory; }
    if (raw) {
      try { var d = JSON.parse(raw); if (d && d.people) { state = Object.assign(state, d); return; } } catch (e) { /* пустое */ }
    }
    reset(false);
  }
  function save() {
    var raw = JSON.stringify(state);
    try { localStorage.setItem(KEY, raw); } catch (e) { memory = raw; }
  }
  function reset(doSave) {
    state = { people: Seed.build(realToday()), tasks: [], settings: state.settings || { webhook: '', responsibleId: 1 }, offset: 0 };
    if (doSave !== false) save();
  }

  function person(id) { return state.people.filter(function (p) { return p.id === id; })[0]; }
  function assessAll() {
    var t = today();
    return state.people.map(function (p) { return { p: p, a: S.assess(p, t) }; });
  }

  function toast(msg) {
    var el = $('toast'); el.textContent = msg; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3800);
  }

  /* ---------- шкала 90 дней ---------- */
  function trackHtml(p, a) {
    var t = today(), d = a.day, h = '<div class="track" aria-hidden="true"><div class="fill" style="width:' + Math.min(100, (d - 1) / 89 * 100) + '%"></div>';
    S.CHECKPOINTS.forEach(function (cp) {
      var left = (cp.day - 1) / 89 * 100, cls = '';
      if (p.checks && p.checks[cp.day]) cls = 'done';
      else if (cp.day + 2 <= d) cls = 'late';
      else if (cp.day <= d) cls = 'due';
      h += '<i class="' + cls + '" style="left:' + left + '%"></i><em style="left:' + left + '%">' + cp.day + '</em>';
    });
    return h + '<span class="now" style="left:' + Math.min(100, (d - 1) / 89 * 100) + '%"></span></div>';
  }

  /* ---------- экраны ---------- */
  function renderTabs() {
    var open = state.tasks.filter(function (t) { return t.status !== 'closed'; }).length;
    var items = [['today', 'Сегодня'], ['all', 'Все новички'], ['tasks', 'Задачи в Битрикс24' + (open ? ' · ' + open : '')]];
    $('tabs').innerHTML = items.map(function (i) {
      return '<a href="#' + i[0] + '"' + (ui.tab === i[0] ? ' aria-current="page"' : '') + '>' + esc(i[1]) + '</a>';
    }).join('');
  }

  function renderToday() {
    var all = assessAll().filter(function (x) { return x.a.active; });
    var by = { high: [], mid: [], low: [] };
    all.forEach(function (x) { by[x.a.level].push(x); });
    Object.keys(by).forEach(function (k) { by[k].sort(function (x, y) { return y.a.score - x.a.score || x.a.day - y.a.day; }); });

    var h = '<div class="tiles">' +
      tile('all', all.length, 'в первых 90 днях') +
      tile('high', by.high.length, LEVEL_NAME.high.toLowerCase(), 'high') +
      tile('mid', by.mid.length, LEVEL_NAME.mid.toLowerCase(), 'mid') +
      tile('low', by.low.length, 'в норме', 'low') + '</div>' +
      '<p class="hint">Риск считается по понятным правилам: низкий пульс-опрос, нет наставника, пропущенные встречи, отсутствия. Причины видны в каждой строке.</p>';

    ['high', 'mid'].forEach(function (lv) {
      if (ui.level !== 'all' && ui.level !== lv) return;
      if (!by[lv].length) return;
      h += '<section class="group"><h2><span class="dot ' + lv + '"></span>' + LEVEL_NAME[lv] + ' · ' + by[lv].length + '</h2>' +
        by[lv].map(rowHtml).join('') + '</section>';
    });
    if (!by.high.length && !by.mid.length) h += '<div class="empty">Сегодня никого не нужно догонять.</div>';
    if (ui.level === 'all' || ui.level === 'low') {
      h += '<details class="fold"' + (ui.level === 'low' ? ' open' : '') + '><summary>В норме · ' + by.low.length + '</summary>' +
        by.low.map(function (x) {
          return '<div class="compact"><div><b>' + esc(x.p.name) + '</b> <small>' + esc(x.p.dept) + ', день ' + x.a.day + '</small></div>' +
            '<span class="score low">' + x.a.score + '</span><button class="btn small" data-act="open" data-id="' + x.p.id + '">Открыть</button></div>';
        }).join('') + '</details>';
    }
    return h;
  }
  function tile(key, n, label, cls) {
    return '<button class="tile ' + (cls || '') + '" data-act="level" data-v="' + key + '" aria-pressed="' + (ui.level === key) + '"><b class="num">' + n + '</b><span>' + esc(label) + '</span></button>';
  }

  function rowHtml(x) {
    var p = x.p, a = x.a, top = a.reasons.slice().sort(function (m, n) { return n.points - m.points; })[0];
    var has = hasOpenTask(p.id, a.action.code);
    return '<article class="row">' +
      '<div class="who"><b>' + esc(p.name) + '</b><small>' + esc(p.dept) + ' · ' + esc(p.role) + ' · день ' + a.day + ' из 90</small>' + trackHtml(p, a) + '</div>' +
      '<div class="why"><span class="act">' + esc(a.action.title) + '</span><span class="reason">' + esc(top ? top.text : 'Плановая встреча') + '</span></div>' +
      '<div class="go"><span class="score ' + a.level + '" title="Риск ухода, 0–100">' + a.score + '</span>' +
      '<button class="btn small" data-act="open" data-id="' + p.id + '">Карточка</button>' +
      (has ? '<span class="pill wait">задача создана</span>' : '<button class="btn small primary" data-act="task" data-id="' + p.id + '">Задача в Б24</button>') +
      '</div></article>';
  }

  function renderAll() {
    var rows = assessAll().sort(function (x, y) { return y.a.score - x.a.score; })
      .filter(function (x) { return ui.dept === 'all' || x.p.dept === ui.dept; });
    var h = '<div class="filters"><label>Подразделение <select id="deptSel">' +
      ['all'].concat(DEPTS).map(function (d) { return '<option value="' + esc(d) + '"' + (ui.dept === d ? ' selected' : '') + '>' + (d === 'all' ? 'Все' : esc(d)) + '</option>'; }).join('') +
      '</select></label><span class="hint">Показано: ' + rows.length + '</span></div>' +
      '<div class="scroll"><table class="t"><thead><tr><th>Сотрудник</th><th>Отдел</th><th>День</th><th>Наставник</th><th>Пульс</th><th>Риск</th><th></th></tr></thead><tbody>' +
      rows.map(function (x) {
        var p = x.p, pl = (p.pulses || []).slice(-1)[0];
        return '<tr><td><b>' + esc(p.name) + '</b><br><small>' + esc(p.role) + '</small></td><td>' + esc(p.dept) + '</td><td class="num">' + (x.a.active ? x.a.day : '90+') + '</td>' +
          '<td>' + (p.mentor ? esc(p.mentor) : '<span class="pill late">нет</span>') + '</td>' +
          '<td class="num">' + (pl ? S.avg(pl.answers).toFixed(1) : '—') + '</td>' +
          '<td>' + (x.a.active ? '<span class="score ' + x.a.level + '">' + x.a.score + '</span>' : '<span class="pill wait">завершил</span>') + '</td>' +
          '<td><button class="btn small" data-act="open" data-id="' + p.id + '">Открыть</button></td></tr>';
      }).join('') + '</tbody></table></div>';
    return h;
  }

  function renderTasks() {
    var h = '<section class="group"><h2>Подключение к Битрикс24</h2><div class="box">' +
      '<label class="f">Адрес входящего вебхука (https://портал.bitrix24.by/rest/ID/КЛЮЧ/)<input type="text" id="hook" value="' + esc(state.settings.webhook) + '" placeholder="https://example.bitrix24.by/rest/1/xxxxxxxx/"></label>' +
      '<label class="f">ID ответственного по умолчанию<input type="number" id="resp" min="1" value="' + esc(state.settings.responsibleId) + '"></label>' +
      '<button class="btn small" data-act="savehook">Сохранить</button>' +
      '<p class="hint">Если адрес указан, задача уходит запросом tasks.task.add. Если пусто или браузер не пускает запрос, задача остаётся в журнале, а JSON можно скопировать и отправить вручную.</p></div></section>';
    h += '<section class="group"><h2>Журнал задач · ' + state.tasks.length + '</h2>';
    if (!state.tasks.length) h += '<div class="empty">Пока ничего нет. Создайте задачу из строки на экране «Сегодня».</div>';
    state.tasks.slice().reverse().forEach(function (t) {
      var st = { draft: ['wait', 'черновик, не отправлена'], sent: ['done', 'отправлена в Битрикс24'], error: ['late', 'ошибка отправки'], closed: ['done', 'закрыта'] }[t.status];
      h += '<div class="task"><header><div><b>' + esc(t.title) + '</b><br><small>срок ' + esc(t.deadline.slice(0, 10)) + ' · создана ' + fmt(t.created) + '</small></div>' +
        '<span class="pill ' + st[0] + '">' + st[1] + '</span></header>' +
        '<p style="margin:8px 0 0;white-space:pre-line;font-size:14px">' + esc(t.payload.params.fields.DESCRIPTION) + '</p>' +
        '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn small" data-act="json" data-id="' + t.id + '">' + (ui.taskView === t.id ? 'Скрыть JSON' : 'Показать JSON') + '</button>' +
        '<button class="btn small" data-act="copy" data-id="' + t.id + '">Скопировать JSON</button>' +
        (t.status === 'draft' || t.status === 'error' ? '<button class="btn small primary" data-act="send" data-id="' + t.id + '">Отправить в Битрикс24</button>' : '') +
        (t.status !== 'closed' ? '<button class="btn small" data-act="closetask" data-id="' + t.id + '">Закрыть</button>' : '') + '</div>' +
        (ui.taskView === t.id ? '<pre class="json">' + esc(JSON.stringify(t.payload, null, 2)) + '</pre>' : '') + '</div>';
    });
    return h + '</section>';
  }

  function render() {
    var t = today();
    var act = assessAll().filter(function (x) { return x.a.active; });
    $('sub').textContent = 'Сегодня ' + fmt(t) + (state.offset ? ' (демо: сдвиг +' + state.offset + ')' : '') + ' · на адаптации ' + act.length + ' ' + plural(act.length, 'человек', 'человека', 'человек');
    renderTabs();
    $('view').innerHTML = ui.tab === 'all' ? renderAll() : ui.tab === 'tasks' ? renderTasks() : renderToday();
    renderLayer();
  }

  /* ---------- карточка, опрос, добавление ---------- */
  function renderLayer() {
    var h = '';
    if (ui.open && person(ui.open)) h = cardHtml(person(ui.open));
    else if (ui.pulseFor && person(ui.pulseFor)) h = pulseHtml(person(ui.pulseFor));
    else if (ui.adding) h = addHtml();
    $('layer').innerHTML = h;
  }

  function cardHtml(p) {
    var a = S.assess(p, today()), t = today();
    var has = hasOpenTask(p.id, a.action.code);
    var h = '<div class="overlay" data-act="bg"><div class="sheet" role="dialog" aria-label="Карточка новичка">' +
      '<button class="btn small close" data-act="x">Закрыть</button>' +
      '<h2>' + esc(p.name) + '</h2><p class="meta">' + esc(p.dept) + ', ' + esc(p.role) + ' · руководитель ' + esc(p.manager) + ' · вышел ' + fmt(p.start) + ', день ' + a.day + '</p>' +
      '<div class="box"><b>Риск ' + a.score + ' из 100 · ' + (a.level === 'done' ? 'период завершён' : LEVEL_NAME[a.level].toLowerCase()) + '</b>' +
      (a.reasons.length ? '<ul>' + a.reasons.map(function (r) { return '<li>' + esc(r.text) + ' <small>(+' + r.points + ')</small></li>'; }).join('') + '</ul>' : '<p style="margin:6px 0 0">Тревожных сигналов нет.</p>') + '</div>' +
      '<h3>Что сделать</h3><div class="box"><b>' + esc(a.action.title) + '</b><p style="margin:4px 0 10px">' + esc(a.action.text) + '</p>' +
      (a.action.code === 'none' ? '' : has ? '<span class="pill wait">задача уже создана</span>' : '<button class="btn primary small" data-act="task" data-id="' + p.id + '">Создать задачу в Битрикс24</button>') + '</div>' +
      '<h3>Наставник</h3><select id="mentorSel" data-id="' + p.id + '"><option value="">Не назначен</option>' +
      (MENTORS[p.dept] || []).map(function (m) { return '<option' + (p.mentor === m ? ' selected' : '') + '>' + esc(m) + '</option>'; }).join('') + '</select>' +
      '<h3>План адаптации</h3>';
    S.CHECKPOINTS.forEach(function (cp) {
      var done = p.checks && p.checks[cp.day], cls, label;
      if (done) { cls = 'done'; label = 'проведена ' + fmt(done); }
      else if (cp.day + 2 <= a.day) { cls = 'late'; label = 'пропущена'; }
      else if (cp.day <= a.day) { cls = 'due'; label = 'сегодня-завтра'; }
      else { cls = 'wait'; label = 'через ' + (cp.day - a.day) + ' ' + plural(cp.day - a.day, 'день', 'дня', 'дней'); }
      h += '<div class="cp"><span class="d">День ' + cp.day + '</span><div>' + esc(cp.title) + '<small>' + esc(S.OWNERS[cp.owner]) + '</small></div>' +
        (done ? '<span class="pill done">' + label + '</span>' : cp.day <= a.day ?
          '<span><span class="pill ' + cls + '">' + label + '</span> <button class="btn small" data-act="check" data-id="' + p.id + '" data-day="' + cp.day + '">Отметить</button></span>' :
          '<span class="pill wait">' + label + '</span>') + '</div>';
    });
    h += '<h3>Пульс-опросы</h3>';
    var pls = (p.pulses || []).slice().reverse();
    h += pls.length ? pls.map(function (x) { return '<div class="cp" style="grid-template-columns:auto 1fr auto"><span class="d">' + fmt(x.date) + '</span><div>' + x.answers.join(' · ') + (x.comment ? '<small>' + esc(x.comment) + '</small>' : '') + '</div><span class="pill ' + (S.avg(x.answers) <= 2.5 ? 'late' : S.avg(x.answers) <= 3.5 ? 'due' : 'done') + '">' + S.avg(x.answers).toFixed(1) + '</span></div>'; }).join('') : '<p class="hint">Опросов ещё нет.</p>';
    h += '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn small" data-act="pulse" data-id="' + p.id + '">Открыть опрос глазами новичка</button>' +
      '<button class="btn small" data-act="absent" data-id="' + p.id + '">Записать отсутствие сегодня</button></div>' +
      ((p.absences || []).length ? '<p class="hint">Отсутствия и опоздания: ' + p.absences.slice().sort().map(fmt).join(', ') + '</p>' : '') +
      '</div></div>';
    return h;
  }

  function pulseHtml(p) {
    var ans = ui.answers || [0, 0, 0];
    var h = '<div class="overlay"><div class="sheet" role="dialog" aria-label="Пульс-опрос">' +
      '<button class="btn small close" data-act="x">Закрыть</button><h2>Как проходит ваша адаптация?</h2>' +
      '<p class="meta">Три вопроса, одна минута. Ответы увидят только HR и ваш руководитель.</p>';
    S.PULSE_QUESTIONS.forEach(function (q, i) {
      h += '<div class="q">' + (i + 1) + '. ' + esc(q) + '</div><div class="scale">' +
        [1, 2, 3, 4, 5].map(function (n) { return '<button data-act="ans" data-q="' + i + '" data-n="' + n + '" aria-pressed="' + (ans[i] === n) + '">' + n + '</button>'; }).join('') +
        '</div><div class="ends" style="margin-top:-10px;margin-bottom:12px"><span>совсем нет</span><span>полностью да</span></div>';
    });
    h += '<label class="f">Что хотите добавить? (по желанию)<textarea id="pc" placeholder="Например: не хватает обучения по кассе"></textarea></label>' +
      '<button class="btn primary" data-act="sendpulse" data-id="' + p.id + '"' + (ans.every(Boolean) ? '' : ' disabled') + '>Отправить</button></div></div>';
    return h;
  }

  function addHtml() {
    return '<div class="overlay"><div class="sheet" role="dialog" aria-label="Новый сотрудник"><button class="btn small close" data-act="x">Закрыть</button>' +
      '<h2>Новый сотрудник</h2><p class="meta">В рабочей версии эти данные приходят из задачи приёма в Битрикс24. Здесь их вносят вручную.</p>' +
      '<form id="addForm"><label class="f">Имя и фамилия<input type="text" id="an" required></label>' +
      '<label class="f">Подразделение<select id="ad">' + DEPTS.map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f">Должность<input type="text" id="ar" required></label>' +
      '<label class="f">Руководитель<input type="text" id="am" required></label>' +
      '<label class="f">Дата выхода<input type="date" id="as" value="' + today() + '" required></label>' +
      '<button class="btn primary" type="submit">Добавить</button> <span id="aerr" class="hint"></span></form></div></div>';
  }

  /* ---------- задачи ---------- */
  function hasOpenTask(pid, code) {
    return state.tasks.some(function (t) { return t.personId === pid && t.code === code && t.status !== 'closed'; });
  }
  function createTask(pid) {
    var p = person(pid), a = S.assess(p, today());
    if (a.action.code === 'none') { toast('Для этого человека задача не нужна.'); return; }
    if (hasOpenTask(pid, a.action.code)) { toast('Открытая задача уже есть.'); return; }
    var payload = S.buildBitrixTask(p, a, { today: today(), responsibleId: Number(state.settings.responsibleId) || 1 });
    var task = { id: 't' + Date.now() + Math.floor(Math.random() * 1000), personId: pid, code: a.action.code, level: a.level, title: payload.params.fields.TITLE, deadline: payload.params.fields.DEADLINE, created: today(), status: 'draft', payload: payload };
    state.tasks.push(task); save();
    if (state.settings.webhook) { send(task.id); } else { toast('Задача создана в журнале. Вебхук не указан, в Битрикс24 она не отправлена.'); render(); }
  }
  function send(tid) {
    var t = state.tasks.filter(function (x) { return x.id === tid; })[0];
    if (!t) return;
    var url = state.settings.webhook;
    if (!url) { toast('Укажите адрес вебхука на вкладке «Задачи в Битрикс24».'); return; }
    var ep = url.replace(/\/?$/, '/') + t.payload.method + '.json';
    fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(t.payload.params) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.result) { t.status = 'sent'; toast('Задача отправлена в Битрикс24.'); } else { t.status = 'error'; toast('Битрикс24 вернул ошибку: ' + ((j && (j.error_description || j.error)) || 'без текста')); }
        save(); render();
      })
      .catch(function () { t.status = 'error'; save(); toast('Запрос не прошёл: браузер или сеть не пускают. JSON можно скопировать.'); render(); });
  }

  /* ---------- события ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    if (act === 'bg') { if (e.target !== el) return; ui.open = null; ui.pulseFor = null; ui.adding = false; return render(); }
    if (act === 'x') { ui.open = null; ui.pulseFor = null; ui.adding = false; ui.answers = null; return render(); }
    if (act === 'add') { ui.adding = true; return render(); }
    if (act === 'open') { ui.open = id; return render(); }
    if (act === 'level') { var v = el.getAttribute('data-v'); ui.level = ui.level === v ? 'all' : v; return render(); }
    if (act === 'task') { createTask(id); return render(); }
    if (act === 'check') {
      var p = person(id); p.checks = p.checks || {}; p.checks[el.getAttribute('data-day')] = today(); save(); toast('Встреча отмечена.'); return render();
    }
    if (act === 'absent') { var q = person(id); q.absences = q.absences || []; if (q.absences.indexOf(today()) < 0) q.absences.push(today()); save(); return render(); }
    if (act === 'pulse') { ui.pulseFor = id; ui.open = null; ui.answers = [0, 0, 0]; return render(); }
    if (act === 'ans') { ui.answers[Number(el.getAttribute('data-q'))] = Number(el.getAttribute('data-n')); var c = $('pc'); var keep = c ? c.value : ''; render(); if ($('pc')) $('pc').value = keep; return; }
    if (act === 'sendpulse') {
      var pp = person(id), com = $('pc').value.trim();
      pp.pulses = pp.pulses || []; pp.pulses.push({ date: today(), answers: ui.answers.slice(), comment: com });
      ui.pulseFor = null; ui.open = id; ui.answers = null; save(); toast('Спасибо, ответ записан.'); return render();
    }
    if (act === 'savehook') { state.settings.webhook = $('hook').value.trim(); state.settings.responsibleId = Number($('resp').value) || 1; save(); return toast('Настройки сохранены.'); }
    if (act === 'json') { ui.taskView = ui.taskView === id ? null : id; return render(); }
    if (act === 'copy') {
      var t = state.tasks.filter(function (x) { return x.id === id; })[0], txt = JSON.stringify(t.payload, null, 2);
      var ok = function () { toast('JSON скопирован.'); };
      var no = function () { ui.taskView = id; render(); toast('Не удалось скопировать автоматически. JSON открыт, выделите его вручную.'); };
      try { navigator.clipboard.writeText(txt).then(ok, no); } catch (err) { no(); }
      return;
    }
    if (act === 'send') return send(id);
    if (act === 'closetask') { state.tasks.filter(function (x) { return x.id === id; })[0].status = 'closed'; save(); return render(); }
    if (act === 'day') { state.offset += 1; save(); toast('Показан следующий день: пропущенные встречи и риски пересчитаны.'); return render(); }
    if (act === 'reset') { reset(); ui.open = null; ui.pulseFor = null; ui.level = 'all'; toast('Демо-данные восстановлены.'); return render(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'deptSel') { ui.dept = e.target.value; render(); }
    if (e.target.id === 'mentorSel') { person(e.target.getAttribute('data-id')).mentor = e.target.value || null; save(); render(); }
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'addForm') return;
    e.preventDefault();
    var start = $('as').value, diff = S.parseDay(today()) - S.parseDay(start);
    if (diff < -14 || diff > 100) { $('aerr').textContent = 'Дата выхода должна быть не раньше 100 дней назад и не позже чем через 2 недели.'; return; }
    state.people.push({ id: 'n' + Date.now(), name: $('an').value.trim(), dept: $('ad').value, role: $('ar').value.trim(), manager: $('am').value.trim(), start: start, mentor: null, checks: {}, pulses: [], absences: [] });
    ui.adding = false; save(); toast('Сотрудник добавлен. Наставника назначьте в карточке.'); render();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && (ui.open || ui.pulseFor || ui.adding)) { ui.open = null; ui.pulseFor = null; ui.adding = false; render(); }
  });
  function route() {
    var h = (location.hash || '').replace('#', '');
    ui.tab = ['today', 'all', 'tasks'].indexOf(h) >= 0 ? h : 'today';
    render();
  }
  window.addEventListener('hashchange', route);

  load();
  route();
})();
