/**
 * Смены по зарплатам и недостача (чистые функции — экран и тесты).
 *
 * Смена даты d относится к зарплате p, если d ∈ workPeriod(p) = [p − 20, p − 7]
 * (то же правило, что paydayForDate и строка «заработано» в «Расходах»).
 *
 * Недостача — необязательное поле смены `shortage` (сом, со знаком): > 0 — недостача,
 * < 0 — излишек. Сумму самой смены не меняет: недостача уменьшает итог зарплаты.
 * Излишек — только для сведения (его забирает работодатель): к выплате НЕ прибавляется
 * и недостачу не перекрывает. Цвет недостачи смены: < 500 — зелёная, ≥ 500 — красная.
 * Депонирование (раньше «с прошлой зп») — на уровне зарплаты: state.carry = { [payday]: сом } (> 0 — минус к выплате, < 0 — плюс).
 * Наставник — поле смены `mentor` (сом > 0, из заметки «+300»): доплата за наставничество.
 * Пока у смены нет суммы, она прибавляется к заработку зарплаты. Как только сумма есть
 * (из «Расчёта», где наставник уже входит в оплату, или вписана вручную) — не считается
 * отдельно, чтобы не было двойного счёта.
 * Старые сохранения без полей читаются как 0.
 */
import { ANCHOR, PAYDAYS, paydayForDate, workPeriod } from './periods.js';

const hasAmount = (s) => s && s.amount !== null && s.amount !== undefined && s.amount !== '';

/** Сумма смены (пусто → 0). */
export const shiftAmount = (s) => (hasAmount(s) ? Number(s.amount) || 0 : 0);
const signed = (v) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};
/** Поправка смены со знаком: > 0 недостача, < 0 излишек (нет поля / мусор → 0). */
export const adjOf = (s) => signed(s?.shortage);
/** Недостача смены (только > 0). */
export const shortageOf = (s) => Math.max(0, adjOf(s));
/** Излишек смены (положительное число). */
export const surplusOf = (s) => Math.max(0, -adjOf(s));
/** Наставник отмечен (из заметки): сумма доплаты, 0 — нет. */
export const mentorMark = (s) => Math.max(0, signed(s?.mentor));
/** Доплата наставника, которая считается сейчас: только пока у смены нет суммы. */
export const mentorOf = (s) => (hasAmount(s) ? 0 : mentorMark(s));
/** Премия кассира (П\касса), сом: пропадает со смены кассира, если недостача ≥ SHORT_RED_FROM. */
export const CASH_BONUS = 400;
/** Потерянная премия смены: CASH_BONUS у кассира с недостачей ≥ 500, иначе 0. */
export const bonusLossOf = (s) =>
  s && shortageOf(s) >= SHORT_RED_FROM && shiftRole(s) === 'kass' ? CASH_BONUS : 0;
/** Чистыми за смену: сумма + наставник − недостача − потерянная премия кассира (излишек не считается) — для «Анализа». */
export const shiftNet = (s) => shiftAmount(s) + mentorOf(s) - shortageOf(s) - bonusLossOf(s);

/** С какой суммы недостача смены красная (меньше — зелёная). */
export const SHORT_RED_FROM = 500;
/** Тон недостачи смены: 'good' (< 500) | 'bad' (≥ 500). */
export const shortTone = (n) => (Math.abs(Number(n) || 0) >= SHORT_RED_FROM ? 'bad' : 'good');
/** Депонирование зарплаты со знаком: > 0 — минус к выплате, < 0 — плюс к выплате. */
export const carryDue = (c) => signed(c);

/** Недостача с прошлой зарплаты, перенесённая на зарплату p (> 0 — минус к выплате). */
export const carryOf = (state, p) => signed(state?.carry?.[p]);
/** Записать перенос на зарплату p (0 / пусто — убрать). */
export function withCarry(state, p, v) {
  const n = signed(v);
  const cur = state.carry && typeof state.carry === 'object' ? state.carry : {};
  if ((cur[p] || 0) === n) return state;
  const next = { ...cur };
  if (n) next[p] = n;
  else delete next[p];
  return { ...state, carry: next };
}

/** День/ночь смены по названию («день касса», «ночь ряд») → 'day' | 'night' | null. */
export function shiftTime(s) {
  const t = String(s?.title || '').trim().toLowerCase();
  if (t.startsWith('день')) return 'day';
  if (t.startsWith('ночь')) return 'night';
  return null;
}
/** Роль по названию → 'kass' | 'ryad' | null. */
export function shiftRole(s) {
  const t = String(s?.title || '').toLowerCase();
  if (/касс/.test(t)) return 'kass';
  if (/ряд/.test(t)) return 'ryad';
  return null;
}

/** Смены зарплаты p, по дате. */
export function shiftsInPeriod(shifts, p) {
  const per = workPeriod(p);
  return (shifts || [])
    .filter((s) => s && s.date >= per.start && s.date <= per.end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Итоги зарплаты по сменам:
 *  earned  — заработано (суммы смен, недостача их не трогает);
 *  mentor  — наставник (доплаты смен без суммы); mentorCount — таких смен;
 *  short   — недостача по сменам; surplus — излишек по сменам; carry — депонирование (± к выплате);
 *  bonusLoss — потерянная премия кассира (400 за смену кассира с недостачей ≥ 500);
 *  net     — к выплате = earned + mentor − short − bonusLoss − carry (carry со знаком: < 0 прибавляет; излишек не считается);
 *  count   — смен в периоде; withSum — с суммой; fromCalc — из «Расчёта»;
 *  shortCount / surplusCount — смен с недостачей / излишком.
 */
export function shiftTotals(list, carry = 0) {
  let earned = 0;
  let short = 0;
  let surplus = 0;
  let withSum = 0;
  let fromCalc = 0;
  let shortCount = 0;
  let surplusCount = 0;
  let mentor = 0;
  let mentorCount = 0;
  let bonusLoss = 0;
  for (const s of list || []) {
    earned += shiftAmount(s);
    bonusLoss += bonusLossOf(s);
    const m = mentorOf(s);
    if (m) {
      mentor += m;
      mentorCount += 1;
    }
    if (hasAmount(s)) withSum += 1;
    if (s.source === 'calc') fromCalc += 1;
    const a = adjOf(s);
    if (a > 0) {
      short += a;
      shortCount += 1;
    } else if (a < 0) {
      surplus -= a;
      surplusCount += 1;
    }
  }
  const c = signed(carry);
  return {
    earned,
    mentor,
    short,
    surplus,
    carry: c,
    bonusLoss,
    net: earned + mentor - short - bonusLoss - carryDue(c),
    count: (list || []).length,
    withSum,
    fromCalc,
    shortCount,
    surplusCount,
    mentorCount,
  };
}

/** Итоги зарплаты p целиком (смены периода + перенос с прошлой зп). */
export const payTotals = (state, p) => shiftTotals(shiftsInPeriod(state?.shifts, p), carryOf(state, p));

/** Чистый заработок зарплаты p — его же показывают «Расходы». carry — перенос с прошлой зп. */
export const netForPayday = (shifts, p, carry = 0) => shiftTotals(shiftsInPeriod(shifts, p), carry).net;

/** Записать недостачу со знаком (< 0 — излишек; 0 / пусто — поле убирается). */
export function withShortage(s, v) {
  const n = v === '' || v == null ? 0 : signed(v);
  if (n) return s.shortage === n ? s : { ...s, shortage: n };
  if (!('shortage' in s)) return s;
  const { shortage: _drop, ...rest } = s;
  return rest;
}

/** Зарплата для открытия «Смен»: ближайшая предстоящая (первая ≥ сегодня). */
export function upcomingPayday(today) {
  return PAYDAYS.find((p) => p >= today) || PAYDAYS[PAYDAYS.length - 1];
}

/** Зарплата, на странице которой видна смена этой даты. */
export const shiftPayday = (date) => paydayForDate(date);

/** Границы листания «Смен»: от ANCHOR (или раньше — если есть более ранние смены) до конца списка. */
export function shiftPagerRange(shifts, anchor = ANCHOR) {
  let first = anchor;
  for (const s of shifts || []) if (s && s.date && shiftPayday(s.date) < first) first = shiftPayday(s.date);
  const lo = Math.max(0, PAYDAYS.indexOf(first));
  return { lo, hi: PAYDAYS.length - 1 };
}
