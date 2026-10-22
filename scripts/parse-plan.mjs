// Парсер плана расходов из заметок телефона → src/lib/plan2026.js
//   node scripts/parse-plan.mjs [путь к plan.txt] [--check]
// Только чтение заметки и запись модуля данных; логика парсинга экспортируется для тестов.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Сам парсер — src/lib/planParse.js (тот же код работает в приложении: «Импорт из заметок»).
import { parsePlan as parseNotes, stripBlocks, blockSum, monthIndex, defaultYear, inferYear, PLAN_REF } from '../src/lib/planParse.js';

/** Парсинг заметки плана с фиксированной опорной датой — вывод не зависит от сегодняшнего дня. */
export const parsePlan = (text, opts = {}) => parseNotes(text, { ref: PLAN_REF, ...opts });
export { blockSum, monthIndex, defaultYear, inferYear };

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || resolve(here, 'plan.txt');
  const { blocks, warnings } = parsePlan(readFileSync(src, 'utf8'));
  const out = resolve(here, '../src/lib/plan2026.js');
  const data = stripBlocks(blocks);
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
