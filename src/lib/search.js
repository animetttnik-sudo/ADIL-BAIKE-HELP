/**
 * Поиск по расходам или сменам: по названию/месту (без регистра, ё = е) или по сумме (цифры).
 * Новые сверху. paydayIndexFor — на какую страницу-зарплату листать к найденному.
 */
import { PAYDAYS, addDays } from './periods.js';

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

/**
 * today (необязательно) — сначала прошедшие и сегодняшние (новые сверху), потом будущие (ближние сверху),
 * чтобы запланированные на год вперёд пустые смены не заслоняли настоящие.
 */
export function searchItems(list, q, limit = 40, today = null) {
  const nq = norm(q);
  if (!nq) return [];
  const digits = nq.replace(/[\s\u00a0]/g, '');
  const isNum = /^\d+$/.test(digits);
  const out = [];
  for (const x of list || []) {
    if (!x || typeof x.date !== 'string') continue;
    const text = norm(`${x.title || ''} ${x.place || ''}`);
    const amt = x.amount === null || x.amount === undefined ? '' : String(Math.round(Number(x.amount) || 0));
    const hit = text.includes(nq) || (isNum && amt.includes(digits)) || x.date.includes(nq);
    if (hit) out.push(x);
  }
  if (today) {
    const past = out.filter((x) => x.date.slice(0, 10) <= today).sort((a, b) => b.date.localeCompare(a.date));
    const next = out.filter((x) => x.date.slice(0, 10) > today).sort((a, b) => a.date.localeCompare(b.date));
    return [...past, ...next].slice(0, limit);
  }
  out.sort((a, b) => b.date.localeCompare(a.date));
  return out.slice(0, limit);
}

/** Индекс в PAYDAYS: расход — зарплата, к которой он относится; смена — зарплата за её период. */
export function paydayIndexFor(kind, date, paydays = PAYDAYS) {
  if (typeof date !== 'string') return -1;
  const d = date.slice(0, 10);
  if (kind === 'shift') return paydays.findIndex((p) => d >= addDays(p, -20) && d <= addDays(p, -7));
  let k = -1;
  for (let i = 0; i < paydays.length && paydays[i] <= d; i++) k = i;
  return k;
}
