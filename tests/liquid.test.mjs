import test from 'node:test';
import assert from 'node:assert/strict';
import { liquidShape } from '../src/lib/liquid.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('покой: твёрдая плашка 1×1 без увеличения', () => {
  const s = liquidShape(0, 2, 0);
  close(s.sx, 1);
  close(s.sy, 1);
  close(s.lens, 1);
});

test('удержание: плашка растёт на 12 %, линза увеличивает', () => {
  const s = liquidShape(1, 1, 0);
  close(s.sx, 1.12);
  close(s.sy, 1.12);
  assert.ok(s.lens > 1.1 && s.lens < 1.2);
});

test('движение: тянется по ходу и сплющивается по высоте, ограничено', () => {
  const mid = liquidShape(1, 0.5, 0);
  assert.ok(mid.sx > 1.12 && mid.sy < 1.12);
  const fast = liquidShape(1, 0.5, 100);
  assert.ok(fast.sx >= mid.sx);
  assert.ok(fast.sx <= 1.12 * 1.35 + 1e-9);
  assert.ok(fast.sy > 0.9);
  // направление скорости не важно
  assert.deepEqual(liquidShape(1, 0.3, -4), liquidShape(1, 0.3, 4));
});

test('перелёт пружины (liquid чуть меньше 0 или больше 1) не ломает форму', () => {
  const a = liquidShape(-0.2, 1, 0);
  close(a.sx, 1);
  const b = liquidShape(1.5, 1, 0);
  assert.ok(b.sx <= 1 + 0.12 * 1.2 + 1e-9);
});

test('на вкладке старая скорость не оставляет плашку растянутой', () => {
  const s = liquidShape(0, 1, 9);
  close(s.sx, 1);
  close(s.sy, 1);
});
