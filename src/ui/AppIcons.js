/**
 * Фирменные иконки: тёмная стеклянная плитка / зелёная активная #35DE7C / голый глиф.
 * Только react-native-svg (уже в Expo Go SDK 58) — без новых нативных модулей.
 */
import { memo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { GLYPHS, LAYERS, RULES, SET } from './icon-paths';

export const ICON_GREEN = '#35DE7C';
export const ICON_SET = SET;

const RADIUS = 0.223; // близко к iOS squircle

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
 * @param {string} props.name
 * @param {number} [props.size=32]
 * @param {'tile'|'tileOn'|'glyph'} [props.variant='tile']
 * @param {string} [props.color] цвет глифа (по умолчанию белый; для glyph можно передать любой)
 */
export const AppIcon = memo(function AppIcon({ name, size = 32, variant = 'tile', color, style }) {
  const glyphColor = color || '#FFFFFF';
  if (variant === 'glyph') {
    return (
      <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Glyph name={name} size={size} color={glyphColor} />
      </View>
    );
  }

  const on = variant === 'tileOn';
  const r = Math.round(size * RADIUS * 10) / 10;
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
          { borderRadius: r, backgroundColor: on ? ICON_GREEN : '#1C1C22', borderColor: on ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.20)' },
        ]}
      >
        <View pointerEvents="none" style={[styles.sheen, { height: '48%', borderTopLeftRadius: r, borderTopRightRadius: r, backgroundColor: on ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)' }]} />
        <View pointerEvents="none" style={[styles.sheenBot, { height: '22%', borderBottomLeftRadius: r, borderBottomRightRadius: r }]} />
        <View style={{ position: 'absolute', top: pad, left: pad, width: glyphSize, height: glyphSize }}>
          <Glyph name={name} size={glyphSize} color={glyphColor} />
        </View>
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
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  sheenBot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.12)',
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
