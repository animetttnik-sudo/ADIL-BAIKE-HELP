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
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
    Alert,
    AppState,
    BackHandler,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text as RNText,
    TextInput as RNTextInput,
    View,
} from 'react-native';
import 'react-native-gesture-handler';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
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
    useAnimatedKeyboard,
    useAnimatedProps,
    useAnimatedReaction,
    useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue,
    withDelay,
    withSequence,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import {
  carryInState,
  defaultPayday,
  expensesInPeriod,
  pagerRange,
  paydayMode,
  paydayTotals,
  plural,
  shouldAutoAdvance,
  summaryView,
  toggleInState,
  uncarryInState,
  undoCarry,
} from '../lib/totals';
import { applyImport, autoAddedLeft, autoAddedRecurring, monthTitle, previewImport, removeExpenses } from '../lib/planImport';
import { parsePlan } from '../lib/planParse';
import { parseShifts } from '../lib/shiftParse';
import { applyShiftImport, previewShiftImport } from '../lib/shiftImport';
import { SHIFTS_NOTE, SHIFTS_NOTE_REF } from '../lib/shiftsNote';
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
} from '../lib/calc';
import { quickCanPlus, quickShown, quickStep, quickValue } from '../lib/quickEntry';
import { computeBoxes, fmtKg } from '../lib/boxes';
import { computeCups, computeDrinks, computeSauces, EXTRA_ITEMS } from '../lib/extras';
import { monthAvg, monthStats } from '../lib/analysis';
import { createWriter, validAppState, validCalcState } from '../lib/persist';
import { removeExpense, removeShift, restoreRemoved } from '../lib/undo';
import { addRecurring, editRecurring, isRecurringExpense, isSeries, makeOneTime, makeRecurring, removeSeries, seriesToRemove, untilOfExpense } from '../lib/recurring';
import { repeatShiftDraft } from '../lib/repeatShift';
import { dueLabel, filterCounts, filterExpenses, filterShifts } from '../lib/listView';
import { paydayIndexFor, searchItems } from '../lib/search';
import { exportFileName, payReport, reportHtml, STAMP_INK_DARK, stampSpec } from '../lib/payExport';
import { printerGeom } from '../lib/printerGeom';
import { DOW_ORDER, editTemplateDay, templatesOf, toggleTemplateDay } from '../lib/modeTemplates';
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { pdfLines } from '../lib/pdfText';
import { buildImport, calcCountsFromImport } from '../lib/salesImport';
import { CATS as CATS_BANK, chartOf as bankChart, checkTotals, cutOf as bankCut, EXPLAIN as BANK_EXPLAIN, explainOptions, MODES as BANK_MODES, mergeStatement, normalizeBank, parseStatement, periodsOf, removeAccount, shortAcc, suggestionsOf as bankTips, summarize as bankSummary, TURBO as BANK_TURBO, BANK_KEY } from '../lib/bank';
import { Picker } from '@react-native-picker/picker';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path as SvgPath, Stop, Text as SvgText } from 'react-native-svg';
import { areaPath, chartPoints, chartScale, chartSeries, shortMoney, smoothPath, trendOf } from '../lib/chart';
import { AppIcon } from '../ui/AppIcons';
import { liquidShape } from '../lib/liquid';
import { GLASS_DIAG, GLASS_TINT, GlassLens, glassLensAvailable, snapshotView } from '../ui/GlassLens';

import { appKeys, fmtSummary, makeBackup, parseBackup, PRE_PASTE_KEY, restorePlan, summarize } from '../lib/backup';
import {
  KEY,
  ANCHOR,
  MONTHS,
  MONTHS_R,
  DOW,
  iso,
  parse,
  addDays,
  fmtDay,
  fmtShort,
  money,
  uid,
  todayIso,
  PAYDAYS,
  paydayOnOrBefore,
  workPeriod,
  paydaysInMonth,
  defaultState,
  seedMonth,
  applyMode,
  seedPaydays,
  seedShiftPaydays,
  paydayForDate,
  normalizeApp,
  brokenKey,
} from '../lib/periods';
import {
  CALC_TITLES,
  calcDayAdj,
  calcKey,
  calcPayForDay,
  calcSlots,
  compareKeys,
  isLinkedShift,
  keyDate,
  keySlot,
  linkKey,
  nextSlot,
  syncCalcShifts,
  withCalcDayAdj,
} from '../lib/link';
import {
  adjOf,
  carryDue,
  carryOf,
  dayTotals,
  mentorMark,
  mentorOf,
  shiftRole,
  shiftTime,
  shortTone,
  payTotals,
  shiftNet,
  surplusOf,
  withCarry,
  shiftPagerRange,
  shiftPayday,
  shiftsInPeriod,
  shiftTotals,
  shiftForecast,
  shortageOf,
  bonusLossOf,
  upcomingPayday,
  withShortage,
} from '../lib/shifts';

/**
 * Крупный шрифт iOS (Dynamic Type): растём до размера «очень крупный» (×1.35),
 * дальше — нет, иначе карточки, док и кнопки с фиксированной высотой разваливаются.
 */
const FONT_MAX = 1.35;
const SEG_FONT_MAX = 1.2; // подписи капсул и дока — высота капсулы фиксирована
function Text(props) {
  return <RNText maxFontSizeMultiplier={FONT_MAX} {...props} />;
}
const NUMERIC_KB = new Set(['number-pad', 'decimal-pad', 'numeric', 'phone-pad']);
/**
 * У цифровой клавиатуры iOS нет своей return-клавиши, и если задать returnKeyType, система/RN
 * добавляет СВОЮ кнопку («Next»/«Done» — на iOS 26 плавающей капсулой) поверх шторки.
 * У нас есть своя панель (Скрыть · ↑ · Далее ›), поэтому у цифровых полей return-клавишу не задаём.
 */
function TextInput(props) {
  if (Platform.OS === 'ios' && NUMERIC_KB.has(props.keyboardType)) {
    const { returnKeyType: _r, submitBehavior: _s, inputAccessoryViewButtonLabel: _l, ...rest } = props;
    return <RNTextInput maxFontSizeMultiplier={FONT_MAX} {...rest} />;
  }
  return <RNTextInput maxFontSizeMultiplier={FONT_MAX} {...props} />;
}

/** Корневой View экрана — его снимок преломляет капля дока (Skia). */
const SNAP_ROOT = { current: null };
// касание экрана закончилось (листание, переходы) — доку пора обновить снимок экрана в покое
const SNAP_BUS = { kick: null };

// expo-glass-effect — опционально
let GlassView = null;
let isLiquidGlassAvailable = () => false;
try {
  const eg = require('expo-glass-effect');
  GlassView = eg.GlassView;
  isLiquidGlassAvailable = eg.isLiquidGlassAvailable || (() => false);
} catch (_) {}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const ACCENT = 'hsl(145, 72%, 54%)';
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
// Док (Liquid Glass): плашка едет пружиной с перелётом и «жидко» возвращается в твёрдое состояние
// пассивное (в покое) перемещение плашки дока по тапу — плавно, без перелёта
const passiveMove = { duration: 280, easing: Easing.bezier(0.25, 0.1, 0.25, 1) };
// подлёт капли от выбранной вкладки к пальцу при удержании
const grabSpring = { damping: 17, stiffness: 200, mass: 0.85 };
const liquidPosSpring = { damping: 15, stiffness: 210, mass: 0.85 };
const liquidOnSpring = { damping: 16, stiffness: 320, mass: 0.7 };
const liquidOffSpring = { damping: 9, stiffness: 240, mass: 0.75 };

const SHEET_IN = { duration: 320, easing: Easing.out(Easing.cubic) };
const SHEET_OUT = { duration: 220, easing: Easing.in(Easing.cubic) };
const BACK_IN = { duration: 240 };

/** Ошибка внутри ворклета не должна ронять приложение: глотаем и пишем в лог JS. */
const noop = () => {};
const logWorkletErr = (m) => console.warn('[worklet] ' + m);
function wErr(err) {
  'worklet';
  try {
    scheduleOnRN(logWorkletErr, String((err && err.message) || err));
  } catch (_) {}
}
const hapticMedium = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
const hapticSelect = () => Haptics.selectionAsync().catch(() => {});

const LG = typeof isLiquidGlassAvailable === 'function' ? !!isLiquidGlassAvailable() : false;

/**
 * Карточки внутри вкладок (Расходы / Смены / Расчёт) — ОДИН путь для всех.
 * Подложка (заливка) и кромка стоят прямо на том же View, у которого borderRadius и реальный
 * размер, — видны всегда, даже если нативное стекло не нарисовалось. Стекло (GlassView, без
 * Liquid Glass — BlurView) — фоновый слой под содержимым. Вкладки «Смены»/«Расчёт» монтируются
 * при первом заходе, когда вкладка уже полностью видна (как «Расходы» при старте).
 */
const PaneGlassCtx = createContext(false);
/** Внутри сплошной серой шторки: переключатели светлее и прозрачнее (не тёмные на тёмном). */
const SheetCtx = createContext(false);

/**
 * Глубина: мягкая большая тень + плотная короткая (boxShadow: тень по пути скругления,
 * внутри карточки вырезана — стекло не темнеет; рисуется вне обрезки overflow:hidden).
 */
const DEPTH = {
  card: '0px 12px 28px rgba(0,0,0,0.42), 0px 2px 5px rgba(0,0,0,0.28)',
  sheet: '0px 18px 48px rgba(0,0,0,0.6), 0px 3px 10px rgba(0,0,0,0.32)',
  toast: '0px 16px 36px rgba(0,0,0,0.55), 0px 4px 10px rgba(0,0,0,0.35)',
  chrome: '0px 10px 26px rgba(0,0,0,0.45), 0px 2px 6px rgba(0,0,0,0.3)',
};
// внутренний градиент: сверху чуть светлее, книзу темнее (плавно, без линии по краю)
const DEPTH_SHADE = 'linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0) 42%, rgba(0,0,0,0.16) 100%)';
// Нативное стекло шире видимой карточки на GLASS_BLEED со всех сторон: его блик-кромка
// (тонкая светлая линия по краю UIGlassEffect — те самые белые полоски сверху/снизу)
// оказывается ЗА обрезкой скруглённого контейнера; внутри — то же Liquid Glass.
const GLASS_BLEED = 4;

/** Стекло: нативный Liquid Glass (GlassView) с кромкой за обрезкой; без него — BlurView. */
function Glass({ children, style, intensity = 38, tint, tintFallback, interactive = false, depth }) {
  const inPane = useContext(PaneGlassCtx);
  const flat = StyleSheet.flatten(style) || {};
  const r = flat.borderRadius != null ? flat.borderRadius : 26;
  const shadow = depth === 'none' ? null : { boxShadow: DEPTH[depth || 'card'] };
  // всплывающие меню с interactive-стеклом — как раньше: GlassView сам несёт содержимое
  if (interactive && LG && GlassView) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        tintColor={tint}
        isInteractive
        style={[styles.glassBase, style]}
      >
        {children}
      </GlassView>
    );
  }
  const shade = <View pointerEvents="none" style={styles.depthShade} />;
  if (LG && GlassView) {
    return (
      <View style={[styles.glassBase, inPane && styles.cardBase, style, shadow]}>
        <GlassView
          pointerEvents="none"
          glassEffectStyle="regular"
          colorScheme="dark"
          tintColor={tint}
          style={[styles.glassBleed, { borderRadius: r + GLASS_BLEED }]}
        />
        {shade}
        {children}
      </View>
    );
  }
  // нет Liquid Glass: blur + подкраска (без блика и кромки)
  return (
    <View style={[styles.glassBase, style, shadow]}>
      <BlurView pointerEvents="none" intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.glassFill} pointerEvents="none" />
      {tint ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tintFallback || tint }]} pointerEvents="none" />
      ) : null}
      {shade}
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
      {children}
    </Glass>
  );
}

/** Лёгкая карточка записи — без тяжёлого blur на каждой строке */
function ItemCard({ children, style }) {
  return (
    <View style={[styles.itemCard, style]}>
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
      <Text style={styles.k} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
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
          try {
            ty.value = Math.max(0, e.translationY);
          } catch (err) {
            wErr(err);
          }
        })
        .onEnd((e) => {
          try {
            if (e.translationY > 110 || e.velocityY > 900) {
              scheduleOnRN(requestClose);
            } else {
              ty.value = withSpring(0, spring);
            }
          } catch (err) {
            wErr(err);
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
                <View style={styles.sheet}>
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
                    <SheetCtx.Provider value>{cfg.body}</SheetCtx.Provider>
                  </ScrollView>
                </View>
              </Animated.View>
            </KeyboardAvoidingView>
          )}
          <KeyBarHost scope="sheet" />
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function DateWheel({ value, onChange, label = 'Дата', accent = '#30d158', variant, eyebrow, min }) {
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
    Haptics.selectionAsync().catch(noop);
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

  const sheet = (
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
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(noop);
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
              ]
                .filter(([, d]) => !min || addDays(todayIso(), d) >= min)
                .map(([t, d]) => {
                const v = addDays(todayIso(), d);
                const on = v === value;
                return (
                  <ScaleButton
                    key={t}
                    style={[styles.chip, styles.wheelChip, on && { backgroundColor: accent }]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(noop);
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
              onValueChange={(_, d) => d && onChange(min && iso(d) < min ? min : iso(d))}
              {...(min ? { minimumDate: parse(min) } : null)}
              style={{ height: 200, width: SCREEN_W - 40 }}
            />
          </Animated.View>
        </View>
      </Modal>
  );

  if (variant === 'header') {
    // шапка «Расчёта»: подпись сверху и дата крупно в стеклянной капсуле — по центру, как месяц у Расходов/Смен
    return (
      <View style={styles.hCenter}>
        <View style={styles.hCenterIn}>
          {eyebrow ? (
            <Text style={styles.eyebrow} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <ScaleButton style={styles.hDateHit} hitSlop={4} onPress={show}>
            <Glass style={styles.hDatePill} intensity={40}>
              <Text style={styles.hDateTxt} numberOfLines={1} adjustsFontSizeToFit>
                {fmtShort(value || iso(date))}
                <Text style={styles.hDateDow}> · {DOW[date.getDay()]}</Text>
              </Text>
            </Glass>
          </ScaleButton>
        </View>
        {sheet}
      </View>
    );
  }
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={({ pressed }) => [styles.input, styles.dateField, pressed && styles.rowPressed]} onPress={show}>
        <Text style={styles.inputText}>
          {fmtShort(value || iso(date))} {date.getFullYear()}
          <Text style={styles.dateDow}>  ·  {DOW[date.getDay()]}</Text>
        </Text>
        <GlyphChev />
      </Pressable>
      {sheet}
    </View>
  );
}

const ROW_ENTER = FadeIn.duration(220);
const ROW_EXIT = FadeOut.duration(180);
const ROW_LAYOUT = LinearTransition.duration(220);

const STATUS_IN = { duration: 200, easing: Easing.out(Easing.cubic) };

// ── Остров статуса ──────────────────────────────────────────────────────
// Удержание кнопки статуса → вертикальная стеклянная капсула по оси кнопки: растёт вверх
// (у верха экрана — вниз). От пальца наружу: ✓ (ближе всех), → перенести, ○.
// Ведёте большим пальцем вверх-вниз — плашка едет за ним; отпустили на варианте — выбран,
// отпустили на кнопке/в стороне — капсула просто исчезает.
const ISL_T = 84; // толщина капсулы (ширина)
const ISL_L = 236; // длина капсулы (высота)
const ISL_R = ISL_T / 2;
const ISL_OPT = 54; // диаметр варианта
const ISL_PILL = 66; // плашка выбора
const ISL_D = [46, 118, 190]; // центры вариантов: расстояние от ближнего к кнопке края
const ISL_GAP = 16; // зазор между кнопкой и капсулой
const ISL_REACH = 26 + ISL_GAP; // от центра кнопки до ближнего края капсулы
const ISL_TOP_MIN = 64; // выше — статус-бар: не хватает места → открываем вниз
const ISL_SIDE = 56; // насколько вбок от капсулы палец ещё «на капсуле»
const ISL_SPRING = { damping: 26, stiffness: 340, mass: 0.7, overshootClamping: true };
const ISL_FILL = ['#30d158', 'rgba(30,110,190,0.9)', 'rgba(58,58,66,0.95)']; // ✓ зелёный · → синий · ○ пусто

/** Центр варианта по вертикали внутри капсулы (dir 1 — капсула над кнопкой: ✓ внизу). */
function islOptY(i, dir) {
  'worklet';
  return dir > 0 ? ISL_L - ISL_D[i] : ISL_D[i];
}

/** Вариант под пальцем: −1 — ни один. Выбор по вертикали, вбок допуск щедрый. */
function islandHit(px, py, left, dir, cx, cy) {
  'worklet';
  const bx = px - cx;
  const by = py - cy;
  if (bx * bx + by * by < 30 * 30) return -1; // палец на самой кнопке
  const colX = left + ISL_T / 2;
  if (Math.abs(px - colX) > ISL_T / 2 + ISL_SIDE) return -1;
  const a = (cy - py) * dir - ISL_REACH; // вдоль капсулы от ближнего края
  if (a < -6 || a > ISL_L + 40) return -1;
  let best = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(a - ISL_D[i]) < Math.abs(a - ISL_D[best])) best = i;
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
  const left = useSharedValue(0); // левый край капсулы (окно)
  const midY = useSharedValue(0); // центр капсулы по вертикали (окно)
  const dir = useSharedValue(1); // 1 — капсула над кнопкой, −1 — под ней
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
  const { open, cx, cy, left, midY, dir, hover, cur, hold } = arc;
  // текущий статус для жеста — shared value: жест не пересоздаётся от тапа по нему же
  const curIdx = useSharedValue(status === 'paid' ? 0 : 2);

  useEffect(() => {
    paid.value = withTiming(status === 'paid' ? 1 : 0, STATUS_IN);
    curIdx.value = status === 'paid' ? 0 : 2;
  }, [status, paid, curIdx]);

  // JS-обработчики — через ref: в ворклет уходят только стабильные функции-обёртки
  const cbRef = useRef(null);
  cbRef.current = { id, onToggle, pick: arc.pick };
  const toggle = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const c = cbRef.current;
      c.onToggle(c.id);
    } catch (err) {
      console.warn('status toggle failed', err);
    }
  }, []);
  const choose = useCallback((i) => {
    try {
      const c = cbRef.current;
      c.pick(c.id, i);
    } catch (err) {
      console.warn('status pick failed', err);
    }
  }, []);

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .maxDistance(10)
      .onBegin(() => {
        try {
          press.value = withTiming(1, { duration: 90 });
        } catch (err) {
          wErr(err);
        }
      })
      .onEnd((_e, ok) => {
        try {
          if (ok) scheduleOnRN(toggle);
        } catch (err) {
          wErr(err);
        }
      })
      .onFinalize(() => {
        try {
          press.value = withTiming(0, { duration: 160 });
        } catch (err) {
          wErr(err);
        }
      });
    // имя не «hold»: иначе оно затеняет shared value hold из arc (крах на UI-потоке)
    const holdG = Gesture.Pan()
      .activateAfterLongPress(400)
      .onStart((e) => {
        try {
          // центр кнопки в координатах окна (детектор = зона 52×52)
          const x0 = e.absoluteX - e.x + 26;
          const y0 = e.absoluteY - e.y + 26;
          // вверх, если капсула влезает под статус-бар; иначе вниз (если там хватает места)
          const roomUp = y0 - ISL_REACH - ISL_L >= ISL_TOP_MIN;
          const roomDown = y0 + ISL_REACH + ISL_L <= SCREEN_H - 24;
          const d = roomUp || !roomDown ? 1 : -1;
          hold.value = 1;
          cx.value = x0;
          cy.value = y0;
          dir.value = d;
          // по оси кнопки; у правого края — ровно настолько левее, чтобы не вылезти за экран
          left.value = Math.min(Math.max(12, x0 - ISL_T / 2), SCREEN_W - 8 - ISL_T);
          midY.value = y0 - d * (ISL_REACH + ISL_L / 2);
          cur.value = curIdx.value;
          hover.value = -1;
          press.value = withTiming(0, { duration: 160 });
          open.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
          scheduleOnRN(hapticMedium);
        } catch (err) {
          wErr(err);
        }
      })
      .onUpdate((e) => {
        try {
          const h = islandHit(e.absoluteX, e.absoluteY, left.value, dir.value, cx.value, cy.value);
          if (h !== hover.value) {
            hover.value = h;
            if (h >= 0) scheduleOnRN(hapticSelect);
          }
        } catch (err) {
          wErr(err);
        }
      })
      .onEnd(() => {
        try {
          const h = hover.value;
          if (h >= 0) scheduleOnRN(choose, h);
        } catch (err) {
          wErr(err);
        }
      })
      .onFinalize(() => {
        try {
          // отпустили (или жест отменён) — остров исчезает в любом случае
          if (hold.value) open.value = withTiming(0, { duration: 150, easing: Easing.in(Easing.quad) });
          hold.value = 0;
          hover.value = -1;
        } catch (err) {
          wErr(err);
        }
      });
    return Gesture.Exclusive(holdG, tap);
  }, [press, toggle, choose, open, cx, cy, left, midY, dir, hover, cur, hold, curIdx]);

  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.1 * press.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: 1 - paid.value }));
  const paidStyle = useAnimatedStyle(() => ({
    opacity: paid.value,
    transform: [{ scale: 0.55 + 0.45 * paid.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        style={styles.sBtnHit}
        accessible
        accessibilityRole="checkbox"
        accessibilityLabel="Оплачено"
        accessibilityState={{ checked: status === 'paid' }}
        accessibilityHint="Отметить или снять отметку оплаты"
        onAccessibilityTap={toggle}
      >
        <Animated.View style={[styles.sBtn, btnStyle]}>
          <View style={styles.sBtnEdge} pointerEvents="none" />
          <Animated.View style={[styles.sRing, ringStyle]} />
          <Animated.View style={[styles.sFill, styles.sFillPaid, paidStyle]}>
            <AppIcon name="check" size={16} variant="glyph" color="#fff" />
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
      try {
        if (on !== was) h.value = withSpring(on ? 1 : 0, ISL_SPRING);
      } catch (err) {
        wErr(err);
      }
    }
  );
  const st = useAnimatedStyle(() => ({
    transform: [{ translateY: islOptY(i, dir.value) - ISL_OPT / 2 }, { scale: 1 + 0.14 * h.value }],
  }));
  const ring = useAnimatedStyle(() => ({ opacity: cur.value === i ? 1 : 0 }));
  return (
    <Animated.View style={[styles.islOpt, st]}>
      {i === 0 ? (
        <AppIcon name="check" size={ISL_OPT} variant="tileOn" shape="circle" />
      ) : i === 1 ? (
        <AppIcon name="arrowRight" size={ISL_OPT} variant="tile" shape="circle" />
      ) : (
        <AppIcon name="empty" size={ISL_OPT} variant="tile" shape="circle" />
      )}
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
      try {
        if (h === was) return;
        if (h >= 0) {
          // первая цель — плашка появляется на месте, дальше едет как плашка дока
          if (selOn.value < 0.05) sel.value = h;
          else sel.value = withSpring(h, ISL_SPRING);
          selOn.value = withTiming(1, { duration: 120 });
        } else {
          selOn.value = withTiming(0, { duration: 120 });
        }
      } catch (err) {
        wErr(err);
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
        // растёт из кнопки: в начале прижата к ней
        { translateY: midY.value - ISL_L / 2 + dir.value * 60 * (1 - o) },
        { scale: 0.55 + 0.45 * o },
      ],
    };
  });
  const pill = useAnimatedStyle(() => {
    // плашка едет по столбцу: интерполяция между центрами вариантов
    const s = Math.min(2, Math.max(0, sel.value));
    const k = s - Math.floor(s);
    const a = Math.min(2, Math.floor(s));
    const b = Math.min(2, a + 1);
    const y = islOptY(a, dir.value) + (islOptY(b, dir.value) - islOptY(a, dir.value)) * k;
    return {
      opacity: selOn.value,
      transform: [
        { translateX: ISL_T / 2 - ISL_PILL / 2 },
        { translateY: y - ISL_PILL / 2 },
        { scale: 0.85 + 0.15 * selOn.value },
      ],
    };
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.menuBack, back]} />
      <Animated.View style={[styles.islBox, box]}>
        <TintGlass style={styles.island} fill="rgba(30,30,38,0.62)" radius={ISL_R} interactive>
          <Animated.View style={[styles.islPill, pill]} />
          <IslandOption i={0} arc={arc} />
          <IslandOption i={1} arc={arc} />
          <IslandOption i={2} arc={arc} />
        </TintGlass>
      </Animated.View>
    </View>
  );
});

/**
 * Маленькое стеклянное меню у кнопки «+» (вкладки «Расходы» и «Смены»). Анимация — на UI-потоке
 * (withTiming без перелёта), стекло видно ступенькой, растёт из угла кнопки. Тап мимо — закрыть.
 */
const ADD_MENU_W = 248;
const ADD_MENU_IN = { duration: 200, easing: Easing.out(Easing.cubic) };
const ADD_MENU_OUT = { duration: 140, easing: Easing.in(Easing.cubic) };
const AddMenu = memo(function AddMenu({ visible, anchor, items, accent, onClose }) {
  const open = useSharedValue(0);
  useEffect(() => {
    open.value = withTiming(visible ? 1 : 0, visible ? ADD_MENU_IN : ADD_MENU_OUT);
  }, [visible, open]);
  const back = useAnimatedStyle(() => ({ opacity: open.value }));
  const box = useAnimatedStyle(() => {
    const o = open.value;
    return {
      opacity: o > 0.02 ? 1 : 0,
      transform: [{ translateY: -8 * (1 - o) }, { scale: 0.6 + 0.4 * o }],
    };
  });
  const top = anchor ? anchor.y + anchor.h + 8 : 100;
  const right = anchor ? Math.max(8, SCREEN_W - (anchor.x + anchor.w)) : 16;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'box-none' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.addMenuBack, back]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.addMenuBox, { top, right }, box]}>
        <TintGlass style={styles.addMenu} fill="rgba(30,30,38,0.62)" radius={22} interactive>
          {items.map((it, i) => (
            <Pressable
              key={it.title}
              style={({ pressed }) => [styles.addMenuRow, i < items.length - 1 && styles.lRowSep, pressed && styles.rowPressed]}
              onPress={() => {
                hapticSelect();
                it.onPress();
              }}
            >
              <AppIcon name={it.icon} size={30} variant="tile" />
              <View style={{ flex: 1 }}>
                <Text style={styles.lTitle} numberOfLines={1}>{it.title}</Text>
                <Text style={styles.lSub} numberOfLines={1}>{it.sub}</Text>
              </View>
            </Pressable>
          ))}
        </TintGlass>
      </Animated.View>
    </View>
  );
});

/** Короткая плашка «Перенесено на …» с «Отменить». */
function Toast({ toast, onUndo, onHide }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onHide, toast.undo ? 6000 : 4000); // с «Отменить» — чуть дольше
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
      <Glass style={styles.toast} intensity={60} depth="toast">
        <Text style={styles.toastTxt} numberOfLines={1}>{toast.text}</Text>
        {toast.undo ? (
          <Pressable hitSlop={12} onPress={onUndo} accessibilityRole="button" accessibilityLabel="Отменить">
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
/** Нажатие на строку: подсветка — ровным слоем на ВСЮ карточку (по её скруглению), а не на часть строки. */
const ROW_HI_IN = { duration: 120, easing: Easing.out(Easing.quad) };
const ROW_HI_OUT = { duration: 260, easing: Easing.out(Easing.cubic) };
function useRowPress(id, onEdit) {
  // подсветка нажатия — shared value на UI-потоке (раньше setState перерисовывал карточку со стеклом → рывок)
  const hiOp = useSharedValue(0);
  const hiStyle = useAnimatedStyle(() => ({ opacity: hiOp.value }));
  const edit = useCallback(() => onEdit(id), [id, onEdit]);
  const props = {
    onPress: edit,
    delayLongPress: 380,
    onLongPress: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(noop);
      edit();
    },
    onPressIn: () => {
      hiOp.value = withTiming(1, ROW_HI_IN);
    },
    onPressOut: () => {
      hiOp.value = withTiming(0, ROW_HI_OUT);
    },
  };
  const hi = <Animated.View pointerEvents="none" style={[styles.rowHi, hiStyle]} />;
  return { props, hi };
}

const ExpenseCard = memo(function ExpenseCard({ item, onEdit, onToggle, onReturn, arc }) {
  const st = displayStatus(item);
  const due = dueLabel(item, todayIso()); // «не оплачено» / «к оплате сегодня» — срок наступил
  const id = item.id;
  const { props: pressProps, hi } = useRowPress(id, onEdit);
  return (
    <Animated.View entering={ROW_ENTER} exiting={CARD_EXIT} layout={ROW_LAYOUT} style={styles.eCardOuter}>
      {/* стекло не кладём прямо в вид с layout-анимациями — между ними обычный View */}
      <View collapsable={false}>
      <Glass style={styles.eCard} intensity={34}>
        {hi}
        <Pressable
          style={styles.itemPress}
          {...pressProps}
          accessibilityRole="button"
          accessibilityLabel={`${item.title || 'Без названия'}, ${fmtShort(item.date)}, ${money(item.amount)} сом${st === 'paid' ? ', оплачено' : due ? `, ${due}` : ''}`}
          accessibilityHint="Изменить расход"
        >
          <View style={styles.whenCol}>
            <Text style={styles.whenNum}>{fmtDay(item.date)}</Text>
            <Text style={styles.whenDow}>{DOW[parse(item.date).getDay()]}</Text>
          </View>
          <View style={styles.mid}>
            <Text style={[styles.itemTitle, !item.title && styles.itemTitleDim]} numberOfLines={1}>
              {item.title || 'Без названия'}
            </Text>
            {st === 'paid' ? (
              <Text style={[styles.meta, styles.good]} numberOfLines={1}>
                оплачено
              </Text>
            ) : due ? (
              <Text style={[styles.meta, styles.due]} numberOfLines={1}>
                {due}
              </Text>
            ) : null}
            {item.movedFrom ? (
              <View style={styles.movedRow}>
                <Text style={[styles.metaMoved, { flexShrink: 1 }]} numberOfLines={1}>
                  ↪ перенесено с {fmtShort(item.movedFrom)}
                  {item.moves > 1 ? ` · ${item.moves}×` : ''}
                </Text>
                {onReturn ? (
                  <Pressable hitSlop={12} style={styles.returnBtn} accessibilityRole="button" accessibilityLabel="Вернуть на прошлую зарплату" onPress={() => onReturn(id)}>
                    <Text style={styles.returnTxt}>вернуть</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
          <Text style={[styles.amt, st === 'paid' && styles.amtPaid]} numberOfLines={1}>{money(item.amount)}</Text>
        </Pressable>
        <StatusButton id={id} status={st === 'paid' ? 'paid' : null} onToggle={onToggle} arc={arc} />
      </Glass>
      </View>
    </Animated.View>
  );
});

/**
 * Стеклянная карточка смены — тот же язык, что у расходов. Тап — изменить (сумма, недостача,
 * «Убрать день»); у смены из «Расчёта» бейдж «из расчёта ›» открывает расчёт этого дня.
 * Недостача не уменьшает сумму смены — отдельная красная строка.
 */
const ShiftCard = memo(function ShiftCard({ item, onEdit, onCalc, accent, dayTotal }) {
  const id = item.id;
  const { props: pressProps, hi } = useRowPress(id, onEdit);
  const noSum = item.amount == null || item.amount === '';
  const short = shortageOf(item);
  const plus = surplusOf(item);
  const mentor = mentorMark(item);
  const linked = item.source === 'calc';
  return (
    <Animated.View entering={ROW_ENTER} exiting={CARD_EXIT} layout={ROW_LAYOUT} style={styles.eCardOuter}>
      <View collapsable={false}>
      <Glass style={styles.eCard} intensity={34}>
        {hi}
        <Pressable
          style={styles.itemPress}
          {...pressProps}
          accessibilityRole="button"
          accessibilityLabel={`${item.title || 'Смена'}, ${fmtShort(item.date)}, ${noSum ? 'без суммы' : `${money(item.amount)} сом`}${short ? `, недостача ${money(short)}` : ''}`}
          accessibilityHint="Изменить смену"
        >
          <View style={styles.whenCol}>
            <Text style={styles.whenNum}>{fmtDay(item.date)}</Text>
            <Text style={styles.whenDow}>{DOW[parse(item.date).getDay()]}</Text>
          </View>
          <View style={styles.mid}>
            <Text style={styles.itemTitle} numberOfLines={1}>
              {item.title || 'Смена'}
              {item.place ? <Text style={styles.placeTxt}> · {item.place}</Text> : null}
            </Text>
            {linked ? (
              <Pressable hitSlop={12} style={styles.calcBadge} accessibilityRole="button" accessibilityLabel="Открыть расчёт этой смены" onPress={() => onCalc(linkKey(item))}>
                <Text style={[styles.calcBadgeTxt, { color: accent }]}>∑ из расчёта ›</Text>
              </Pressable>
            ) : (
              <Text style={styles.meta} numberOfLines={1}>
                {noSum ? 'без суммы — тап, чтобы вписать' : 'вручную'}
              </Text>
            )}
            {mentor ? (
              <Text style={styles.metaPlus} numberOfLines={1}>
                наставник +{money(mentor)}
                {noSum ? '' : <Text style={styles.metaDim}> · уже в сумме</Text>}
              </Text>
            ) : null}
            {short ? (
              <Text style={shortTone(short) === 'bad' ? styles.metaShort : styles.metaPlus} numberOfLines={1}>
                недостача −{money(short)}
              </Text>
            ) : null}
            {bonusLossOf(item) ? (
              <Text style={styles.metaShort} numberOfLines={1}>
                без премии кассира −{money(bonusLossOf(item))}
              </Text>
            ) : null}
            {plus ? (
              <Text style={styles.metaShort} numberOfLines={1}>
                излишек {money(plus)} · не в зарплату
              </Text>
            ) : null}
          </View>
          <Text style={[styles.amt, noSum && styles.amtDim]} numberOfLines={1}>{noSum ? '—' : money(item.amount)}</Text>
          <GlyphChev size={16} />
        </Pressable>
      </Glass>
      </View>
      {dayTotal ? (
        <View style={styles.dayTotalRow}>
          <Text style={styles.dayTotalL} numberOfLines={1}>
            За день {fmtShort(item.date)} · {dayTotal.count} {plural(dayTotal.count, 'смена', 'смены', 'смен')}
            {dayTotal.net !== dayTotal.amount ? ` · чистыми ${money(dayTotal.net)}` : ''}
          </Text>
          <Text style={[styles.dayTotalV, { color: accent }]}>{money(dayTotal.amount)}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
});

const APressable = Animated.createAnimatedComponent(Pressable);
/** Быстрый фильтр списка страницы: «Все · Не оплачено (N)». */
function FilterChips({ options, value, onChange, accent, wrap }) {
  return (
    <View style={[styles.fChips, wrap && { flexWrap: 'wrap' }]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.k === value;
        return (
          <Pressable
            key={o.k}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              Haptics.selectionAsync().catch(noop);
              onChange(o.k);
            }}
            style={[styles.fChip, on && { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: accent }]}
          >
            <Text style={[styles.fChipTxt, on && styles.fChipTxtOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Пустой список: коротко, что здесь будет, и одна понятная кнопка. */
function EmptyState({ icon, title, text, action, onAction, accent = '#30d158' }) {
  return (
    <ItemCard style={styles.emptyCard}>
      {icon ? (
        <View style={styles.emptyIconWrap}>
          <AppIcon name={icon} size={44} variant={icon === 'check' ? 'tileOn' : 'tile'} />
        </View>
      ) : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {action && onAction ? (
        <ScaleButton style={styles.emptyBtn} onPress={onAction}>
          <Text style={[styles.emptyBtnTxt, { color: accent }]}>{action}</Text>
        </ScaleButton>
      ) : null}
    </ItemCard>
  );
}

/**
 * Кнопка с «нажатием» — только scale (без opacity: прозрачность родителя
 * ломает BlurView/GlassView на iOS). Небольшая задержка pressIn, чтобы кнопки
 * не сжимались, когда палец просто начинает скролл.
 */
// мягкое «вдавливание» панели и пружинистый возврат
// плавно: вдавливание 170 мс ease-out, возврат — пружина почти без перелёта (без «дрожи»)
const PRESS_IN = { duration: 170, easing: Easing.out(Easing.cubic) };
const PRESS_OUT = { damping: 28, stiffness: 320, mass: 1, overshootClamping: false };
function ScaleButton({ onPress, style, children, hitSlop, accessibilityLabel }) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <APressable
      unstable_pressDelay={70}
      onPressIn={() => {
        scale.value = withTiming(0.97, PRESS_IN);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, PRESS_OUT);
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(noop);
        onPress?.();
      }}
      style={[style, anim]}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </APressable>
  );
}

/** Капсула: тап + свайп + spring-доводка. Индикатор — плотная плашка без nested glass. */
/** Подпись сегмента: яркость считается из позиции плашки на UI-потоке (без ожидания JS). */
function GlyphChev({ size = 16 }) {
  return <AppIcon name="chevronRight" size={size} variant="glyph" color="rgba(235,235,245,0.35)" />;
}

function SegLabel({ label, index, pos, fontSize, icon }) {
  const on = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(pos.value - index), [0, 0.6], [1, 0], Extrapolation.CLAMP),
  }));
  if (icon) {
    return (
      <View style={styles.seg} pointerEvents="none" accessible accessibilityLabel={label}>
        <AppIcon name={icon} size={42} variant="tile" />
        <Animated.View style={[styles.segIconOn, on]} pointerEvents="none">
          <AppIcon name={icon} size={42} variant="tileOn" />
        </Animated.View>
      </View>
    );
  }
  return (
    <View style={styles.seg} pointerEvents="none">
      <Text style={[styles.segTxt, fontSize && { fontSize }]} numberOfLines={1} maxFontSizeMultiplier={SEG_FONT_MAX}>
        {label}
      </Text>
      <Animated.Text
        style={[styles.segTxt, styles.segTxtOn, styles.segTxtAbs, fontSize && { fontSize }, on]}
        numberOfLines={1}
        maxFontSizeMultiplier={SEG_FONT_MAX}
      >
        {label}
      </Animated.Text>
    </View>
  );
}

/**
 * Подпись внутри «линзы» жидкой плашки: стоит на своём месте капсулы (сдвинута на −pos), увеличена
 * (как стекло увеличивает у края) и с красно-синей бахромой ±1 пт — приближение преломления.
 */
function LensLabel({ label, index, pos, segW, liquid, fontSize, icon }) {
  const st = useAnimatedStyle(() => {
    const sh = liquidShape(liquid.value, pos.value, 0);
    return {
      width: segW.value,
      // увеличение подписи под стеклом (линза ещё и тянется вместе с плашкой)
      transform: [{ translateX: (index - pos.value) * segW.value }, { scale: sh.lens }],
    };
  });
  if (icon) {
    return (
      <Animated.View style={[styles.lqLab, st]}>
        <AppIcon name={icon} size={42} variant="tileOn" />
      </Animated.View>
    );
  }
  const fz = fontSize && { fontSize };
  return (
    <Animated.View style={[styles.lqLab, st]}>
      <Text style={[styles.segTxt, styles.lqTxtR, styles.segTxtAbs, fz]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.segTxt, styles.lqTxtB, styles.segTxtAbs, fz]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.segTxt, styles.segTxtOn, fz]} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
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
// первый заход во вкладку: содержимое монтируется, когда она уже проявилась целиком
const TAB_MOUNT_MS = TAB_IN.duration + 40;
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
      <PaneGlassCtx.Provider value>{children}</PaneGlassCtx.Provider>
    </Animated.View>
  );
});

function SegmentCapsule({ value, labels, onChange, onPickUI, height = 56, glass = false, fontSize, icons }) {
  const inSheet = useContext(SheetCtx);
  const n = labels.length;
  const isLiquid = glass; // «жидкая» плашка — только у дока
  const liquid = useSharedValue(0);
  const vel = useSharedValue(0);
  const lastPos = useSharedValue(value);
  const lastT = useSharedValue(0);
  // настоящее преломление (Skia): снимок экрана при касании + положение дока на экране
  const realLens = isLiquid && glassLensAvailable;
  const hostRef = useRef(null);
  const hostX = useSharedValue(0);
  const hostY = useSharedValue(0);
  const [lensSnap, setLensSnap] = useState(null);
  const lensReady = useSharedValue(0); // преломление проявляется плавно, когда снимок готов
  const hasSnap = useSharedValue(0);
  const [segWJs, setSegWJs] = useState(0);
  const snapBusy = useRef(false);
  const measureHost = useCallback(() => {
    try {
      hostRef.current?.measureInWindow?.((x, y) => {
        hostX.value = x;
        hostY.value = y;
      });
    } catch {
      // нет замера — останется прежний
    }
  }, [hostX, hostY]);
  // Снимок ЭКРАНА (под стеклом панели снимок одной панели пуст — iOS не рисует glass/blur
  // в снимках, поэтому преломлять было нечего). Снимаем только в покое и держим в кэше:
  // после смены вкладки, после касаний/листания и после того как капля опустилась —
  // в момент нажатия ничего тяжёлого не происходит.
  const takeSnap = useCallback(() => {
    if (!realLens) return;
    if (snapBusy.current || !SNAP_ROOT.current) {
      GLASS_DIAG.idle = snapBusy.current ? 'снимок уже идёт' : 'нет корня';
      return;
    }
    snapBusy.current = true;
    measureHost();
    snapshotView(SNAP_ROOT)
      .then((snap) => {
        if (!snap || !snap.image || snap.image.width() < 2 || snap.image.height() < 2) return;
        setLensSnap(snap);
        if (!hasSnap.value) {
          hasSnap.value = 1;
          lensReady.value = withTiming(1, { duration: 220 });
        }
      })
      .finally(() => {
        snapBusy.current = false;
      });
  }, [realLens, measureHost, lensReady, hasSnap]);
  const idleTimer = useRef(null);
  const snapWhenIdleRef = useRef(() => {});
  const liquidRef = useRef(liquid);
  const pressRef = useRef(null);
  // отложенный снимок: после анимаций, в свободном кадре и только если капля опущена
  const snapWhenIdle = useCallback(
    (delay = 450, force = false) => {
      if (!realLens) return;
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => {
        // кадр отрисовки после паузы; капля должна быть опущена (пружина могла ещё не «досесть» —
        // тогда пробуем ещё раз позже, а не теряем снимок навсегда)
        requestAnimationFrame(() => {
          const still = Math.abs(liquidRef.current.value) < 0.01 && Math.abs(pressRef.current.value) < 0.01;
          GLASS_DIAG.idle = still ? 'снимаю' : 'жду покоя';
          if (force || still) takeSnap();
          else snapWhenIdleRef.current(400, false);
        });
      }, delay);
    },
    [realLens, takeSnap]
  );
  snapWhenIdleRef.current = snapWhenIdle;
  useEffect(() => {
    if (!realLens) return undefined;
    GLASS_DIAG.ready = () => lensReady.value;
    SNAP_BUS.kick = () => snapWhenIdle(1100, false); // после листания с инерцией
    return () => {
      SNAP_BUS.kick = null;
      clearTimeout(idleTimer.current);
    };
  }, [realLens, snapWhenIdle, lensReady]);
  const segW = useSharedValue(0);
  const [measured, setMeasured] = useState(false);
  const pos = useSharedValue(value);
  const target = useSharedValue(value);
  const drag0 = useSharedValue(0);
  const press = useSharedValue(0);
  pressRef.current = press;
  // капля «идёт за пальцем»: от позиции выбранной вкладки (from) к пальцу (fingerP) по пружине grab 0→1
  const follow = useSharedValue(0);
  const grab = useSharedValue(0);
  const from = useSharedValue(value);
  const fingerP = useSharedValue(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const commit = useCallback((p) => {
    Haptics.selectionAsync().catch(noop);
    onChangeRef.current(p);
  }, []);

  // внешняя смена value (не нашим жестом) — плавно доехать
  useEffect(() => {
    if (target.value !== value) {
      target.value = value;
      pos.value = isLiquid ? withTiming(value, passiveMove) : withSpring(value, capSpring);
    }
  }, [value, pos, target, isLiquid]);

  const gesture = useMemo(() => {
    const fingerAt = (x) => {
      'worklet';
      const w = Math.max(segW.value, 1);
      return Math.max(-0.08, Math.min(n - 0.92, (x - 5) / w - 0.5));
    };
    const pick = (p, v = 0, active = true) => {
      'worklet';
      follow.value = 0;
      grab.value = 0;
      // покой (простой тап) — ровное смещение без пружины; пружина — только после удержания/перетаскивания
      if (isLiquid && !active) pos.value = withTiming(p, passiveMove);
      else pos.value = withSpring(p, isLiquid ? { ...liquidPosSpring, velocity: v } : capSpring);
      if (isLiquid) liquid.value = withSpring(0, liquidOffSpring);
      if (p !== target.value) {
        target.value = p;
        // контент вкладок стартует в этом же кадре UI-потока, JS — следом
        if (onPickUI) onPickUI(p);
        scheduleOnRN(commit, p);
      }
    };
    const tap = Gesture.Tap()
      .maxDuration(5000)
      .onBegin((e) => {
        try {
          press.value = withTiming(1, { duration: 90 });
          // удержание (дольше 160 мс) — плашка «разжижается» и по пружине едет под палец
          if (isLiquid) {
            liquid.value = withDelay(160, withSpring(1, liquidOnSpring));
            from.value = pos.value;
            fingerP.value = fingerAt(e.x);
            grab.value = 0;
            follow.value = 1;
            grab.value = withDelay(160, withSpring(1, grabSpring));
          }
        } catch (err) {
          wErr(err);
        }
      })
      .onEnd((e, ok) => {
        try {
          const w = segW.value;
          if (!ok || w <= 0) return;
          pick(Math.max(0, Math.min(n - 1, Math.floor((e.x - 5) / w))), 0, liquid.value > 0.05);
        } catch (err) {
          wErr(err);
        }
      })
      .onFinalize(() => {
        try {
          press.value = withTiming(0, { duration: 160 });
        } catch (err) {
          wErr(err);
        }
      });
    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-14, 14])
      .onBegin((e) => {
        try {
          drag0.value = pos.value;
          if (isLiquid) fingerP.value = fingerAt(e.x);
        } catch (err) {
          wErr(err);
        }
      })
      .onStart(() => {
        try {
          press.value = withTiming(1, { duration: 90 });
          if (isLiquid) {
            liquid.value = withSpring(1, liquidOnSpring);
            if (!follow.value) {
              from.value = pos.value;
              grab.value = 0;
              follow.value = 1;
            }
            // уже было удержание — продолжаем текущую пружину; иначе сразу тянемся к пальцу
            grab.value = withSpring(1, grabSpring);
          }
        } catch (err) {
          wErr(err);
        }
      })
      .onUpdate((e) => {
        try {
          const w = Math.max(segW.value, 1);
          if (isLiquid) {
            fingerP.value = fingerAt(e.x); // позицию капли считает реакция ниже (с подлётом к пальцу)
            vel.value = e.velocityX / w;
          } else {
            pos.value = Math.max(-0.08, Math.min(n - 0.92, drag0.value + e.translationX / w));
          }
        } catch (err) {
          wErr(err);
        }
      })
      .onEnd((e) => {
        try {
          const projected = pos.value + e.velocityX / 5000;
          pick(Math.max(0, Math.min(n - 1, Math.round(projected))), isLiquid ? e.velocityX / Math.max(segW.value, 1) : 0);
          vel.value = 0;
        } catch (err) {
          wErr(err);
        }
      })
      .onFinalize(() => {
        try {
          press.value = withTiming(0, { duration: 160 });
          // палец отпущен, а вкладку никто не выбрал (жест не распознан) — осесть на ближайшей к пальцу
          if (isLiquid && follow.value) {
            pick(Math.max(0, Math.min(n - 1, Math.round(fingerP.value))), 0, liquid.value > 0.05);
          }
          // отпустили — пружиной с перелётом обратно в твёрдое стекло
          if (isLiquid) liquid.value = withSpring(0, liquidOffSpring);
        } catch (err) {
          wErr(err);
        }
      });
    return Gesture.Race(pan, tap);
  }, [n, pos, target, drag0, press, segW, commit, onPickUI, isLiquid, liquid, vel, follow, grab, from, fingerP]);

  // пока палец на панели: капля = путь от выбранной вкладки к пальцу (grab — пружина подлёта)
  useAnimatedReaction(
    () => (follow.value ? from.value + (fingerP.value - from.value) * grab.value : null),
    (p) => {
      if (p !== null && follow.value) pos.value = p;
    }
  );

  // Нажатие: подъём капли идёт сам по себе, без ожидания снимка. Здесь — только лёгкий замер
  // положения панели; если снимка ещё нет (самое первое касание) — капля обычная прозрачная линза,
  // снимок сделается в покое и преломление проявится плавно.
  useAnimatedReaction(
    () => (liquid.value > 0.04 ? (liquid.value > 0.97 ? 2 : 1) : 0),
    (st, was) => {
      if (!realLens || st === was) return;
      if (st === 1 && was === 0) scheduleOnRN(measureHost);
      else if (st === 0) scheduleOnRN(snapWhenIdle, 500, false); // капля опустилась — обновить кэш в покое
    }
  );
  // вкладка / размеры / шрифт поменялись — заранее переснять панель в покое
  const labelsKey = labels.join('|') + (icons ? '|' + icons.join('|') : '');
  useEffect(() => {
    if (measured && segWJs > 0) snapWhenIdle(500, false);
  }, [value, measured, segWJs, labelsKey, fontSize, snapWhenIdle]);

  // скорость плашки и при пружине после отпускания (сегментов/с) — для растяжения по ходу
  useAnimatedReaction(
    () => pos.value,
    (p) => {
      if (!isLiquid) return;
      const now = Date.now();
      const dt = Math.max(1, now - lastT.value) / 1000;
      if (dt < 0.2) vel.value = vel.value * 0.6 + ((p - lastPos.value) / dt) * 0.4;
      else vel.value = 0;
      lastPos.value = p;
      lastT.value = now;
    }
  );

  const ind = useAnimatedStyle(() => {
    if (!isLiquid) {
      const p = Math.max(0, Math.min(n - 1, pos.value));
      return {
        width: segW.value,
        // нажатие слегка «вдавливает» плашку (scale < 1) — увеличение вылезало бы за край дорожки
        transform: [{ translateX: p * segW.value }, { scale: 1 - press.value * 0.03 }],
      };
    }
    // в покое — твёрдая плашка в панели; при удержании её заменяет капля над панелью
    return {
      width: segW.value,
      opacity: 1 - Math.min(1, Math.max(0, liquid.value)),
      transform: [{ translateX: Math.max(0, Math.min(n - 1, pos.value)) * segW.value }],
    };
  });
  // капля (приподнятая линза) над панелью: настоящие размеры, а не scale — кромка не искажается
  const h0 = height - 10;
  const drop = useAnimatedStyle(() => {
    const sh = liquidShape(liquid.value, pos.value, vel.value);
    const w = segW.value * sh.rx;
    const h = h0 * sh.ry;
    const on = Math.min(1, Math.max(0, liquid.value * 1.5));
    return {
      width: w,
      height: h,
      borderRadius: h / 2,
      opacity: on,
      shadowOpacity: 0.3 * on,
      transform: [{ translateX: pos.value * segW.value - (w - segW.value) / 2 }, { translateY: -(h - h0) / 2 }],
    };
  });
  const dropRad = useAnimatedStyle(() => {
    const sh = liquidShape(liquid.value, pos.value, vel.value);
    return { borderRadius: (h0 * sh.ry) / 2 };
  });
  // подписи внутри капли — те же, что раньше (масштаб sx/sy вокруг центра плашки)
  const dropLabels = useAnimatedStyle(() => {
    const sh = liquidShape(liquid.value, pos.value, vel.value);
    const w = segW.value * sh.rx;
    const h = h0 * sh.ry;
    return {
      width: segW.value,
      left: (w - segW.value) / 2,
      top: (h - h0) / 2,
      transform: [{ scaleX: sh.sx }, { scaleY: sh.sy }],
    };
  });

  // холст преломления: фиксированного размера (больше самой большой капли), центр — в центре капли
  const lensW = Math.ceil(segWJs * 1.18 * 1.35) + 8;
  const lensH = Math.ceil(h0 * 1.55) + 8;
  // uniforms шейдера — здесь же, на UI-потоке, из тех же shared values, что и сама капля (точки экрана)
  const snapK = lensSnap ? `${lensSnap.image.width()}|${lensSnap.ox}|${lensSnap.oy}|${lensSnap.w}` : '';
  const sIw = lensSnap ? lensSnap.image.width() : 1;
  const sIh = lensSnap ? lensSnap.image.height() : 1;
  const sScale = lensSnap ? sIw / Math.max(1, lensSnap.w) : 1;
  const sOx = lensSnap ? lensSnap.ox : 0;
  const sOy = lensSnap ? lensSnap.oy : 0;
  const lensUniforms = useDerivedValue(() => {
    const sh = liquidShape(liquid.value, pos.value, vel.value);
    return {
      uCanvas: [lensW, lensH],
      uSize: [segW.value * sh.rx, h0 * sh.ry],
      uCenter: [hostX.value + 5 + pos.value * segW.value + segW.value / 2, hostY.value + 5 + h0 / 2],
      uOrigin: [sOx, sOy],
      uImg: [sIw, sIh],
      uScale: sScale,
      uBar: [hostX.value, hostY.value, segW.value * n + 10, height],
      uDebug: GLASS_TINT.value,
    };
  }, [snapK, lensW, lensH, h0, n, height]);
  const lensPos = useAnimatedStyle(() => {
    const sh = liquidShape(liquid.value, pos.value, vel.value);
    return { left: (segW.value * sh.rx - lensW) / 2, top: (h0 * sh.ry - lensH) / 2, opacity: lensReady.value };
  });

  const Wrap = glass ? Glass : View;
  const capsule = (
    <Wrap
      style={[glass ? styles.segCapGlass : styles.segCap, !glass && inSheet && styles.segCapLight, { height, borderRadius: height / 2 }]}
      intensity={50}
      depth="chrome"
    >
      <GestureDetector gesture={gesture}>
        <View style={styles.segCapRow} collapsable={false}>
          {/* дорожка плашки: ровно 5 pt от краёв со всех сторон; ширину сегмента берём из неё самой,
              поэтому плашка никогда не выходит за край капсулы */}
          <View
            style={styles.segTrack}
            pointerEvents="none"
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width / n;
              segW.value = w;
              if (isLiquid) setSegWJs(w);
              if (!measured) setMeasured(true);
            }}
          >
            {/* плашку рисуем только после замера ширины — без «прыжка» */}
            {measured && (
              <Animated.View
                pointerEvents="none"
                style={[styles.segInd, isLiquid && styles.segIndSolid, !glass && inSheet && styles.segIndLight, { borderRadius: h0 / 2 }, ind]}
              />
            )}
          </View>
          <View style={styles.segTrackRow} pointerEvents="none">
            {labels.map((lab, i) => (
              <SegLabel key={lab} label={lab} index={i} pos={pos} fontSize={fontSize} icon={icons ? icons[i] : undefined} />
            ))}
          </View>
        </View>
      </GestureDetector>
    </Wrap>
  );
  if (!isLiquid) return capsule;
  return (
    <View style={styles.lqHost} ref={hostRef} collapsable={false}>
      {capsule}
      {/* капля — отдельный слой над панелью (панель её не обрезает), с тенью под собой */}
      {measured ? (
        <Animated.View pointerEvents="none" style={[styles.lqDrop, { top: 5, left: 5, height: h0 }, drop]}>
          <Animated.View style={[styles.lqClip, dropRad]}>
            {/* настоящее преломление снимка экрана (Skia); без Skia — прозрачная приближённая линза */}
            {realLens && lensSnap ? (
              <Animated.View style={[styles.lqCanvas, lensPos]}>
                <GlassLens snap={lensSnap} cw={lensW} ch={lensH} uniforms={lensUniforms} />
              </Animated.View>
            ) : null}
            {/* прозрачная линза: без размытия и заливки — видно всё, что под каплей */}
            <View style={styles.lqDropFill} />
            <View style={[styles.lqHi, styles.lqHiTop1]} />
            <View style={[styles.lqHi, styles.lqHiTop2]} />
            <View style={[styles.lqHi, styles.lqHiBot]} />
            <Animated.View style={[styles.lqDropLabels, { height: h0 }, dropLabels]}>
              {labels.map((lab, i) => (
                <LensLabel key={lab} label={lab} index={i} pos={pos} segW={segW} liquid={liquid} fontSize={fontSize} icon={icons ? icons[i] : undefined} />
              ))}
            </Animated.View>
            <Animated.View style={[styles.lqFringe, styles.lqFringeR, dropRad]} />
            <Animated.View style={[styles.lqFringe, styles.lqFringeB, dropRad]} />
            <Animated.View style={[styles.lqRim, dropRad]} />
            <Animated.View style={[styles.lqOutline, dropRad]} />
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const AN_RANGES = [3, 6, 0];
// ── «Анализ»: прозрачный неоновый график (как биржевой): зелёный — заработано, красный — расходы,
// синий — баланс нарастающим итогом. Линии «прорисовываются» на UI-потоке (strokeDashoffset), стрелки на концах.
const APath = Animated.createAnimatedComponent(SvgPath);
const AG = Animated.createAnimatedComponent(G);
const NEON = [
  { key: 'green', color: '#3dff8f', label: 'Заработано' },
  { key: 'red', color: '#ff3d5e', label: 'Расходы' },
  { key: 'blue', color: '#3ea8ff', label: 'Баланс' },
];
const CH_H = 190; // высота области линий
const CH_AXIS = 22; // подписи месяцев
const CH_LABEL_W = 38; // подписи сумм слева
const CH_PAD_X = 14;
const CH_PAD_Y = 12;
const CH_DRAW = { duration: 1200, easing: Easing.out(Easing.cubic) };

function NeonLine({ d, len, color, prog }) {
  const L = Math.max(1, len);
  const ap = useAnimatedProps(() => ({ strokeDashoffset: L * (1 - prog.value) }));
  const dash = `${L} ${L}`;
  const common = { d, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', strokeDasharray: dash, animatedProps: ap };
  return (
    <>
      <APath {...common} stroke={color} strokeOpacity={0.09} strokeWidth={14} />
      <APath {...common} stroke={color} strokeOpacity={0.22} strokeWidth={7} />
      <APath {...common} stroke={color} strokeOpacity={1} strokeWidth={2.4} />
      <APath {...common} stroke="#ffffff" strokeOpacity={0.55} strokeWidth={0.9} />
    </>
  );
}

function NeonArrow({ end, color, prog }) {
  const ap = useAnimatedProps(() => ({ opacity: interpolate(prog.value, [0.82, 1], [0, 1], Extrapolation.CLAMP) }));
  if (!end) return null;
  const tr = `translate(${end.x} ${end.y}) rotate(${end.angle})`;
  return (
    <AG animatedProps={ap}>
      <Circle cx={end.x} cy={end.y} r={9} fill={color} fillOpacity={0.16} />
      <G transform={tr}>
        <SvgPath d="M-2 -6.5 L8 0 L-2 6.5 Z" fill={color} fillOpacity={0.35} transform="scale(1.5)" />
        <SvgPath d="M-2 -5.5 L7 0 L-2 5.5 Z" fill={color} stroke="#ffffff" strokeOpacity={0.6} strokeWidth={0.8} strokeLinejoin="round" />
      </G>
    </AG>
  );
}

const NeonChart = memo(function NeonChart({ M, ks }) {
  const [w, setW] = useState(0);
  const prog = useSharedValue(0);
  const reduce = useReducedMotion();
  const series = useMemo(() => chartSeries(M, ks), [M, ks]);
  const plotW = Math.max(0, w - CH_LABEL_W);
  const geo = useMemo(() => {
    if (!plotW) return null;
    const sc = chartScale([series.green, series.red, series.blue]);
    const opt = { w: plotW, h: CH_H, lo: sc.lo, hi: sc.hi, padX: CH_PAD_X, padY: CH_PAD_Y };
    const y = (v) => CH_PAD_Y + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (CH_H - CH_PAD_Y * 2);
    const lines = NEON.map((n) => {
      const pts = chartPoints(series[n.key], opt);
      return { ...n, pts, ...smoothPath(pts), trend: trendOf(series[n.key]), last: series[n.key][series[n.key].length - 1] || 0 };
    });
    const blue = lines[2];
    return { sc, y, lines, area: areaPath(blue.pts, CH_H - CH_PAD_Y), xs: chartPoints(ks.map(() => 0), opt).map((p) => p.x) };
  }, [plotW, series, ks]);
  const dkey = `${ks.join(',')}|${plotW}`;
  useEffect(() => {
    if (!plotW) return;
    if (reduce) {
      prog.value = 1;
      return;
    }
    prog.value = 0;
    prog.value = withTiming(1, CH_DRAW);
  }, [dkey, plotW, reduce, prog]);
  const areaProps = useAnimatedProps(() => ({ opacity: interpolate(prog.value, [0.3, 1], [0, 1], Extrapolation.CLAMP) }));
  const step = ks.length > 7 ? Math.ceil(ks.length / 6) : 1;

  return (
    <View style={styles.chartCard}>
      <View
        style={{ height: CH_H + CH_AXIS }}
        onLayout={(e) => {
          const nw = Math.round(e.nativeEvent.layout.width);
          if (nw && nw !== w) setW(nw);
        }}
      >
        {geo ? (
          <Svg width={w} height={CH_H + CH_AXIS}>
            <Defs>
              <LinearGradient id="neonBlueArea" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#3ea8ff" stopOpacity="0.28" />
                <Stop offset="1" stopColor="#3ea8ff" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            {geo.sc.grid.map((v) => (
              <G key={v}>
                <Line
                  x1={CH_LABEL_W}
                  x2={w}
                  y1={geo.y(v)}
                  y2={geo.y(v)}
                  stroke="#ffffff"
                  strokeOpacity={v === 0 ? 0.18 : 0.06}
                  strokeWidth={1}
                  strokeDasharray={v === 0 ? undefined : '3 5'}
                />
                <SvgText x={CH_LABEL_W - 6} y={geo.y(v) + 3.5} textAnchor="end" fill="rgba(235,235,245,0.38)" fontSize={10} fontWeight="600">
                  {shortMoney(v)}
                </SvgText>
              </G>
            ))}
            <G transform={`translate(${CH_LABEL_W} 0)`}>
              {geo.xs.map((x, i) =>
                i % step === 0 || i === ks.length - 1 ? (
                  <G key={ks[i]}>
                    <Line x1={x} x2={x} y1={CH_PAD_Y} y2={CH_H - CH_PAD_Y} stroke="#ffffff" strokeOpacity={0.04} strokeWidth={1} />
                    <SvgText x={x} y={CH_H + 14} textAnchor="middle" fill="rgba(235,235,245,0.45)" fontSize={10.5} fontWeight="600">
                      {MONTHS[+ks[i].slice(5) - 1].slice(0, 3).toLowerCase()}
                    </SvgText>
                  </G>
                ) : null
              )}
              {geo.area ? <AG animatedProps={areaProps}><SvgPath d={geo.area} fill="url(#neonBlueArea)" /></AG> : null}
              {geo.lines.map((l) => (
                <NeonLine key={`${l.key}-${dkey}`} d={l.d} len={l.len} color={l.color} prog={prog} />
              ))}
              {geo.lines.map((l) => (
                <NeonArrow key={`a-${l.key}`} end={l.end} color={l.color} prog={prog} />
              ))}
            </G>
          </Svg>
        ) : null}
      </View>
      {geo ? (
        <View style={styles.chartLegend}>
          {geo.lines.map((l) => (
            <View key={l.key} style={styles.chartLeg}>
              <View style={[styles.chartDot, { backgroundColor: l.color, boxShadow: `0px 0px 8px ${l.color}` }]} />
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.chartLegK} numberOfLines={1}>{l.label}</Text>
                <Text style={[styles.chartLegV, { color: l.color }]} numberOfLines={1}>
                  {l.trend > 0 ? '▲ ' : l.trend < 0 ? '▼ ' : ''}
                  {shortMoney(l.last)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
});

function AnalysisView({ state, accent }) {
  const [range, setRange] = useState(6);
  const M = useMemo(() => monthStats(state, (x) => displayStatus(x) === 'paid'), [state]);
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
        <EmptyState
          icon="chart"
          title="Пока нечего анализировать"
          text="Когда появятся смены с суммой или оплаченные расходы, здесь будут итоги по месяцам."
          accent={accent}
        />
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
          <NeonChart M={M} ks={ks} />
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
                  {M[k].n ? ` · ${M[k].n} ${plural(M[k].n, 'смена', 'смены', 'смен')}, в среднем ${money(monthAvg(M[k]))}` : ''}
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

// ───────────────────────── Банк ─────────────────────────
// «Анализ трат · Mbank»: непонятные расходы (объяснение колесом) → карточка с неоновым
// биржевым графиком и целью → «Можно урезать» / «Предложения» → свои счета, выписки.

// цвета — как у неонового графика «Анализа»
const BK_NEON = { good: '#3dff8f', near: '#ffd60a', bad: '#ff3d5e' };
const NEON_IN = '#3dff8f';
const NEON_OUT = '#ff3d5e';
const fmtOpDate = (d) => `${+d.slice(8)} ${MONTHS_R[+d.slice(5, 7) - 1]}`;
const fmtDayShort = (d) => `${+d.slice(8)} ${MONTHS_R[+d.slice(5, 7) - 1].slice(0, 3)}`;
const signed = (n) => `${n < 0 ? '−' : '+'}${money(Math.abs(n))}`;

/**
 * Биржевой график периода: сверху линия накопленного итога (приход − расход) цвета статуса
 * (зелёный / жёлтый — близко к цели / красный — ниже цели), пунктир — цель; снизу на каждую
 * операцию столбик: пополнение — зелёный вверх, расход — красный вниз, длина ∝ сумме.
 */
const BankChart = memo(function BankChart({ chart, status, period }) {
  const [w, setW] = useState(0);
  const prog = useSharedValue(0);
  const reduce = useReducedMotion();
  const H = 200;
  const LINE_T = 12;
  const LINE_B = 120;
  const BASE = 160;
  const HALF = 30;
  const LW = CH_LABEL_W;
  const PX = 10;
  const color = BK_NEON[status] || BK_NEON.good;
  const geo = useMemo(() => {
    if (!w) return null;
    const pw = w - LW;
    const vals = chart.line.flatMap((p) => [p.v, p.g]);
    const sc = chartScale([vals]);
    const X = (t) => PX + t * (pw - PX * 2);
    const Y = (v) => LINE_T + ((sc.hi - v) / (sc.hi - sc.lo)) * (LINE_B - LINE_T);
    // биржевая линия: итог на конец каждого дня, прямые отрезки между днями
    const pts = chart.line.map((p) => ({ x: X(p.t), y: Y(p.v) }));
    const goal = chart.line.map((p, i) => `${i ? 'L' : 'M'}${X(p.t)},${Y(p.g)}`).join('');
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join('');
    const last = pts[pts.length - 1];
    const area = `${line}L${last.x},${LINE_B}L${pts[0].x},${LINE_B}Z`;
    const maxA = Math.max(1, ...chart.bars.map((b) => Math.abs(b.a)));
    const bars = chart.bars.map((b) => {
      const l = Math.max(2, Math.sqrt(Math.abs(b.a) / maxA) * HALF); // крупнее покупка — длиннее столбик
      const x = X(b.t);
      return { up: b.a > 0, d: b.a > 0 ? `M${x},${BASE - 2}L${x},${BASE - 2 - l}` : `M${x},${BASE + 2}L${x},${BASE + 2 + l}` };
    });
    const pre = pts[pts.length - 2] || pts[0];
    const angle = pts.length > 1 ? (Math.atan2(last.y - pre.y, last.x - pre.x) * 180) / Math.PI : 0;
    return { sc, Y, line, len, goal, area, bars, end: { x: last.x, y: last.y, angle } };
  }, [w, chart, LW]);
  const dkey = `${period.key}|${chart.line.length}|${w}`;
  useEffect(() => {
    if (!w) return;
    if (reduce) {
      prog.value = 1;
      return;
    }
    prog.value = 0;
    prog.value = withTiming(1, CH_DRAW);
  }, [dkey, w, reduce, prog]);
  const fade = useAnimatedProps(() => ({ opacity: interpolate(prog.value, [0.25, 1], [0, 1], Extrapolation.CLAMP) }));
  const mid = addDays(period.start, Math.round((parse(period.end) - parse(period.start)) / 86400000 / 2));
  return (
    <View
      onLayout={(e) => {
        const nw = Math.round(e.nativeEvent.layout.width);
        if (nw && nw !== w) setW(nw);
      }}
      style={{ height: H + 16 }}
    >
      {geo ? (
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id="bkArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.26} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {geo.sc.grid.map((v) => (
            <G key={v}>
              <Line
                x1={LW}
                x2={w}
                y1={geo.Y(v)}
                y2={geo.Y(v)}
                stroke="#ffffff"
                strokeOpacity={v === 0 ? 0.18 : 0.06}
                strokeDasharray={v === 0 ? undefined : '3 5'}
              />
              <SvgText x={LW - 6} y={geo.Y(v) + 3.5} textAnchor="end" fill="rgba(235,235,245,0.38)" fontSize={10} fontWeight="600">
                {shortMoney(v)}
              </SvgText>
            </G>
          ))}
          <G transform={`translate(${LW} 0)`}>
            <AG animatedProps={fade}>
              <SvgPath d={geo.area} fill="url(#bkArea)" />
              <SvgPath d={geo.goal} stroke="#ffffff" strokeOpacity={0.4} strokeWidth={1.2} strokeDasharray="4 4" fill="none" />
            </AG>
            <NeonLine d={geo.line} len={geo.len} color={color} prog={prog} />
            <NeonArrow end={geo.end} color={color} prog={prog} />
            <Line x1={0} x2={w - LW} y1={BASE} y2={BASE} stroke="#ffffff" strokeOpacity={0.12} />
            <AG animatedProps={fade}>
              {geo.bars.map((b, i) => (
                <G key={i}>
                  <SvgPath d={b.d} stroke={b.up ? NEON_IN : NEON_OUT} strokeOpacity={0.25} strokeWidth={5} strokeLinecap="round" />
                  <SvgPath d={b.d} stroke={b.up ? NEON_IN : NEON_OUT} strokeWidth={1.8} strokeLinecap="round" />
                </G>
              ))}
            </AG>
          </G>
        </Svg>
      ) : null}
      <View style={[styles.bkAxis, { left: LW }]}>
        <Text style={styles.bkAxisTxt}>{fmtDayShort(period.start)}</Text>
        <Text style={styles.bkAxisTxt}>{fmtDayShort(mid)}</Text>
        <Text style={styles.bkAxisTxt}>{fmtDayShort(period.end)}</Text>
      </View>
    </View>
  );
});

/** Нижняя карточка с колесом (как выбор даты): Отмена / заголовок / Готово. */
function WheelModal({ open, title, sub, onCancel, onDone, accent, children }) {
  // открытие задаёт родитель (open); после закрытия Modal живёт, пока карточка уезжает вниз
  const [wasOpen, setWasOpen] = useState(open);
  const [leaving, setLeaving] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    setLeaving(!open);
  }
  const shown = open || leaving;
  const ty = useSharedValue(SCREEN_H);
  const back = useSharedValue(0);
  useEffect(() => {
    if (open) {
      ty.value = SCREEN_H;
      back.value = withTiming(1, BACK_IN);
      ty.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
    } else {
      back.value = withTiming(0, SHEET_OUT);
      ty.value = withTiming(SCREEN_H, SHEET_OUT, (fin) => {
        'worklet';
        if (fin) scheduleOnRN(setLeaving, false);
      });
    }
  }, [open, ty, back]);
  const card = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }));
  const dim = useAnimatedStyle(() => ({ opacity: back.value }));
  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.wheelBack}>
          <Animated.View style={[styles.wheelDim, dim]} pointerEvents="none" />
          <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
          <Animated.View onStartShouldSetResponder={() => true} style={[styles.wheelCard, card]}>
            <View style={styles.handle} />
            <View style={styles.wheelBar}>
              <Pressable hitSlop={10} onPress={onCancel}>
                <Text style={styles.linkMuted}>Отмена</Text>
              </Pressable>
              <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }}>
                <Text style={styles.sheetTitle} numberOfLines={1}>
                  {title}
                </Text>
                {sub ? (
                  <Text style={styles.lSub} numberOfLines={1}>
                    {sub}
                  </Text>
                ) : null}
              </View>
              <Pressable
                hitSlop={10}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(noop);
                  onDone();
                }}
              >
                <Text style={[styles.link, { color: accent }]}>Готово</Text>
              </Pressable>
            </View>
            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const WHEEL_ITEM = { color: '#fff', fontSize: 22 };

/** Строка операции в списках шторок. */
function BankRow({ v, last, onPress }) {
  const body = (
    <>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={styles.lTitle} numberOfLines={1}>
          {v.label}
        </Text>
        <Text style={styles.lSub} numberOfLines={1}>
          {fmtOpDate(v.date)} · {v.time}
          {v.note ? ` · ${v.note}` : ''}
        </Text>
      </View>
      <Text style={[styles.lVal, v.amount > 0 && { color: NEON_IN }]}>{signed(v.amount)}</Text>
    </>
  );
  if (!onPress) return <View style={[styles.lRow, !last && styles.lRowSep]}>{body}</View>;
  return (
    <Pressable onPress={onPress} style={[styles.lRow, !last && styles.lRowSep]}>
      {body}
    </Pressable>
  );
}

/** Категории с полоской доли; по нажатию раскрываются операции. */
function BankCatList({ cats, total, color, onOp }) {
  const [open, setOpen] = useState(null);
  const max = Math.max(1, ...cats.map((c) => c.sum));
  return (
    <ItemCard style={styles.listCard}>
      {cats.map((c, i) => {
        const on = open === c.cat;
        return (
          <View key={c.cat}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(noop);
                setOpen(on ? null : c.cat);
              }}
              style={[styles.anRow, i === cats.length - 1 && !on && { borderBottomWidth: 0 }]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.lTitle}>{c.label}</Text>
                <Text style={styles.lVal}>{money(c.sum)}</Text>
              </View>
              <View style={styles.anTrack}>
                <View style={[styles.anFill, { width: `${(c.sum / max) * 100}%`, backgroundColor: color }]} />
              </View>
              <Text style={styles.lSub}>
                {c.n} {plural(c.n, 'операция', 'операции', 'операций')}
                {total ? ` · ${Math.round((c.sum / total) * 100)}%` : ''}
              </Text>
            </Pressable>
            {on ? (
              <View style={styles.bankSub}>
                {c.ops.map((v, j) => (
                  <BankRow key={v.id} v={v} last={j === c.ops.length - 1} onPress={onOp && (v.note || v.unclear) ? () => onOp(v) : null} />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </ItemCard>
  );
}

function BankView({ accent, apiRef, onToast, onHead }) {
  const [bank, setBank] = useState(null);
  const [pi, setPi] = useState(0);
  const [sheet, setSheet] = useState(null);
  const [explain, setExplain] = useState(null); // { v, opts, k, text }
  const [perPick, setPerPick] = useState(null); // { mode, key }
  const [turboOpen, setTurboOpen] = useState(false);
  const bankRef = useRef(null);
  useEffect(() => {
    bankRef.current = bank;
  }, [bank]);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(BANK_KEY)
      .then((raw) => {
        if (!alive) return;
        let b = null;
        try {
          b = raw ? JSON.parse(raw) : null;
        } catch {
          b = null;
        }
        setBank(normalizeBank(b));
      })
      .catch(() => alive && setBank(normalizeBank(null)));
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback((b) => {
    bankRef.current = b;
    setBank(b);
    AsyncStorage.setItem(BANK_KEY, JSON.stringify(b)).catch((e) => console.warn('bank save failed', e));
  }, []);

  const importFiles = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: true });
      if (res.canceled || !res.assets || !res.assets.length) return;
      let b = bankRef.current || normalizeBank(null);
      const msgs = [];
      let ok = 0;
      for (const a of res.assets) {
        try {
          const st = parseStatement(pdfLines(await new File(a.uri).bytes()));
          if (!st.account || !st.ops.length) {
            msgs.push(`${a.name || 'PDF'}: не похоже на выписку Mbank`);
            continue;
          }
          const chk = checkTotals(st);
          const r = mergeStatement(b, st);
          b = r.bank;
          ok++;
          msgs.push(
            `Счёт ${shortAcc(st.account)}: новых ${r.added}${r.skipped ? `, уже были ${r.skipped}` : ''}` +
              (chk.ok ? '' : '\n⚠️ сумма операций не сошлась с итогом банка')
          );
        } catch (e) {
          msgs.push(`${a.name || 'PDF'}: не получилось прочитать (${String(e?.message || e)})`);
        }
      }
      if (ok) {
        save(b);
        setPi(0);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
      } else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(noop);
      Alert.alert(ok ? 'Выписки загружены' : 'Ничего не загрузилось', msgs.join('\n\n'));
    } catch (e) {
      Alert.alert('Не получилось открыть PDF', String(e?.message || e));
    }
  }, [save]);

  const mode = bank ? bank.mode : 'pay';
  const periods = useMemo(() => (bank ? periodsOf(bank, mode) : []), [bank, mode]);
  const idx = Math.min(pi, Math.max(0, periods.length - 1));
  const period = periods[idx];
  const sum = useMemo(() => (bank && period ? bankSummary(bank, period) : null), [bank, period]);
  const chart = useMemo(() => (sum ? bankChart(sum) : null), [sum]);
  const cut = useMemo(() => (sum ? bankCut(sum, bank) : null), [sum, bank]);
  const tips = useMemo(() => (sum ? bankTips(sum, bank) : []), [sum, bank]);
  const tipsSave = tips.reduce((a, t) => a + (t.save || 0), 0);

  const openPeriod = useCallback(() => {
    const b = bankRef.current;
    if (!b || !Object.keys(b.ops).length) return;
    Haptics.selectionAsync().catch(noop);
    setPerPick({ mode: b.mode, key: null });
  }, []);
  useEffect(() => {
    if (apiRef) apiRef.current = { importFiles, openPeriod };
  }, [apiRef, importFiles, openPeriod]);
  const headTitle = period ? (mode === 'month' ? period.title : period.title) : null;
  useEffect(() => {
    onHead?.(headTitle);
  }, [onHead, headTitle]);

  const openExplain = useCallback((v) => {
    const b = bankRef.current;
    const opts = explainOptions(v, b);
    const cur = b.notes[v.id];
    Haptics.selectionAsync().catch(noop);
    setExplain({ v, opts, k: cur ? cur.k : opts[0], text: cur?.text || '' });
  }, []);
  const doneExplain = () => {
    if (!explain) return;
    const ex = BANK_EXPLAIN[explain.k];
    const text = explain.text.trim();
    if (ex.need && !text) {
      Alert.alert(ex.need, 'Напиши пару слов — так позже будет понятно, на что ушли деньги.');
      return;
    }
    const b = bankRef.current;
    save({ ...b, notes: { ...b.notes, [explain.v.id]: ex.need ? { k: explain.k, text } : { k: explain.k } } });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
    setExplain(null);
  };
  const clearExplain = () => {
    const b = bankRef.current;
    const notes = { ...b.notes };
    delete notes[explain.v.id];
    save({ ...b, notes });
    setExplain(null);
  };

  const donePeriod = () => {
    if (!perPick) return;
    const b = bankRef.current;
    const list = periodsOf(b, perPick.mode);
    const i = perPick.key ? Math.max(0, list.findIndex((p) => p.key === perPick.key)) : 0;
    if (perPick.mode !== b.mode) save({ ...b, mode: perPick.mode });
    setPi(i);
    setPerPick(null);
  };

  const setGoal = (g) => {
    Haptics.selectionAsync().catch(noop);
    save({ ...bankRef.current, goal: { ...bankRef.current.goal, ...g } });
  };
  const toggleCut = (cat) => {
    const b = bankRef.current;
    const has = b.cut.includes(cat);
    Haptics.selectionAsync().catch(noop);
    save({ ...b, cut: has ? b.cut.filter((c) => c !== cat) : [...b.cut, cat] });
  };
  const askRemove = (num) =>
    Alert.alert(`Убрать счёт ${shortAcc(num)}?`, 'Удалятся его операции и объяснения. Выписку можно загрузить снова.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Убрать',
        style: 'destructive',
        onPress: () => {
          save(removeAccount(bankRef.current, num));
          onToast?.(`Счёт ${shortAcc(num)} убран`);
        },
      },
    ]);

  const renderSheet = (key) => {
    const close = () => setSheet(null);
    if (!bank || !sum) return { title: '', onClose: close, body: null };
    switch (key) {
      case 'cut': {
        const others = sum.expenses.filter((c) => !bank.cut.includes(c.cat) && CATS_BANK[c.cat]?.kind === 'out');
        return {
          title: 'Можно урезать',
          onClose: close,
          body: (
            <>
              <ItemCard style={[styles.listCard, styles.padCard]}>
                <Text style={styles.k}>Не первой необходимости</Text>
                <Text style={[styles.bigPay, { marginTop: 4, color: NEON_OUT }]} numberOfLines={1} adjustsFontSizeToFit>
                  {money(cut.total)}
                </Text>
                <Text style={styles.lSub}>
                  {sum.spent ? `${Math.round((cut.total / sum.spent) * 100)}% всех расходов · ${period.full}` : period.full}
                </Text>
              </ItemCard>
              {cut.list.length ? <BankCatList cats={cut.list} total={cut.total} color={NEON_OUT} onOp={openExplain} /> : null}
              <Text style={styles.sectionLabel}>Что считать необязательным</Text>
              <ItemCard style={styles.listCard}>
                {[...cut.list, ...others].map((c, i, arr) => {
                  const on = bank.cut.includes(c.cat);
                  return (
                    <Pressable key={c.cat} onPress={() => toggleCut(c.cat)} style={[styles.lRow, i < arr.length - 1 && styles.lRowSep]}>
                      <Text style={styles.lKey}>{c.label}</Text>
                      <View style={[styles.bkCheck, on && { backgroundColor: NEON_OUT, borderColor: NEON_OUT }]}>
                        {on ? <AppIcon name="check" size={14} variant="glyph" color="#fff" /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ItemCard>
            </>
          ),
        };
      }
      case 'tips':
        return {
          title: 'Предложения',
          onClose: close,
          body: (
            <>
              {tips.map((t) => (
                <Glass key={t.k} style={styles.bkTip} intensity={34}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lTitle, t.tone === 'bad' && { color: NEON_OUT }]}>{t.title}</Text>
                    <Text style={[styles.lSub, { fontSize: 14, marginTop: 4, lineHeight: 19 }]}>{t.text}</Text>
                  </View>
                  {t.save ? <Text style={styles.bkSave}>−{money(t.save)}</Text> : null}
                </Glass>
              ))}
              {!tips.length ? <EmptyState icon="check" title="Всё в порядке" text="Необязательных трат почти нет." accent={accent} /> : null}
            </>
          ),
        };
      case 'own':
        return {
          title: 'Между своими счетами',
          onClose: close,
          body: (
            <>
              <Text style={[styles.hint, { marginBottom: 10 }]}>
                Переводы между счетами Mbank не входят ни в приход, ни в расход — иначе суммы задвоятся.
              </Text>
              <ItemCard style={styles.listCard}>
                {sum.own.map((v, i) => (
                  <BankRow key={v.id} v={{ ...v, label: `Счёт ${shortAcc(v.account)}` }} last={i === sum.own.length - 1} />
                ))}
              </ItemCard>
            </>
          ),
        };
      case 'goal': {
        const turbo = bank.goal.k === 'turbo';
        return {
          title: 'Цель',
          onClose: close,
          body: (
            <>
              <Text style={[styles.hint, { marginBottom: 10 }]}>Приход должен превышать расход на выбранный процент.</Text>
              <ItemCard style={styles.listCard}>
                {BANK_MODES.map((m, i) => {
                  const on = bank.goal.k === m.k;
                  return (
                    <Pressable
                      key={m.k}
                      onPress={() => setGoal({ k: m.k })}
                      onLongPress={
                        m.k === 'active'
                          ? () => {
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(noop);
                              setTurboOpen(true);
                            }
                          : undefined
                      }
                      delayLongPress={900}
                      style={[styles.lRow, (i < BANK_MODES.length - 1 || turboOpen || turbo) && styles.lRowSep]}
                    >
                      <Text style={[styles.lTitle, on && { color: accent }]}>{m.label}</Text>
                      <Text style={[styles.lVal, on && { color: accent }]}>{m.pct}%</Text>
                    </Pressable>
                  );
                })}
                {turboOpen || turbo ? (
                  <View style={[styles.lRow, { flexDirection: 'column', alignItems: 'stretch', paddingVertical: 12 }]}>
                    <Pressable onPress={() => setGoal({ k: 'turbo' })} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[styles.lTitle, { color: turbo ? NEON_OUT : '#fff' }]}>⚡ {BANK_TURBO.label}</Text>
                      <Text style={[styles.lVal, turbo && { color: NEON_OUT }]}>{bank.goal.pct}%</Text>
                    </Pressable>
                    <View style={styles.bkStep}>
                      {[-5, -1, 1, 5].map((d) => (
                        <ScaleButton
                          key={d}
                          style={styles.bkStepBtn}
                          onPress={() => setGoal({ k: 'turbo', pct: Math.min(90, Math.max(1, bank.goal.pct + d)) })}
                        >
                          <Text style={styles.actBtnTxt}>{d > 0 ? `+${d}` : `−${-d}`}</Text>
                        </ScaleButton>
                      ))}
                    </View>
                  </View>
                ) : null}
              </ItemCard>
              {!turboOpen && !turbo ? <Text style={styles.hint}> </Text> : null}
            </>
          ),
        };
      }
      case 'accounts':
        return {
          title: 'Выписки Mbank',
          onClose: close,
          body: (
            <>
              <ItemCard style={styles.listCard}>
                {Object.values(bank.accounts).map((a, i) => (
                  <Pressable key={a.num} onLongPress={() => askRemove(a.num)} style={[styles.lRow, styles.lRowSep]}>
                    <View>
                      <Text style={styles.lTitle}>Счёт {shortAcc(a.num)}</Text>
                      <Text style={styles.lSub}>
                        {fmtOpDate(a.from)} – {fmtOpDate(a.to)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                <Pressable onPress={importFiles} style={styles.lRow}>
                  <Text style={[styles.lTitle, { color: accent }]}>Загрузить выписки</Text>
                  <GlyphChev />
                </Pressable>
              </ItemCard>
              <Text style={styles.hint}>Удерживай счёт, чтобы убрать его.</Text>
            </>
          ),
        };
      default:
        return { title: '', onClose: close, body: null };
    }
  };

  if (!bank) return null;
  const hasOps = Object.keys(bank.ops).length > 0;
  if (!hasOps || !period || !sum) {
    return (
      <EmptyState
        icon="bank"
        title="Загрузи выписки Mbank"
        text="Скачай в приложении Mbank выписку в PDF по каждому счёту и выбери их здесь — можно все сразу."
        action="Выбрать PDF"
        onAction={importFiles}
        accent={accent}
      />
    );
  }

  const color = BK_NEON[sum.status];
  const pctLine =
    sum.rate == null
      ? sum.spent > 0
        ? 'Прихода не было'
        : 'Операций нет'
      : sum.rate < 0
        ? `Расход больше прихода на ${money(sum.spent - sum.income)}`
        : `Сохранено ${Math.round(sum.rate)}%`;
  const cutNames = cut.list.slice(0, 3).map((c) => c.label.toLowerCase()).join(', ');
  const perList = perPick ? periodsOf(bank, perPick.mode) : [];
  const exOpt = explain ? BANK_EXPLAIN[explain.k] : null;

  return (
    <>
      {sum.unclear.length ? (
        <>
          <View style={styles.bkHead}>
            <Text style={styles.bkHeadTxt}>Непонятные расходы</Text>
            <View style={styles.bkBadge}>
              <Text style={styles.bkBadgeTxt}>{sum.unclear.length}</Text>
            </View>
          </View>
          <Glass style={styles.bkList} intensity={34}>
            {sum.unclear.map((v, i) => (
              <Pressable key={v.id} onPress={() => openExplain(v)} style={[styles.bkURow, i < sum.unclear.length - 1 && styles.lRowSep]}>
                <View style={styles.bkQ}>
                  <Text style={styles.bkQTxt}>?</Text>
                </View>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={styles.lTitle} numberOfLines={1}>
                    {v.label}
                  </Text>
                  <Text style={styles.lSub}>
                    {fmtOpDate(v.date)} · {v.time}
                  </Text>
                </View>
                <Text style={[styles.lVal, { color: NEON_OUT }]}>{signed(v.amount)}</Text>
              </Pressable>
            ))}
          </Glass>
        </>
      ) : null}

      <Glass style={styles.bkCard} intensity={42}>
        <View style={styles.bkTop}>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.bkFlow}>
              <Text style={[styles.bkArrow, { color: NEON_IN }]}>↑</Text>
              <Text style={[styles.bkFlowNum, { color: NEON_IN }]} numberOfLines={1} adjustsFontSizeToFit>
                {money(sum.income)}
              </Text>
            </View>
            <View style={styles.bkFlow}>
              <Text style={[styles.bkArrow, { color: NEON_OUT }]}>↓</Text>
              <Text style={[styles.bkFlowNum, { color: NEON_OUT }]} numberOfLines={1} adjustsFontSizeToFit>
                {money(sum.spent)}
              </Text>
            </View>
          </View>
          <ScaleButton style={styles.bkGoalHit} onPress={() => setSheet('goal')} accessibilityLabel="Цель">
            <View style={[styles.bkGoal, { borderColor: color, boxShadow: `0px 0px 14px ${color}55` }]}>
              <View style={[styles.bkDot, { backgroundColor: color }]} />
              <Text style={styles.bkGoalTxt}>
                {bank.goal.k === 'turbo' ? '⚡ ' : ''}
                {sum.pct}%
              </Text>
            </View>
          </ScaleButton>
        </View>
        <BankChart chart={chart} status={sum.status} period={period} />
        <Text style={[styles.bkFoot, { color }]}>
          {pctLine} · цель {sum.pct}%
        </Text>
      </Glass>

      <View style={styles.tileGrid}>
        <CalcTile icon="pie" title="Можно урезать" sub={cutNames || 'необязательные расходы'} big={money(cut.total)} onPress={() => setSheet('cut')} />
        <CalcTile icon="lightning" title="Предложения" sub="чем заменить" big={tipsSave ? `−${money(tipsSave)}` : String(tips.length)} onPress={() => setSheet('tips')} />
        {sum.own.length ? (
          <CalcTile icon="bank" title="Между своими счетами" sub="не считается в приход и расход" big={String(sum.own.length)} onPress={() => setSheet('own')} />
        ) : null}
        <CalcTile
          icon="document"
          title="Выписки"
          sub={`${Object.keys(bank.accounts).length} ${plural(Object.keys(bank.accounts).length, 'счёт', 'счёта', 'счетов')} Mbank`}
          big=""
          onPress={() => setSheet('accounts')}
        />
      </View>

      <SheetHost active={sheet} render={renderSheet} onClosed={noop} />

      <WheelModal
        open={!!explain}
        title={explain ? explain.v.label : ''}
        sub={explain ? `${signed(explain.v.amount)} · ${fmtOpDate(explain.v.date)} ${explain.v.time}` : ''}
        accent={accent}
        onCancel={() => setExplain(null)}
        onDone={doneExplain}
      >
        {explain ? (
          <>
            <Picker
              selectedValue={explain.k}
              onValueChange={(k) => {
                Haptics.selectionAsync().catch(noop);
                setExplain((e) => ({ ...e, k }));
              }}
              style={{ width: SCREEN_W - 40, height: 216 }}
              itemStyle={WHEEL_ITEM}
            >
              {explain.opts.map((k) => (
                <Picker.Item key={k} label={BANK_EXPLAIN[k].label} value={k} color="#fff" />
              ))}
            </Picker>
            {exOpt && exOpt.need ? (
              <TextInput
                value={explain.text}
                onChangeText={(t) => setExplain((e) => ({ ...e, text: t }))}
                placeholder={exOpt.need}
                placeholderTextColor="rgba(235,235,245,0.35)"
                style={styles.bkInput}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={doneExplain}
              />
            ) : null}
            {bank.notes[explain.v.id] ? (
              <Pressable onPress={clearExplain} hitSlop={8} style={{ marginTop: 6 }}>
                <Text style={styles.linkMuted}>Убрать объяснение</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </WheelModal>

      <WheelModal open={!!perPick} title="Период" accent={accent} onCancel={() => setPerPick(null)} onDone={donePeriod}>
        {perPick ? (
          <>
            <View style={{ width: SCREEN_W - 48, marginBottom: 4 }}>
              <SegmentCapsule
                value={BANK_PERIOD_MODES.indexOf(perPick.mode)}
                labels={['2 недели', 'Месяц']}
                height={44}
                onChange={(i) => setPerPick({ mode: BANK_PERIOD_MODES[i], key: null })}
              />
            </View>
            <Picker
              selectedValue={perPick.key || (perList[perPick.mode === mode ? idx : 0] || {}).key}
              onValueChange={(key) => {
                Haptics.selectionAsync().catch(noop);
                setPerPick((p) => ({ ...p, key }));
              }}
              style={{ width: SCREEN_W - 40, height: 216 }}
              itemStyle={WHEEL_ITEM}
            >
              {perList.map((p) => (
                <Picker.Item key={p.key} label={p.full} value={p.key} color="#fff" />
              ))}
            </Picker>
          </>
        ) : null}
      </WheelModal>
    </>
  );
}

const BANK_PERIOD_MODES = ['pay', 'month'];

// ───────────────────────── Расчёт смены ─────────────────────────

const fmtNumF = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const fmtNum = (n) => fmtNumF.format(Number(n) || 0);
const ROLE_LABELS = ['Рядовой', 'Кассир'];
const TIME_LABELS = ['День', 'Ночь'];
const EMPTY_COUNTS = {};
const CALC_ORDER = CALC_ITEMS.map((it) => it.id);
const CALC_MAIN_ORDER = ['adj'];
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
    gap: false, // промежутка в эту смену
  };
}
/**
 * Новый день расчёта. Если на эту дату есть смена с отметкой наставника (из заметки «+300») —
 * «Наставник» уже включён, роль и время — как у этой смены.
 */
function seedDay(prefs, shifts, key, days) {
  const date = keyDate(key);
  let d = blankDay(prefs);
  // 2-я и дальше смена дня: роль как у 1-й, время — другое (день ↔ ночь)
  const first = keySlot(key) > 1 ? days && days[date] : null;
  if (first) d = { ...d, role: first.role || d.role, time: first.time === 'day' ? 'night' : 'day' };
  const m = (shifts || []).find(
    (s) => s && s.date === date && !isLinkedShift(s) && mentorMark(s) && (!first || shiftTime(s) === d.time)
  );
  if (!m) return d;
  return { ...d, mentor: true, role: shiftRole(m) || d.role, time: shiftTime(m) || d.time };
}
/** Часы с запятой: 4.5 → «4,5». */
const fmtHours = (h) => String(Math.round((Number(h) || 0) * 100) / 100).replace('.', ',');
/** Ввод часов: цифры и одна запятая (точка → запятая). */
const hoursInput = (t) => {
  const c = String(t).replace(/\./g, ',').replace(/[^0-9,]/g, '');
  const i = c.indexOf(',');
  return i < 0 ? c : c.slice(0, i + 1) + c.slice(i + 1).replace(/,/g, '');
};
/** Строка ставки из формы → число («4,5» → 4.5). */
const rateNum = (t) => Number(String(t ?? '').replace(',', '.')) || 0;
/** Число ставки → строка для формы (часы — с запятой). */
const rateStr = (k, v) => (RATE_FIELDS.find(([x]) => x === k)?.[2] === 'h' ? fmtHours(v) : String(v ?? ''));

const talliesOf = (v) => (Array.isArray(v) && v.length ? v.map((x) => Number(x) || 0) : [itemTotal(v)]);

/** Числовое поле: тап — ввод с клавиатуры, пустое = 0; внешние ± сразу видны. */
function NumInput({ value, onChange, style, inputRef, onFocused, onBlurred, onSubmit, accessoryId, placeholder = '0', placeholderColor }) {
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
      placeholder={placeholder}
      placeholderTextColor={placeholderColor || 'rgba(235,235,245,0.3)'}
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
  scope = 'main',
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
      <ScaleButton style={styles.stepBtn} hitSlop={4} accessibilityLabel="Меньше" onPress={() => onStep(id, -1)}>
        <AppIcon name="minus" size={18} variant="glyph" color="#fff" />
      </ScaleButton>
      <NumInput
        inputRef={setRef}
        value={first}
        onChange={(n) => onSet(id, n)}
        onFocused={() => {
          onFocusItem(id);
          kbShow({
            key: `calc-${id}`,
            scope,
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
      <ScaleButton style={styles.stepBtn} hitSlop={4} accessibilityLabel="Больше" onPress={() => onStep(id, 1)}>
        <AppIcon name="plus" size={18} variant="glyph" color="#fff" />
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
const KB_EMPTY = { label: '', hasPrev: false, isLast: false, accent: 'transparent' };

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
  // клавиатура ушла совсем — забываем последнюю подпись (поле без панели её не покажет)
  const [, bump] = useState(0);
  useEffect(() => {
    const d = Keyboard.addListener('keyboardDidHide', () => {
      if (!kbStore.cfg && lastRef.current) {
        lastRef.current = null;
        bump((k) => k + 1);
      }
    });
    return () => d.remove();
  }, []);
  const mine = cfg && cfg.scope === scope ? cfg : null;
  if (mine) lastRef.current = mine;
  else if (cfg) lastRef.current = null; // фокус в другом окне — здесь не показываем
  const shown = mine || lastRef.current || KB_EMPTY; // пока клавиатура уезжает — держим последнюю подпись
  // панель не нужна (поле без неё) — уводим за нижний край сдвигом, не opacity:
  // нативное стекло при почти нулевой прозрачности не ставится
  const off = useSharedValue(shown === KB_EMPTY ? 1 : 0);
  useEffect(() => {
    off.value = shown === KB_EMPTY ? 1 : 0;
  }, [shown, off]);
  const anim = useAnimatedStyle(() => {
    const h = kb.height.value > 0 ? kb.height.value : jsH.value;
    // едет кадр в кадр с клавиатурой с первого кадра её показа; без клавиатуры — за нижним краем
    return { transform: [{ translateY: h > 0.5 && !off.value ? -h : KB_BAR_H + 40 }] };
  });
  if (Platform.OS !== 'ios') return null;
  // Панель и её стекло смонтированы всегда (вместе с окном), стекло готово заранее:
  // при показе клавиатуры ничего не создаётся и не ждёт keyboardDidShow — только сдвиг.
  return (
    <Animated.View
      style={[styles.keyBarWrap, anim]}
      pointerEvents={mine ? 'box-none' : 'none'}
    >
      <View style={styles.keyBar}>
        {LG && GlassView ? (
          <GlassView
            pointerEvents="none"
            glassEffectStyle="regular"
            colorScheme="dark"
            style={[styles.glassBleed, { borderRadius: 26 + GLASS_BLEED }]}
          />
        ) : (
          <BlurView pointerEvents="none" intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        )}
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
      </View>
    </Animated.View>
  );
}

function CheckRow({ checked, label, amount, accent, onToggle, right }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      style={styles.checkRow}
      onPress={() => {
        Haptics.selectionAsync().catch(noop);
        s.value = withSequence(withTiming(0.86, { duration: 70 }), withSpring(1, capSpring));
        onToggle();
      }}
    >
      <Animated.View style={[styles.checkBox, checked && { backgroundColor: accent, borderColor: accent }, anim]}>
        {checked && <AppIcon name="check" size={16} variant="glyph" color="#102012" />}
      </Animated.View>
      <Text style={[styles.setL, { flex: 1 }]}>{label}</Text>
      <Text style={[styles.checkSum, checked && { color: '#fff' }]}>{right ?? `+${money(amount)}`}</Text>
    </Pressable>
  );
}

/**
 * «Недостача / излишек» дня в «Расчёте». Значение хранится только в смене этого дня
 * (withCalcDayAdj / calcDayAdj) — то же поле, что в шторке смены, копии нет.
 * Сумму смены не меняет; недостача вычитается из «К выплате», излишек — для сведения.
 */
const CalcAdjRow = memo(function CalcAdjRow({ value, date, onChange, accent, register, onFocusItem, onNext }) {
  const [plusLocal, setPlusLocal] = useState(value < 0);
  const plus = value ? value < 0 : plusLocal;
  const n = Math.abs(Number(value) || 0);
  const tone = !n ? null : plus || shortTone(n) === 'bad' ? styles.bad : styles.good;
  const setRef = useCallback((r) => register('adj', r), [register]);
  return (
    <View>
      <View style={styles.adjLine}>
        <Text style={[styles.setL, { flex: 1 }]}>{plus ? 'Излишек' : 'Недостача'}</Text>
        <View style={styles.adjMini}>
          {[
            [false, '−'],
            [true, '+'],
          ].map(([on, lab]) => (
            <Pressable
              key={lab}
              hitSlop={{ top: 5, bottom: 5, left: 3, right: 3 }}
              accessibilityRole="button"
              accessibilityState={{ selected: plus === on }}
              accessibilityLabel={on ? 'Излишек' : 'Недостача'}
              style={[styles.adjMiniBtn, plus === on && styles.adjBtnMinus]}
              onPress={() => {
                Haptics.selectionAsync().catch(noop);
                setPlusLocal(on);
                if (n) onChange(on ? -n : n);
              }}
            >
              <Text style={[styles.adjMiniTxt, plus === on && styles.bad]}>{lab}</Text>
            </Pressable>
          ))}
        </View>
        <NumInput
          inputRef={setRef}
          value={n}
          onChange={(k) => onChange(plus ? -k : k)}
          onFocused={() => {
            onFocusItem('adj');
            // отдельное поле: без «Назад», «Готово» закрывает клавиатуру
            kbShow({
              key: 'calc-adj',
              scope: 'main',
              label: plus ? 'Излишек' : 'Недостача',
              hasPrev: false,
              isLast: true,
              accent,
              onPrev: () => {},
              onNext: () => onNext('adj', 1),
            });
          }}
          onBlurred={() => kbHide('calc-adj')}
          onSubmit={() => onNext('adj', 1)}
          accessoryId={KB_NONE}
          style={[styles.cCount, styles.cCountTxt, styles.adjNum, tone]}
        />
      </View>
      {n ? (
        <Text style={[styles.adjLineNote, plus && styles.bad]} numberOfLines={1}>
          {plus ? 'для сведения — в зарплату не идёт' : `в смену ${fmtShort(date)} · вычитается из «К выплате»`}
        </Text>
      ) : null}
    </View>
  );
});

/** Раздел «Расчёта»: панель во всю ширину (то же стекло, что у Расходов/Смен), тап — шторка раздела. */
const CalcTile = memo(function CalcTile({ icon, title, big, sub, onPress }) {
  return (
    <ScaleButton style={styles.tileHit} onPress={onPress}>
      <Glass style={styles.tile} intensity={34}>
        <AppIcon name={icon} size={44} variant="tile" />
        <View style={styles.tileMid}>
          <Text style={styles.tileTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.tileSub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <Text style={styles.tileBig} numberOfLines={1}>
          {big}
        </Text>
        <GlyphChev size={16} />
      </Glass>
    </ScaleButton>
  );
});

/**
 * «Касса» (позиции) в шторке — плоский список в порядке таблицы. Ввод подряд: «Далее ›» на панели
 * шторки идёт по позициям сверху вниз, поле в фокусе докручивается над клавиатурой.
 */
const CalcPositionsList = memo(function CalcPositionsList({ day, accent, onStep, onSet, onOpen, onQuick }) {
  const inputs = useRef(new Map());
  const focusRef = useRef(null);
  const register = useCallback((id, r) => {
    if (r) inputs.current.set(id, r);
    else inputs.current.delete(id);
  }, []);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      if (focusRef.current) ensureSheetVisible(inputs.current.get(focusRef.current));
    });
    return () => sub.remove();
  }, []);
  const onFocusItem = useCallback((id) => {
    focusRef.current = id;
    if (Keyboard.isVisible()) requestAnimationFrame(() => ensureSheetVisible(inputs.current.get(id)));
  }, []);
  const onNext = useCallback((id, dir) => {
    const i = CALC_ORDER.indexOf(id);
    const nextId = i < 0 ? null : CALC_ORDER[i + dir];
    if (nextId && inputs.current.get(nextId)) {
      Haptics.selectionAsync().catch(noop);
      inputs.current.get(nextId).focus();
    } else if (dir > 0) {
      Keyboard.dismiss();
    }
  }, []);
  const units = CALC_ITEMS.reduce((a, it) => a + (it.note ? 0 : itemTotal(day.counts[it.id])), 0);
  return (
    <View>
      <ScaleButton style={[styles.actBtn, styles.quickOpen]} onPress={onQuick}>
        <View style={styles.actBtnRow}>
          <AppIcon name="lightning" size={20} variant="glyph" color="#fff" />
          <Text style={styles.actBtnTxt}>Быстрый ввод</Text>
        </View>
      </ScaleButton>
      <View style={styles.gHead}>
        <Text style={styles.gTitle}>Как в таблице</Text>
        <Text style={styles.gSub}>{fmtNum(units)}</Text>
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
            onOpen={onOpen}
            register={register}
            onFocusItem={onFocusItem}
            onNext={onNext}
            scope="sheet"
          />
        ))}
      </ItemCard>
    </View>
  );
});


/**
 * «⚡ Быстрый ввод»: позиции по одной карточке в порядке строк Excel.
 * Поле ввода одно и не пересоздаётся — клавиатура остаётся открытой между карточками;
 * при «Далее ›» старая карточка (копия без поля) уезжает влево, новая въезжает справа, «↑» — наоборот.
 * Значение сохраняется сразу при наборе; пустое поле — значение не меняется.
 */
const QUICK_IN = { duration: 260, easing: Easing.out(Easing.cubic) };
const QUICK_W = SCREEN_W - 32;
function CalcQuickEntry({ day, accent, onSetTallies, onDone }) {
  const n = CALC_ITEMS.length;
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [ghost, setGhost] = useState(null); // уезжающая карточка: {item, shown, key}
  const inputRef = useRef(null);
  const focused = useRef(false);
  const base = useRef([0]); // подсчёты карточки на момент входа в неё
  const dayRef = useRef(day);
  dayRef.current = day;
  const cardX = useSharedValue(0);
  const ghostX = useSharedValue(0);
  const ghostSeq = useRef(0);

  const item = CALC_ITEMS[idx];
  const tallies = day.counts[item.id];
  const total = itemTotal(tallies);

  // вход в карточку: запоминаем, что было, поле пустое (текущее — в подсказке)
  useEffect(() => {
    base.current = talliesOf(dayRef.current.counts[CALC_ITEMS[idx].id]);
    setDraft('');
  }, [idx]);

  const clearGhost = useCallback((k) => {
    setGhost((g) => (g && g.key === k ? null : g));
  }, []);

  const go = useCallback(
    (dir) => {
      const r = quickStep(idx, dir, n);
      if (r.done) {
        Keyboard.dismiss();
        onDone();
        return;
      }
      if (r.index === idx) return;
      Haptics.selectionAsync().catch(noop);
      const it = CALC_ITEMS[idx];
      ghostSeq.current += 1;
      const k = ghostSeq.current;
      setGhost({ item: it, shown: draft || quickShown(dayRef.current.counts[it.id]), pos: idx, key: k });
      ghostX.value = 0;
      ghostX.value = withTiming(-dir * QUICK_W, QUICK_IN, (fin) => {
        'worklet';
        try {
          if (fin) scheduleOnRN(clearGhost, k);
        } catch (err) {
          wErr(err);
        }
      });
      cardX.value = dir * QUICK_W;
      cardX.value = withTiming(0, QUICK_IN);
      setIdx(r.index);
    },
    [idx, n, draft, onDone, cardX, ghostX, clearGhost]
  );
  const goRef = useRef(go);
  goRef.current = go;

  const showBar = useCallback(() => {
    kbShow({
      key: 'calc-quick',
      scope: 'sheet',
      label: `${CALC_ITEMS[idx].name}  ·  ${idx + 1}/${n}`,
      hasPrev: idx > 0,
      isLast: idx === n - 1,
      accent,
      onPrev: () => goRef.current(-1),
      onNext: () => goRef.current(1),
    });
  }, [idx, n, accent]);
  useEffect(() => {
    if (focused.current) showBar();
  }, [showBar]);

  // клавиатура открывается сама, когда шторка доехала
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 380);
    return () => {
      clearTimeout(t);
      kbHide('calc-quick');
    };
  }, []);

  const onType = (t) => {
    const clean = String(t).replace(/[^0-9+]/g, '').replace(/^\++/, '').replace(/\+{2,}/g, '+');
    setDraft(clean);
    onSetTallies(item.id, quickValue(base.current, clean));
  };
  const addPlus = () => {
    if (!quickCanPlus(draft)) return;
    Haptics.selectionAsync().catch(noop);
    setDraft(draft + '+');
    inputRef.current?.focus();
  };

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: cardX.value }] }));
  const ghostStyle = useAnimatedStyle(() => ({ transform: [{ translateX: ghostX.value }] }));
  const prevName = idx > 0 ? CALC_ITEMS[idx - 1].name : '';
  const nextName = idx < n - 1 ? CALC_ITEMS[idx + 1].name : '';
  const multi = talliesOf(tallies).length > 1;

  return (
    <View>
      <View style={styles.qeProgress}>
        <View style={[styles.qeProgressFill, { width: `${((idx + 1) / n) * 100}%`, backgroundColor: accent }]} />
      </View>
      <View style={styles.qeStage}>
        {ghost ? (
          <Animated.View key={ghost.key} pointerEvents="none" style={[styles.qeGhost, ghostStyle]}>
            <Glass style={styles.qeCard} intensity={40}>
              <Text style={styles.qeCount}>
                {ghost.pos + 1} / {n}
              </Text>
              <Text style={styles.qeName} numberOfLines={1} adjustsFontSizeToFit>
                {ghost.item.name}
              </Text>
              <Text style={styles.qeNum}>{ghost.shown}</Text>
              <View style={styles.qeFoot} />
            </Glass>
          </Animated.View>
        ) : null}
        <Animated.View style={cardStyle}>
          <Glass style={styles.qeCard} intensity={40}>
            <Text style={styles.qeCount}>
              {idx + 1} / {n}
            </Text>
            <Text style={styles.qeName} numberOfLines={1} adjustsFontSizeToFit>
              {item.name}
            </Text>
            <Pressable onPress={() => inputRef.current?.focus()}>
              <TextInput
                ref={inputRef}
                style={styles.qeNum}
                keyboardType="number-pad"
                keyboardAppearance="dark"
                maxLength={24}
                value={draft}
                placeholder={total || multi ? quickShown(tallies) : '0'}
                placeholderTextColor="rgba(235,235,245,0.35)"
                inputAccessoryViewID={KB_NONE}
                onChangeText={onType}
                submitBehavior="submit"
                {...(Platform.OS === 'web' ? { blurOnSubmit: false } : null)}
                onSubmitEditing={() => goRef.current(1)}
                onFocus={() => {
                  focused.current = true;
                  showBar();
                }}
                onBlur={() => {
                  focused.current = false;
                  kbHide('calc-quick');
                }}
              />
            </Pressable>
            <View style={styles.qeFoot}>
              <Text style={styles.qeNow} numberOfLines={1}>
                {draft ? `было ${quickShown(base.current)}` : item.note || ' '}
              </Text>
              <Pressable
                hitSlop={8}
                style={[styles.qePlus, !quickCanPlus(draft) && styles.qePlusOff]}
                onPress={addPlus}
              >
                <Text style={styles.qePlusTxt}>+ подсчёт</Text>
              </Pressable>
            </View>
          </Glass>
        </Animated.View>
      </View>
      <View style={styles.qePeek}>
        <Text style={styles.qePeekTxt} numberOfLines={1}>
          {prevName ? `‹ ${prevName}` : ''}
        </Text>
        <Text style={[styles.qePeekTxt, { textAlign: 'right' }]} numberOfLines={1}>
          {nextName ? `${nextName} ›` : 'последняя'}
        </Text>
      </View>
    </View>
  );
}

/** «План продаж» (бывш. «Итог по позициям») — в шторке. */
function CalcSummaryList({ day, rates }) {
  const res = useMemo(() => computeCalc(day.counts, rates, day.staff, !!day.gap), [day.counts, rates, day.staff, day.gap]);
  return (
    <View>
      <View style={styles.gHead}>
        <Text style={styles.gTitle}>По позициям</Text>
        <Text style={styles.gSub}>единица {fmtNum(res.unit)}</Text>
      </View>
      <ItemCard style={styles.sumCard}>
        {res.summary
          .filter((x) => x.inTotal || x.value > 0)
          .map((x) => (
            <View key={x.label} style={styles.sumRow}>
              <Text style={[styles.sumL, !x.inTotal && styles.sumDim]}>
                {x.label}
                {!x.inTotal ? ' · не в общем' : ''}
              </Text>
              <Text style={styles.sumV}>{fmtNum(x.value)}</Text>
            </View>
          ))}
        <View style={[styles.sumRow, styles.sumTotal]}>
          <Text style={styles.totalL}>Общее</Text>
          <Text style={styles.totalV}>{fmtNum(res.total)}</Text>
        </View>
      </ItemCard>
    </View>
  );
}

/** «Расход» (бывш. «Расход ингредиентов») — в шторке. */
/** Строка «Расхода», которую можно поправить вручную (напитки, соусы, одноразовые стаканы): тап — подсчёт. */
const UseRow = memo(function UseRow({ id, label, value, last, onOpen }) {
  const { props, hi } = useRowPress(id, onOpen);
  return (
    <Pressable {...props} style={[styles.sumRow, last && styles.boxLast]} accessibilityLabel={`${label}: ${value}`}>
      {hi}
      <Text style={[styles.sumL, !value && styles.useZero]}>{label}</Text>
      <Text style={[styles.sumV, !value && styles.useZero]}>{fmtNum(value)}</Text>
    </Pressable>
  );
});

/** Блок «Расхода»: заголовок + карточка строк (с id — правятся тапом). */
function UseBlock({ title, sub, rows, onOpen }) {
  return (
    <>
      <View style={[styles.gHead, styles.boxHead]}>
        <Text style={styles.useHeadT}>{title}</Text>
        {sub ? <Text style={styles.gSub}>{sub}</Text> : null}
      </View>
      <ItemCard style={styles.sumCard}>
        {rows.map((r, i) =>
          r.id ? (
            <UseRow key={r.key} id={r.id} label={r.label} value={r.value} last={i === rows.length - 1} onOpen={onOpen} />
          ) : (
            <View key={r.key} style={[styles.sumRow, i === rows.length - 1 && styles.boxLast]}>
              <Text style={[styles.sumL, !r.value && styles.useZero]}>{r.label}</Text>
              <Text style={[styles.sumV, !r.value && styles.useZero]}>{fmtNum(r.value)}</Text>
            </View>
          )
        )}
      </ItemCard>
    </>
  );
}

function CalcUsageList({ day, rates, onOpen }) {
  const res = useMemo(() => computeCalc(day.counts, rates, day.staff, !!day.gap), [day.counts, rates, day.staff, day.gap]);
  const boxes = useMemo(() => computeBoxes(day.counts), [day.counts]);
  const drinks = useMemo(() => computeDrinks(day.counts), [day.counts]);
  const cups = useMemo(() => computeCups(day.counts), [day.counts]);
  const sauces = useMemo(() => computeSauces(day.counts), [day.counts]);
  return (
    <View>
      <ItemCard style={styles.sumCard}>
        {res.usage.map((u) => (
          <View key={u.label} style={[styles.sumRow, u.label === 'Единица' && styles.sumTotal]}>
            <Text style={u.label === 'Единица' ? styles.totalL : styles.sumL}>{u.label}</Text>
            <Text style={u.label === 'Единица' ? styles.totalV : styles.sumV}>{fmtNum(u.value)}</Text>
          </View>
        ))}
      </ItemCard>
      <UseBlock title="Напитки" sub="шт" rows={drinks} onOpen={onOpen} />
      <UseBlock title="Стаканы и крышки" sub="из кофе" rows={cups} onOpen={onOpen} />
      <View style={[styles.gHead, styles.boxHead]}>
        <Text style={styles.useHeadT}>Коробки и фри</Text>
        <Text style={styles.gSub}>порции</Text>
      </View>
      <ItemCard style={styles.sumCard}>
        {boxes.map((b, i) => (
          <View key={b.key} style={[styles.sumRow, b.gap && styles.boxGap, i === boxes.length - 1 && styles.boxLast]}>
            <Text style={styles.sumL}>{b.label}</Text>
            <Text style={styles.sumV}>{b.unit === 'kg' ? fmtKg(b.value) : fmtNum(b.value)}</Text>
          </View>
        ))}
      </ItemCard>
      <UseBlock title="Соусы" sub="С · Ч · Б · К" rows={sauces} onOpen={onOpen} />
    </View>
  );
}

/** «Сохранённые расчёты» — в шторке; тап по дню — открыть его. */
function CalcSavedList({ calc, date: cur, accent, onPick }) {
  const saved = useMemo(
    () =>
      Object.keys(calc.days)
        .filter((d) => hasCounts(calc.days[d].counts))
        .sort((a, b) => compareKeys(b, a))
        .map((d) => {
          const x = calc.days[d];
          const r = computeCalc(x.counts, calc.rates, x.staff, !!x.gap);
          return { key: d, date: keyDate(d), slot: keySlot(d), role: x.role, time: x.time, pay: ownPay(r, calc.rates, x), positions: r.positions };
        }),
    [calc.days, calc.rates]
  );
  if (!saved.length) return <Text style={styles.hint}>Пока нет сохранённых расчётов — они появятся, когда впишете позиции.</Text>;
  return (
    <View>
      {saved.map((x) => (
        <ScaleButton
          key={x.key}
          style={[styles.setItem, x.key === cur && { borderColor: accent }]}
          onPress={() => onPick(x.key)}
        >
          <View>
            <Text style={styles.setL}>
              {fmtShort(x.date)} {x.date.slice(0, 4)}
              {x.slot > 1 ? ` · смена ${x.slot}` : ''}
            </Text>
            <Text style={styles.setS}>
              {roleLabel(x.role, x.time)} · {x.positions} поз.
            </Text>
          </View>
          <Text style={[styles.itemTitle, x.key === cur && { color: accent }]}>{money(x.pay)}</Text>
        </ScaleButton>
      ))}
    </View>
  );
}

const CalcView = memo(function CalcView({
  calc, date, day, accent, linkedShift, manualOnDate, adj, onAdj, scrollRef, scrollY, scrollTop,
  onPatchDay, onRole, onTime, onOpenRates, onReset, onShowShift, onOpenSection, onImportPdf,
  slots = [1], slot = 1, onSlot, onAddSlot, dayTotal,
}) {

  // ── ввод с клавиатуры: Далее / ↑ идут по списку сверху вниз, как строки в Excel
  const inputs = useRef(new Map());
  const focusRef = useRef(null);
  const order = CALC_MAIN_ORDER; // на главном экране из полей ввода — только недостача
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
      Haptics.selectionAsync().catch(noop);
      inputs.current.get(nextId).focus();
    } else if (dir > 0) {
      Keyboard.dismiss();
    }
  }, []);

  const res = useMemo(() => computeCalc(day.counts, calc.rates, day.staff, !!day.gap), [day.counts, calc.rates, day.staff, day.gap]);
  const own = ownPay(res, calc.rates, day);
  const ownR = Math.round(own);
  // промежутка этой смены: доля, сколько он забирает из выработки и насколько меньше у меня
  const gapNow = res.gap ? res.gap[day.time === 'day' ? 'day' : 'night'] : null;
  const gapH = day.time === 'day' ? calc.rates.gapDayH : calc.rates.gapNightH;
  const filled = hasCounts(day.counts);
  const units = CALC_ITEMS.reduce((a, it) => a + (it.note ? 0 : itemTotal(day.counts[it.id])), 0);
  const entered = CALC_ITEMS.filter((it) => itemTotal(day.counts[it.id]) > 0).length;
  const usageN = res.usage.filter((u) => u.label !== 'Единица' && u.value > 0).length;
  const friBoxes = itemTotal(day.counts?.fri);

  const saved = useMemo(
    () =>
      Object.keys(calc.days)
        .filter((d) => hasCounts(calc.days[d].counts))
        .sort((a, b) => compareKeys(b, a))
        .map((d) => {
          const x = calc.days[d];
          const r = computeCalc(x.counts, calc.rates, x.staff, !!x.gap);
          return { key: d, date: keyDate(d), slot: keySlot(d), role: x.role, time: x.time, pay: ownPay(r, calc.rates, x), positions: r.positions };
        }),
    [calc.days, calc.rates]
  );


  return (
    <>
      {slots.length > 1 ? (
        <View style={styles.slotRow}>
          <SegmentCapsule
            key={slots.join(',')}
            value={Math.max(0, slots.indexOf(slot))}
            labels={slots.map((n) => `Смена ${n}`)}
            height={42}
            onChange={(i) => onSlot(slots[i])}
          />
          {dayTotal ? (
            <Text style={styles.slotTotal}>
              За день {fmtShort(date)} · {dayTotal.count} {plural(dayTotal.count, 'смена', 'смены', 'смен')} ·{' '}
              <Text style={{ color: accent, fontWeight: '700' }}>{money(dayTotal.amount)}</Text>
            </Text>
          ) : null}
        </View>
      ) : null}
      <Glass style={styles.balance} intensity={42}>
        <Text style={styles.period}>{slots.length > 1 ? `Моя зарплата · смена ${slot}` : 'Моя зарплата'}</Text>
        <Text style={styles.paySub}>
          {roleLabel(day.role, day.time)} · {fmtShort(date)}
        </Text>
        <Text style={[styles.bigPay, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
          {money(own)}
        </Text>
        <Text style={styles.calcMeta}>
          {res.positions} поз. × {money(calc.rates.perItem)} = {money(res.output)} · на {res.people} чел.
          {gapNow ? ' + промежутка' : ''}
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
        <CalcAdjRow
          value={adj}
          date={date}
          onChange={onAdj}
          accent={accent}
          register={register}
          onFocusItem={onFocusItem}
          onNext={onNext}
        />
        <View style={styles.staffRow}>
          <Text style={[styles.setL, { flex: 1 }]}>Сотрудники</Text>
          <ScaleButton
            style={styles.stepBtn}
            onPress={() => onPatchDay((d) => ({ ...d, staff: Math.max(1, (Number(d.staff) || DEFAULT_STAFF) - 1) }))}
          >
            <AppIcon name="minus" size={18} variant="glyph" color="#fff" />
          </ScaleButton>
          <Text style={[styles.cCountTxt, styles.staffNum]}>{res.people}</Text>
          <ScaleButton
            style={styles.stepBtn}
            onPress={() => onPatchDay((d) => ({ ...d, staff: Math.min(30, (Number(d.staff) || DEFAULT_STAFF) + 1) }))}
          >
            <AppIcon name="plus" size={18} variant="glyph" color="#fff" />
          </ScaleButton>
        </View>
        <CheckRow
          checked={!!day.gap}
          label="Промежутка"
          accent={accent}
          right={gapNow ? `−${money(Math.round(gapNow.loss))}` : `${fmtHours(gapH)} из ${fmtHours(calc.rates.shiftH)} ч`}
          onToggle={() => onPatchDay((d) => ({ ...d, gap: !d.gap }))}
        />
        {gapNow ? (
          <Text style={styles.gapNote}>
            промежутка · {fmtHours(gapH)} из {fmtHours(calc.rates.shiftH)} ч · забирает {money(Math.round(gapNow.take))} из
            выработки смены, у вас −{money(Math.round(gapNow.loss))}. Его оклад {money(calc.rates.nightBonus)} — не из ваших денег.
          </Text>
        ) : null}
      </Glass>

      {filled && (
        <Animated.View entering={ROW_ENTER} exiting={ROW_EXIT} layout={ROW_LAYOUT}>
          <Pressable style={styles.linkLine} onPress={onShowShift} hitSlop={4}>
            <View style={[styles.linkDot, { backgroundColor: accent }]}>
              <AppIcon name="check" size={14} variant="glyph" color="#102012" />
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
            <GlyphChev size={16} />
          </Pressable>
          <ScaleButton style={[styles.actBtn, { marginTop: 0, marginBottom: 10 }]} onPress={onAddSlot}>
            <View style={styles.actBtnRow}>
              <AppIcon name="plus" size={18} variant="glyph" color={accent} />
              <Text style={[styles.actBtnTxt, { color: accent }]}>Ещё смена за этот день</Text>
            </View>
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
      {/* отчёт продаж кассы (СТмах → PDF) → позиции «Кассы» и зерновой кофе */}
      <Animated.View layout={ROW_LAYOUT}>
        <ScaleButton style={[styles.actBtn, styles.okBtn, { marginTop: 0 }]} onPress={onImportPdf} accessibilityLabel="Импорт PDF отчёта кассы">
          <Text style={[styles.actBtnTxt, styles.solidTxt]}>Импорт PDF</Text>
        </ScaleButton>
      </Animated.View>

      <Animated.View style={styles.tileGrid} layout={ROW_LAYOUT}>
        <CalcTile
          icon="document"
          title="Касса"
          big={fmtNum(units)}
          sub={`заполнено ${entered} из ${CALC_ITEMS.length}`}
          onPress={() => onOpenSection('calcPos')}
        />
        <CalcTile
          icon="box"
          title="Расход"
          big={fmtNum(usageN)}
          sub={usageN ? `ингр. · коробок фри ${fmtNum(friBoxes)}` : 'пока ничего'}
          onPress={() => onOpenSection('calcUse')}
        />
        <CalcTile
          icon="chart"
          title="План продаж"
          big={fmtNum(res.total)}
          sub={`единица ${fmtNum(res.unit)}`}
          onPress={() => onOpenSection('calcSum')}
        />
        <CalcTile
          icon="list"
          title="Сохранённые расчёты"
          big={fmtNum(saved.length)}
          sub={saved.length ? `последний ${fmtShort(saved[0].date)}${saved[0].slot > 1 ? ` · смена ${saved[0].slot}` : ''}` : 'пока нет'}
          onPress={() => onOpenSection('calcSaved')}
        />
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
const PayCard = memo(function PayCard({ payday, t, short, mentor, accent }) {
  const sv = summaryView(t);
  const nextP = PAYDAYS[PAYDAYS.indexOf(payday) + 1] || addDays(payday, 14);
  return (
    <Glass style={styles.balance} intensity={42}>
      <View>
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
        <Text style={[styles.k, { marginTop: 14 }]}>Заработано</Text>
        <Text key={sv.earnedBig} style={[styles.bigPay, { color: '#30d158', marginTop: 2 }]} numberOfLines={1}>
          {sv.earnedBig}
        </Text>
        {sv.planLine ? (
          <Text style={[styles.calcMeta, { marginTop: 4 }, sv.planDiff < 0 && styles.bad, sv.planDiff > 0 && styles.good]} numberOfLines={1}>
            {sv.planLine}
          </Text>
        ) : null}
      </View>
      <Meter value={sv.progress} color={accent} />
      <View style={styles.statRow}>
        <Stat k="Расходы за зарплату" v={sv.total} />
        <Stat k="Оплачено" v={sv.paid} tone="good" />
      </View>
      {short > 0 || mentor > 0 ? (
        <Text style={styles.calcMeta}>
          заработано за смены
          {short > 0 || mentor > 0
            ? ` (с учётом ${[short > 0 ? `недостачи −${money(short)}` : '', mentor > 0 ? `наставника +${money(mentor)}` : '']
                .filter(Boolean)
                .join(', ')})`
            : ''}
        </Text>
      ) : null}
    </Glass>
  );
});

const PayPage = memo(function PayPage({ k, pos, payday, list, earned, short, mentor, accent, onEdit, onToggle, onReturn, onAdd, arc }) {
  const st = useAnimatedStyle(() => {
    const d = k - pos.value;
    const a = Math.min(1, Math.abs(d));
    return {
      transform: [{ translateX: d * (PAGE_W + PAGE_GAP) }, { scale: 1 - 0.07 * a }],
    };
  });
  const t = useMemo(() => paydayTotals(list, earned), [list, earned]);
  const [flt, setFlt] = useState('all');
  const fc = filterCounts(list, 'expenses');
  const shown = useMemo(() => filterExpenses(list, flt), [list, flt]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st]}>
      <ScrollView style={styles.pages} contentContainerStyle={styles.pagesContent} showsVerticalScrollIndicator={false}>
        <LayoutAnimationConfig skipEntering skipExiting>
          <View>
            <PayCard payday={payday} t={t} short={short} mentor={mentor} accent={accent} />
            {list.length === 0 ? (
              <EmptyState
                icon="wallet"
                title="Расходов пока нет"
                text="Впишите, что нужно оплатить с этой зарплаты, — сумма к остатку посчитается сама."
                action="Добавить расход"
                onAction={onAdd}
                accent={accent}
              />
            ) : (
              <>
                {fc.show || flt !== 'all' ? (
                  <FilterChips
                    value={flt}
                    onChange={setFlt}
                    accent={accent}
                    options={[
                      { k: 'all', label: `Все · ${fc.total}` },
                      { k: 'unpaid', label: `Не оплачено · ${fc.part}` },
                    ]}
                  />
                ) : null}
                {shown.length === 0 ? (
                  <EmptyState icon="check" title="Всё оплачено" action="Показать все" onAction={() => setFlt('all')} accent={accent} />
                ) : (
                  shown.map((e) => <ExpenseCard key={e.id} item={e} onEdit={onEdit} onToggle={onToggle} onReturn={onReturn} arc={arc} />)
                )}
              </>
            )}
          </View>
        </LayoutAnimationConfig>
      </ScrollView>
    </Animated.View>
  );
});

/**
 * Большая карточка зарплаты в «Сменах»: к выплате = заработано + наставник − недостача ± депонирование
 * (излишек показывается для сведения, к выплате не прибавляется).
 * Тап по «Недостаче» — вписать депонирование (+ / −) этой зарплаты.
 */
const ShiftSumCard = memo(function ShiftSumCard({ payday, t, accent, onCarry }) {
  const per = workPeriod(payday);
  const minus = t.short; // недостача по сменам; излишек не считается, депонирование — отдельной строкой
  const bad = minus > 0;
  const fc = shiftForecast(t);
  return (
    <Glass style={styles.balance} intensity={42}>
      <View>
        <Text style={styles.period} numberOfLines={1}>
          Зарплата {fmtShort(payday)}
        </Text>
        <View style={styles.paySubRow}>
          <Text style={styles.paySubL} numberOfLines={1}>
            смены {fmtRange(per.start, per.end)}
          </Text>
          <View style={[styles.tag, bad ? styles.tagBad : styles.tagGood]}>
            <Text style={[styles.tagTxt, bad ? styles.bad : styles.good]} numberOfLines={1}>
              {t.count} {plural(t.count, 'смена', 'смены', 'смен')}
            </Text>
          </View>
        </View>
        <Text style={[styles.k, { marginTop: 12 }]}>К выплате</Text>
        <Text
          key={t.net}
          style={[styles.bigPay, { color: t.net < 0 ? '#ff453a' : accent }]}
          numberOfLines={1}
        >
          {t.net < 0 ? `−${money(-t.net)}` : money(t.net)}
        </Text>
      </View>
      <View style={styles.statRow}>
        <Stat k="Заработано" v={money(t.earned)} />
        <Stat k="Недостача" v={minus > 0 ? `−${money(minus)}` : '0'} tone={minus > 0 ? 'bad' : undefined} />
        <Pressable
          style={({ pressed }) => [styles.stat3, pressed && styles.rowPressed]}
          hitSlop={6}
          onPress={() => onCarry && onCarry(payday)}
        >
          <Stat
            k="Депонирование ›"
            v={t.carry > 0 ? `−${money(t.carry)}` : t.carry < 0 ? `+${money(-t.carry)}` : '0'}
            tone={t.carry > 0 ? 'bad' : t.carry < 0 ? 'good' : undefined}
          />
        </Pressable>
      </View>
      <Text style={styles.calcMeta}>
        с суммой {t.withSum} · из расчёта {t.fromCalc}
        {t.shortCount ? ` · с недостачей ${t.shortCount}` : ''}
      </Text>
      {fc.avg > 0 ? (
        <Text style={styles.calcMeta} numberOfLines={2}>
          в среднем {money(fc.avg)} за смену
          {fc.forecast !== null ? (
            <Text style={styles.calcMetaStrong}>
              {` · прогноз ≈ ${fc.forecast < 0 ? '−' : ''}${money(Math.abs(fc.forecast))}`}
            </Text>
          ) : null}
          {fc.forecast !== null ? ` (ещё ${fc.left} ${plural(fc.left, 'смена', 'смены', 'смен')} без суммы)` : ''}
        </Text>
      ) : null}
      {t.carry || t.mentor || t.surplus || t.bonusLoss ? (
        <Text style={styles.calcMeta}>
          {[
            t.bonusLoss ? (
              <Text key="b" style={styles.bad}>
                без премии кассира −{money(t.bonusLoss)}
              </Text>
            ) : null,
            t.carry ? (
              <Text key="c" style={t.carry > 0 ? styles.bad : styles.good}>
                {t.carry > 0 ? `депонирование −${money(t.carry)}` : `депонирование +${money(-t.carry)}`}
              </Text>
            ) : null,
            t.mentor ? (
              <Text key="m" style={styles.good}>
                наставник +{money(t.mentor)}
              </Text>
            ) : null,
            t.surplus ? (
              <Text key="s" style={styles.bad}>
                излишек {money(t.surplus)} (не в зарплату)
              </Text>
            ) : null,
          ]
            .filter(Boolean)
            .flatMap((x, i) => (i ? [' · ', x] : [x]))}
        </Text>
      ) : null}
    </Glass>
  );
});

/** Собственная печать приложения (как на чеке): кольца, название приложения по кругу, звезда, дата выдачи. */
function Stamp({ r, size = 132 }) {
  const k = stampSpec(r, size, STAMP_INK_DARK);
  return (
    <View style={[styles.expStamp, { transform: [{ rotate: `${k.rotate}deg` }] }]} pointerEvents="none">
      <Svg width={k.size} height={k.size} viewBox={`0 0 ${k.size} ${k.size}`}>
        {k.rings.map((g) => (
          <Circle key={g.r} cx={k.c} cy={k.c} r={g.r} fill="none" stroke={k.ink} strokeWidth={g.w} />
        ))}
        {/* та же побуквенная раскладка по дугам, что и в PDF (stampSpec) */}
        {k.glyphs.map((g, i) => (
          <SvgText
            key={i}
            x={g.x}
            y={g.y}
            transform={`rotate(${g.rot} ${g.x} ${g.y})`}
            textAnchor="middle"
            fill={k.ink}
            fontSize={g.size}
            fontWeight={g.weight}
          >
            {g.ch}
          </SvgText>
        ))}
        {k.stars.map((d) => (
          <SvgPath key={d} d={d} fill={k.ink} />
        ))}
      </Svg>
    </View>
  );
}

/** Чек закрытой зарплаты для анимации печати — тот же текст, что в PDF. memo: не перерисовывается во время хода. */
const ExportCard = memo(function ExportCard({ r, accent }) {
  return (
    <View collapsable={false} style={styles.expCard}>
      <Text style={styles.expTitle}>{r.title}</Text>
      <Text style={styles.expSub}>
        {r.period} · {r.count} {plural(r.count, 'смена', 'смены', 'смен')}
      </Text>
      <Text style={styles.expPay}>
        Период: {r.periodDates} · Дата выдачи: <Text style={styles.expPayB}>{r.payout}</Text>
      </Text>
      {r.rows.map((x) => (
        <View key={x.id}>
          <View style={styles.expRow}>
            <Text style={styles.expDay}>{x.day}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.expT} numberOfLines={1}>
                {x.title}
                {x.place ? ` · ${x.place}` : ''}
                {x.calc && x.calc.slot > 1 ? ` · смена ${x.calc.slot}` : ''}
              </Text>
              <Text style={styles.expM} numberOfLines={2}>
                {x.hours} ч · {x.source}
                {x.notes.length ? ` · ${x.notes.join(' · ')}` : ''}
              </Text>
            </View>
            <Text style={styles.expA}>{x.amount}</Text>
          </View>
          {x.dayTotal ? (
            <View style={[styles.expRow, styles.expDayTot]}>
              <Text style={[styles.expM, { flex: 1 }]}>За день · {x.dayTotal.count} смены</Text>
              <Text style={styles.expA}>{x.dayTotal.amount}</Text>
            </View>
          ) : null}
        </View>
      ))}
      <View style={{ marginTop: 10 }}>
        {r.lines.map(([k, v]) => (
          <View key={k} style={styles.expLine}>
            <Text style={styles.expM}>{k}</Text>
            <Text style={styles.expT}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.expNet, { borderColor: accent }]}>
        <Text style={styles.expNetK}>К выплате</Text>
        <Text style={[styles.expNetV, { color: r.netValue < 0 ? '#ff453a' : accent }]}>{r.net}</Text>
      </View>
      {r.surplus ? <Text style={styles.expM}>Излишек {r.surplus} — не в зарплату.</Text> : null}
      <Stamp r={r} />
    </View>
  );
});

const SAFE_TOP = Platform.OS === 'ios' ? 54 : 28;
const SLOT_INSET = 8;
const ACTIONS_BOTTOM_PAD = 28;
const ACT_BTN_H = 54;
const ACT_GAP = 10;
const GAP_ABOVE_ACTIONS = 12;
const ACTIONS_BLOCK_H = ACT_BTN_H + ACT_GAP + ACT_BTN_H; // «Скачать» + «Отмена»
const PRINT_BTN_H = 56; // = styles.exportIconBtn.height
const PRINT_W = SCREEN_W - 32; // ширина кнопки-принтера = ширина контента страницы (pagesContent: 16 + 16)
const EJECT = { duration: 560, easing: Easing.bezier(0.16, 1, 0.3, 1) }; // ease-out (как cubic/expo out)
const EJECT_CLOSE = { duration: 380, easing: Easing.bezier(0.4, 0, 0.9, 0.6) };
const PRINTER_GEOM = {
  screenH: SCREEN_H,
  safeTop: SAFE_TOP,
  bottomPad: ACTIONS_BOTTOM_PAD,
  actionsH: ACTIONS_BLOCK_H,
  gapAbove: GAP_ABOVE_ACTIONS,
  btnH: PRINT_BTN_H,
};

/**
 * Печать зарплаты: чек выезжает из зелёной кнопки-принтера, как бумага из щели.
 * Кнопка одновременно опускается и встаёт над «Скачать»; бумага прикреплена к щели.
 *
 * Без скачков и ожидания:
 *  • хост смонтирован, как только открыта вкладка «Смены»: чек текущей зарплаты уже отрисован
 *    (скрыто, opacity 0) и измерен — к нажатию высота окна бумаги известна, ничего не догружается;
 *  • при открытии НЕ меняется layout: позиция кнопки (x/y) и путь — только shared values → translate;
 *  • старт — одним worklet на UI-потоке (все значения в одном кадре), один progress 0→1, ease-out;
 *  • во время хода нет setState в дереве чека (его элемент стабилен и memo), слои растеризованы.
 * Управление императивное: apiRef.current.open(origin) / close(then).
 */
function ExportPrinterHost({ apiRef, accent, children, onDownload, onClosed }) {
  const [open, setOpen] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [paperH, setPaperH] = useState(0);
  const progress = useSharedValue(0);
  const on = useSharedValue(0);
  const oxSV = useSharedValue(16);
  const oySV = useSharedValue(0);
  const travelSV = useSharedValue(0);
  const ejectSV = useSharedValue(1);
  const busy = useRef(false);
  const closing = useRef(false);
  const pendingH = useRef(0);
  const afterClose = useRef(null);
  const offset = useRef({ x: 0, y: 0 });
  const rootRef = useRef(null);
  const reduce = useReducedMotion();
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  const g = printerGeom({ ...PRINTER_GEOM, paperH });
  const gRef = useRef(g);
  gRef.current = g;

  // высота окна бумаги → shared value (меняется только пока чек скрыт)
  useEffect(() => {
    ejectSV.value = g.ejectH;
  }, [g.ejectH, ejectSV]);

  const markInteractive = useCallback(() => {
    if (busy.current && !closing.current) setInteractive(true);
  }, []);

  const finishClose = useCallback(() => {
    on.value = 0;
    progress.value = 0;
    busy.current = false;
    closing.current = false;
    setOpen(false);
    setInteractive(false);
    if (pendingH.current) {
      setPaperH(pendingH.current);
      pendingH.current = 0;
    }
    const fn = afterClose.current;
    afterClose.current = null;
    onClosedRef.current?.();
    if (fn) fn();
  }, [on, progress]);

  const openAt = useCallback(
    (origin) => {
      if (busy.current) return false;
      busy.current = true;
      closing.current = false;
      const x = Math.round((origin?.x ?? 16) - offset.current.x);
      const y = Math.round((origin?.y ?? SCREEN_H * 0.42) - offset.current.y);
      const travel = printerGeom({ ...PRINTER_GEOM, paperH: 0, originY: y }).travel;
      const instant = !!reduce;
      const done = markInteractive;
      scheduleOnUI(() => {
        'worklet';
        oxSV.value = x;
        oySV.value = y;
        travelSV.value = travel;
        on.value = 1;
        if (instant) {
          progress.value = 1;
          scheduleOnRN(done);
          return;
        }
        progress.value = 0;
        progress.value = withTiming(1, EJECT, (fin) => {
          'worklet';
          if (fin) scheduleOnRN(done);
        });
      });
      setOpen(true);
      return true;
    },
    [reduce, markInteractive, oxSV, oySV, travelSV, on, progress]
  );

  const close = useCallback(
    (then) => {
      if (!busy.current || closing.current) return;
      closing.current = true;
      afterClose.current = typeof then === 'function' ? then : null;
      setInteractive(false);
      if (reduce) {
        finishClose();
        return;
      }
      const done = finishClose;
      scheduleOnUI(() => {
        'worklet';
        progress.value = withTiming(0, EJECT_CLOSE, (fin) => {
          'worklet';
          if (fin) scheduleOnRN(done);
        });
      });
    },
    [reduce, finishClose, progress]
  );

  useLayoutEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = { open: openAt, close };
    return () => {
      if (apiRef.current && apiRef.current.open === openAt) apiRef.current = null;
    };
  }, [apiRef, openAt, close]);

  // Android «назад» закрывает печать
  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [open, close]);

  const onRootLayout = useCallback(() => {
    const n = rootRef.current;
    if (n && typeof n.measureInWindow === 'function') {
      n.measureInWindow((x, y) => {
        offset.current = { x: x || 0, y: y || 0 };
      });
    }
  }, []);

  const onPaperLayout = useCallback((e) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (!h) return;
    if (busy.current) {
      pendingH.current = h; // чек поменялся во время показа — применим после закрытия, без прыжка
      return;
    }
    setPaperH((prev) => (prev === h ? prev : h));
  }, []);

  const layerStyle = useAnimatedStyle(() => ({ opacity: on.value }));
  const plaqueStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: oxSV.value }, { translateY: oySV.value }],
  }));
  const clipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: oxSV.value }, { translateY: oySV.value + travelSV.value * progress.value }],
  }));
  const paperStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -ejectSV.value * progress.value }],
  }));
  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: oxSV.value }, { translateY: oySV.value + travelSV.value * progress.value }],
  }));
  const dim = useAnimatedStyle(() => ({ opacity: progress.value }));
  const actStyle = useAnimatedStyle(() => {
    const a = interpolate(progress.value, [0.45, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity: a, transform: [{ translateY: (1 - a) * 16 }] };
  });

  const canScroll = interactive && g.scrollable;

  return (
    <View
      ref={rootRef}
      onLayout={onRootLayout}
      collapsable={false}
      pointerEvents={open ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { zIndex: 60, elevation: 60 }]}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!open}
    >
      <Animated.View style={[StyleSheet.absoluteFill, layerStyle]} collapsable={false}>
        {/* Плашка под затемнением закрывает исходную кнопку, чтобы не было «призрака». */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              width: PRINT_W,
              height: PRINT_BTN_H,
              borderRadius: Math.round(PRINT_BTN_H * 0.32),
              backgroundColor: '#050507',
            },
            plaqueStyle,
          ]}
        />
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.55)' }, dim]}
        />
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => close()} />
        <Animated.View
          pointerEvents="box-none"
          collapsable={false}
          style={[
            {
              position: 'absolute',
              left: 0,
              width: PRINT_W,
              top: SLOT_INSET - SCREEN_H,
              height: SCREEN_H,
              overflow: 'hidden',
              zIndex: 2,
            },
            clipStyle,
          ]}
        >
          <Animated.View
            shouldRasterizeIOS={!interactive}
            renderToHardwareTextureAndroid={!interactive}
            collapsable={false}
            style={[{ position: 'absolute', left: 0, width: PRINT_W, top: SCREEN_H - SLOT_INSET, height: g.ejectH }, paperStyle]}
          >
            <ScrollView
              scrollEnabled={!!canScroll}
              showsVerticalScrollIndicator={!!canScroll}
              bounces={false}
              style={{ height: g.ejectH }}
            >
              <View onLayout={onPaperLayout} collapsable={false}>
                {children}
              </View>
            </ScrollView>
          </Animated.View>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          shouldRasterizeIOS
          renderToHardwareTextureAndroid
          collapsable={false}
          style={[
            {
              position: 'absolute',
              left: -12,
              top: -12,
              width: PRINT_W + 24,
              height: PRINT_BTN_H + 24,
              zIndex: 3,
              padding: 12,
            },
            btnStyle,
          ]}
        >
          <AppIcon name="printer" size={PRINT_BTN_H} width="100%" variant="tileOn" />
        </Animated.View>
        <Animated.View
          pointerEvents={interactive ? 'auto' : 'none'}
          style={[{ position: 'absolute', left: 16, right: 16, bottom: ACTIONS_BOTTOM_PAD, zIndex: 4 }, actStyle]}
        >
          <ScaleButton
            style={[styles.actBtn, { backgroundColor: accent, marginBottom: 0 }]}
            onPress={onDownload}
            accessibilityLabel="Скачать чек в PDF"
          >
            <Text style={[styles.actBtnTxt, styles.onAccent]}>Скачать</Text>
          </ScaleButton>
          <ScaleButton style={[styles.actBtn, styles.dangerBtn, { marginTop: ACT_GAP, marginBottom: 0 }]} onPress={() => close()}>
            <Text style={[styles.actBtnTxt, styles.solidTxt]}>Отмена</Text>
          </ScaleButton>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

function PrintExportButton({ payday, onExport }) {
  const printRef = useRef(null);
  const onPrint = () => {
    const node = printRef.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, width, height) => {
        onExport && onExport(payday, { x, y, width, height });
      });
    } else if (onExport) {
      onExport(payday, null);
    }
  };
  return (
    <View ref={printRef} collapsable={false} style={styles.exportIconBtn}>
      <ScaleButton style={styles.exportIconHit} onPress={onPrint} accessibilityLabel="Чек зарплаты, скачать PDF">
        <AppIcon name="printer" size={56} width="100%" variant="tileOn" />
      </ScaleButton>
    </View>
  );
}

const ShiftPage = memo(function ShiftPage({ k, pos, payday, list, carry, accent, onEdit, onCalc, onCarry, onExport, onAdd }) {
  const st = useAnimatedStyle(() => {
    const d = k - pos.value;
    const a = Math.min(1, Math.abs(d));
    return {
      transform: [{ translateX: d * (PAGE_W + PAGE_GAP) }, { scale: 1 - 0.07 * a }],
    };
  });
  const t = useMemo(() => shiftTotals(list, carry), [list, carry]);
  const days = useMemo(() => dayTotals(list), [list]);
  const [flt, setFlt] = useState('all');
  const fc = filterCounts(list, 'shifts');
  const shown = useMemo(() => filterShifts(list, flt), [list, flt]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st]}>
      <ScrollView style={styles.pages} contentContainerStyle={styles.pagesContent} showsVerticalScrollIndicator={false}>
        <LayoutAnimationConfig skipEntering skipExiting>
          <View>
            <ShiftSumCard payday={payday} t={t} accent={accent} onCarry={onCarry} />
            {list.length ? (
              <PrintExportButton payday={payday} onExport={onExport} />
            ) : null}
            {list.length === 0 ? (
              <EmptyState
                icon="calendar"
                title="Смен пока нет"
                text={`Отметьте смены с ${fmtShort(workPeriod(payday).start)} по ${fmtShort(workPeriod(payday).end)} — из них сложится эта зарплата.`}
                action="Добавить смену"
                onAction={onAdd}
                accent={accent}
              />
            ) : (
              <>
                {fc.show || flt !== 'all' ? (
                  <FilterChips
                    value={flt}
                    onChange={setFlt}
                    accent={accent}
                    options={[
                      { k: 'all', label: `Все · ${fc.total}` },
                      { k: 'nosum', label: `Без суммы · ${fc.part}` },
                    ]}
                  />
                ) : null}
                {shown.length === 0 ? (
                  <EmptyState icon="check" title="У всех смен есть сумма" action="Показать все" onAction={() => setFlt('all')} accent={accent} />
                ) : (
                  shown.map((s, i) => (
                    <ShiftCard
                      key={s.id}
                      item={s}
                      onEdit={onEdit}
                      onCalc={onCalc}
                      accent={accent}
                      // итог дня — под последней сменой дня, где смен 2 и больше
                      dayTotal={flt === 'all' && days[s.date] && shown[i + 1]?.date !== s.date ? days[s.date] : null}
                    />
                  ))
                )}
              </>
            )}
          </View>
        </LayoutAnimationConfig>
      </ScrollView>
    </Animated.View>
  );
});

/** Пейджер: свой жест с ручной активацией — вбок только явным горизонтальным движением. */
const PayPager = memo(function PayPager({ pos, cur, lo, hi, pages, arc, onPage, Page = PayPage, pageProps }) {
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const drag0 = useSharedValue(0);
  const islHold = arc.hold;
  const islOpen = arc.open;
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .manualActivation(true)
        .onTouchesDown((e) => {
          try {
            const t = e.allTouches && e.allTouches[0];
            if (!t) return;
            sx.value = t.absoluteX;
            sy.value = t.absoluteY;
          } catch (err) {
            wErr(err);
          }
        })
        .onTouchesMove((e, mgr) => {
          try {
            if (islHold.value || islOpen.value > 0) return mgr.fail(); // остров статуса открыт — не листаем
            const t = e.allTouches && e.allTouches[0];
            if (!t) return;
            const dx = t.absoluteX - sx.value;
            const dy = t.absoluteY - sy.value;
            if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) mgr.fail();
            else if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) mgr.activate();
          } catch (err) {
            wErr(err);
          }
        })
        .onStart(() => {
          try {
            drag0.value = pos.value; // перехват на лету — с текущего места, без рывка
          } catch (err) {
            wErr(err);
          }
        })
        .onUpdate((e) => {
          try {
            const c = cur.value;
            const a = Math.max(lo.value, c - 1);
            const b = Math.min(hi.value, c + 1);
            let p = drag0.value - e.translationX / PAGE_W;
            // за краями — резинка
            if (p < a) p = a - (1 - Math.exp(-(a - p) * 2.2)) * 0.18;
            if (p > b) p = b + (1 - Math.exp(-(p - b) * 2.2)) * 0.18;
            pos.value = p;
          } catch (err) {
            wErr(err);
          }
        })
        .onEnd((e) => {
          try {
            const c = cur.value;
            const a = Math.max(lo.value, c - 1);
            const b = Math.min(hi.value, c + 1);
            const proj = pos.value - (e.velocityX / PAGE_W) * 0.22;
            const target = Math.max(a, Math.min(b, Math.round(proj)));
            const v = -e.velocityX / PAGE_W;
            pos.value = withSpring(target, { ...PAGE_SPRING, velocity: Number.isFinite(v) ? v : 0 });
            if (target !== c) {
              cur.value = target;
              scheduleOnRN(onPage, target);
            }
          } catch (err) {
            wErr(err);
          }
        }),
    [sx, sy, drag0, pos, cur, lo, hi, islHold, islOpen, onPage]
  );
  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.pager} collapsable={false}>
        {pages.map((pg) => (
          <Page key={pg.payday} pos={pos} {...pg} {...pageProps} />
        ))}
      </View>
    </GestureDetector>
  );
});

/** Месяц в центре шапки: меняется с перекрёстным проявлением при листании через месяцы. */
function PayHeader({ payday, label = 'Расходы' }) {
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
          {label} · {y}
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

/** Недостача из формы со знаком: «излишек» — минус. */
function adjFromForm(f, key = 'shortage') {
  const n = Number(f?.[key]) || 0;
  return f?.surplus ? -n : n;
}
/** Правленая вручную смена больше не «автосмена режима» — режим её не трогает. */
function dropAuto(s) {
  if (!s || !('auto' in s || 'autoAmount' in s)) return s;
  const { auto: _a, autoAmount: _b, ...rest } = s;
  return rest;
}
/** Место смены (пусто — поле убирается). */
function withPlace(s, v) {
  const t = String(v || '').trim();
  if (t) return s.place === t ? s : { ...s, place: t };
  if (!('place' in s)) return s;
  const { place: _drop, ...rest } = s;
  return rest;
}

/** Дата новой смены: сегодня, если сегодня в рабочем периоде показанной зарплаты, иначе его первый день. */
function newShiftDate(k) {
  const today = todayIso();
  const p = k != null ? PAYDAYS[k] : null;
  if (!p) return today;
  const per = workPeriod(p);
  return today >= per.start && today <= per.end ? today : per.start;
}

export default function App() {
  const [state, setState] = useState(null);
  const [page, setPage] = useState(0);
  const [viewY] = useState(INIT_Y);
  const [viewM] = useState(INIT_M);
  const [sheet, setSheet] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({});
  const [addMenu, setAddMenu] = useState(null); // { x, y, w, h } кнопки «+» — меню открыто
  const [find, setFind] = useState({ q: '', kind: 'expense' }); // «Поиск» из меню «+»
  const [menuPage, setMenuPage] = useState(0); // для какой вкладки меню (пункты не меняются, пока закрывается)
  const addBtnRef = useRef(null);
  // импорт из заметок: текст, разобранный результат, замена похожих старых, «все строки»
  const [notes, setNotes] = useState({ text: '', parsed: null });
  const [impReplace, setImpReplace] = useState(true);
  const [impAll, setImpAll] = useState(false);
  const [shNotes, setShNotes] = useState({ text: '', parsed: null }); // импорт смен: текст и разбор
  const [impClear, setImpClear] = useState(true); // импорт смен: убрать пустые заготовки
  const [toast, setToast] = useState(null); // { k, text, undo }
  const [pdfImp, setPdfImp] = useState(null); // результат «Импорт PDF» до подтверждения

  // Расходы: показанная зарплата (индекс в PAYDAYS) + shared values пейджера
  const [pi, setPi] = useState(null);
  const pagePos = useSharedValue(0);
  const pageCur = useSharedValue(0);
  const pageLo = useSharedValue(0);
  const pageHi = useSharedValue(PAYDAYS.length - 1);
  const piRef = useRef(null);
  piRef.current = pi;
  // Смены: свой пейджер зарплат (свои shared values — с «Расходами» не пересекаются)
  const [si, setSi] = useState(null);
  const shiftPos = useSharedValue(0);
  const shiftCur = useSharedValue(0);
  const shiftLo = useSharedValue(0);
  const shiftHi = useSharedValue(PAYDAYS.length - 1);
  const siRef = useRef(null);
  siRef.current = si;

  // ── Расчёт: отдельный ключ zp_calc_v1, zp_app_v1 не трогаем
  const [calc, setCalc] = useState(null);
  // запись в хранилище: по очереди, с повтором, без битого состояния (src/lib/persist.js)
  // сбой записи: одно короткое сообщение (не чаще раза в 20 с); незаписанное повторится само
  const [onSaveErr] = useState(() => {
    let at = 0;
    return (why) => {
      const now = Date.now();
      if (now - at < 20000) return;
      at = now;
      setToast({ k: now, text: why === 'invalid' ? 'Не сохранено: данные выглядят повреждёнными' : 'Не сохранилось — повторю позже' });
    };
  });
  const [appWriter] = useState(() =>
    createWriter({
      setItem: (k, v) => AsyncStorage.setItem(k, v),
      key: KEY,
      validate: validAppState,
      onError: onSaveErr,
    })
  );
  const [calcWriter] = useState(() =>
    createWriter({
      setItem: (k, v) => AsyncStorage.setItem(k, v),
      key: CALC_KEY,
      validate: validCalcState,
      onError: onSaveErr,
    })
  );
  const calcRef = useRef(null);
  calcRef.current = calc;
  const [calcDate, setCalcDateRaw] = useState(todayIso);
  // номер смены дня в «Расчёте» (1 — первая; 2+ — «Ещё смена за этот день»)
  const [calcSlot, setCalcSlot] = useState(1);
  const setCalcDate = useCallback((d) => {
    setCalcDateRaw(d);
    setCalcSlot(1);
  }, []);
  const calcKeyNow = calcKey(calcDate, calcSlot);
  const [calcItem, setCalcItem] = useState(null);
  const calcDateRef = useRef(calcKeyNow);
  calcDateRef.current = calcKeyNow;
  const calcTimer = useRef(null);
  const calcPending = useRef(null);

  const flushCalc = useCallback(() => {
    if (calcTimer.current) clearTimeout(calcTimer.current);
    calcTimer.current = null;
    const data = calcPending.current;
    calcPending.current = null;
    if (data) calcWriter.write(data);
    else calcWriter.flush();
  }, [calcWriter]);
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
      if (s !== 'active') {
        flushCalc();
        appWriter.flush();
      } else if (appWriter.hasPending) appWriter.flush(); // вернулись — дописать, что не записалось
    });
    return () => {
      sub.remove();
      flushCalc();
    };
  }, [flushCalc, appWriter]);

  /** Изменить расчёт текущей даты (prefs — запомнить роль/смену по умолчанию). */
  const patchDay = useCallback(
    (fn, prefs) => {
      const date = calcDateRef.current;
      patchCalc((p) => {
        const d = p.days[date] || seedDay(p.prefs, stateRef.current?.shifts, date, p.days);
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
  const setCalcTallies = useCallback((id, t) => editTallies(id, () => t), [editTallies]);
  const onCalcStep = useCallback((id, d) => stepTally(id, d, 0), [stepTally]);
  const onCalcSet = useCallback((id, n) => setTally(id, n, 0), [setTally]);
  // разделы «Расчёта» в шторках; подсчёты позиции, открытые из списка позиций, закрываются назад в список
  const sheetNow = useRef(null);
  sheetNow.current = sheet;
  const calcBack = useRef(null);
  const openCalcItem = useCallback((id) => {
    Haptics.selectionAsync().catch(noop);
    calcBack.current = sheetNow.current === 'calcPos' || sheetNow.current === 'calcUse' ? sheetNow.current : null;
    setCalcItem(id);
    setSheet('calcItem');
  }, []);
  const openCalcSection = useCallback((key) => {
    Haptics.selectionAsync().catch(noop);
    calcBack.current = null;
    setSheet(key);
  }, []);
  const closeCalcItem = useCallback(() => {
    const back = calcBack.current;
    calcBack.current = null;
    setSheet(back);
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
  const bankApi = useRef(null);
  const [bankHead, setBankHead] = useState(null);
  const bankToast = useCallback((text) => setToast({ k: Date.now(), text }), []);
  const mainScrollY = useRef(0);
  const mainScrollTop = useRef(0);

  // ── Вкладки: плашка дока едет на UI-потоке; JS лишь переключает display.
  // Расчёт/Смены монтируем при ПЕРВОМ заходе — когда вкладка уже полностью проявилась
  // (стекло карточек создаётся видимым, как у «Расходов» при старте), дальше держим.
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
  const tv3 = useSharedValue(0);
  const tx0 = useSharedValue(0);
  const tx1 = useSharedValue(0);
  const tx2 = useSharedValue(0);
  const tx3 = useSharedValue(0);
  const tabCur = useSharedValue(0);
  const tabAnim = useMemo(() => {
    const vis = [tv0, tv1, tv2, tv3];
    const xs = [tx0, tx1, tx2, tx3];
    const shift = reduceMotion ? 0 : TAB_SHIFT;
    const pages = DOCK_PAGES.slice();
    const posOf = DOCK_POS.slice();
    // pos — позиция в доке; направление сдвига — по позициям, состояние — по страницам
    return (pos) => {
      'worklet';
      const k = pages[pos];
      const from = tabCur.value;
      if (k === from) return;
      const dir = pos > posOf[from] ? 1 : -1;
      tabCur.value = k;
      for (let i = 0; i < vis.length; i++) {
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
  }, [reduceMotion, tv0, tv1, tv2, tv3, tx0, tx1, tx2, tx3, tabCur]);
  const tabSV = useMemo(
    () => [
      [tv0, tx0],
      [tv1, tx1],
      [tv2, tx2],
      [tv3, tx3],
    ],
    [tv0, tv1, tv2, tv3, tx0, tx1, tx2, tx3]
  );

  const onDock = useCallback((pos) => {
    // анимация уже идёт (стартовала на UI-потоке из жеста дока); здесь — только состояние
    const i = DOCK_PAGES[pos];
    Keyboard.dismiss();
    setPage(i);
    if (!mountedRef.current[i]) setTimeout(() => setMounted((m) => ({ ...m, [i]: true })), TAB_MOUNT_MS);
  }, []);
  const goPage = useCallback((i) => {
    if (!mountedRef.current[i]) setTimeout(() => setMounted((m) => (m[i] ? m : { ...m, [i]: true })), TAB_MOUNT_MS);
    scheduleOnUI(tabAnim, DOCK_POS[i]); // переход не из дока (бейдж, «Открыть в Расчёте») — та же анимация
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
      importPdf: () => calcH.current.importPdf?.(),
    }),
    []
  );
  const calcDay = useMemo(
    () => (calc ? calc.days[calcKeyNow] || seedDay(calc.prefs, state?.shifts, calcKeyNow, calc.days) : null),
    [calc, calcKeyNow, state?.shifts]
  );
  const calcSlotList = useMemo(() => {
    const l = calc ? calcSlots(calc.days, calcDate) : [1];
    return l.includes(calcSlot) ? l : [...l, calcSlot].sort((a, b) => a - b);
  }, [calc, calcDate, calcSlot]);
  /** Итог дня в «Расчёте» — только если за дату посчитано 2 смены и больше. */
  const calcDayTotal = useMemo(() => {
    if (!calc) return null;
    const keys = Object.keys(calc.days).filter((k) => keyDate(k) === calcDate && hasCounts(calc.days[k].counts));
    if (keys.length < 2) return null;
    return { count: keys.length, amount: keys.reduce((a, k) => a + calcPayForDay(calc.days[k], calc.rates), 0) };
  }, [calc, calcDate]);
  /** «Ещё смена за этот день»: новый расчёт той же даты (роль — как у 1-й, время — другое). */
  const addCalcSlot = useCallback(
    (date) => {
      Haptics.selectionAsync().catch(noop);
      const d = typeof date === 'string' ? date : calcDateRef.current.slice(0, 10);
      const c = calcRef.current;
      const n = c ? nextSlot(c.days, d) : 2;
      const k = calcKey(d, n);
      patchCalc((p) =>
        p.days[k] ? p : { ...p, days: { ...p.days, [k]: { ...seedDay(p.prefs, stateRef.current?.shifts, k, p.days), updated: Date.now() } } }
      );
      setCalcDateRaw(d);
      setCalcSlot(n);
    },
    [patchCalc]
  );


  const loadAllRef = useRef(null);
  // загрузка всех данных из AsyncStorage в память (при старте и после «Вставить данные»)
  const loadAll = useCallback(async () => {
    {
      let loaded;
      let readFailed = false; // хранилище не прочиталось — не затирать его стартовыми данными
      let raw = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          raw = await AsyncStorage.getItem(KEY);
          readFailed = false;
          break;
        } catch {
          readFailed = true; // временный сбой чтения — пробуем ещё раз
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      try {
        loaded = raw ? normalizeApp(JSON.parse(raw)) : defaultState();
      } catch {
        // битый JSON: сначала откладываем его копию (в broken_zp_app_v1), потом работаем дальше
        loaded = defaultState();
        await AsyncStorage.setItem(brokenKey(KEY), raw).catch(() => {});
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
      // «Смены» — на ближайшей предстоящей зарплате
      const { lo: sLo0 } = shiftPagerRange(seeded.shifts, ANCHOR);
      const s0 = Math.max(sLo0, PAYDAYS.indexOf(upcomingPayday(today)));
      seeded = seedShiftPaydays(seeded, PAYDAYS.slice(Math.max(0, s0 - 1), s0 + 2));
      shiftPos.value = s0;
      shiftCur.value = s0;
      let calcLoaded;
      let rawC = null;
      let calcReadFailed = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          rawC = await AsyncStorage.getItem(CALC_KEY);
          calcReadFailed = false;
          break;
        } catch {
          calcReadFailed = true;
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      try {
        calcLoaded = normalizeCalc(rawC ? JSON.parse(rawC) : null);
      } catch {
        calcLoaded = normalizeCalc(null);
        if (rawC) await AsyncStorage.setItem(brokenKey(CALC_KEY), rawC).catch(() => {});
      }
      // не прочиталось — ничего не пишем поверх (до успешного чтения)
      appWriter.block(readFailed);
      calcWriter.block(calcReadFailed);
      if (readFailed || calcReadFailed) {
        Alert.alert(
          'Данные не прочитались',
          'Похоже, временный сбой памяти телефона. Чтобы не затереть сохранённое, изменения пока не записываются.',
          [
            { text: 'Позже', style: 'cancel' },
            { text: 'Повторить', onPress: () => loadAllRef.current && loadAllRef.current() },
          ]
        );
      }
      // сразу связываем расчёт со сменами (и узнаём смены от старой кнопки)
      const linked = syncCalcShifts(seeded, calcLoaded, paydayForDate, uid);
      if (linked !== loaded && !readFailed) appWriter.write(linked);
      setCalc(calcLoaded);
      setPi(p0);
      setSi(s0);
      setState(linked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    loadAllRef.current = loadAll;
    loadAll();
  }, [loadAll]);

  const patch = useCallback((fn) => {
    setState((prev) => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      if (next !== prev && next) appWriter.write(next);
      return next;
    });
  }, [appWriter]);

  const stateRef = useRef(null);
  stateRef.current = state;
  const calcDayRef = useRef(null);
  calcDayRef.current = calcDay;
  /** Недостача/излишек дня в «Расчёте» — пишется прямо в смену этого дня (одна копия). */
  const onCalcAdj = useCallback(
    (v) => {
      const date = calcDateRef.current;
      const day = calcDayRef.current;
      patch((p) => (p ? withCalcDayAdj(p, date, day, v, paydayForDate, uid) : p));
    },
    [patch]
  );

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
      try {
        if (!Number.isInteger(k) || k < 0 || k >= PAYDAYS.length) return;
        Haptics.selectionAsync().catch(() => {});
        patch((p) => (p ? seedPaydays(p, PAYDAYS.slice(Math.max(0, k - 1), k + 2)) : p));
        setPi(k);
      } catch (err) {
        console.warn('page change failed', err);
      }
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

  // ── Пейджер «Смен»: те же правила, что у «Расходов», но смены зарплаты — по её рабочему периоду
  const shiftRange = useMemo(() => (state ? shiftPagerRange(state.shifts, ANCHOR) : null), [state?.shifts]);
  useEffect(() => {
    if (!shiftRange) return;
    shiftLo.value = shiftRange.lo;
    shiftHi.value = shiftRange.hi;
  }, [shiftRange, shiftLo, shiftHi]);
  const onShiftPage = useCallback(
    (k) => {
      try {
        if (!Number.isInteger(k) || k < 0 || k >= PAYDAYS.length) return;
        Haptics.selectionAsync().catch(() => {});
        patch((p) => (p ? seedShiftPaydays(p, PAYDAYS.slice(Math.max(0, k - 1), k + 2)) : p));
        setSi(k);
      } catch (err) {
        console.warn('shift page change failed', err);
      }
    },
    [patch]
  );
  /** Сразу на зарплату k в «Сменах» (переход из «Расчёта», после сохранения смены). */
  const jumpShiftIdx = useCallback(
    (k) => {
      if (!Number.isInteger(k) || k < 0 || k >= PAYDAYS.length) return;
      shiftCur.value = k;
      shiftPos.value = k;
      onShiftPage(k);
    },
    [onShiftPage, shiftCur, shiftPos]
  );
  const shownShiftPay = si != null ? PAYDAYS[si] : null;
  const shiftPages = useMemo(() => {
    if (!state || si == null) return [];
    const out = [];
    for (let k = si - 1; k <= si + 1; k++) {
      if (k < (shiftRange?.lo ?? 0) || k > (shiftRange?.hi ?? PAYDAYS.length - 1)) continue;
      const p = PAYDAYS[k];
      out.push({ k, payday: p, list: shiftsInPeriod(state.shifts, p), carry: carryOf(state, p) });
    }
    return out;
  }, [state?.shifts, state?.carry, si, shiftRange]);
  const pages = useMemo(() => {
    if (!state || pi == null) return [];
    const out = [];
    for (let k = pi - 1; k <= pi + 1; k++) {
      if (k < (range?.lo ?? 0) || k > (range?.hi ?? PAYDAYS.length - 1)) continue;
      const p = PAYDAYS[k];
      // заработано за смены — чистыми (как «К выплате» в «Сменах»): + наставник − недостача − с прошлой зп
      const st = payTotals(state, p);
      out.push({
        k,
        payday: p,
        list: expensesInPeriod(state.expenses, p),
        earned: st.net,
        short: st.short,
        mentor: st.mentor,
      });
    }
    return out;
  }, [state?.expenses, state?.shifts, state?.carry, pi, range]);
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
      try {
        if (piRef.current === pi) goPayIdx(pi + 1);
      } catch (err) {
        console.warn('auto-advance failed', err);
      }
    }, AUTO_NEXT_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownPay, shownMode]);
  const formRefs = useRef({});

  // ── Расчёт → Смены: связанная смена обновляется сама (с задержкой, пока вводят)
  const loadedOnce = !!state;
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

  // «Кастомизация» убрана: акцент всегда стандартный зелёный (старые settings.hue/light и custom.bg в данных игнорируются)
  const accent = ACCENT;
  const accentRef = useRef(accent);
  accentRef.current = accent;

  const openExpense = useCallback((id) => {
    const st = stateRef.current;
    const e = id
      ? st.expenses.find((x) => x.id === id)
      : { date: newExpenseDate(piRef.current), amount: '', title: '' };
    if (!e) return;
    setEditId(id || null);
    setForm({
      date: e.date,
      amount: e.amount != null ? String(e.amount) : '',
      title: e.title || '',
      // новый расход: «Одноразовый» по умолчанию; «Постоянный» — до даты until (по умолчанию через год).
      // существующий: текущий тип и «до» из правила — можно переключить (долгое нажатие / тап)
      rec: id ? isRecurringExpense(st, e) : false,
      wasRec: id ? isRecurringExpense(st, e) : false,
      until: untilOfExpense(st, e, addDays(e.date, 365)),
    });
    setSheet('exp');
  }, []);

  const openShift = useCallback((id, draft) => {
    const st = stateRef.current;
    const s = id ? st.shifts.find((x) => x.id === id) : null;
    setEditId(id || null);
    setForm({
      date: s ? s.date : (draft && draft.date) || newShiftDate(siRef.current),
      amount: s && s.amount != null ? String(s.amount) : '',
      title: s ? s.title : (draft && draft.title) || 'ночь касса',
      linked: isLinkedShift(s),
      shortage: s && adjOf(s) ? String(Math.abs(adjOf(s))) : '',
      surplus: !!s && adjOf(s) < 0,
      place: (s && s.place) || (draft && draft.place) || '',
    });
    setSheet('shift');
  }, []);
  /** Недостача с прошлой зарплаты — на уровне зарплаты p (тап по «Недостаче» в большой карточке). */
  const openCarry = useCallback((p) => {
    const v = carryOf(stateRef.current, p);
    Haptics.selectionAsync().catch(noop);
    setEditId(null);
    setForm({ carryP: p, carry: v ? String(Math.abs(v)) : '', surplus: v < 0 });
    setSheet('carry');
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
      patch((p) => (p ? toggleInState(p, id) : p));
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
      setToast({ k: Date.now(), text: `Перенесено на ${fmtShort(next.date)}`, undo: prev });
    },
    [patch]
  );
  /** «Вернуть» перенесённый расход на прошлую зарплату (тап по «вернуть» на карточке). */
  const returnExpenseNow = useCallback(
    (id) => {
      const st = stateRef.current;
      if (!st) return;
      const { prev, next } = uncarryInState(st, id);
      if (!prev) return;
      patch((p) => uncarryInState(p, id).state);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
      setToast({ k: Date.now(), text: `Возвращено на ${fmtShort(next.date)}`, undo: prev });
    },
    [patch]
  );
  const hideToast = useCallback(() => setToast(null), []);
  // ── Перенос данных: все ключи zp_* одной JSON-строкой через буфер обмена
  const [backupInfo, setBackupInfo] = useState(null); // { summary, size } последней копии
  const copyBackup = useCallback(async () => {
    try {
      // несохранённые +/− расчёта — сначала на диск
      await appWriter.flush();
      if (calcTimer.current) clearTimeout(calcTimer.current);
      calcTimer.current = null;
      const pend = calcPending.current;
      calcPending.current = null;
      if (pend) await AsyncStorage.setItem(CALC_KEY, JSON.stringify(pend));
      const keys = appKeys(await AsyncStorage.getAllKeys());
      const entries = keys.length ? await AsyncStorage.multiGet(keys) : [];
      const text = makeBackup(entries);
      const parsed = parseBackup(text);
      if (!parsed.ok) throw new Error('нечего копировать — данных на этом устройстве нет');
      await Clipboard.setStringAsync(text);
      const sum = parsed.summary;
      setBackupInfo({ summary: sum, size: text.length });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(
        'Скопировано',
        `${fmtSummary(sum)}\n\nОткройте другую версию приложения → ⚙ → «Перенос данных» → «Вставить данные».`
      );
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Не получилось скопировать', String(err?.message || err));
    }
  }, [appWriter]);
  // копия перед последней вставкой (для «Вернуть как было»): { summary, createdAt } или null
  const [prePaste, setPrePaste] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem(PRE_PASTE_KEY)
      .then((t) => {
        const r = t ? parseBackup(t) : null;
        if (r?.ok) setPrePaste({ summary: r.summary, createdAt: r.createdAt });
      })
      .catch(noop);
  }, []);
  // записать копию в хранилище (zp_* ключи), прочитать заново в память
  const applyBackupData = useCallback(
    async (data) => {
      // отложенная запись расчёта не должна перезаписать вставленное
      if (calcTimer.current) clearTimeout(calcTimer.current);
      calcTimer.current = null;
      calcPending.current = null;
      // незаписанное старое состояние не должно лечь поверх вставленного
      await appWriter.flush();
      await calcWriter.flush();
      const { set, remove } = restorePlan(data, await AsyncStorage.getAllKeys());
      await AsyncStorage.multiSet(set);
      if (remove.length) await AsyncStorage.multiRemove(remove);
      await loadAll(); // перечитать в память — без перезапуска
    },
    [loadAll, appWriter, calcWriter]
  );
  const undoPaste = useCallback(async () => {
    let r;
    try {
      const t = await AsyncStorage.getItem(PRE_PASTE_KEY);
      r = t ? parseBackup(t) : null;
    } catch {
      r = null;
    }
    if (!r?.ok) {
      setPrePaste(null);
      return Alert.alert('Нечего возвращать', 'Копии данных до вставки нет.');
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(noop);
    Alert.alert('Вернуть как было?', `Данные до последней вставки: ${fmtSummary(r.summary)}.\n\nТекущие данные будут заменены ими.`, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Вернуть',
        style: 'destructive',
        onPress: async () => {
          try {
            await applyBackupData(r.data);
            await AsyncStorage.removeItem(PRE_PASTE_KEY).catch(noop);
            setPrePaste(null);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
            closeThen(() => setToast({ k: Date.now(), text: `Данные возвращены · ${fmtSummary(r.summary)}` }));
          } catch (err) {
            Alert.alert('Не получилось вернуть', String(err?.message || err));
          }
        },
      },
    ]);
  }, [applyBackupData, closeThen]);
  const pasteBackup = useCallback(async () => {
    let text;
    try {
      text = await Clipboard.getStringAsync();
    } catch {
      text = '';
    }
    const r = parseBackup(text);
    if (!r.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return Alert.alert('Не получилось вставить', r.error);
    }
    const cur = stateRef.current;
    const curSum = summarize({
      zp_app_v1: cur ? JSON.stringify(cur) : undefined,
      zp_calc_v1: calcRef.current ? JSON.stringify(calcRef.current) : undefined,
    });
    const when = r.createdAt ? new Date(r.createdAt) : null;
    const whenTxt =
      when && !isNaN(when) ? `\nКопия от ${when.toLocaleDateString('ru-RU')} ${when.toTimeString().slice(0, 5)}` : '';
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert(
      'Заменить данные?',
      `В копии: ${fmtSummary(r.summary)}.${whenTxt}\n\nСейчас на этом устройстве: ${fmtSummary(curSum)} — они будут ЗАМЕНЕНЫ копией.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Заменить',
          style: 'destructive',
          onPress: async () => {
            try {
              // сначала — копия того, что есть сейчас (чтобы вставку можно было отменить)
              const pend = calcPending.current;
              if (pend) await AsyncStorage.setItem(CALC_KEY, JSON.stringify(pend));
              await appWriter.flush();
              const keys = appKeys(await AsyncStorage.getAllKeys());
              const entries = keys.length ? await AsyncStorage.multiGet(keys) : [];
              const before = makeBackup(entries);
              const pb = parseBackup(before);
              if (pb.ok) {
                await AsyncStorage.setItem(PRE_PASTE_KEY, before);
                setPrePaste({ summary: pb.summary, createdAt: pb.createdAt });
              }
              await applyBackupData(r.data);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              closeThen(() => setToast({ k: Date.now(), text: `Данные перенесены · ${fmtSummary(r.summary)}` }));
            } catch (err) {
              Alert.alert('Не получилось вставить', String(err?.message || err));
            }
          },
        },
      ]
    );
  }, [applyBackupData, closeThen, appWriter]);
  const undoToast = useCallback(() => {
    const prev = toast?.undo;
    setToast(null);
    if (!prev) return;
    patch((p) => (prev.kind ? restoreRemoved(p, prev) : undoCarry(p, prev)));
    Haptics.selectionAsync().catch(noop);
  }, [toast, patch]);
  // выбор в веере: 0 ✓, 1 → перенести, 2 без отметки
  const onArcPick = useCallback(
    (id, i) => {
      try {
        if (i === 1) return carryExpenseNow(id);
        Haptics.selectionAsync().catch(() => {});
        setStatusDirect(id, i === 0 ? 'paid' : null);
      } catch (err) {
        console.warn('status pick failed', err);
      }
    },
    [carryExpenseNow, setStatusDirect]
  );
  const arc = useArcCtl(onArcPick);

  const confirmDeleteExpense = useCallback(
    (id) => {
      const e = stateRef.current.expenses.find((x) => x.id === id);
      if (!e) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(noop);
      const what = `${e.title || 'Без названия'} · ${fmtShort(e.date)} · ${money(Number(e.amount) || 0)} сом`;
      const removeOne = () => {
        const { undo } = removeExpense(stateRef.current, id);
        patch((p) => removeExpense(p, id).app);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(noop);
        if (undo) setToast({ k: Date.now(), text: 'Расход удалён', undo });
      };
      if (isSeries(stateRef.current, e)) {
        // постоянный / повторяющийся (в т.ч. старый или из импорта): выбор «Только этот» или «Этот и следующие»
        const n = seriesToRemove(stateRef.current, id).length;
        Alert.alert(
          'Удалить постоянный платёж?',
          `${what}\n${n > 1 ? `Дальше есть такие же неоплаченные: ${n - 1}.` : 'Дальше таких же пока нет.'} Оплаченные останутся.`,
          [
            {
              text: n > 1 ? `Этот и следующие (${n})` : 'Удалить и не повторять',
              style: 'destructive',
              onPress: () => {
                const { undo } = removeSeries(stateRef.current, id);
                patch((p) => removeSeries(p, id).app);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(noop);
                if (undo) setToast({ k: Date.now(), text: n > 1 ? `Удалено: ${n}` : 'Расход удалён', undo });
              },
            },
            { text: 'Только этот', onPress: removeOne },
            { text: 'Отмена', style: 'cancel' },
          ]
        );
        return;
      }
      Alert.alert('Удалить расход?', what, [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            const { undo } = removeExpense(stateRef.current, id);
            patch((p) => removeExpense(p, id).app);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(noop);
            if (undo) setToast({ k: Date.now(), text: 'Расход удалён', undo });
          },
        },
      ]);
    },
    [patch]
  );

  const confirmDeleteShift = useCallback(
    (id) => {
      const s = stateRef.current.shifts.find((x) => x.id === id);
      if (!s) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(noop);
      if (isLinkedShift(s)) {
        const date = linkKey(s);
        Alert.alert(
          'Смена из расчёта',
          `Она считается по «Расчёту» за ${fmtShort(keyDate(date))}${keySlot(date) > 1 ? ` (смена ${keySlot(date)})` : ''}. Чтобы убрать смену, сбросьте этот расчёт.`,
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
      const what = `${fmtShort(s.date)} · ${s.title || 'смена'}${s.amount != null && s.amount !== '' ? ` · ${money(Number(s.amount) || 0)} сом` : ''}`;
      Alert.alert('Убрать день?', what, [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Убрать',
          style: 'destructive',
          onPress: () => {
            const { undo } = removeShift(stateRef.current, id);
            patch((p) => removeShift(p, id).app);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(noop);
            if (undo) setToast({ k: Date.now(), text: 'Смена убрана', undo });
          },
        },
      ]);
    },
    [patch, patchCalc]
  );

  /** Открыть «Расчёт» на дате (и номере смены дня) связанной смены; key — calcKey или просто дата. */
  const openCalcOn = useCallback((key) => {
    Haptics.selectionAsync().catch(noop);
    setCalcDateRaw(keyDate(key));
    setCalcSlot(keySlot(key));
    goPage(2);
  }, [goPage]);

  // стабильные пропсы страниц пейджеров: memo(PayPage/ShiftPage) не перерисовываются от каждого рендера App
  // ── Чек зарплаты: анимация «принтера» → «Скачать» = PDF (expo-print) → системное «Сохранить в Файлы / Поделиться»
  const printerRef = useRef(null);
  const [exportP, setExportP] = useState(null); // зарплата чека, если нажали не на показанной (редко)
  const exportPRef = useRef(null);
  const openExportMenu = useCallback((p, origin) => {
    if (!p) return;
    Haptics.selectionAsync().catch(noop);
    exportPRef.current = p;
    const shown = siRef.current != null ? PAYDAYS[siRef.current] : null;
    if (p === shown) {
      printerRef.current?.open(origin);
      return;
    }
    // чек другой зарплаты: сначала отрисовать его скрыто, потом печатать
    setExportP(p);
    requestAnimationFrame(() => requestAnimationFrame(() => printerRef.current?.open(origin)));
  }, []);
  const onPrinterClosed = useCallback(() => setExportP(null), []);
  /** Копия временного файла под понятным именем («Зарплата_15.10.2026.pdf»), латиницей — если кириллица не прошла. */
  const namedCopy = useCallback((uri, r, ext, latin) => {
    const src = new File(uri);
    const dest = new File(Paths.cache, exportFileName(r, ext, latin));
    if (dest.exists) dest.delete();
    src.copySync(dest);
    return dest.uri;
  }, []);
  const shareFile = useCallback(
    async (uri, mimeType, UTI, r, ext) => {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Не получилось', 'На этом устройстве нельзя поделиться файлом.');
        return;
      }
      const opts = { mimeType, UTI, dialogTitle: 'Скачать чек (PDF)' };
      let named = null;
      try {
        named = namedCopy(uri, r, ext, false);
        await Sharing.shareAsync(named, opts);
        return;
      } catch {
        // кириллица в имени не прошла — латиница, а в крайнем случае исходный временный файл
      }
      try {
        named = namedCopy(uri, r, ext, true);
      } catch {
        named = uri;
      }
      await Sharing.shareAsync(named, opts);
    },
    [namedCopy]
  );
  /** «Скачать»: чек закрывается обратно в принтер, затем PDF из того же отчёта → системный лист сохранения. */
  const downloadPdf = useCallback(() => {
    const p = exportPRef.current;
    if (!p) return;
    const r = payReport(stateRef.current, p, calcRef.current);
    const html = reportHtml(r, accentRef.current);
    const run = async () => {
      try {
        const { uri } = await Print.printToFileAsync({ html });
        await shareFile(uri, 'application/pdf', 'com.adobe.pdf', r, 'pdf');
      } catch (e) {
        Alert.alert('PDF не сохранён', String(e?.message || e));
      }
    };
    if (printerRef.current) printerRef.current.close(run);
    else run();
  }, [shareFile]);
  // чек для принтера готовится заранее: отчёт и карточка показанной зарплаты, пока открыта вкладка «Смены»
  const printP = exportP || shownShiftPay;
  const printR = useMemo(() => (state && printP ? payReport(state, printP, calc) : null), [state, printP, calc]);
  const printCard = useMemo(() => (printR ? <ExportCard r={printR} accent={accent} /> : null), [printR, accent]);

  const payPageProps = useMemo(
    () => ({ accent, onEdit: openExpense, onToggle: toggleStatus, onReturn: returnExpenseNow, onAdd: () => openExpense(null), arc }),
    [accent, openExpense, toggleStatus, returnExpenseNow, arc]
  );
  const shiftPageProps = useMemo(
    () => ({ accent, onEdit: openShift, onCalc: openCalcOn, onCarry: openCarry, onExport: openExportMenu, onAdd: () => openShift(null) }),
    [accent, openShift, openCalcOn, openCarry, openExportMenu]
  );

  if (!state) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#fff' }}>Загрузка…</Text>
      </View>
    );
  }

  const openCalcRates = () => {
    setForm({ rates: Object.fromEntries(RATE_FIELDS.map(([k]) => [k, rateStr(k, calc.rates[k])])) });
    setSheet('calcRates');
  };
  const saveCalcRates = () => {
    const fr = form.rates || {};
    patchCalc((p) => ({
      ...p,
      rates: Object.fromEntries(RATE_FIELDS.map(([k]) => [k, rateNum(fr[k])])),
    }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
    setSheet(null);
  };
  const resetCalc = () => {
    const date = calcKeyNow;
    const n = calcSlot;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(noop);
    Alert.alert(
      'Сбросить расчёт?',
      `Все подсчёты за ${fmtShort(calcDate)}${n > 1 ? ` (смена ${n})` : ''} будут удалены, смена «из расчёта» уберётся из «Смен».`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сбросить',
          style: 'destructive',
          onPress: () => {
            patchCalc((p) => {
              if (!p.days[date]) return p;
              const days = { ...p.days };
              delete days[date];
              return { ...p, days };
            });
            if (n > 1) setCalcSlot(1);
          },
        },
      ]
    );
  };
  const linkedOnCalcDate = state.shifts.find((s) => isLinkedShift(s) && linkKey(s) === calcKeyNow) || null;
  const manualOnCalcDate = state.shifts.some(
    (s) => !isLinkedShift(s) && s.date === calcDate && s.amount != null && s.amount !== ''
  );
  /** Перейти в «Смены» на страницу зарплаты связанной смены. */
  const showCalcShift = () => {
    Haptics.selectionAsync().catch(noop);
    const k = PAYDAYS.indexOf(shiftPayday(calcDate));
    goPage(1);
    if (k >= 0) requestAnimationFrame(() => jumpShiftIdx(k));
  };

  /** «Импорт PDF»: выбрать отчёт продаж → текст PDF (чистый JS) → позиции → шторка с проверкой. */
  const importPdf = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets || !res.assets[0]) return;
      const a = res.assets[0];
      const bytes = await new File(a.uri).bytes();
      const imp = buildImport(pdfLines(bytes));
      if (!imp.calc.length && !imp.drinks.length && !imp.coffee.length && !imp.unknown.length) {
        Alert.alert('Ничего не нашлось', 'В PDF нет строк вида «название — количество».');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
      setPdfImp({ ...imp, file: a.name || 'PDF' });
      setSheet('pdfImp');
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(noop);
      Alert.alert('Не получилось прочитать PDF', String(e?.message || e));
    }
  };
  /**
   * Количества из отчёта → расчёт текущей даты (заменяются, не прибавляются): позиции кассы, «… 350» →
   * «Зерн.кофе», напитки / соусы / одноразовые стаканы → строки «Расхода».
   */
  const applyPdfImport = () => {
    if (!pdfImp) return;
    const counts = calcCountsFromImport(pdfImp);
    const ids = Object.keys(counts);
    patchDay((d) => {
      const next = { ...d.counts };
      for (const id of ids) next[id] = [counts[id]];
      return { ...d, counts: next };
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
    setToast({ k: Date.now(), text: `Добавлено в расчёт: ${ids.length} поз.` });
    setPdfImp(null);
    setSheet(null);
  };
  calcH.current = { openRates: openCalcRates, reset: resetCalc, showShift: showCalcShift, importPdf };

  const saveExpense = () => {
    const amount = Number(form.amount) || 0;
    const title = (form.title || '').trim();
    const { date } = form;
    // пустой расход (ни суммы, ни названия) не сохраняем — подсказываем, что вписать
    if (!amount && !title) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(noop);
      setForm((f) => ({ ...f, err: 'Впишите сумму или за что этот расход' }));
      return;
    }
    patch((prev) => {
      const expenses = [...prev.expenses];
      if (editId) {
        const fields = { date, amount, title, untilDate: form.until };
        // одноразовый → постоянный: правило «каждое это число до»; соседние зарплаты досеваем сразу
        if (form.rec && !form.wasRec) {
          const k = piRef.current ?? 0;
          return seedPaydays(makeRecurring(prev, editId, fields, uid), PAYDAYS.slice(Math.max(0, k - 1), k + 2));
        }
        // постоянный → одноразовый: будущие неоплаченные убираются, правило снимается
        if (!form.rec && form.wasRec) return makeOneTime(prev, editId, fields);
        if (form.rec) return editRecurring(prev, editId, fields);
        const i = expenses.findIndex((x) => x.id === editId);
        if (i >= 0) {
          const { type: _oldType, ...rest } = expenses[i];
          expenses[i] = { ...rest, date, amount, title, edited: true };
        }
      } else if (form.rec) {
        // постоянный: первый расход на эту дату + правило «каждое это число до until»
        return addRecurring(prev, { date, amount, title, untilDate: form.until }, uid);
      } else {
        expenses.push({ id: uid(), date, amount, title, status: null });
      }
      return { ...prev, expenses };
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
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
          shifts[i] = withPlace(
            withShortage(
              {
                ...dropAuto(shifts[i]),
                date,
                amount,
                title: title || 'ночь касса',
                payday: p.payday,
              },
              adjFromForm(form)
            ),
            form.place
          );
      } else {
        removed = removed.filter((x) => x !== date);
        shifts.push(
          withPlace(
            withShortage(
              {
                id: uid(),
                date,
                amount,
                title: title || 'ночь касса',
                payday: p.payday,
              },
              adjFromForm(form)
            ),
            form.place
          )
        );
      }
      return { ...prev, shifts, removed };
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
    // смена ушла в другую зарплату — показать её там
    const k = PAYDAYS.indexOf(shiftPayday(date));
    if (page === 1 && k >= 0 && k !== siRef.current) closeThen(() => jumpShiftIdx(k));
    else setSheet(null);
  };

  /** Недостача смены из «Расчёта»: сумма считается там, недостача — своя, здесь. */
  const saveShortage = () => {
    const id = editId;
    const v = adjFromForm(form);
    patch((prev) => ({ ...prev, shifts: prev.shifts.map((x) => (x.id === id ? withShortage(x, v) : x)) }));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
    setSheet(null);
  };

  const saveCarry = () => {
    const p = form.carryP;
    const v = adjFromForm(form, 'carry');
    if (!p) return setSheet(null);
    patch((prev) => withCarry(prev, p, v));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
    setSheet(null);
  };

  const paid = state.expenses.filter((e) => displayStatus(e) === 'paid');
  const spent = paid.reduce((a, e) => a + Number(e.amount || 0), 0);
  // заработано за всё время — чистыми, после недостачи (как «К выплате» в «Сменах»)
  // + наставник − недостача по сменам − недостача с прошлой зп (излишек не считается — его забирает работодатель)
  const carryAll = Object.values(state.carry || {}).reduce((a, v) => a + carryDue(v), 0); // депонирование: > 0 минус, < 0 плюс
  const earnedAll = state.shifts.reduce((a, s) => a + shiftNet(s), 0) - carryAll;
  const shortAll = state.shifts.reduce((a, s) => a + shortageOf(s), 0);
  const mentorAll = state.shifts.reduce((a, s) => a + mentorOf(s), 0);
  const bonusLossAll = state.shifts.reduce((a, s) => a + bonusLossOf(s), 0);

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
      Haptics.selectionAsync().catch(noop);
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
  /** С какой даты режим меняет автосмены: начало периода смен, в который попадает сегодня. */
  const modeFrom = () => workPeriod(paydayOnOrBefore(addDays(todayIso(), 20))).start;
  /**
   * «Учёба / Работа»: раньше переключение только ДОСЕВАЛО смены (и только в стартовом месяце),
   * поэтому при возврате на «Учёбу» лишние будни оставались. Теперь нетронутые автосмены
   * с начала текущего периода приводятся к шаблону режима; правленые не трогаются.
   */
  const switchMode = (mode) => {
    Haptics.selectionAsync().catch(noop);
    patch((p) => applyMode(p, mode, modeFrom()));
  };
  const openTemplates = () => {
    Haptics.selectionAsync().catch(noop);
    setForm({ tplMode: state.settings.mode === 'work' ? 'work' : 'study', tplDay: null });
    setSheet('tpl');
  };
  /** Правка шаблона; если это шаблон текущего режима — сразу применяем к нетронутым автосменам. */
  const patchTemplate = (fn) => {
    patch((p) => {
      const next = fn(p);
      const cur = p.settings.mode === 'work' ? 'work' : 'study';
      return form.tplMode === cur ? applyMode(next, cur, modeFrom()) : next;
    });
  };
  const closeSheet = () => setSheet(null);

  // ── «+»: на «Расходах» — меню у кнопки, на других вкладках — прежняя шторка
  const closeAddMenu = () => setAddMenu(null);
  const onPlus = () => {
    if (page === 3) return bankApi.current?.importFiles?.();
    if (page !== 0 && page !== 1) return setSheet('add');
    const v = addBtnRef.current;
    if (!v || typeof v.measureInWindow !== 'function') return setSheet('add');
    try {
      v.measureInWindow((x, y, w, h) => {
        if ([x, y, w, h].every(Number.isFinite)) {
          setMenuPage(page);
          setAddMenu({ x, y, w, h });
        }
        else setSheet('add');
      });
    } catch (err) {
      console.warn('measure + failed', err);
      setSheet('add');
    }
  };
  const openNotes = () => {
    setNotes({ text: '', parsed: null });
    setImpReplace(true);
    setImpAll(false);
    setSheet('notes');
  };
  const openShiftNotes = () => {
    setShNotes({ text: '', parsed: null });
    setImpClear(true);
    setSheet('shiftNotes');
  };
  const repeatDraft = menuPage === 1 && si != null ? repeatShiftDraft(state.shifts, PAYDAYS[si], newShiftDate(si), todayIso()) : null;
  const openFind = (kind) => {
    setAddMenu(null);
    setFind((f) => ({ q: f.kind === kind ? f.q : '', kind }));
    setSheet('find');
  };
  const findItem = {
    icon: 'search',
    title: 'Поиск',
    sub: 'по названию, месту или сумме',
    onPress: () => openFind(menuPage === 1 ? 'shift' : 'expense'),
  };
  const shiftAddItems = [
    {
      icon: 'plus',
      title: 'Новая смена',
      sub: 'в показанную зарплату',
      onPress: () => {
        setAddMenu(null);
        openShift(null);
      },
    },
    ...(repeatDraft
      ? [
          {
            icon: 'history',
            title: 'Как прошлая смена',
            sub: `${repeatDraft.title}${repeatDraft.place ? ` · ${repeatDraft.place}` : ''} · ${fmtShort(repeatDraft.date)}`,
            onPress: () => {
              setAddMenu(null);
              openShift(null, repeatDraft);
            },
          },
        ]
      : []),
    {
      icon: 'document',
      title: 'Импорт из заметок',
      sub: 'вставить текст или «Мои смены»',
      onPress: () => {
        setAddMenu(null);
        openShiftNotes();
      },
    },
    findItem,
  ];
  const addItems = [
    {
      icon: 'plus',
      title: 'Новый расход',
      sub: 'в показанную зарплату',
      onPress: () => {
        setAddMenu(null);
        openExpense(null);
      },
    },
    {
      icon: 'document',
      title: 'Импорт из заметок',
      sub: 'вставить текст или годовой план',
      onPress: () => {
        setAddMenu(null);
        openNotes();
      },
    },
    findItem,
  ];
  /** Сразу на нужную зарплату (без пружины через десятки страниц). */
  const jumpPayIdx = (k) => {
    if (!Number.isInteger(k) || k < 0 || k >= PAYDAYS.length) return;
    pageCur.value = k;
    pagePos.value = k;
    onPage(k);
  };
  const KIND_TAG = {
    add: 'добавить',
    markPaid: 'отметить ✓',
    replace: 'заменить',
    same: 'уже есть',
    keep: 'оставить',
  };
  /**
   * Общее превью импорта (Настройки «Импорт плана» и «Импорт из заметок»): по месяцам,
   * что заменится / отметится, «Не распознано», предупреждение об автодобавленных, кнопка.
   */
  const importBody = ({ blocks, unparsed = [], planId = null, label }) => {
    const pv = previewImport(state, blocks, { replace: impReplace });
    const addN = pv.add.length;
    const addSum = pv.add.reduce((a, x) => a + x.amount, 0);
    const paidN = pv.add.filter((x) => x.paid).length;
    const total = pv.lines.reduce((a, r) => a + r.plan.amount, 0);
    const left = autoAddedLeft(state, pv);
    const similar = [...pv.replace, ...pv.keep];
    const near = pv.lines.filter((r) => r.kind === 'add' && r.near);
    const noName = pv.add.filter((x) => !x.title);
    const n = pv.changes;
    const word = (k) => (k % 10 === 1 && k % 100 !== 11 ? 'строка' : [2, 3, 4].includes(k % 10) && ![12, 13, 14].includes(k % 100) ? 'строки' : 'строк');
    const confirm = () => {
      if (!n) return;
      const parts = [
        addN ? `добавить ${addN}` : null,
        pv.markPaid.length ? `отметить оплаченными ${pv.markPaid.length}` : null,
        pv.replace.length ? `заменить ${pv.replace.length}` : null,
      ].filter(Boolean);
      Alert.alert(label, `${parts.join(', ')}?`, [
        { text: 'Отмена', style: 'cancel' },
        {
          text: addN ? `Добавить ${n}` : 'Применить',
          onPress: () => {
            const replace = impReplace;
            const changed = pv.lines.filter((r) => r.kind !== 'same' && r.kind !== 'keep').map((r) => r.plan.payday);
            patch((p) => seedMonth(applyImport(p, blocks, uid, planId, undefined, { replace }), viewY, viewM));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
            // к зарплате с изменениями: ближайшая с сегодняшней, иначе последняя
            const cur = paydayOnOrBefore(todayIso());
            const ps = [...new Set(changed)].sort();
            const target = ps.find((x) => x >= cur) || ps[ps.length - 1];
            closeThen(() => {
              goPage(0);
              const k = PAYDAYS.indexOf(target);
              if (k >= 0) requestAnimationFrame(() => jumpPayIdx(k));
            });
          },
        },
      ]);
    };
    return (
      <>
        <ItemCard style={[styles.listCard, styles.padCard]}>
          <Text style={styles.k}>{n ? 'Будет изменено' : 'Всё уже в приложении'}</Text>
          <Text style={[styles.bigPay, { marginTop: 4, color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
            {pv.lines.length} {word(pv.lines.length)} · {money(total)} сом
          </Text>
          <Text style={styles.calcMeta}>
            добавить {addN}
            {addN ? ` (${money(addSum)} сом, ${paidN} ✓)` : ''} · отметить оплаченным {pv.markPaid.length} · заменить{' '}
            {pv.replace.length} · уже есть {pv.same.length + pv.keep.length}
          </Text>
        </ItemCard>
        {left.length > 0 && (
          <Pressable
            style={({ pressed }) => [styles.warnCard, pressed && styles.rowPressed]}
            onPress={() => {
              Haptics.selectionAsync().catch(noop);
              setSheet('cleanup');
            }}
          >
            <Text style={styles.warnTxt}>
              В приложении {left.length} автодобавленных платежей (старые «постоянные»), которых нет в заметке, — из-за
              них итоги могут не совпасть.
            </Text>
            <Text style={[styles.warnLink, { color: accent }]}>Удалить автодобавленные ›</Text>
          </Pressable>
        )}
        {unparsed.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Не распознано · {unparsed.length}</Text>
            <ItemCard style={styles.listCard}>
              {unparsed.map((u, i) => (
                <View key={i} style={[styles.lRow, i < unparsed.length - 1 && styles.lRowSep]}>
                  <Text style={[styles.lSub, styles.unparsedTxt]}>{String(u.text ?? u)}</Text>
                </View>
              ))}
            </ItemCard>
            <Text style={styles.hint}>Эти строки не будут добавлены — поправьте их в тексте, если это расходы.</Text>
          </>
        )}
        <Text style={styles.sectionLabel}>По зарплатам</Text>
        <ItemCard style={styles.listCard}>
          {pv.months.length === 0 && <Text style={styles.empty}>Нет строк с датой и суммой</Text>}
          {pv.months.map((k, i) => {
            const m = pv.byMonth[k];
            const bits = [
              m.add - m.replace ? `+${m.add - m.replace}` : null,
              m.mark ? `✓ ${m.mark}` : null,
              m.replace ? `заменить ${m.replace}` : null,
              m.skip ? `уже есть ${m.skip}` : null,
            ].filter(Boolean);
            return (
              <View key={k} style={[styles.lRow, i < pv.months.length - 1 && styles.lRowSep]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lTitle}>{monthTitle(k)}</Text>
                  <Text style={styles.lSub}>{bits.join(' · ')}</Text>
                </View>
                <Text style={[styles.lVal, !m.add && !m.mark && { opacity: 0.4 }]}>{money(m.sum)}</Text>
              </View>
            );
          })}
        </ItemCard>
        {similar.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Похожие старые платежи</Text>
            <ItemCard style={styles.listCard}>
              <Pressable
                style={[styles.lRow, styles.lRowSep]}
                onPress={() => {
                  Haptics.selectionAsync().catch(noop);
                  setImpReplace((v) => !v);
                }}
              >
                <View style={[styles.checkBox, impReplace && { backgroundColor: accent, borderColor: accent }]}>
                  {impReplace && <AppIcon name="check" size={16} variant="glyph" color="#102012" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lTitle}>Заменить строкой из заметки</Text>
                  <Text style={styles.lSub}>старые неоплаченные «постоянные» с другой суммой или датой</Text>
                </View>
              </Pressable>
              {similar.map((d, i) => (
                <View key={i} style={[styles.lRow, i < similar.length - 1 && styles.lRowSep]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lTitle}>
                      {fmtShort(d.plan.date)} · {d.plan.title || 'Без названия'}
                    </Text>
                    <Text style={styles.lSub}>
                      в заметке {money(d.plan.amount)}
                      {d.plan.paid ? ' ✅' : ''}, в приложении {money(d.existing.amount)}
                      {d.existing.date !== d.plan.date ? ` (${fmtShort(d.existing.date)})` : ''}
                    </Text>
                  </View>
                  <Text style={styles.impTag}>{KIND_TAG[d.kind]}</Text>
                </View>
              ))}
            </ItemCard>
          </>
        )}
        {pv.markPaid.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Отметить оплаченным · {pv.markPaid.length}</Text>
            <ItemCard style={styles.listCard}>
              {pv.markPaid.map((d, i) => (
                <View key={i} style={[styles.lRow, i < pv.markPaid.length - 1 && styles.lRowSep]}>
                  <Text style={[styles.lTitle, { flex: 1 }]} numberOfLines={1}>
                    {fmtShort(d.plan.date)} · {d.plan.title || 'Без названия'}
                  </Text>
                  <Text style={styles.lVal}>{money(d.plan.amount)}</Text>
                </View>
              ))}
            </ItemCard>
          </>
        )}
        {near.length > 0 && (
          <Text style={styles.hint}>
            Добавятся рядом с уже введёнными (другая сумма):{' '}
            {near.map((r) => `${fmtShort(r.plan.date)} ${r.plan.title} ${money(r.plan.amount)} (есть ${money(r.near.amount)})`).join(', ')}
          </Text>
        )}
        {noName.length > 0 && (
          <Text style={styles.hint}>
            Без названия: {noName.map((x) => `${fmtShort(x.date)} — ${money(x.amount)}`).join(', ')}
          </Text>
        )}
        {pv.lines.length > 0 && (
          <Pressable onPress={() => setImpAll((v) => !v)} hitSlop={12}>
            <Text style={[styles.link, styles.showAll, { color: accent }]}>
              {impAll ? 'Скрыть строки' : `Все строки (${pv.lines.length})`}
            </Text>
          </Pressable>
        )}
        {impAll && (
          <ItemCard style={styles.listCard}>
            {pv.lines.map((r, i) => (
              <View key={i} style={[styles.lRow, i < pv.lines.length - 1 && styles.lRowSep]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.lTitle} numberOfLines={1}>
                    {r.plan.title || 'Без названия'}
                    {r.plan.paid ? ' ✅' : ''}
                  </Text>
                  <Text style={styles.lSub}>
                    {fmtShort(r.plan.date)} · {money(r.plan.amount)} сом
                  </Text>
                </View>
                <Text style={[styles.impTag, (r.kind === 'same' || r.kind === 'keep') && { opacity: 0.5 }]}>
                  {KIND_TAG[r.kind]}
                </Text>
              </View>
            ))}
          </ItemCard>
        )}
        <ScaleButton style={[styles.actBtn, { backgroundColor: accent }, !n && { opacity: 0.45 }]} onPress={confirm}>
          <Text style={[styles.actBtnTxt, styles.onAccent]}>
            {!n ? 'Всё уже добавлено' : addN ? `Добавить ${n}` : `Применить ${n}`}
          </Text>
        </ScaleButton>
      </>
    );
  };

  /**
   * Поле «Недостача / Излишек» с переключателем −/+ (смена).
   * Сумму смены не меняет: недостача минусуется из итога зарплаты; излишек — только для сведения
   * (красный, в зарплату не идёт). Недостача < 500 — зелёная, ≥ 500 — красная.
   */
  const adjField = (kb, { key = 'shortage', note, label, segs, pm } = {}) => {
    const plus = !!form.surplus;
    const v = form[key] || '';
    const setPlus = (on) => {
      Haptics.selectionAsync().catch(noop);
      setForm((f) => ({ ...f, surplus: on }));
    };
    if (pm) {
      // компактно: подпись = текущий выбор, справа от суммы −/+ (минус красный, плюс зелёный)
      const tone = plus ? styles.good : styles.bad;
      return (
        <View style={styles.field}>
          <Text style={[styles.label, v ? tone : null]}>{plus ? 'Излишек' : 'Недостача'}</Text>
          <View style={styles.bigField}>
            <Text style={[styles.adjSign, v ? tone : styles.amtDim]}>{plus ? '+' : '−'}</Text>
            <TextInput
              {...kb.props}
              style={[styles.bigInput, { fontSize: 26 }, !!v && tone]}
              keyboardType="number-pad"
              value={v}
              onChangeText={(t) => setForm((f) => ({ ...f, [key]: t.replace(/[^0-9]/g, '') }))}
              placeholder="0"
              placeholderTextColor="rgba(235,235,245,0.25)"
            />
            <View style={styles.pmRow}>
              <Pressable
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Недостача"
                accessibilityState={{ selected: !plus }}
                style={[styles.pmBtn, !plus ? styles.pmMinusOn : null]}
                onPress={() => setPlus(false)}
              >
                <Text style={[styles.pmTxt, { color: !plus ? '#fff' : '#ff453a' }]}>−</Text>
              </Pressable>
              <Pressable
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Излишек"
                accessibilityState={{ selected: plus }}
                style={[styles.pmBtn, plus ? styles.pmPlusOn : null]}
                onPress={() => setPlus(true)}
              >
                <Text style={[styles.pmTxt, { color: plus ? '#0b2a14' : '#30d158' }]}>+</Text>
              </Pressable>
            </View>
          </View>
          {kb.bar}
        </View>
      );
    }
    const tone = plus || shortTone(v) === 'bad' ? styles.bad : styles.good;
    return (
      <View style={styles.field}>
        <View style={styles.adjHead}>
          <Text style={styles.label}>{label || (plus ? 'Излишек' : 'Недостача')}</Text>
          <View style={styles.adjSeg}>
            {(segs || [
              [false, '− недостача'],
              [true, '+ излишек'],
            ]).map(([on, lab]) => (
              <Pressable
                key={lab}
                hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityState={{ selected: plus === on }}
                style={[styles.adjBtn, plus === on && styles.adjBtnMinus]}
                onPress={() => setPlus(on)}
              >
                <Text style={[styles.adjBtnTxt, plus === on && styles.bad]}>{lab}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.bigField}>
          <Text style={[styles.adjSign, v ? tone : styles.amtDim]}>{plus ? '+' : '−'}</Text>
          <TextInput
            {...kb.props}
            style={[styles.bigInput, { fontSize: 26 }, !!v && tone]}
            keyboardType="number-pad"
            value={v}
            onChangeText={(t) => setForm((f) => ({ ...f, [key]: t.replace(/[^0-9]/g, '') }))}
            placeholder="0"
            placeholderTextColor="rgba(235,235,245,0.25)"
          />
          <Text style={styles.bigUnit}>сом</Text>
        </View>
        {kb.bar}
        {note ? <Text style={styles.fieldNote}>{note}</Text> : null}
      </View>
    );
  };

  const SH_KIND = { add: 'добавить', shortage: 'обновить недостачу', update: 'обновить', same: 'уже есть' };
  const adjTxt = (a) => (a > 0 ? `недостача −${money(a)}` : a < 0 ? `излишек ${money(-a)}` : '');
  /** Действие строки превью: «добавить · наставник +300», «обновить недостачу · −58». */
  const impAction = (r) => {
    const bits = [SH_KIND[r.kind]];
    if (r.kind !== 'same') {
      if (r.p.mentor && (r.kind === 'add' || (r.patch && r.patch.mentor))) bits.push(`наставник +${money(r.p.mentor)}`);
      if (r.p.adj && (r.kind === 'add' || (r.patch && r.patch.shortage))) bits.push(`−${money(r.p.adj)}`);
    }
    return bits.join(' · ');
  };
  /** Превью импорта смен: по зарплатам, каждая строка с действием, «Не распознано», кнопка. */
  const shiftImportBody = (P) => {
    const pv = previewShiftImport(state, P, { clear: impClear });
    const n = pv.changes;
    const adds = pv.rows.filter((r) => r.kind === 'add').length;
    const upds = pv.rows.filter((r) => r.kind === 'shortage' || r.kind === 'update').length;
    const same = pv.rows.filter((r) => r.kind === 'same').length;
    const carryAdd = pv.carry.filter((c) => c.kind === 'add').length;
    const confirm = () => {
      if (!n) return;
      const parts = [
        adds ? `добавить ${adds}` : null,
        upds ? `обновить ${upds}` : null,
        carryAdd ? `депонирование ${carryAdd}` : null,
        pv.clear.length ? `убрать пустых ${pv.clear.length}` : null,
      ].filter(Boolean);
      Alert.alert('Импорт смен', `${parts.join(', ')}?`, [
        { text: 'Отмена', style: 'cancel' },
        {
          text: `Применить ${n}`,
          onPress: () => {
            const clear = impClear;
            patch((p) => applyShiftImport(p, P, uid, { clear }));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
            // к зарплате с изменениями: ближайшая с сегодняшней, иначе последняя
            const up = upcomingPayday(todayIso());
            const ps = pv.paydays.filter((g) => g.add || g.upd || g.clear || pv.carry.some((c) => c.payday === g.payday && c.kind === 'add')).map((g) => g.payday);
            const target = ps.find((x) => x >= up) || ps[ps.length - 1];
            closeThen(() => {
              goPage(1);
              const k = PAYDAYS.indexOf(target);
              if (k >= 0) requestAnimationFrame(() => jumpShiftIdx(k));
            });
          },
        },
      ]);
    };
    return (
      <>
        <ItemCard style={[styles.listCard, styles.padCard]}>
          <Text style={styles.k}>{n ? 'Будет изменено' : 'Всё уже в приложении'}</Text>
          <Text style={[styles.bigPay, { marginTop: 4, color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
            {pv.rows.length} {plural(pv.rows.length, 'смена', 'смены', 'смен')}
          </Text>
          <Text style={styles.calcMeta}>
            добавить {adds} · обновить {upds} · уже есть {same}
            {pv.carry.length ? ` · депонирование ${pv.carry.length}` : ''}
          </Text>
        </ItemCard>
        {(P.warnings || []).length > 0 && (
          <View style={styles.warnCard}>
            {P.warnings.map((w, i) => (
              <Text key={i} style={styles.warnTxt}>
                {w}
              </Text>
            ))}
          </View>
        )}
        {(P.unparsed || []).length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Не распознано · {P.unparsed.length}</Text>
            <ItemCard style={styles.listCard}>
              {P.unparsed.map((u, i) => (
                <View key={i} style={[styles.lRow, i < P.unparsed.length - 1 && styles.lRowSep]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lSub, styles.unparsedTxt]}>{u.text}</Text>
                    {u.why ? <Text style={styles.lSub}>{u.why}</Text> : null}
                  </View>
                </View>
              ))}
            </ItemCard>
          </>
        )}
        {pv.clear.length > 0 && (
          <ItemCard style={styles.listCard}>
            <Pressable
              style={styles.lRow}
              onPress={() => {
                Haptics.selectionAsync().catch(noop);
                setImpClear((v) => !v);
              }}
            >
              <View style={[styles.checkBox, impClear && { backgroundColor: accent, borderColor: accent }]}>
                {impClear && <AppIcon name="check" size={16} variant="glyph" color="#102012" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.lTitle}>Убрать пустые заготовки · {pv.clear.length}</Text>
                <Text style={styles.lSub}>
                  дни без суммы, которых нет в заметке: {pv.clear.map((x) => fmtShort(x.date)).join(', ')}
                </Text>
              </View>
            </Pressable>
          </ItemCard>
        )}
        {!impClear && (
          <Pressable onPress={() => setImpClear(true)} hitSlop={12}>
            <Text style={[styles.link, styles.showAll, { color: accent }]}>Убирать пустые дни, которых нет в заметке</Text>
          </Pressable>
        )}
        {pv.paydays.map((g) => {
          const rows = pv.rows.filter((r) => paydayForDate(r.p.date) === g.payday);
          const c = pv.carry.find((x) => x.payday === g.payday);
          return (
            <View key={g.payday}>
              <Text style={styles.sectionLabel}>
                Зп {fmtShort(g.payday)} · {g.count} {plural(g.count, 'смена', 'смены', 'смен')}
                {g.short ? ` · −${money(g.short)}` : ''}
                {g.mentor ? ` · наставник +${money(g.mentor)}` : ''}
              </Text>
              <ItemCard style={styles.listCard}>
                {rows.map((r, i) => (
                  <View key={i} style={[styles.lRow, (i < rows.length - 1 || c) && styles.lRowSep]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.lTitle} numberOfLines={1}>
                        {fmtShort(r.p.date)} · {r.p.title}
                        {r.p.place ? ` · ${r.p.place}` : ''}
                      </Text>
                      {r.p.adj || r.p.mentor || r.conflict || (r.kind === 'add' && r.sameDate.length) || (r.existing && r.existing.title !== r.p.title) ? (
                        <Text style={styles.lSub} numberOfLines={2}>
                          {r.p.adj ? <Text style={shortTone(r.p.adj) === 'bad' ? styles.bad : styles.good}>{adjTxt(r.p.adj)}</Text> : null}
                          {r.p.mentor ? (
                            <Text style={styles.good}>{`${r.p.adj ? ' · ' : ''}наставник +${money(r.p.mentor)}`}</Text>
                          ) : null}
                          {r.patch && r.patch.shortage === null ? ' · был «излишек» — теперь наставник' : ''}
                          {r.patch && r.patch.title ? `${r.p.adj || r.p.mentor ? ' · ' : ''}было «${r.existing.title}»` : ''}
                          {r.conflict && r.conflict.app ? ` · в приложении ${adjTxt(r.conflict.app)} — не меняю` : ''}
                          {r.conflict && r.conflict.mentor ? ` · в приложении наставник +${money(r.conflict.mentor)} — не меняю` : ''}
                          {r.conflict && r.conflict.role ? ` · в приложении «${r.conflict.role}» — не меняю` : ''}
                          {r.kind === 'add' && r.sameDate.length ? ` · в этот день уже есть «${r.sameDate[0].title}»` : ''}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.impTag, r.kind === 'same' && { opacity: 0.5 }]} numberOfLines={2}>{impAction(r)}</Text>
                  </View>
                ))}
                {c ? (
                  <View style={styles.lRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lTitle}>Депонирование</Text>
                      <Text style={[styles.lSub, c.value > 0 ? styles.bad : styles.good]}>
                        {c.value > 0 ? `−${money(c.value)}` : `+${money(-c.value)}`}
                        {c.kind === 'same' && c.existing !== c.value ? ` (в приложении ${money(c.existing)} — не меняю)` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.impTag, c.kind === 'same' && { opacity: 0.5 }]}>
                      {c.kind === 'add' ? 'добавить' : 'уже есть'}
                    </Text>
                  </View>
                ) : null}
              </ItemCard>
            </View>
          );
        })}
        <ScaleButton style={[styles.actBtn, { backgroundColor: accent }, !n && { opacity: 0.45 }]} onPress={confirm}>
          <Text style={[styles.actBtnTxt, styles.onAccent]}>{n ? `Применить ${n}` : 'Всё уже добавлено'}</Text>
        </ScaleButton>
      </>
    );
  };

  /** Содержимое шторки — строится только для открытой. */
  const renderSheet = (key) => {
    switch (key) {
      case 'carry': {
        const kC = fieldKb('carry', ['carry'], 'Депонирование');
        return {
          title: 'Депонирование',
          onClose: closeSheet,
          right: (
            <Pressable onPress={saveCarry} hitSlop={12}>
              <Text style={[styles.link, { color: accent }]}>Готово</Text>
            </Pressable>
          ),
          body: (
            <>
              {adjField(kC, {
                key: 'carry',
                label: 'Депонирование',
                segs: [
                  [false, '− минус'],
                  [true, '+ плюс'],
                ],
                note: form.surplus
                  ? 'Прибавляется к «К выплате» этой зарплаты.'
                  : 'Вычитается из «К выплате» этой зарплаты.',
              })}
            </>
          ),
        };
      }

      case 'shiftNotes': {
        const P = shNotes.parsed;
        if (P) {
          return {
            title: 'Импорт смен',
            onClose: closeSheet,
            body: (
              <>
                <Pressable hitSlop={12} onPress={() => setShNotes((x) => ({ ...x, parsed: null }))}>
                  <Text style={[styles.link, styles.notesBack, { color: accent }]}>‹ Изменить текст</Text>
                </Pressable>
                {shiftImportBody(P)}
              </>
            ),
          };
        }
        const kN = fieldKb('shNotes', ['shNotes'], 'Заметка');
        const canParse = !!shNotes.text.trim();
        const doParse = (text, ref) => {
          try {
            const r = parseShifts(text, { ref: ref || new Date() });
            Keyboard.dismiss();
            setShNotes((x) => ({ ...x, text, parsed: r }));
          } catch (err) {
            console.warn('parse shifts failed', err);
            Alert.alert('Не получилось разобрать', String(err?.message || err));
          }
        };
        return {
          title: 'Импорт смен',
          onClose: closeSheet,
          body: (
            <>
              <View style={styles.field}>
                <TextInput
                  {...kN.props}
                  multiline
                  returnKeyType="default"
                  submitBehavior="newline"
                  onSubmitEditing={undefined}
                  style={[styles.input, styles.notesInput]}
                  value={shNotes.text}
                  onChangeText={(t) => setShNotes((x) => ({ ...x, text: t }))}
                  placeholder={'10-23 окт. Зп 30 октябрь\n10 - день касса -2406\n17 - день рядовой +300\n-3927 депонирование'}
                  placeholderTextColor="rgba(235,235,245,0.3)"
                  textAlignVertical="top"
                  scrollEnabled={false}
                />
              </View>
              <View style={styles.notesBtns}>
                <ScaleButton
                  style={[styles.actBtn, styles.notesBtn]}
                  onPress={async () => {
                    try {
                      const t = await Clipboard.getStringAsync();
                      if (!t) return Alert.alert('Буфер пуст', 'Скопируйте текст заметки и нажмите «Вставить».');
                      Haptics.selectionAsync().catch(noop);
                      setShNotes((x) => ({ ...x, text: x.text.trim() ? `${x.text.trimEnd()}\n${t}` : t }));
                    } catch (err) {
                      console.warn('clipboard failed', err);
                    }
                  }}
                >
                  <Text style={styles.actBtnTxt}>Вставить</Text>
                </ScaleButton>
                <ScaleButton
                  style={[styles.actBtn, styles.notesBtn]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(noop);
                    doParse(SHIFTS_NOTE, SHIFTS_NOTE_REF);
                  }}
                >
                  <Text style={styles.actBtnTxt}>Мои смены</Text>
                </ScaleButton>
              </View>
              <ScaleButton
                style={[styles.actBtn, { backgroundColor: accent }, !canParse && { opacity: 0.45 }]}
                onPress={() => canParse && doParse(shNotes.text)}
              >
                <Text style={[styles.actBtnTxt, styles.onAccent]}>Разобрать</Text>
              </ScaleButton>
            </>
          ),
        };
      }

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
                      Haptics.selectionAsync().catch(noop);
                      fn();
                    }}
                  >
                    <AppIcon name={i === 2 ? 'calculator' : i === 1 ? 'calendar' : 'wallet'} size={34} variant="tile" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lTitle}>{t}</Text>
                      <Text style={styles.lSub}>{sub}</Text>
                    </View>
                    <GlyphChev />
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
            <Pressable onPress={saveExpense} hitSlop={12}>
              <Text style={[styles.link, { color: accent }]}>Готово</Text>
            </Pressable>
          ),
          body: (
            <>
              <View style={styles.field}>
                <View style={styles.bigField}>
                  <TextInput
                    {...kAmt.props}
                    style={styles.bigInput}
                    keyboardType="number-pad"
                    value={form.amount}
                    onChangeText={(t) => setForm((f) => ({ ...f, err: null, amount: t.replace(/[^0-9]/g, '') }))}
                    maxLength={9}
                    placeholder="0"
                    placeholderTextColor="rgba(235,235,245,0.25)"
                  />
                  <Text style={styles.bigUnit}>сом</Text>
                </View>
                {form.err ? (
                  <Text style={styles.fieldErr} accessibilityLiveRegion="polite">
                    {form.err}
                  </Text>
                ) : null}
                {kAmt.bar}
              </View>
              <View style={styles.field}>
                <TextInput
                  {...kTitle.props}
                  style={styles.input}
                  value={form.title}
                  onChangeText={(t) => setForm((f) => ({ ...f, err: null, title: t }))}
                  placeholder="Вайфай, ремонт…"
                  placeholderTextColor="rgba(235,235,245,0.3)"
                />
                {kTitle.bar}
              </View>
              <View style={styles.segBlock}>
                <SegmentCapsule
                  value={form.rec ? 0 : 1}
                  labels={['Постоянный', 'Одноразовый']}
                  height={50}
                  onChange={(i) => setForm((f) => ({ ...f, rec: i === 0, until: f.until || addDays(f.date, 365) }))}
                />
              </View>
              <DateWheel
                value={form.date}
                accent={accent}
                onChange={(d) =>
                  setForm((f) => ({ ...f, date: d, until: f.until && f.until < d ? d : f.until }))
                }
              />
              {form.rec ? (
                <DateWheel
                  label="До"
                  value={form.until}
                  min={form.date}
                  accent={accent}
                  onChange={(d) => setForm((f) => ({ ...f, until: d < f.date ? f.date : d }))}
                />
              ) : null}
              <ScaleButton style={[styles.actBtn, styles.okBtn]} onPress={saveExpense} accessibilityLabel="Сохранить расход">
                <Text style={[styles.actBtnTxt, styles.solidTxt]}>Сохранить</Text>
              </ScaleButton>
              {editId && (
                <ScaleButton
                  style={[styles.actBtn, styles.dangerBtn]}
                  onPress={() => {
                    const id = editId;
                    closeThen(() => confirmDeleteExpense(id));
                  }}
                >
                  <Text style={[styles.actBtnTxt, styles.solidTxt]}>Удалить расход</Text>
                </ScaleButton>
              )}
            </>
          ),
        };
      }

      case 'shift': {
        if (form.linked) {
          const sh = state.shifts.find((x) => x.id === editId);
          const dk = sh ? linkKey(sh) : form.date;
          const d = keyDate(dk);
          const kShort = fieldKb('shortage', ['shortage'], form.surplus ? 'Излишек' : 'Недостача');
          return {
            title: 'Смена из расчёта',
            onClose: closeSheet,
            right: (
              <Pressable onPress={saveShortage} hitSlop={12}>
                <Text style={[styles.link, { color: accent }]}>Готово</Text>
              </Pressable>
            ),
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
                    <Text style={styles.lVal}>
                      {sh ? sh.title : form.title}
                      {sh && sh.place ? ` · ${sh.place}` : ''}
                    </Text>
                  </View>
                  <View style={styles.lRow}>
                    <Text style={styles.lKey}>Сумма</Text>
                    <Text style={[styles.lVal, styles.lValBig, { color: accent }]}>
                      {money(sh ? sh.amount : form.amount)}
                    </Text>
                  </View>
                </ItemCard>
                {adjField(kShort, { pm: true })}

                <ScaleButton
                  style={[styles.actBtn, { backgroundColor: accent }]}
                  onPress={() => closeThen(() => openCalcOn(dk))}
                >
                  <Text style={[styles.actBtnTxt, styles.onAccent]}>Открыть в «Расчёте»</Text>
                </ScaleButton>
                <ScaleButton
                  style={styles.actBtn}
                  onPress={() =>
                    closeThen(() => {
                      addCalcSlot(d);
                      goPage(2);
                    })
                  }
                >
                  <Text style={[styles.actBtnTxt, { color: accent }]}>＋ Рассчитать ещё смену за этот день</Text>
                </ScaleButton>
              </>
            ),
          };
        }
        // поля в цепочке «Далее ›» — только видимые: свой тип и филиал — когда раскрыты
        const typeOpen = !!form.typeOpen;
        const placeOpen = form.placeOpen != null ? !!form.placeOpen : !!form.place;
        const SK = ['amount', ...(typeOpen ? ['title'] : []), 'shortage', ...(placeOpen ? ['place'] : [])];
        const kAmt = fieldKb('amount', SK, 'Сумма');
        const kTitle = fieldKb('title', SK, 'Тип смены');
        const kShort = fieldKb('shortage', SK, form.surplus ? 'Излишек' : 'Недостача');
        const kPlace = fieldKb('place', SK, 'Павильон');
        return {
          title: editId ? 'Смена' : 'Новая смена',
          onClose: closeSheet,
          right: (
            <Pressable onPress={saveShift} hitSlop={12}>
              <Text style={[styles.link, { color: accent }]}>Готово</Text>
            </Pressable>
          ),
          body: (
            <>
              <View style={styles.field}>
                <View style={styles.bigField}>
                  <TextInput
                    {...kAmt.props}
                    style={styles.bigInput}
                    keyboardType="number-pad"
                    value={form.amount}
                    onChangeText={(t) => setForm((f) => ({ ...f, amount: t.replace(/[^0-9]/g, '') }))}
                    maxLength={9}
                    placeholder="—"
                    placeholderTextColor="rgba(235,235,245,0.25)"
                  />
                  <Text style={styles.bigUnit}>сом</Text>
                </View>
                {kAmt.bar}
                {(() => {
                  const m = editId ? mentorMark(state.shifts.find((x) => x.id === editId)) : 0;
                  return m ? (
                    <Text style={[styles.fieldNote, styles.good]}>
                      Наставник +{money(m)} (из заметки) — прибавляется к «К выплате», пока сумма пустая. Сумма из «Расчёта»
                      уже включает наставника — тогда отдельно не считается.
                    </Text>
                  ) : null;
                })()}
              </View>
              <DateWheel value={form.date} accent={accent} onChange={(d) => setForm((f) => ({ ...f, date: d }))} />
              <View style={styles.field}>
                {/* тип смены — одна строка; варианты под ней только по нажатию */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: typeOpen }}
                  style={({ pressed }) => [styles.optRow, pressed && styles.rowPressed]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(noop);
                    setForm((f) => ({ ...f, typeOpen: !f.typeOpen }));
                  }}
                >
                  <Text style={styles.optK}>Тип смены</Text>
                  <Text style={styles.optV} numberOfLines={1}>
                    {form.title || 'ночь касса'}
                  </Text>
                  <View style={{ transform: [{ rotate: typeOpen ? '90deg' : '0deg' }] }}>
                    <GlyphChev />
                  </View>
                </Pressable>
                {typeOpen ? (
                  <Animated.View entering={FadeIn.duration(160)}>
                    <View style={styles.chipWrap}>
                      {CALC_TITLES.map((t) => (
                        <ScaleButton
                          key={t}
                          style={[styles.chip, form.title === t && styles.chipOn]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(noop);
                            setForm((f) => ({ ...f, title: t, typeOpen: false }));
                          }}
                        >
                          <Text style={[styles.chipTxt, form.title === t && styles.chipTxtOn]}>{t}</Text>
                        </ScaleButton>
                      ))}
                    </View>
                    <TextInput
                      {...kTitle.props}
                      style={[styles.input, { marginTop: 10 }]}
                      value={form.title}
                      onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
                      placeholder="Свой тип"
                      placeholderTextColor="rgba(235,235,245,0.3)"
                    />
                    {kTitle.bar}
                  </Animated.View>
                ) : null}
              </View>
              {adjField(kShort, { pm: true })}
              {/* «Другой павильон» — переключатель: второй тап прячет поле и стирает павильон */}
              <ScaleButton
                style={[styles.actBtn, styles.okBtn]}
                onPress={() =>
                  setForm((f) => {
                    const open = f.placeOpen != null ? !!f.placeOpen : !!f.place;
                    return open ? { ...f, placeOpen: false, place: '' } : { ...f, placeOpen: true };
                  })
                }
                accessibilityLabel="Другой павильон"
                accessibilityState={{ expanded: placeOpen }}
              >
                <Text style={[styles.actBtnTxt, styles.solidTxt]}>{placeOpen ? 'Другой павильон  ✕' : 'Другой павильон'}</Text>
              </ScaleButton>
              {placeOpen ? (
                <Animated.View style={styles.field} entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
                  <TextInput
                    {...kPlace.props}
                    style={styles.input}
                    value={form.place || ''}
                    onChangeText={(t) => setForm((f) => ({ ...f, place: t }))}
                    placeholder="Павильон / филиал, напр. Аламедин"
                    placeholderTextColor="rgba(235,235,245,0.3)"
                    autoFocus={!!form.placeOpen && !form.place}
                  />
                  {kPlace.bar}
                </Animated.View>
              ) : null}
              {editId && (
                <ScaleButton
                  style={[styles.actBtn, styles.dangerBtn]}
                  onPress={() => {
                    const id = editId;
                    closeThen(() => confirmDeleteShift(id));
                  }}
                >
                  <Text style={[styles.actBtnTxt, styles.solidTxt]}>Убрать этот день</Text>
                </ScaleButton>
              )}
            </>
          ),
        };
      }

      case 'tpl': {
        const tm = form.tplMode === 'work' ? 'work' : 'study';
        const list = templatesOf(state)[tm];
        const DOWN = { 1: 'Понедельник', 2: 'Вторник', 3: 'Среда', 4: 'Четверг', 5: 'Пятница', 6: 'Суббота', 0: 'Воскресенье' };
        return {
          title: 'Шаблон режима',
          onClose: toSettings,
          body: (
            <>
              <View style={styles.segBlock}>
                <SegmentCapsule
                  value={tm === 'work' ? 1 : 0}
                  labels={['Учёба', 'Работа']}
                  height={46}
                  onChange={(i) => setForm((f) => ({ ...f, tplMode: i === 1 ? 'work' : 'study', tplDay: null }))}
                />
              </View>
              <ItemCard style={styles.listCard}>
                {DOW_ORDER.map((d, i) => {
                  const e = list.find((x) => x.dow === d);
                  const open = form.tplDay === d && !!e;
                  return (
                    <View key={d} style={i < 6 && styles.lRowSep}>
                      <Pressable
                        style={({ pressed }) => [styles.lRow, pressed && styles.rowPressed]}
                        onPress={() => {
                          Haptics.selectionAsync().catch(noop);
                          if (!e) patchTemplate((p) => toggleTemplateDay(p, tm, d));
                          setForm((f) => ({ ...f, tplDay: f.tplDay === d && e ? null : d }));
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ checked: !!e, expanded: open }}
                      >
                        <Pressable
                          hitSlop={10}
                          onPress={() => {
                            Haptics.selectionAsync().catch(noop);
                            patchTemplate((p) => toggleTemplateDay(p, tm, d));
                            setForm((f) => ({ ...f, tplDay: e ? null : d }));
                          }}
                          style={[styles.tplCheck, e && { backgroundColor: '#30d158', borderColor: '#30d158' }]}
                          accessibilityLabel={e ? `Выключить: ${DOWN[d]}` : `Включить: ${DOWN[d]}`}
                        >
                          {e ? <Text style={styles.tplCheckTxt}>✓</Text> : null}
                        </Pressable>
                        <Text style={[styles.lTitle, { flex: 1 }, !e && { color: 'rgba(235,235,245,0.4)' }]}>{DOWN[d]}</Text>
                        {e ? (
                          <Text style={styles.lVal} numberOfLines={1}>
                            {e.title}
                            {e.amount ? ` · ${money(e.amount)}` : ''}
                          </Text>
                        ) : null}
                      </Pressable>
                      {open ? (
                        <Animated.View entering={FadeIn.duration(180)} style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
                          <View style={[styles.chipWrap, { marginTop: 0 }]}>
                            {CALC_TITLES.map((t) => (
                              <ScaleButton
                                key={t}
                                style={[styles.chip, e.title === t && styles.chipOn]}
                                onPress={() => patchTemplate((p) => editTemplateDay(p, tm, d, { title: t }))}
                              >
                                <Text style={[styles.chipTxt, e.title === t && styles.chipTxtOn]}>{t}</Text>
                              </ScaleButton>
                            ))}
                          </View>
                          <View style={[styles.bigField, { minHeight: 56, marginTop: 10 }]}>
                            <TextInput
                              style={[styles.bigInput, { fontSize: 22 }]}
                              keyboardType="number-pad"
                              keyboardAppearance="dark"
                              inputAccessoryViewID={KB_NONE}
                              value={e.amount ? String(e.amount) : ''}
                              onChangeText={(t) => {
                                const v = t.replace(/[^0-9]/g, '');
                                patchTemplate((p) => editTemplateDay(p, tm, d, { amount: v ? Number(v) : null }));
                              }}
                              maxLength={9}
                              placeholder="сумма — пусто"
                              placeholderTextColor="rgba(235,235,245,0.25)"
                            />
                            <Text style={styles.bigUnit}>сом</Text>
                          </View>
                        </Animated.View>
                      ) : null}
                    </View>
                  );
                })}
              </ItemCard>
              <Text style={styles.fieldNote}>
                Эти смены режим добавляет сам с текущего периода. Смены с суммой, недостачей или правленые вручную не меняются.
              </Text>
            </>
          ),
        };
      }

      case 'settings': {
        const autoN = autoAddedRecurring(state).length;
        const nav = [
          { key: 'backup', icon: 'copy', title: 'Перенос данных', sub: 'скопировать или вставить все данные' },
          { key: 'analysis', icon: 'chart', title: 'Анализ', sub: 'по месяцам, лучшие и худшие' },
          { key: 'stats', icon: 'pie', title: 'Результаты', sub: 'заработано и оплачено за всё время' },
          {
            key: 'cleanup',
            icon: 'trash',
            title: 'Удалить автодобавленные платежи',
            sub: autoN ? `${autoN} неоплаченных от старых «постоянных»` : 'нет — ничего удалять',
          },
        ];
        return {
          title: 'Настройки',
          onClose: closeSheet,
          body: (
            <>
              <Text style={[styles.sectionLabel, { textAlign: 'center', marginLeft: 0 }]}>Режим смен</Text>
              <View style={styles.segBlock}>
                <SegmentCapsule
                  value={state.settings.mode === 'work' ? 1 : 0}
                  labels={['Учёба', 'Работа']}
                  height={50}
                  onChange={(i) => switchMode(i === 1 ? 'work' : 'study')}
                />
              </View>
              <ScaleButton style={[styles.actBtn, { marginTop: -6 }]} onPress={openTemplates} accessibilityLabel="Изменить шаблон режимов">
                <Text style={[styles.actBtnTxt, { color: accent }]}>Изменить шаблон</Text>
              </ScaleButton>
              <ItemCard style={styles.listCard}>
                {nav.map((n, i) => (
                  <Pressable
                    key={n.key}
                    style={({ pressed }) => [styles.lRow, i < nav.length - 1 && styles.lRowSep, pressed && styles.rowPressed]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(noop);
                      setSheet(n.key);
                    }}
                  >
                    <AppIcon name={n.icon} size={30} variant="tile" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.lTitle}>{n.title}</Text>
                      <Text style={styles.lSub}>{n.sub}</Text>
                    </View>
                    <GlyphChev />
                  </Pressable>
                ))}
              </ItemCard>
            </>
          ),
        };
      }

      case 'backup': {
        const cur = summarize({
          zp_app_v1: JSON.stringify(state),
          zp_calc_v1: calc ? JSON.stringify(calc) : undefined,
        });
        return {
          title: 'Перенос данных',
          onClose: toSettings,
          body: (
            <>
              <ItemCard style={[styles.listCard, styles.padCard]}>
                <Text style={styles.k}>На этом устройстве</Text>
                <Text style={[styles.bigPay, { marginTop: 4, fontSize: 22, color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
                  {fmtSummary(cur)}
                </Text>
                <Text style={styles.calcMeta}>
                  {backupInfo
                    ? `скопировано в буфер · ${Math.max(1, Math.round(backupInfo.size / 1024))} КБ`
                    : 'план расходов, смены, расчёты и настройки'}
                </Text>
              </ItemCard>
              <ScaleButton style={[styles.actBtn, styles.actBtnRow, { backgroundColor: accent }]} onPress={copyBackup}>
                <AppIcon name="copy" size={20} variant="glyph" color="#102012" />
                <Text style={[styles.actBtnTxt, styles.onAccent]}>Скопировать все данные</Text>
              </ScaleButton>
              <ScaleButton style={[styles.actBtn, styles.actBtnRow]} onPress={pasteBackup}>
                <AppIcon name="download" size={20} variant="glyph" color="#fff" />
                <Text style={styles.actBtnTxt}>Вставить данные</Text>
              </ScaleButton>
              {prePaste && (
                <ScaleButton style={styles.actBtn} onPress={undoPaste}>
                  <Text style={styles.actBtnTxt}>Вернуть как было до вставки</Text>
                </ScaleButton>
              )}
            </>
          ),
        };
      }

      case 'cleanup': {
        const list = autoAddedRecurring(state).sort((x, y) => (x.date < y.date ? -1 : 1));
        const byM = {};
        for (const e of list) (byM[e.date.slice(0, 7)] = byM[e.date.slice(0, 7)] || []).push(e);
        const months = Object.keys(byM).sort();
        const sum = list.reduce((a, e) => a + Number(e.amount || 0), 0);
        return {
          title: 'Автодобавленные',
          onClose: toSettings,
          body: (
            <>
              <ItemCard style={[styles.listCard, styles.padCard]}>
                <Text style={styles.k}>Будет удалено</Text>
                <Text style={[styles.bigPay, { marginTop: 4, color: list.length ? '#ff453a' : accent }]} numberOfLines={1}>
                  {list.length} · {money(sum)} сом
                </Text>
                <Text style={styles.calcMeta}>только неоплаченные и не изменённые — оплаченные ✓ остаются</Text>
              </ItemCard>
              {months.map((k) => (
                <View key={k}>
                  <Text style={styles.sectionLabel}>
                    {monthTitle(k)} · {byM[k].length}
                  </Text>
                  <ItemCard style={styles.listCard}>
                    {byM[k].map((e, i) => (
                      <View key={e.id} style={[styles.lRow, i < byM[k].length - 1 && styles.lRowSep]}>
                        <Text style={[styles.lTitle, { flex: 1 }]} numberOfLines={1}>
                          {fmtShort(e.date)} · {e.title || 'Без названия'}
                        </Text>
                        <Text style={styles.lVal}>{money(e.amount)}</Text>
                      </View>
                    ))}
                  </ItemCard>
                </View>
              ))}
              <ScaleButton
                style={[styles.actBtn, styles.dangerBtn, !list.length && { opacity: 0.45 }]}
                onPress={() => {
                  if (!list.length) return;
                  Alert.alert(
                    'Удалить автодобавленные?',
                    `${list.length} неоплаченных платежей на ${money(sum)} сом исчезнут из «Расходов». Оплаченные останутся.`,
                    [
                      { text: 'Отмена', style: 'cancel' },
                      {
                        text: 'Удалить',
                        style: 'destructive',
                        onPress: () => {
                          const ids = list.map((e) => e.id);
                          patch((p) => removeExpenses(p, ids));
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(noop);
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={[styles.actBtnTxt, styles.solidTxt]}>
                  {list.length ? `Удалить ${list.length}` : 'Нечего удалять'}
                </Text>
              </ScaleButton>
            </>
          ),
        };
      }

      case 'notes': {
        const P = notes.parsed;
        if (P) {
          return {
            title: 'Импорт из заметок',
            onClose: closeSheet,
            body: (
              <>
                <Pressable hitSlop={8} onPress={() => setNotes((x) => ({ ...x, parsed: null }))}>
                  <Text style={[styles.link, styles.notesBack, { color: accent }]}>‹ {P.planId ? 'Назад' : 'Изменить текст'}</Text>
                </Pressable>
                {importBody({ ...P, label: 'Импорт из заметок' })}
              </>
            ),
          };
        }
        const kN = fieldKb('notes', ['notes'], 'Заметка');
        const canParse = !!notes.text.trim();
        const doParse = () => {
          try {
            const r = parsePlan(notes.text, { ref: new Date() });
            Keyboard.dismiss();
            setImpAll(false);
            setNotes((x) => ({ ...x, parsed: { blocks: r.blocks, unparsed: r.unparsed, planId: null } }));
          } catch (err) {
            console.warn('parse notes failed', err);
            Alert.alert('Не получилось разобрать', String(err?.message || err));
          }
        };
        return {
          title: 'Импорт из заметок',
          onClose: closeSheet,
          body: (
            <>
              <View style={styles.field}>
                <TextInput
                  {...kN.props}
                  multiline
                  returnKeyType="default"
                  submitBehavior="newline"
                  onSubmitEditing={undefined}
                  style={[styles.input, styles.notesInput]}
                  value={notes.text}
                  onChangeText={(t) => setNotes((x) => ({ ...x, text: t }))}
                  placeholder={'Расходы Ноябрь\n4 ноября - 1000 Адилет Аке ✅\n15.11 – 5 075 Мбанк'}
                  placeholderTextColor="rgba(235,235,245,0.3)"
                  textAlignVertical="top"
                  scrollEnabled={false}
                />
              </View>
              <View style={styles.notesBtns}>
                <ScaleButton
                  style={[styles.actBtn, styles.notesBtn]}
                  onPress={async () => {
                    try {
                      const t = await Clipboard.getStringAsync();
                      if (!t) return Alert.alert('Буфер пуст', 'Скопируйте текст заметки и нажмите «Вставить».');
                      Haptics.selectionAsync().catch(noop);
                      setNotes((x) => ({ ...x, text: x.text.trim() ? `${x.text.trimEnd()}\n${t}` : t }));
                    } catch (err) {
                      console.warn('clipboard failed', err);
                    }
                  }}
                >
                  <Text style={styles.actBtnTxt}>Вставить</Text>
                </ScaleButton>
              </View>
              <ScaleButton
                style={[styles.actBtn, { backgroundColor: accent }, !canParse && { opacity: 0.45 }]}
                onPress={() => canParse && doParse()}
              >
                <Text style={[styles.actBtnTxt, styles.onAccent]}>Разобрать</Text>
              </ScaleButton>
            </>
          ),
        };
      }

      case 'find': {
        const isShift = find.kind === 'shift';
        const res = searchItems(isShift ? state.shifts : state.expenses, find.q, 40, todayIso());
        const go = (x) => {
          const k = paydayIndexFor(isShift ? 'shift' : 'expense', x.date);
          if (isShift) jumpShiftIdx(k);
          else jumpPayIdx(k);
          if (isShift) openShift(x.id);
          else openExpense(x.id);
        };
        return {
          title: isShift ? 'Поиск смен' : 'Поиск расходов',
          onClose: closeSheet,
          body: (
            <>
              <TextInput
                style={[styles.input, { marginBottom: 16 }]}
                value={find.q}
                onChangeText={(t) => setFind((f) => ({ ...f, q: t }))}
                placeholder={isShift ? 'ночь, касса, 2500…' : 'Вайфай, 1350…'}
                placeholderTextColor="rgba(235,235,245,0.3)"
                autoFocus
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
                accessibilityLabel="Что найти"
              />
              {find.q.trim() && res.length === 0 ? (
                <EmptyState icon="search" title="Ничего не нашлось" text="Попробуйте часть названия или сумму без пробелов." accent={accent} />
              ) : null}
              {res.map((x) => {
                const noSum = x.amount == null || x.amount === '';
                return (
                  <ScaleButton key={x.id} style={styles.setItem} onPress={() => go(x)}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.setL} numberOfLines={1}>
                        {x.title || (isShift ? 'Смена' : 'Без названия')}
                        {x.place ? ` · ${x.place}` : ''}
                      </Text>
                      <Text style={styles.setS}>
                        {fmtShort(x.date)} {x.date.slice(0, 4)}
                        {!isShift ? (x.status === 'paid' ? ' · оплачено' : ' · не отмечено') : ''}
                      </Text>
                    </View>
                    <Text style={styles.itemTitle}>{noSum ? '—' : money(x.amount)}</Text>
                  </ScaleButton>
                );
              })}
              {find.q.trim() && res.length >= 40 ? (
                <Text style={[styles.hint, { textAlign: 'center' }]}>Показаны первые 40 — уточните запрос.</Text>
              ) : null}
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
                  <Text style={styles.lKey}>Заработано{shortAll ? ' (после недостачи)' : ''}</Text>
                  <Text style={[styles.lVal, styles.good]}>{money(earnedAll)}</Text>
                </View>
                {shortAll ? (
                  <View style={[styles.lRow, styles.lRowSep]}>
                    <Text style={styles.lKey}>· недостача</Text>
                    <Text style={[styles.lVal, styles.bad]}>−{money(shortAll)}</Text>
                  </View>
                ) : null}
                {bonusLossAll ? (
                  <View style={[styles.lRow, styles.lRowSep]}>
                    <Text style={styles.lKey}>· без премии кассира</Text>
                    <Text style={[styles.lVal, styles.bad]}>−{money(bonusLossAll)}</Text>
                  </View>
                ) : null}
                {carryAll ? (
                  <View style={[styles.lRow, styles.lRowSep]}>
                    <Text style={styles.lKey}>· депонирование</Text>
                    <Text style={[styles.lVal, carryAll > 0 ? styles.bad : styles.good]}>
                      {carryAll > 0 ? '−' : '+'}
                      {money(Math.abs(carryAll))}
                    </Text>
                  </View>
                ) : null}
                {mentorAll ? (
                  <View style={[styles.lRow, styles.lRowSep]}>
                    <Text style={styles.lKey}>· наставник</Text>
                    <Text style={[styles.lVal, styles.good]}>+{money(mentorAll)}</Text>
                  </View>
                ) : null}
                <View style={styles.lRow}>
                  <Text style={styles.lKey}>Оплачено всего</Text>
                  <Text style={styles.lVal}>{money(spent)}</Text>
                </View>
              </ItemCard>
            </>
          ),
        };
      }

      case 'calcPos':
        return {
          title: 'Касса',
          onClose: closeSheet,
          right: (
            <Pressable onPress={closeSheet}>
              <Text style={[styles.link, { color: accent }]}>Готово</Text>
            </Pressable>
          ),
          body: calcDay ? (
            <CalcPositionsList
              day={calcDay}
              accent={accent}
              onStep={onCalcStep}
              onSet={onCalcSet}
              onOpen={openCalcItem}
              onQuick={() => openCalcSection('calcQuick')}
            />
          ) : null,
        };
      case 'pdfImp': {
        if (!pdfImp) return { title: '', onClose: closeSheet, body: null };
        const fq = (q) => (Number.isInteger(q) ? String(q) : String(q).replace('.', ','));
        const n = Object.keys(calcCountsFromImport(pdfImp)).length;
        const block = (title, list, note) =>
          list.length ? (
            <>
              <Text style={styles.sectionLabel}>{title}</Text>
              <ItemCard style={styles.listCard}>
                {list.map((x, i) => (
                  <View key={x.key || `${x.name}-${i}`} style={[styles.lRow, i < list.length - 1 && styles.lRowSep]}>
                    <Text style={[styles.lTitle, { flex: 1 }, note && { color: 'rgba(235,235,245,0.55)' }]} numberOfLines={1}>
                      {x.label || x.name}
                    </Text>
                    <Text style={[styles.lVal, { fontVariant: ['tabular-nums'] }]}>{fq(x.qty)}</Text>
                  </View>
                ))}
              </ItemCard>
            </>
          ) : null;
        return {
          title: 'Импорт PDF',
          onClose: () => {
            setPdfImp(null);
            closeSheet();
          },
          body: (
            <>
              {block('Касса', pdfImp.calc)}
              {block('Кофе · в «Зерн.кофе»', pdfImp.coffee)}
              {block('Напитки · в «Расход»', pdfImp.drinks)}
              {block('Стаканы · в «Расход»', pdfImp.cups || [])}
              {block('Соусы · в «Расход»', pdfImp.sauces || [])}
              {block('Не распознано', pdfImp.unknown, true)}
              <ScaleButton
                style={[styles.actBtn, styles.okBtn, !n && { opacity: 0.45 }]}
                onPress={() => n && applyPdfImport()}
                accessibilityLabel="Добавить в расчёт"
              >
                <Text style={[styles.actBtnTxt, styles.solidTxt]}>Добавить в расчёт</Text>
              </ScaleButton>
            </>
          ),
        };
      }
      case 'calcQuick':
        return {
          title: 'Быстрый ввод',
          onClose: () => setSheet('calcPos'),
          right: (
            <Pressable onPress={() => setSheet('calcPos')} hitSlop={10}>
              <Text style={[styles.link, { color: accent }]}>Готово</Text>
            </Pressable>
          ),
          body: calcDay ? (
            <CalcQuickEntry day={calcDay} accent={accent} onSetTallies={setCalcTallies} onDone={() => setSheet('calcPos')} />
          ) : null,
        };
      case 'calcSum':
        return {
          title: 'План продаж',
          onClose: closeSheet,
          body: calcDay ? <CalcSummaryList day={calcDay} rates={calc.rates} /> : null,
        };
      case 'calcUse':
        return {
          title: 'Расход',
          onClose: closeSheet,
          body: calcDay ? <CalcUsageList day={calcDay} rates={calc.rates} onOpen={openCalcItem} /> : null,
        };
      case 'calcSaved':
        return {
          title: 'Сохранённые расчёты',
          onClose: closeSheet,
          body: (
            <CalcSavedList
              calc={calc}
              date={calcKeyNow}
              accent={accent}
              onPick={(k) => {
                Haptics.selectionAsync().catch(noop);
                setCalcDateRaw(keyDate(k));
                setCalcSlot(keySlot(k));
                setSheet(null);
              }}
            />
          ),
        };

      case 'calcItem': {
        const it = CALC_ITEMS.find((x) => x.id === calcItem) || EXTRA_ITEMS.find((x) => x.id === calcItem);
        const t = calcDay ? talliesOf(calcDay.counts[calcItem]) : [0];
        return {
          title: it ? it.name : '',
          onClose: closeCalcItem,
          right: (
            <Pressable onPress={closeCalcItem}>
              <Text style={[styles.link, { color: accent }]}>Готово</Text>
            </Pressable>
          ),
          body: (
            <LayoutAnimationConfig skipEntering>
              <View>
                {t.map((n, i) => (
                  <Animated.View key={i} style={styles.tallyRow} entering={ROW_ENTER} layout={ROW_LAYOUT}>
                    <Text style={[styles.setL, { flex: 1 }]}>Подсчёт {i + 1}</Text>
                    <ScaleButton style={styles.stepBtn} onPress={() => stepTally(calcItem, -1, i)}>
                      <AppIcon name="minus" size={18} variant="glyph" color="#fff" />
                    </ScaleButton>
                    <NumInput
                      value={n}
                      onChange={(v) => setTally(calcItem, v, i)}
                      style={[styles.cCount, styles.cCountTxt]}
                    />
                    <ScaleButton style={styles.stepBtn} onPress={() => stepTally(calcItem, 1, i)}>
                      <AppIcon name="plus" size={18} variant="glyph" color="#fff" />
                    </ScaleButton>
                    {t.length > 1 ? (
                      <Pressable
                        hitSlop={10}
                        onPress={() => editTallies(calcItem, (x) => x.filter((_, j) => j !== i))}
                      >
                        <AppIcon name="close" size={14} variant="glyph" color="#ff453a" />
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
              <ItemCard style={styles.listCard}>
                {RATE_FIELDS.map(([k, label, unit], i) => {
                  const kb = fieldKb(`rate_${k}`, RATE_FIELDS.map(([x]) => `rate_${x}`), label);
                  return (
                    <View key={k} style={[styles.lRow, i < RATE_FIELDS.length - 1 && styles.lRowSep]}>
                      <Text style={styles.lKey}>{label}</Text>
                      <TextInput
                        {...kb.props}
                        style={styles.rateInput}
                        keyboardType={unit === 'h' ? 'decimal-pad' : 'number-pad'}
                        selectTextOnFocus
                        value={form.rates?.[k] ?? ''}
                        onChangeText={(t) =>
                          setForm((f) => ({
                            ...f,
                            rates: { ...f.rates, [k]: unit === 'h' ? hoursInput(t) : t.replace(/[^0-9]/g, '') },
                          }))
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
                    rates: Object.fromEntries(RATE_FIELDS.map(([k]) => [k, rateStr(k, DEFAULT_RATES[k])])),
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
    <View style={styles.root} ref={SNAP_ROOT} collapsable={false} onTouchEnd={() => SNAP_BUS.kick && SNAP_BUS.kick()}>
      <StatusBar style="light" />
      <View style={[styles.blob, styles.blobA, { backgroundColor: accent }]} />
      <View style={[styles.blob, styles.blobB]} />
      <View style={styles.bgScrim} />

      <View style={styles.header}>
        {page === 3 ? (
          <>
            <View style={styles.hSide} />
            <View style={styles.hCenter}>
              <View style={styles.hCenterIn}>
                <Text style={styles.eyebrow} numberOfLines={1}>
                  Анализ трат · Mbank
                </Text>
                {bankHead ? (
                  <ScaleButton style={styles.hDateHit} hitSlop={4} onPress={() => bankApi.current?.openPeriod?.()}>
                    <Glass style={styles.hDatePill} intensity={40}>
                      <Text style={styles.hDateTxt} numberOfLines={1} adjustsFontSizeToFit>
                        {bankHead}
                      </Text>
                    </Glass>
                  </ScaleButton>
                ) : (
                  <Text style={styles.h1C} numberOfLines={1}>
                    Банк
                  </Text>
                )}
              </View>
            </View>
          </>
        ) : page !== 2 ? (
          <>
            <View style={styles.hSide} />
            <PayHeader payday={page === 0 ? shownPay : shownShiftPay} label={DOCK_LABELS[page]} />
          </>
        ) : (
          <>
            <View style={styles.hSide} />
            <DateWheel
              variant="header"
              value={calcDate}
              onChange={setCalcDate}
              label="Дата смены"
              eyebrow={`${DOCK_LABELS[2]} · ${parse(calcDate).getFullYear()}`}
              accent={accent}
            />
          </>
        )}
        <View ref={addBtnRef} collapsable={false}>
          <ScaleButton style={styles.round} onPress={onPlus} accessibilityLabel="Добавить">
            <AppIcon name="plus" size={48} variant="tileOn" shape="circle" />
          </ScaleButton>
        </View>
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
            pos={pagePos}
            cur={pageCur}
            lo={pageLo}
            hi={pageHi}
            pages={pages}
            arc={arc}
            onPage={onPage}
            pageProps={payPageProps}
          />
        </TabPane>

        {mounted[1] && (
          <TabPane vis={tabSV[1][0]} x={tabSV[1][1]} active={page === 1} reduce={reduceMotion}>
            <PayPager
              pos={shiftPos}
              cur={shiftCur}
              lo={shiftLo}
              hi={shiftHi}
              pages={shiftPages}
              arc={arc}
              onPage={onShiftPage}
              Page={ShiftPage}
              pageProps={shiftPageProps}
            />
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
                    adj={calcDayAdj(state.shifts, calcKeyNow, calcDay.time)}
                    slots={calcSlotList}
                    slot={calcSlot}
                    onSlot={setCalcSlot}
                    onAddSlot={addCalcSlot}
                    dayTotal={calcDayTotal}
                    onAdj={onCalcAdj}
                    scrollRef={mainScroll}
                    scrollY={mainScrollY}
                    scrollTop={mainScrollTop}
                    onPatchDay={patchDay}
                    onRole={onCalcRole}
                    onTime={onCalcTime}
                    onOpenSection={openCalcSection}
                    onOpenRates={calcStable.openRates}
                    onReset={calcStable.reset}
                    onShowShift={calcStable.showShift}
                    onImportPdf={calcStable.importPdf}
                  />
                )}
              </View>
            </LayoutAnimationConfig>
          </ScrollView>
          </TabPane>
        )}

        {mounted[3] && (
          <TabPane vis={tabSV[3][0]} x={tabSV[3][1]} active={page === 3} reduce={reduceMotion}>
            <ScrollView
              style={styles.pages}
              contentContainerStyle={styles.pagesContent}
              showsVerticalScrollIndicator={false}
            >
              <BankView accent={accent} apiRef={bankApi} onToast={bankToast} onHead={setBankHead} />
            </ScrollView>
          </TabPane>
        )}
      </View>

      {/* Dock */}
      <View style={styles.dock}>
        <View style={styles.capsuleWrap}>
          <SegmentCapsule value={DOCK_POS[page]} labels={DOCK_LABELS_POS} icons={DOCK_ICONS_POS} height={64} glass onChange={onDock} onPickUI={tabAnim} />
        </View>
        <ScaleButton style={styles.gearDock} onPress={() => setSheet('settings')} accessibilityLabel="Настройки">
          <AppIcon name="gear" size={64} variant="tile" shape="circle" />
        </ScaleButton>
      </View>

      <Toast toast={toast} onUndo={undoToast} onHide={hideToast} />
      <IslandMenu arc={arc} />
      <AddMenu
        visible={!!addMenu && page === menuPage}
        anchor={addMenu}
        items={menuPage === 1 ? shiftAddItems : addItems}
        accent={accent}
        onClose={closeAddMenu}
      />
      <KeyBarHost scope="main" />
      <SheetHost active={sheet} render={renderSheet} onClosed={onSheetClosed} />
      {mounted[1] ? (
        <ExportPrinterHost apiRef={printerRef} accent={accent} onDownload={downloadPdf} onClosed={onPrinterClosed}>
          {printCard}
        </ExportPrinterHost>
      ) : null}
    </View>
  );

  return <GestureHandlerRootView style={{ flex: 1 }}>{content}</GestureHandlerRootView>;
}

const DOCK_LABELS = ['Расходы', 'Смены', 'Расчёт', 'Банк'];
const DOCK_ICONS = ['card', 'calendar', 'calculator', 'bank'];
// порядок в доке: Банк первым, рядом с Расходами. Индексы страниц (page) не меняются.
const DOCK_PAGES = [3, 0, 1, 2]; // позиция в доке → страница
const DOCK_POS = [1, 2, 3, 0]; // страница → позиция в доке
const DOCK_LABELS_POS = DOCK_PAGES.map((p) => DOCK_LABELS[p]);
const DOCK_ICONS_POS = DOCK_PAGES.map((p) => DOCK_ICONS[p]);
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
  hSide: { width: 48, height: 48 },
  hCenter: { flex: 1, height: 58, marginHorizontal: 8 },
  hCenterIn: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  h1C: { color: '#fff', fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 },
  hDateHit: { marginTop: 2 },
  hDatePill: {
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hDateTxt: { color: '#fff', fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  hDateDow: { color: 'rgba(235,235,245,0.55)', fontSize: 17, fontWeight: '600' },
  hDots: { flexDirection: 'row', gap: 4, marginTop: 4, height: 6 },
  hDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(235,235,245,0.25)' },
  hDotOn: { width: 16, backgroundColor: 'rgba(235,235,245,0.9)' },
  pager: { flex: 1 },
  eyebrow: { color: 'rgba(235,235,245,0.55)', fontSize: 13, fontWeight: '600' },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: { fontSize: 28, fontWeight: '500', marginTop: -2 },

  pages: { flex: 1 },
  // док: 64 + отступ 28 снизу → подсказка в конце списка всегда выше него с запасом
  pagesContent: { paddingHorizontal: 16, paddingBottom: 160 },

  glassBase: {
    borderRadius: 26,
    overflow: 'hidden',
  },
  glassBleed: { position: 'absolute', top: -GLASS_BLEED, left: -GLASS_BLEED, right: -GLASS_BLEED, bottom: -GLASS_BLEED },
  depthShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: DEPTH_SHADE },
  glassFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(22,22,28,0.42)',
  },
  // карточка во вкладке: заливка и кромка на САМОМ виде с радиусом — видны на чёрном всегда
  cardBase: {
    backgroundColor: 'rgba(118,118,128,0.2)',
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

  group: { marginBottom: 16 },
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
  whenNum: { color: '#fff', fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  whenDow: { color: 'rgba(235,235,245,0.55)', fontSize: 11, fontWeight: '600', marginTop: -1 },
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
  statV: { color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: -0.3, marginTop: 4, fontVariant: ['tabular-nums'] },
  itemCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(30,30,36,0.94)',
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
    overflow: 'hidden',
  },
  amtPaid: { color: 'rgba(235,235,245,0.6)' },
  fieldErr: { color: '#ff6961', fontSize: 13, marginTop: 8 },
  due: { color: '#ff9f0a', fontWeight: '600' },
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
  sGlyph: { color: '#fff', fontSize: 16, fontWeight: '800' },
  menuBack: { backgroundColor: 'rgba(0,0,0,0.28)' },
  addMenuBack: { backgroundColor: 'rgba(0,0,0,0.18)' },
  addMenuBox: { position: 'absolute', width: ADD_MENU_W, transformOrigin: 'top right' },
  addMenu: { width: ADD_MENU_W, paddingVertical: 4 },
  addMenuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  addMenuIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  warnCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    backgroundColor: 'rgba(255,159,10,0.13)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,159,10,0.4)',
  },
  warnTxt: { color: 'rgba(255,214,160,0.95)', fontSize: 14, lineHeight: 19 },
  warnLink: { fontSize: 15, fontWeight: '700', marginTop: 8 },
  unparsedTxt: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 },
  impTag: { color: 'rgba(235,235,245,0.7)', fontSize: 12, fontWeight: '700', marginLeft: 8, maxWidth: 150, textAlign: 'right' },
  notesInput: { minHeight: 150, maxHeight: 340, paddingTop: 14, fontSize: 15, lineHeight: 20 },
  notesBtns: { flexDirection: 'row', gap: 10 },
  notesBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  notesBack: { marginBottom: 10 },
  metaShort: { color: '#ff453a', fontSize: 12, fontWeight: '600', marginTop: 2 },
  metaPlus: { color: '#30d158', fontSize: 12, fontWeight: '600', marginTop: 2 },
  metaDim: { color: 'rgba(235,235,245,0.45)', fontWeight: '500' },
  placeTxt: { color: 'rgba(235,235,245,0.55)', fontWeight: '500' },
  adjHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  adjSeg: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  adjBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  adjBtnMinus: { backgroundColor: 'rgba(255,69,58,0.18)' },
  adjBtnPlus: { backgroundColor: 'rgba(48,209,88,0.18)' },
  adjBtnTxt: { color: 'rgba(235,235,245,0.6)', fontSize: 12, fontWeight: '700' },
  adjSign: { fontSize: 26, fontWeight: '700', marginRight: 4 },
  pmRow: { flexDirection: 'row', gap: 8, marginLeft: 8 },
  pmBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  pmMinusOn: { backgroundColor: '#ff453a' },
  pmPlusOn: { backgroundColor: '#30d158' },
  pmTxt: { fontSize: 26, fontWeight: '700', lineHeight: 30 },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  optK: { color: 'rgba(235,235,245,0.6)', fontSize: 16 },
  optV: { flex: 1, textAlign: 'right', color: '#fff', fontSize: 16, fontWeight: '600' },
  quickOpen: { marginBottom: 4 },
  gapNote: { color: 'rgba(235,235,245,0.55)', fontSize: 13, lineHeight: 17, marginTop: -2, marginBottom: 6 },
  qeProgress: { height: 3, borderRadius: 2, marginHorizontal: 4, marginBottom: 14, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  qeProgressFill: { height: 3, borderRadius: 2 },
  qeStage: { minHeight: 236 },
  qeGhost: { position: 'absolute', left: 0, right: 0, top: 0 },
  qeCard: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderRadius: 30,
    backgroundColor: 'rgba(44,44,50,0.42)',
    overflow: 'hidden',
  },
  qeCount: { color: 'rgba(235,235,245,0.55)', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  qeName: { color: '#fff', fontSize: 34, fontWeight: '800', marginTop: 6, letterSpacing: 0.2 },
  qeNum: {
    color: '#fff',
    fontSize: 64,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    paddingVertical: 4,
    marginTop: 6,
    minHeight: 84,
  },
  qeFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 32 },
  qeNow: { flex: 1, color: 'rgba(235,235,245,0.5)', fontSize: 13 },
  qePlus: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.12)' },
  qePlusOff: { backgroundColor: 'rgba(255,255,255,0.05)' },
  qePlusTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  qePeek: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 8, marginTop: 12 },
  qePeekTxt: { flex: 1, color: 'rgba(235,235,245,0.38)', fontSize: 13 },
  tileGrid: { gap: 10, marginTop: 16, marginBottom: 6 },
  tileHit: { alignSelf: 'stretch' },
  tile: {
    minHeight: 84,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconTxt: { fontSize: 21 },
  tileMid: { flex: 1, minWidth: 0 },
  tileBig: { color: '#fff', fontSize: 26, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'], flexShrink: 0 },
  tileTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  tileSub: { color: 'rgba(235,235,245,0.5)', fontSize: 13, marginTop: 2 },
  adjLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  adjMini: { flexDirection: 'row', gap: 4 },
  adjMiniBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(118,118,128,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjMiniTxt: { color: 'rgba(235,235,245,0.6)', fontSize: 18, fontWeight: '700', marginTop: -1 },
  adjNum: { width: 84 },
  adjLineNote: { color: 'rgba(235,235,245,0.45)', fontSize: 12, marginTop: -2, marginBottom: 2 },
  metaMoved: { color: 'rgba(100,210,255,0.85)', fontSize: 12, marginTop: 2 },
  movedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  returnBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(100,210,255,0.16)',
  },
  returnTxt: { color: 'rgba(100,210,255,0.95)', fontSize: 12, fontWeight: '700' },
  islBox: { position: 'absolute', left: 0, top: 0, width: ISL_T, height: ISL_L },
  island: {
    width: ISL_T,
    height: ISL_L,
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
  },
  islOpt: { position: 'absolute', top: 0, left: ISL_T / 2 - ISL_OPT / 2, width: ISL_OPT, height: ISL_OPT },
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
    paddingHorizontal: 16,
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
    paddingVertical: 12,
    paddingLeft: 10,
    gap: 10,
  },
  mid: { flex: 1, minWidth: 0 },
  itemTitle: { color: '#fff', fontSize: 16, fontWeight: '600' },
  meta: { color: 'rgba(235,235,245,0.55)', fontSize: 12, marginTop: 2 },
  amt: { color: '#fff', fontSize: 16, fontWeight: '600', marginRight: 6 },
  calcBadge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  empty: { color: 'rgba(235,235,245,0.4)', textAlign: 'center', padding: 16, fontSize: 14 },
  fChips: { flexDirection: 'row', gap: 8, marginBottom: 8, paddingHorizontal: 4 },
  fChip: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 16,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  fChipTxt: { color: 'rgba(235,235,245,0.6)', fontSize: 13, fontWeight: '600' },
  fChipTxtOn: { color: '#fff' },
  emptyCard: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 24 },
  emptyIconWrap: { marginBottom: 8 },
  emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  emptyText: { color: 'rgba(235,235,245,0.6)', fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 4 },
  emptyBtn: {
    marginTop: 16,
    minHeight: 44,
    paddingHorizontal: 24,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnTxt: { fontSize: 16, fontWeight: '600' },

  dock: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: Platform.OS === 'ios' ? 28 : 16,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  capsuleWrap: { flex: 1, zIndex: 5 }, // капля дока поверх кнопки настроек
  segCap: {
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'rgba(28,28,34,0.94)',
  },
  segCapGlass: { overflow: 'hidden' },
  segCapLight: { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' },
  segIndLight: { backgroundColor: 'rgba(255,255,255,0.28)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.22)' },
  segCapRow: { flex: 1 },
  // отступ под переключателем, за которым сразу идёт следующий блок
  segBlock: { marginBottom: 16 },
  // одна и та же рамка (5 pt внутрь от краёв капсулы) для плашки и подписей
  segTrack: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5 },
  segTrackRow: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, flexDirection: 'row' },
  seg: { flex: 1, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  segInd: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.17)',
  },
  // твёрдое стекло плашки дока: чуть плотнее и с яркой кромкой
  segIndSolid: { backgroundColor: 'rgba(255,255,255,0.2)' },
  // StyleSheet.absoluteFillObject в этой версии RN нет — заливка задана явно
  lqClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  lqRim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.75)' },
  lqFringe: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 1.5 },
  lqFringeR: { borderColor: 'rgba(255,70,90,0.45)', transform: [{ translateX: -1.2 }] },
  lqFringeB: { borderColor: 'rgba(80,170,255,0.45)', transform: [{ translateX: 1.2 }] },
  // мягкий верхний блик на всю ширину; форму даёт обрезка lqClip (без своих скруглений)
  lqHost: { zIndex: 5, overflow: 'visible' },
  lqCanvas: { position: 'absolute' },
  lqDrop: {
    position: 'absolute',
    zIndex: 10,
    // без сплошного фона: тень (iOS) строится по кромке, капля остаётся прозрачной
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 10,
  },
  lqDropFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.05)' },
  // мягкие блики: сверху два слабых слоя (плавный край), снизу — отражение
  lqHi: { position: 'absolute', left: 0, right: 0 },
  lqHiTop1: { top: 0, height: '30%', backgroundColor: 'rgba(255,255,255,0.05)' },
  lqHiTop2: { top: 0, height: '16%', backgroundColor: 'rgba(255,255,255,0.05)' },
  lqHiBot: { bottom: 0, height: '14%', backgroundColor: 'rgba(255,255,255,0.04)' },
  // подписи-линза по центру капли, размер — как у плашки в панели
  lqDropLabels: { position: 'absolute' },
  lqOutline: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 0.6, borderColor: 'rgba(0,0,0,0.55)' },
  lqLab: { position: 'absolute', top: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  lqTxtR: { color: 'rgba(255,80,100,0.55)', transform: [{ translateX: -1 }] },
  lqTxtB: { color: 'rgba(90,170,255,0.55)', transform: [{ translateX: 1 }] },
  segTxt: { color: 'rgba(235,235,245,0.5)', fontSize: 15, fontWeight: '600' },
  segTxtOn: { color: '#fff' },
  segTxtAbs: { position: 'absolute' },
  segIconOn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  gearDock: { width: 64, height: 64 },
  exportIconBtn: { alignSelf: 'stretch', height: 56, marginTop: 0, marginBottom: 10 },
  exportIconHit: { width: '100%', height: 56 },
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
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  // шторка — сплошная системная тёмно-серая (iOS secondarySystemBackground), без стекла: фон не просвечивает
  sheet: {
    backgroundColor: '#1C1C1E',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
    boxShadow: '0px 18px 48px rgba(0,0,0,0.6), 0px 3px 10px rgba(0,0,0,0.32)',
    overflow: 'hidden',
    borderRadius: 28,
    marginHorizontal: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
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
  sheetTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
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
    paddingHorizontal: 16,
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
  dangerBtn: { backgroundColor: '#ff453a', borderColor: '#ff453a', marginTop: 4 },
  okBtn: { backgroundColor: '#30d158', borderColor: '#30d158' },
  tplCheck: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(235,235,245,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tplCheckTxt: { color: '#fff', fontSize: 15, fontWeight: '800', lineHeight: 18 },
  solidTxt: { color: '#fff', fontWeight: '700' },
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
  lTitle: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'left' },
  lSub: { color: 'rgba(235,235,245,0.42)', fontSize: 12, marginTop: 2 },
  sectionLabel: {
    color: 'rgba(235,235,245,0.5)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 6,
    textAlign: 'left',
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
  actBtnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
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
  setS: { color: 'rgba(235,235,245,0.55)', fontSize: 12, marginTop: 2 },


  anRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
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
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  chipOn: { backgroundColor: 'rgba(48,209,88,0.34)', borderColor: 'rgba(48,209,88,0.5)' },
  chipTxt: { color: 'rgba(235,235,245,0.75)', fontSize: 13, fontWeight: '600' },
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
  bkHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 4 },
  bkHeadTxt: { color: '#fff', fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  bkBadge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff9f0a' },
  bkBadgeTxt: { color: '#000', fontSize: 13, fontWeight: '800' },
  bkList: { borderRadius: 24, marginBottom: 16, paddingHorizontal: 14 },
  bkURow: { flexDirection: 'row', alignItems: 'center', minHeight: 62, gap: 12 },
  bkQ: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,159,10,0.16)', borderWidth: 1, borderColor: 'rgba(255,159,10,0.5)' },
  bkQTxt: { color: '#ff9f0a', fontSize: 17, fontWeight: '800' },
  bkCard: { borderRadius: 30, padding: 20, paddingBottom: 16, marginBottom: 6 },
  bkTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  bkFlow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bkArrow: { fontSize: 24, fontWeight: '800', width: 20, textAlign: 'center' },
  bkFlowNum: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8, fontVariant: ['tabular-nums'], flexShrink: 1 },
  bkGoalHit: { marginLeft: 10 },
  bkGoal: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 34, paddingHorizontal: 13, borderRadius: 17, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  bkDot: { width: 8, height: 8, borderRadius: 4 },
  bkGoalTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  bkAxis: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' },
  bkAxisTxt: { color: 'rgba(235,235,245,0.4)', fontSize: 11, fontWeight: '600' },
  bkFoot: { fontSize: 13, fontWeight: '700', marginTop: 10 },
  bkTip: { borderRadius: 22, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  bkSave: { color: '#30d158', fontSize: 17, fontWeight: '800' },
  bkCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' },
  bkStep: { flexDirection: 'row', gap: 8, marginTop: 12 },
  bkStepBtn: { flex: 1, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  bkInput: {
    width: SCREEN_W - 48,
    height: 46,
    borderRadius: 14,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 6,
  },
  bankSub: { backgroundColor: 'rgba(255,255,255,0.03)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  // неоновый график: прозрачная карточка — только тонкая кромка, без заливки
  chartCard: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingTop: 10,
    paddingBottom: 12,
    paddingRight: 10,
    marginBottom: 14,
  },
  chartLegend: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 14, paddingRight: 4, marginTop: 6, gap: 8 },
  chartLeg: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  chartDot: { width: 9, height: 9, borderRadius: 5 },
  chartLegK: { color: 'rgba(235,235,245,0.55)', fontSize: 12, fontWeight: '600' },
  chartLegV: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
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
  calcMetaStrong: { color: 'rgba(235,235,245,0.8)', fontWeight: '600' },
  calcSegs: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 6 },
  slotRow: { marginBottom: 10 },
  slotTotal: { color: 'rgba(235,235,245,0.7)', fontSize: 14, textAlign: 'center', marginTop: 8 },
  dayTotalRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2 },
  expCard: { backgroundColor: 'rgb(22,22,28)', borderRadius: 22, padding: 16, marginBottom: 12 },
  expTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  expSub: { color: 'rgba(235,235,245,0.6)', fontSize: 13, marginTop: 2, marginBottom: 10 },
  expRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  expDayTot: { backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 8, borderRadius: 8 },
  expDay: { color: 'rgba(235,235,245,0.7)', fontSize: 13, width: 78 },
  expT: { color: '#fff', fontSize: 14, fontWeight: '600' },
  expM: { color: 'rgba(235,235,245,0.55)', fontSize: 12, marginTop: 1 },
  expPay: { color: 'rgba(235,235,245,0.8)', fontSize: 13, marginBottom: 10 },
  expPayB: { color: '#fff', fontWeight: '700' },
  // печать — в правом нижнем углу карточки, поверх итога (как на чеке)
  expStamp: { alignSelf: 'flex-end', marginTop: -44, marginRight: 6, opacity: 0.95 },
  expA: { color: '#fff', fontSize: 14, fontWeight: '700' },
  expLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  expNet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 4,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  expNetK: { color: '#fff', fontSize: 16, fontWeight: '600' },
  expNetV: { fontSize: 22, fontWeight: '800' },
  rowHi: { ...StyleSheet.absoluteFillObject, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.09)', opacity: 0 },
  rowHiOn: { opacity: 1 },
  dayTotalL: { flex: 1, color: 'rgba(235,235,245,0.7)', fontSize: 13 },
  dayTotalV: { fontSize: 15, fontWeight: '700' },
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
  boxHead: { marginTop: 16 },
  boxGap: { marginTop: 14 },
  boxLast: { borderBottomWidth: 0 },
  useZero: { color: 'rgba(235,235,245,0.35)' },
  // «Расход»: заголовок блока по левому краю, подпись сразу за ним
  useHeadT: { color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'left' },
  sumL: { color: 'rgba(235,235,245,0.75)', fontSize: 15, flex: 1, textAlign: 'left' },
  sumDim: { color: 'rgba(235,235,245,0.4)' },
  sumV: { color: '#fff', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'], marginLeft: 12 },
  tallyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  tallyDel: { color: '#ff453a', fontSize: 16, fontWeight: '700', width: 18, textAlign: 'center' },
  showAll: { textAlign: 'center', paddingVertical: 8 },
  keyBarWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 50 },
  // стеклянная капсула над клавиатурой; лёгкая подложка + кромка на самом виде — панель видна,
  // даже если стекло не нарисовалось
  keyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginHorizontal: 8,
    marginBottom: 6,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: 'rgba(44,44,50,0.5)',
  },
  keyBarRound: {
    width: 48,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
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
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBarHideTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
  keyBarNext: {
    minWidth: 108,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyBarNextTxt: { color: '#102012', fontSize: 17, fontWeight: '700' },
});