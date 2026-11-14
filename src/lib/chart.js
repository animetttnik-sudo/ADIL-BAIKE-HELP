/**
 * «Анализ» → неоновый график: ряды по месяцам и геометрия SVG (чистые функции — тесты в tests/chart.test.mjs).
 * green — заработано за месяц, red — оплачено расходов за месяц, blue — баланс нарастающим итогом
 * (сумма «заработано − оплачено» с начала периода).
 */

/** Ряды графика из monthStats (M) по отсортированным ключам месяцев ks. */
export function chartSeries(M, ks) {
  const green = [];
  const red = [];
  const blue = [];
  let acc = 0;
  for (const k of ks || []) {
    const m = (M && M[k]) || { e: 0, s: 0 };
    const e = Number(m.e) || 0;
    const s = Number(m.s) || 0;
    acc += e - s;
    green.push(e);
    red.push(s);
    blue.push(acc);
  }
  return { green, red, blue };
}

/** Направление последнего шага ряда: 1 — вверх, −1 — вниз, 0 — ровно/одна точка. */
export function trendOf(vals) {
  if (!vals || vals.length < 2) return 0;
  const d = vals[vals.length - 1] - vals[vals.length - 2];
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}

/** Общая шкала по всем рядам (с нулём внутри) и «красивые» линии сетки. */
export function chartScale(series, ticks = 4) {
  const all = series.flat().filter((v) => Number.isFinite(v));
  let lo = Math.min(0, ...all);
  let hi = Math.max(0, ...all);
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((x) => x >= raw) || raw;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const grid = [];
  for (let v = lo; v <= hi + step / 2; v += step) grid.push(Math.round(v));
  return { lo, hi, step, grid };
}

/** Точки ряда в координатах SVG (w×h, отступы pad). Одна точка — растягивается в горизонталь. */
export function chartPoints(vals, { w, h, lo, hi, padX = 0, padY = 0 }) {
  const n = vals.length;
  const y = (v) => padY + (1 - (v - lo) / (hi - lo)) * (h - padY * 2);
  if (n === 0) return [];
  if (n === 1) return [{ x: padX, y: y(vals[0]) }, { x: w - padX, y: y(vals[0]) }];
  return vals.map((v, i) => ({ x: padX + (i / (n - 1)) * (w - padX * 2), y: y(v) }));
}

/**
 * Плавная кривая через точки (monotone cubic — без «перелётов» выше/ниже данных, как в биржевых графиках).
 * Возвращает { d, len, end: {x, y, angle} } — angle (градусы) — направление касательной в конце (для стрелки),
 * len — длина кривой (для анимации «прорисовки» через strokeDashoffset).
 */
export function smoothPath(pts) {
  const n = pts.length;
  if (n === 0) return { d: '', len: 0, end: null, segs: [] };
  if (n === 1) return { d: `M${r(pts[0].x)} ${r(pts[0].y)}`, len: 0, end: { ...pts[0], angle: 0 }, segs: [] };
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    m.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1));
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${r(pts[0].x)} ${r(pts[0].y)}`;
  let len = 0;
  const segs = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i];
    const p3 = pts[i + 1];
    const h = dx[i] / 3;
    const p1 = { x: p0.x + h, y: p0.y + t[i] * h };
    const p2 = { x: p3.x - h, y: p3.y - t[i + 1] * h };
    segs.push([p0, p1, p2, p3]);
    d += ` C${r(p1.x)} ${r(p1.y)} ${r(p2.x)} ${r(p2.y)} ${r(p3.x)} ${r(p3.y)}`;
    len += bezLen(p0, p1, p2, p3);
  }
  const last = pts[n - 1];
  const tn = t[n - 1];
  const angle = (Math.atan2(tn, 1) * 180) / Math.PI;
  return { d, len: Math.ceil(len), end: { x: last.x, y: last.y, angle }, segs };
}

/** Площадь под кривой до низа графика (для лёгкой подсветки под линией). */
export function areaPath(pts, bottomY) {
  const { d } = smoothPath(pts);
  if (!d || pts.length < 2) return '';
  return `${d} L${r(pts[pts.length - 1].x)} ${r(bottomY)} L${r(pts[0].x)} ${r(bottomY)} Z`;
}

const r = (v) => Math.round(v * 10) / 10;

function bezLen(p0, p1, p2, p3, steps = 16) {
  let L = 0;
  let px = p0.x;
  let py = p0.y;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const a = (1 - u) ** 3;
    const b = 3 * (1 - u) ** 2 * u;
    const c = 3 * (1 - u) * u * u;
    const e = u ** 3;
    const x = a * p0.x + b * p1.x + c * p2.x + e * p3.x;
    const y = a * p0.y + b * p1.y + c * p2.y + e * p3.y;
    L += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return L;
}

/** Короткая подпись суммы для оси: 12 500 → «12,5к», 1 200 000 → «1,2м». */
export function shortMoney(v) {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e6) return `${s}${trim(a / 1e6)}м`;
  if (a >= 1e3) return `${s}${trim(a / 1e3)}к`;
  return `${s}${Math.round(a)}`;
}
const trim = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');
