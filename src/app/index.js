/**
 * Зарплата — Expo Go
 *
 * npx expo install \
 *   @react-native-async-storage/async-storage \
 *   @react-native-community/datetimepicker \
 *   expo-blur expo-status-bar expo-haptics expo-image-picker \
 *   react-native-gesture-handler react-native-reanimated
 *
 * Опционально (если доступен в Expo Go):
 *   npx expo install expo-glass-effect
 *
 * babel.config.js → plugins: ['react-native-reanimated/plugin']  // всегда последним
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Dimensions, ImageBackground,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import 'react-native-gesture-handler';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    Easing,
    Extrapolation,
    interpolate,
    runOnJS,
    SlideInDown,
    useAnimatedStyle, useSharedValue,
    withSequence,
    withSpring,
    withTiming
} from 'react-native-reanimated';

// expo-glass-effect — опционально
let GlassView = null;
let isLiquidGlassAvailable = () => false;
try {
  const eg = require('expo-glass-effect');
  GlassView = eg.GlassView;
  isLiquidGlassAvailable = eg.isLiquidGlassAvailable || (() => false);
} catch (_) {}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const KEY = 'zp_app_v1';
const ANCHOR = '2026-09-04';
const SWIPE = 72;
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_R = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DOW = ['вс','пн','вт','ср','чт','пт','сб'];
const ACCENT_PRESETS = [{ h: 145 }, { h: 210 }, { h: 280 }, { h: 30 }, { h: 350 }, { h: 190 }];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const fmtDay = (s) => parse(s).getDate();
const fmtShort = (s) => {
  const d = parse(s);
  return `${d.getDate()} ${MONTHS_R[d.getMonth()]}`;
};
const money = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(Number(n) || 0));
const uid = () => Math.random().toString(36).slice(2, 9);
const todayIso = () => iso(new Date());

function allPaydays(fromY, toY) {
  const list = [];
  let d = parse(ANCHOR);
  while (d.getFullYear() > fromY - 1) d.setDate(d.getDate() - 14);
  while (d.getFullYear() <= toY) {
    list.push(iso(d));
    d.setDate(d.getDate() + 14);
  }
  return list;
}
const PAYDAYS = allPaydays(2025, 2028);

function paydayOnOrBefore(dateStr) {
  let last = PAYDAYS[0];
  for (const p of PAYDAYS) {
    if (p <= dateStr) last = p;
    else break;
  }
  return last;
}
function workPeriod(payday) {
  return { start: addDays(payday, -20), end: addDays(payday, -7), payday };
}
function paydaysInMonth(y, m) {
  const pfx = `${y}-${pad(m + 1)}`;
  return PAYDAYS.filter((p) => p.startsWith(pfx));
}
function periodsTouchingMonth(y, m) {
  const start = `${y}-${pad(m + 1)}-01`;
  const end = iso(new Date(y, m + 1, 0));
  return PAYDAYS.map(workPeriod).filter((p) => p.start <= end && p.end >= start);
}

function defaultState() {
  return {
    settings: { mode: 'study', hue: 145, light: 54 },
    custom: { bg: null },
    recurring: [
      { id: uid(), title: 'О!Банк', amount: 1387, day: 7 },
      { id: uid(), title: 'Вайфай', amount: 1350, day: 13 },
      { id: uid(), title: 'Мбанк', amount: 5075, day: 15 },
      { id: uid(), title: 'О!Банк', amount: 1385, day: 21 },
      { id: uid(), title: 'М+', amount: 5667, day: 26 },
    ],
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

function displayStatus(e) {
  if (e.status === 'paid') return 'paid';
  if (e.status === 'missed') return 'missed';
  return 'none';
}
function markGlyph(st) {
  if (st === 'paid') return '✓';
  if (st === 'missed') return '✕';
  return '';
}

const spring = { damping: 20, stiffness: 220, mass: 0.85 };
const softSpring = { damping: 22, stiffness: 190 };

const LG = typeof isLiquidGlassAvailable === 'function' ? !!isLiquidGlassAvailable() : false;

/** Стекло: BlurView + слои. Нативный GlassView — только если реально доступен. */
function Glass({ children, style, intensity = 38, tint }) {
  if (LG && GlassView) {
    return (
      <GlassView glassEffectStyle="regular" colorScheme="dark" tintColor={tint} style={[styles.glassBase, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[styles.glassBase, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.glassFill} pointerEvents="none" />
      <View style={styles.glassTopEdge} pointerEvents="none" />
      <View style={styles.glassBorder} pointerEvents="none" />
      {children}
    </View>
  );
}

/** Лёгкая карточка записи — без тяжёлого blur на каждой строке */
function ItemCard({ children, style }) {
  return (
    <View style={[styles.itemCard, style]}>
      <View style={styles.itemCardEdge} pointerEvents="none" />
      {children}
    </View>
  );
}

function Sheet({ visible, title, onClose, right, children }) {
  const ty = useSharedValue(0);
  useEffect(() => {
    if (visible) ty.value = 0;
  }, [visible]);
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      ty.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 110 || e.velocityY > 900) {
        ty.value = withTiming(SCREEN_H, { duration: 220 }, (fin) => {
          if (fin) runOnJS(onClose)();
        });
      } else {
        ty.value = withSpring(0, spring);
      }
    });
  const drag = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.sheetBack}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Animated.View entering={SlideInDown.duration(320).easing(Easing.out(Easing.cubic))}>
              <Animated.View style={drag}>
                <Glass style={styles.sheet} intensity={48}>
                  <GestureDetector gesture={pan}>
                    <View collapsable={false}>
                      <View style={styles.handle} />
                      <View style={styles.sheetBar}>
                        <Pressable onPress={onClose} hitSlop={14}>
                          <Text style={styles.linkMuted}>Закрыть</Text>
                        </Pressable>
                        <Text style={styles.sheetTitle}>{title}</Text>
                        {right || <View style={{ width: 70 }} />}
                      </View>
                    </View>
                  </GestureDetector>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                    style={{ flexShrink: 1 }}
                  >
                    {children}
                  </ScrollView>
                </Glass>
              </Animated.View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function DateWheel({ value, onChange, label = 'Дата' }) {
  const [open, setOpen] = useState(false);
  const date = value ? parse(value) : new Date();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={styles.input}
        onPress={() => {
          Haptics.selectionAsync();
          setOpen(true);
        }}
      >
        <Text style={styles.inputText}>
          {fmtShort(value || iso(date))} {date.getFullYear()}
        </Text>
        <Text style={styles.chev}>›</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.wheelBack} onPress={() => setOpen(false)}>
          <Animated.View
            entering={SlideInDown.duration(280).easing(Easing.out(Easing.cubic))}
            onStartShouldSetResponder={() => true}
            style={styles.wheelCard}
          >
            <View style={styles.wheelBar}>
              <Pressable onPress={() => setOpen(false)}>
                <Text style={styles.linkMuted}>Отмена</Text>
              </Pressable>
              <Text style={styles.sheetTitle}>Дата</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setOpen(false);
                }}
              >
                <Text style={styles.link}>Готово</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={date}
              mode="date"
              display="spinner"
              locale="ru-RU"
              themeVariant="dark"
              onChange={(_, d) => d && onChange(iso(d))}
              style={{ height: 200, width: SCREEN_W - 24 }}
            />
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

const ExpenseRow = memo(function ExpenseRow({ item, onEdit, onDelete, onStatus, onSet }) {
  const x = useSharedValue(0);
  const statusScale = useSharedValue(1);
  const st = displayStatus(item);
  const show = useSharedValue(0);
  const pick = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = Math.max(-SWIPE - 16, Math.min(SWIPE + 16, e.translationX));
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE * 0.55) {
        x.value = withSpring(0, softSpring);
        runOnJS(onEdit)(item.id);
      } else if (e.translationX < -SWIPE * 0.55) {
        x.value = withSpring(0, softSpring);
        runOnJS(onDelete)(item.id);
      } else {
        x.value = withSpring(0, spring);
      }
    });

  const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  const sel = () => Haptics.selectionAsync();

  // зажим: вверх ✓, вниз ✕
  const hold = Gesture.Pan()
    .activateAfterLongPress(280)
    .onStart(() => {
      show.value = withTiming(1, { duration: 140 });
      runOnJS(tick)();
    })
    .onUpdate((e) => {
      const p = e.translationY < -20 ? 1 : e.translationY > 20 ? -1 : 0;
      if (p !== pick.value) {
        pick.value = p;
        runOnJS(sel)();
      }
    })
    .onEnd(() => {
      if (pick.value !== 0) runOnJS(onSet)(item.id, pick.value === 1 ? 'paid' : 'missed');
    })
    .onFinalize(() => {
      show.value = withTiming(0, { duration: 140 });
      pick.value = 0;
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const leftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, SWIPE * 0.4], [0, 1], Extrapolation.CLAMP),
  }));
  const rightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-SWIPE * 0.4, 0], [1, 0], Extrapolation.CLAMP),
  }));
  const statusAnim = useAnimatedStyle(() => ({ transform: [{ scale: statusScale.value }] }));
  const holdStyle = useAnimatedStyle(() => ({
    opacity: show.value,
    transform: [{ scale: 0.9 + 0.1 * show.value }],
  }));
  const paidStyle = useAnimatedStyle(() => ({
    backgroundColor: pick.value === 1 ? 'rgba(48,209,88,0.85)' : 'rgba(255,255,255,0.12)',
  }));
  const missStyle = useAnimatedStyle(() => ({
    backgroundColor: pick.value === -1 ? 'rgba(255,69,58,0.85)' : 'rgba(255,255,255,0.12)',
  }));

  const pulseStatus = () => {
    statusScale.value = withSequence(
      withTiming(1.12, { duration: 90 }),
      withTiming(1, { duration: 120 })
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onStatus(item.id);
  };

  return (
    <View style={styles.rowOuter}>
      <ItemCard>
        <View style={styles.rowWrap}>
          <Animated.View style={[styles.revealLeft, leftStyle]}>
            <Text style={styles.revealTxt}>Изменить</Text>
          </Animated.View>
          <Animated.View style={[styles.revealRight, rightStyle]}>
            <Text style={styles.revealTxt}>Удалить</Text>
          </Animated.View>
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.item, rowStyle]}>
              <Pressable style={styles.itemPress} onPress={() => onEdit(item.id)}>
                <Text style={styles.when}>{fmtDay(item.date)}</Text>
                <View style={styles.mid}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.title || 'Без названия'}
                  </Text>
                  <Text style={styles.meta}>
                    {item.type === 'recurring' ? 'постоянный' : 'непредвид.'}
                  </Text>
                </View>
                <Text style={styles.amt}>{money(item.amount)}</Text>
              </Pressable>
              <GestureDetector gesture={hold}>
                <View collapsable={false}>
                  <Pressable onPress={pulseStatus} hitSlop={10}>
                    <Animated.View
                      style={[
                        styles.status,
                        st === 'paid' && { backgroundColor: 'rgba(48,209,88,0.4)' },
                        st === 'missed' && { backgroundColor: 'rgba(255,69,58,0.4)' },
                        statusAnim,
                      ]}
                    >
                      <Text style={styles.statusTxt}>{markGlyph(st)}</Text>
                    </Animated.View>
                  </Pressable>
                </View>
              </GestureDetector>
              <Animated.View pointerEvents="none" style={[styles.holdPill, holdStyle]}>
                <Animated.View style={[styles.holdOpt, paidStyle]}>
                  <Text style={styles.holdTxt}>✓</Text>
                </Animated.View>
                <Animated.View style={[styles.holdOpt, missStyle]}>
                  <Text style={styles.holdTxt}>✕</Text>
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        </View>
      </ItemCard>
    </View>
  );
});

const ShiftRow = memo(function ShiftRow({ item, onEdit, onDelete }) {
  const x = useSharedValue(0);
  const pan = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = Math.max(-SWIPE - 16, Math.min(SWIPE + 16, e.translationX));
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE * 0.55) {
        x.value = withSpring(0, softSpring);
        runOnJS(onEdit)(item.id);
      } else if (e.translationX < -SWIPE * 0.55) {
        x.value = withSpring(0, softSpring);
        runOnJS(onDelete)(item.id);
      } else {
        x.value = withSpring(0, spring);
      }
    });
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const leftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, SWIPE * 0.4], [0, 1], Extrapolation.CLAMP),
  }));
  const rightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-SWIPE * 0.4, 0], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.rowOuter}>
      <ItemCard>
        <View style={styles.rowWrap}>
          <Animated.View style={[styles.revealLeft, leftStyle]}>
            <Text style={styles.revealTxt}>Сумма</Text>
          </Animated.View>
          <Animated.View style={[styles.revealRight, rightStyle]}>
            <Text style={styles.revealTxt}>Убрать</Text>
          </Animated.View>
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.item, rowStyle]}>
              <Pressable style={styles.itemPress} onPress={() => onEdit(item.id)}>
                <Text style={styles.when}>{fmtDay(item.date)}</Text>
                <View style={styles.mid}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.meta}>
                    {DOW[parse(item.date).getDay()]} · свайп или тап
                  </Text>
                </View>
                <Text style={styles.amt}>
                  {item.amount == null || item.amount === '' ? '—' : money(item.amount)}
                </Text>
                <Text style={styles.chevMini}>›</Text>
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </View>
      </ItemCard>
    </View>
  );
});

const APressable = Animated.createAnimatedComponent(Pressable);
function ScaleButton({ onPress, style, children }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return (
    <APressable
      onPressIn={() => {
        scale.value = withTiming(0.96, { duration: 80 });
        opacity.value = withTiming(0.88, { duration: 80 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 140 });
        opacity.value = withTiming(1, { duration: 140 });
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={[style, anim]}
    >
      {children}
    </APressable>
  );
}

/** Капсула: тап + свайп + spring-доводка. Индикатор — плотная плашка без nested glass. */
function SegmentCapsule({ value, labels, onChange, height = 56 }) {
  const [boxW, setBoxW] = useState(0);
  const segW = boxW > 0 ? (boxW - 10) / labels.length : SCREEN_W / labels.length;
  const sv = useSharedValue(value);
  const drag0 = useSharedValue(0);
  useEffect(() => {
    sv.value = withSpring(value, { damping: 18, stiffness: 180, mass: 0.9 });
  }, [value]);
  const setJS = useCallback(
    (p) => {
      Haptics.selectionAsync();
      onChange(p);
    },
    [onChange]
  );
  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      drag0.value = sv.value;
    })
    .onUpdate((e) => {
      const next = Math.max(0, Math.min(labels.length - 1, drag0.value + e.translationX / Math.max(segW, 1)));
      sv.value = next;
    })
    .onEnd((e) => {
      const projected = sv.value + e.velocityX / 5000;
      const p = Math.max(0, Math.min(labels.length - 1, Math.round(projected)));
      sv.value = withSpring(p, { damping: 18, stiffness: 180, mass: 0.9 });
      runOnJS(setJS)(p);
    });
  const ind = useAnimatedStyle(() => ({
    width: segW,
    transform: [{ translateX: sv.value * segW }],
  }));

  return (
    <View style={[styles.segCap, { height }]} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}>
      <View style={styles.segCapBg} />
      <GestureDetector gesture={pan}>
        <View style={styles.segCapRow} collapsable={false}>
          <Animated.View pointerEvents="none" style={[styles.segInd, ind]} />
          {labels.map((lab, i) => (
            <Pressable
              key={lab}
              style={styles.seg}
              onPress={() => {
                sv.value = withSpring(i, { damping: 18, stiffness: 180, mass: 0.9 });
                setJS(i);
              }}
            >
              <Text style={[styles.segTxt, value === i && styles.segTxtOn]}>{lab}</Text>
            </Pressable>
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

function AnalysisView({ state }) {
  const [range, setRange] = useState(6);
  const M = {};
  const get = (k) => M[k] || (M[k] = { e: 0, s: 0 });
  state.shifts.forEach((x) => {
    get(x.date.slice(0, 7)).e += Number(x.amount) || 0;
  });
  state.expenses.forEach((x) => {
    if (displayStatus(x) === 'paid') get(x.date.slice(0, 7)).s += Number(x.amount) || 0;
  });
  let ks = Object.keys(M).sort();
  if (range) ks = ks.slice(-range);
  const mx = Math.max(1, ...ks.map((k) => Math.max(M[k].e, M[k].s)));
  const net = (k) => M[k].e - M[k].s;
  const by = [...ks].sort((a, b) => net(b) - net(a));
  const te = ks.reduce((a, k) => a + M[k].e, 0);
  const ts = ks.reduce((a, k) => a + M[k].s, 0);
  const name = (k) => MONTHS[+k.slice(5) - 1] + ' ' + k.slice(0, 4);

  return (
    <>
      <View style={[styles.segRow, { marginBottom: 14 }]}>
        {[
          [3, '3 мес'],
          [6, '6 мес'],
          [0, 'Всё'],
        ].map(([r, n]) => (
          <ScaleButton
            key={r}
            style={[styles.chip, range === r && styles.chipOn]}
            onPress={() => setRange(r)}
          >
            <Text style={[styles.chipTxt, range === r && styles.chipTxtOn]}>{n}</Text>
          </ScaleButton>
        ))}
      </View>
      {ks.length === 0 ? (
        <Text style={styles.empty}>Пока нет данных</Text>
      ) : (
        <>
          <View style={styles.stat}>
            <Text style={styles.k}>Заработано</Text>
            <Text style={[styles.v, styles.good]}>{money(te)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.k}>Оплачено</Text>
            <Text style={styles.v}>{money(ts)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.k}>Итог</Text>
            <Text style={[styles.v, te - ts >= 0 ? styles.good : styles.bad]}>{money(te - ts)}</Text>
          </View>
          <Text style={[styles.label, { marginTop: 18 }]}>ПО МЕСЯЦАМ</Text>
          {ks.map((k) => (
            <View key={k} style={styles.anRow}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.setL}>{name(k)}</Text>
                <Text style={[styles.itemTitle, { color: net(k) >= 0 ? '#30d158' : '#ff453a' }]}>
                  {net(k) >= 0 ? '+' : ''}
                  {money(net(k))}
                </Text>
              </View>
              <View style={styles.anTrack}>
                <View style={[styles.anFill, { width: `${(M[k].e / mx) * 100}%`, backgroundColor: '#30d158' }]} />
              </View>
              <View style={styles.anTrack}>
                <View style={[styles.anFill, { width: `${(M[k].s / mx) * 100}%`, backgroundColor: '#ff453a' }]} />
              </View>
              <Text style={styles.setS}>
                заработано {money(M[k].e)} · оплачено {money(M[k].s)}
              </Text>
            </View>
          ))}
          <Text style={[styles.hint, { marginTop: 14 }]}>
            Лучший месяц: {name(by[0])} ({money(net(by[0]))})
            {ks.length > 1
              ? `\nХудший месяц: ${name(by[by.length - 1])} (${money(net(by[by.length - 1]))})`
              : ''}
          </Text>
        </>
      )}
    </>
  );
}

export default function App() {
  const [state, setState] = useState(null);
  const [page, setPage] = useState(0);
  const [viewY, setViewY] = useState(2026);
  const [viewM, setViewM] = useState(8);
  const [sheet, setSheet] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        setState(raw ? JSON.parse(raw) : defaultState());
      } catch {
        setState(defaultState());
      }
    })();
  }, []);

  const patch = useCallback((fn) => {
    setState((prev) => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const stateRef = useRef(null);
  stateRef.current = state;

  // seed recurring + shifts for visible month
  useEffect(() => {
    if (!state) return;
    let changed = false;
    const next = {
      ...state,
      expenses: [...state.expenses],
      shifts: [...state.shifts],
      settings: { ...state.settings },
      custom: { ...(state.custom || { bg: null }) },
      removed: [...(state.removed || [])],
      recurring: [...(state.recurring || [])],
    };
    const last = new Date(viewY, viewM + 1, 0).getDate();
    (state.recurring || []).forEach((r) => {
      if (r.day > last) return;
      const date = `${viewY}-${pad(viewM + 1)}-${pad(r.day)}`;
      if (!next.expenses.some((e) => e.date === date && e.title === r.title && e.type === 'recurring')) {
        next.expenses.push({
          id: uid(),
          date,
          amount: r.amount,
          title: r.title,
          type: 'recurring',
          status: null,
        });
        changed = true;
      }
    });
    periodsTouchingMonth(viewY, viewM).forEach((period) => {
      for (let d = period.start; d <= period.end; d = addDays(d, 1)) {
        if (next.removed.includes(d) || next.shifts.some((s) => s.date === d)) continue;
        const dow = parse(d).getDay();
        if (state.settings.mode === 'study' && !(dow === 5 || dow === 6 || dow === 0)) continue;
        next.shifts.push({
          id: uid(),
          date: d,
          title: 'ночь касса',
          amount: null,
          payday: period.payday,
        });
        changed = true;
      }
    });
    if (changed) patch(next);
  }, [state?.settings?.mode, viewY, viewM]);

  const expensesForPayday = useCallback(
    (p) => {
      if (!state) return [];
      const nextP = PAYDAYS.find((x) => x > p) || addDays(p, 14);
      return state.expenses
        .filter((e) => e.date >= p && e.date < nextP)
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    [state]
  );
  const earnedForPayday = useCallback(
    (p) => {
      if (!state) return 0;
      const per = workPeriod(p);
      return state.shifts
        .filter((s) => s.date >= per.start && s.date <= per.end)
        .reduce((a, s) => a + (Number(s.amount) || 0), 0);
    },
    [state]
  );

  const accent = useMemo(() => {
    const h = state?.settings?.hue ?? 145;
    const l = state?.settings?.light ?? 54;
    return `hsl(${h}, 72%, ${l}%)`;
  }, [state?.settings?.hue, state?.settings?.light]);

  const openExpense = useCallback((id) => {
    const st = stateRef.current;
    const e = id
      ? st.expenses.find((x) => x.id === id)
      : { date: todayIso(), amount: '', title: '', type: 'unexpected' };
    setEditId(id || null);
    setForm({
      date: e.date,
      amount: e.amount != null ? String(e.amount) : '',
      title: e.title || '',
      type: e.type || 'unexpected',
    });
    setSheet('exp');
  }, []);

  const openShift = useCallback((id) => {
    const st = stateRef.current;
    const s = id ? st.shifts.find((x) => x.id === id) : null;
    setEditId(id || null);
    setForm({
      date: s ? s.date : todayIso(),
      amount: s && s.amount != null ? String(s.amount) : '',
      title: s ? s.title : 'ночь касса',
    });
    setSheet('shift');
  }, []);

  const openStatus = useCallback((id) => {
    setEditId(id);
    setSheet('status');
  }, []);

  const setStatusDirect = useCallback(
    (id, status) => {
      patch((p) => ({
        ...p,
        expenses: p.expenses.map((e) => (e.id === id ? { ...e, status } : e)),
      }));
      Haptics.notificationAsync(
        status === 'paid'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );
    },
    [patch]
  );

  const confirmDeleteExpense = useCallback(
    (id) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Удалить расход?', '', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () =>
            patch((p) => ({ ...p, expenses: p.expenses.filter((x) => x.id !== id) })),
        },
      ]);
    },
    [patch]
  );

  const confirmDeleteShift = useCallback(
    (id) => {
      const s = stateRef.current.shifts.find((x) => x.id === id);
      Alert.alert('Убрать день?', '', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Убрать',
          style: 'destructive',
          onPress: () =>
            patch((p) => ({
              ...p,
              shifts: p.shifts.filter((x) => x.id !== id),
              removed: p.removed.includes(s.date) ? p.removed : [...p.removed, s.date],
            })),
        },
      ]);
    },
    [patch]
  );

  if (!state) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#fff' }}>Загрузка…</Text>
      </View>
    );
  }

  const saveExpense = () => {
    const amount = Number(form.amount) || 0;
    const title = (form.title || '').trim();
    const { date, type } = form;
    patch((prev) => {
      const expenses = [...prev.expenses];
      if (editId) {
        const i = expenses.findIndex((x) => x.id === editId);
        if (i >= 0) expenses[i] = { ...expenses[i], date, amount, title, type };
      } else {
        expenses.push({ id: uid(), date, amount, title, type, status: null });
      }
      return { ...prev, expenses };
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSheet(null);
  };

  const saveShift = () => {
    const { date, title } = form;
    const amount = form.amount === '' ? null : Number(form.amount);
    const p = workPeriod(paydayOnOrBefore(addDays(date, 20)));
    patch((prev) => {
      let shifts = [...prev.shifts];
      let removed = [...prev.removed];
      if (editId) {
        const i = shifts.findIndex((x) => x.id === editId);
        if (i >= 0)
          shifts[i] = {
            ...shifts[i],
            date,
            amount,
            title: title || 'ночь касса',
            payday: p.payday,
          };
      } else {
        removed = removed.filter((x) => x !== date);
        shifts.push({
          id: uid(),
          date,
          amount,
          title: title || 'ночь касса',
          payday: p.payday,
        });
      }
      return { ...prev, shifts, removed };
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSheet(null);
  };

  const setStatus = (status) => {
    patch((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) => (e.id === editId ? { ...e, status } : e)),
    }));
    Haptics.notificationAsync(
      status === 'paid'
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning
    );
    setSheet(null);
  };

  const pickBg = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!res.canceled && res.assets?.[0]?.uri) {
      patch((p) => ({ ...p, custom: { ...p.custom, bg: res.assets[0].uri } }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const pays = paydaysInMonth(viewY, viewM);
  const focus = pays.find((p) => p >= todayIso()) || pays[pays.length - 1];
  const need = focus
    ? expensesForPayday(focus).reduce((a, e) => a + Number(e.amount || 0), 0)
    : 0;
  const got = focus ? earnedForPayday(focus) : 0;
  const balanceOk = got >= need;
  const paid = state.expenses.filter((e) => displayStatus(e) === 'paid');
  const unexp = paid.filter((e) => e.type !== 'recurring');
  const rec = paid.filter((e) => e.type === 'recurring');
  const spent = paid.reduce((a, e) => a + Number(e.amount || 0), 0);
  const earnedAll = state.shifts.reduce((a, s) => a + (Number(s.amount) || 0), 0);

  const content = (
    <View style={styles.root}>
      <StatusBar style="light" />
      {state.custom?.bg ? (
        <ImageBackground source={{ uri: state.custom.bg }} style={StyleSheet.absoluteFill} blurRadius={4}>
          <View style={styles.bgScrim} />
        </ImageBackground>
      ) : (
        <>
          <View style={[styles.blob, styles.blobA, { backgroundColor: accent }]} />
          <View style={[styles.blob, styles.blobB]} />
          <View style={styles.bgScrim} />
        </>
      )}

      <View style={styles.header}>
        <View style={styles.monthWrap}>
          <ScaleButton
            style={styles.navHit}
            onPress={() => {
              let m = viewM - 1;
              let y = viewY;
              if (m < 0) {
                m = 11;
                y--;
              }
              setViewM(m);
              setViewY(y);
            }}
          >
            <Text style={styles.navTxt}>‹</Text>
          </ScaleButton>
          <View style={styles.monthBlock}>
            <Text style={styles.eyebrow}>{page === 0 ? 'Расходы' : 'Смены'}</Text>
            <Text style={styles.h1}>{MONTHS[viewM]}</Text>
          </View>
          <ScaleButton
            style={styles.navHit}
            onPress={() => {
              let m = viewM + 1;
              let y = viewY;
              if (m > 11) {
                m = 0;
                y++;
              }
              setViewM(m);
              setViewY(y);
            }}
          >
            <Text style={styles.navTxt}>›</Text>
          </ScaleButton>
        </View>
        <ScaleButton style={[styles.round, { backgroundColor: accent }]} onPress={() => setSheet('add')}>
          <Text style={[styles.plus, { color: '#102012' }]}>+</Text>
        </ScaleButton>
      </View>

      <ScrollView
        style={styles.pages}
        contentContainerStyle={styles.pagesContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      >
        {page === 0 ? (
          <>
            {focus && (
              <Glass style={styles.balance} intensity={42}>
                <Text style={styles.period}>К зарплате {fmtShort(focus)}</Text>
                <Text style={styles.paySub}>заработано и сколько нужно закрыть</Text>
                <View style={styles.nums}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.k}>Заработано</Text>
                    <Text style={[styles.v, balanceOk ? styles.good : styles.bad]}>{money(got)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.k}>Нужно</Text>
                    <Text style={styles.v}>{money(need)}</Text>
                  </View>
                </View>
              </Glass>
            )}
            {pays.map((p, i) => {
              const list = expensesForPayday(p);
              const sum = list.reduce((a, e) => a + Number(e.amount || 0), 0);
              const paidSum = list
                .filter((e) => displayStatus(e) === 'paid')
                .reduce((a, e) => a + Number(e.amount || 0), 0);
              return (
                <View key={p} style={styles.group}>
                  <View style={styles.gHead}>
                    <Text style={styles.gTitle}>
                      {i === 0 ? 'Первая' : 'Вторая'} зарплата {fmtShort(p)}
                    </Text>
                    <Text style={styles.gSub}>
                      {money(paidSum)} / {money(sum)}
                    </Text>
                  </View>
                  {list.length === 0 ? (
                    <Text style={styles.empty}>Пока пусто</Text>
                  ) : (
                    list.map((e) => (
                      <ExpenseRow
                        key={e.id}
                        item={e}
                        onEdit={openExpense}
                        onDelete={confirmDeleteExpense}
                        onStatus={openStatus}
                        onSet={setStatusDirect}
                      />
                    ))
                  )}
                  <View style={styles.totalLine}>
                    <Text style={styles.totalL}>Общ</Text>
                    <Text style={styles.totalV}>{money(sum)}</Text>
                  </View>
                </View>
              );
            })}
          </>
        ) : (
          periodsTouchingMonth(viewY, viewM).map((per) => {
            const list = state.shifts
              .filter((s) => s.date >= per.start && s.date <= per.end)
              .sort((a, b) => a.date.localeCompare(b.date));
            const sum = list.reduce((a, s) => a + (Number(s.amount) || 0), 0);
            const mid = addDays(per.start, 6);
            const halves = [
              { title: 'Первая половина', items: list.filter((s) => s.date <= mid) },
              { title: 'Вторая половина', items: list.filter((s) => s.date > mid) },
            ];
            return (
              <View key={per.payday}>
                <Glass style={styles.balance} intensity={42}>
                  <Text style={styles.period}>
                    {fmtDay(per.start)}–{fmtDay(per.end)} {MONTHS_R[parse(per.start).getMonth()]}
                  </Text>
                  <Text style={styles.paySub}>Зарплата {fmtShort(per.payday)}</Text>
                  <View style={styles.nums}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.k}>Набрано</Text>
                      <Text style={styles.v}>{money(sum)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.k}>Смен</Text>
                      <Text style={styles.v}>{list.length}</Text>
                    </View>
                  </View>
                </Glass>
                {halves.map((h) => (
                  <View key={h.title} style={styles.group}>
                    <View style={styles.gHead}>
                      <Text style={styles.gTitle}>{h.title}</Text>
                    </View>
                    {h.items.length === 0 ? (
                      <Text style={styles.empty}>Нет смен</Text>
                    ) : (
                      h.items.map((s) => (
                        <ShiftRow
                          key={s.id}
                          item={s}
                          onEdit={openShift}
                          onDelete={confirmDeleteShift}
                        />
                      ))
                    )}
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Dock */}
      <View style={styles.dock}>
        <View style={styles.capsuleWrap}>
          <SegmentCapsule
            value={page}
            labels={['Расходы', 'Смены']}
            height={64}
            onChange={setPage}
          />
        </View>
        <ScaleButton style={styles.gearDock} onPress={() => setSheet('settings')}>
          <Glass style={styles.gearInner} intensity={40}>
            <Text style={styles.gearIcon}>⚙</Text>
          </Glass>
        </ScaleButton>
      </View>

      {/* ADD */}
      <Sheet visible={sheet === 'add'} title="Добавить" onClose={() => setSheet(null)}>
        <ScaleButton
          style={styles.actBtn}
          onPress={() => {
            setSheet(null);
            setTimeout(() => openExpense(null), 160);
          }}
        >
          <Text style={styles.actBtnTxt}>Новый расход</Text>
        </ScaleButton>
        <ScaleButton
          style={styles.actBtn}
          onPress={() => {
            setSheet(null);
            setTimeout(() => openShift(null), 160);
          }}
        >
          <Text style={styles.actBtnTxt}>Новая смена</Text>
        </ScaleButton>
      </Sheet>

      {/* EXP */}
      <Sheet
        visible={sheet === 'exp'}
        title={editId ? 'Расход' : 'Новый расход'}
        onClose={() => setSheet(null)}
        right={
          <Pressable onPress={saveExpense}>
            <Text style={[styles.link, { color: accent }]}>Готово</Text>
          </Pressable>
        }
      >
        <DateWheel value={form.date} onChange={(d) => setForm((f) => ({ ...f, date: d }))} />
        <View style={styles.field}>
          <Text style={styles.label}>Сумма</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={form.amount}
            onChangeText={(t) => setForm((f) => ({ ...f, amount: t }))}
            placeholder="0"
            placeholderTextColor="rgba(235,235,245,0.3)"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>За что</Text>
          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
            placeholder="Вайфай, ремонт…"
            placeholderTextColor="rgba(235,235,245,0.3)"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Тип</Text>
          <View style={styles.segRow}>
            {['unexpected', 'recurring'].map((t) => (
              <ScaleButton
                key={t}
                style={[styles.chip, form.type === t && styles.chipOn]}
                onPress={() => setForm((f) => ({ ...f, type: t }))}
              >
                <Text style={[styles.chipTxt, form.type === t && styles.chipTxtOn]}>
                  {t === 'unexpected' ? 'Непредвиденный' : 'Постоянный'}
                </Text>
              </ScaleButton>
            ))}
          </View>
        </View>
        {editId && (
          <ScaleButton
            style={styles.actBtn}
            onPress={() => {
              setSheet(null);
              setTimeout(() => confirmDeleteExpense(editId), 140);
            }}
          >
            <Text style={[styles.actBtnTxt, { color: '#ff453a' }]}>Удалить расход</Text>
          </ScaleButton>
        )}
      </Sheet>

      {/* SHIFT */}
      <Sheet
        visible={sheet === 'shift'}
        title={editId ? 'Смена' : 'Новая смена'}
        onClose={() => setSheet(null)}
        right={
          <Pressable onPress={saveShift}>
            <Text style={[styles.link, { color: accent }]}>Готово</Text>
          </Pressable>
        }
      >
        <DateWheel value={form.date} onChange={(d) => setForm((f) => ({ ...f, date: d }))} />
        <View style={styles.field}>
          <Text style={styles.label}>Сумма за ночь</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={form.amount}
            onChangeText={(t) => setForm((f) => ({ ...f, amount: t }))}
            placeholder="Сколько заработал"
            placeholderTextColor="rgba(235,235,245,0.3)"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Тип</Text>
          <TextInput
            style={styles.input}
            value={form.title}
            onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
          />
        </View>
        {editId && (
          <ScaleButton
            style={styles.actBtn}
            onPress={() => {
              setSheet(null);
              setTimeout(() => confirmDeleteShift(editId), 140);
            }}
          >
            <Text style={[styles.actBtnTxt, { color: '#ff453a' }]}>Убрать этот день</Text>
          </ScaleButton>
        )}
      </Sheet>

      {/* STATUS */}
      <Sheet visible={sheet === 'status'} title="Статус" onClose={() => setSheet(null)}>
        {(() => {
          const e = state.expenses.find((x) => x.id === editId);
          if (!e) return null;
          return (
            <>
              <Text style={styles.hint}>
                {e.title || 'Без названия'} · {money(e.amount)}
              </Text>
              <ScaleButton style={[styles.actBtn, styles.statusPaidBtn]} onPress={() => setStatus('paid')}>
                <Text style={styles.actBtnTxt}>✓  Оплатил</Text>
              </ScaleButton>
              <ScaleButton style={[styles.actBtn, styles.statusMissBtn]} onPress={() => setStatus('missed')}>
                <Text style={[styles.actBtnTxt, { color: '#ff453a' }]}>✕  Не оплатил вовремя</Text>
              </ScaleButton>
              <ScaleButton style={styles.actBtn} onPress={() => setStatus(null)}>
                <Text style={styles.actBtnTxt}>Убрать метку</Text>
              </ScaleButton>
            </>
          );
        })()}
      </Sheet>

      {/* SETTINGS */}
      <Sheet visible={sheet === 'settings'} title="Настройки" onClose={() => setSheet(null)}>
        <View style={{ marginBottom: 14 }}>
          <Text style={[styles.setL, { marginBottom: 4 }]}>Режим</Text>
          <Text style={[styles.setS, { marginBottom: 10 }]}>учёба — пт/сб/вс · работа — все дни</Text>
          <SegmentCapsule
            value={state.settings.mode === 'work' ? 1 : 0}
            labels={['Учёба', 'Работа']}
            onChange={(i) =>
              patch((p) => ({
                ...p,
                settings: { ...p.settings, mode: i === 1 ? 'work' : 'study' },
              }))
            }
          />
        </View>
        <ScaleButton style={styles.setItem} onPress={() => setSheet('custom')}>
          <View>
            <Text style={styles.setL}>Кастомизация</Text>
            <Text style={styles.setS}>фото, цвета</Text>
          </View>
          <Text style={[styles.link, { color: accent }]}>Открыть</Text>
        </ScaleButton>
        <ScaleButton style={styles.setItem} onPress={() => setSheet('recurring')}>
          <Text style={styles.setL}>Постоянные платежи</Text>
          <Text style={[styles.link, { color: accent }]}>Открыть</Text>
        </ScaleButton>
        <ScaleButton style={styles.setItem} onPress={() => setSheet('analysis')}>
          <View>
            <Text style={styles.setL}>Анализ</Text>
            <Text style={styles.setS}>по месяцам, лучшие и худшие</Text>
          </View>
          <Text style={[styles.link, { color: accent }]}>Смотреть</Text>
        </ScaleButton>
        <ScaleButton style={[styles.setItem, { marginBottom: 4 }]} onPress={() => setSheet('stats')}>
          <View>
            <Text style={styles.setL}>Результаты</Text>
            <Text style={styles.setS}>заработано и оплачено</Text>
          </View>
          <Text style={[styles.link, { color: accent }]}>Смотреть</Text>
        </ScaleButton>
      </Sheet>

      {/* CUSTOM */}
      <Sheet visible={sheet === 'custom'} title="Кастомизация" onClose={() => setSheet('settings')}>
        <Text style={styles.label}>Фон (фото)</Text>
        <ScaleButton style={styles.actBtn} onPress={pickBg}>
          <Text style={styles.actBtnTxt}>
            {state.custom?.bg ? 'Сменить фото' : 'Выбрать из галереи'}
          </Text>
        </ScaleButton>
        {!!state.custom?.bg && (
          <ScaleButton
            style={styles.actBtn}
            onPress={() => {
              patch((p) => ({ ...p, custom: { ...p.custom, bg: null } }));
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={[styles.actBtnTxt, { color: '#ff453a' }]}>Убрать фото</Text>
          </ScaleButton>
        )}
        <Text style={[styles.label, { marginTop: 16 }]}>Цвет кнопок</Text>
        <View style={styles.colorRow}>
          {ACCENT_PRESETS.map((c) => {
            const active = state.settings.hue === c.h;
            return (
              <ScaleButton
                key={c.h}
                style={[
                  styles.colorDot,
                  { backgroundColor: `hsl(${c.h},72%,54%)` },
                  active && styles.colorDotOn,
                ]}
                onPress={() => {
                  patch((p) => ({ ...p, settings: { ...p.settings, hue: c.h } }));
                  Haptics.selectionAsync();
                }}
              />
            );
          })}
        </View>
        <Text style={styles.setS}>Шкала оттенка</Text>
        <View style={styles.hueTrack}>
          {[0, 30, 60, 120, 180, 210, 260, 300, 330].map((h) => (
            <Pressable
              key={h}
              onPress={() => {
                patch((p) => ({ ...p, settings: { ...p.settings, hue: h } }));
                Haptics.selectionAsync();
              }}
              style={[styles.hueSeg, { backgroundColor: `hsl(${h},70%,50%)` }]}
            />
          ))}
        </View>
        <Text style={[styles.label, { marginTop: 18 }]}>
          Яркость · {state.settings.light ?? 54}%
        </Text>
        <View style={styles.sliderRow}>
          {[36, 44, 54, 62, 70].map((l) => (
            <ScaleButton
              key={l}
              style={[
                styles.lightChip,
                (state.settings.light ?? 54) === l && { backgroundColor: accent },
              ]}
              onPress={() => patch((p) => ({ ...p, settings: { ...p.settings, light: l } }))}
            >
              <Text
                style={[
                  styles.chipTxt,
                  (state.settings.light ?? 54) === l && { color: '#102012' },
                ]}
              >
                {l}
              </Text>
            </ScaleButton>
          ))}
        </View>
      </Sheet>

      {/* RECURRING */}
      <Sheet visible={sheet === 'recurring'} title="Постоянные" onClose={() => setSheet('settings')}>
        <Text style={styles.hint}>Дата решает, в какую зарплату попадёт платёж.</Text>
        {(state.recurring || []).map((r) => (
          <View key={r.id} style={styles.setItem}>
            <View>
              <Text style={styles.setL}>{r.title}</Text>
              <Text style={styles.setS}>
                {r.day}-е · {money(r.amount)}
              </Text>
            </View>
            <Pressable
              onPress={() =>
                patch((p) => ({
                  ...p,
                  recurring: p.recurring.filter((x) => x.id !== r.id),
                }))
              }
            >
              <Text style={{ color: '#ff453a', fontWeight: '600' }}>Удалить</Text>
            </Pressable>
          </View>
        ))}
        <View style={styles.field}>
          <Text style={styles.label}>Название</Text>
          <TextInput
            style={styles.input}
            value={form.rTitle || ''}
            onChangeText={(t) => setForm((f) => ({ ...f, rTitle: t }))}
            placeholder="Вайфай"
            placeholderTextColor="rgba(235,235,245,0.3)"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>День месяца</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={form.rDay || '13'}
            onChangeText={(t) => setForm((f) => ({ ...f, rDay: t }))}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Сумма</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={form.rAmt || ''}
            onChangeText={(t) => setForm((f) => ({ ...f, rAmt: t }))}
          />
        </View>
        <ScaleButton
          style={[styles.actBtn, { backgroundColor: accent }]}
          onPress={() => {
            const title = (form.rTitle || '').trim();
            const day = Number(form.rDay) || 0;
            const amount = Number(form.rAmt) || 0;
            if (!title || !day) return;
            patch((p) => ({
              ...p,
              recurring: [...p.recurring, { id: uid(), title, day, amount }],
            }));
            setForm((f) => ({ ...f, rTitle: '', rAmt: '' }));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }}
        >
          <Text style={[styles.actBtnTxt, { color: '#102012' }]}>Добавить</Text>
        </ScaleButton>
      </Sheet>

      <Sheet visible={sheet === 'analysis'} title="Анализ" onClose={() => setSheet('settings')}>
        <AnalysisView state={state} />
      </Sheet>

      <Sheet visible={sheet === 'stats'} title="Результаты" onClose={() => setSheet('settings')}>
        <View style={styles.stat}>
          <Text style={styles.k}>Всего заработано</Text>
          <Text style={[styles.v, styles.good]}>{money(earnedAll)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.k}>Всего оплачено</Text>
          <Text style={styles.v}>{money(spent)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.k}>Остаток</Text>
          <Text style={[styles.v, earnedAll - spent >= 0 ? styles.good : styles.bad]}>
            {money(earnedAll - spent)}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.k}>Непредвиденные</Text>
          <Text style={styles.v}>
            {money(unexp.reduce((a, e) => a + Number(e.amount || 0), 0))}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.k}>Постоянные</Text>
          <Text style={styles.v}>
            {money(rec.reduce((a, e) => a + Number(e.amount || 0), 0))}
          </Text>
        </View>
      </Sheet>
    </View>
  );

  return <GestureHandlerRootView style={{ flex: 1 }}>{content}</GestureHandlerRootView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050507' },
  bgScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  blob: { position: 'absolute', width: 280, height: 280, borderRadius: 140, opacity: 0.28 },
  blobA: { top: -70, right: -50 },
  blobB: { bottom: 100, left: -90, backgroundColor: '#3b6cff', opacity: 0.14 },

  header: {
    paddingTop: Platform.OS === 'ios' ? 58 : 38,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  navHit: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTxt: { color: '#fff', fontSize: 28, fontWeight: '300' },
  monthBlock: { paddingHorizontal: 4 },
  eyebrow: { color: 'rgba(235,235,245,0.55)', fontSize: 13, fontWeight: '600' },
  h1: { color: '#fff', fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: { fontSize: 28, fontWeight: '500', marginTop: -2 },

  pages: { flex: 1 },
  pagesContent: { paddingHorizontal: 16, paddingBottom: 130 },

  glassBase: {
    borderRadius: 26,
    overflow: 'hidden',
  },
  glassFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22,22,28,0.42)',
  },
  glassTopEdge: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },

  balance: { padding: 20, marginBottom: 16, borderRadius: 26 },
  period: { color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  paySub: { color: 'rgba(235,235,245,0.5)', fontSize: 14, marginTop: 4, fontWeight: '500' },
  nums: { flexDirection: 'row', marginTop: 14, gap: 12 },
  k: {
    color: 'rgba(235,235,245,0.5)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  v: { color: '#fff', fontSize: 30, fontWeight: '700', letterSpacing: -0.8, marginTop: 2 },
  good: { color: '#30d158' },
  bad: { color: '#ff453a' },

  group: { marginBottom: 18 },
  gHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 8,
    gap: 8,
  },
  gTitle: { color: '#fff', fontSize: 15, fontWeight: '650', flex: 1 },
  gSub: { color: 'rgba(235,235,245,0.5)', fontSize: 13 },

  rowOuter: { marginBottom: 8 },
  itemCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(32,32,38,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  itemCardEdge: {
    position: 'absolute',
    top: 0,
    left: 10,
    right: 10,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  rowWrap: { position: 'relative', overflow: 'hidden' },
  revealLeft: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a84ff',
    justifyContent: 'center',
    paddingLeft: 18,
  },
  revealRight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ff453a',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 18,
  },
  revealTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 62,
    paddingRight: 10,
    backgroundColor: 'rgba(28,28,34,0.96)',
  },
  itemPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 14,
    gap: 8,
  },
  when: { width: 36, color: 'rgba(235,235,245,0.5)', fontSize: 16, fontWeight: '650' },
  mid: { flex: 1, minWidth: 0 },
  itemTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  meta: { color: 'rgba(235,235,245,0.4)', fontSize: 12, marginTop: 2 },
  amt: { color: '#fff', fontSize: 16, fontWeight: '650', marginRight: 6 },
  status: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  chevMini: { color: 'rgba(235,235,245,0.35)', fontSize: 18 },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  totalL: { color: 'rgba(235,235,245,0.5)' },
  totalV: { color: '#ffd60a', fontWeight: '700' },
  empty: { color: 'rgba(235,235,245,0.4)', textAlign: 'center', padding: 20 },

  dock: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 28 : 16,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  capsuleWrap: { flex: 1 },
  segCap: {
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'rgba(28,28,34,0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  segCapBg: { ...StyleSheet.absoluteFillObject },
  segCapRow: { flex: 1, flexDirection: 'row', padding: 5 },
  seg: { flex: 1, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  segInd: {
    position: 'absolute',
    top: 5,
    left: 5,
    bottom: 5,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  segTxt: { color: 'rgba(235,235,245,0.45)', fontSize: 15, fontWeight: '650' },
  segTxtOn: { color: '#fff' },
  gearDock: { width: 64, height: 64 },
  gearInner: {
    flex: 1,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearIcon: { fontSize: 22, color: '#fff' },

  sheetBack: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderRadius: 28,
    marginHorizontal: 8,
    marginBottom: 16,
    paddingHorizontal: 18,
    paddingBottom: 8,
    maxHeight: SCREEN_H * 0.86,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  sheetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  link: { fontWeight: '650', fontSize: 17 },
  linkMuted: { color: 'rgba(235,235,245,0.5)', fontSize: 17 },

  field: { marginBottom: 12 },
  label: {
    color: 'rgba(235,235,245,0.5)',
    fontSize: 12,
    fontWeight: '650',
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputText: { color: '#fff', fontSize: 16 },
  chev: { color: 'rgba(235,235,245,0.35)', fontSize: 18 },

  actBtn: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 22,
    minHeight: 54,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  statusPaidBtn: { backgroundColor: 'rgba(48,209,88,0.2)' },
  statusMissBtn: { backgroundColor: 'rgba(255,69,58,0.12)' },
  actBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '600' },
  hint: {
    color: 'rgba(235,235,245,0.42)',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },

  setItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 60,
    borderRadius: 20,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  setL: { color: '#fff', fontSize: 16 },
  setS: { color: 'rgba(235,235,245,0.42)', fontSize: 12, marginTop: 2 },

  holdPill: {
    position: 'absolute',
    right: 4,
    top: 4,
    bottom: 4,
    width: 46,
    flexDirection: 'column',
    borderRadius: 22,
    backgroundColor: 'rgba(22,22,28,0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    zIndex: 5,
  },
  holdOpt: {
    flex: 1,
    margin: 3,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },

  anRow: {
    paddingVertical: 10,
    gap: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  anTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  anFill: { height: 6, borderRadius: 3 },

  segRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  chipOn: { backgroundColor: 'rgba(48,209,88,0.28)' },
  chipTxt: { color: 'rgba(235,235,245,0.5)', fontSize: 13, fontWeight: '600' },
  chipTxtOn: { color: '#fff' },

  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 10, flexWrap: 'wrap' },
  colorDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotOn: { borderColor: '#fff' },
  hueTrack: {
    flexDirection: 'row',
    height: 32,
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 6,
  },
  hueSeg: { flex: 1 },
  sliderRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  lightChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
  },
  stat: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },

  wheelBack: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  wheelCard: {
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    alignItems: 'center',
  },
  wheelBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
   paddingVertical: 12,
  },
});