/**
 * Векторные глифы 24×24 (белый силуэт, вырезы — evenodd).
 * Чистый JS без React — тот же файл рисует превью в Node.
 */

function rr(x, y, w, h, r) {
  r = Math.min(Math.max(r, 0), w / 2, h / 2);
  const r2 = r;
  return `M${+(x + r).toFixed(3)} ${+y.toFixed(3)}h${+(w - 2 * r).toFixed(3)}a${r} ${r} 0 0 1 ${r} ${r}v${+(h - 2 * r).toFixed(3)}a${r} ${r} 0 0 1 ${-r} ${r}h${+(-(w - 2 * r)).toFixed(3)}a${r} ${r} 0 0 1 ${-r} ${-r}v${+(-(h - 2 * r)).toFixed(3)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

function cir(cx, cy, r) {
  return `M${+(cx - r).toFixed(3)} ${+cy.toFixed(3)}a${r} ${r} 0 1 0 ${+(2 * r).toFixed(3)} 0a${r} ${r} 0 1 0 ${+(-2 * r).toFixed(3)} 0z`;
}

/** Отрезок со скруглёнными концами (капсула). */
function cap(x1, y1, x2, y2, w) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = (-uy * w) / 2;
  const py = (ux * w) / 2;
  const r = w / 2;
  const f = (n) => +n.toFixed(3);
  return `M${f(x1 + px)} ${f(y1 + py)}L${f(x2 + px)} ${f(y2 + py)}A${r} ${r} 0 0 1 ${f(x2 - px)} ${f(y2 - py)}L${f(x1 - px)} ${f(y1 - py)}A${r} ${r} 0 0 1 ${f(x1 + px)} ${f(y1 + py)}z`;
}

function star(cx, cy, rOut, rIn, n = 5, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = rot + (i * Math.PI) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const f = (n) => +n.toFixed(3);
  return `M${f(pts[0][0])} ${f(pts[0][1])}` + pts.slice(1).map((p) => `L${f(p[0])} ${f(p[1])}`).join('') + 'z';
}

function gear({ cx = 12, cy = 12, teeth = 6, ro = 9.6, ri = 7.15, hole = 3.15, tw = 0.38, inset = 0.55 } = {}) {
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2 - Math.PI / 2;
    const step = (Math.PI * 2) / teeth;
    const mid = a0 + step / 2;
    const a1 = a0 + step;
    const hw = (tw * step) / 2;
    const ih = hw * inset;
    const p = (a, r) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    pts.push(p(a0 - ih + step * 0, ri));
    pts.push(p(mid - hw, ri));
    pts.push(p(mid - hw * 0.72, ro));
    pts.push(p(mid + hw * 0.72, ro));
    pts.push(p(mid + hw, ri));
  }
  const f = (n) => +n.toFixed(3);
  const ring = `M${f(pts[0][0])} ${f(pts[0][1])}` + pts.slice(1).map((p) => `L${f(p[0])} ${f(p[1])}`).join('') + 'z';
  return ring + cir(cx, cy, hole);
}

/** След в форме капли (остриё сверху). */
function drop(cx, cy, w, h) {
  // круглая нижняя часть + заострённый верх через кубические кривые
  const top = cy - h / 2;
  const bot = cy + h / 2;
  const r = w / 2;
  const f = (n) => +n.toFixed(3);
  return `M${f(cx)} ${f(top)}C${f(cx + r * 0.15)} ${f(top + h * 0.22)} ${f(cx + r)} ${f(cy - h * 0.05)} ${f(cx + r)} ${f(cy + h * 0.12)}A${r} ${r} 0 1 1 ${f(cx - r)} ${f(cy + h * 0.12)}C${f(cx - r)} ${f(cy - h * 0.05)} ${f(cx - r * 0.15)} ${f(top + h * 0.22)} ${f(cx)} ${f(top)}z`;
}

const GLYPHS = {};
const RULES = {}; // evenodd by default when set

function add(name, d, rule = 'evenodd') {
  GLYPHS[name] = d;
  RULES[name] = rule;
}

// ── Calculator ──────────────────────────────────────────
{
  let d = rr(3.2, 2.6, 17.6, 18.8, 3.2);
  d += rr(5.5, 5, 13, 4.3, 1.15); // display
  const cols = 3;
  const rows = 3;
  const x0 = 5.5;
  const y0 = 10.6;
  const bw = 3.6;
  const bh = 2.85;
  const gx = (13 - cols * bw) / (cols - 1);
  const gy = (8.2 - rows * bh) / (rows - 1);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      d += rr(x0 + c * (bw + gx), y0 + r * (bh + gy), bw, bh, 0.7);
    }
  }
  add('calculator', d);
}

// ── Calendar + clock ────────────────────────────────────
{
  let d = rr(2.5, 3.6, 14.6, 15.6, 2.4);
  d += rr(5.35, 2.15, 1.7, 3.5, 0.85);
  d += rr(12.55, 2.15, 1.7, 3.5, 0.85);
  d += rr(4.6, 8.15, 10.4, 1.25, 0.5);
  // day dots
  const dots = [
    [5.6, 11.35],
    [8.4, 11.35],
    [11.2, 11.35],
    [5.6, 14.15],
    [8.4, 14.15],
  ];
  for (const [x, y] of dots) d += cir(x, y, 0.95);
  add('calendarBody', d);
  // clock badge — отдельный глиф, рисуем поверх
  let clock = cir(17.15, 16.85, 5.35);
  clock += cir(17.15, 16.85, 3.85);
  clock += cap(17.15, 16.85, 17.15, 14.35, 1.25);
  clock += cap(17.15, 16.85, 19.35, 17.55, 1.25);
  add('clockBadge', clock, 'evenodd');
  // combined for single-path consumers: body + clock (clock on top as separate in RN)
  add('calendar', d, 'evenodd');
}

// ── Wallet ──────────────────────────────────────────────
{
  // карта чуть уже и выше — её углы торчат над корпусом
  add('walletBack', rr(5.6, 3.2, 12.8, 8.4, 1.5), 'nonzero');
  let front = rr(3.1, 8.0, 17.8, 12.5, 2.6);
  front += rr(5.3, 12.2, 13.4, 2.15, 1.05);
  front += cir(17.15, 16.6, 1.35);
  add('walletFront', front, 'evenodd');
  add('wallet', front, 'evenodd');
}

// ── Plus / minus / close / check ────────────────────────
add('plus', cap(5, 12, 19, 12, 3.2) + cap(12, 5, 12, 19, 3.2), 'nonzero');
add('minus', cap(5.2, 12, 18.8, 12, 3.2), 'nonzero');
add('close', cap(6.2, 6.2, 17.8, 17.8, 3.05) + cap(17.8, 6.2, 6.2, 17.8, 3.05), 'nonzero');
add('check', cap(5.2, 13.05, 10.15, 17.55, 3.15) + cap(10.15, 17.55, 19.05, 6.7, 3.15), 'nonzero');

// ── Chevrons / arrows ───────────────────────────────────
add('chevronRight', cap(9.4, 5.8, 16.2, 12, 2.7) + cap(16.2, 12, 9.4, 18.2, 2.7), 'nonzero');
add('chevronLeft', cap(14.6, 5.8, 7.8, 12, 2.7) + cap(7.8, 12, 14.6, 18.2, 2.7), 'nonzero');
add(
  'arrowRight',
  cap(3.6, 12, 15.2, 12, 2.6) + cap(12.3, 6.3, 19.4, 12, 2.7) + cap(19.4, 12, 12.3, 17.7, 2.7),
  'nonzero'
);
add(
  'arrowLeft',
  cap(20.4, 12, 8.8, 12, 2.6) + cap(11.7, 6.3, 4.6, 12, 2.7) + cap(4.6, 12, 11.7, 17.7, 2.7),
  'nonzero'
);

// ── Gear / trash / search / bell / info ─────────────────
add('gear', gear());
{
  let d = rr(5.3, 8.4, 13.4, 13, 2.2);
  d += rr(7.3, 10.6, 1.5, 8.2, 0.7);
  d += rr(11.25, 10.6, 1.5, 8.2, 0.7);
  d += rr(15.2, 10.6, 1.5, 8.2, 0.7);
  // lid
  d += rr(4.4, 5.7, 15.2, 2.15, 0.85);
  d += rr(9.3, 3.4, 5.4, 2.3, 0.9);
  add('trash', d);
}
add('search', cir(10.3, 10.3, 6.15) + cir(10.3, 10.3, 4.05) + cap(14.7, 14.7, 19.3, 19.3, 2.55));
{
  // bell
  const f = (n) => +n.toFixed(3);
  let d = `M${f(5.4)} ${f(10.2)}C${f(5.4)} ${f(6.3)} ${f(8.15)} ${f(3.6)} ${f(12)} ${f(3.6)}C${f(15.85)} ${f(3.6)} ${f(18.6)} ${f(6.3)} ${f(18.6)} ${f(10.2)}L${f(18.6)} ${f(14.6)}L${f(20.1)} ${f(16.7)}A${1.2} ${1.2} 0 0 1 ${f(19.1)} ${f(18.5)}H${f(4.9)}A${1.2} ${1.2} 0 0 1 ${f(3.9)} ${f(16.7)}L${f(5.4)} ${f(14.6)}Z`;
  d += cir(12, 20.15, 1.55);
  add('bell', d, 'nonzero');
}
{
  let d = cir(12, 12, 9.3);
  d += cir(12, 7.35, 1.35); // i-dot as cutout? better solid i on ring
  add('infoRing', cir(12, 12, 9.3) + cir(12, 12, 7.15), 'evenodd');
  add('infoMark', cir(12, 7.2, 1.25) + rr(10.7, 9.5, 2.6, 8.1, 1.3), 'nonzero');
  add('info', cir(12, 12, 9.3) + cir(12, 7.2, 1.3) + rr(10.7, 9.55, 2.6, 8.05, 1.3), 'evenodd');
}

// ── Profile / login / logout / shield / star / home ─────
{
  let d = cir(12, 8.05, 3.85);
  const f = (n) => +n.toFixed(3);
  d += `M${f(4.2)} ${f(20.6)}C${f(4.2)} ${f(15.9)} ${f(7.35)} ${f(13.3)} ${f(12)} ${f(13.3)}C${f(16.65)} ${f(13.3)} ${f(19.8)} ${f(15.9)} ${f(19.8)} ${f(20.6)}Z`;
  add('profile', d, 'nonzero');
}
{
  // door frame + arrow out (logout)
  let door = rr(3.2, 3.4, 10.2, 17.4, 1.6);
  door += rr(5.1, 5.4, 6.4, 13.4, 1.1);
  add('logoutDoor', door);
  add('logout', door + cap(11.6, 12, 20.5, 12, 2.4) + cap(16.6, 7.6, 20.7, 12, 2.5) + cap(20.7, 12, 16.6, 16.4, 2.5), 'evenodd');
  // login: arrow in
  add('login', door + cap(20.5, 12, 11.6, 12, 2.4) + cap(15.6, 7.6, 11.5, 12, 2.5) + cap(11.5, 12, 15.6, 16.4, 2.5), 'evenodd');
}
{
  const f = (n) => +n.toFixed(3);
  // shield
  let d = `M${f(12)} ${f(2.4)}C${f(15.6)} ${f(4.5)} ${f(18.7)} ${f(5.2)} ${f(20.3)} ${f(5.4)}C${f(20.5)} ${f(12.8)} ${f(17.8)} ${f(18.6)} ${f(12)} ${f(21.6)}C${f(6.2)} ${f(18.6)} ${f(3.5)} ${f(12.8)} ${f(3.7)} ${f(5.4)}C${f(5.3)} ${f(5.2)} ${f(8.4)} ${f(4.5)} ${f(12)} ${f(2.4)}z`;
  d += `M${f(12)} ${f(5.0)}C${f(14.7)} ${f(6.55)} ${f(17.0)} ${f(7.1)} ${f(18.1)} ${f(7.25)}C${f(18.2)} ${f(12.8)} ${f(16.1)} ${f(17.15)} ${f(12)} ${f(19.4)}C${f(7.9)} ${f(17.15)} ${f(5.8)} ${f(12.8)} ${f(5.9)} ${f(7.25)}C${f(7.0)} ${f(7.1)} ${f(9.3)} ${f(6.55)} ${f(12)} ${f(5.0)}z`;
  add('shield', d);
}
add('star', star(12, 12.1, 9.3, 3.85));
{
  const f = (n) => +n.toFixed(3);
  let d = `M${f(12)} ${f(3.1)}L${f(21.2)} ${f(11.4)}A${1.2} ${1.2} 0 0 1 ${f(20.35)} ${f(13.4)}H${f(18.6)}V${f(20.5)}A${1.7} ${1.7} 0 0 1 ${f(16.9)} ${f(22.2)}H${f(14.15)}V${f(15.5)}H${f(9.85)}V${f(22.2)}H${f(7.1)}A${1.7} ${1.7} 0 0 1 ${f(5.4)} ${f(20.5)}V${f(13.4)}H${f(3.65)}A${1.2} ${1.2} 0 0 1 ${f(2.8)} ${f(11.4)}L${f(12)} ${f(3.1)}z`;
  d += rr(10.15, 15.5, 3.7, 6.7, 0.6); // door cut — already open in path via the V stem; add porch hole if needed
  add('home', d, 'nonzero');
}

// ── Download / upload / copy / scan / document / card ───
{
  const tray = `M4.3 14.6v4.3A2.3 2.3 0 0 0 6.6 21.2h10.8A2.3 2.3 0 0 0 19.7 18.9v-4.3h-2.5v4.05H6.8V14.6z`;
  add('download', tray + cap(12, 3.3, 12, 14.6, 2.55) + cap(7.4, 10.1, 12, 14.8, 2.55) + cap(16.6, 10.1, 12, 14.8, 2.55), 'nonzero');
  add('upload', tray + cap(12, 15.0, 12, 3.6, 2.55) + cap(7.4, 8.3, 12, 3.5, 2.55) + cap(16.6, 8.3, 12, 3.5, 2.55), 'nonzero');
}
{
  add('copyBack', rr(3.2, 6.2, 12.0, 14.4, 1.9), 'nonzero');
  let front = rr(7.6, 3.2, 13.0, 14.8, 2.0);
  front += rr(10.0, 7.1, 8.2, 1.35, 0.6);
  front += rr(10.0, 9.8, 6.4, 1.35, 0.6);
  add('copyFront', front, 'evenodd');
  add('copy', front, 'evenodd');
}
{
  // four corner brackets
  const L = (x, y, dx, dy) => {
    // corner: two capsules
    return cap(x, y, x + dx, y, 2.15) + cap(x, y, x, y + dy, 2.15);
  };
  add(
    'scan',
    L(3.6, 3.6, 6.2, 6.2) + L(20.4, 3.6, -6.2, 6.2) + L(3.6, 20.4, 6.2, -6.2) + L(20.4, 20.4, -6.2, -6.2),
    'nonzero'
  );
}
{
  // лист со срезанным верхним правым углом (сгиб — часть контура, не вырез)
  const f = (n) => +n.toFixed(3);
  let d = `M${f(7.2)} ${f(2.8)}H${f(14.15)}L${f(18.8)} ${f(7.45)}V${f(19.2)}A${2.0} ${2.0} 0 0 1 ${f(16.8)} ${f(21.2)}H${f(7.2)}A${2.0} ${2.0} 0 0 1 ${f(5.2)} ${f(19.2)}V${f(4.8)}A${2.0} ${2.0} 0 0 1 ${f(7.2)} ${f(2.8)}z`;
  d += cap(14.15, 2.95, 14.15, 6.15, 1.15) + cap(14.15, 6.15, 18.55, 6.15, 1.15);
  d += rr(7.8, 10.5, 8.4, 1.4, 0.7);
  d += rr(7.8, 13.4, 8.4, 1.4, 0.7);
  d += rr(7.8, 16.3, 5.6, 1.4, 0.7);
  add('document', d);
}
{
  let d = rr(2.6, 6.2, 18.8, 12.4, 2.4);
  d += rr(2.6, 9.3, 18.8, 2.35, 0); // stripe
  d += rr(5.0, 13.6, 4.4, 2.7, 0.6); // chip
  add('card', d);
}

// ── Printer + empty ─────────────────────────────────────
{
  // лист сверху, корпус с окном и лотком — читается как принтер, не кошелёк
  add('printerPaper', rr(7.15, 2.15, 9.7, 8.3, 1.15) + rr(9.0, 4.15, 6.0, 1.05, 0.5) + rr(9.0, 6.15, 4.4, 1.05, 0.5), 'evenodd');
  let body = rr(3.15, 9.6, 17.7, 11.3, 2.35);
  body += rr(6.3, 12.55, 11.4, 2.55, 0.9); // окно
  body += cir(17.15, 17.85, 1.15); // индикатор
  add('printerBody', body, 'evenodd');
  add('printer', body, 'evenodd');
}
add('empty', cir(12, 12, 8.15) + cir(12, 12, 6.05), 'evenodd');

// ── Chart / pie / percent / history / lightning ─────────
add(
  'chart',
  rr(3.6, 13.2, 4.0, 7.4, 1.15) + rr(10, 8.4, 4.0, 12.2, 1.15) + rr(16.4, 4.8, 4.0, 15.8, 1.15),
  'nonzero'
);
{
  let d = cir(12, 12, 9.2);
  // slice cutout (pie missing a sector) — from center to 12 o'clock to ~2 o'clock
  const f = (n) => +n.toFixed(3);
  const a0 = -Math.PI / 2;
  const a1 = Math.PI / 5;
  const r = 9.2;
  d += `M12 12L${f(12 + r * Math.cos(a0))} ${f(12 + r * Math.sin(a0))}A${r} ${r} 0 0 1 ${f(12 + r * Math.cos(a1))} ${f(12 + r * Math.sin(a1))}Z`;
  add('pie', d, 'evenodd');
}
{
  add(
    'percent',
    cir(7.3, 7.4, 2.85) + cir(7.3, 7.4, 1.35) + cir(16.7, 16.6, 2.85) + cir(16.7, 16.6, 1.35) + cap(16.8, 5.6, 7.2, 18.4, 2.35),
    'evenodd'
  );
}
{
  // часы + короткая стрелка по часовой сверху справа
  let d = cir(11.15, 12.35, 7.7);
  d += cir(11.15, 12.35, 5.65);
  d += cap(11.15, 12.35, 11.15, 8.55, 1.3);
  d += cap(11.15, 12.35, 14.2, 13.55, 1.3);
  d += cap(16.6, 6.0, 20.3, 6.0, 2.15);
  d += cap(20.3, 6.0, 20.3, 9.7, 2.15);
  add('history', d, 'evenodd');
}
{
  const f = (n) => +n.toFixed(3);
  // bolt
  const d = `M${f(13.8)} ${f(2.6)}L${f(6.4)} ${f(13.35)}H${f(11.15)}L${f(9.6)} ${f(21.4)}L${f(18.0)} ${f(9.85)}H${f(13.05)}Z`;
  add('lightning', d, 'nonzero');
}

// ── Location / link / drop / list / box ─────────────────
{
  const f = (n) => +n.toFixed(3);
  let d = `M${f(12)} ${f(2.6)}C${f(16.85)} ${f(2.6)} ${f(20.6)} ${f(6.3)} ${f(20.6)} ${f(11.0)}C${f(20.6)} ${f(16.4)} ${f(12)} ${f(22.2)} ${f(12)} ${f(22.2)}C${f(12)} ${f(22.2)} ${f(3.4)} ${f(16.4)} ${f(3.4)} ${f(11.0)}C${f(3.4)} ${f(6.3)} ${f(7.15)} ${f(2.6)} ${f(12)} ${f(2.6)}z`;
  d += cir(12, 10.6, 3.15);
  add('location', d);
}
{
  // two chain links, rotated
  const link = (cx, cy, rot) => {
    // rounded rect ring, then rotate around cx,cy — bake rotation
    const w = 9.6;
    const h = 5.6;
    const r = h / 2;
    const holeW = 5.6;
    const holeH = 2.15;
    const hr = holeH / 2;
    const outer = [
      // we'll use a path then rotate points... simpler: unrotated at origin then transform
    ];
    const rad = (rot * Math.PI) / 180;
    const xform = (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      return [cx + dx * Math.cos(rad) - dy * Math.sin(rad), cy + dx * Math.sin(rad) + dy * Math.cos(rad)];
    };
    const pathRr = (x, y, ww, hh, rr_) => {
      const pts = [];
      // approximate with the standard rr path by transforming the commands is hard;
      // use 4 lines + 4 arcs via points
      const k = [
        [x + rr_, y],
        [x + ww - rr_, y],
        [x + ww, y + rr_],
        [x + ww, y + hh - rr_],
        [x + ww - rr_, y + hh],
        [x + rr_, y + hh],
        [x, y + hh - rr_],
        [x, y + rr_],
      ];
      const t = k.map(([px, py]) => xform(px, py));
      const f2 = (n) => +n.toFixed(3);
      // start mid-top after first corner
      return (
        `M${f2(t[0][0])} ${f2(t[0][1])}L${f2(t[1][0])} ${f2(t[1][1])}` +
        `A${rr_} ${rr_} ${rot} 0 1 ${f2(t[2][0])} ${f2(t[2][1])}` +
        `L${f2(t[3][0])} ${f2(t[3][1])}` +
        `A${rr_} ${rr_} ${rot} 0 1 ${f2(t[4][0])} ${f2(t[4][1])}` +
        `L${f2(t[5][0])} ${f2(t[5][1])}` +
        `A${rr_} ${rr_} ${rot} 0 1 ${f2(t[6][0])} ${f2(t[6][1])}` +
        `L${f2(t[7][0])} ${f2(t[7][1])}` +
        `A${rr_} ${rr_} ${rot} 0 1 ${f2(t[0][0])} ${f2(t[0][1])}z`
      );
    };
    return pathRr(cx - w / 2, cy - h / 2, w, h, r) + pathRr(cx - holeW / 2, cy - holeH / 2, holeW, holeH, hr);
  };
  add('link', link(9.1, 12, -38) + link(14.9, 12, -38));
}
add('drop', drop(12, 12.1, 14.2, 18.4) + cir(12, 14.4, 2.5));
add('list', rr(4.2, 5.2, 15.6, 2.55, 1.25) + rr(4.2, 10.7, 15.6, 2.55, 1.25) + rr(4.2, 16.2, 15.6, 2.55, 1.25), 'nonzero');
{
  // закрытая коробка: корпус + крышка-планка сверху + скотч
  add('boxLid', rr(4.0, 4.2, 16.0, 3.6, 1.15), 'nonzero');
  add('boxFront', rr(4.4, 7.0, 15.2, 13.2, 1.8) + cap(12, 7.0, 12, 20.0, 1.35), 'evenodd');
  add('box', rr(4.4, 7.0, 15.2, 13.2, 1.8), 'nonzero');
}

const LAYERS = {
  calendar: ['calendar', 'clockBadge'],
  wallet: ['walletBack', 'walletFront'],
  copy: ['copyBack', 'copyFront'],
  box: ['boxLid', 'boxFront'],
  printer: ['printerPaper', 'printerBody'],
  info: ['info'],
};

const NAMES = Object.keys(GLYPHS).filter(
  (n) => !n.endsWith('Body') && !n.endsWith('Back') && !n.endsWith('Front') && !n.endsWith('Ring') && !n.endsWith('Mark') && n !== 'clockBadge' && n !== 'logoutDoor'
);

// Public set (the ones we show as tiles)
const SET = [
  'calculator',
  'calendar',
  'wallet',
  'gear',
  'trash',
  'plus',
  'minus',
  'check',
  'close',
  'chevronRight',
  'chevronLeft',
  'arrowRight',
  'arrowLeft',
  'info',
  'bell',
  'search',
  'profile',
  'logout',
  'login',
  'shield',
  'star',
  'download',
  'upload',
  'copy',
  'scan',
  'document',
  'card',
  'printer',
  'empty',
  'chart',
  'pie',
  'percent',
  'history',
  'lightning',
  'location',
  'link',
  'home',
  'drop',
  'list',
  'box',
];


// ── Штриховые глифы (галочка, стрелки, кольцо) — круглые концы, уже в центре 24×24
const STROKES = {
  check: {
    d: 'M5.15 12.2 L10.2 17.4 L18.9 6.65',
    width: 2.7,
    linecap: 'round',
    linejoin: 'round',
  },
  arrowRight: {
    d: 'M4.45 12 H17.45 M12.85 6.4 L19.55 12 L12.85 17.6',
    width: 2.45,
    linecap: 'round',
    linejoin: 'round',
  },
  arrowLeft: {
    d: 'M19.55 12 H6.55 M11.15 6.4 L4.45 12 L11.15 17.6',
    width: 2.45,
    linecap: 'round',
    linejoin: 'round',
  },
  empty: {
    circle: { cx: 12, cy: 12, r: 7.05 },
    width: 2.2,
  },
};

function tokenize(d) {
  const out = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
  let m, cur = null, nums = [];
  const flush = () => { if (cur) out.push({ c: cur, n: nums }); cur = null; nums = []; };
  while ((m = re.exec(d))) {
    if (m[1]) { flush(); cur = m[1]; }
    else nums.push(Number(m[2]));
  }
  flush();
  return out;
}

function arcPoints(x1, y1, rx, ry, phiDeg, large, sweep, x2, y2, steps = 24) {
  const pts = [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (!rx || !ry) { pts.push([x2, y2]); return pts; }
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  let x1p = cos * dx + sin * dy;
  let y1p = -sin * dx + cos * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const sign = large !== sweep ? 1 : -1;
  const rx2 = rx * rx, ry2 = ry * ry;
  const num = Math.max(0, rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p);
  const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
  const coef = den ? sign * Math.sqrt(num / den) : 0;
  const cxp = coef * (rx * y1p) / ry;
  const cyp = coef * (-ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => {
    const mag = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1;
    const a = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / mag)));
    return ux * vy - uy * vx < 0 ? -a : a;
  };
  const theta1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;
  for (let i = 0; i <= steps; i++) {
    const t = theta1 + (dtheta * i) / steps;
    const x = cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin;
    const y = cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos;
    pts.push([x, y]);
  }
  return pts;
}

function pathBBox(d) {
  const cmds = tokenize(d);
  let x = 0, y = 0, sx = 0, sy = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (px, py) => {
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    minX = Math.min(minX, px); minY = Math.min(minY, py);
    maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
  };
  for (const { c, n } of cmds) {
    const rel = c === c.toLowerCase() && c.toUpperCase() !== 'Z';
    const T = c.toUpperCase();
    let i = 0;
    const take = (k) => n.slice(i, (i += k));
    if (T === 'M') {
      let first = true;
      while (i < n.length) {
        let nx = n[i++], ny = n[i++];
        if (ny == null) break;
        if (rel) { nx += x; ny += y; }
        x = nx; y = ny;
        if (first) { sx = x; sy = y; first = false; }
        add(x, y);
      }
    } else if (T === 'L') {
      while (i < n.length) {
        let nx = n[i++], ny = n[i++];
        if (ny == null) break;
        if (rel) { nx += x; ny += y; }
        x = nx; y = ny; add(x, y);
      }
    } else if (T === 'H') {
      while (i < n.length) {
        let nx = n[i++];
        if (rel) nx += x;
        x = nx; add(x, y);
      }
    } else if (T === 'V') {
      while (i < n.length) {
        let ny = n[i++];
        if (rel) ny += y;
        y = ny; add(x, y);
      }
    } else if (T === 'C') {
      while (i < n.length) {
        const p = take(6);
        if (p.length < 6) break;
        if (rel) { for (let k = 0; k < 6; k += 2) { p[k] += x; p[k + 1] += y; } }
        add(p[0], p[1]); add(p[2], p[3]); add(p[4], p[5]);
        x = p[4]; y = p[5];
      }
    } else if (T === 'S' || T === 'Q') {
      while (i < n.length) {
        const p = take(4);
        if (p.length < 4) break;
        if (rel) { for (let k = 0; k < 4; k += 2) { p[k] += x; p[k + 1] += y; } }
        add(p[0], p[1]); add(p[2], p[3]);
        x = p[2]; y = p[3];
      }
    } else if (T === 'A') {
      while (i < n.length) {
        const p = take(7);
        if (p.length < 7) break;
        let nx = p[5], ny = p[6];
        if (rel) { nx += x; ny += y; }
        for (const [ax, ay] of arcPoints(x, y, p[0], p[1], p[2], !!p[3], !!p[4], nx, ny, 24)) add(ax, ay);
        x = nx; y = ny;
      }
    } else if (T === 'Z') {
      x = sx; y = sy;
    }
  }
  return {
    minX, minY, maxX, maxY,
    w: maxX - minX, h: maxY - minY,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    dx: 12 - (minX + maxX) / 2, dy: 12 - (minY + maxY) / 2,
  };
}

function iconBBox(name, GLYPHS, LAYERS) {
  const layers = LAYERS[name] || [name];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of layers) {
    const d = GLYPHS[id];
    if (!d) continue;
    const b = pathBBox(d);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  return {
    minX, minY, maxX, maxY,
    w: maxX - minX, h: maxY - minY,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    dx: 12 - (minX + maxX) / 2, dy: 12 - (minY + maxY) / 2,
  };
}

module.exports = { pathBBox, iconBBox };


const SHIFT = {};
for (const name of SET) {
  if (STROKES[name]) {
    SHIFT[name] = [0, 0];
    continue;
  }
  const b = iconBBox(name, GLYPHS, LAYERS);
  const dx = Math.abs(b.dx) < 0.05 ? 0 : +b.dx.toFixed(3);
  const dy = Math.abs(b.dy) < 0.05 ? 0 : +b.dy.toFixed(3);
  SHIFT[name] = [dx, dy];
}

module.exports = { GLYPHS, RULES, LAYERS, SET, NAMES, STROKES, SHIFT, pathBBox, iconBBox, rr, cir, cap };
