/* Демо-данные: вымышленные сотрудники, похожие на структуру компании. Реальных людей нет.
   Даты считаются от сегодняшнего дня, чтобы демо всегда выглядело живым. Генератор детерминирован. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./scoring.js'));
  else root.Seed = factory(root.Scoring);
})(typeof self !== 'undefined' ? self : this, function (S) {
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const MANAGERS = {
    'Склад': ['Сергей Мартынов', 'Ирина Бондарь'],
    'Магазин': ['Елена Козловская', 'Артём Новик'],
    'Отдел продаж': ['Павел Рубан'],
    'Офис': ['Марина Лис'],
  };
  const MENTORS = {
    'Склад': ['Виктор Л.', 'Олег С.', 'Дмитрий Ш.'],
    'Магазин': ['Анна К.', 'Татьяна В.', 'Максим Г.'],
    'Отдел продаж': ['Кирилл Д.', 'Наталья Р.'],
    'Офис': ['Алла П.'],
  };
  const ROLES = {
    'Склад': ['Комплектовщик', 'Кладовщик', 'Грузчик-упаковщик', 'Водитель погрузчика'],
    'Магазин': ['Продавец-консультант', 'Кассир', 'Продавец-консультант'],
    'Отдел продаж': ['Менеджер по продажам', 'Менеджер по работе с маркетплейсами'],
    'Офис': ['Бухгалтер', 'Специалист по закупкам', 'Контент-менеджер'],
  };
  // [имя, отдел, день работы сегодня, профиль]  profile: ok | shaky | bad | silent | nomentor | late
  const PEOPLE = [
    ['Дмитрий Ковалёв', 'Склад', 2, 'ok'],
    ['Алина Шевчук', 'Магазин', 1, 'ok'],
    ['Никита Гринюк', 'Склад', 4, 'nomentor'],
    ['Ольга Тимошенко', 'Магазин', 6, 'ok'],
    ['Егор Лукашевич', 'Склад', 9, 'shaky'],
    ['Вероника Мельник', 'Отдел продаж', 10, 'ok'],
    ['Андрей Пашкевич', 'Склад', 12, 'bad'],
    ['Яна Касперович', 'Магазин', 15, 'shaky'],
    ['Роман Захаренко', 'Склад', 17, 'late'],
    ['Светлана Прокопович', 'Магазин', 19, 'ok'],
    ['Игорь Денисенко', 'Склад', 22, 'bad'],
    ['Полина Жук', 'Отдел продаж', 26, 'shaky'],
    ['Максим Борисенко', 'Склад', 29, 'silent'],
    ['Диана Романович', 'Магазин', 31, 'ok'],
    ['Артур Кравченко', 'Склад', 34, 'bad'],
    ['Кристина Бугаева', 'Офис', 38, 'ok'],
    ['Влад Сидорчук', 'Магазин', 42, 'late'],
    ['Евгения Савицкая', 'Магазин', 47, 'shaky'],
    ['Тимофей Курьянович', 'Склад', 53, 'ok'],
    ['Марта Леонович', 'Отдел продаж', 58, 'silent'],
    ['Глеб Станкевич', 'Склад', 63, 'bad'],
    ['Инна Дроздова', 'Магазин', 71, 'ok'],
    ['Константин Рудько', 'Склад', 78, 'shaky'],
    ['Лилия Адамович', 'Офис', 86, 'ok'],
  ];

  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

  function build(today) {
    const r = rng(20260101);
    return PEOPLE.map(([name, dept, day, profile], i) => {
      const start = S.addDays(today, -(day - 1));
      const p = {
        id: 'n' + (i + 1), name, dept,
        role: pick(r, ROLES[dept]),
        start,
        manager: pick(r, MANAGERS[dept]),
        mentor: profile === 'nomentor' ? null : pick(r, MENTORS[dept]),
        checks: {}, pulses: [], absences: [], notes: [],
      };
      const base = { ok: 4.4, shaky: 3.2, bad: 2.0, silent: 4.0, nomentor: 4.2, late: 4.0 }[profile];
      S.CHECKPOINTS.forEach(cp => {
        if (cp.day > day) return;
        const passed = cp.day + 2 <= day;
        const doneChance = profile === 'silent' ? 0.35 : profile === 'bad' ? 0.55 : 0.93;
        if (r() < doneChance || !passed) {
          if (passed || cp.day === day || cp.day + 1 === day) { if (r() < (passed ? 1 : 0.3)) p.checks[cp.day] = S.addDays(start, cp.day - 1); }
        }
        if (cp.pulse && passed) {
          const skip = profile === 'silent' ? r() < 0.8 : r() < 0.05;
          if (!skip) {
            const drift = profile === 'bad' || profile === 'shaky' ? -0.35 * (S.CHECKPOINTS.filter(c => c.pulse && c.day <= cp.day).length - 1) : 0;
            const a = [0, 1, 2].map(() => Math.max(1, Math.min(5, Math.round(base + drift + (r() - 0.5) * 1.4))));
            if (profile === 'bad') a[2] = Math.min(a[2], 2);
            p.pulses.push({ date: S.addDays(start, cp.day), answers: a, comment: '' });
          }
        }
      });
      if (profile === 'late') p.absences = [S.addDays(today, -1), S.addDays(today, -4), S.addDays(today, -9)].filter(d => d >= start);
      if (profile === 'bad' && day > 8) p.absences = [S.addDays(today, -3)].filter(d => d >= start);
      if (profile === 'bad' && day > 8) p.pulses.forEach(x => { x.comment = ''; });
      return p;
    });
  }

  return { build };
});
