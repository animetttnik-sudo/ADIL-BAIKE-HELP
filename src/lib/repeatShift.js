/**
 * «Как прошлая смена»: черновик новой смены — название и место как у последней своей смены,
 * дата — следующий свободный день после последней смены в показанном периоде (или fallback).
 */
import { addDays, workPeriod } from './periods.js';

const own = (s) => s && typeof s.date === 'string' && s.source !== 'calc';

export function repeatShiftDraft(shifts, payday, fallbackDate, today) {
  const list = (shifts || []).filter(own);
  if (!list.length) return null;
  const past = list.filter((s) => s.date <= today && s.title);
  const pool = past.length ? past : list.filter((s) => s.title);
  if (!pool.length) return null;
  const src = pool.reduce((a, b) => (b.date >= a.date ? b : a));
  const per = workPeriod(payday);
  const taken = new Set((shifts || []).filter((s) => s && typeof s.date === 'string').map((s) => s.date));
  const inPer = list.filter((s) => s.date >= per.start && s.date <= per.end).map((s) => s.date).sort();
  let date = fallbackDate;
  if (inPer.length) {
    let d = addDays(inPer[inPer.length - 1], 1);
    while (d <= per.end && taken.has(d)) d = addDays(d, 1);
    if (d <= per.end) date = d;
  }
  return { date, title: src.title, place: src.place || '' };
}
