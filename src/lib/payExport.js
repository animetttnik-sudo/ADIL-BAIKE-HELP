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
/** Нижняя дуга печати. */
export const STAMP_BOTTOM = 'РАСЧЁТ ЗАРПЛАТЫ';
/** Цвет «чернил» печати — полупрозрачный синий (на белом PDF и светлее — на тёмной карточке фото). */
export const STAMP_INK = 'rgba(28,86,196,0.72)';
export const STAMP_INK_DARK = 'rgba(96,156,255,0.78)';

const CAP = 0.7; // высота заглавной буквы относительно кегля
const r2 = (v) => Math.round(v * 100) / 100;
// относительная ширина символа (пробел и узкие — уже, широкие — шире): для раскладки по дуге
const charW = (ch) => (ch === ' ' ? 0.45 : /[.,·:]/.test(ch) ? 0.4 : /[IЁЙ1]/.test(ch) ? 0.6 : /[ШЩЖМWЫЮ]/.test(ch) ? 1.25 : 1);

/**
 * Раскладка строки по дуге побуквенно (одинаково в PDF и в react-native-svg).
 *  top: дуга сверху, буквы «головой» наружу, читается слева направо по часовой;
 *  bottom: дуга снизу, буквы «головой» к центру — читаются нормально (не вверх ногами).
 *  mid — радиус середины полосы текста (буквы целиком внутри полосы ±cap/2), span — угол дуги (рад).
 */
export function arcGlyphs(text, { c, mid, size, span, side = 'top', center, weight = '700' }) {
  const chars = [...text];
  const ws = chars.map(charW);
  const total = ws.reduce((a, b) => a + b, 0);
  const cap = size * CAP;
  const r = side === 'top' ? mid - cap / 2 : mid + cap / 2; // базовая линия
  const c0 = center ?? (side === 'top' ? Math.PI / 2 : -Math.PI / 2);
  const out = [];
  let acc = 0;
  chars.forEach((ch, i) => {
    const t = (acc + ws[i] / 2) / total - 0.5; // −0.5…0.5 по дуге
    acc += ws[i];
    if (ch === ' ') return;
    // top: слева направо — угол убывает; bottom: слева направо — угол растёт
    const th = side === 'top' ? c0 - t * span : c0 + t * span;
    const x = c + r * Math.cos(th);
    const y = c - r * Math.sin(th);
    const rot = side === 'top' ? 90 - (th * 180) / Math.PI : -90 - (th * 180) / Math.PI;
    out.push({ ch, x: r2(x), y: r2(y), rot: r2(rot), size: r2(size), weight });
  });
  return out;
}

/** Пятиконечная звезда (path) с центром (x, y) и внешним радиусом R. */
export function starPath(x, y, R, inner = 0.42) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? R * inner : R;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    p.push(`${r2(x + rr * Math.cos(a))} ${r2(y + rr * Math.sin(a))}`);
  }
  return `M ${p.join(' L ')} Z`;
}

/**
 * Геометрия собственной печати приложения (не имитирует ничью официальную печать).
 * Снаружи внутрь: толстое кольцо · тонкое кольцо · полоса текста (сверху — название приложения,
 * снизу — «РАСЧЁТ ЗАРПЛАТЫ», звёзды ровно на 9 и 3 часах) · тонкое кольцо · кольцо микротекста
 * «ADIL BAIKE HELP PLEASE» (выглядит как пунктир, защитный узор) · внутренний круг ·
 * большая звезда и дата выдачи по дуге под ней. Наклон −11°.
 */
export function stampSpec(r, size = 150, ink = STAMP_INK) {
  const S = size;
  const c = S / 2;
  const R = {
    outer: S * 0.47,
    bandOut: S * 0.43,
    bandIn: S * 0.325,
    microIn: S * 0.275,
  };
  const textSize = S * 0.068;
  const mid = (R.bandOut + R.bandIn) / 2;
  const gap = (13 * Math.PI) / 180; // место под звёзды на 9 и 3 часах
  const span = Math.PI - 2 * gap;
  const glyphs = [
    ...arcGlyphs(STAMP_APP, { c, mid, size: textSize, span: span - 0.06, side: 'top' }),
    ...arcGlyphs(STAMP_BOTTOM, { c, mid, size: textSize, span: span * 0.74, side: 'bottom' }),
  ];
  // микротекст по всему кругу
  const microSize = S * 0.024;
  const microMid = (R.bandIn + R.microIn) / 2;
  const unit = `${STAMP_APP}   `;
  const per = [...unit].reduce((a, ch) => a + charW(ch), 0) * microSize * 0.62; // длина одного повтора
  const reps = Math.max(1, Math.round((2 * Math.PI * (microMid - microSize * CAP * 0.5)) / per));
  const micro = arcGlyphs(unit.repeat(reps), {
    c,
    mid: microMid,
    size: microSize,
    span: 2 * Math.PI,
    side: 'top',
    weight: '600',
  });
  // дата по дуге под большой звездой
  const date = r.payout || dotDate(r.payday);
  const dateSize = S * 0.066;
  const dateMid = S * 0.175;
  const dateSpan = ([...date].reduce((a, ch) => a + charW(ch), 0) * dateSize * 0.62) / dateMid;
  const dateGlyphs = arcGlyphs(date, { c, mid: dateMid, size: dateSize, span: dateSpan, side: 'bottom' });
  const sideStar = textSize * 0.62;
  return {
    size: S,
    c,
    rotate: -11,
    ink,
    rings: [
      { r: r2(R.outer), w: r2(S * 0.02) },
      { r: r2(R.bandOut), w: r2(S * 0.007) },
      { r: r2(R.bandIn), w: r2(S * 0.007) },
      { r: r2(R.microIn), w: r2(S * 0.007) },
    ],
    glyphs: [...glyphs, ...micro, ...dateGlyphs],
    stars: [starPath(c - mid, c, sideStar), starPath(c + mid, c, sideStar), starPath(c, c - S * 0.045, S * 0.11)],
    date,
    bands: { textIn: R.bandIn, textOut: R.bandOut, microIn: R.microIn, microOut: R.bandIn, textSize, microSize, mid, microMid },
  };
}

const FONT = '-apple-system, Helvetica, Arial, sans-serif';
export function stampSvg(r, size = 150) {
  const k = stampSpec(r, size);
  const rings = k.rings
    .map((g) => `<circle cx="${k.c}" cy="${k.c}" r="${g.r}" fill="none" stroke="${k.ink}" stroke-width="${g.w}"/>`)
    .join('');
  const glyphs = k.glyphs
    .map(
      (g) =>
        `<text x="${g.x}" y="${g.y}" transform="rotate(${g.rot} ${g.x} ${g.y})" text-anchor="middle" font-size="${g.size}" font-weight="${g.weight}">${esc(g.ch)}</text>`
    )
    .join('');
  const stars = k.stars.map((d) => `<path d="${d}" fill="${k.ink}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${k.size}" height="${k.size}" viewBox="0 0 ${k.size} ${k.size}" style="transform: rotate(${k.rotate}deg)">
  ${rings}<g fill="${k.ink}" font-family="${FONT}">${glyphs}</g>${stars}
</svg>`;
}

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** HTML для expo-print (A4, тёмный акцент как в приложении, но на белом — для печати). */
export function reportHtml(r, accent = '#30d158') {
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
  <div class="stamp">${stampSvg(r)}</div>
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
