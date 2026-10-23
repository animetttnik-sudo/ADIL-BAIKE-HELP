// node --test — «промежутка»: дробный сотрудник в делёжке выработки смены
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeCalc,
  ownPay,
  gapWeight,
  DEFAULT_RATES,
} from "../src/lib/calc.js";
import { calcPayForDay } from "../src/lib/link.js";

const r2 = (x) => Math.round(x * 100) / 100;
const R = DEFAULT_RATES;
const seven = { bb: [7] }; // 7 позиций → выработка 70

test("доли: ночь 4,5 из 12, день 2,5 из 12; правка часов в ставках", () => {
  assert.equal(gapWeight(R, "night"), 0.375);
  assert.equal(r2(gapWeight(R, "day")), 0.21);
  assert.equal(gapWeight({ ...R, gapNightH: 6 }, "night"), 0.5);
  assert.equal(gapWeight({ ...R, gapDayH: 20 }, "day"), 1); // не больше целого сотрудника
  assert.equal(gapWeight({}, "night"), 0.375); // старые ставки без новых полей
});

test("23 окт, ночь, кассир, 2 сотрудника, 7 позиций", () => {
  const me = { role: "kass", time: "night" };
  const off = computeCalc(seven, R, 2);
  const on = computeCalc(seven, R, 2, true);
  assert.equal(off.gap, null);
  assert.equal(ownPay(off, R, me), 1175); // 400 + 400 + 35 + 140 + 200
  assert.equal(r2(ownPay(on, R, me)), 1169.47); // 70 / 2,375 = 29,47
  assert.equal(r2(on.gap.night.loss), 5.53); // у меня меньше
  assert.equal(r2(on.gap.night.take), 11.05); // всего забирает из выработки смены
  assert.equal(r2(on.gap.night.take), r2(on.gap.night.loss * 2)); // поровну с каждого из двух
  assert.equal(
    calcPayForDay({ counts: seven, staff: 2, ...me, gap: true }, R),
    1169,
  ); // в «Смены» уходит округлённая
  assert.equal(calcPayForDay({ counts: seven, staff: 2, ...me }, R), 1175); // старые дни без поля gap
});

test("день: рядовой и кассир теряют одинаково (премии кассира не делятся)", () => {
  const on = computeCalc({ bb: [300] }, R, 3, true); // выработка 3000, день 3 + 0,2083
  const off = computeCalc({ bb: [300] }, R, 3);
  assert.equal(r2(on.gap.day.share), 935.06); // 3000 / 3,2083
  assert.equal(r2(on.gap.day.loss), 64.94);
  assert.equal(r2(on.gap.day.take), 194.81);
  for (const role of ["ryad", "kass"]) {
    const d = { role, time: "day" };
    assert.equal(r2(ownPay(off, R, d) - ownPay(on, R, d)), 64.94);
  }
  assert.equal(r2(ownPay(on, R, { role: "ryad", time: "day" })), 1375.06);
  assert.equal(r2(ownPay(on, R, { role: "kass", time: "day" })), 2175.06);
});

test("ночь 3 сотрудника + наставник и остановки — доплаты не делятся", () => {
  const on = computeCalc({ bb: [300] }, R, 3, true); // 3000 / 3,375 = 888,89
  const me = { role: "ryad", time: "night", mentor: true, stops: true };
  assert.equal(r2(ownPay(on, R, me)), r2(888.89 + 140 + 200 + 300 + 150));
  assert.equal(r2(on.gap.night.loss), 111.11);
  assert.equal(r2(on.gap.night.take), 333.33);
});

test("нет позиций — промежутка ничего не забирает", () => {
  const on = computeCalc({}, R, 3, true);
  assert.equal(on.gap.night.take, 0);
  assert.equal(on.pay.kassNight, 400 + 400 + 140 + 200);
});
