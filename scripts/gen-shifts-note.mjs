// Встраивает заметку «Смены» (scripts/shifts.txt) в приложение как текст — для кнопки «Мои смены».
//   node scripts/gen-shifts-note.mjs [путь к shifts.txt] [--check]
// --check: только проверить, что src/lib/shiftsNote.js совпадает с заметкой (exit 1, если нет).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = process.argv.find((a, i) => i > 1 && !a.startsWith('--')) || resolve(here, 'shifts.txt');
const out = resolve(here, '../src/lib/shiftsNote.js');
const text = readFileSync(src, 'utf8');
const body =
  `// СГЕНЕРИРОВАНО scripts/gen-shifts-note.mjs из заметки «Смены» (shifts.txt). Не править руками.\n` +
  `export const SHIFTS_NOTE_REF = '2026-10-23'; // когда прислана (год для «Зп 11 декабрь»)\n` +
  `export const SHIFTS_NOTE = ${JSON.stringify(text)};\n`;
if (process.argv.includes('--check')) {
  let cur = '';
  try {
    cur = readFileSync(out, 'utf8');
  } catch {}
  if (cur !== body) {
    console.error('src/lib/shiftsNote.js устарел — запустите node scripts/gen-shifts-note.mjs');
    process.exit(1);
  }
  console.log('shiftsNote.js актуален');
} else {
  writeFileSync(out, body);
  console.log(`записано ${out} (${text.length} символов)`);
}
