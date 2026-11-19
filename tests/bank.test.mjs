// «Банк»: разбор выписки MBANK (строки как их отдаёт pdfLines), свои счета, отметки, периоды, советы.
// Данные вымышленные, формат — как в настоящей выписке.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  advice,
  catOf,
  checkTotals,
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
  const glovo = st.ops.find((o) => o.amount === -803.5);
  assert.equal(glovo.cat, 'delivery');
  assert.equal(glovo.label, 'Glovo');
  assert.equal(st.ops.find((o) => o.amount === -698.25).cat, 'subs');
  assert.equal(st.ops.find((o) => o.amount === -2500).cat, 'loan');
  // две одинаковые поездки в одну минуту — две разные операции
  const bus = st.ops.filter((o) => o.cat === 'bus');
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

test('свои счета не считаются; перевод от себя («Петр И.») — свой номер', () => {
  const { bank } = mergeStatement(emptyBank(), parseStatement(ST('1030000000000111')));
  assert.deepEqual(bank.ownPhones, ['996507000001']);
  const s = summarize(bank, periodOf('2026-10-10', 'month'));
  assert.equal(s.income, 9500); // 1097 между своими и 2000 с своего номера не доход
  assert.equal(s.must, 2500);
  assert.equal(s.ask, 500);
  assert.equal(s.unmarked.length, 1);
});

test('ручная отметка меняет категорию только этого перевода', () => {
  const { bank } = mergeStatement(emptyBank(), parseStatement(ST('1030000000000111')));
  const tr = Object.values(bank.ops).find((o) => o.amount === -500);
  const own = Object.values(bank.ops).find((o) => o.amount === 2000);
  const b2 = { ...bank, tags: { [tr.id]: 'family', [own.id]: 'income' } };
  assert.equal(catOf(tr, b2), 'tFamily');
  assert.equal(catOf(own, b2), 'incomeTr');
  const s = summarize(b2, periodOf('2026-10-10', 'month'));
  assert.equal(s.unmarked.length, 0);
  assert.equal(s.income, 11500);
});

test('периоды: месяц и зарплатные 2 недели', () => {
  assert.equal(periodOf('2026-10-20', 'month').title, 'Октябрь 2026');
  const p = periodOf('2026-10-20', 'pay');
  assert.equal(p.start, '2026-10-16');
  assert.equal(p.end, '2026-10-29');
  const { bank } = mergeStatement(emptyBank(), parseStatement(ST('1030000000000111')));
  assert.equal(periodsOf(bank, 'month').length, 1);
  assert.ok(periodsOf(bank, 'pay').length >= 1);
});

test('советы: минус, доставка, подписки, неотмеченные переводы; кредиты не советуем урезать', () => {
  const extra = [
    '20.10.2026 22:00 Операции по карте: - 9 000,00',
    '57002022\\417\\Bishkek\\YANDEX EDA\\ 57002022\\',
  ];
  const lines = ST('1030000000000111', extra).map((l) =>
    l.startsWith('Всего списаний') ? 'Всего списаний 13 535,75 KGS' : l
  );
  const { bank } = mergeStatement(emptyBank(), parseStatement(lines));
  const s = summarize(bank, periodOf('2026-10-10', 'month'));
  const ks = advice(s, null).map((a) => a.k);
  assert.ok(ks.includes('minus'));
  assert.ok(ks.includes('delivery'));
  assert.ok(ks.includes('subs'));
  assert.ok(ks.includes('unmarked'));
  assert.ok(!ks.some((k) => k.includes('loan')));
});
