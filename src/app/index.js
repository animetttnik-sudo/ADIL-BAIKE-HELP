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
 * Worklets-плагин Babel подключает babel-preset-expo автоматически (SDK 57),
 * отдельный babel.config.js не нужен.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
    Alert,
    AppState,
    Dimensions, ImageBackground,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import 'react-native-gesture-handler';
import {
    Gesture,
    GestureDetector,
    GestureHandlerRootView,
    ScrollView,
} from 'react-native-gesture-handler';
import Animated, {
    Easing,
    Extrapolation,
    FadeIn,
    FadeOut,
    interpolate,
    interpolateColor,
    LayoutAnimationConfig,
    LinearTransition,
    useAnimatedKeyboard,
    useAnimatedReaction,
    useAnimatedStyle, useReducedMotion, useSharedValue,
    withSequence,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { PLAN_BLOCKS, PLAN_ID } from '../lib/plan2026';
import {
  carryInState,
  defaultPayday,
  expensesInPeriod,
  pagerRange,
  paydayMode,
  paydayTotals,
  shouldAutoAdvance,
  summaryView,
  toggledStatus,
  undoCarry,
} from '../lib/totals';
import { applyImport, monthTitle, previewImport } from '../lib/planImport';
import {
    CALC_ITEMS,
    CALC_KEY,
    DEFAULT_RATES,
    DEFAULT_STAFF,
    RATE_FIELDS,
    computeCalc,
    hasCounts,
    itemTotal,
    ownPay,
    shiftTitle,
} from '../lib/calc';
import {
  KEY,
  ANCHOR,
  MONTHS,
  MONTHS_R,
  DOW,
  pad,
  iso,
  parse,
  addDays,
  fmtDay,
  fmtShort,
  money,
  uid,
  todayIso,
  allPaydays,
  PAYDAYS,
  paydayOnOrBefore,
  workPeriod,
  paydaysInMonth,
  periodsTouchingMonth,
  defaultState,
  seedMonth,
  seedPaydays,
  paydayForDate,
  normalizeApp,
} from '../lib/periods';
import { CALC_TITLES, isLinkedShift, syncCalcShifts } from '../lib/link';

// expo-glass-effect — опционально
let GlassView = null;
let isLiquidGlassAvailable = () => false;
try {
  const eg = require('expo-glass-effect');
  GlassView = eg.GlassView;
  isLiquidGlassAvailable = eg.isLiquidGlassAvailable || (() => false);
} catch (_) {}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SWIPE = 72;
const SWIPE_TRIGGER = SWIPE * 0.8;
const ACCENT_PRESETS = [{ h: 145 }, { h: 210 }, { h: 280 }, { h: 30 }, { h: 350 }, { h: 190 }];
const INIT_Y = 2026;
const INIT_M = 8;

// старый ✕ ('missed', «не оплатил вовремя») показывается как неотмеченный
function displayStatus(e) {
  return e.status === 'paid' ? 'paid' : 'none';
}

// Пружины с критическим демпфированием + overshootClamping — без перелёта
// (раньше ζ≈0.7–0.8 давал 2–4% перелёт: мигание противоположной подложки
// у строк и «сплющивание» плашки капсулы о край).
const spring = { damping: 28, stiffness: 220, mass: 0.85, overshootClamping: true };
const softSpring = { damping: 28, stiffness: 190, overshootClamping: true };
const capSpring = { damping: 26, stiffness: 180, mass: 0.9, overshootClamping: true };
const SHEET_IN = { duration: 320, easing: Easing.out(Easing.cubic) };
const SHEET_OUT = { duration: 220, easing: Easing.in(Easing.cubic) };
const BACK_IN = { duration: 240 };

const hapticMedium = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
const hapticSelect = () => Haptics.selectionAsync();

/** Резинка: до SWIPE — 1:1, дальше — нарастающее сопротивление (макс. +36px). */
function rubber(t) {
  'worklet';
  const a = Math.abs(t);
  if (a <= SWIPE) return t;
  const over = a - SWIPE;
  return Math.sign(t) * (SWIPE + 36 * (1 - Math.exp(-over / 90)));
}

/** Горизонтальный свайп строки: вправо — onEdit, влево — onDelete. */
function useRowSwipe(x, id, onEdit, onDelete) {
  return useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-14, 14])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          x.value = rubber(e.translationX);
        })
        .onEnd((e, success) => {
          if (success && e.translationX > SWIPE_TRIGGER) {
            x.value = withSpring(0, softSpring);
            scheduleOnRN(onEdit, id);
          } else if (success && e.translationX < -SWIPE_TRIGGER) {
            x.value = withSpring(0, softSpring);
            scheduleOnRN(onDelete, id);
          } else {
            x.value = withSpring(0, spring);
          }
        }),
    [x, id, onEdit, onDelete]
  );
}

const LG = typeof isLiquidGlassAvailable === 'function' ? !!isLiquidGlassAvailable() : false;

/** Стекло: BlurView + слои. Нативный GlassView — только если реально доступен. */
function Glass({ children, style, intensity = 38, tint, tintFallback, interactive = false }) {
  if (LG && GlassView) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        tintColor={tint}
        isInteractive={interactive}
        style={[styles.glassBase, style]}
      >
        {children}
      </GlassView>
    );
  }
  // запасной вариант (нет Liquid Glass): blur + подкраска + блик сверху + тонкая кромка
  const r = StyleSheet.flatten(style)?.borderRadius;
  return (
    <View style={[styles.glassBase, style]}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.glassFill} pointerEvents="none" />
      {tint ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tintFallback || tint }]} pointerEvents="none" />
      ) : null}
      <View style={styles.glassTopEdge} pointerEvents="none" />
      <View style={[styles.glassBorder, r != null && { borderRadius: r }]} pointerEvents="none" />
      {children}
    </View>
  );
}

// Цветное стекло: GlassView/BlurView как у дока + плотная цветная заливка сестринским слоем
// (не opacity родителя — она ломает стекло) + блик сверху и светлая кромка.
// Один tintColor у GlassView в Expo Go почти не виден — поэтому заливка.
function TintGlass({ style, fill, radius, interactive = false, children }) {
  return (
    <Glass style={[style, { borderRadius: radius }]} intensity={50} interactive={interactive}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      <View
        pointerEvents="none"
        style={[styles.tgShine, { borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tgEdge, { borderRadius: radius }]} />
      {children}
    </Glass>
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

/** Полоска прогресса (0…1); ширина плавно доезжает пружиной на UI-потоке. */
function Meter({ value, color }) {
  const w = useSharedValue(0);
  const p = useSharedValue(0);
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  useEffect(() => {
    p.value = withSpring(v, softSpring);
  }, [v, p]);
  const fill = useAnimatedStyle(() => ({ width: w.value * p.value }));
  return (
    <View
      style={styles.meter}
      onLayout={(e) => {
        w.value = e.nativeEvent.layout.width;
      }}
    >
      <Animated.View style={[styles.meterFill, { backgroundColor: color }, fill]} />
    </View>
  );
}

/** Подпись + число в итоговой карточке. */
function Stat({ k, v, tone }) {
  return (
    <View style={styles.stat3}>
      <Text style={styles.k} numberOfLines={1}>
        {k}
      </Text>
      <Text
        style={[styles.statV, tone === 'good' && styles.good, tone === 'bad' && styles.bad]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {v}
      </Text>
    </View>
  );
}

/** Скролл открытой шторки — чтобы поле в фокусе («Далее ›») было над клавиатурой. */
const sheetScroll = { ref: null, y: 0 };
function ensureSheetVisible(input) {
  const sv = sheetScroll.ref;
  if (!input || !sv || !input.measureInWindow || !Keyboard.isVisible()) return;
  const kb = Keyboard.metrics();
  if (!kb) return;
  input.measureInWindow((x, y, w, h) => {
    sv.measureInWindow((sx, sy) => {
      const bottom = kb.screenY - KB_BAR_H - 14;
      const top = sy + 8;
      let delta = 0;
      if (y + h > bottom) delta = y + h - bottom;
      else if (y < top) delta = y - top;
      if (Math.abs(delta) > 1) sv.scrollTo({ y: Math.max(0, sheetScroll.y + delta), animated: true });
    });
  });
}

/**
 * Единый хост для всех шторок: ОДИН Modal (animationType="none"), содержимое
 * меняется внутри. iOS не может показать новый Modal, пока предыдущий ещё
 * закрывается — поэтому переключение между шторками раньше «терялось».
 * Затемнение и сдвиг шторки анимируются здесь сами (без SlideInDown и fade
 * Modal'а, чтобы blur не «проявлялся» в конце).
 *
 * active   — ключ шторки, которую нужно показать (или null)
 * render   — (key) => { title, right, onClose, body }
 * onClosed — вызывается после полного закрытия (Modal уже скрыт)
 */
function SheetHost({ active, render, onClosed }) {
  const [shown, setShown] = useState(null);
  const [gen, setGen] = useState(0);
  const ty = useSharedValue(SCREEN_H);
  const back = useSharedValue(0);

  const activeRef = useRef(active);
  activeRef.current = active;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const leaving = useRef(false);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const closedPending = useRef(false);

  const fireClosed = useCallback(() => {
    if (!closedPending.current) return;
    closedPending.current = false;
    onClosedRef.current?.();
  }, []);

  // Завершение «ухода» текущей шторки: показать следующую или закрыть Modal.
  const settle = useCallback(() => {
    leaving.current = false;
    const a = activeRef.current;
    if (a) {
      closedPending.current = false;
      setShown(a);
      setGen((g) => g + 1);
    } else {
      // шторка скрыта — сразу сбрасываем позицию (иначе при следующем
      // открытии первый кадр был бы со старым смещением)
      ty.value = SCREEN_H;
      back.value = 0;
      closedPending.current = true;
      setShown(null);
      // запасной вариант, если onDismiss не придёт
      setTimeout(fireClosed, 450);
    }
  }, [fireClosed, ty, back]);

  useEffect(() => {
    if (leaving.current) return; // settle() сам возьмёт актуальный active
    const cur = shownRef.current;
    if (active === cur) return;
    if (!cur) {
      settle();
      return;
    }
    leaving.current = true;
    if (!active) back.value = withTiming(0, SHEET_OUT);
    ty.value = withTiming(SCREEN_H, SHEET_OUT, () => {
      'worklet';
      scheduleOnRN(settle);
    });
  }, [active, settle, ty, back]);

  useEffect(() => {
    if (!gen) return;
    back.value = withTiming(1, BACK_IN);
    ty.value = withTiming(0, SHEET_IN);
  }, [gen, ty, back]);

  const cfg = shown ? render(shown) : null;
  const closeRef = useRef(null);
  closeRef.current = cfg ? cfg.onClose : null;
  const requestClose = useCallback(() => {
    closeRef.current?.();
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          ty.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          if (e.translationY > 110 || e.velocityY > 900) {
            scheduleOnRN(requestClose);
          } else {
            ty.value = withSpring(0, spring);
          }
        }),
    [ty, requestClose]
  );

  const drag = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  const dim = useAnimatedStyle(() => ({ opacity: back.value }));

  return (
    <Modal
      visible={!!shown}
      animationType="none"
      transparent
      onRequestClose={requestClose}
      onDismiss={fireClosed}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.sheetBack}>
          <Animated.View style={[styles.sheetDim, dim]} pointerEvents="none" />
          <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} />
          {cfg && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <Animated.View style={drag}>
                <Glass style={styles.sheet} intensity={48}>
                  <GestureDetector gesture={pan}>
                    <View collapsable={false}>
                      <View style={styles.handle} />
                      <View style={styles.sheetBar}>
                        <Pressable onPress={requestClose} hitSlop={14}>
                          <Text style={styles.linkMuted}>Закрыть</Text>
                        </Pressable>
                        <Text style={styles.sheetTitle}>{cfg.title}</Text>
                        {cfg.right || <View style={{ width: 70 }} />}
                      </View>
                    </View>
                  </GestureDetector>
                  <ScrollView
                    key={shown}
                    ref={(r) => {
                      sheetScroll.ref = r;
                      if (!r) sheetScroll.y = 0;
                    }}
                    scrollEventThrottle={16}
                    onScroll={(e) => {
                      sheetScroll.y = e.nativeEvent.contentOffset.y;
                    }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    contentContainerStyle={{ paddingBottom: 40 + KB_BAR_H }}
                    showsVerticalScrollIndicator={false}
                    style={{ flexShrink: 1 }}
                  >
                    {cfg.body}
                  </ScrollView>
                </Glass>
              </Animated.View>
            </KeyboardAvoidingView>
          )}
          <KeyBarHost scope="sheet" />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function DateWheel({ value, onChange, label = 'Дата', accent = '#30d158' }) {
  const [open, setOpen] = useState(false);
  const initial = useRef(value);
  const ty = useSharedValue(SCREEN_H);
  const back = useSharedValue(0);
  const date = value ? parse(value) : new Date();

  useEffect(() => {
    if (open) {
      back.value = withTiming(1, BACK_IN);
      ty.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    }
  }, [open, ty, back]);

  const show = () => {
    Haptics.selectionAsync();
    initial.current = value;
    ty.value = SCREEN_H;
    back.value = 0;
    setOpen(true);
  };
  const hide = useCallback(() => {
    back.value = withTiming(0, SHEET_OUT);
    ty.value = withTiming(SCREEN_H, SHEET_OUT, () => {
      'worklet';
      scheduleOnRN(setOpen, false);
    });
  }, [ty, back]);

  const card = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  const dim = useAnimatedStyle(() => ({ opacity: back.value }));

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={({ pressed }) => [styles.input, styles.dateField, pressed && styles.rowPressed]} onPress={show}>
        <Text style={styles.inputText}>
          {fmtShort(value || iso(date))} {date.getFullYear()}
          <Text style={styles.dateDow}>  ·  {DOW[date.getDay()]}</Text>
        </Text>
        <Text style={styles.chev}>›</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="none" onRequestClose={hide}>
        <View style={styles.wheelBack}>
          <Animated.View style={[styles.wheelDim, dim]} pointerEvents="none" />
          <Pressable style={StyleSheet.absoluteFill} onPress={hide} />
          <Animated.View
            onStartShouldSetResponder={() => true}
            style={[styles.wheelCard, card]}
          >
            <View style={styles.handle} />
            <View style={styles.wheelBar}>
              <Pressable
                hitSlop={10}
                onPress={() => {
                  if (initial.current && initial.current !== value) onChange(initial.current);
                  hide();
                }}
              >
                <Text style={styles.linkMuted}>Отмена</Text>
              </Pressable>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable
                hitSlop={10}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  hide();
                }}
              >
                <Text style={[styles.link, { color: accent }]}>Готово</Text>
              </Pressable>
            </View>
            <View style={styles.wheelChips}>
              {[
                ['Вчера', -1],
                ['Сегодня', 0],
                ['Завтра', 1],
              ].map(([t, d]) => {
                const v = addDays(todayIso(), d);
                const on = v === value;
                return (
                  <ScaleButton
                    key={t}
                    style={[styles.chip, styles.wheelChip, on && { backgroundColor: accent }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      onChange(v);
                    }}
                  >
                    <Text style={[styles.chipTxt, on ? styles.onAccent : styles.chipTxtOn]}>{t}</Text>
                  </ScaleButton>
                );
              })}
            </View>
            <DateTimePicker
              value={date}
              mode="date"
              display="spinner"
              locale="ru-RU"
              themeVariant="dark"
              onChange={(_, d) => d && onChange(iso(d))}
              style={{ height: 200, width: SCREEN_W - 40 }}
            />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const ROW_ENTER = FadeIn.duration(220);
const ROW_EXIT = FadeOut.duration(180);
const ROW_LAYOUT = LinearTransition.duration(220);

const STATUS_IN = { duration: 200, easing: Easing.out(Easing.cubic) };

// ── Остров статуса ──────────────────────────────────────────────────────
// Удержание кнопки статуса → над ней (или под ней у верха экрана) стеклянный остров,
// как док: внутри по дуге ✓ / → / ○ и стеклянная плашка выбора, которая едет за пальцем.
// Отпустили на варианте — выбран; отпустили, не доведя до варианта, — остров просто исчезает.
const ISL_W = 236;
const ISL_H = 84;
const ISL_R = ISL_H / 2;
const ISL_OPT = 54; // диаметр варианта
const ISL_PILL = 66; // плашка выбора
const ISL_X = [46, 118, 190]; // центры вариантов от левого края острова
const ISL_BEND = [7, -7, 7]; // дуга: середина дальше от кнопки, края ближе
const ISL_GAP = 16; // зазор между кнопкой и островом
const ISL_FLIP_Y = 240; // кнопка выше — остров открывается вниз
const ISL_BAND = 14; // насколько ниже/выше острова палец ещё «на острове»
const ISL_SPRING = { damping: 26, stiffness: 340, mass: 0.7, overshootClamping: true };
const ISL_FILL = ['#30d158', 'rgba(30,110,190,0.9)', 'rgba(58,58,66,0.95)']; // ✓ зелёный · → синий из b5072bf · ○ пусто

/** Вариант под пальцем: −1 — ни один. lx/ly — от левого края / центра острова. */
function islandHit(px, py, left, midY, dir, cx, cy) {
  'worklet';
  const bx = px - cx;
  const by = py - cy;
  if (bx * bx + by * by < 30 * 30) return -1; // палец на самой кнопке
  const lx = px - left;
  const ly = (py - midY) * dir; // >0 — в сторону кнопки
  if (ly > ISL_H / 2 + ISL_BAND || ly < -(ISL_H / 2 + 40)) return -1;
  if (lx < -24 || lx > ISL_W + 24) return -1;
  let best = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(lx - ISL_X[i]) < Math.abs(lx - ISL_X[best])) best = i;
  return best;
}

/**
 * Общие shared values острова (создаются один раз в App). Кнопки пишут в них из жестов
 * на UI-потоке, оверлей <IslandMenu> читает — список при этом не перерисовывается.
 */
function useArcCtl(onPick) {
  const open = useSharedValue(0);
  const cx = useSharedValue(0);
  const cy = useSharedValue(0);
  const left = useSharedValue(0); // левый край острова (окно)
  const midY = useSharedValue(0); // центр острова по вертикали (окно)
  const dir = useSharedValue(1); // 1 — остров над кнопкой, −1 — под ней
  const hover = useSharedValue(-1);
  const cur = useSharedValue(-1); // текущий статус расхода (0 или 2)
  const hold = useSharedValue(0); // палец держит кнопку с островом (сразу, без анимации) — пейджер не листает
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  return useMemo(
    () => ({ open, cx, cy, left, midY, dir, hover, cur, hold, pick: (id, i) => pickRef.current(id, i) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
}

/**
 * Кнопка статуса — как в самом первом варианте (e937f17): мягкий зелёный круг с кромкой,
 * зелёное кольцо; оплачено — сплошной зелёный кружок с ✓.
 *  • тап — ✓/пусто;
 *  • удержание 400 мс — остров; не отпуская, ведите к варианту и отпустите;
 *  • любой сдвиг пальца до 400 мс (скролл, листание) — жесты кнопки отваливаются.
 */
const StatusButton = memo(function StatusButton({ id, status, onToggle, arc }) {
  const paid = useSharedValue(status === 'paid' ? 1 : 0);
  const press = useSharedValue(0);
  const { open, cx, cy, left, midY, dir, hover, cur, hold, pick } = arc;
  const curIdx = status === 'paid' ? 0 : 2;

  useEffect(() => {
    paid.value = withTiming(status === 'paid' ? 1 : 0, STATUS_IN);
  }, [status, paid]);

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(id);
  }, [id, onToggle]);

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDistance(10)
      .onBegin(() => {
        press.value = withTiming(1, { duration: 90 });
      })
      .onEnd((_e, ok) => {
        if (ok) scheduleOnRN(toggle);
      })
      .onFinalize(() => {
        press.value = withTiming(0, { duration: 160 });
      });
    const hold = Gesture.Pan()
      .activateAfterLongPress(400)
      .onStart((e) => {
        // центр кнопки в координатах окна (детектор = зона 52×52)
        const x0 = e.absoluteX - e.x + 26;
        const y0 = e.absoluteY - e.y + 26;
        const d = y0 < ISL_FLIP_Y ? -1 : 1;
        hold.value = 1;
        cx.value = x0;
        cy.value = y0;
        dir.value = d;
        left.value = Math.min(Math.max(12, x0 - ISL_W / 2), SCREEN_W - 12 - ISL_W);
        midY.value = y0 - d * (26 + ISL_GAP + ISL_H / 2);
        cur.value = curIdx;
        hover.value = -1;
        press.value = withTiming(0, { duration: 160 });
        open.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
        scheduleOnRN(hapticMedium);
      })
      .onUpdate((e) => {
        const h = islandHit(e.absoluteX, e.absoluteY, left.value, midY.value, dir.value, cx.value, cy.value);
        if (h !== hover.value) {
          hover.value = h;
          if (h >= 0) scheduleOnRN(hapticSelect);
        }
      })
      .onEnd(() => {
        const h = hover.value;
        if (h >= 0) scheduleOnRN(pick, id, h);
      })
      .onFinalize(() => {
        // отпустили (или жест отменён) — остров исчезает в любом случае
        if (hold.value) open.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.quad) });
        hold.value = 0;
        hover.value = -1;
      });
    return Gesture.Exclusive(hold, tap);
  }, [press, toggle, open, cx, cy, left, midY, dir, hover, cur, hold, pick, id, curIdx]);

  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.1 * press.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 1 - paid.value }));
  const paidStyle = useAnimatedStyle(() => ({
    opacity: paid.value,
    transform: [{ scale: 0.55 + 0.45 * paid.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={styles.sBtnHit}>
        <Animated.View style={[styles.sBtn, btnStyle]}>
          <View style={styles.sBtnEdge} pointerEvents="none" />
          <Animated.View style={[styles.sRing, ringStyle]} />
          <Animated.View style={[styles.sFill, styles.sFillPaid, paidStyle]}>
            <Text style={styles.sGlyph}>✓</Text>
          </Animated.View>
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

/** Вариант внутри острова: цветной круг; под пальцем чуть растёт. */
function IslandOption({ i, arc }) {
  const { hover, cur, dir } = arc;
  const h = useSharedValue(0);
  useAnimatedReaction(
    () => hover.value === i,
    (on, was) => {
      if (on !== was) h.value = withSpring(on ? 1 : 0, ISL_SPRING);
    }
  );
  const st = useAnimatedStyle(() => ({
    transform: [{ translateY: ISL_BEND[i] * dir.value }, { scale: 1 + 0.14 * h.value }],
  }));
  const ring = useAnimatedStyle(() => ({ opacity: cur.value === i ? 1 : 0 }));
  return (
    <Animated.View style={[styles.islOpt, { left: ISL_X[i] - ISL_OPT / 2 }, st]}>
      <View style={[styles.islDot, { backgroundColor: ISL_FILL[i] }]}>
        <View style={styles.islDotShine} />
        {i === 2 ? <View style={styles.islEmpty} /> : <Text style={styles.islGlyph}>{i === 0 ? '✓' : '→'}</Text>}
      </View>
      <Animated.View style={[styles.islCur, ring]} />
    </Animated.View>
  );
}

/** Оверлей острова поверх всего; касаний не ловит — палец всё время у жеста кнопки. */
const IslandMenu = memo(function IslandMenu({ arc }) {
  const { open, left, midY, dir, hover } = arc;
  const sel = useSharedValue(0);
  const selOn = useSharedValue(0);
  useAnimatedReaction(
    () => hover.value,
    (h, was) => {
      if (h === was) return;
      if (h >= 0) {
        // первая цель — плашка появляется на месте, дальше едет как плашка дока
        if (selOn.value < 0.05) sel.value = h;
        else sel.value = withSpring(h, ISL_SPRING);
        selOn.value = withTiming(1, { duration: 120 });
      } else {
        selOn.value = withTiming(0, { duration: 120 });
      }
    }
  );
  const back = useAnimatedStyle(() => ({ opacity: open.value }));
  // стекло не делаем полупрозрачным: видимость ступенькой, появление — рост из кнопки
  const box = useAnimatedStyle(() => {
    const o = open.value;
    return {
      opacity: o > 0.02 ? 1 : 0,
      transform: [
        { translateX: left.value },
        { translateY: midY.value - ISL_H / 2 + dir.value * 26 * (1 - o) },
        { scale: 0.55 + 0.45 * o },
      ],
    };
  });
  const pill = useAnimatedStyle(() => {
    // позиция плашки — интерполяция по центрам вариантов (с дугой)
    const s = sel.value;
    const k = Math.min(1, Math.max(0, s - Math.floor(s)));
    const a = Math.min(2, Math.floor(s));
    const b = Math.min(2, a + 1);
    const x = ISL_X[a] + (ISL_X[b] - ISL_X[a]) * k;
    const y = (ISL_BEND[a] + (ISL_BEND[b] - ISL_BEND[a]) * k) * dir.value;
    return {
      opacity: selOn.value,
      transform: [
        { translateX: x - ISL_PILL / 2 },
        { translateY: ISL_H / 2 - ISL_PILL / 2 + y },
        { scale: 0.85 + 0.15 * selOn.value },
      ],
    };
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.menuBack, back]} />
      <Animated.View style={[styles.islBox, box]}>
        <TintGlass style={styles.island} fill="rgba(30,30,38,0.62)" radius={ISL_R} interactive>
          <Animated.View style={[styles.islPill, pill]}>
            <View style={styles.segIndEdge} />
          </Animated.View>
          <IslandOption i={0} arc={arc} />
          <IslandOption i={1} arc={arc} />
          <IslandOption i={2} arc={arc} />
        </TintGlass>
      </Animated.View>
    </View>
  );
});

/** Короткая плашка «Перенесено на …» с «Отменить». */
function Toast({ toast, onUndo, onHide }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onHide, 4000);
    return () => clearTimeout(t);
  }, [toast, onHide]);
  if (!toast) return null;
  return (
    <Animated.View
      key={toast.k}
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(160)}
      style={styles.toastWrap}
      pointerEvents="box-none"
    >
      <Glass style={styles.toast} intensity={60}>
        <Text style={styles.toastTxt} numberOfLines={1}>{toast.text}</Text>
        {toast.undo ? (
          <Pressable hitSlop={10} onPress={onUndo}>
            <Text style={styles.toastBtn}>Отменить</Text>
          </Pressable>
        ) : null}
      </Glass>
    </Animated.View>
  );
}

// уход карточки (перенос/удаление): лёгкое затухание + поджатие, соседи съезжают ROW_LAYOUT
const CARD_EXIT = () => {
  'worklet';
  const t = { duration: 240, easing: Easing.out(Easing.cubic) };
  return {
    initialValues: { opacity: 1, transform: [{ translateX: 0 }, { scale: 1 }] },
    animations: {
      opacity: withTiming(0, t),
      transform: [{ translateX: withTiming(-28, t) }, { scale: withTiming(0.96, t) }],
    },
  };
};

/**
 * Отдельная стеклянная карточка расхода. Горизонтальный свайп отдан листанию зарплат,
 * поэтому: тап по карточке — изменить (там же «Удалить расход»), кнопка — статус.
 */
const ExpenseCard = memo(function ExpenseCard({ item, onEdit, onToggle, arc }) {
  const st = displayStatus(item);
  const id = item.id;
  const edit = useCallback(() => onEdit(id), [id, onEdit]);
  return (
    <Animated.View entering={ROW_ENTER} exiting={CARD_EXIT} layout={ROW_LAYOUT} style={styles.eCardOuter}>
      <Glass style={styles.eCard} intensity={34}>
        <Pressable style={({ pressed }) => [styles.itemPress, pressed && styles.rowPressed]} onPress={edit}>
          <View style={styles.whenCol}>
            <Text style={styles.whenNum}>{fmtDay(item.date)}</Text>
            <Text style={styles.whenDow}>{DOW[parse(item.date).getDay()]}</Text>
          </View>
          <View style={styles.mid}>
            <Text style={[styles.itemTitle, !item.title && styles.itemTitleDim]} numberOfLines={1}>
              {item.title || 'Без названия'}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.type === 'recurring' ? 'постоянный' : 'непредвиденный'}
              {st === 'paid' ? <Text style={styles.good}> · оплачено</Text> : null}
            </Text>
            {item.movedFrom ? (
              <Text style={styles.metaMoved} numberOfLines={1}>
                ↪ перенесено с {fmtShort(item.movedFrom)}
                {item.moves > 1 ? ` · ${item.moves}×` : ''}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.amt, st === 'paid' && styles.amtPaid]}>{money(item.amount)}</Text>
        </Pressable>
        <StatusButton id={id} status={st === 'paid' ? 'paid' : null} onToggle={onToggle} arc={arc} />
      </Glass>
    </Animated.View>
  );
});

const ShiftRow = memo(function ShiftRow({ item, last, onEdit, onDelete, onCalc, accent }) {
  const x = useSharedValue(0);
  const id = item.id;
  const pan = useRowSwipe(x, id, onEdit, onDelete);
  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const leftStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, SWIPE * 0.4], [0, 1], Extrapolation.CLAMP),
  }));
  const rightStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-SWIPE * 0.4, 0], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View entering={ROW_ENTER} exiting={ROW_EXIT} layout={ROW_LAYOUT}>
        <View style={[styles.rowWrap, !last && styles.rowSep]}>
          <Animated.View style={[styles.revealLeft, leftStyle]}>
            <Text style={styles.revealTxt}>{item.source === 'calc' ? 'Открыть' : 'Сумма'}</Text>
          </Animated.View>
          <Animated.View style={[styles.revealRight, rightStyle]}>
            <Text style={styles.revealTxt}>Убрать</Text>
          </Animated.View>
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.item, rowStyle]}>
              <Pressable style={styles.itemPress} onPress={() => onEdit(id)}>
                <View style={styles.whenCol}>
                  <Text style={styles.whenNum}>{fmtDay(item.date)}</Text>
                  <Text style={styles.whenDow}>{DOW[parse(item.date).getDay()]}</Text>
                </View>
                <View style={styles.mid}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.source === 'calc' ? (
                    <Pressable
                      hitSlop={8}
                      style={styles.calcBadge}
                      onPress={() => onCalc(item.calcDate || item.date)}
                    >
                      <Text style={[styles.calcBadgeTxt, { color: accent }]}>из расчёта ›</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.meta}>
                      {item.amount == null || item.amount === '' ? 'без суммы — тап, чтобы вписать' : 'вручную'}
                    </Text>
                  )}
                </View>
                <Text style={[styles.amt, (item.amount == null || item.amount === '') && styles.amtDim]}>
                  {item.amount == null || item.amount === '' ? '—' : money(item.amount)}
                </Text>
                <Text style={styles.chevMini}>›</Text>
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </View>
    </Animated.View>
  );
});

const APressable = Animated.createAnimatedComponent(Pressable);
/**
 * Кнопка с «нажатием» — только scale (без opacity: прозрачность родителя
 * ломает BlurView/GlassView на iOS). Небольшая задержка pressIn, чтобы кнопки
 * не сжимались, когда палец просто начинает скролл.
 */
function ScaleButton({ onPress, style, children }) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <APressable
      unstable_pressDelay={70}
      onPressIn={() => {
        scale.value = withTiming(0.96, { duration: 80 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 140 });
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
/** Подпись сегмента: яркость считается из позиции плашки на UI-потоке (без ожидания JS). */
function SegLabel({ label, index, pos, fontSize }) {
  const on = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(pos.value - index), [0, 0.6], [1, 0], Extrapolation.CLAMP),
  }));
  return (
    <View style={styles.seg} pointerEvents="none">
      <Text style={[styles.segTxt, fontSize && { fontSize }]} numberOfLines={1}>
        {label}
      </Text>
      <Animated.Text style={[styles.segTxt, styles.segTxtOn, styles.segTxtAbs, fontSize && { fontSize }, on]} numberOfLines={1}>
        {label}
      </Animated.Text>
    </View>
  );
}

/**
 * Сегмент-капсула (док и переключатели). Всё движение — на UI-потоке:
 * тап/свайп → плашка сразу едет пружиной (shared value), и только потом
 * через scheduleOnRN сообщаем JS (onChange). Жесты создаются один раз и
 * не пересоздаются на каждый рендер; «последнее выбранное» хранится в
 * shared value — быстрые тапы не путаются со старыми пропсами.
 * glass — настоящий Liquid Glass (GlassView, иначе BlurView) для дока.
 */
/** Смещение и время перехода между вкладками дока. */
const TAB_SHIFT = 28;
const TAB_IN = { duration: 260, easing: Easing.out(Easing.cubic) };
const TAB_OUT = { duration: 200, easing: Easing.out(Easing.quad) };
const TAB_FADE = { duration: 180, easing: Easing.inOut(Easing.quad) };

/**
 * Вкладка: всегда смонтирована и разложена (без display:none — иначе при показе
 * Yoga заново раскладывает всё дерево вкладки в кадре переключения, это и был «лаг»).
 * Видимость/сдвиг — только shared values на UI-потоке.
 */
const TabPane = memo(function TabPane({ vis, x, active, reduce, children }) {
  const st = useAnimatedStyle(() => {
    const v = vis.value;
    return {
      opacity: v,
      transform: reduce ? [] : [{ translateX: x.value }, { scale: 0.985 + 0.015 * v }],
    };
  });
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, st]}
      pointerEvents={active ? 'auto' : 'none'}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    >
      {children}
    </Animated.View>
  );
});

function SegmentCapsule({ value, labels, onChange, onPickUI, height = 56, glass = false, fontSize }) {
  const n = labels.length;
  const segW = useSharedValue(0);
  const [measured, setMeasured] = useState(false);
  const pos = useSharedValue(value);
  const target = useSharedValue(value);
  const drag0 = useSharedValue(0);
  const press = useSharedValue(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const commit = useCallback((p) => {
    Haptics.selectionAsync();
    onChangeRef.current(p);
  }, []);

  // внешняя смена value (не нашим жестом) — плавно доехать
  useEffect(() => {
    if (target.value !== value) {
      target.value = value;
      pos.value = withSpring(value, capSpring);
    }
  }, [value, pos, target]);

  const gesture = useMemo(() => {
    const pick = (p) => {
      'worklet';
      pos.value = withSpring(p, capSpring);
      if (p !== target.value) {
        target.value = p;
        // контент вкладок стартует в этом же кадре UI-потока, JS — следом
        if (onPickUI) onPickUI(p);
        scheduleOnRN(commit, p);
      }
    };
    const tap = Gesture.Tap()
      .maxDuration(5000)
      .onBegin(() => {
        press.value = withTiming(1, { duration: 90 });
      })
      .onEnd((e, ok) => {
        const w = segW.value;
        if (!ok || w <= 0) return;
        pick(Math.max(0, Math.min(n - 1, Math.floor((e.x - 5) / w))));
      })
      .onFinalize(() => {
        press.value = withTiming(0, { duration: 160 });
      });
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-14, 14])
      .onBegin(() => {
        drag0.value = pos.value;
      })
      .onStart(() => {
        press.value = withTiming(1, { duration: 90 });
      })
      .onUpdate((e) => {
        const w = Math.max(segW.value, 1);
        pos.value = Math.max(-0.08, Math.min(n - 0.92, drag0.value + e.translationX / w));
      })
      .onEnd((e) => {
        const projected = pos.value + e.velocityX / 5000;
        pick(Math.max(0, Math.min(n - 1, Math.round(projected))));
      })
      .onFinalize(() => {
        press.value = withTiming(0, { duration: 160 });
      });
    return Gesture.Race(pan, tap);
  }, [n, pos, target, drag0, press, segW, commit, onPickUI]);

  const ind = useAnimatedStyle(() => ({
    width: segW.value,
    transform: [{ translateX: pos.value * segW.value }, { scale: 1 + press.value * 0.04 }],
  }));

  const Wrap = glass ? Glass : View;
  return (
    <Wrap
      style={[glass ? styles.segCapGlass : styles.segCap, { height, borderRadius: height / 2 }]}
      intensity={50}
    >
      <GestureDetector gesture={gesture}>
        <View
          style={styles.segCapRow}
          collapsable={false}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            segW.value = (w - 10) / n;
            if (!measured) setMeasured(true);
          }}
        >
          {/* плашку рисуем только после замера ширины — без «прыжка» */}
          {measured && (
            <Animated.View pointerEvents="none" style={[styles.segInd, { borderRadius: (height - 10) / 2 }, ind]}>
              <View style={styles.segIndEdge} />
            </Animated.View>
          )}
          {labels.map((lab, i) => (
            <SegLabel key={lab} label={lab} index={i} pos={pos} fontSize={fontSize} />
          ))}
        </View>
      </GestureDetector>
    </Wrap>
  );
}

const AN_RANGES = [3, 6, 0];
function AnalysisView({ state, accent }) {
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
      <View style={{ marginBottom: 14 }}>
        <SegmentCapsule
          value={AN_RANGES.indexOf(range)}
          labels={['3 мес', '6 мес', 'Всё']}
          height={46}
          onChange={(i) => setRange(AN_RANGES[i])}
        />
      </View>
      {ks.length === 0 ? (
        <Text style={styles.empty}>Пока нет данных</Text>
      ) : (
        <>
          <ItemCard style={[styles.listCard, styles.padCard]}>
            <Text style={styles.k}>Итог за период</Text>
            <Text
              style={[styles.bigPay, { marginTop: 4, color: te - ts >= 0 ? accent : '#ff453a' }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {te - ts < 0 ? '−' : '+'}
              {money(Math.abs(te - ts))}
            </Text>
            <View style={styles.statRow}>
              <Stat k="Заработано" v={money(te)} tone="good" />
              <Stat k="Оплачено" v={money(ts)} />
            </View>
          </ItemCard>
          <Text style={styles.sectionLabel}>По месяцам</Text>
          <ItemCard style={styles.listCard}>
            {ks.map((k, i) => (
              <View key={k} style={[styles.anRow, i === ks.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={styles.lTitle}>{name(k)}</Text>
                  <Text style={[styles.lVal, net(k) >= 0 ? styles.good : styles.bad]}>
                    {net(k) >= 0 ? '+' : '−'}
                    {money(Math.abs(net(k)))}
                  </Text>
                </View>
                <View style={styles.anTrack}>
                  <View style={[styles.anFill, { width: `${(M[k].e / mx) * 100}%`, backgroundColor: '#30d158' }]} />
                </View>
                <View style={styles.anTrack}>
                  <View style={[styles.anFill, { width: `${(M[k].s / mx) * 100}%`, backgroundColor: '#ff453a' }]} />
                </View>
                <Text style={styles.lSub}>
                  заработано {money(M[k].e)} · оплачено {money(M[k].s)}
                </Text>
              </View>
            ))}
          </ItemCard>
          {ks.length > 0 && (
            <ItemCard style={styles.listCard}>
              <View style={[styles.lRow, ks.length > 1 && styles.lRowSep]}>
                <Text style={styles.lKey}>Лучший месяц</Text>
                <Text style={styles.lVal}>
                  {name(by[0])} · {money(net(by[0]))}
                </Text>
              </View>
              {ks.length > 1 && (
                <View style={styles.lRow}>
                  <Text style={styles.lKey}>Худший месяц</Text>
                  <Text style={styles.lVal}>
                    {name(by[by.length - 1])} · {money(net(by[by.length - 1]))}
                  </Text>
                </View>
              )}
            </ItemCard>
          )}
        </>
      )}
    </>
  );
}

// ───────────────────────── Расчёт смены ─────────────────────────

const fmtNumF = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const fmtNum = (n) => fmtNumF.format(Number(n) || 0);
const ROLE_LABELS = ['Рядовой', 'Кассир'];
const TIME_LABELS = ['День', 'Ночь'];
const EMPTY_COUNTS = {};
const CALC_ORDER = CALC_ITEMS.map((it) => it.id);
const roleLabel = (role, time) =>
  `${role === 'ryad' ? 'Рядовой' : 'Кассир'} · ${time === 'day' ? 'день' : 'ночь'}`;

function normalizeCalc(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    v: 1,
    rates: { ...DEFAULT_RATES, ...(c.rates || {}) },
    prefs: { role: 'kass', time: 'night', ...(c.prefs || {}) },
    days: c.days && typeof c.days === 'object' ? c.days : {},
  };
}
function blankDay(prefs) {
  return {
    counts: EMPTY_COUNTS,
    staff: DEFAULT_STAFF,
    role: prefs.role,
    time: prefs.time,
    mentor: false,
    stops: false,
  };
}
const talliesOf = (v) => (Array.isArray(v) && v.length ? v.map((x) => Number(x) || 0) : [itemTotal(v)]);

/** Числовое поле: тап — ввод с клавиатуры, пустое = 0; внешние ± сразу видны. */
function NumInput({ value, onChange, style, inputRef, onFocused, onBlurred, onSubmit, accessoryId }) {
  const [draft, setDraft] = useState(null);
  const v = Number(value) || 0;
  const shown = draft !== null && (Number(draft) || 0) === v ? draft : v ? String(v) : '';
  return (
    <TextInput
      ref={inputRef}
      style={style}
      keyboardType="number-pad"
      keyboardAppearance="dark"
      selectTextOnFocus
      maxLength={5}
      value={shown}
      placeholder="0"
      placeholderTextColor="rgba(235,235,245,0.3)"
      inputAccessoryViewID={accessoryId}
      onSubmitEditing={onSubmit}
      onFocus={() => {
        setDraft(v ? String(v) : '');
        onFocused?.();
      }}
      onBlur={() => {
        setDraft(null);
        onBlurred?.();
      }}
      onChangeText={(t) => {
        const d = t.replace(/[^0-9]/g, '');
        setDraft(d);
        onChange(Number(d) || 0);
      }}
    />
  );
}

/**
 * Строка позиции: поле всегда видно и редактирует 1-й подсчёт
 * (остальные подсчёты — в шторке по тапу на название). − / + тоже по 1-му.
 */
const CountRow = memo(function CountRow({
  item, tallies, last, isLastField, pos, count, accent, onStep, onSet, onOpen, register, onFocusItem, onNext,
}) {
  const t = Array.isArray(tallies) ? tallies : [itemTotal(tallies)];
  const total = itemTotal(t);
  const first = Number(t[0]) || 0;
  const multi = t.length > 1;
  const id = item.id;
  const setRef = useCallback((r) => register(id, r), [register, id]);
  return (
    <View style={[styles.cRow, !last && styles.cRowSep]}>
      <Pressable style={styles.cName} onPress={() => onOpen(id)}>
        <Text style={[styles.cNameTxt, total > 0 && styles.cNameOn]} numberOfLines={1}>
          {item.name}
        </Text>
        {!multi && !!item.note && (
          <Text style={styles.cTallies} numberOfLines={1}>
            {item.note}
          </Text>
        )}
        {multi && (
          <Text style={styles.cTallies} numberOfLines={1}>
            {t.map((n) => Number(n) || 0).join(' + ')} = {total}
          </Text>
        )}
      </Pressable>
      <ScaleButton style={styles.stepBtn} onPress={() => onStep(id, -1)}>
        <Text style={styles.stepTxt}>−</Text>
      </ScaleButton>
      <NumInput
        inputRef={setRef}
        value={first}
        onChange={(n) => onSet(id, n)}
        onFocused={() => {
          onFocusItem(id);
          kbShow({
            key: `calc-${id}`,
            scope: 'main',
            label: `${item.name}  ·  ${pos + 1}/${count}`,
            hasPrev: pos > 0,
            isLast: isLastField,
            accent,
            onPrev: () => onNext(id, -1),
            onNext: () => onNext(id, 1),
          });
        }}
        onBlurred={() => kbHide(`calc-${id}`)}
        onSubmit={() => onNext(id, 1)}
        accessoryId={KB_NONE}
        style={[styles.cCount, styles.cCountTxt]}
      />
      <ScaleButton style={styles.stepBtn} onPress={() => onStep(id, 1)}>
        <Text style={styles.stepTxt}>+</Text>
      </ScaleButton>
    </View>
  );
});

/**
 * Панель над клавиатурой: [Скрыть] · подпись · [↑] [Далее ›] (на последнем — «Готово»).
 *
 * Раньше это был <InputAccessoryView nativeID> на каждое поле. В Fabric (RN 0.86)
 * он ищет своё поле ОДИН раз в didMoveToWindow и держит его по weak-ссылке: если
 * поле смонтировалось позже/переиспользовалось из пула — панель не цепляется,
 * а поле с inputAccessoryViewID не получает и системную панель — пусто.
 * Поэтому теперь панель своя: одна на окно (главное и окно шторки), видна, пока
 * в фокусе поле, которое её «заказало» (kbShow на onFocus), и едет вместе с
 * клавиатурой кадр в кадр (useAnimatedKeyboard на UI-потоке).
 */
const KB_NONE = Platform.OS === 'ios' ? 'kb-none' : undefined; // гасит системную «Done»-полоску iOS у number-pad
const KB_BAR_H = 60;
const kbStore = { cfg: null, subs: new Set() };
const kbEmit = () => kbStore.subs.forEach((f) => f());
function kbShow(cfg) {
  kbStore.cfg = cfg;
  kbEmit();
}
function kbHide(key) {
  if (kbStore.cfg && kbStore.cfg.key === key) {
    kbStore.cfg = null;
    kbEmit();
  }
}
const kbSubscribe = (f) => {
  kbStore.subs.add(f);
  return () => kbStore.subs.delete(f);
};
const kbGet = () => kbStore.cfg;

function KeyBarHost({ scope }) {
  const cfg = useSyncExternalStore(kbSubscribe, kbGet);
  const kb = useAnimatedKeyboard();
  // запасной путь: высота из JS-событий клавиатуры (если UI-трекинг вдруг молчит)
  const jsH = useSharedValue(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const ease = (e) => ({ duration: e?.duration || 250, easing: Easing.out(Easing.cubic) });
    const a = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      jsH.value = withTiming(Math.max(0, SCREEN_H - e.endCoordinates.screenY), ease(e));
    });
    const b = Keyboard.addListener('keyboardWillHide', (e) => {
      jsH.value = withTiming(0, ease(e));
    });
    return () => {
      a.remove();
      b.remove();
    };
  }, [jsH]);
  const lastRef = useRef(null);
  const mine = cfg && cfg.scope === scope ? cfg : null;
  if (mine) lastRef.current = mine;
  else if (cfg) lastRef.current = null; // фокус в другом окне — здесь не показываем
  const shown = mine || lastRef.current; // пока клавиатура уезжает — держим последнюю подпись
  const anim = useAnimatedStyle(() => {
    const h = kb.height.value > 0 ? kb.height.value : jsH.value;
    return { opacity: h > 40 ? 1 : 0, transform: [{ translateY: -h }] };
  });
  if (Platform.OS !== 'ios' || !shown) return null;
  return (
    <Animated.View style={[styles.keyBarWrap, anim]} pointerEvents={mine ? 'box-none' : 'none'}>
      <Glass style={styles.keyBar} intensity={60}>
        <Pressable style={styles.keyBarHide} hitSlop={6} onPress={() => Keyboard.dismiss()}>
          <Text style={styles.keyBarHideTxt}>Скрыть</Text>
        </Pressable>
        <Text style={styles.keyBarLabel} numberOfLines={1}>
          {shown.label}
        </Text>
        <Pressable
          style={[styles.keyBarRound, !shown.hasPrev && { opacity: 0.35 }]}
          disabled={!shown.hasPrev}
          hitSlop={6}
          onPress={() => kbStore.cfg?.onPrev?.()}
        >
          <Text style={styles.keyBarArrow}>↑</Text>
        </Pressable>
        <Pressable
          style={[styles.keyBarNext, { backgroundColor: shown.accent }]}
          hitSlop={6}
          onPress={() => {
            const c = kbStore.cfg;
            if (!c || c.isLast) Keyboard.dismiss();
            else c.onNext?.();
          }}
        >
          <Text style={styles.keyBarNextTxt}>{shown.isLast ? 'Готово' : 'Далее ›'}</Text>
        </Pressable>
      </Glass>
    </Animated.View>
  );
}

function CheckRow({ checked, label, amount, accent, onToggle }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      style={styles.checkRow}
      onPress={() => {
        Haptics.selectionAsync();
        s.value = withSequence(withTiming(0.86, { duration: 70 }), withSpring(1, capSpring));
        onToggle();
      }}
    >
      <Animated.View style={[styles.checkBox, checked && { backgroundColor: accent, borderColor: accent }, anim]}>
        {checked && <Text style={styles.checkMark}>✓</Text>}
      </Animated.View>
      <Text style={[styles.setL, { flex: 1 }]}>{label}</Text>
      <Text style={[styles.checkSum, checked && { color: '#fff' }]}>+{money(amount)}</Text>
    </Pressable>
  );
}

const CalcView = memo(function CalcView({
  calc, date, day, accent, linkedShift, manualOnDate, scrollRef, scrollY, scrollTop,
  onDate, onPatchDay, onRole, onTime, onStep, onSet, onOpenItem, onOpenRates, onReset, onShowShift,
}) {
  const [showUsage, setShowUsage] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // ── ввод с клавиатуры: Далее / ↑ идут по списку сверху вниз, как строки в Excel
  const inputs = useRef(new Map());
  const focusRef = useRef(null);
  const order = CALC_ORDER;
  const orderRef = useRef(order);
  orderRef.current = order;
  const register = useCallback((id, r) => {
    if (r) inputs.current.set(id, r);
    else inputs.current.delete(id);
  }, []);

  /** Прокрутить так, чтобы поле было видно над клавиатурой (с панелью) и под шапкой. */
  const ensureVisible = useCallback(
    (id) => {
      const input = inputs.current.get(id);
      const sv = scrollRef.current;
      if (!input || !sv || !input.measureInWindow) return;
      input.measureInWindow((x, y, w, h) => {
        const kb = Keyboard.isVisible() ? Keyboard.metrics() : null;
        const bottom = (kb ? kb.screenY - KB_BAR_H : SCREEN_H) - 20;
        const top = scrollTop.current + 12;
        let delta = 0;
        if (y + h + 8 > bottom) delta = y + h + 8 - bottom;
        else if (y - 8 < top) delta = y - 8 - top;
        if (Math.abs(delta) > 1) sv.scrollTo({ y: Math.max(0, scrollY.current + delta), animated: true });
      });
    },
    [scrollRef, scrollY, scrollTop]
  );
  useEffect(() => {
    // первый фокус: клавиатура ещё выезжает — докручиваем, когда она встала
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (focusRef.current) ensureVisible(focusRef.current);
    });
    const subH = Keyboard.addListener('keyboardDidHide', () => {
      focusRef.current = null;
    });
    return () => {
      sub.remove();
      subH.remove();
    };
  }, [ensureVisible]);

  const onFocusItem = useCallback(
    (id) => {
      focusRef.current = id;
      if (Keyboard.isVisible()) requestAnimationFrame(() => ensureVisible(id));
    },
    [ensureVisible]
  );
  const onNext = useCallback((id, dir) => {
    const list = orderRef.current;
    const i = list.indexOf(id);
    const nextId = i < 0 ? null : list[i + dir];
    if (nextId && inputs.current.get(nextId)) {
      Haptics.selectionAsync();
      inputs.current.get(nextId).focus();
    } else if (dir > 0) {
      Keyboard.dismiss();
    }
  }, []);

  const res = useMemo(() => computeCalc(day.counts, calc.rates, day.staff), [day.counts, calc.rates, day.staff]);
  const own = ownPay(res, calc.rates, day);
  const ownR = Math.round(own);
  const filled = hasCounts(day.counts);

  const saved = useMemo(
    () =>
      Object.keys(calc.days)
        .filter((d) => hasCounts(calc.days[d].counts))
        .sort((a, b) => b.localeCompare(a))
        .map((d) => {
          const x = calc.days[d];
          const r = computeCalc(x.counts, calc.rates, x.staff);
          return { date: d, role: x.role, time: x.time, pay: ownPay(r, calc.rates, x), positions: r.positions };
        }),
    [calc.days, calc.rates]
  );


  return (
    <>
      <DateWheel value={date} onChange={onDate} label="Дата смены" accent={accent} />

      <Glass style={styles.balance} intensity={42}>
        <Text style={styles.period}>Моя зарплата</Text>
        <Text style={styles.paySub}>
          {roleLabel(day.role, day.time)} · {fmtShort(date)}
        </Text>
        <Text style={[styles.bigPay, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
          {money(own)}
        </Text>
        <Text style={styles.calcMeta}>
          {res.positions} поз. × {money(calc.rates.perItem)} = {money(res.output)} · на {res.people} чел.
        </Text>
        <View style={styles.calcSegs}>
          <View style={{ flex: 1 }}>
            <SegmentCapsule value={day.role === 'ryad' ? 0 : 1} labels={ROLE_LABELS} height={46} onChange={onRole} />
          </View>
          <View style={{ flex: 1 }}>
            <SegmentCapsule value={day.time === 'day' ? 0 : 1} labels={TIME_LABELS} height={46} onChange={onTime} />
          </View>
        </View>
        <CheckRow
          checked={!!day.mentor}
          label="Наставник"
          amount={calc.rates.mentor}
          accent={accent}
          onToggle={() => onPatchDay((d) => ({ ...d, mentor: !d.mentor }))}
        />
        <CheckRow
          checked={!!day.stops}
          label="Мал. остановки"
          amount={calc.rates.stops}
          accent={accent}
          onToggle={() => onPatchDay((d) => ({ ...d, stops: !d.stops }))}
        />
        <View style={styles.staffRow}>
          <Text style={[styles.setL, { flex: 1 }]}>Сотрудники</Text>
          <ScaleButton
            style={styles.stepBtn}
            onPress={() => onPatchDay((d) => ({ ...d, staff: Math.max(1, (Number(d.staff) || DEFAULT_STAFF) - 1) }))}
          >
            <Text style={styles.stepTxt}>−</Text>
          </ScaleButton>
          <Text style={[styles.cCountTxt, styles.staffNum]}>{res.people}</Text>
          <ScaleButton
            style={styles.stepBtn}
            onPress={() => onPatchDay((d) => ({ ...d, staff: Math.min(30, (Number(d.staff) || DEFAULT_STAFF) + 1) }))}
          >
            <Text style={styles.stepTxt}>+</Text>
          </ScaleButton>
        </View>
      </Glass>

      {filled && (
        <Animated.View entering={ROW_ENTER} exiting={ROW_EXIT} layout={ROW_LAYOUT}>
          <Pressable style={styles.linkLine} onPress={onShowShift} hitSlop={4}>
            <View style={[styles.linkDot, { backgroundColor: accent }]}>
              <Text style={styles.linkDotTxt}>✓</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkLineTxt}>
                Учтено в сменах · {money(linkedShift ? linkedShift.amount : ownR)}
              </Text>
              <Text style={styles.linkLineSub} numberOfLines={2}>
                к зарплате {fmtShort(paydayForDate(date))}
                {manualOnDate ? ' · на эту дату есть и ручная смена — считаются обе' : ''}
              </Text>
            </View>
            <Text style={styles.chevMini}>›</Text>
          </Pressable>
        </Animated.View>
      )}
      <Animated.View style={styles.calcBtns} layout={ROW_LAYOUT}>
        <ScaleButton style={[styles.actBtn, { flex: 1 }]} onPress={onOpenRates}>
          <Text style={styles.actBtnTxt}>Ставки</Text>
        </ScaleButton>
        <ScaleButton style={[styles.actBtn, { flex: 1 }]} onPress={onReset}>
          <Text style={[styles.actBtnTxt, { color: '#ff453a' }]}>Сбросить</Text>
        </ScaleButton>
      </Animated.View>

      <Animated.View layout={ROW_LAYOUT}>
        <Text style={[styles.hint, { paddingHorizontal: 6 }]}>
          Тап по числу и вводите подряд — «Далее» над клавиатурой переходит к следующей позиции.
          Тап по названию — несколько подсчётов (например, 59 + 98).
        </Text>
      </Animated.View>

      <Animated.View style={styles.group} layout={ROW_LAYOUT}>
        <View style={styles.gHead}>
          <Text style={styles.gTitle}>Позиции · как в таблице</Text>
          <Text style={styles.gSub}>
            {fmtNum(CALC_ITEMS.reduce((a, it) => a + (it.note ? 0 : itemTotal(day.counts[it.id])), 0))}
          </Text>
        </View>
        <ItemCard>
          {CALC_ITEMS.map((it, i) => (
            <CountRow
              key={it.id}
              item={it}
              tallies={day.counts[it.id]}
              last={i === CALC_ITEMS.length - 1}
              isLastField={i === CALC_ITEMS.length - 1}
              pos={i}
              count={CALC_ITEMS.length}
              accent={accent}
              onStep={onStep}
              onSet={onSet}
              onOpen={onOpenItem}
              register={register}
              onFocusItem={onFocusItem}
              onNext={onNext}
            />
          ))}
        </ItemCard>
      </Animated.View>

      <Animated.View style={styles.group} layout={ROW_LAYOUT}>
        <View style={styles.gHead}>
          <Text style={styles.gTitle}>Итог по позициям</Text>
          <Text style={styles.gSub}>единица {fmtNum(res.unit)}</Text>
        </View>
        <ItemCard style={styles.sumCard}>
          {res.summary
            .filter((s) => s.inTotal || s.value > 0)
            .map((s) => (
              <View key={s.label} style={styles.sumRow}>
                <Text style={[styles.sumL, !s.inTotal && styles.sumDim]}>
                  {s.label}
                  {!s.inTotal ? ' · не в общем' : ''}
                </Text>
                <Text style={styles.sumV}>{fmtNum(s.value)}</Text>
              </View>
            ))}
          <View style={[styles.sumRow, styles.sumTotal]}>
            <Text style={styles.totalL}>Общее</Text>
            <Text style={styles.totalV}>{fmtNum(res.total)}</Text>
          </View>
        </ItemCard>
      </Animated.View>

      <Animated.View style={styles.group} layout={ROW_LAYOUT}>
        <Pressable
          style={styles.gHead}
          onPress={() => {
            Haptics.selectionAsync();
            setShowUsage((v) => !v);
          }}
        >
          <Text style={styles.gTitle}>Расход ингредиентов</Text>
          <Text style={styles.gSub}>{showUsage ? 'скрыть' : 'показать'}</Text>
          <Text style={[styles.chevMini, showUsage && styles.chevOpen]}>›</Text>
        </Pressable>
        {showUsage && (
          <Animated.View entering={ROW_ENTER} exiting={ROW_EXIT}>
            <ItemCard style={styles.sumCard}>
              {res.usage.map((u) => (
                <View key={u.label} style={[styles.sumRow, u.label === 'Единица' && styles.sumTotal]}>
                  <Text style={u.label === 'Единица' ? styles.totalL : styles.sumL}>{u.label}</Text>
                  <Text style={u.label === 'Единица' ? styles.totalV : styles.sumV}>{fmtNum(u.value)}</Text>
                </View>
              ))}
            </ItemCard>
          </Animated.View>
        )}
      </Animated.View>

      {saved.length > 0 && (
        <Animated.View style={styles.group} layout={ROW_LAYOUT}>
          <View style={styles.gHead}>
            <Text style={styles.gTitle}>Сохранённые расчёты</Text>
            <Text style={styles.gSub}>{saved.length}</Text>
          </View>
          {(showAll ? saved : saved.slice(0, 7)).map((s) => (
            <ScaleButton
              key={s.date}
              style={[styles.setItem, s.date === date && { borderColor: accent }]}
              onPress={() => onDate(s.date)}
            >
              <View>
                <Text style={styles.setL}>
                  {fmtShort(s.date)} {s.date.slice(0, 4)}
                </Text>
                <Text style={styles.setS}>
                  {roleLabel(s.role, s.time)} · {s.positions} поз.
                </Text>
              </View>
              <Text style={[styles.itemTitle, s.date === date && { color: accent }]}>{money(s.pay)}</Text>
            </ScaleButton>
          ))}
          {saved.length > 7 && (
            <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={8}>
              <Text style={[styles.link, styles.showAll, { color: accent }]}>
                {showAll ? 'Свернуть' : 'Показать все'}
              </Text>
            </Pressable>
          )}
        </Animated.View>
      )}
      <Animated.View layout={ROW_LAYOUT}>
        <Text style={[styles.hint, { textAlign: 'center' }]}>Расчёт сохраняется автоматически по дате.</Text>
      </Animated.View>
    </>
  );
});

// ── Расходы: зарплаты-«папки», листание вбок ────────────────────────────
// pos — дробный индекс в PAYDAYS (UI-поток). Страница k стоит в (k − pos)·ширина и чуть
// уменьшается у края — как смена трека в Apple Music. Смонтированы только pi−1, pi, pi+1.
const PAGE_W = SCREEN_W;
const PAGE_GAP = 14;
const PAGE_SPRING = { damping: 34, stiffness: 300, mass: 0.9, overshootClamping: true };
const AUTO_NEXT_MS = 900;

/** Большая карточка зарплаты — часть страницы, уезжает и приезжает вместе с ней. */
const PayCard = memo(function PayCard({ payday, t, accent, par }) {
  const sv = summaryView(t);
  const nextP = PAYDAYS[PAYDAYS.indexOf(payday) + 1] || addDays(payday, 14);
  return (
    <Glass style={styles.balance} intensity={42}>
      <Animated.View style={par}>
        <Text style={styles.period} numberOfLines={1}>
          К зарплате {fmtShort(payday)}
        </Text>
        <View style={styles.paySubRow}>
          <Text style={styles.paySubL} numberOfLines={1}>
            расходы {fmtRange(payday, addDays(nextP, -1))}
          </Text>
          <View style={[styles.tag, sv.tagTone === 'good' ? styles.tagGood : styles.tagBad]}>
            <Text style={[styles.tagTxt, sv.tagTone === 'good' ? styles.good : styles.bad]} numberOfLines={1}>
              {sv.tag}
            </Text>
          </View>
        </View>
        {/* Без adjustsFontSizeToFit (Fabric кэширует замер); key — свежий узел на каждую смену. */}
        <Text
          key={sv.big}
          style={[styles.bigPay, sv.mode === 'done' && styles.bigPayWord, { color: sv.bigTone === 'bad' ? '#ff453a' : '#30d158' }]}
          numberOfLines={1}
        >
          {sv.big}
        </Text>
      </Animated.View>
      <Meter value={sv.progress} color={accent} />
      <View style={styles.statRow}>
        <Stat k="Расходы за зарплату" v={sv.total} />
        <Stat k="Оплачено" v={sv.paid} tone="good" />
      </View>
      {sv.earned ? <Text style={styles.calcMeta}>заработано за смены · {sv.earned}</Text> : null}
    </Glass>
  );
});

const PayPage = memo(function PayPage({ k, pos, payday, list, earned, accent, onEdit, onToggle, arc }) {
  const st = useAnimatedStyle(() => {
    const d = k - pos.value;
    const a = Math.min(1, Math.abs(d));
    return {
      transform: [{ translateX: d * (PAGE_W + PAGE_GAP) }, { scale: 1 - 0.07 * a }],
    };
  });
  // лёгкий параллакс заголовка и суммы внутри карточки
  const par = useAnimatedStyle(() => ({ transform: [{ translateX: (k - pos.value) * 40 }] }));
  const t = useMemo(() => paydayTotals(list, earned), [list, earned]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st]}>
      <ScrollView style={styles.pages} contentContainerStyle={styles.pagesContent} showsVerticalScrollIndicator={false}>
        <LayoutAnimationConfig skipEntering skipExiting>
          <View>
            <PayCard payday={payday} t={t} accent={accent} par={par} />
            {list.length === 0 ? (
              <ItemCard>
                <Text style={styles.empty}>Расходов к этой зарплате нет — «+» вверху</Text>
              </ItemCard>
            ) : (
              list.map((e) => <ExpenseCard key={e.id} item={e} onEdit={onEdit} onToggle={onToggle} arc={arc} />)
            )}
            <Text style={[styles.hint, styles.pageHint]}>
              Листайте вбок — другие зарплаты. Тап по карточке — изменить или удалить. Тап по кнопке — ✓, удержание —
              ✓ / → перенести / ○.
            </Text>
          </View>
        </LayoutAnimationConfig>
      </ScrollView>
    </Animated.View>
  );
});

/** Пейджер: свой жест с ручной активацией — вбок только явным горизонтальным движением. */
const PayPager = memo(function PayPager({ pi, pos, cur, lo, hi, pages, accent, onEdit, onToggle, arc, onPage }) {
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const drag0 = useSharedValue(0);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((e) => {
          const t = e.allTouches[0];
          sx.value = t.absoluteX;
          sy.value = t.absoluteY;
        })
        .onTouchesMove((e, mgr) => {
          if (arc.hold.value || arc.open.value > 0) return mgr.fail(); // остров статуса открыт — не листаем
          const t = e.allTouches[0];
          const dx = t.absoluteX - sx.value;
          const dy = t.absoluteY - sy.value;
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) mgr.fail();
          else if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) mgr.activate();
        })
        .onStart(() => {
          drag0.value = pos.value; // перехват на лету — с текущего места, без рывка
        })
        .onUpdate((e) => {
          const c = cur.value;
          const a = Math.max(lo.value, c - 1);
          const b = Math.min(hi.value, c + 1);
          let p = drag0.value - e.translationX / PAGE_W;
          // за краями — резинка
          if (p < a) p = a - (1 - Math.exp(-(a - p) * 2.2)) * 0.18;
          if (p > b) p = b + (1 - Math.exp(-(p - b) * 2.2)) * 0.18;
          pos.value = p;
        })
        .onEnd((e) => {
          const c = cur.value;
          const a = Math.max(lo.value, c - 1);
          const b = Math.min(hi.value, c + 1);
          const proj = pos.value - (e.velocityX / PAGE_W) * 0.22;
          const target = Math.max(a, Math.min(b, Math.round(proj)));
          pos.value = withSpring(target, { ...PAGE_SPRING, velocity: -e.velocityX / PAGE_W });
          if (target !== c) {
            cur.value = target;
            scheduleOnRN(onPage, target);
          }
        }),
    [sx, sy, drag0, pos, cur, lo, hi, arc, onPage]
  );
  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.pager} collapsable={false}>
        {pages.map((pg) => (
          <PayPage
            key={pg.payday}
            k={pg.k}
            pos={pos}
            payday={pg.payday}
            list={pg.list}
            earned={pg.earned}
            accent={accent}
            onEdit={onEdit}
            onToggle={onToggle}
            arc={arc}
          />
        ))}
      </View>
    </GestureDetector>
  );
});

/** Месяц в центре шапки: меняется с перекрёстным проявлением при листании через месяцы. */
function PayHeader({ payday }) {
  if (!payday) return <View style={styles.hCenter} />;
  const d = parse(payday);
  const y = d.getFullYear();
  const m = d.getMonth();
  const inMonth = paydaysInMonth(y, m);
  return (
    <View style={styles.hCenter}>
      <Animated.View
        key={`${y}-${m}`}
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(160)}
        style={styles.hCenterIn}
      >
        <Text style={styles.eyebrow} numberOfLines={1}>
          Расходы · {y}
        </Text>
        <Text style={styles.h1C} numberOfLines={1}>
          {MONTHS[m]}
        </Text>
        <View style={styles.hDots}>
          {inMonth.map((p) => (
            <View key={p} style={[styles.hDot, p === payday && styles.hDotOn]} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

/** Дата нового расхода: сегодня, если сегодня в показанной зарплате, иначе день самой зарплаты. */
function newExpenseDate(k) {
  const today = todayIso();
  const p = k != null ? PAYDAYS[k] : null;
  if (!p) return today;
  const nextP = PAYDAYS[k + 1] || addDays(p, 14);
  return today >= p && today < nextP ? today : p;
}

export default function App() {
  const [state, setState] = useState(null);
  const [page, setPage] = useState(0);
  const [viewY, setViewY] = useState(INIT_Y);
  const [viewM, setViewM] = useState(INIT_M);
  const [sheet, setSheet] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [toast, setToast] = useState(null); // { k, text, undo }
  // Расходы: показанная зарплата (индекс в PAYDAYS) + shared values пейджера
  const [pi, setPi] = useState(null);
  const pagePos = useSharedValue(0);
  const pageCur = useSharedValue(0);
  const pageLo = useSharedValue(0);
  const pageHi = useSharedValue(PAYDAYS.length - 1);
  const piRef = useRef(null);
  piRef.current = pi;

  // ── Расчёт: отдельный ключ zp_calc_v1, zp_app_v1 не трогаем
  const [calc, setCalc] = useState(null);
  const [calcDate, setCalcDate] = useState(todayIso);
  const [calcItem, setCalcItem] = useState(null);
  const calcDateRef = useRef(calcDate);
  calcDateRef.current = calcDate;
  const calcTimer = useRef(null);
  const calcPending = useRef(null);

  const flushCalc = useCallback(() => {
    if (calcTimer.current) clearTimeout(calcTimer.current);
    calcTimer.current = null;
    const data = calcPending.current;
    calcPending.current = null;
    if (data) AsyncStorage.setItem(CALC_KEY, JSON.stringify(data)).catch(() => {});
  }, []);
  const patchCalc = useCallback(
    (fn) => {
      setCalc((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        if (next !== prev) {
          // частые +/− пишем пачкой
          calcPending.current = next;
          if (calcTimer.current) clearTimeout(calcTimer.current);
          calcTimer.current = setTimeout(flushCalc, 300);
        }
        return next;
      });
    },
    [flushCalc]
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') flushCalc();
    });
    return () => {
      sub.remove();
      flushCalc();
    };
  }, [flushCalc]);

  /** Изменить расчёт текущей даты (prefs — запомнить роль/смену по умолчанию). */
  const patchDay = useCallback(
    (fn, prefs) => {
      const date = calcDateRef.current;
      patchCalc((p) => {
        const d = p.days[date] || blankDay(p.prefs);
        const nd = fn(d);
        if (nd === d && !prefs) return p;
        return {
          ...p,
          prefs: prefs ? { ...p.prefs, ...prefs } : p.prefs,
          days: { ...p.days, [date]: { ...nd, updated: Date.now() } },
        };
      });
    },
    [patchCalc]
  );
  const editTallies = useCallback(
    (id, fn) =>
      patchDay((d) => {
        const cur = talliesOf(d.counts[id]);
        const next = fn([...cur]);
        if (!next || (next.length === cur.length && next.every((x, i) => x === cur[i]))) return d;
        return { ...d, counts: { ...d.counts, [id]: next } };
      }),
    [patchDay]
  );
  const stepTally = useCallback(
    (id, delta, idx) =>
      editTallies(id, (t) => {
        const i = idx == null ? t.length - 1 : idx;
        t[i] = Math.max(0, t[i] + delta);
        return t;
      }),
    [editTallies]
  );
  const setTally = useCallback(
    (id, n, idx) =>
      editTallies(id, (t) => {
        t[idx || 0] = Math.max(0, Number(n) || 0);
        return t;
      }),
    [editTallies]
  );
  const onCalcStep = useCallback((id, d) => stepTally(id, d, 0), [stepTally]);
  const onCalcSet = useCallback((id, n) => setTally(id, n, 0), [setTally]);
  const openCalcItem = useCallback((id) => {
    Haptics.selectionAsync();
    setCalcItem(id);
    setSheet('calcItem');
  }, []);
  const onCalcRole = useCallback(
    (i) => {
      const role = i === 0 ? 'ryad' : 'kass';
      patchDay((d) => (d.role === role ? d : { ...d, role }), { role });
    },
    [patchDay]
  );
  const onCalcTime = useCallback(
    (i) => {
      const time = i === 0 ? 'day' : 'night';
      patchDay((d) => (d.time === time ? d : { ...d, time }), { time });
    },
    [patchDay]
  );
  const mainScroll = useRef(null);
  const mainScrollY = useRef(0);
  const mainScrollTop = useRef(0);

  // ── Вкладки: плашка дока едет на UI-потоке; JS лишь переключает display.
  // Расчёт/Смены монтируем заранее (после загрузки, в простое), а если
  // вкладку открыли раньше — после анимации плашки, а не во время неё.
  const [mounted, setMounted] = useState({ 0: true });
  const mountedRef = useRef(mounted);
  mountedRef.current = mounted;
  // Переход вкладок: у каждой своя видимость и сдвиг (shared values). Новая
  // въезжает с той стороны, куда идём, старая уезжает в другую; повторные тапы
  // просто перенацеливают анимации с текущих значений — без рывков и «застреваний».
  const reduceMotion = useReducedMotion();
  const tv0 = useSharedValue(1);
  const tv1 = useSharedValue(0);
  const tv2 = useSharedValue(0);
  const tx0 = useSharedValue(0);
  const tx1 = useSharedValue(0);
  const tx2 = useSharedValue(0);
  const tabCur = useSharedValue(0);
  const tabAnim = useMemo(() => {
    const vis = [tv0, tv1, tv2];
    const xs = [tx0, tx1, tx2];
    const shift = reduceMotion ? 0 : TAB_SHIFT;
    return (k) => {
      'worklet';
      const from = tabCur.value;
      if (k === from) return;
      const dir = k > from ? 1 : -1;
      tabCur.value = k;
      for (let i = 0; i < 3; i++) {
        if (i === k) {
          if (vis[i].value < 0.05) xs[i].value = dir * shift;
          vis[i].value = withTiming(1, reduceMotion ? TAB_FADE : TAB_IN);
          xs[i].value = withTiming(0, TAB_IN);
        } else if (vis[i].value > 0) {
          vis[i].value = withTiming(0, reduceMotion ? TAB_FADE : TAB_OUT);
          xs[i].value = withTiming(-dir * shift, TAB_OUT);
        }
      }
    };
  }, [reduceMotion, tv0, tv1, tv2, tx0, tx1, tx2, tabCur]);
  const tabSV = useMemo(
    () => [
      [tv0, tx0],
      [tv1, tx1],
      [tv2, tx2],
    ],
    [tv0, tv1, tv2, tx0, tx1, tx2]
  );

  const onDock = useCallback((i) => {
    // анимация уже идёт (стартовала на UI-потоке из жеста дока); здесь — только состояние
    Keyboard.dismiss();
    setPage(i);
    if (!mountedRef.current[i]) setTimeout(() => setMounted((m) => ({ ...m, [i]: true })), 280);
  }, []);
  const goPage = useCallback((i) => {
    setMounted((m) => (m[i] ? m : { ...m, [i]: true }));
    scheduleOnUI(tabAnim, i); // переход не из дока (бейдж, «Открыть в Расчёте») — та же анимация
    setPage(i);
  }, [tabAnim]);

  // обработчики Расчёта, которые объявлены ниже guard'а — стабильные обёртки,
  // чтобы memo(CalcView) не перерисовывался от каждого рендера App
  const calcH = useRef({});
  const calcStable = useMemo(
    () => ({
      openRates: () => calcH.current.openRates?.(),
      reset: () => calcH.current.reset?.(),
      showShift: () => calcH.current.showShift?.(),
    }),
    []
  );
  const calcDay = useMemo(
    () => (calc ? calc.days[calcDate] || blankDay(calc.prefs) : null),
    [calc, calcDate]
  );


  useEffect(() => {
    (async () => {
      let loaded;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        loaded = raw ? normalizeApp(JSON.parse(raw)) : defaultState();
      } catch {
        loaded = defaultState();
      }
      // досеиваем стартовый месяц и месяцы вокруг сегодняшней зарплаты до первого рендера
      const today = todayIso();
      const ti = Math.max(0, PAYDAYS.indexOf(paydayOnOrBefore(today)));
      let seeded = seedMonth(loaded, INIT_Y, INIT_M);
      seeded = seedPaydays(seeded, PAYDAYS.slice(Math.max(0, ti - 3), ti + 4));
      // по умолчанию — ближайшая зарплата с неотмеченными (или текущая/следующая)
      const { lo: lo0 } = pagerRange(seeded.expenses, ANCHOR);
      const p0 = Math.max(lo0, PAYDAYS.indexOf(defaultPayday(seeded.expenses, today)));
      seeded = seedPaydays(seeded, PAYDAYS.slice(Math.max(0, p0 - 1), p0 + 2));
      pagePos.value = p0;
      pageCur.value = p0;
      let calcLoaded;
      try {
        const rawC = await AsyncStorage.getItem(CALC_KEY);
        calcLoaded = normalizeCalc(rawC ? JSON.parse(rawC) : null);
      } catch {
        calcLoaded = normalizeCalc(null);
      }
      // сразу связываем расчёт со сменами (и узнаём смены от старой кнопки)
      const linked = syncCalcShifts(seeded, calcLoaded, paydayForDate, uid);
      if (linked !== loaded) AsyncStorage.setItem(KEY, JSON.stringify(linked)).catch(() => {});
      setCalc(calcLoaded);
      setPi(p0);
      setState(linked);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = useCallback((fn) => {
    setState((prev) => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      if (next !== prev) AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const stateRef = useRef(null);
  stateRef.current = state;

  // ── Пейджер зарплат
  const range = useMemo(() => (state ? pagerRange(state.expenses, ANCHOR) : null), [state?.expenses]);
  useEffect(() => {
    if (!range) return;
    pageLo.value = range.lo;
    pageHi.value = range.hi;
  }, [range, pageLo, pageHi]);
  /** Страница уже выбрана (жестом — анимация идёт на UI); досеять соседей и обновить состояние. */
  const onPage = useCallback(
    (k) => {
      Haptics.selectionAsync();
      patch((p) => seedPaydays(p, PAYDAYS.slice(Math.max(0, k - 1), k + 2)));
      setPi(k);
    },
    [patch]
  );
  /** Перейти программно (автопереход) — та же пружина, что и у жеста. */
  const goPayIdx = useCallback(
    (k) => {
      pageCur.value = k;
      pagePos.value = withSpring(k, PAGE_SPRING);
      onPage(k);
    },
    [onPage, pageCur, pagePos]
  );
  const shownPay = pi != null ? PAYDAYS[pi] : null;
  const pages = useMemo(() => {
    if (!state || pi == null) return [];
    const out = [];
    for (let k = pi - 1; k <= pi + 1; k++) {
      if (k < (range?.lo ?? 0) || k > (range?.hi ?? PAYDAYS.length - 1)) continue;
      const p = PAYDAYS[k];
      const per = workPeriod(p);
      const earned = state.shifts
        .filter((x) => x.date >= per.start && x.date <= per.end)
        .reduce((a, x) => a + (Number(x.amount) || 0), 0);
      out.push({ k, payday: p, list: expensesInPeriod(state.expenses, p), earned });
    }
    return out;
  }, [state?.expenses, state?.shifts, pi, range]);
  // Автопереход: отметили последний расход показанной зарплаты → через ~0.9 с следующая.
  // Снятие ✓ в паузе / листание отменяют таймер (смена зависимостей → cleanup).
  const shownMode = useMemo(
    () => (state && shownPay ? paydayMode(state.expenses, shownPay) : null),
    [state?.expenses, shownPay]
  );
  const lastShown = useRef(null);
  useEffect(() => {
    const prev = lastShown.current;
    const next = { payday: shownPay, mode: shownMode };
    lastShown.current = next;
    if (!shouldAutoAdvance(prev, next) || pi == null || !range || pi >= range.hi) return;
    const t = setTimeout(() => {
      if (piRef.current === pi) goPayIdx(pi + 1);
    }, AUTO_NEXT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownPay, shownMode]);
  const formRefs = useRef({});

  // ── Расчёт → Смены: связанная смена обновляется сама (с задержкой, пока вводят)
  const loadedOnce = !!state;
  // предзагрузка вкладок «Смены» и «Расчёт», пока пользователь смотрит первую
  useEffect(() => {
    if (!loadedOnce) return;
    const t1 = setTimeout(() => setMounted((m) => (m[1] ? m : { ...m, 1: true })), 500);
    const t2 = setTimeout(() => setMounted((m) => (m[2] ? m : { ...m, 2: true })), 1100);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [loadedOnce]);
  useEffect(() => {
    if (!calc || !loadedOnce) return;
    const t = setTimeout(() => patch((p) => syncCalcShifts(p, calc, paydayForDate, uid)), 400);
    return () => clearTimeout(t);
  }, [calc, loadedOnce, patch]);

  // действие, которое надо выполнить после полного закрытия шторки
  // (Alert поверх закрывающегося Modal на iOS закрылся бы вместе с ним)
  const afterClose = useRef(null);
  const closeThen = useCallback((fn) => {
    afterClose.current = fn;
    setSheet(null);
  }, []);
  const onSheetClosed = useCallback(() => {
    const fn = afterClose.current;
    afterClose.current = null;
    if (fn) fn();
  }, []);

  const goMonth = (delta) => {
    let m = viewM + delta;
    let y = viewY;
    if (m < 0) {
      m = 11;
      y--;
    }
    if (m > 11) {
      m = 0;
      y++;
    }
    // досеиваем в том же обновлении, что и смену месяца → один кадр, без «допрыгивания»
    patch((p) => seedMonth(p, y, m));
    setViewM(m);
    setViewY(y);
  };

  const expensesForPayday = useCallback(
    (p) => {
      if (!state) return [];
      return expensesInPeriod(state.expenses, p);
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
      : { date: newExpenseDate(piRef.current), amount: '', title: '', type: 'unexpected' };
    if (!e) return;
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
      linked: isLinkedShift(s),
    });
    setSheet('shift');
  }, []);

  const setStatusDirect = useCallback(
    (id, status) => {
      patch((p) => ({
        ...p,
        expenses: p.expenses.map((e) => (e.id === id ? { ...e, status } : e)),
      }));
    },
    [patch]
  );
  // тап по кнопке статуса: пусто/✕ → ✓, ✓ → пусто (лёгкая вибрация — в самой кнопке)
  const toggleStatus = useCallback(
    (id) => {
      patch((p) => ({
        ...p,
        expenses: p.expenses.map((e) => (e.id === id ? { ...e, status: toggledStatus(e.status) } : e)),
      }));
    },
    [patch]
  );
  // «Не плачу» = перенос на следующую зарплату (+14 дней), с «Отменить» в плашке
  const carryExpenseNow = useCallback(
    (id) => {
      const st = stateRef.current;
      if (!st) return;
      const { prev, next } = carryInState(st, id);
      if (!prev) return;
      patch((p) => carryInState(p, id).state);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setToast({ k: Date.now(), text: `Перенесено на ${fmtShort(next.date)}`, undo: prev });
    },
    [patch]
  );
  const hideToast = useCallback(() => setToast(null), []);
  const undoToast = useCallback(() => {
    const prev = toast?.undo;
    setToast(null);
    if (!prev) return;
    patch((p) => undoCarry(p, prev));
    Haptics.selectionAsync();
  }, [toast, patch]);
  // выбор в веере: 0 ✓, 1 → перенести, 2 без отметки
  const onArcPick = useCallback(
    (id, i) => {
      if (i === 1) return carryExpenseNow(id);
      Haptics.selectionAsync();
      setStatusDirect(id, i === 0 ? 'paid' : null);
    },
    [carryExpenseNow, setStatusDirect]
  );
  const arc = useArcCtl(onArcPick);

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
      if (!s) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (isLinkedShift(s)) {
        const date = s.calcDate || s.date;
        Alert.alert(
          'Смена из расчёта',
          `Она считается по «Расчёту» за ${fmtShort(date)}. Чтобы убрать смену, сбросьте этот расчёт.`,
          [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Сбросить расчёт',
              style: 'destructive',
              onPress: () =>
                patchCalc((p) => {
                  if (!p.days[date]) return p;
                  const days = { ...p.days };
                  delete days[date];
                  return { ...p, days };
                }),
            },
          ]
        );
        return;
      }
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
    [patch, patchCalc]
  );

  /** Открыть «Расчёт» на дате связанной смены. */
  const openCalcOn = useCallback((date) => {
    Haptics.selectionAsync();
    setCalcDate(date);
    goPage(2);
  }, [goPage]);

  if (!state) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#fff' }}>Загрузка…</Text>
      </View>
    );
  }

  const openCalcRates = () => {
    setForm({ rates: Object.fromEntries(RATE_FIELDS.map(([k]) => [k, String(calc.rates[k] ?? '')])) });
    setSheet('calcRates');
  };
  const saveCalcRates = () => {
    const fr = form.rates || {};
    patchCalc((p) => ({
      ...p,
      rates: Object.fromEntries(RATE_FIELDS.map(([k]) => [k, Number(fr[k]) || 0])),
    }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSheet(null);
  };
  const resetCalc = () => {
    const date = calcDate;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Сбросить расчёт?', `Все подсчёты за ${fmtShort(date)} будут удалены, смена «из расчёта» уберётся из «Смен».`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Сбросить',
        style: 'destructive',
        onPress: () =>
          patchCalc((p) => {
            if (!p.days[date]) return p;
            const days = { ...p.days };
            delete days[date];
            return { ...p, days };
          }),
      },
    ]);
  };
  const linkedOnCalcDate =
    state.shifts.find((s) => isLinkedShift(s) && (s.calcDate || s.date) === calcDate) || null;
  const manualOnCalcDate = state.shifts.some(
    (s) => !isLinkedShift(s) && s.date === calcDate && s.amount != null && s.amount !== ''
  );
  /** Перейти в «Смены» на месяц связанной смены. */
  const showCalcShift = () => {
    const d = parse(calcDate);
    const y = d.getFullYear();
    const m = d.getMonth();
    Haptics.selectionAsync();
    patch((p) => seedMonth(p, y, m));
    setViewY(y);
    setViewM(m);
    goPage(1);
  };

  calcH.current = { openRates: openCalcRates, reset: resetCalc, showShift: showCalcShift };

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

  const paid = state.expenses.filter((e) => displayStatus(e) === 'paid');
  const unexp = paid.filter((e) => e.type !== 'recurring');
  const rec = paid.filter((e) => e.type === 'recurring');
  const spent = paid.reduce((a, e) => a + Number(e.amount || 0), 0);
  const earnedAll = state.shifts.reduce((a, s) => a + (Number(s.amount) || 0), 0);

  /**
   * Поле шторки в цепочке «Далее ›»: ref, return-клавиша и своя панель над
   * клавиатурой (рендерится в теле шторки — в том же окне Modal, что и поле).
   */
  const fieldKb = (key, keys, label) => {
    const i = keys.indexOf(key);
    const next = keys[i + 1];
    const prev = keys[i - 1];
    const nid = `kb-f-${sheet}-${key}`;
    const focus = (k) => {
      if (!k || !formRefs.current[k]) return;
      Haptics.selectionAsync();
      formRefs.current[k].focus();
    };
    return {
      props: {
        ref: (r) => {
          if (r) formRefs.current[key] = r;
          else delete formRefs.current[key];
        },
        keyboardAppearance: 'dark',
        inputAccessoryViewID: KB_NONE,
        returnKeyType: next ? 'next' : 'done',
        submitBehavior: next ? 'submit' : 'blurAndSubmit',
        onSubmitEditing: () => focus(next),
        onBlur: () => kbHide(nid),
        onFocus: () => {
          const r = formRefs.current[key];
          kbShow({
            key: nid,
            scope: 'sheet',
            label: `${label}  ·  ${i + 1}/${keys.length}`,
            hasPrev: !!prev,
            isLast: !next,
            accent,
            onPrev: () => focus(prev),
            onNext: () => focus(next),
          });
          // клавиатура уже есть — сразу; первая — ждём, пока выедет и шторка поднимется
          if (Keyboard.isVisible()) requestAnimationFrame(() => ensureSheetVisible(r));
          else setTimeout(() => ensureSheetVisible(r), 380);
        },
      },
      bar: null, // панель — общая KeyBarHost в окне шторки
    };
  };

  const toSettings = () => setSheet('settings');
  const closeSheet = () => setSheet(null);

  /** Содержимое шторки — строится только для открытой. */
  const renderSheet = (key) => {
    switch (key) {
      case 'add':
        return {
          title: 'Добавить',
          onClose: closeSheet,
          body: (
            <>
              <ItemCard style={styles.listCard}>
                {[
                  ['Новый расход', 'платёж, покупка, долг', () => openExpense(null)],
                  ['Новая смена', 'сумма вручную', () => openShift(null)],
                  ['Расчёт смены', 'по позициям — сам попадёт в смены', () => closeThen(() => goPage(2))],
                ].map(([t, sub, fn], i) => (
                  <Pressable
                    key={t}
                    style={({ pressed }) => [styles.lRow, i < 2 && styles.lRowSep, pressed && styles.rowPressed]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      fn();
                    }}
                  >
                    <View style={[styles.addIcon, { backgroundColor: accent }]}>
                      <Text style={[styles.addIconTxt, styles.onAccent]}>{i === 2 ? '∑' : '+'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lTitle}>{t}</Text>
                      <Text style={styles.lSub}>{sub}</Text>
                    </View>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                ))}
              </ItemCard>
            </>
          ),
        };

      case 'exp': {
        const kAmt = fieldKb('amount', ['amount', 'title'], 'Сумма');
        const kTitle = fieldKb('title', ['amount', 'title'], 'За что');
        return {
          title: editId ? 'Расход' : 'Новый расход',
          onClose: closeSheet,
          right: (
            <Pressable onPress={saveExpense} hitSlop={10}>
              <Text style={[styles.link, { color: accent }]}>Готово</Text>
            </Pressable>
          ),
          body: (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Сумма</Text>
                <View style={styles.bigField}>
                  <TextInput
                    {...kAmt.props}
                    style={styles.bigInput}
                    keyboardType="number-pad"
                    value={form.amount}
                    onChangeText={(t) => setForm((f) => ({ ...f, amount: t.replace(/[^0-9]/g, '') }))}
                    placeholder="0"
                    placeholderTextColor="rgba(235,235,245,0.25)"
                  />
                  <Text style={styles.bigUnit}>сом</Text>
                </View>
                {kAmt.bar}
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>За что</Text>
                <TextInput
                  {...kTitle.props}
                  style={styles.input}
                  value={form.title}
                  onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
                  placeholder="Вайфай, ремонт…"
                  placeholderTextColor="rgba(235,235,245,0.3)"
                />
                {kTitle.bar}
              </View>
              <DateWheel value={form.date} accent={accent} onChange={(d) => setForm((f) => ({ ...f, date: d }))} />
              <View style={styles.field}>
                <Text style={styles.label}>Тип</Text>
                <SegmentCapsule
                  height={46}
                  labels={['Непредвиденный', 'Постоянный']}
                  value={form.type === 'recurring' ? 1 : 0}
                  onChange={(i) => setForm((f) => ({ ...f, type: i === 1 ? 'recurring' : 'unexpected' }))}
                />
              </View>
              {editId && (
                <ScaleButton
                  style={[styles.actBtn, styles.dangerBtn]}
                  onPress={() => {
                    const id = editId;
                    closeThen(() => confirmDeleteExpense(id));
                  }}
                >
                  <Text style={[styles.actBtnTxt, { color: '#ff453a' }]}>Удалить расход</Text>
                </ScaleButton>
              )}
            </>
          ),
        };
      }

      case 'shift': {
        if (form.linked) {
          const sh = state.shifts.find((x) => x.id === editId);
          const d = sh ? sh.calcDate || sh.date : form.date;
          return {
            title: 'Смена из расчёта',
            onClose: closeSheet,
            body: (
              <>
                <ItemCard style={styles.listCard}>
                  <View style={[styles.lRow, styles.lRowSep]}>
                    <Text style={styles.lKey}>Дата</Text>
                    <Text style={styles.lVal}>
                      {fmtShort(d)}, {DOW[parse(d).getDay()]}
                    </Text>
                  </View>
                  <View style={[styles.lRow, styles.lRowSep]}>
                    <Text style={styles.lKey}>Смена</Text>
                    <Text style={styles.lVal}>{sh ? sh.title : form.title}</Text>
                  </View>
                  <View style={styles.lRow}>
                    <Text style={styles.lKey}>Сумма</Text>
                    <Text style={[styles.lVal, styles.lValBig, { color: accent }]}>
                      {money(sh ? sh.amount : form.amount)}
                    </Text>
                  </View>
                </ItemCard>
                <Text style={styles.hint}>
                  Сумма считается в «Расчёте» и обновляется сама. Чтобы изменить — поправьте количества,
                  роль или ставки там.
                </Text>
                <ScaleButton
                  style={[styles.actBtn, { backgroundColor: accent }]}
                  onPress={() => closeThen(() => openCalcOn(d))}
                >
                  <Text style={[styles.actBtnTxt, styles.onAccent]}>Открыть в «Расчёте»</Text>
                </ScaleButton>
              </>
            ),
          };
        }
        const kAmt = fieldKb('amount', ['amount', 'title'], 'Сумма');
        const kTitle = fieldKb('title', ['amount', 'title'], 'Тип смены');
        return {
          title: editId ? 'Смена' : 'Новая смена',
          onClose: closeSheet,
          right: (
            <Pressable onPress={saveShift} hitSlop={10}>
              <Text style={[styles.link, { color: accent }]}>Готово</Text>
            </Pressable>
          ),
          body: (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Сумма за смену</Text>
                <View style={styles.bigField}>
                  <TextInput
                    {...kAmt.props}
                    style={styles.bigInput}
                    keyboardType="number-pad"
                    value={form.amount}
                    onChangeText={(t) => setForm((f) => ({ ...f, amount: t.replace(/[^0-9]/g, '') }))}
                    placeholder="—"
                    placeholderTextColor="rgba(235,235,245,0.25)"
                  />
                  <Text style={styles.bigUnit}>сом</Text>
                </View>
                {kAmt.bar}
                <Text style={styles.fieldNote}>Пусто — смена без суммы (в итог не идёт).</Text>
              </View>
              <DateWheel value={form.date} accent={accent} onChange={(d) => setForm((f) => ({ ...f, date: d }))} />
              <View style={styles.field}>
                <Text style={styles.label}>Тип смены</Text>
                <TextInput
                  {...kTitle.props}
                  style={styles.input}
                  value={form.title}
                  onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
                  placeholder="ночь касса"
                  placeholderTextColor="rgba(235,235,245,0.3)"
                />
                {kTitle.bar}
                <View style={styles.chipWrap}>
                  {CALC_TITLES.map((t) => (
                    <ScaleButton
                      key={t}
                      style={[styles.chip, form.title === t && styles.chipOn]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setForm((f) => ({ ...f, title: t }));
                      }}
                    >
                      <Text style={[styles.chipTxt, form.title === t && styles.chipTxtOn]}>{t}</Text>
                    </ScaleButton>
                  ))}
                </View>
              </View>
              {editId && (
                <ScaleButton
                  style={[styles.actBtn, styles.dangerBtn]}
                  onPress={() => {
                    const id = editId;
                    closeThen(() => confirmDeleteShift(id));
                  }}
                >
                  <Text style={[styles.actBtnTxt, { color: '#ff453a' }]}>Убрать этот день</Text>
                </ScaleButton>
              )}
            </>
          ),
        };
      }

      case 'settings': {
        const nav = [
          { key: 'custom', title: 'Кастомизация', sub: 'фото фона, цвет акцента' },
          { key: 'recurring', title: 'Постоянные платежи', sub: `${(state.recurring || []).length} шт. · каждый месяц` },
          { key: 'analysis', title: 'Анализ', sub: 'по месяцам, лучшие и худшие' },
          { key: 'stats', title: 'Результаты', sub: 'заработано и оплачено за всё время' },
          {
            key: 'plan',
            title: 'Импорт плана',
            sub:
              state.plan?.id === PLAN_ID
                ? `добавлено ${state.plan.added ?? ''} · ${fmtShort(state.plan.importedAt.slice(0, 10))}`
                : 'расходы сен 2026 – сен 2027 из заметки',
          },
        ];
        return {
          title: 'Настройки',
          onClose: closeSheet,
          body: (
            <>
              <Text style={styles.sectionLabel}>Режим смен</Text>
              <SegmentCapsule
                value={state.settings.mode === 'work' ? 1 : 0}
                labels={['Учёба', 'Работа']}
                height={50}
                onChange={(i) =>
                  patch((p) =>
                    seedMonth(
                      {
                        ...p,
                        settings: { ...p.settings, mode: i === 1 ? 'work' : 'study' },
                      },
                      viewY,
                      viewM
                    )
                  )
                }
              />
              <Text style={[styles.fieldNote, { marginBottom: 16 }]}>
                Учёба — смены пт, сб, вс · работа — все дни
              </Text>
              <ItemCard style={styles.listCard}>
                {nav.map((n, i) => (
                  <Pressable
                    key={n.key}
                    style={({ pressed }) => [styles.lRow, i < nav.length - 1 && styles.lRowSep, pressed && styles.rowPressed]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSheet(n.key);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lTitle}>{n.title}</Text>
                      <Text style={styles.lSub}>{n.sub}</Text>
                    </View>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                ))}
              </ItemCard>
            </>
          ),
        };
      }

      case 'custom': {
        const light = state.settings.light ?? 54;
        const LIGHTS = [36, 44, 54, 62, 70];
        const li = LIGHTS.indexOf(light);
        return {
          title: 'Кастомизация',
          onClose: toSettings,
          body: (
            <>
              <Text style={styles.sectionLabel}>Фон</Text>
              <View style={styles.calcBtns}>
                <ScaleButton style={[styles.actBtn, { flex: 1 }]} onPress={pickBg}>
                  <Text style={styles.actBtnTxt}>{state.custom?.bg ? 'Сменить фото' : 'Фото из галереи'}</Text>
                </ScaleButton>
                {!!state.custom?.bg && (
                  <ScaleButton
                    style={[styles.actBtn, styles.dangerBtn, { flex: 1, marginTop: 0 }]}
                    onPress={() => {
                      patch((p) => ({ ...p, custom: { ...p.custom, bg: null } }));
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Text style={[styles.actBtnTxt, { color: '#ff453a' }]}>Убрать</Text>
                  </ScaleButton>
                )}
              </View>

              <Text style={[styles.sectionLabel, { marginTop: 10 }]}>Цвет акцента</Text>
              <ItemCard style={[styles.listCard, styles.padCard]}>
                <View style={styles.colorRow}>
                  {ACCENT_PRESETS.map((c) => {
                    const active = state.settings.hue === c.h;
                    return (
                      <ScaleButton
                        key={c.h}
                        style={[styles.colorDot, active && styles.colorDotOn]}
                        onPress={() => {
                          patch((p) => ({ ...p, settings: { ...p.settings, hue: c.h } }));
                          Haptics.selectionAsync();
                        }}
                      >
                        <View style={[styles.colorFill, { backgroundColor: `hsl(${c.h},72%,${light}%)` }]} />
                      </ScaleButton>
                    );
                  })}
                </View>
                <Text style={styles.lSub}>Любой оттенок</Text>
                <View style={styles.hueTrack}>
                  {[0, 30, 60, 120, 180, 210, 260, 300, 330].map((h) => (
                    <Pressable
                      key={h}
                      hitSlop={{ top: 8, bottom: 8 }}
                      onPress={() => {
                        patch((p) => ({ ...p, settings: { ...p.settings, hue: h } }));
                        Haptics.selectionAsync();
                      }}
                      style={[styles.hueSeg, { backgroundColor: `hsl(${h},70%,50%)` }, state.settings.hue === h && styles.hueSegOn]}
                    />
                  ))}
                </View>
              </ItemCard>

              <Text style={[styles.sectionLabel, { marginTop: 4 }]}>Яркость · {light}%</Text>
              <SegmentCapsule
                value={li < 0 ? 2 : li}
                labels={LIGHTS.map(String)}
                height={48}
                onChange={(i) => patch((p) => ({ ...p, settings: { ...p.settings, light: LIGHTS[i] } }))}
              />
              <View style={[styles.previewRow]}>
                <View style={[styles.previewBtn, { backgroundColor: accent }]}>
                  <Text style={[styles.actBtnTxt, styles.onAccent]}>Так выглядит кнопка</Text>
                </View>
              </View>
            </>
          ),
        };
      }

      case 'recurring': {
        const kT = fieldKb('rTitle', ['rTitle', 'rAmt'], 'Название');
        const kA = fieldKb('rAmt', ['rTitle', 'rAmt'], 'Сумма');
        const rDay = Math.min(31, Math.max(1, Number(form.rDay) || 13));
        const canAdd = !!(form.rTitle || '').trim();
        const list = [...(state.recurring || [])].sort((a, b) => a.day - b.day);
        const total = list.reduce((a, r) => a + (Number(r.amount) || 0), 0);
        return {
          title: 'Постоянные платежи',
          onClose: toSettings,
          body: (
            <>
              <ItemCard style={styles.listCard}>
                {list.length === 0 && <Text style={styles.empty}>Пока нет постоянных платежей</Text>}
                {list.map((r, i) => (
                  <Animated.View key={r.id} style={[styles.lRow, i < list.length - 1 && styles.lRowSep]} entering={ROW_ENTER} exiting={ROW_EXIT} layout={ROW_LAYOUT}>
                    <View style={styles.dayBadge}>
                      <Text style={styles.dayBadgeTxt}>{r.day}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.lTitle} numberOfLines={1}>{r.title}</Text>
                      <Text style={styles.lSub}>{r.day}-е число каждого месяца</Text>
                    </View>
                    <Text style={styles.lVal}>{money(r.amount)}</Text>
                    <Pressable
                      hitSlop={10}
                      style={styles.delRound}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        patch((p) => ({
                          ...p,
                          recurring: p.recurring.filter((x) => x.id !== r.id),
                        }));
                      }}
                    >
                      <Text style={styles.delRoundTxt}>✕</Text>
                    </Pressable>
                  </Animated.View>
                ))}
                {list.length > 0 && (
                  <Animated.View style={styles.cardFoot} layout={ROW_LAYOUT}>
                    <Text style={styles.footL}>В месяц</Text>
                    <Text style={styles.footV}>{money(total)}</Text>
                  </Animated.View>
                )}
              </ItemCard>
              <Text style={styles.hint}>
                Платёж сам появится в «Расходах» каждого месяца; число решает, в какую зарплату он попадёт.
              </Text>

              <Text style={styles.sectionLabel}>Новый платёж</Text>
              <View style={styles.field}>
                <TextInput
                  {...kT.props}
                  style={styles.input}
                  value={form.rTitle || ''}
                  onChangeText={(t) => setForm((f) => ({ ...f, rTitle: t }))}
                  placeholder="Название, например «Вайфай»"
                  placeholderTextColor="rgba(235,235,245,0.3)"
                />
                {kT.bar}
              </View>
              <View style={[styles.field, styles.dayStepRow]}>
                <Text style={[styles.setL, { flex: 1 }]}>Число месяца</Text>
                <ScaleButton
                  style={styles.stepBtn}
                  onPress={() => setForm((f) => ({ ...f, rDay: String(rDay <= 1 ? 31 : rDay - 1) }))}
                >
                  <Text style={styles.stepTxt}>−</Text>
                </ScaleButton>
                <Text style={[styles.cCountTxt, styles.staffNum]}>{rDay}</Text>
                <ScaleButton
                  style={styles.stepBtn}
                  onPress={() => setForm((f) => ({ ...f, rDay: String(rDay >= 31 ? 1 : rDay + 1) }))}
                >
                  <Text style={styles.stepTxt}>+</Text>
                </ScaleButton>
              </View>
              <View style={styles.field}>
                <View style={styles.bigField}>
                  <TextInput
                    {...kA.props}
                    style={[styles.bigInput, { fontSize: 26 }]}
                    keyboardType="number-pad"
                    value={form.rAmt || ''}
                    onChangeText={(t) => setForm((f) => ({ ...f, rAmt: t.replace(/[^0-9]/g, '') }))}
                    placeholder="Сумма"
                    placeholderTextColor="rgba(235,235,245,0.25)"
                  />
                  <Text style={styles.bigUnit}>сом</Text>
                </View>
                {kA.bar}
              </View>
              <ScaleButton
                style={[styles.actBtn, { backgroundColor: accent }, !canAdd && { opacity: 0.45 }]}
                onPress={() => {
                  const title = (form.rTitle || '').trim();
                  const amount = Number(form.rAmt) || 0;
                  if (!title) return;
                  patch((p) => ({
                    ...p,
                    recurring: [...p.recurring, { id: uid(), title, day: rDay, amount }],
                  }));
                  setForm((f) => ({ ...f, rTitle: '', rAmt: '' }));
                  Keyboard.dismiss();
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
              >
                <Text style={[styles.actBtnTxt, styles.onAccent]}>Добавить платёж</Text>
              </ScaleButton>
            </>
          ),
        };
      }

      case 'plan': {
        const pv = previewImport(state, PLAN_BLOCKS);
        const done = state.plan?.id === PLAN_ID;
        const addSum = pv.add.reduce((a, x) => a + x.amount, 0);
        const paidN = pv.add.filter((x) => x.paid).length;
        const noName = pv.add.filter((x) => !x.title);
        return {
          title: 'Импорт плана',
          onClose: toSettings,
          body: (
            <>
              <ItemCard style={[styles.listCard, styles.padCard]}>
                <Text style={styles.k}>{done ? 'План уже импортирован' : 'Будет добавлено'}</Text>
                <Text style={[styles.bigPay, { marginTop: 4, color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
                  {pv.add.length} {pv.add.length === 1 ? 'расход' : pv.add.length < 5 && pv.add.length > 1 ? 'расхода' : 'расходов'}
                </Text>
                <Text style={styles.calcMeta}>
                  на {money(addSum)} сом · {paidN} уже оплачены ✓ · пропущено {pv.dups.length + pv.similar.length}
                </Text>
              </ItemCard>
              <Text style={styles.hint}>
                Каждый расход встанет под ту же зарплату, что в заметке. Существующие расходы не меняются,
                точные дубли (дата + сумма + название) пропускаются. В месяцах плана «Постоянные платежи»
                больше не добавляются сами — план уже содержит их.
              </Text>
              <Text style={styles.sectionLabel}>По месяцам</Text>
              <ItemCard style={styles.listCard}>
                {pv.months.map((k, i) => {
                  const m = pv.byMonth[k];
                  return (
                    <View key={k} style={[styles.lRow, i < pv.months.length - 1 && styles.lRowSep]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lTitle}>{monthTitle(k)}</Text>
                        <Text style={styles.lSub}>
                          {m.add ? `+${m.add} · ${money(m.sum)} сом` : 'нечего добавлять'}
                          {m.skip ? ` · уже есть ${m.skip}` : ''}
                        </Text>
                      </View>
                      <Text style={[styles.lVal, !m.add && { opacity: 0.4 }]}>+{m.add}</Text>
                    </View>
                  );
                })}
              </ItemCard>
              {pv.similar.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Уже есть похожие — пропущены</Text>
                  <ItemCard style={styles.listCard}>
                    {pv.similar.map((d, i) => (
                      <View key={i} style={[styles.lRow, i < pv.similar.length - 1 && styles.lRowSep]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lTitle}>
                            {fmtShort(d.plan.date)} · {d.plan.title || 'Без названия'}
                          </Text>
                          <Text style={styles.lSub}>
                            в плане {money(d.plan.amount)}, в приложении {money(d.existing.amount)}
                            {d.existing.date !== d.plan.date ? ` (${fmtShort(d.existing.date)})` : ''}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </ItemCard>
                </>
              )}
              {noName.length > 0 && (
                <Text style={styles.hint}>
                  Без названия: {noName.map((x) => `${fmtShort(x.date)} — ${money(x.amount)}`).join(', ')}
                </Text>
              )}
              <ScaleButton
                style={[styles.actBtn, { backgroundColor: accent }, !pv.add.length && { opacity: 0.45 }]}
                onPress={() => {
                  if (!pv.add.length) return;
                  Alert.alert('Импорт плана', `Добавить ${pv.add.length} расходов в «Расходы»?`, [
                    { text: 'Отмена', style: 'cancel' },
                    {
                      text: 'Добавить',
                      onPress: () => {
                        patch((p) => seedMonth(applyImport(p, PLAN_BLOCKS, uid, PLAN_ID), viewY, viewM));
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        closeThen(() => goPage(0));
                      },
                    },
                  ]);
                }}
              >
                <Text style={[styles.actBtnTxt, styles.onAccent]}>
                  {pv.add.length ? `Добавить ${pv.add.length}` : 'Всё уже добавлено'}
                </Text>
              </ScaleButton>
            </>
          ),
        };
      }

      case 'analysis':
        return {
          title: 'Анализ',
          onClose: toSettings,
          body: <AnalysisView state={state} accent={accent} />,
        };

      case 'stats': {
        const left = earnedAll - spent;
        const unexpSum = unexp.reduce((a, e) => a + Number(e.amount || 0), 0);
        const recSum = rec.reduce((a, e) => a + Number(e.amount || 0), 0);
        return {
          title: 'Результаты',
          onClose: toSettings,
          body: (
            <>
              <ItemCard style={[styles.listCard, styles.padCard]}>
                <Text style={styles.k}>Остаток за всё время</Text>
                <Text style={[styles.bigPay, { marginTop: 4, color: left >= 0 ? accent : '#ff453a' }]} numberOfLines={1} adjustsFontSizeToFit>
                  {left < 0 ? '−' : ''}
                  {money(Math.abs(left))}
                </Text>
                <Meter value={earnedAll > 0 ? spent / earnedAll : 0} color={left >= 0 ? accent : '#ff453a'} />
                <Text style={styles.calcMeta}>
                  потрачено {earnedAll > 0 ? Math.round((spent / earnedAll) * 100) : 0}% заработанного
                </Text>
              </ItemCard>
              <ItemCard style={styles.listCard}>
                <View style={[styles.lRow, styles.lRowSep]}>
                  <Text style={styles.lKey}>Заработано</Text>
                  <Text style={[styles.lVal, styles.good]}>{money(earnedAll)}</Text>
                </View>
                <View style={[styles.lRow, styles.lRowSep]}>
                  <Text style={styles.lKey}>Оплачено всего</Text>
                  <Text style={styles.lVal}>{money(spent)}</Text>
                </View>
                <View style={[styles.lRow, styles.lRowSep]}>
                  <Text style={styles.lKey}>· постоянные</Text>
                  <Text style={styles.lVal}>{money(recSum)}</Text>
                </View>
                <View style={styles.lRow}>
                  <Text style={styles.lKey}>· непредвиденные</Text>
                  <Text style={styles.lVal}>{money(unexpSum)}</Text>
                </View>
              </ItemCard>
              <Text style={styles.hint}>Учитываются расходы со статусом «✓ оплачено» и все смены с суммой.</Text>
            </>
          ),
        };
      }

      case 'calcItem': {
        const it = CALC_ITEMS.find((x) => x.id === calcItem);
        const t = calcDay ? talliesOf(calcDay.counts[calcItem]) : [0];
        return {
          title: it ? it.name : '',
          onClose: closeSheet,
          right: (
            <Pressable onPress={closeSheet}>
              <Text style={[styles.link, { color: accent }]}>Готово</Text>
            </Pressable>
          ),
          body: (
            <LayoutAnimationConfig skipEntering>
              <View>
                <Text style={styles.hint}>Подсчёты складываются. Например, 59 + 98.</Text>
                {t.map((n, i) => (
                  <Animated.View key={i} style={styles.tallyRow} entering={ROW_ENTER} layout={ROW_LAYOUT}>
                    <Text style={[styles.setL, { flex: 1 }]}>Подсчёт {i + 1}</Text>
                    <ScaleButton style={styles.stepBtn} onPress={() => stepTally(calcItem, -1, i)}>
                      <Text style={styles.stepTxt}>−</Text>
                    </ScaleButton>
                    <NumInput
                      value={n}
                      onChange={(v) => setTally(calcItem, v, i)}
                      style={[styles.cCount, styles.cCountTxt]}
                    />
                    <ScaleButton style={styles.stepBtn} onPress={() => stepTally(calcItem, 1, i)}>
                      <Text style={styles.stepTxt}>+</Text>
                    </ScaleButton>
                    {t.length > 1 ? (
                      <Pressable
                        hitSlop={10}
                        onPress={() => editTallies(calcItem, (x) => x.filter((_, j) => j !== i))}
                      >
                        <Text style={styles.tallyDel}>✕</Text>
                      </Pressable>
                    ) : (
                      <View style={{ width: 18 }} />
                    )}
                  </Animated.View>
                ))}
                <Animated.View layout={ROW_LAYOUT}>
                  <View style={[styles.segRow, { marginVertical: 8 }]}>
                    {[5, 10, 20, 50].map((n) => (
                      <ScaleButton key={n} style={styles.chip} onPress={() => stepTally(calcItem, n)}>
                        <Text style={styles.chipTxt}>+{n}</Text>
                      </ScaleButton>
                    ))}
                  </View>
                  <ScaleButton style={styles.actBtn} onPress={() => editTallies(calcItem, (x) => [...x, 0])}>
                    <Text style={styles.actBtnTxt}>Добавить подсчёт</Text>
                  </ScaleButton>
                  <View style={styles.totalLine}>
                    <Text style={styles.totalL}>Всего</Text>
                    <Text style={styles.totalV}>{fmtNum(itemTotal(t))}</Text>
                  </View>
                </Animated.View>
              </View>
            </LayoutAnimationConfig>
          ),
        };
      }

      case 'calcRates':
        return {
          title: 'Ставки',
          onClose: closeSheet,
          right: (
            <Pressable onPress={saveCalcRates}>
              <Text style={[styles.link, { color: accent }]}>Готово</Text>
            </Pressable>
          ),
          body: (
            <>
              <Text style={styles.hint}>
                Выработка = позиции × ставка, делится на сотрудников. Наставник и остановки добавляются,
                только если отмечены галочкой.
              </Text>
              <ItemCard style={styles.listCard}>
                {RATE_FIELDS.map(([k, label], i) => {
                  const kb = fieldKb(`rate_${k}`, RATE_FIELDS.map(([x]) => `rate_${x}`), label);
                  return (
                    <View key={k} style={[styles.lRow, i < RATE_FIELDS.length - 1 && styles.lRowSep]}>
                      <Text style={styles.lKey}>{label}</Text>
                      <TextInput
                        {...kb.props}
                        style={styles.rateInput}
                        keyboardType="number-pad"
                        selectTextOnFocus
                        value={form.rates?.[k] ?? ''}
                        onChangeText={(t) =>
                          setForm((f) => ({ ...f, rates: { ...f.rates, [k]: t.replace(/[^0-9]/g, '') } }))
                        }
                        placeholder="0"
                        placeholderTextColor="rgba(235,235,245,0.3)"
                      />
                      {kb.bar}
                    </View>
                  );
                })}
              </ItemCard>
              <ScaleButton
                style={styles.actBtn}
                onPress={() =>
                  setForm((f) => ({
                    ...f,
                    rates: Object.fromEntries(RATE_FIELDS.map(([k]) => [k, String(DEFAULT_RATES[k])])),
                  }))
                }
              >
                <Text style={styles.actBtnTxt}>Вернуть стандартные</Text>
              </ScaleButton>
            </>
          ),
        };

      default:
        return { title: '', onClose: closeSheet, body: null };
    }
  };

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
        {page === 0 ? (
          <>
            <View style={styles.hSide} />
            <PayHeader payday={shownPay} />
          </>
        ) : (
          <View style={styles.monthWrap}>
            <ScaleButton
              style={styles.navHit}
              onPress={() => (page === 2 ? setCalcDate((d) => addDays(d, -1)) : goMonth(-1))}
            >
              <Glass style={styles.navGlass} intensity={40}>
                <Text style={styles.navTxt}>‹</Text>
              </Glass>
            </ScaleButton>
            <View style={styles.monthBlock}>
              <Text style={styles.eyebrow} numberOfLines={1}>
                {DOCK_LABELS[page]} · {page === 2 ? DOW_FULL[parse(calcDate).getDay()] : viewY}
              </Text>
              <Text style={styles.h1} numberOfLines={1} adjustsFontSizeToFit>
                {page === 2 ? fmtShort(calcDate) : MONTHS[viewM]}
              </Text>
            </View>
            <ScaleButton
              style={styles.navHit}
              onPress={() => (page === 2 ? setCalcDate((d) => addDays(d, 1)) : goMonth(1))}
            >
              <Glass style={styles.navGlass} intensity={40}>
                <Text style={styles.navTxt}>›</Text>
              </Glass>
            </ScaleButton>
          </View>
        )}
        <ScaleButton style={[styles.round, { backgroundColor: accent }]} onPress={() => setSheet('add')}>
          <Text style={[styles.plus, { color: '#102012' }]}>+</Text>
        </ScaleButton>
      </View>

      {/* Все три вкладки живут смонтированными, скрытые — display:'none'.
          Переключение = смена стиля, без монтирования сотен строк во время
          анимации плашки. У каждой вкладки свой скролл (и своя позиция). */}
      <View
        style={styles.pages}
        onLayout={(e) => {
          mainScrollTop.current = e.nativeEvent.layout.y;
        }}
      >
        <TabPane vis={tabSV[0][0]} x={tabSV[0][1]} active={page === 0} reduce={reduceMotion}>
          <PayPager
            pi={pi}
            pos={pagePos}
            cur={pageCur}
            lo={pageLo}
            hi={pageHi}
            pages={pages}
            accent={accent}
            onEdit={openExpense}
            onToggle={toggleStatus}
            arc={arc}
            onPage={onPage}
          />
        </TabPane>

        {mounted[1] && (
          <TabPane vis={tabSV[1][0]} x={tabSV[1][1]} active={page === 1} reduce={reduceMotion}>
          <ScrollView
            style={styles.pages}
            contentContainerStyle={styles.pagesContent}
            showsVerticalScrollIndicator={false}
          >
            <LayoutAnimationConfig key={`s-${viewY}-${viewM}`} skipEntering skipExiting>
              <View>
                {periodsTouchingMonth(viewY, viewM).map((per) => {
                  const list = state.shifts
                    .filter((s) => s.date >= per.start && s.date <= per.end)
                    .sort((a, b) => a.date.localeCompare(b.date));
                  const sum = list.reduce((a, s) => a + (Number(s.amount) || 0), 0);
                  const withSum = list.filter((s) => s.amount != null && s.amount !== '').length;
                  const fromCalc = list.filter(isLinkedShift).length;
                  const mid = addDays(per.start, 6);
                  const halves = [
                    { title: 'Первая неделя', items: list.filter((s) => s.date <= mid) },
                    { title: 'Вторая неделя', items: list.filter((s) => s.date > mid) },
                  ];
                  return (
                    <Animated.View key={per.payday} style={styles.periodBlock} layout={ROW_LAYOUT}>
                      <Glass style={styles.balance} intensity={42}>
                        <View style={styles.cardHead}>
                          <Text style={styles.period}>{fmtRange(per.start, per.end)}</Text>
                          <View style={styles.tag}>
                            <Text style={styles.tagTxt}>зарплата {fmtShort(per.payday)}</Text>
                          </View>
                        </View>
                        <Text style={styles.paySub}>набрано за период</Text>
                        <Text style={[styles.bigPay, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
                          {money(sum)}
                        </Text>
                        <View style={styles.statRow}>
                          <Stat k="Смен" v={String(list.length)} />
                          <Stat k="С суммой" v={String(withSum)} />
                          <Stat k="Из расчёта" v={String(fromCalc)} />
                        </View>
                      </Glass>
                      {halves.map((h) => {
                        const hs = h.items.reduce((a, s) => a + (Number(s.amount) || 0), 0);
                        return (
                          <Animated.View key={h.title} style={styles.group} layout={ROW_LAYOUT}>
                            <View style={styles.gHead}>
                              <Text style={styles.gTitle}>{h.title}</Text>
                              {hs > 0 && <Text style={styles.gSub}>{money(hs)}</Text>}
                            </View>
                            <ItemCard>
                              {h.items.length === 0 ? (
                                <Text style={styles.empty}>Нет смен</Text>
                              ) : (
                                h.items.map((s, j) => (
                                  <ShiftRow
                                    key={s.id}
                                    item={s}
                                    last={j === h.items.length - 1}
                                    onEdit={openShift}
                                    onDelete={confirmDeleteShift}
                                    onCalc={openCalcOn}
                                    accent={accent}
                                  />
                                ))
                              )}
                            </ItemCard>
                          </Animated.View>
                        );
                      })}
                    </Animated.View>
                  );
                })}
                <Text style={[styles.hint, styles.pageHint]}>
                  Тап — сумма смены, свайп влево — убрать день. Смены «из расчёта» считаются сами.
                </Text>
              </View>
            </LayoutAnimationConfig>
          </ScrollView>
          </TabPane>
        )}

        {mounted[2] && (
          <TabPane vis={tabSV[2][0]} x={tabSV[2][1]} active={page === 2} reduce={reduceMotion}>
          <ScrollView
            style={styles.pages}
            contentContainerStyle={styles.pagesContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            ref={mainScroll}
            scrollEventThrottle={16}
            onScroll={(e) => {
              mainScrollY.current = e.nativeEvent.contentOffset.y;
            }}
          >
            <LayoutAnimationConfig key="calc" skipEntering skipExiting>
              <View>
                {calc && calcDay && (
                  <CalcView
                    calc={calc}
                    date={calcDate}
                    day={calcDay}
                    accent={accent}
                    linkedShift={linkedOnCalcDate}
                    manualOnDate={manualOnCalcDate}
                    scrollRef={mainScroll}
                    scrollY={mainScrollY}
                    scrollTop={mainScrollTop}
                    onDate={setCalcDate}
                    onPatchDay={patchDay}
                    onRole={onCalcRole}
                    onTime={onCalcTime}
                    onStep={onCalcStep}
                    onSet={onCalcSet}
                    onOpenItem={openCalcItem}
                    onOpenRates={calcStable.openRates}
                    onReset={calcStable.reset}
                    onShowShift={calcStable.showShift}
                  />
                )}
              </View>
            </LayoutAnimationConfig>
          </ScrollView>
          </TabPane>
        )}
      </View>

      {/* Dock */}
      <View style={styles.dock}>
        <View style={styles.capsuleWrap}>
          <SegmentCapsule value={page} labels={DOCK_LABELS} height={64} glass onChange={onDock} onPickUI={tabAnim} />
        </View>
        <ScaleButton style={styles.gearDock} onPress={() => setSheet('settings')}>
          <Glass style={styles.gearInner} intensity={50}>
            <Text style={styles.gearIcon}>⚙</Text>
          </Glass>
        </ScaleButton>
      </View>

      <Toast toast={toast} onUndo={undoToast} onHide={hideToast} />
      <IslandMenu arc={arc} />
      <KeyBarHost scope="main" />
      <SheetHost active={sheet} render={renderSheet} onClosed={onSheetClosed} />
    </View>
  );

  return <GestureHandlerRootView style={{ flex: 1 }}>{content}</GestureHandlerRootView>;
}

const DOCK_LABELS = ['Расходы', 'Смены', 'Расчёт'];
const ORDINALS = ['Первая', 'Вторая', 'Третья'];
const DOW_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
/** «12–25 сентября» или «29 сентября – 12 октября». */
function fmtRange(a, b) {
  const da = parse(a);
  const db = parse(b);
  if (da.getMonth() === db.getMonth()) return `${da.getDate()}–${db.getDate()} ${MONTHS_R[db.getMonth()]}`;
  return `${fmtShort(a)} – ${fmtShort(b)}`;
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
  monthWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8, height: 58 },
  hSide: { width: 48, height: 48 },
  hCenter: { flex: 1, height: 58, marginHorizontal: 8 },
  hCenterIn: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  h1C: { color: '#fff', fontSize: 27, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5 },
  hDots: { flexDirection: 'row', gap: 5, marginTop: 4, height: 6 },
  hDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(235,235,245,0.25)' },
  hDotOn: { width: 16, backgroundColor: 'rgba(235,235,245,0.9)' },
  pager: { flex: 1 },
  navHit: { width: 48, height: 48 },
  navTxt: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
  monthBlock: { paddingHorizontal: 4, flexShrink: 1, minWidth: 0 },
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
  paySubRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6 },
  paySubL: { color: 'rgba(235,235,245,0.5)', fontSize: 14, fontWeight: '500', flexShrink: 1 },
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
  gTitle: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
  gSub: { color: 'rgba(235,235,245,0.5)', fontSize: 13 },

  rowSep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  whenCol: { width: 38, alignItems: 'center' },
  whenNum: { color: '#fff', fontSize: 19, fontWeight: '700', fontVariant: ['tabular-nums'] },
  whenDow: { color: 'rgba(235,235,245,0.45)', fontSize: 11, fontWeight: '600', marginTop: -1 },
  itemTitleDim: { color: 'rgba(235,235,245,0.55)' },
  amtDim: { color: 'rgba(235,235,245,0.3)' },
  cardFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 46,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  footL: { color: 'rgba(235,235,245,0.55)', fontSize: 14, fontWeight: '600' },
  footV: { color: '#ffd60a', fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pageHint: { textAlign: 'center', paddingHorizontal: 20, marginTop: 4 },
  periodBlock: { marginBottom: 10 },
  hidden: { display: 'none' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tag: {
    flexShrink: 0,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tagGood: { backgroundColor: 'rgba(48,209,88,0.16)' },
  tagBad: { backgroundColor: 'rgba(255,69,58,0.16)' },
  tagTxt: { color: 'rgba(235,235,245,0.75)', fontSize: 12, fontWeight: '700' },
  meter: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginTop: 14,
    marginBottom: 8,
  },
  meterFill: { height: 8, borderRadius: 4 },
  statRow: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 10,
  },
  stat3: { flex: 1, minWidth: 0 },
  statV: { color: '#fff', fontSize: 19, fontWeight: '700', letterSpacing: -0.3, marginTop: 4, fontVariant: ['tabular-nums'] },
  navGlass: { flex: 1, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  itemCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,30,36,0.94)',
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
  eCardOuter: { marginBottom: 8 },
  eCardWrap: { borderRadius: 22, overflow: 'hidden' },
  eCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 66,
    paddingRight: 10,
    borderRadius: 22,
  },
  amtPaid: { color: 'rgba(235,235,245,0.6)' },
  eFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 4,
  },
  sBtnHit: { padding: 4 },
  sBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: 'rgba(48,209,88,0.16)',
    borderColor: 'rgba(48,209,88,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sBtnEdge: {
    position: 'absolute',
    top: 0,
    left: 6,
    right: 6,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  sRing: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(48,209,88,0.85)',
  },
  sFill: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sFillPaid: { backgroundColor: '#30d158' },
  tgShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48%',
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  tgEdge: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)' },
  sGlyph: { color: '#fff', fontSize: 16, fontWeight: '800' },
  menuBack: { backgroundColor: 'rgba(0,0,0,0.28)' },
  metaMoved: { color: 'rgba(100,210,255,0.85)', fontSize: 12, marginTop: 2 },
  islBox: { position: 'absolute', left: 0, top: 0, width: ISL_W, height: ISL_H },
  island: {
    width: ISL_W,
    height: ISL_H,
    borderRadius: ISL_R,
  },
  islPill: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: ISL_PILL,
    height: ISL_PILL,
    borderRadius: ISL_PILL / 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  islOpt: { position: 'absolute', top: ISL_H / 2 - ISL_OPT / 2, width: ISL_OPT, height: ISL_OPT },
  islDot: {
    width: ISL_OPT,
    height: ISL_OPT,
    borderRadius: ISL_OPT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  islDotShine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '46%',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  islGlyph: { color: '#fff', fontSize: 23, fontWeight: '800' },
  islEmpty: { width: 22, height: 22, borderRadius: 11, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.92)' },
  islCur: {
    position: 'absolute',
    left: -4,
    top: -4,
    width: ISL_OPT + 8,
    height: ISL_OPT + 8,
    borderRadius: (ISL_OPT + 8) / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  toastWrap: { position: 'absolute', left: 16, right: 16, bottom: 104, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 20,
  },
  toastTxt: { color: '#fff', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  toastBtn: { color: '#64d2ff', fontSize: 14, fontWeight: '700' },
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
    minHeight: 64,
    paddingRight: 12,
    backgroundColor: 'rgb(30,30,36)',
  },
  itemPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingLeft: 10,
    gap: 10,
  },
  mid: { flex: 1, minWidth: 0 },
  itemTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  meta: { color: 'rgba(235,235,245,0.4)', fontSize: 12, marginTop: 2 },
  amt: { color: '#fff', fontSize: 16, fontWeight: '600', marginRight: 6 },
  calcBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  calcBadgeTxt: { fontSize: 12, fontWeight: '700' },
  chevMini: { color: 'rgba(235,235,245,0.35)', fontSize: 18 },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  totalL: { color: 'rgba(235,235,245,0.5)' },
  totalV: { color: '#ffd60a', fontWeight: '700' },
  empty: { color: 'rgba(235,235,245,0.4)', textAlign: 'center', padding: 18, fontSize: 14 },

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
  segCapGlass: { overflow: 'hidden' },
  segCapRow: { flex: 1, flexDirection: 'row', padding: 5 },
  seg: { flex: 1, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  segInd: {
    position: 'absolute',
    top: 5,
    left: 5,
    bottom: 5,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.17)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  segIndEdge: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  segTxt: { color: 'rgba(235,235,245,0.5)', fontSize: 15, fontWeight: '600' },
  segTxtOn: { color: '#fff' },
  segTxtAbs: { position: 'absolute' },
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
    justifyContent: 'flex-end',
  },
  sheetDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  link: { fontWeight: '600', fontSize: 17 },
  linkLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(48,209,88,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(48,209,88,0.35)',
  },
  linkDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  linkDotTxt: { color: '#102012', fontSize: 15, fontWeight: '800' },
  linkLineTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkLineSub: { color: 'rgba(235,235,245,0.55)', fontSize: 13, marginTop: 2 },
  linkMuted: { color: 'rgba(235,235,245,0.5)', fontSize: 17 },

  field: { marginBottom: 14 },
  fieldNote: { color: 'rgba(235,235,245,0.38)', fontSize: 12, marginTop: 6, marginLeft: 4 },
  bigField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 18,
    minHeight: 72,
  },
  bigInput: {
    flex: 1,
    color: '#fff',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.8,
    paddingVertical: 10,
    fontVariant: ['tabular-nums'],
  },
  bigUnit: { color: 'rgba(235,235,245,0.4)', fontSize: 17, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  onAccent: { color: '#102012' },
  dangerBtn: { backgroundColor: 'rgba(255,69,58,0.1)', borderColor: 'rgba(255,69,58,0.25)', marginTop: 4 },
  listCard: { marginBottom: 14 },
  lRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  lRowSep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  lKey: { color: 'rgba(235,235,245,0.6)', fontSize: 15, flexShrink: 1 },
  lVal: { color: '#fff', fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  lValBig: { fontSize: 20, fontWeight: '700' },
  lTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  lSub: { color: 'rgba(235,235,245,0.42)', fontSize: 12, marginTop: 2 },
  sectionLabel: {
    color: 'rgba(235,235,245,0.5)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 6,
  },
  label: {
    color: 'rgba(235,235,245,0.5)',
    fontSize: 12,
    fontWeight: '600',
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


  anRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
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
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 3,
  },
  colorDotOn: { borderColor: '#fff' },
  colorFill: { flex: 1, borderRadius: 20 },
  hueSegOn: { borderWidth: 2, borderColor: '#fff' },
  padCard: { padding: 16 },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.06)' },
  previewRow: { marginTop: 16, marginBottom: 6 },
  previewBtn: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  rateInput: {
    minWidth: 96,
    height: 42,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  addIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  addIconTxt: { fontSize: 20, fontWeight: '700', marginTop: -1 },
  dayBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayBadgeTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  delRound: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,69,58,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  delRoundTxt: { color: '#ff453a', fontSize: 14, fontWeight: '700' },
  dayStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 18,
    paddingLeft: 16,
    paddingRight: 8,
    minHeight: 58,
  },
  hueTrack: {
    flexDirection: 'row',
    height: 40,
    borderRadius: 14,
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
    justifyContent: 'flex-end',
  },
  wheelDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  wheelCard: {
    backgroundColor: 'rgba(28,28,32,0.98)',
    borderRadius: 28,
    marginHorizontal: 8,
    marginBottom: 16,
    paddingBottom: 14,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },
  wheelChips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, alignSelf: 'stretch' },
  wheelChip: { flex: 1, alignItems: 'center', minHeight: 42, justifyContent: 'center' },
  dateField: { minHeight: 54 },
  dateDow: { color: 'rgba(235,235,245,0.45)', fontSize: 15 },
  wheelBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
   paddingVertical: 12,
  },

  // Расчёт
  bigPay: { fontSize: 52, fontWeight: '800', letterSpacing: -1.6, marginTop: 10 },
  bigPayWord: { fontSize: 38, letterSpacing: -1, lineHeight: 62 },
  calcMeta: { color: 'rgba(235,235,245,0.5)', fontSize: 13, marginTop: 2, fontWeight: '500' },
  calcSegs: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 6 },
  calcBtns: { flexDirection: 'row', gap: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  checkBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#102012', fontSize: 16, fontWeight: '800', marginTop: -1 },
  checkSum: { color: 'rgba(235,235,245,0.42)', fontSize: 15, fontWeight: '600' },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  staffNum: { minWidth: 40, textAlign: 'center' },
  cRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingLeft: 14, paddingRight: 8 },
  cRowSep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.07)' },
  cName: { flex: 1, minWidth: 0, paddingVertical: 4 },
  cNameTxt: { color: 'rgba(235,235,245,0.62)', fontSize: 16, fontWeight: '600' },
  cNameOn: { color: '#fff' },
  cTallies: { color: 'rgba(235,235,245,0.4)', fontSize: 12, marginTop: 2 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTxt: { color: '#fff', fontSize: 22, fontWeight: '500', marginTop: -2 },
  cCount: {
    width: 58,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: 0,
  },
  cCountTxt: { color: '#fff', fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chevOpen: { transform: [{ rotate: '90deg' }] },
  sumCard: { paddingHorizontal: 14, paddingVertical: 6 },
  sumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sumTotal: { borderBottomWidth: 0, paddingTop: 10 },
  sumL: { color: 'rgba(235,235,245,0.75)', fontSize: 15 },
  sumDim: { color: 'rgba(235,235,245,0.4)' },
  sumV: { color: '#fff', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  tallyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  tallyDel: { color: '#ff453a', fontSize: 16, fontWeight: '700', width: 18, textAlign: 'center' },
  showAll: { textAlign: 'center', paddingVertical: 8 },
  keyBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50 },
  keyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginHorizontal: 8,
    marginBottom: 6,
    borderRadius: 26,
  },
  keyBarRound: {
    width: 48,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBarArrow: { color: '#fff', fontSize: 22, fontWeight: '600' },
  keyBarLabel: { flex: 1, color: 'rgba(235,235,245,0.75)', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  keyBarHide: {
    height: 44,
    minWidth: 84,
    borderRadius: 22,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBarHideTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
  keyBarNext: {
    minWidth: 108,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBarNextTxt: { color: '#102012', fontSize: 17, fontWeight: '700' },
});