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
import { useDerivedValue } from 'react-native-reanimated';

export const REAL_GLASS_REFRACTION = true;

let SK = null;
try {
  // eslint-disable-next-line global-require
  SK = require('@shopify/react-native-skia');
} catch {
  SK = null;
}

const SKSL = `
uniform shader image;
uniform float2 uCanvas;
uniform float2 uSize;
uniform float2 uCenter;
uniform float2 uOrigin;
uniform float2 uImg;
uniform float uScale;
uniform float uOn;
uniform float uReady;

float sdCap(float2 p, float2 b) {
  float r = min(b.x, b.y);
  float2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

half4 sampleAt(float2 screenPt) {
  // точки экрана → пиксели снимка панели; вне снимка — прозрачно (там видно живой экран)
  float2 px = (screenPt - uOrigin) * uScale;
  if (px.x < 0.0 || px.y < 0.0 || px.x > uImg.x || px.y > uImg.y) { return half4(0.0); }
  return image.eval(px);
}

half4 main(float2 xy) {
  float2 p = xy - uCanvas * 0.5;
  float2 hb = uSize * 0.5;
  float d = sdCap(p, hb);
  // мягкий сглаженный край ровно по форме капли (1.5 пт)
  float edge = 1.0 - smoothstep(-1.5, 0.0, d);
  if (edge <= 0.0) { return half4(0.0); }
  float band = clamp(hb.y * 0.8, 10.0, 28.0); // широкая полоса преломления — эффект виден
  float k = clamp(1.0 + d / band, 0.0, 1.0); // 0 — внутри, 1 — у кромки
  float e = 0.75;
  float2 g = float2(sdCap(p + float2(e, 0.0), hb) - sdCap(p - float2(e, 0.0), hb),
                    sdCap(p + float2(0.0, e), hb) - sdCap(p - float2(0.0, e), hb));
  float2 n = g / max(length(g), 0.0001);
  float2 base = p / (1.0 + 0.25 * uOn); // увеличение ~1.25×
  float bend = k * k * band * 1.9 * uOn;
  float2 c = uCenter + base;
  half4 cr = sampleAt(c + n * bend * 0.84);
  half4 cg = sampleAt(c + n * bend);
  half4 cb = sampleAt(c + n * bend * 1.2);
  float sa = max(max(cr.a, cg.a), cb.a); // цвета снимка — premultiplied
  half3 col = half3(cr.r, cg.g, cb.b) + half3(k * k * k * 0.12 * uOn * sa);
  // середина прозрачная (видно живой экран и подписи), преломление — только в полосе у кромки:
  // снимок неподвижен, поэтому в центре он дал бы «призраки» старой плашки при перетаскивании
  float a = smoothstep(0.0, 0.5, k) * edge * uReady * uOn;
  return half4(col * a, sa * a);
}
`;

let EFFECT = null;
if (SK && REAL_GLASS_REFRACTION) {
  try {
    EFFECT = SK.Skia.RuntimeEffect.Make(SKSL);
  } catch {
    EFFECT = null;
  }
}

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
    if (!image) return null;
    const win = Dimensions.get('window');
    const w = box && box.w > 0 ? box.w : win.width;
    const h = box && box.h > 0 ? box.h : win.height;
    return { image, ox: box ? box.ox : 0, oy: box ? box.oy : 0, w, h };
  } catch {
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
  componentDidCatch() {}
  render() {
    return this.state.bad ? null : this.props.children;
  }
}

/**
 * Холст преломления (snap — результат snapshotView, ready — shared value 0…1 для плавного появления).
 * Размер холста фиксированный (cw × ch, не меньше самой большой капли),
 * центр холста совпадает с центром капли. geo() — ворклет: { w, h, cx, cy, on } в точках экрана.
 */
function LensCanvas({ snap, cw, ch, geo, ready, style }) {
  const { image } = snap;
  const iw = image.width();
  const ih = image.height();
  const scale = iw / Math.max(1, snap.w);
  const ox0 = snap.ox;
  const oy0 = snap.oy;
  const uniforms = useDerivedValue(() => {
    const g = geo();
    // начало снимка — живое положение снятого View (если geo его даёт), иначе — замер при съёмке
    const ox = g.ox !== undefined ? g.ox : ox0;
    const oy = g.oy !== undefined ? g.oy : oy0;
    return {
      uCanvas: [cw, ch],
      uSize: [g.w, g.h],
      uCenter: [g.cx, g.cy],
      uOrigin: [ox, oy],
      uImg: [iw, ih],
      uScale: scale,
      uOn: g.on,
      uReady: ready.value,
    };
  });
  const { Canvas, Fill, Shader, ImageShader } = SK;
  return (
    <Canvas style={[{ width: cw, height: ch }, style]} pointerEvents="none">
      <Fill>
        <Shader source={EFFECT} uniforms={uniforms}>
          <ImageShader image={image} fit="none" x={0} y={0} width={iw} height={ih} tx="decal" ty="decal" />
        </Shader>
      </Fill>
    </Canvas>
  );
}

export function GlassLens(props) {
  if (!glassLensAvailable || !props.snap || !props.snap.image || !props.ready || props.cw <= 0 || props.ch <= 0) return null;
  return (
    <Guard>
      <LensCanvas {...props} />
    </Guard>
  );
}
