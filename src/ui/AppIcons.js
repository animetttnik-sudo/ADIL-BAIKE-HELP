/**
 * Фирменные иконки: тёмная стеклянная плитка / зелёная активная #35DE7C / голый глиф.
 * Стекло — плавный градиент без поперечной полосы. shape: 'rounded' | 'circle'.
 * Только react-native-svg (уже в Expo Go SDK 58) — без новых нативных модулей.
 */
import { memo, useId } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { GLYPHS, LAYERS, RULES, SET } from './icon-paths';

export const ICON_GREEN = '#35DE7C';
export const ICON_SET = SET;

const RADIUS = 0.223;

function Glyph({ name, size, color }) {
  const layers = LAYERS[name] || [name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {layers.map((id) => {
        const d = GLYPHS[id];
        if (!d) return null;
        return <Path key={id} d={d} fill={color} fillRule={RULES[id] || 'nonzero'} />;
      })}
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
 */
export const AppIcon = memo(function AppIcon({ name, size = 32, variant = 'tile', shape = 'rounded', color, style }) {
  const glyphColor = color || '#FFFFFF';
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gid = `gl${rawId}`;

  if (variant === 'glyph') {
    return (
      <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        {name ? <Glyph name={name} size={size} color={glyphColor} /> : null}
      </View>
    );
  }

  const on = variant === 'tileOn';
  const r = shape === 'circle' ? size / 2 : Math.round(size * RADIUS * 10) / 10;
  const glyphSize = Math.round(size * 0.62);
  const pad = (size - glyphSize) / 2;

  return (
    <View
      style={[
        { width: size, height: size, borderRadius: r },
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
        <Svg pointerEvents="none" width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity={on ? 0.28 : 0.16} />
              <Stop offset="0.42" stopColor="#ffffff" stopOpacity={0.04} />
              <Stop offset="1" stopColor="#000000" stopOpacity={on ? 0.1 : 0.2} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size} height={size} rx={r} ry={r} fill={`url(#${gid})`} />
        </Svg>
        {name ? (
          <View style={{ position: 'absolute', top: pad, left: pad, width: glyphSize, height: glyphSize }}>
            <Glyph name={name} size={glyphSize} color={glyphColor} />
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
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

export { GLYPHS, LAYERS, RULES };
