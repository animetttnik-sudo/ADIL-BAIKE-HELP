// Тестовый снимок прежнего стартового состояния (только для тестов, в приложение не попадает).
import { uid } from '../src/lib/periods.js';
export function defaultState() {
  return {
    settings: { mode: 'study', hue: 145, light: 54 },
    custom: { bg: null },
    // type 'recurring' — постоянный платёж (старые записи без rid — от прежней версии функции)
    expenses: [
      { id: uid(), date: '2026-09-04', amount: 1000, title: 'Адилет Аке', type: 'unexpected', status: 'paid' },
      { id: uid(), date: '2026-09-04', amount: 7000, title: 'апама карыз', type: 'unexpected', status: 'paid' },
      { id: uid(), date: '2026-09-07', amount: 1387, title: 'О!Банк', type: 'recurring', status: 'paid' },
      { id: uid(), date: '2026-09-12', amount: 540, title: 'Единица', type: 'unexpected', status: 'paid' },
      { id: uid(), date: '2026-09-13', amount: 1350, title: 'Вайфай', type: 'recurring', status: 'paid' },
      { id: uid(), date: '2026-09-15', amount: 5075, title: 'Мбанк', type: 'recurring', status: 'paid' },
      { id: uid(), date: '2026-09-18', amount: 6000, title: '', type: 'unexpected', status: null },
      { id: uid(), date: '2026-09-21', amount: 1000, title: 'Вб', type: 'unexpected', status: null },
      { id: uid(), date: '2026-09-21', amount: 1385, title: 'О!Банк', type: 'recurring', status: null },
      { id: uid(), date: '2026-09-26', amount: 5667, title: 'М+', type: 'recurring', status: null },
    ],
    shifts: ['2026-09-12', '2026-09-13', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-25'].map((d) => ({
      id: uid(), date: d, title: 'ночь касса', amount: null, payday: '2026-10-02',
    })),
    removed: [],
  };
}

