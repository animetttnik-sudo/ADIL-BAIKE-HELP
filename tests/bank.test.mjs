// «Банк»: разбор выписки MBANK (строки как их отдаёт pdfLines), свои счета, отметки, периоды, советы.
// Данные вымышленные, формат — как в настоящей выписке.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chartOf,
  checkTotals,
  cutOf,
  explainOptions,
  normalizeBank,
  suggestionsOf,
  viewOp,
  emptyBank,
  mergeStatement,
  parseStatement,
  periodOf,
  periodsOf,
  removeAccount,
  summarize,
} from '../src/lib/bank.js';

const ST = (acc, extra = []) => [
  `Выписка по счету №${acc}`,
  'За период с  01.10.2026 по 31.10.2026',
  'Дата формирования выписки: 01.11.2026',
  'Клиент Баланс на начало периода Баланс на конец',
  'периода',
  'ИВАНОВ ПЕТР',
  'СЕРГЕЕВИЧ 0,00 KGS 10,00 KGS',
  'Дата операции Описание операции Сумма операции',
  '02.10.2026 09:37 Перевод между своими счетами: + 1 097,00',
  'Перевод между счетами',
  '02.10.2026 09:38 Операции по карте: - 698,25',
  '372\\ITUNES COM\\APPLE.COM/BILL\\ 311035101881\\',
  '03.10.2026 18:52 Оплата по QR Тулпар: - 17,00',
  'Оплата услуг. Получатель: Оплата по QR Тулпар.',
  '1121/1121/TULPAR/17.00 019eea3d/',
  '03.10.2026 18:52 Оплата по QR Тулпар: - 17,00',
  'Оплата услуг. Получатель: Оплата по QR Тулпар.',
  '1121/1121/TULPAR/17.00 019eea3d/',
  'Дата операции Описание операции Сумма операции',
  '04.10.2026 04:05 Операции по карте: - 803,50',
  '57002022\\417\\Bishkek\\GLOVO\\ 57002022\\',
  '05.10.2026 10:00 Cash-in: + 9 500,00',
  'CASH IN ГРИНТЕЛЕКОМ СЕРВИС. Номер транзакции: NURTERM_1.',
  '06.10.2026 11:00 Перевод по номеру телефона: + 2 000,00',
  'Перевод по номеру телефона. 996507000001/ Петр И./ / Сумма 2,000.00 KGS',
  '07.10.2026 12:00 Перевод по номеру телефона: - 500,00',
  'Перевод по номеру телефона. 996501000002/ Бактыгул М./ / Сумма 500.00',
  '08.10.2026 12:00 Потребительский онлайн (МБ): - 2 500,00',
  'Погашение по кредиту 019ff1a9',
  ...extra,
  'Всего списаний 4 535,75 KGS',
  'Всего пополнений 12 597,00 KGS',
  'Для проверки достоверности данной справки…',
];

test('разбор: счёт, период, владелец, операции, сверка с итогом банка', () => {
  const st = parseStatement(ST('1030120377800001'));
  assert.equal(st.account, '1030120377800001');
  assert.equal(st.from, '2026-10-01');
  assert.equal(st.to, '2026-10-31');
  assert.equal(st.client, 'ИВАНОВ ПЕТР');
  assert.equal(st.ops.length, 9);
  assert.ok(checkTotals(st).ok);
  const b = emptyBank();
  const v = (amt) => viewOp(st.ops.find((o) => o.amount === amt), b);
  assert.equal(v(-803.5).cat, 'delivery');
  assert.equal(v(-803.5).label, 'Glovo');
  assert.equal(v(-698.25).cat, 'subs');
  assert.equal(v(-2500).cat, 'loan');
  // две одинаковые поездки в одну минуту — две разные операции
  const bus = st.ops.filter((o) => viewOp(o, b).cat === 'bus');
  assert.equal(bus.length, 2);
  assert.notEqual(bus[0].id, bus[1].id);
});

test('сломанный формат ловится сверкой', () => {
  const lines = ST('1').filter((l) => !l.startsWith('04.10.2026'));
  assert.equal(checkTotals(parseStatement(lines)).ok, false);
});

test('повторная загрузка не задваивает, несколько счетов складываются', () => {
  const a = parseStatement(ST('1030000000000111'));
  const b = parseStatement(ST('1030000000000222'));
  let r = mergeStatement(emptyBank(), a);
  assert.equal(r.added, 9);
  r = mergeStatement(r.bank, a);
  assert.equal(r.added, 0);
  assert.equal(r.skipped, 9);
  r = mergeStatement(r.bank, b);
  assert.equal(r.added, 9);
  assert.equal(Object.keys(r.bank.accounts).length, 2);
  const left = removeAccount(r.bank, '1030000000000111');
  assert.equal(Object.keys(left.ops).length, 9);
});

test('свои счета Mbank не считаются; свой номер в другом банке — считается', () => {
  const { bank } = mergeStatement(emptyBank(), parseStatement(ST('1030000000000111')));
  assert.deepEqual(bank.ownPhones, ['996507000001']);
  const s = summarize(bank, periodOf('2026-10-10', 'month'));
  assert.equal(s.own.length, 1); // 1097 между своими — отдельно
  assert.equal(s.income, 11500); // 9500 наличными + 2000 с моего номера
  assert.equal(s.spent, 4535.75);
  assert.ok(s.incomes.some((c) => c.cat === 'myBanksIn'));
  assert.equal(s.unclear.length, 1); // перевод Бактыгул М.
});

test('объяснение убирает расход из непонятных и задаёт категорию', () => {
  const { bank } = mergeStatement(emptyBank(), parseStatement(ST('1030000000000111')));
  const tr = Object.values(bank.ops).find((o) => o.amount === -500);
  const b2 = { ...bank, notes: { [tr.id]: { k: 'service', text: 'стрижка' } } };
  const v = viewOp(tr, b2);
  assert.equal(v.cat, 'service');
  assert.equal(v.note, 'Услуга: стрижка');
  assert.equal(summarize(b2, periodOf('2026-10-10', 'month')).unclear.length, 0);
});

test('варианты объяснения: мелкий QR — туалет первым; прошлый выбор для того же человека — первым', () => {
  const extra = ['10.10.2026 10:00 Оплата по QR: - 15,00', 'Оплата услуг. Получатель: Оплата по QR. 1240040005807240/'];
  const lines = ST('1030000000000111', extra).map((l) =>
    l.startsWith('Всего списаний') ? 'Всего списаний 4 550,75 KGS' : l
  );
  const st = parseStatement(lines);
  assert.ok(checkTotals(st).ok);
  const { bank } = mergeStatement(emptyBank(), st);
  const qr = viewOp(Object.values(bank.ops).find((o) => o.amount === -15), bank);
  assert.equal(qr.cat, 'unknown');
  assert.equal(explainOptions(qr, bank)[0], 'toilet');
  const tr = Object.values(bank.ops).find((o) => o.amount === -500);
  const other = { ...tr, id: 'x', date: '2026-10-11' };
  const b2 = { ...bank, ops: { ...bank.ops, x: other }, notes: { [tr.id]: { k: 'family' } } };
  assert.equal(explainOptions(viewOp(other, b2), b2)[0], 'family');
});

test('возвраты за курс — приход', () => {
  const extra = ['09.10.2026 10:00 Операции по карте: + 3,00', 'Возврат после корректировки платежа'];
  const lines = ST('1030000000000111', extra).map((l) =>
    l.startsWith('Всего пополнений') ? 'Всего пополнений 12 600,00 KGS' : l
  );
  const { bank } = mergeStatement(emptyBank(), parseStatement(lines));
  const s = summarize(bank, periodOf('2026-10-10', 'month'));
  assert.equal(s.income, 11503);
});

test('цель и статус: режимы 10/20/30 и свой процент', () => {
  const { bank } = mergeStatement(emptyBank(), parseStatement(ST('1030000000000111')));
  // приход 11500, расход 4535.75 → сохранено ≈60.6%
  const p = periodOf('2026-10-10', 'month');
  assert.equal(summarize(bank, p).status, 'good');
  const turbo = normalizeBank({ ...bank, goal: { k: 'turbo', pct: 58 } });
  assert.equal(summarize(turbo, p).pct, 58);
  assert.equal(summarize(turbo, p).status, 'near');
  const t2 = normalizeBank({ ...bank, goal: { k: 'turbo', pct: 70 } });
  assert.equal(summarize(t2, p).status, 'bad');
  assert.equal(normalizeBank({ goal: { k: 'active' } }).goal.k, 'active');
  assert.equal(summarize(normalizeBank({ ...bank, goal: { k: 'active' } }), p).pct, 30);
});

test('график: столбик на каждую операцию, линия итога и цель', () => {
  const { bank } = mergeStatement(emptyBank(), parseStatement(ST('1030000000000111')));
  const s = summarize(bank, periodOf('2026-10-10', 'month'));
  const ch = chartOf(s);
  assert.equal(ch.bars.length, s.views.length);
  const last = ch.line[ch.line.length - 1];
  assert.equal(Math.round(last.v * 100) / 100, s.net);
  assert.equal(Math.round(last.g), Math.round(s.income * 0.2));
  assert.ok(ch.bars.every((b) => b.t >= 0 && b.t <= 1));
});

test('можно урезать и предложения', () => {
  const extra = [
    '20.10.2026 22:00 Операции по карте: - 9 000,00',
    '57002022\\417\\Bishkek\\YANDEX EDA\\ 57002022\\',
  ];
  const lines = ST('1030000000000111', extra).map((l) =>
    l.startsWith('Всего списаний') ? 'Всего списаний 13 535,75 KGS' : l
  );
  const { bank } = mergeStatement(emptyBank(), parseStatement(lines));
  const s = summarize(bank, periodOf('2026-10-10', 'month'));
  const cut = cutOf(s, bank);
  assert.ok(cut.list.some((c) => c.cat === 'delivery'));
  assert.ok(!cut.list.some((c) => c.cat === 'loan'));
  const ks = suggestionsOf(s, bank).map((x) => x.k);
  assert.ok(ks.includes('goal'));
  assert.ok(ks.includes('delivery'));
  assert.ok(ks.includes('subs'));
});

test('старые отметки v1 переносятся в объяснения', () => {
  const b = normalizeBank({ tags: { a: 'family', b: 'own', c: 'income' } });
  assert.deepEqual(b.notes, { a: { k: 'family' } });
});
