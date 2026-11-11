/**
 * Настоящее преломление для капли дока (Skia, входит в Expo Go SDK 58 — без нативной сборки).
 *
 * Как работает: при касании дока снимаем экран (makeImageFromView корневого View) в SkImage,
 * а внутри капли рисуем Skia-холст с SkSL-шейдером, который читает этот снимок со смещением:
 * в центре — увеличение, у кромки — сильный изгиб (контент снаружи «затягивается» и
 * переворачивается в толстой полосе преломления), по каналам R/G/B — разное смещение
 * (дисперсия), у самой кромки — лёгкое осветление. Форма — SDF капсулы того же размера, что капля.
 * Геометрия капли приходит из shared values Reanimated (uniforms считаются на UI-потоке).
 *
 * Выключить: REAL_GLASS_REFRACTION = false — останется прежняя приближённая линза.
 * Если Skia недоступна или шейдер не собрался / упал — компонент ничего не рисует (тот же откат).
 */
import React from 'react';
import { Dimensions } from 'react-native';
import { makeMutable, useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export const REAL_GLASS_REFRACTION = true;

/**
 * Диагностика для строки в Настройках: что именно не работает на устройстве.
 * Заполняется по ходу (импорт Skia, сборка шейдера, каждый снимок, монтирование холста, ошибки).
 */
export const GLASS_DIAG = {
  skia: false,
  skiaErr: '',
  effect: false,
  effectErr: '',
  snaps: 0,
  snapFails: 0,
  last: '—',
  lastAt: 0,
  canvas: '—',
  canvasErr: '',
  ready: null, // () => число 0…1 (shared value плавного появления)
  idle: '—',
  bind: '—', // связка Skia ↔ Reanimated (живые uniforms на UI-потоке)
  geo: '—', // uniforms при последнем подъёме капли
  ticks: 0, // сколько раз uniforms пересчитались на UI-потоке за последнее удержание
};
/** Отладочная подсветка холста (двойной тап по строке диагностики). */
export const GLASS_TINT = makeMutable(0);
const errText = (e) => String((e && (e.message || e)) || 'ошибка').slice(0, 120);

let SK = null;
try {
  SK = require('@shopify/react-native-skia');
  GLASS_DIAG.skia = !!(SK && SK.Skia && SK.makeImageFromView);
  if (!GLASS_DIAG.skia) GLASS_DIAG.skiaErr = 'нет Skia/makeImageFromView';
} catch (e) {
  SK = null;
  GLASS_DIAG.skiaErr = errText(e);
}

const SKSL = `
uniform shader image;
uniform float2 uCanvas;
uniform float2 uSize;
uniform float2 uCenter;
uniform float2 uOrigin;
uniform float2 uImg;
uniform float uScale;
uniform float4 uBar;
uniform float uDebug;

float sdCap(float2 p, float2 b) {
  float r = min(b.x, b.y);
  float2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

half4 sampleAt(float2 screenPt) {
  // точки экрана → пиксели снимка (снимок в пикселях экрана, ×uScale); вне снимка — прозрачно
  float2 px = (screenPt - uOrigin) * uScale;
  if (px.x < 0.0 || px.y < 0.0 || px.x > uImg.x || px.y > uImg.y) { return half4(0.0); }
  return image.eval(px);
}

// блюр только у кромки (br=0 — одна выборка, центр остаётся резким)
half4 sampleBlur(float2 screenPt, float br) {
  half4 s0 = sampleAt(screenPt);
  if (br < 0.4) { return s0; }
  float2 o1 = float2(br, 0.0);
  float2 o2 = float2(0.0, br);
  float2 o3 = float2(br, br) * 0.70710678;
  half4 acc = s0 * 4.0;
  acc += sampleAt(screenPt + o1) + sampleAt(screenPt - o1);
  acc += sampleAt(screenPt + o2) + sampleAt(screenPt - o2);
  acc += sampleAt(screenPt + o3) + sampleAt(screenPt - o3);
  acc += sampleAt(screenPt + float2(o3.x, -o3.y)) + sampleAt(screenPt + float2(-o3.x, o3.y));
  return acc / 12.0;
}

half4 main(float2 xy) {
  if (uDebug > 0.5 && (xy.x < 1.5 || xy.y < 1.5 || xy.x > uCanvas.x - 1.5 || xy.y > uCanvas.y - 1.5)) {
    return half4(0.85, 0.0, 0.0, 0.85); // отладка: границы холста
  }
  float2 p = xy - uCanvas * 0.5; // центр холста = центр капли
  float2 hb = uSize * 0.5;
  float dEdge = sdCap(p, hb);
  float edge = 1.0 - smoothstep(-1.5, 0.0, dEdge); // видимый край — по форме капли
  if (edge <= 0.0) { return half4(0.0); }
  // снимок и искажение считаем по капсуле чуть внутри кромки
  float2 hbS = max(hb - 4.0, float2(1.0));
  float d = sdCap(p, hbS);
  float band0 = clamp(hbS.y * 0.9, 10.0, 30.0); // прежняя ширина полосы (сила изгиба)
  float band = band0 * 0.25; // зона искажения — 25 % прежней
  float k = clamp(1.0 + d / band, 0.0, 1.0); // 0 — середина, 1 — кромка
  float e = 0.75;
  float2 g = float2(sdCap(p + float2(e, 0.0), hbS) - sdCap(p - float2(e, 0.0), hbS),
                    sdCap(p + float2(0.0, e), hbS) - sdCap(p - float2(0.0, e), hbS));
  float2 n = g / max(length(g), 0.0001);
  float2 c = uCenter + p / 1.3; // увеличение 1.3× в середине (сила как была)
  float bend = k * k * band0 * 1.7; // сила изгиба прежняя, полоса уже
  float br = k * k * 3.0; // blur-глитч: блюр только у ободка вместе с RGB-бахромой; центр резкий
  half4 cr = sampleBlur(c + n * bend * 0.9, br);
  half4 cg = sampleBlur(c + n * bend, br);
  half4 cb = sampleBlur(c + n * bend * 1.12, br);
  float sa = max(max(cr.a, cg.a), cb.a); // premultiplied
  half3 col = half3(cr.r, cg.g, cb.b);
  // середина: над/под панелью — увеличенный снимок; внутри самой панели — прозрачно
  // (там живые подписи с их собственной линзой, без двойного текста и «призраков» старой плашки)
  float2 bq = abs(c - (uBar.xy + uBar.zw * 0.5)) - uBar.zw * 0.5;
  float outBar = smoothstep(-1.0, 3.0, max(bq.x, bq.y));
  float a = max(outBar, smoothstep(0.2, 0.6, k)) * edge;
  if (uDebug > 0.5) {
    col = mix(col, half3(sa, 0.0, 0.0), 0.4); // отладка: область выборки — красным
    a = max(a, 0.6 * edge);
  }
  return half4(col * a, sa * a);
}
`;

let EFFECT = null;
if (SK && REAL_GLASS_REFRACTION) {
  try {
    EFFECT = SK.Skia.RuntimeEffect.Make(SKSL);
    if (!EFFECT) GLASS_DIAG.effectErr = 'RuntimeEffect.Make вернул null';
  } catch (e) {
    EFFECT = null;
    GLASS_DIAG.effectErr = errText(e);
  }
}
GLASS_DIAG.effect = !!EFFECT;
// без этой связки Skia молча рисует статичный холст: uniforms читаются один раз при монтировании
const LIVE = !!(SK && SK.HAS_REANIMATED_4);
GLASS_DIAG.bind = SK ? (LIVE ? 'живые' : 'нет (JS-режим)') : '—';

/** Можно ли рисовать настоящее преломление на этом устройстве. */
export const glassLensAvailable = !!(SK && EFFECT && REAL_GLASS_REFRACTION);

/**
 * Снимок View: { image, ox, oy, w, h } (положение и размер View в точках окна) или null. Никогда не бросает.
 * Положение меряем вместе со снимком, чтобы не зависеть от статус-бара / safe area.
 */
export async function snapshotView(ref) {
  if (!glassLensAvailable || !ref || !ref.current) return null;
  try {
    const box = await new Promise((res) => {
      try {
        ref.current.measureInWindow((x, y, w, h) => res({ ox: x || 0, oy: y || 0, w, h }));
      } catch {
        res(null);
      }
    });
    const image = await SK.makeImageFromView(ref);
    GLASS_DIAG.lastAt = Date.now();
    if (!image) {
      GLASS_DIAG.snapFails += 1;
      GLASS_DIAG.last = 'null';
      return null;
    }
    const win = Dimensions.get('window');
    const w = box && box.w > 0 ? box.w : win.width;
    const h = box && box.h > 0 ? box.h : win.height;
    GLASS_DIAG.snaps += 1;
    GLASS_DIAG.last = `ok ${image.width()}×${image.height()} @${Math.round(w)}×${Math.round(h)}`;
    return { image, ox: box ? box.ox : 0, oy: box ? box.oy : 0, w, h };
  } catch (e) {
    GLASS_DIAG.snapFails += 1;
    GLASS_DIAG.lastAt = Date.now();
    GLASS_DIAG.last = 'ошибка: ' + errText(e);
    return null;
  }
}

class Guard extends React.Component {
  constructor(p) {
    super(p);
    this.state = { bad: false };
  }
  static getDerivedStateFromError() {
    return { bad: true };
  }
  componentDidCatch(e) {
    GLASS_DIAG.canvasErr = errText(e);
    GLASS_DIAG.canvas = 'упал';
  }
  render() {
    return this.state.bad ? null : this.props.children;
  }
}

/**
 * Холст преломления. uniforms — shared value (считается в SegmentCapsule на UI-потоке):
 * { uCanvas, uSize, uCenter, uOrigin, uImg, uScale, uBar, uDebug } в точках экрана (uScale — пикс./пт снимка).
 * Центр холста (cw × ch) совпадает с центром капли. Видимость/появление — прозрачностью родителя.
 * Если связка Skia ↔ Reanimated недоступна — uniforms передаются из JS (реакция → setState).
 */
function LensCanvas({ snap, cw, ch, uniforms }) {
  const { image } = snap;
  const iw = image.width();
  const ih = image.height();
  const [jsU, setJsU] = React.useState(() => uniforms.value);
  useAnimatedReaction(
    () => uniforms.value,
    (u) => {
      if (!LIVE) scheduleOnRN(setJsU, u);
    }
  );
  React.useEffect(() => {
    GLASS_DIAG.canvas = `да ${cw}×${ch}`;
  }, [cw, ch]);
  const { Canvas, Fill, Shader, ImageShader } = SK;
  return (
    <Canvas style={{ width: cw, height: ch }} pointerEvents="none">
      <Fill>
        <Shader source={EFFECT} uniforms={LIVE ? uniforms : jsU}>
          <ImageShader image={image} fit="none" x={0} y={0} width={iw} height={ih} tx="decal" ty="decal" />
        </Shader>
      </Fill>
    </Canvas>
  );
}

export function GlassLens(props) {
  if (!glassLensAvailable || !props.snap || !props.snap.image || !props.uniforms || props.cw <= 0 || props.ch <= 0) return null;
  return (
    <Guard>
      <LensCanvas {...props} />
    </Guard>
  );
}
