const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/scoring.js');

const TODAY = '2026-11-11';
const mk = (daysAgo, extra) => Object.assign({
  id: 'x', name: 'Тест Т.', dept: 'Склад', role: 'Комплектовщик',
  start: S.addDays(TODAY, -daysAgo), mentor: 'Наставник Н.', checks: {}, pulses: [], absences: [],
}, extra || {});

test('номер дня: в день выхода = 1', () => {
  assert.equal(S.dayNo(mk(0), TODAY), 1);
  assert.equal(S.dayNo(mk(29), TODAY), 30);
});

test('новичок в первый день без нарушений: риск 0', () => {
  const a = S.assess(mk(0), TODAY);
  assert.equal(a.score, 0);
  assert.equal(a.level, 'low');
});

test('низкий пульс даёт высокий риск и действие «поговорить»', () => {
  const p = mk(13, {
    checks: { 1: 'd', 3: 'd', 7: 'd' },
    pulses: [{ date: S.addDays(TODAY, -3), answers: [2, 2, 1] }],
  });
  const a = S.assess(p, TODAY);
  assert.ok(a.score >= 50, 'score ' + a.score);
  assert.equal(a.level, 'high');
  assert.equal(a.action.code, 'talk');
});

test('нет наставника с 3-го дня: +15', () => {
  const p = mk(5, { mentor: null, checks: { 1: 'd', 3: 'd' } });
  const a = S.assess(p, TODAY);
  assert.ok(a.reasons.some(r => r.key === 'no_mentor'));
  assert.equal(a.action.code, 'mentor');
  assert.equal(S.assess(mk(1, { mentor: null }), TODAY).reasons.some(r => r.key === 'no_mentor'), false);
});

test('пропущенные встречи считаются после льготных 2 дней, максимум 30 баллов', () => {
  const day7 = mk(6); // день 7, точки 1 и 3 не отмечены
  const a7 = S.assess(day7, TODAY);
  assert.deepEqual(a7.overdue.map(c => c.day), [1, 3]);
  const day40 = mk(39); // ничего не отмечено, пульсов нет
  const a40 = S.assess(day40, TODAY);
  assert.equal(a40.reasons.find(r => r.key === 'overdue').points, 30);
});

test('точка в пределах льготного срока ещё не просрочена', () => {
  const p = mk(2, { checks: { 1: 'd' } }); // день 3, точка дня 3 только наступила
  assert.equal(S.assess(p, TODAY).overdue.length, 0);
  assert.equal(S.assess(p, TODAY).due.length, 1);
});

test('падение оценки на 1 и больше добавляет 10', () => {
  const p = mk(20, {
    checks: { 1: 'd', 3: 'd', 7: 'd', 14: 'd' },
    pulses: [
      { date: S.addDays(TODAY, -13), answers: [5, 4, 5] },
      { date: S.addDays(TODAY, -6), answers: [3, 3, 3] },
    ],
  });
  const a = S.assess(p, TODAY);
  assert.ok(a.reasons.some(r => r.key === 'pulse_drop'));
});

test('два отсутствия за 14 дней: +15', () => {
  const p = mk(10, { checks: { 1: 'd', 3: 'd', 7: 'd' }, pulses: [{ date: S.addDays(TODAY, -3), answers: [4, 4, 4] }],
    absences: [S.addDays(TODAY, -2), S.addDays(TODAY, -5)] });
  assert.ok(S.assess(p, TODAY).reasons.some(r => r.key === 'absences'));
  const old = Object.assign({}, p, { absences: [S.addDays(TODAY, -20), S.addDays(TODAY, -25)] });
  assert.equal(S.assess(old, TODAY).reasons.some(r => r.key === 'absences'), false);
});

test('после 90-го дня человек не в активной выборке', () => {
  const a = S.assess(mk(120), TODAY);
  assert.equal(a.active, false);
  assert.equal(a.level, 'done');
});

test('оценка ограничена 100', () => {
  const p = mk(50, { mentor: null, absences: [S.addDays(TODAY, -1), S.addDays(TODAY, -2)],
    pulses: [{ date: S.addDays(TODAY, -3), answers: [1, 1, 1] }] });
  assert.ok(S.assess(p, TODAY).score <= 100);
});

test('задача для Битрикс24: метод, срок и текст', () => {
  const p = mk(13, { checks: { 1: 'd', 3: 'd', 7: 'd' }, pulses: [{ date: S.addDays(TODAY, -3), answers: [2, 2, 1] }] });
  const a = S.assess(p, TODAY);
  const t = S.buildBitrixTask(p, a, { today: TODAY, responsibleId: 42 });
  assert.equal(t.method, 'tasks.task.add');
  assert.equal(t.params.fields.RESPONSIBLE_ID, 42);
  assert.equal(t.params.fields.DEADLINE, '2026-11-12T18:00:00+03:00'); // высокий риск: завтра
  assert.match(t.params.fields.TITLE, /Тест Т\./);
  assert.match(t.params.fields.DESCRIPTION, /Пульс-опрос/);
});

test('на практике не падает на пустых полях', () => {
  const a = S.assess({ id: 'a', name: 'А', dept: 'Офис', role: 'Р', start: TODAY }, TODAY);
  assert.equal(a.level, 'low');
});
