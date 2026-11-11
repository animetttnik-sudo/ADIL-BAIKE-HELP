/**
 * Фирменные иконки: тёмная стеклянная плитка / зелёная активная #35DE7C / голый глиф.
 * Стекло — плавный градиент без поперечной полосы. shape: 'rounded' | 'circle'.
 * Глиф всегда по центру плитки (flexbox на всю плитку + сдвиг path в viewBox 24×24).
 * Только react-native-svg (уже в Expo Go SDK 58) — без новых нативных модулей.
 */
import { memo, useId } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { GLYPHS, LAYERS, RULES, SET, SHIFT, STROKES } from './icon-paths';

export const ICON_GREEN = '#35DE7C';
export const ICON_SET = SET;

const RADIUS = 0.223;

function Glyph({ name, size, color }) {
  const stroke = STROKES[name];
  const [dx, dy] = SHIFT[name] || [0, 0];
  const move = dx || dy ? `translate(${dx} ${dy})` : undefined;
  let body = null;
  if (stroke && stroke.circle) {
    body = (
      <Circle
        cx={stroke.circle.cx}
        cy={stroke.circle.cy}
        r={stroke.circle.r}
        fill="none"
        stroke={color}
        strokeWidth={stroke.width}
      />
    );
  } else if (stroke) {
    body = (
      <Path
        d={stroke.d}
        fill="none"
        stroke={color}
        strokeWidth={stroke.width}
        strokeLinecap={stroke.linecap || 'round'}
        strokeLinejoin={stroke.linejoin || 'round'}
      />
    );
  } else {
    const layers = LAYERS[name] || [name];
    body = layers.map((id) => {
      const d = GLYPHS[id];
      if (!d) return null;
      return <Path key={id} d={d} fill={color} fillRule={RULES[id] || 'nonzero'} />;
    });
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {move ? <G transform={move}>{body}</G> : body}
    </Svg>
  );
}

/**
 * @param {object} props
 * @param {string} [props.name]
 * @param {number} [props.size=32]
 * @param {'tile'|'tileOn'|'glyph'} [props.variant='tile']
 * @param {'rounded'|'circle'} [props.shape='rounded']
 * @param {string} [props.color]
 * @param {number|'100%'} [props.width] — ширина плитки (для полной полосы печати); высота остаётся size, глиф по центру
 */
export const AppIcon = memo(function AppIcon({ name, size = 32, variant = 'tile', shape = 'rounded', color, style, width }) {
  const glyphColor = color || '#FFFFFF';
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gid = `gl${rawId}`;
  const boxW = width == null ? size : width;
  const wide = width != null && width !== size;

  if (variant === 'glyph') {
    return (
      <View style={[{ width: boxW, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        {name ? <Glyph name={name} size={size} color={glyphColor} /> : null}
      </View>
    );
  }

  const on = variant === 'tileOn';
  const r = shape === 'circle' ? size / 2 : Math.round(size * (wide ? 0.32 : RADIUS) * 10) / 10;
  const glyphSize = Math.round(size * 0.62);
  const svgW = typeof boxW === 'number' ? boxW : '100%';

  return (
    <View
      style={[
        { width: boxW, height: size, borderRadius: r },
        on ? styles.glowOn : styles.glowOff,
        style,
      ]}
    >
      <View
        style={[
          styles.tile,
          {
            borderRadius: r,
            backgroundColor: on ? ICON_GREEN : '#1C1C22',
            borderColor: on ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.18)',
          },
        ]}
      >
        <Svg pointerEvents="none" width={svgW} height={size} style={styles.fill} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={on ? 0.28 : 0.16} />
              <Stop offset="0.42" stopColor="#ffffff" stopOpacity={0.04} />
              <Stop offset="1" stopColor="#000000" stopOpacity={on ? 0.1 : 0.2} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={svgW} height={size} rx={r} ry={r} fill={`url(#${gid})`} />
        </Svg>
      </View>
      {name ? (
        <View pointerEvents="none" style={styles.glyphSlot}>
          <Glyph name={name} size={glyphSize} color={glyphColor} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  glyphSlot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowOff: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.45,
      shadowRadius: 4,
    },
    android: { elevation: 3 },
    default: {},
  }),
  glowOn: Platform.select({
    ios: {
      shadowColor: ICON_GREEN,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.7,
      shadowRadius: 8,
    },
    android: { elevation: 6 },
    default: {},
  }),
});

export { GLYPHS, LAYERS, RULES, SHIFT, STROKES };
