// «Импорт PDF» в «Расчёте кассы»: извлечение текста из PDF (как на телефоне — чистый JS) и распознавание
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { base64ToBytes, parseCMap, pdfLines } from '../src/lib/pdfText.js';
import { buildImport, calcCountsFromImport, matchProduct, norm, parseSalesLine, sizeOf } from '../src/lib/salesImport.js';

const pdf = (f) => new Uint8Array(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
const lab = (x) => (x ? `${x.group}|${x.label}` : null);

test('образец СТмах (Microsoft Print to PDF, Identity-H + ToUnicode): best ch 22, best bur 32', () => {
  const lines = pdfLines(pdf('stmax-sample.pdf'));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^best ch\s+22$/);
  assert.match(lines[1], /^best bur\s+32$/);
  const imp = buildImport(lines);
  assert.deepEqual(imp.calc.map((x) => [x.calcId, x.qty]), [['bc', 22], ['bb', 32]]);
  assert.deepEqual(calcCountsFromImport(imp), { bc: 22, bb: 32 });
  // тот же файл, прочитанный строкой base64 (как с expo-file-system)
  const b64 = readFileSync(new URL('./fixtures/stmax-sample.pdf', import.meta.url)).toString('base64');
  assert.deepEqual(pdfLines(base64ToBytes(b64)), lines);
});

test('кириллический отчёт (Chrome/Skia: слова кусками, кернинг) — строки целиком, сверху вниз', () => {
  const lines = pdfLines(pdf('report-ru.pdf'));
  assert.equal(lines[0], 'Отчёт о продажах');
  assert.ok(lines.includes('Best Burger 12 350 4200'));
  assert.ok(lines.includes('Fuze Tea Mango 0,5 1 110 110'));
  const imp = buildImport(lines);
  const q = (arr) => Object.fromEntries(arr.map((x) => [x.label, x.qty]));
  assert.deepEqual(q(imp.calc), { 'best burger': 12, 'best cheese': 7, Фри: 15 });
  assert.deepEqual(q(imp.drinks), {
    'Кола 1л': 5,
    'Кола Зеро 0,5': 3,
    'Фанта 0,5': 4,
    'Спрайт 1л': 2,
    'Фьюсти персик 0,5': 6,
    'Фьюсти манго 0,5': 1,
    'Пико апельсин 0,5': 2,
    'Бон аква 0,5': 8,
  });
  assert.deepEqual(q(imp.coffee), { 'Латте 350мл': 3, 'Капучино 350мл': 2 });
  assert.deepEqual(imp.unknown, [{ name: 'Пакет', qty: 9 }]); // «Итого», шапка и дата пропущены
  assert.equal(calcCountsFromImport(imp).beans, 5);
});

test('LibreOffice (простой шрифт WinAnsi + ToUnicode), «x2 = 180»', () => {
  const imp = buildImport(pdfLines(pdf('report-lo.pdf')));
  assert.deepEqual(imp.calc.map((x) => [x.calcId, x.qty]), [['kpOm', 4], ['special', 2], ['coffee', 3]]);
  assert.deepEqual(imp.drinks.map((x) => [x.label, x.qty]), [['Спрайт 0,5', 2]]);
});

test('не PDF и PDF без текста — понятная ошибка', () => {
  assert.throws(() => pdfLines(new TextEncoder().encode('hello world')), /не PDF/);
  const empty = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Type /Page /Contents 2 0 R >> endobj\n2 0 obj << /Length 10 >> stream\nq 1 0 0 1 0 0 cm Q\nendstream endobj\n%%EOF');
  assert.throws(() => pdfLines(empty), /нет текста/);
});

test('ToUnicode: bfchar и bfrange (в т. ч. массив)', () => {
  const cm = parseCMap('1 begincodespacerange <0000> <FFFF> endcodespacerange 1 beginbfchar <0003> <0020> endbfchar 2 beginbfrange <0010> <0012> <0430> <0020> <0021> [<0041> <0042>] endbfrange');
  assert.equal(cm.codeLen, 2);
  assert.equal(cm.map.get(3), ' ');
  assert.equal(cm.map.get(0x12), 'в');
  assert.equal(cm.map.get(0x21), 'B');
});

test('строки отчёта: количество, цена, сумма; заголовки и даты — мимо', () => {
  assert.deepEqual(parseSalesLine('best ch                      22'), { name: 'best ch', qty: 22, raw: 'best ch 22' });
  assert.equal(parseSalesLine('Латте 350мл 3 220 660').qty, 3);
  assert.equal(parseSalesLine('Латте 350мл 3 220 660').name, 'Латте 350мл');
  assert.equal(parseSalesLine('Кола 1 л 5').name, 'Кола 1 л');
  assert.equal(parseSalesLine('Бон аква 0,5 3 60 180').name, 'Бон аква 0,5');
  assert.equal(parseSalesLine('Бон аква 0,5 3 60 180').qty, 3);
  assert.equal(parseSalesLine('Спрайт 0,5л x2 = 180').qty, 2);
  assert.equal(parseSalesLine('Фри 15 шт').qty, 15);
  assert.deepEqual(parseSalesLine('Самсы Гов 4шт 10 300 3000'), { name: 'Самсы Гов 4шт', qty: 10, raw: 'Самсы Гов 4шт 10 300 3000' });
  assert.equal(parseSalesLine('Фри 3,000 120,00 360,00').qty, 3);
  assert.equal(parseSalesLine('Фри 120 3 360', { priceFirst: true }).qty, 3);
  for (const l of ['Итого 79 13005', 'ИТОГО: 79', 'Наименование Кол-во Сумма', '15.11.2026 09:00', 'Смена 128', 'Всего продаж 120', '12345']) {
    assert.equal(parseSalesLine(l), null, l);
  }
});

test('объём: 1л / 1 л / 1L / 1.0 / 0,5 / 0.5L / 500мл', () => {
  for (const s of ['кола 1л', 'кола 1 л', 'cola 1l', 'cola 1.0', 'кола 1,0 л']) assert.equal(sizeOf(norm(s)).size, 1, s);
  for (const s of ['кола 0,5', 'cola 0.5l', 'кола 0,5л', 'кола 500мл', 'cola 500 ml', 'кола .5']) assert.equal(sizeOf(norm(s)).size, 0.5, s);
  assert.equal(sizeOf(norm('кола')).size, null);
});

test('напитки: RU/EN, регистр, двойники латиница/кириллица', () => {
  const cases = {
    'COCA-COLA 1L': 'drink|Кола 1л',
    'Кока-Кола 0,5': 'drink|Кола 0,5',
    'Coca Cola Zero 0.5': 'drink|Кола Зеро 0,5',
    'кола зеро 1л': 'drink|Кола Зеро 1л',
    'FANTA 0,5Л': 'drink|Фанта 0,5',
    'Фанта 1 л': 'drink|Фанта 1л',
    'Sprite 0.5': 'drink|Спрайт 0,5',
    'спрайт': 'drink|Спрайт (объём?)',
    'Fuse Tea клубника 0,5': 'drink|Фьюсти клубника 0,5',
    'FUZE TEA Strawberry': 'drink|Фьюсти клубника 0,5',
    'Фьюз ти ромашка': 'drink|Фьюсти ромашка 0,5',
    'Fuse tea chamomile 0.5': 'drink|Фьюсти ромашка 0,5',
    'фьюсти персик': 'drink|Фьюсти персик 0,5',
    'Pulpy Orange 0,5': 'drink|Пико апельсин 0,5',
    'Пико виноград': 'drink|Пико виноград 0,5',
    'Piko grape': 'drink|Пико виноград 0,5',
    'BonAqua 0.5': 'drink|Бон аква 0,5',
    'Бон Аква': 'drink|Бон аква 0,5',
    'Кoлa 1л': 'drink|Кола 1л', // латинские «o», «a» внутри русского слова
  };
  for (const [k, v] of Object.entries(cases)) assert.equal(lab(matchProduct(k)), v, k);
});

test('зерновой кофе: всё, что кончается на 350мл / 350ml, синонимы RU/EN складываются', () => {
  const cases = {
    'Латте 350мл': 'coffee|Латте 350мл',
    'LATTE 350ML': 'coffee|Латте 350мл',
    'Cappuccino 350 ml': 'coffee|Капучино 350мл',
    'Американо 350мл': 'coffee|Американо 350мл',
    'Raf vanilla 350ml': 'coffee|Раф 350мл',
    'Флэт уайт 350мл': 'coffee|Флэт уайт 350мл',
    'Ореховый 350мл': 'coffee|Ореховый 350мл',
  };
  for (const [k, v] of Object.entries(cases)) assert.equal(lab(matchProduct(k)), v, k);
  const imp = buildImport(['Латте 350мл 2', 'Latte 350ml 1', 'Капучино 350мл 4']);
  assert.deepEqual(imp.coffee.map((x) => [x.label, x.qty]), [['Латте 350мл', 3], ['Капучино 350мл', 4]]);
  assert.deepEqual(calcCountsFromImport(imp), { beans: 7 });
});

test('позиции кассы: точные, усечённые, транслит, опечатка; короткие — только точно', () => {
  const id = (s) => (matchProduct(s) || {}).calcId || null;
  assert.equal(id('best ch'), 'bc');
  assert.equal(id('BEST BUR'), 'bb');
  assert.equal(id('Бест бургер'), 'bb');
  assert.equal(id('Best Cheese'), 'bc');
  assert.equal(id('Биг Говядина'), 'bigG');
  assert.equal(id('биг гов'), 'bigG');
  assert.equal(id('Криспи'), 'crispy');
  assert.equal(id('Крипси'), null); // 2 перестановки на коротком слове — не угадываем
  assert.equal(id('Чизмак'), 'cheesemax');
  assert.equal(id('Самсы Гов 4шт'), 'sg4');
  assert.equal(id('Стикенсы 8шт'), 'st8');
  assert.equal(id('Хот Дог сырный'), 'hdCheese');
  assert.equal(id('КП ОМ'), 'kpOm');
  assert.equal(id('КП'), 'kp');
  assert.equal(id('КС'), 'ks');
  assert.equal(id('Пакет'), null);
  assert.equal(id('Соус сырный'), 'sc_cheese'); // соусы теперь пишутся в «Расход»
});

test('соусы С Ч Б К: RU/EN, со словом «соус» и без; «Cheeseburger» и «Хот Дог сырный» — не соус', () => {
  const id = (s) => (matchProduct(s) || {}).calcId || null;
  for (const s of ['Сырный', 'Соус сырный', 'Сырный соус 25г', 'Cheese sauce', 'СОУС СЫР']) assert.equal(id(s), 'sc_cheese', s);
  for (const s of ['Чесночный', 'Соус чесночный', 'Чесноч.', 'Garlic sauce']) assert.equal(id(s), 'sc_garlic', s);
  for (const s of ['Барбекю', 'Барбекью', 'Соус барбекю', 'BBQ', 'BBQ sauce']) assert.equal(id(s), 'sc_bbq', s);
  for (const s of ['Кетчуп', 'Соус кетчуп', 'Ketchup', 'кетчап']) assert.equal(id(s), 'sc_ketchup', s);
  assert.equal(id('Хот Дог сырный'), 'hdCheese');
  assert.notEqual(id('Cheeseburger'), 'sc_cheese');
  const imp = buildImport(['Кетчуп 3', 'Сырный 5', 'Соус сырный 2', 'BBQ 1', 'Чесночный 4']);
  assert.deepEqual(imp.sauces.map((x) => [x.label, x.qty]), [['Кетчуп', 3], ['Сырный', 7], ['Барбекю', 1], ['Чесночный', 4]]);
  assert.deepEqual(calcCountsFromImport(imp), { sc_ketchup: 3, sc_cheese: 7, sc_bbq: 1, sc_garlic: 4 });
});

test('напитки → строки расчёта; без объёма/вкуса — в «Не распознано»', () => {
  const id = (s) => (matchProduct(s) || {}).calcId || null;
  const cases = {
    'Кока-кола 1л': 'dr_cola1', 'Coca-Cola 0,5': 'dr_cola05', 'Кола зеро 1л': 'dr_zero1', 'Coca Cola Zero 0.5': 'dr_zero05',
    'Фанта 1л': 'dr_fanta1', 'Fanta 0.5L': 'dr_fanta05', 'Спрайт 1 л': 'dr_sprite1', 'Sprite 500мл': 'dr_sprite05',
    'Фьюс клубника': 'dr_fuseStr', 'Fuse tea peach': 'dr_fusePeach', 'Фьюсти манго': 'dr_fuseMango', 'Фьюс ромашка': 'dr_fuseCham',
    'Пико апельсин': 'dr_pikoOr', 'Pulpy grape': 'dr_pikoGr', 'Бонаква 0,5': 'dr_bonaqua',
  };
  for (const [k, v] of Object.entries(cases)) assert.equal(id(k), v, k);
  const imp = buildImport(['Кола 1л 2', 'Coca-Cola 1L 3', 'Фанта 4', 'Спрайт 0,5 1']);
  assert.deepEqual(imp.drinks.map((x) => [x.calcId, x.qty]), [['dr_cola1', 5], ['dr_sprite05', 1]]);
  assert.deepEqual(imp.unknown.map((x) => x.name), ['Фанта']);
  assert.deepEqual(calcCountsFromImport(imp), { dr_cola1: 5, dr_sprite05: 1 });
});

test('кофе и стаканы: «Кофе» — касса, «350» в названии — зерновой, «Стаканы одноразовые» — своя строка', () => {
  const id = (s) => (matchProduct(s) || {}).calcId || null;
  assert.equal(id('Кофе'), 'coffee');
  assert.equal(id('Латте 350мл'), 'beans');
  assert.equal(id('Американо 350'), 'beans');
  assert.equal(id('Капучино 350 мл'), 'beans');
  assert.equal(id('Стаканы одноразовые'), 'cupsDisp');
  assert.equal(id('Одноразовый стакан'), 'cupsDisp');
  const imp = buildImport(['Кофе 6', 'Американо 350 2', 'Латте 350мл 1', 'Стаканы одноразовые 10']);
  assert.deepEqual(calcCountsFromImport(imp), { coffee: 6, cupsDisp: 10, beans: 3 });
  // голое 350 в названии не путается с количеством/ценой
  assert.deepEqual(parseSalesLine('Американо 350 2 180 360'), { name: 'Американо 350', qty: 2, raw: 'Американо 350 2 180 360' });
  assert.equal(parseSalesLine('Бургер 350 2 700', { priceFirst: true }).qty, 2); // 350 здесь цена
});
