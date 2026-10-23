/**
 * «Коробки и фри» — блок под расходом ингредиентов. Чистая функция по позициям дня.
 * Все значения — порции (заказы), не штуки; подсчёты позиции суммируются (59+98).
 * Фри в Excel есть только в позиции «Фри» (B37/C37) — комбо с фри в таблице нет.
 */
import { itemTotal } from './calc.js';

export const FRI_KG = 0.143; // вес одной коробки фри, кг

/** Порядок и подписи строго как в списке; gap — пустая строка-разделитель перед строкой. */
export function computeBoxes(counts = {}) {
  const c = (id) => itemTotal(counts?.[id]);
  const fri = c('fri');
  const kg = Math.round(fri * FRI_KG * 1000) / 1000;
  return [
    { key: 'friKg', label: 'Вес фри', value: kg, unit: 'kg' },
    { key: 'friBox', label: 'Коробка фри', value: fri, gap: true },
    { key: 'ketchup', label: 'Кетчуп', value: fri },
    { key: 'krB', label: 'КрБ', value: c('hot8') + c('mild8'), gap: true }, // крылья 8шт: острые + не острые
    { key: 'krM', label: 'Крм', value: c('hot4') + c('mild4') }, // крылья 4шт
    { key: 'stB', label: 'СтБ', value: c('st8') }, // стикенсы 8шт
    { key: 'stM', label: 'Стм', value: c('st4') }, // стикенсы 4шт
    { key: 'sgB', label: 'СгБ', value: c('sg8') }, // самсы говядина 8шт
    { key: 'sgM', label: 'Сгм', value: c('sg4') }, // самсы говядина 4шт
    { key: 'skB', label: 'СкБ', value: c('sk8') + c('kurSyr') }, // самсы курица 8шт + «Курица Сыр»
    { key: 'skM', label: 'Скм', value: c('sk4') }, // самсы курица 4шт
    { key: 'box', label: 'Коробка', value: c('special') + c('prime'), gap: true }, // SPECIAL + PRIME
  ];
}

const kgF = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
/** Без округления: 87 × 0,143 → «12,441 кг»; 0 → «0 кг». */
export const fmtKg = (v) => (Number(v) > 0 ? `${kgF.format(Number(v))} кг` : '0 кг');
