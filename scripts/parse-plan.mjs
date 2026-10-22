// Парсер плана расходов из заметок телефона → src/lib/plan2026.js
//   node scripts/parse-plan.mjs [путь к plan.txt] [--check]
// Только чтение заметки и запись модуля данных; логика парсинга экспортируется для тестов.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const MONTH_PREFIX = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
/** «сентябрь», «Мая», «май» → 0..11, иначе -1 */
export function monthIndex(word) {
  const w = String(word || '').toLowerCase().replace('ё', 'е');
  if (w.length < 3) return -1;
  for (let i = 0; i < 12; i++) {
    const p = MONTH_PREFIX[i];
    if (i === 4 ? /^ма[йяе]$/.test(w) : w.startsWith(p)) return i;
  }
  return -1;
}
const pad = (n) => String(n).padStart(2, '0');
const ORD = { первая: 1, вторая: 2, третья: 3, четвертая: 4, четвёртая: 4 };

/** Год без явного указания: сен–дек → 2026, янв–авг → 2027. */
export const defaultYear = (m) => (m >= 8 ? 2026 : 2027);
/** Дата внутри блока месяца: месяц может «перескочить» (декабрь → 6 января). */
function resolveDate(day, m, blockY, blockM) {
  let y = blockY;
  if (m - blockM < -6) y += 1;
  else if (m - blockM > 6) y -= 1;
  return `${y}-${pad(m + 1)}-${pad(day)}`;
}
const digits = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;

export function parsePlan(text) {
  const clean = text.replace(/\u200e|\u200f|\r/g, '');
  const parts = clean.split(/Расходы\s+/).slice(1);
  const blocks = [];
  const warnings = [];
  for (const part of parts) {
    const lines = part.split('\n');
    const head = lines[0].trim(); // «Сентябрь 2027» / «Июль»
    const hm = head.match(/^([А-Яа-яёЁ]+)\s*(\d{4})?/);
    const blockM = monthIndex(hm[1]);
    const blockY = hm[2] ? Number(hm[2]) : defaultYear(blockM);
    let cur = null;
    for (const raw of lines.slice(1)) {
      const line = raw.trim();
      if (!line) continue;
      const ph = line.match(/^(\S+)\s+зарплата\s+(\d{1,2})\s+([А-Яа-яёЁ]+)/i);
      if (ph) {
        const m = monthIndex(ph[3]);
        cur = {
          month: `${blockY}-${pad(blockM + 1)}`,
          ordinal: ORD[ph[1].toLowerCase()] || 0,
          payday: resolveDate(Number(ph[2]), m, blockY, blockM),
          items: [],
          userTotal: null,
          userTotalRaw: null,
        };
        blocks.push(cur);
        continue;
      }
      if (/^Общ/i.test(line)) {
        const rest = line.replace(/^Общ\S*\s*-?\s*/i, '');
        const tail = rest.includes('=') ? rest.split('=').pop() : rest;
        if (cur) {
          cur.userTotal = digits(tail);
          cur.userTotalRaw = rest.trim();
        }
        continue;
      }
      const dash = line.indexOf('-');
      if (dash < 0 || !cur) {
        warnings.push(`не разобрано: «${line}»`);
        continue;
      }
      const paid = line.includes('✅');
      const L = line.slice(0, dash).replace('✅', '').trim();
      const R = line.slice(dash + 1).replace(/✅/g, '').trim();
      const am = R.match(/^(\d[\d ]*\d|\d)(?:\s+|$)(.*)$/);
      if (!am) {
        warnings.push(`нет суммы: «${line}»`);
        continue;
      }
      const amount = digits(am[1]);
      let title = am[2].trim();
      let date = null;
      const flags = [];
      const dm = L.match(/^(\d{1,2})\s*([А-Яа-яёЁ]+)$/);
      if (dm && monthIndex(dm[2]) >= 0) {
        date = resolveDate(Number(dm[1]), monthIndex(dm[2]), blockY, blockM);
      } else {
        // «1 Контракт - 10 000» / «Контракт - 10000»: даты нет, слева — название
        const nm = L.match(/^(\d+)\s+(.+)$/);
        const leftName = nm ? `${nm[2]} ${nm[1]}` : L;
        title = [leftName, title].filter(Boolean).join(' ');
        date = cur.payday;
        flags.push('noDate');
      }
      if (!title) flags.push('noName');
      cur.items.push({ date, amount, title, paid, ...(flags.length ? { flags } : {}), src: line });
    }
  }
  // старые месяцы сначала
  blocks.sort((a, b) => a.payday.localeCompare(b.payday));
  return { blocks, warnings };
}

export const blockSum = (b) => b.items.reduce((a, x) => a + x.amount, 0);

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || resolve(here, 'plan.txt');
  const { blocks, warnings } = parsePlan(readFileSync(src, 'utf8'));
  const out = resolve(here, '../src/lib/plan2026.js');
  const data = blocks.map(({ items, ...b }) => ({
    ...b,
    items: items.map(({ src: _s, ...x }) => x),
  }));
  const body =
    `// СГЕНЕРИРОВАНО scripts/parse-plan.mjs из заметки «Расходы» (plan.txt). Не править руками.\n` +
    `// Блок = одна зарплата из заметки; items — расходы под ней (paid = ✅).\n` +
    `export const PLAN_ID = 'plan-2026-09..2027-09';\n` +
    `export const PLAN_BLOCKS = ${JSON.stringify(data, null, 1)};\n`;
  if (!process.argv.includes('--check')) writeFileSync(out, body);
  for (const b of blocks) {
    const s = blockSum(b);
    const mark = b.userTotal === s ? 'ok' : `≠ у пользователя ${b.userTotal} («${b.userTotalRaw}»)`;
    console.log(`${b.month} #${b.ordinal} ${b.payday}: ${b.items.length} шт, сумма ${s} ${mark}`);
    for (const x of b.items) if (x.flags) console.log(`   ${x.flags.join(',')}: «${x.src}» → ${x.date} «${x.title}»`);
  }
  warnings.forEach((w) => console.log('WARN', w));
}
