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
uniform float uScale;
uniform float uOn;

float sdCap(float2 p, float2 b) {
  float r = min(b.x, b.y);
  float2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

half4 main(float2 xy) {
  float2 p = xy - uCanvas * 0.5;
  float2 hb = uSize * 0.5;
  float d = sdCap(p, hb);
  if (d > 1.0) { return half4(0.0); }
  float band = clamp(hb.y * 0.6, 8.0, 24.0);
  float k = clamp(1.0 + d / band, 0.0, 1.0);
  float e = 0.75;
  float2 g = float2(sdCap(p + float2(e, 0.0), hb) - sdCap(p - float2(e, 0.0), hb),
                    sdCap(p + float2(0.0, e), hb) - sdCap(p - float2(0.0, e), hb));
  float2 n = g / max(length(g), 0.0001);
  float mag = 1.0 + 0.2 * uOn;
  float2 base = p / mag;
  float bend = k * k * band * 1.9 * uOn;
  float2 c = uCenter + base;
  half4 cr = image.eval((c + n * bend * 0.88) * uScale);
  half4 cg = image.eval((c + n * bend) * uScale);
  half4 cb = image.eval((c + n * bend * 1.14) * uScale);
  half3 col = half3(cr.r, cg.g, cb.b);
  col += half3(k * k * k * 0.16 * uOn);
  float aa = clamp(0.5 - d, 0.0, 1.0);
  return half4(col * aa, aa);
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

/** Снимок корневого View (SkImage) или null. Никогда не бросает. */
export async function snapshotView(ref) {
  if (!glassLensAvailable || !ref || !ref.current) return null;
  try {
    return await SK.makeImageFromView(ref);
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
 * Холст преломления. Размер холста фиксированный (cw × ch, не меньше самой большой капли),
 * центр холста совпадает с центром капли. geo() — ворклет: { w, h, cx, cy, on } в точках экрана.
 */
function LensCanvas({ image, cw, ch, geo, style }) {
  const scale = image ? image.width() / Math.max(1, Dimensions.get('window').width) : 1;
  const uniforms = useDerivedValue(() => {
    const g = geo();
    return { uCanvas: [cw, ch], uSize: [g.w, g.h], uCenter: [g.cx, g.cy], uScale: scale, uOn: g.on };
  });
  const { Canvas, Fill, Shader, ImageShader } = SK;
  return (
    <Canvas style={[{ width: cw, height: ch }, style]} pointerEvents="none">
      <Fill>
        <Shader source={EFFECT} uniforms={uniforms}>
          <ImageShader image={image} fit="none" x={0} y={0} width={image.width()} height={image.height()} tx="decal" ty="decal" />
        </Shader>
      </Fill>
    </Canvas>
  );
}

export function GlassLens(props) {
  if (!glassLensAvailable || !props.image || props.cw <= 0 || props.ch <= 0) return null;
  return (
    <Guard>
      <LensCanvas {...props} />
    </Guard>
  );
}
