/* Логика «Радара новичков»: контрольные точки, скоринг риска, сборка задачи для Битрикс24.
   Без зависимостей. Работает и в браузере (window.Scoring), и в Node (require). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Scoring = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY = 86400000;
  const GRACE = 2; // сколько дней после срока точка ещё не считается пропущенной

  const OWNERS = { manager: 'Руководитель', mentor: 'Наставник', hr: 'HR' };

  const CHECKPOINTS = [
    { day: 1, title: 'Встреча, доступы, рабочее место', owner: 'manager' },
    { day: 3, title: 'Короткий разговор: как первые дни?', owner: 'mentor' },
    { day: 7, title: 'Пульс-опрос и беседа с руководителем', owner: 'manager', pulse: true },
    { day: 14, title: 'Пульс-опрос, разбор задач и нагрузки', owner: 'manager', pulse: true },
    { day: 30, title: 'Итоги месяца: ожидания и реальность', owner: 'hr', pulse: true },
    { day: 60, title: 'Пульс-опрос, план роста', owner: 'manager', pulse: true },
    { day: 90, title: 'Итоги испытательного срока', owner: 'hr' },
  ];

  const PULSE_QUESTIONS = [
    'Мне понятно, что от меня ждут и как оценят мою работу',
    'Мне есть к кому обратиться, и я получаю помощь',
    'Я вижу себя в компании через полгода',
  ];

  const LEVELS = { high: 50, mid: 25 };

  function parseDay(s) { return Math.floor(Date.parse(s + 'T00:00:00Z') / DAY); }
  function addDays(s, n) { return new Date((parseDay(s) + n) * DAY).toISOString().slice(0, 10); }
  function todayStr(d) { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }

  /** Номер дня работы: в день выхода = 1 */
  function dayNo(person, today) { return parseDay(today) - parseDay(person.start) + 1; }

  function avg(a) { return a.reduce((s, x) => s + x, 0) / a.length; }

  function overdueCheckpoints(p, today) {
    const d = dayNo(p, today);
    return CHECKPOINTS.filter(cp => cp.day + GRACE <= d && !(p.checks && p.checks[cp.day]));
  }
  function dueCheckpoints(p, today) {
    const d = dayNo(p, today);
    return CHECKPOINTS.filter(cp => cp.day <= d && d < cp.day + GRACE && !(p.checks && p.checks[cp.day]));
  }
  function nextCheckpoint(p, today) {
    const d = dayNo(p, today);
    return CHECKPOINTS.find(cp => cp.day > d) || null;
  }

  /** Оценка риска. Правила простые и видны в списке причин, чтобы HR мог с ними спорить. */
  function assess(p, today) {
    const d = dayNo(p, today);
    const reasons = [];
    const add = (points, text, key) => reasons.push({ points, text, key });

    const pulses = (p.pulses || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const last = pulses[pulses.length - 1];
    if (last) {
      const a = avg(last.answers);
      if (a <= 2.5) add(35, `Пульс-опрос ${last.date}: средняя оценка ${a.toFixed(1)} из 5`, 'pulse_low');
      else if (a <= 3.5) add(15, `Пульс-опрос ${last.date}: оценка ${a.toFixed(1)} из 5, ниже нормы`, 'pulse_mid');
      if (last.answers[2] <= 2) add(15, 'Не видит себя в компании (вопрос 3 ≤ 2)', 'stay_low');
      if (pulses.length >= 2) {
        const prev = avg(pulses[pulses.length - 2].answers);
        if (prev - a >= 1) add(10, `Оценка упала с ${prev.toFixed(1)} до ${a.toFixed(1)}`, 'pulse_drop');
      }
    }

    const expectedPulses = CHECKPOINTS.filter(cp => cp.pulse && cp.day + GRACE <= d).length;
    if (pulses.length < expectedPulses) add(15, 'Пульс-опрос не заполнен вовремя', 'pulse_missing');

    if (!p.mentor && d >= 3) add(15, 'Нет наставника', 'no_mentor');

    const overdue = overdueCheckpoints(p, today);
    if (overdue.length) {
      const pts = Math.min(30, overdue.length * 10);
      add(pts, 'Пропущены встречи: ' + overdue.map(c => 'день ' + c.day).join(', '), 'overdue');
    }

    const recent = (p.absences || []).filter(a => { const k = parseDay(today) - parseDay(a); return k >= 0 && k < 14; });
    if (recent.length >= 2) add(15, `Прогулы или опоздания за 14 дней: ${recent.length}`, 'absences');

    const score = Math.min(100, reasons.reduce((s, r) => s + r.points, 0));
    const active = d >= 1 && d <= 90;
    const level = !active ? 'done' : score >= LEVELS.high ? 'high' : score >= LEVELS.mid ? 'mid' : 'low';

    return {
      day: d, active, score, level, reasons,
      overdue, due: dueCheckpoints(p, today), next: nextCheckpoint(p, today),
      action: suggestAction(p, reasons, overdue),
    };
  }

  /** Одно главное действие: то, что HR или руководитель делает сегодня. */
  function suggestAction(p, reasons, overdue) {
    const has = k => reasons.some(r => r.key === k);
    if (has('pulse_low') || has('stay_low') || has('pulse_drop'))
      return { code: 'talk', title: 'Поговорить сегодня', text: 'Личный разговор 15 минут, не по чату. Спросить, что мешает, что непонятно, что не так с графиком или задачами. Записать ответ и договориться об одном конкретном изменении.' };
    if (has('no_mentor'))
      return { code: 'mentor', title: 'Назначить наставника', text: 'Выбрать опытного коллега из того же подразделения, передать ему чек-лист первых недель и договориться о встрече в первые два дня.' };
    if (has('overdue'))
      return { code: 'meeting', title: 'Провести пропущенную встречу', text: 'Провести встречу на этой неделе: ' + overdue.map(c => c.title.toLowerCase()).join('; ') + '.' };
    if (has('pulse_missing'))
      return { code: 'pulse', title: 'Получить пульс-опрос', text: 'Отправить ссылку на опрос и попросить заполнить в рабочее время. Три вопроса, одна минута.' };
    if (has('absences'))
      return { code: 'absence', title: 'Выяснить причину отсутствий', text: 'Спокойно спросить, что происходит с графиком: дорога, смена, семья, условия. Начать с вопроса, а не с замечания.' };
    if (has('pulse_mid'))
      return { code: 'check', title: 'Спросить, как дела', text: 'Короткий разговор на 5 минут в конце смены: что получается, что непонятно. Оценка в опросе ниже нормы, пока это сигнал, а не тревога.' };
    return { code: 'none', title: 'Всё идёт по плану', text: 'Следующая встреча по плану адаптации.' };
  }

  /** Тело запроса tasks.task.add для REST Битрикс24 (вебхук). */
  function buildBitrixTask(p, a, opts) {
    const o = opts || {};
    const deadline = (a.level === 'high' ? addDays(o.today, 1) : addDays(o.today, 3)) + 'T18:00:00+03:00';
    const reasons = a.reasons.map(r => '- ' + r.text).join('\n') || '- Плановая встреча';
    const lines = [
      `Новичок: ${p.name}, ${p.dept}, ${p.role}. День ${a.day} из 90, риск ${a.score}/100.`,
      '',
      'Почему задача:',
      reasons,
      '',
      'Что сделать: ' + a.action.text,
      '',
      'После встречи отметьте её в Радаре новичков и закройте задачу.',
    ];
    return {
      method: 'tasks.task.add',
      params: {
        fields: {
          TITLE: `Новичок ${p.name}: ${a.action.title.toLowerCase()}`,
          DESCRIPTION: lines.join('\n'),
          RESPONSIBLE_ID: o.responsibleId || 1,
          DEADLINE: deadline,
          PRIORITY: a.level === 'high' ? 2 : 1,
          TAGS: ['новичок', 'адаптация'],
        },
      },
    };
  }

  return { CHECKPOINTS, PULSE_QUESTIONS, OWNERS, assess, buildBitrixTask, dayNo, addDays, todayStr, parseDay, avg };
});
