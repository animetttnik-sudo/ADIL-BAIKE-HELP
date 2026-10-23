// node --test — «Перенос данных»
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appKeys, fmtSummary, makeBackup, parseBackup, plural, restorePlan, summarize } from '../src/lib/backup.js';

const app = { settings: {}, custom: {}, removed: [], expenses: [{ id: 1 }, { id: 2 }, { id: 3 }], shifts: [{ id: 's' }] };
const calc = { v: 1, days: { '2026-10-01': { counts: { fri: [40] } }, '2026-10-02': { counts: { fri: [] } }, '2026-10-03': { counts: { bb: 2 } } } };
const entries = [
  ['zp_app_v1', JSON.stringify(app)],
  ['zp_calc_v1', JSON.stringify(calc)],
  ['EXPO_CONSTANTS_INSTALLATION_ID', 'x'],
  ['zp_empty', null],
];

test('makeBackup: маркер, версия, только ключи zp_*, сырые строки', () => {
  const s = makeBackup(entries, new Date('2026-10-23T10:00:00Z'));
  const o = JSON.parse(s);
  assert.equal(o.app, 'smeny-backup');
  assert.equal(o.v, 1);
  assert.equal(o.createdAt, '2026-10-23T10:00:00.000Z');
  assert.deepEqual(Object.keys(o.data).sort(), ['zp_app_v1', 'zp_calc_v1']);
  assert.equal(o.data.zp_app_v1, entries[0][1]);
});

test('roundtrip: parseBackup возвращает те же строки и сводку', () => {
  const r = parseBackup(makeBackup(entries));
  assert.equal(r.ok, true);
  assert.equal(r.data.zp_calc_v1, entries[1][1]);
  assert.deepEqual(r.summary, { expenses: 3, shifts: 1, calcs: 2, keys: 2 });
  assert.equal(fmtSummary(r.summary), '3 расхода · 1 смена · 2 расчёта');
});

test('лишний текст и пробелы вокруг JSON не мешают', () => {
  const r = parseBackup(`  вот копия:\n${makeBackup(entries)}\n `);
  assert.equal(r.ok, true);
});

test('плохой буфер → понятная ошибка', () => {
  for (const t of ['', '   ', null, 'привет', '{"a":1}', '{не json}', JSON.stringify({ app: 'other', v: 1, data: {} })]) {
    const r = parseBackup(t);
    assert.equal(r.ok, false, String(t));
    assert.ok(r.error.length > 10);
  }
  assert.match(parseBackup(JSON.stringify({ app: 'smeny-backup', v: 2, data: {} })).error, /новой версией/);
  assert.match(parseBackup(JSON.stringify({ app: 'smeny-backup', v: 1, data: { zp_app_v1: '{обрезано' } })).error, /повреждена/);
  assert.match(parseBackup(JSON.stringify({ app: 'smeny-backup', v: 1, data: { foo: '1' } })).error, /нет данных/);
  assert.equal(parseBackup(JSON.stringify({ app: 'smeny-backup', v: 1, data: { zp_app_v1: '[1]' } })).ok, false);
});

test('обрезанная копия (неполное копирование) отклоняется', () => {
  const s = makeBackup(entries);
  assert.equal(parseBackup(s.slice(0, s.length - 40)).ok, false);
});

test('большая копия (несколько МБ) проходит', () => {
  const big = { ...app, expenses: Array.from({ length: 30000 }, (_, i) => ({ id: i, title: 'расход ' + i, amount: i, date: '2026-10-01' })) };
  const s = makeBackup([['zp_app_v1', JSON.stringify(big)]]);
  assert.ok(s.length > 1e6);
  const r = parseBackup(s);
  assert.equal(r.ok, true);
  assert.equal(r.summary.expenses, 30000);
});

test('restorePlan: записать всё из копии, удалить лишние zp_* этого устройства, чужие не трогать', () => {
  const p = restorePlan({ zp_app_v1: '{}' }, ['zp_app_v1', 'zp_calc_v1', 'zp_old', 'expo_key']);
  assert.deepEqual(p.set, [['zp_app_v1', '{}']]);
  assert.deepEqual(p.remove, ['zp_calc_v1', 'zp_old']);
  assert.deepEqual(appKeys(['b', 'zp_b', 'zp_a']), ['zp_a', 'zp_b']);
});

test('summarize без данных и склонения', () => {
  assert.deepEqual(summarize({}), { expenses: 0, shifts: 0, calcs: 0, keys: 0 });
  assert.equal(plural(11, ['a', 'b', 'c']), 'c');
  assert.equal(plural(21, ['a', 'b', 'c']), 'a');
  assert.equal(plural(24, ['a', 'b', 'c']), 'b');
  assert.equal(plural(0, ['a', 'b', 'c']), 'c');
});
