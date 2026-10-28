/**
 * Экспорт закрытой зарплаты («Смены» → «Сохранить зарплату»): PDF (expo-print из HTML) или фото
 * (снимок карточки react-native-view-shot). Чистые функции без React/RN — тесты в tests/payExport.test.mjs.
 *
 * payReport — всё, что попадает в файл: период, смены (в т. ч. две за один день — отдельными строками
 * и итогом дня), итоги зарплаты (те же shiftTotals, что на экране), вычеты и сумма к выплате.
 */
import { DOW, fmtShort, money, parse, workPeriod } from './periods.js';
import { carryOf, dayTotals, mentorOf, shiftAmount, shiftsInPeriod, shiftTotals, shortageOf, surplusOf, bonusLossOf } from './shifts.js';
import { computeCalc, DEFAULT_RATES } from './calc.js';
import { isLinkedShift, keySlot, linkKey } from './link.js';

const signedMoney = (n) => (n < 0 ? `−${money(-n)}` : money(n));

/**
 * @param state zp_app_v1, @param p зарплата, @param calc zp_calc_v1 (необязательно — для позиций/сотрудников)
 */
export function payReport(state, p, calc) {
  const per = workPeriod(p);
  const list = shiftsInPeriod(state?.shifts, p);
  const t = shiftTotals(list, carryOf(state, p));
  const days = dayTotals(list);
  const rates = { ...DEFAULT_RATES, ...((calc && calc.rates) || {}) };
  const rows = list.map((s, i) => {
    const notes = [];
    let calcInfo = null;
    if (isLinkedShift(s) && calc && calc.days) {
      const k = linkKey(s);
      const d = calc.days[k];
      if (d) {
        const r = computeCalc(d.counts, rates, d.staff, !!d.gap);
        calcInfo = { positions: r.positions, people: r.people, slot: keySlot(k) };
        notes.push(`${r.positions} поз. · ${r.people} чел.${d.gap ? ' + промежутка' : ''}${d.mentor ? ' · наставник' : ''}`);
      }
    }
    if (mentorOf(s)) notes.push(`наставник +${money(mentorOf(s))}`);
    if (shortageOf(s)) notes.push(`недостача −${money(shortageOf(s))}`);
    if (bonusLossOf(s)) notes.push(`без премии кассира −${money(bonusLossOf(s))}`);
    if (surplusOf(s)) notes.push(`излишек ${money(surplusOf(s))} (не в зп)`);
    const hasSum = s.amount !== null && s.amount !== undefined && s.amount !== '';
    return {
      id: s.id,
      date: s.date,
      day: `${fmtShort(s.date)}, ${DOW[parse(s.date).getDay()]}`,
      title: s.title || 'Смена',
      place: s.place || '',
      hours: rates.shiftH,
      amount: hasSum ? money(shiftAmount(s)) : '—',
      source: isLinkedShift(s) ? 'расчёт' : hasSum ? 'вручную' : 'без суммы',
      calc: calcInfo,
      notes,
      // итог дня — после последней смены дня, где их 2 и больше
      dayTotal: days[s.date] && list[i + 1]?.date !== s.date ? { count: days[s.date].count, amount: money(days[s.date].amount) } : null,
    };
  });
  const lines = [['Заработано', money(t.earned)]];
  if (t.mentor) lines.push(['Наставник', `+${money(t.mentor)}`]);
  if (t.short) lines.push(['Недостача', `−${money(t.short)}`]);
  if (t.bonusLoss) lines.push(['Без премии кассира', `−${money(t.bonusLoss)}`]);
  if (t.carry) lines.push(['Депонирование', t.carry > 0 ? `−${money(t.carry)}` : `+${money(-t.carry)}`]);
  return {
    payday: p,
    title: `Зарплата ${fmtShort(p)} ${p.slice(0, 4)}`,
    period: `смены ${fmtShort(per.start)} – ${fmtShort(per.end)}`,
    // дата выдачи зарплаты — это сам ключ зарплаты (payday) в данных приложения
    payout: dotDate(p),
    periodDates: `${dotDate(per.start)} – ${dotDate(per.end)}`,
    count: t.count,
    rows,
    lines,
    surplus: t.surplus ? money(t.surplus) : null,
    net: signedMoney(t.net),
    netValue: t.net,
  };
}

/** «2026-10-15» → «15.10.2026». */
export function dotDate(iso) {
  const [y, m, d] = String(iso || '').split('-');
  return y && m && d ? `${d}.${m}.${y}` : String(iso || '');
}

/** Имя файла: «Зарплата_15.10.2026.pdf»; latin — запасной вариант «Zarplata_15.10.2026.pdf». */
export function exportFileName(r, ext, latin = false) {
  const date = String(r.payout || dotDate(r.payday)).replace(/[^0-9.]/g, '');
  return `${latin ? 'Zarplata' : 'Зарплата'}_${date}.${ext}`;
}

/** Название приложения на печати (app.json → expo.name). */
export const STAMP_APP = 'ADIL BAIKE HELP PLEASE';
/** Цвет «чернил» печати — полупрозрачный синий (на белом PDF и светлее — на тёмной карточке фото). */
export const STAMP_INK = 'rgba(28,86,196,0.72)';
export const STAMP_INK_DARK = 'rgba(96,156,255,0.78)';

/**
 * Геометрия собственной печати приложения (не имитирует ничью официальную печать):
 * двойное кольцо, по кругу — название приложения и «РАСЧЁТ ЗАРПЛАТЫ», в центре — звезда и дата выдачи.
 * Общая для PDF (SVG-строка) и фото (react-native-svg).
 */
export function stampSpec(r, size = 150, ink = STAMP_INK) {
  const c = size / 2;
  const tr = size * 0.355; // радиус строки текста по кругу
  return {
    size,
    c,
    rings: [
      { r: size * 0.47, w: 3 },
      { r: size * 0.41, w: 1 },
      { r: size * 0.25, w: 1 },
    ],
    path: `M ${c} ${c} m -${tr} 0 a ${tr} ${tr} 0 1 1 ${2 * tr} 0 a ${tr} ${tr} 0 1 1 -${2 * tr} 0`,
    ring: `${STAMP_APP} ★ РАСЧЁТ ЗАРПЛАТЫ ★`,
    ringFont: size * 0.072,
    star: '★',
    starFont: size * 0.16,
    date: r.payout || dotDate(r.payday),
    dateFont: size * 0.075,
    rotate: -8,
    ink,
  };
}

export function stampSvg(r, size = 150) {
  const k = stampSpec(r, size);
  const rings = k.rings
    .map((g) => `<circle cx="${k.c}" cy="${k.c}" r="${g.r}" fill="none" stroke="${k.ink}" stroke-width="${g.w}"/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${k.size}" height="${k.size}" viewBox="0 0 ${k.size} ${k.size}" style="transform: rotate(${k.rotate}deg)">
  <defs><path id="stampRing" d="${k.path}"/></defs>${rings}
  <text fill="${k.ink}" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="${k.ringFont}" font-weight="700" letter-spacing="1">
    <textPath href="#stampRing" xlink:href="#stampRing" startOffset="0">${esc(k.ring)}</textPath></text>
  <text x="${k.c}" y="${k.c - k.size * 0.01}" text-anchor="middle" fill="${k.ink}" font-size="${k.starFont}">${k.star}</text>
  <text x="${k.c}" y="${k.c + k.size * 0.12}" text-anchor="middle" fill="${k.ink}" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="${k.dateFont}" font-weight="700">${esc(k.date)}</text>
</svg>`;
}

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** HTML для expo-print (A4, тёмный акцент как в приложении, но на белом — для печати). */
export function reportHtml(r, accent = '#30d158', opts = {}) {
  const stamp = opts.stamp !== false;
  const rows = r.rows
    .map(
      (x) => `
      <tr>
        <td class="d">${esc(x.day)}</td>
        <td><b>${esc(x.title)}</b>${x.place ? ` · ${esc(x.place)}` : ''}${x.calc && x.calc.slot > 1 ? ` · смена ${x.calc.slot}` : ''}
          <div class="m">${esc(x.hours)} ч · ${esc(x.source)}${x.notes.length ? ` · ${x.notes.map(esc).join(' · ')}` : ''}</div></td>
        <td class="a">${esc(x.amount)}</td>
      </tr>${
        x.dayTotal
          ? `<tr class="dt"><td></td><td>За день · ${x.dayTotal.count} смены</td><td class="a">${esc(x.dayTotal.amount)}</td></tr>`
          : ''
      }`
    )
    .join('');
  const lines = r.lines.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="a">${esc(v)}</td></tr>`).join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111; margin: 28px; }
  h1 { font-size: 26px; margin: 0; } .sub { color: #666; margin: 4px 0 18px; }
  table { width: 100%; border-collapse: collapse; } td { padding: 8px 6px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 14px; }
  .d { white-space: nowrap; color: #444; width: 90px; } .a { text-align: right; white-space: nowrap; font-weight: 600; }
  .m { color: #777; font-size: 12px; margin-top: 2px; } .dt td { color: #555; background: #f6f6f6; font-size: 13px; }
  .tot { margin-top: 18px; } .net { margin-top: 14px; padding: 14px 16px; border-radius: 14px; background: #f4f6f4; border: 2px solid ${esc(accent)};
    display: flex; justify-content: space-between; font-size: 20px; font-weight: 700; }
  .foot { color: #999; font-size: 11px; margin-top: 18px; }
  .pay { color: #333; font-size: 14px; margin: -10px 0 16px; }
  .stamp { display: flex; justify-content: flex-end; margin: 8px 24px 0 0; }
</style></head><body>
  <h1>${esc(r.title)}</h1>
  <div class="sub">${esc(r.period)} · ${esc(r.count)} ${esc(plural(r.count))}</div>
  <div class="pay">Период: ${esc(r.periodDates)} · Дата выдачи: <b>${esc(r.payout)}</b></div>
  <table>${rows}</table>
  <table class="tot">${lines}</table>
  <div class="net"><span>К выплате</span><span>${esc(r.net)}</span></div>
  ${stamp ? `<div class="stamp">${stampSvg(r)}</div>` : ''}
  ${r.surplus ? `<div class="foot">Излишек ${esc(r.surplus)} — не в зарплату.</div>` : ''}
  <div class="foot">ADIL BAIKE HELP · «Смены»</div>
</body></html>`;
}

function plural(n) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'смен';
  if (b === 1) return 'смена';
  if (b >= 2 && b <= 4) return 'смены';
  return 'смен';
}
