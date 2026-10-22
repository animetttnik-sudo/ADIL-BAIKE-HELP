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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    AppState,
    Dimensions, ImageBackground,
    InputAccessoryView,
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
    LayoutAnimationConfig,
    LinearTransition,
    useAnimatedStyle, useSharedValue,
    withSequence,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
    CALC_GROUPS,
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
const SWIPE_TRIGGER = SWIPE * 0.8;
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_R = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const DOW = ['вс','пн','вт','ср','чт','пт','сб'];
const ACCENT_PRESETS = [{ h: 145 }, { h: 210 }, { h: 280 }, { h: 30 }, { h: 350 }, { h: 190 }];
const INIT_Y = 2026;
const INIT_M = 8;

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

/**
 * Досеивает постоянные платежи и смены для месяца (y, m).
 * Вызывается синхронно ДО рендера нового месяца/режима, чтобы список
 * не появлялся пустым и не «допрыгивал» кадром позже.
 * Возвращает тот же объект, если ничего не добавилось.
 */
function seedMonth(state, viewY, viewM) {
  if (!state) return state;
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
  return changed ? next : state;
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
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingBottom: 40 }}
                    showsVerticalScrollIndicator={false}
                    style={{ flexShrink: 1 }}
                  >
                    {cfg.body}
                  </ScrollView>
                </Glass>
              </Animated.View>
            </KeyboardAvoidingView>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function DateWheel({ value, onChange, label = 'Дата' }) {
  const [open, setOpen] = useState(false);
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
      <Pressable style={styles.input} onPress={show}>
        <Text style={styles.inputText}>
          {fmtShort(value || iso(date))} {date.getFullYear()}
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
            <View style={styles.wheelBar}>
              <Pressable onPress={hide}>
                <Text style={styles.linkMuted}>Отмена</Text>
              </Pressable>
              <Text style={styles.sheetTitle}>Дата</Text>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  hide();
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
        </View>
      </Modal>
    </View>
  );
}

const ROW_ENTER = FadeIn.duration(220);
const ROW_EXIT = FadeOut.duration(180);
const ROW_LAYOUT = LinearTransition.duration(220);

const ExpenseRow = memo(function ExpenseRow({ item, pulse, onEdit, onDelete, onStatus, onSet }) {
  const x = useSharedValue(0);
  const statusScale = useSharedValue(1);
  const st = displayStatus(item);
  const show = useSharedValue(0);
  const pick = useSharedValue(0);
  const id = item.id;

  const pan = useRowSwipe(x, id, onEdit, onDelete);

  // зажим: вверх ✓, вниз ✕
  const hold = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(280)
        .onStart(() => {
          show.value = withTiming(1, { duration: 140 });
          scheduleOnRN(hapticMedium);
        })
        .onUpdate((e) => {
          const p = e.translationY < -20 ? 1 : e.translationY > 20 ? -1 : 0;
          if (p !== pick.value) {
            pick.value = p;
            scheduleOnRN(hapticSelect);
          }
        })
        .onEnd((_e, success) => {
          if (success && pick.value !== 0) scheduleOnRN(onSet, id, pick.value === 1 ? 'paid' : 'missed');
        })
        .onFinalize(() => {
          show.value = withTiming(0, { duration: 140 });
          pick.value = 0;
        }),
    [show, pick, id, onSet]
  );

  // пульс кружка статуса — когда статус реально поменялся
  // (после закрытия шторки «Статус» или сразу после зажима)
  const lastPulse = useRef(pulse); // не пульсировать при повторном монтировании
  useEffect(() => {
    if (!pulse || pulse === lastPulse.current) return;
    lastPulse.current = pulse;
    statusScale.value = withSequence(
      withTiming(1.12, { duration: 90 }),
      withTiming(1, { duration: 120 })
    );
  }, [pulse, statusScale]);

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

  const openStatus = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onStatus(id);
  };

  return (
    <Animated.View style={styles.rowOuter} entering={ROW_ENTER} exiting={ROW_EXIT} layout={ROW_LAYOUT}>
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
              <Pressable style={styles.itemPress} onPress={() => onEdit(id)}>
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
                  <Pressable onPress={openStatus} hitSlop={10}>
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
    </Animated.View>
  );
});

const ShiftRow = memo(function ShiftRow({ item, onEdit, onDelete }) {
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
    <Animated.View style={styles.rowOuter} entering={ROW_ENTER} exiting={ROW_EXIT} layout={ROW_LAYOUT}>
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
              <Pressable style={styles.itemPress} onPress={() => onEdit(id)}>
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
function SegmentCapsule({ value, labels, onChange, height = 56 }) {
  const [boxW, setBoxW] = useState(0);
  const n = labels.length;
  const segW = boxW > 0 ? (boxW - 10) / n : 0;
  const sv = useSharedValue(value);
  const drag0 = useSharedValue(0);
  useEffect(() => {
    sv.value = withSpring(value, capSpring);
  }, [value, sv]);
  const setJS = useCallback(
    (p) => {
      Haptics.selectionAsync();
      onChange(p);
    },
    [onChange]
  );
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .failOffsetY([-14, 14])
        .onBegin(() => {
          drag0.value = sv.value;
        })
        .onUpdate((e) => {
          const next = Math.max(0, Math.min(n - 1, drag0.value + e.translationX / Math.max(segW, 1)));
          sv.value = next;
        })
        .onEnd((e) => {
          const projected = sv.value + e.velocityX / 5000;
          const p = Math.max(0, Math.min(n - 1, Math.round(projected)));
          sv.value = withSpring(p, capSpring);
          if (p !== value) scheduleOnRN(setJS, p);
        }),
    [sv, drag0, n, segW, value, setJS]
  );
  const ind = useAnimatedStyle(() => ({
    width: segW,
    transform: [{ translateX: sv.value * segW }],
  }));

  return (
    <View
      style={[styles.segCap, { height }]}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setBoxW((old) => (old === w ? old : w));
      }}
    >
      <View style={styles.segCapBg} />
      <GestureDetector gesture={pan}>
        <View style={styles.segCapRow} collapsable={false}>
          {/* плашку рисуем только после замера ширины — без «прыжка» */}
          {segW > 0 && <Animated.View pointerEvents="none" style={[styles.segInd, ind]} />}
          {labels.map((lab, i) => (
            <Pressable
              key={lab}
              style={styles.seg}
              onPress={() => {
                sv.value = withSpring(i, capSpring);
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

// ───────────────────────── Расчёт смены ─────────────────────────

const fmtNumF = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const fmtNum = (n) => fmtNumF.format(Number(n) || 0);
const ROLE_LABELS = ['Рядовой', 'Кассир'];
const TIME_LABELS = ['День', 'Ночь'];
const EMPTY_COUNTS = {};
const ITEMS_BY_GROUP = CALC_GROUPS.reduce((acc, g) => {
  acc[g.id] = CALC_ITEMS.filter((it) => it.group === g.id);
  return acc;
}, {});
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
function NumInput({ value, onChange, style, inputRef, onFocused, onSubmit, accessoryId, last }) {
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
      returnKeyType={onSubmit ? (last ? 'done' : 'next') : undefined}
      submitBehavior={onSubmit ? (last ? 'blurAndSubmit' : 'submit') : undefined}
      onSubmitEditing={onSubmit}
      onFocus={() => {
        setDraft(v ? String(v) : '');
        onFocused?.();
      }}
      onBlur={() => setDraft(null)}
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
        onFocused={() => onFocusItem(id)}
        onSubmit={() => onNext(id, 1)}
        last={isLastField}
        accessoryId={Platform.OS === 'ios' ? `kb-calc-${id}` : undefined}
        style={[styles.cCount, styles.cCountTxt]}
      />
      <KeyBar
        nativeID={`kb-calc-${id}`}
        label={`${item.name}  ·  ${pos + 1}/${count}`}
        hasPrev={pos > 0}
        isLast={isLastField}
        accent={accent}
        onPrev={() => onNext(id, -1)}
        onNext={() => onNext(id, 1)}
      />
      <ScaleButton style={styles.stepBtn} onPress={() => onStep(id, 1)}>
        <Text style={styles.stepTxt}>+</Text>
      </ScaleButton>
    </View>
  );
});

/**
 * Панель над клавиатурой iOS: [Скрыть] · подпись · [↑] [Далее ›].
 * Своя панель на КАЖДОЕ поле (свой nativeID): в Fabric <InputAccessoryView nativeID>
 * цепляется только к первому полю с этим id, поэтому общий id не годится.
 * Рендерить рядом с полем (в том же окне — внутри шторки для полей шторки).
 */
const KeyBar = memo(function KeyBar({ nativeID, label, hasPrev, isLast, accent, onPrev, onNext }) {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={nativeID}>
      <Glass style={styles.keyBar} intensity={60}>
        <Pressable style={styles.keyBarHide} hitSlop={6} onPress={() => Keyboard.dismiss()}>
          <Text style={styles.keyBarHideTxt}>Скрыть</Text>
        </Pressable>
        <Text style={styles.keyBarLabel} numberOfLines={1}>
          {label}
        </Text>
        <Pressable
          style={[styles.keyBarRound, !hasPrev && { opacity: 0.35 }]}
          disabled={!hasPrev}
          hitSlop={6}
          onPress={onPrev}
        >
          <Text style={styles.keyBarArrow}>↑</Text>
        </Pressable>
        <Pressable
          style={[styles.keyBarNext, { backgroundColor: accent }]}
          hitSlop={6}
          onPress={isLast ? () => Keyboard.dismiss() : onNext}
        >
          <Text style={styles.keyBarNextTxt}>{isLast ? 'Готово' : 'Далее ›'}</Text>
        </Pressable>
      </Glass>
    </InputAccessoryView>
  );
});

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

function CalcView({
  calc, date, day, accent, shiftOnDate, scrollRef, scrollY, scrollTop,
  onDate, onPatchDay, onRole, onTime, onStep, onSet, onOpenItem, onOpenRates, onReset, onAddShift,
}) {
  const [collapsed, setCollapsed] = useState({});
  const [showUsage, setShowUsage] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // ── ввод с клавиатуры: Далее → следующая позиция (свёрнутые группы пропускаем)
  const inputs = useRef(new Map());
  const focusRef = useRef(null);
  const order = useMemo(
    () => CALC_GROUPS.filter((g) => !collapsed[g.id]).flatMap((g) => ITEMS_BY_GROUP[g.id].map((it) => it.id)),
    [collapsed]
  );
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
        const bottom = (kb ? kb.screenY : SCREEN_H) - 20;
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
  const inShifts = !!shiftOnDate && Number(shiftOnDate.amount) === ownR;

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

  const toggleGroup = (id) => {
    Haptics.selectionAsync();
    setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  };

  return (
    <>
      <DateWheel value={date} onChange={onDate} label="Дата смены" />

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
          <ScaleButton
            style={[styles.actBtn, inShifts ? styles.statusPaidBtn : { backgroundColor: accent }]}
            onPress={() => onAddShift(ownR, shiftTitle(day.role, day.time))}
          >
            <Text style={[styles.actBtnTxt, !inShifts && { color: '#102012' }]}>
              {inShifts ? '✓  В сменах' : `Добавить в смены · ${money(ownR)}`}
            </Text>
          </ScaleButton>
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

      {CALC_GROUPS.map((g) => {
        const items = ITEMS_BY_GROUP[g.id];
        const sum = items.reduce((a, it) => a + itemTotal(day.counts[it.id]), 0);
        const closed = !!collapsed[g.id];
        return (
          <Animated.View key={g.id} style={styles.group} layout={ROW_LAYOUT}>
            <Pressable style={styles.gHead} onPress={() => toggleGroup(g.id)}>
              <Text style={styles.gTitle}>
                {g.title}
                {g.note ? <Text style={styles.gSub}>{`  ${g.note}`}</Text> : null}
              </Text>
              {sum > 0 && <Text style={styles.gSub}>{fmtNum(sum)}</Text>}
              <Text style={[styles.chevMini, !closed && styles.chevOpen]}>›</Text>
            </Pressable>
            {!closed && (
              <Animated.View entering={ROW_ENTER} exiting={ROW_EXIT}>
                <ItemCard>
                  {items.map((it, i) => (
                    <CountRow
                      key={it.id}
                      item={it}
                      tallies={day.counts[it.id]}
                      last={i === items.length - 1}
                      isLastField={order[order.length - 1] === it.id}
                      pos={order.indexOf(it.id)}
                      count={order.length}
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
            )}
          </Animated.View>
        );
      })}

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
}

export default function App() {
  const [state, setState] = useState(null);
  const [page, setPage] = useState(0);
  const [viewY, setViewY] = useState(INIT_Y);
  const [viewM, setViewM] = useState(INIT_M);
  const [sheet, setSheet] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [pulse, setPulse] = useState({ id: null, t: 0 });

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
  const calcDay = useMemo(
    () => (calc ? calc.days[calcDate] || blankDay(calc.prefs) : null),
    [calc, calcDate]
  );


  useEffect(() => {
    (async () => {
      let loaded;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        loaded = raw ? JSON.parse(raw) : defaultState();
      } catch {
        loaded = defaultState();
      }
      // досеиваем стартовый месяц до первого рендера списка
      const seeded = seedMonth(loaded, INIT_Y, INIT_M);
      if (seeded !== loaded) AsyncStorage.setItem(KEY, JSON.stringify(seeded)).catch(() => {});
      let calcLoaded;
      try {
        const rawC = await AsyncStorage.getItem(CALC_KEY);
        calcLoaded = normalizeCalc(rawC ? JSON.parse(rawC) : null);
      } catch {
        calcLoaded = normalizeCalc(null);
      }
      setCalc(calcLoaded);
      setState(seeded);
    })();
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
      setPulse({ id, t: Date.now() });
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
      if (!s) return;
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
    Alert.alert('Сбросить расчёт?', `Все подсчёты за ${fmtShort(date)} будут удалены.`, [
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
  const shiftOnCalcDate = state.shifts.find((s) => s.date === calcDate) || null;
  /** Своя зарплата из расчёта → смена на ту же дату (новая или обновить сумму). */
  const addCalcShift = (amount, title) => {
    const date = calcDate;
    const apply = () => {
      const per = workPeriod(paydayOnOrBefore(addDays(date, 20)));
      patch((prev) => {
        const shifts = [...prev.shifts];
        const i = shifts.findIndex((s) => s.date === date);
        if (i >= 0) shifts[i] = { ...shifts[i], amount, title };
        else shifts.push({ id: uid(), date, amount, title, payday: per.payday });
        return { ...prev, shifts, removed: prev.removed.filter((x) => x !== date) };
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };
    const ex = shiftOnCalcDate;
    if (ex && ex.amount != null && ex.amount !== '' && Number(ex.amount) !== amount) {
      Alert.alert(
        'Заменить сумму смены?',
        `${fmtShort(date)}: ${money(ex.amount)} → ${money(amount)}`,
        [
          { text: 'Отмена', style: 'cancel' },
          { text: 'Заменить', onPress: apply },
        ]
      );
    } else if (!(ex && Number(ex.amount) === amount && ex.title === title)) {
      apply();
    }
  };

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
    const id = editId;
    patch((prev) => ({
      ...prev,
      expenses: prev.expenses.map((e) => (e.id === id ? { ...e, status } : e)),
    }));
    Haptics.notificationAsync(
      status === 'paid'
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning
    );
    // пульс кружка — когда шторка уже уехала и строку видно
    closeThen(() => setPulse({ id, t: Date.now() }));
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
              <ScaleButton style={styles.actBtn} onPress={() => openExpense(null)}>
                <Text style={styles.actBtnTxt}>Новый расход</Text>
              </ScaleButton>
              <ScaleButton style={styles.actBtn} onPress={() => openShift(null)}>
                <Text style={styles.actBtnTxt}>Новая смена</Text>
              </ScaleButton>
            </>
          ),
        };

      case 'exp':
        return {
          title: editId ? 'Расход' : 'Новый расход',
          onClose: closeSheet,
          right: (
            <Pressable onPress={saveExpense}>
              <Text style={[styles.link, { color: accent }]}>Готово</Text>
            </Pressable>
          ),
          body: (
            <>
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

      case 'shift':
        return {
          title: editId ? 'Смена' : 'Новая смена',
          onClose: closeSheet,
          right: (
            <Pressable onPress={saveShift}>
              <Text style={[styles.link, { color: accent }]}>Готово</Text>
            </Pressable>
          ),
          body: (
            <>
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

      case 'status': {
        const e = state.expenses.find((x) => x.id === editId);
        return {
          title: 'Статус',
          onClose: closeSheet,
          body: !e ? null : (
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
          ),
        };
      }

      case 'settings':
        return {
          title: 'Настройки',
          onClose: closeSheet,
          body: (
            <>
              <View style={{ marginBottom: 14 }}>
                <Text style={[styles.setL, { marginBottom: 4 }]}>Режим</Text>
                <Text style={[styles.setS, { marginBottom: 10 }]}>учёба — пт/сб/вс · работа — все дни</Text>
                <SegmentCapsule
                  value={state.settings.mode === 'work' ? 1 : 0}
                  labels={['Учёба', 'Работа']}
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
            </>
          ),
        };

      case 'custom':
        return {
          title: 'Кастомизация',
          onClose: toSettings,
          body: (
            <>
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
            </>
          ),
        };

      case 'recurring':
        return {
          title: 'Постоянные',
          onClose: toSettings,
          body: (
            <>
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
            </>
          ),
        };

      case 'analysis':
        return {
          title: 'Анализ',
          onClose: toSettings,
          body: <AnalysisView state={state} />,
        };

      case 'stats':
        return {
          title: 'Результаты',
          onClose: toSettings,
          body: (
            <>
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
            </>
          ),
        };

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
              {RATE_FIELDS.map(([k, label]) => (
                <View key={k} style={styles.field}>
                  <Text style={styles.label}>{label}</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="number-pad"
                    value={form.rates?.[k] ?? ''}
                    onChangeText={(t) =>
                      setForm((f) => ({ ...f, rates: { ...f.rates, [k]: t.replace(/[^0-9]/g, '') } }))
                    }
                    placeholder="0"
                    placeholderTextColor="rgba(235,235,245,0.3)"
                  />
                </View>
              ))}
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
        <View style={styles.monthWrap}>
          <ScaleButton
            style={styles.navHit}
            onPress={() => (page === 2 ? setCalcDate((d) => addDays(d, -1)) : goMonth(-1))}
          >
            <Text style={styles.navTxt}>‹</Text>
          </ScaleButton>
          <View style={styles.monthBlock}>
            <Text style={styles.eyebrow}>{DOCK_LABELS[page]}</Text>
            <Text style={styles.h1}>{page === 2 ? fmtShort(calcDate) : MONTHS[viewM]}</Text>
          </View>
          <ScaleButton
            style={styles.navHit}
            onPress={() => (page === 2 ? setCalcDate((d) => addDays(d, 1)) : goMonth(1))}
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        ref={mainScroll}
        scrollEventThrottle={16}
        onScroll={(e) => {
          mainScrollY.current = e.nativeEvent.contentOffset.y;
        }}
        onLayout={(e) => {
          mainScrollTop.current = e.nativeEvent.layout.y;
        }}
      >
        {/* при смене страницы/месяца — без анимаций входа/выхода всего списка;
            анимируются только добавление/удаление строк внутри */}
        <LayoutAnimationConfig
          key={page === 2 ? 'calc' : `${page}-${viewY}-${viewM}`}
          skipEntering
          skipExiting
        >
          <View>
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
                    <Animated.View key={p} style={styles.group} layout={ROW_LAYOUT}>
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
                            pulse={pulse.id === e.id ? pulse.t : 0}
                            onEdit={openExpense}
                            onDelete={confirmDeleteExpense}
                            onStatus={openStatus}
                            onSet={setStatusDirect}
                          />
                        ))
                      )}
                      <Animated.View style={styles.totalLine} layout={ROW_LAYOUT}>
                        <Text style={styles.totalL}>Общ</Text>
                        <Text style={styles.totalV}>{money(sum)}</Text>
                      </Animated.View>
                    </Animated.View>
                  );
                })}
              </>
            ) : page === 1 ? (
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
                  <Animated.View key={per.payday} layout={ROW_LAYOUT}>
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
                      <Animated.View key={h.title} style={styles.group} layout={ROW_LAYOUT}>
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
                      </Animated.View>
                    ))}
                  </Animated.View>
                );
              })
            ) : (
              calc &&
              calcDay && (
                <CalcView
                  calc={calc}
                  date={calcDate}
                  day={calcDay}
                  accent={accent}
                  shiftOnDate={shiftOnCalcDate}
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
                  onOpenRates={openCalcRates}
                  onReset={resetCalc}
                  onAddShift={addCalcShift}
                />
              )
            )}
          </View>
        </LayoutAnimationConfig>
      </ScrollView>

      {/* Dock */}
      <View style={styles.dock}>
        <View style={styles.capsuleWrap}>
          <SegmentCapsule
            value={page}
            labels={DOCK_LABELS}
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

      <SheetHost active={sheet} render={renderSheet} onClosed={onSheetClosed} />
    </View>
  );

  return <GestureHandlerRootView style={{ flex: 1 }}>{content}</GestureHandlerRootView>;
}

const DOCK_LABELS = ['Расходы', 'Смены', 'Расчёт'];

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
    justifyContent: 'flex-end',
  },
  wheelDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
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

  // Расчёт
  bigPay: { fontSize: 52, fontWeight: '800', letterSpacing: -1.6, marginTop: 10 },
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
  checkSum: { color: 'rgba(235,235,245,0.42)', fontSize: 15, fontWeight: '650' },
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
  sumV: { color: '#fff', fontSize: 15, fontWeight: '650', fontVariant: ['tabular-nums'] },
  tallyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  tallyDel: { color: '#ff453a', fontSize: 16, fontWeight: '700', width: 18, textAlign: 'center' },
  showAll: { textAlign: 'center', paddingVertical: 8 },
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