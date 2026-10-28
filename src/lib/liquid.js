/**
 * Геометрия «жидкой» плашки дока (чистая функция-ворклет: UI-поток Reanimated).
 *  liquid 0…1 — палец держит/ведёт по доку; pos — дробная позиция; vel — скорость (сегментов/с).
 *  Покой (liquid 0, pos целый): 1 × 1. Удержание: ×1.12. Движение: тянется по ходу (до +35 %),
 *  сплющивается по высоте (сохраняя «объём»); перелёт пружины даёт тот же эффект при отпускании.
 */
export function liquidShape(liquid, pos, vel) {
  'worklet';
  const l = Math.max(0, Math.min(1.2, liquid));
  const frac = Math.abs(pos - Math.round(pos)); // 0 — на вкладке, 0.5 — посередине
  // скорость действует только вне вкладки: на месте (pos целый) плашка всегда в покое
  const speed = Math.min(1, Math.abs(vel) / 6) * Math.min(1, frac * 8);
  const stretch = Math.min(0.35, frac * 0.45 + speed * 0.22);
  const grow = 1 + 0.12 * l;
  return { sx: grow * (1 + stretch), sy: grow * (1 - stretch * 0.4), lens: 1 + 0.16 * l };
}
