/**
 * Текст из PDF на чистом JS (Expo Go, без нативных модулей) — для «Импорт PDF» в «Расчёте кассы».
 * Рассчитан на «Microsoft Print to PDF» (и похожие): потоки FlateDecode, шрифты Type0/Identity-H
 * с картой ToUnicode, строки Tj/TJ (hex и литеральные), позиции Tm/Td/TD/T*, cm/q/Q.
 * Поддержаны также объектные потоки (ObjStm), простые шрифты (WinAnsi/латиница) и Form XObject.
 *
 * pdfLines(bytes) → массив строк текста сверху вниз (элементы одной строки — слева направо).
 * Тесты: tests/pdfText.test.mjs (образец отчёта «СТмах» через Microsoft Print to PDF).
 */
import { inflate } from 'pako';

const latin1 = (bytes, a = 0, b = bytes.length) => {
  let s = '';
  const CH = 0x8000;
  for (let i = a; i < b; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(b, i + CH)));
  return s;
};
const toBytes = (str) => {
  const u = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 255;
  return u;
};

// ── объекты файла ─────────────────────────────────────────────────────────
function readObjects(bytes) {
  const src = latin1(bytes);
  const objs = new Map(); // num → { dict: string, stream: Uint8Array|null }
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(src))) {
    const num = Number(m[1]);
    const start = m.index + m[0].length;
    const end = src.indexOf('endobj', start);
    const stop = end < 0 ? src.length : end;
    const sIdx = src.indexOf('stream', start);
    let dict = src.slice(start, stop);
    let stream = null;
    if (sIdx >= 0 && sIdx < stop && src.slice(sIdx - 3, sIdx) !== 'end') {
      dict = src.slice(start, sIdx);
      let p = sIdx + 6;
      if (src[p] === '\r') p++;
      if (src[p] === '\n') p++;
      const lenM = /\/Length\s+(\d+)(\s+\d+\s+R)?/.exec(dict);
      let len = lenM && !lenM[2] ? Number(lenM[1]) : -1;
      const es = src.indexOf('endstream', p);
      if (len < 0 || p + len > src.length || (es >= 0 && p + len > es)) len = (es < 0 ? stop : es) - p;
      stream = bytes.subarray(p, p + len);
    }
    objs.set(num, { dict, stream });
    if (end > 0) re.lastIndex = end;
  }
  // объектные потоки: объекты без собственных потоков упакованы внутрь
  for (const [, o] of [...objs]) {
    if (!o.stream || !/\/Type\s*\/ObjStm/.test(o.dict)) continue;
    const data = latin1(decodeStream(o));
    const n = Number((/\/N\s+(\d+)/.exec(o.dict) || [])[1] || 0);
    const first = Number((/\/First\s+(\d+)/.exec(o.dict) || [])[1] || 0);
    const head = data.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = head[i * 2];
      const off = first + head[i * 2 + 1];
      const next = i + 1 < n ? first + head[(i + 1) * 2 + 1] : data.length;
      if (!objs.has(num)) objs.set(num, { dict: data.slice(off, next), stream: null });
    }
  }
  return objs;
}

function decodeStream(o) {
  if (!o || !o.stream) return new Uint8Array(0);
  if (/\/FlateDecode|\/Fl\b/.test(o.dict)) {
    try {
      return inflate(o.stream);
    } catch {
      // поток с мусором в конце — пробуем по частям
      try {
        return inflate(o.stream.subarray(0, o.stream.length - 1));
      } catch {
        return new Uint8Array(0);
      }
    }
  }
  return o.stream;
}

const ref = (s, key) => {
  const m = new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`).exec(s);
  return m ? Number(m[1]) : null;
};
/** Значение-словарь /Key << … >> (с вложенными) или по ссылке. */
function dictValue(objs, s, key) {
  const i = s.search(new RegExp(`/${key}\\s*(<<|\\d+\\s+\\d+\\s+R)`));
  if (i < 0) return null;
  const rest = s.slice(i + key.length + 1).trimStart();
  if (rest.startsWith('<<')) return balanced(rest);
  const r = /^(\d+)\s+\d+\s+R/.exec(rest);
  return r && objs.get(Number(r[1])) ? objs.get(Number(r[1])).dict : null;
}
function balanced(s) {
  let depth = 0;
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === '<' && s[i + 1] === '<') {
      depth++;
      i++;
    } else if (s[i] === '>' && s[i + 1] === '>') {
      depth--;
      i++;
      if (depth === 0) return s.slice(0, i + 1);
    }
  }
  return s;
}
/** Пары /Name N 0 R из словаря. */
const namedRefs = (d) => {
  const out = {};
  if (!d) return out;
  const re = /\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g;
  let m;
  while ((m = re.exec(d))) out[m[1]] = Number(m[2]);
  return out;
};

// ── шрифты и ToUnicode ────────────────────────────────────────────────────
function hexToStr(h) {
  let s = '';
  for (let i = 0; i + 3 < h.length + 0; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
  if (h.length % 4 === 2) s += String.fromCharCode(parseInt(h.slice(-2), 16));
  return s;
}
export function parseCMap(text) {
  const map = new Map();
  let codeLen = 0;
  const cs = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(text);
  if (cs) {
    const h = /<([0-9a-fA-F]+)>/.exec(cs[1]);
    if (h) codeLen = h[1].length / 2;
  }
  for (const blk of text.match(/beginbfchar([\s\S]*?)endbfchar/g) || []) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g;
    let m;
    while ((m = re.exec(blk))) {
      map.set(parseInt(m[1], 16), hexToStr(m[2]));
      if (!codeLen) codeLen = m[1].length / 2;
    }
  }
  for (const blk of text.match(/beginbfrange([\s\S]*?)endbfrange/g) || []) {
    const re = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<([0-9a-fA-F]*)>|\[([^\]]*)\])/g;
    let m;
    while ((m = re.exec(blk))) {
      const lo = parseInt(m[1], 16);
      const hi = parseInt(m[2], 16);
      if (!codeLen) codeLen = m[1].length / 2;
      if (m[4] !== undefined) {
        const base = hexToStr(m[4]);
        const last = base.charCodeAt(base.length - 1);
        for (let c = lo; c <= hi && c - lo < 65536; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(last + (c - lo)));
      } else {
        const list = (m[5].match(/<([0-9a-fA-F]*)>/g) || []).map((x) => hexToStr(x.slice(1, -1)));
        list.forEach((v, i) => map.set(lo + i, v));
      }
    }
  }
  return { map, codeLen: codeLen || 1 };
}

// cp1251 для простых шрифтов без ToUnicode (кириллица в старых генераторах)
const CP1251 = (() => {
  const t = {};
  const hi = 'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—\u0098™љ›њќћџ\u00a0ЎўЈ¤Ґ¦§Ё©Є«¬\u00ad®Ї°±Ііґµ¶·ё№є»јЅѕї';
  for (let i = 0; i < hi.length; i++) t[0x80 + i] = hi[i];
  for (let i = 0; i < 64; i++) t[0xc0 + i] = String.fromCharCode(0x410 + i);
  return t;
})();

/** Массив чисел /Key [ … ] (инлайн или по ссылке). */
function arrayValue(objs, s, key) {
  const m = new RegExp(`/${key}\\s*(\\[|(\\d+)\\s+\\d+\\s+R)`).exec(s);
  if (!m) return null;
  let src = '';
  if (m[1] === '[') src = s.slice(m.index + m[0].length - 1);
  else src = (objs.get(Number(m[2])) || {}).dict || '';
  const a = src.indexOf('[');
  if (a < 0) return null;
  let depth = 0;
  for (let i = a; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']' && --depth === 0) return src.slice(a, i + 1);
  }
  return src.slice(a);
}
/** Ширины глифов: Type0 — /W и /DW потомка, простой — /FirstChar + /Widths (в 1/1000 кегля). */
function fontWidths(objs, dict, type0) {
  const w = new Map();
  if (type0) {
    let desc = '';
    const dm = /\/DescendantFonts\s*(\[\s*(\d+)\s+\d+\s+R|\[\s*<<|(\d+)\s+\d+\s+R)/.exec(dict);
    if (dm && dm[2]) desc = (objs.get(Number(dm[2])) || {}).dict || '';
    else if (dm && dm[3]) {
      const arr = (objs.get(Number(dm[3])) || {}).dict || '';
      const r = /(\d+)\s+\d+\s+R/.exec(arr);
      desc = r ? (objs.get(Number(r[1])) || {}).dict || '' : arr;
    } else if (dm) desc = balanced(dict.slice(dict.indexOf('<<', dm.index)));
    const dw = Number((/\/DW\s+([\d.]+)/.exec(desc) || [])[1] || 1000);
    const W = arrayValue(objs, desc, 'W');
    if (W) {
      const toks = W.slice(1, -1).match(/\[|\]|[\d.]+/g) || [];
      let i = 0;
      while (i < toks.length) {
        const c = Number(toks[i++]);
        if (toks[i] === '[') {
          i++;
          let k = 0;
          while (i < toks.length && toks[i] !== ']') w.set(c + k++, Number(toks[i++]));
          i++;
        } else {
          const c2 = Number(toks[i++]);
          const v = Number(toks[i++]);
          for (let x = c; x <= c2 && x - c < 65536; x++) w.set(x, v);
        }
      }
    }
    return { w, dw };
  }
  const fc = Number((/\/FirstChar\s+(\d+)/.exec(dict) || [])[1] || 0);
  const Ws = arrayValue(objs, dict, 'Widths');
  if (Ws) (Ws.match(/[\d.]+/g) || []).forEach((v, i) => w.set(fc + i, Number(v)));
  return { w, dw: 500 };
}

function fontInfo(objs, num) {
  const f = objs.get(num);
  if (!f) return { map: null, codeLen: 1, cp: 'latin1', w: new Map(), dw: 500 };
  const tu = ref(f.dict, 'ToUnicode');
  const type0 = /\/Subtype\s*\/Type0/.test(f.dict);
  const { w, dw } = fontWidths(objs, f.dict, type0);
  if (tu && objs.get(tu)) {
    const cm = parseCMap(latin1(decodeStream(objs.get(tu))));
    return { map: cm.map, codeLen: type0 ? 2 : cm.codeLen, cp: 'latin1', w, dw };
  }
  const cyr = /1251|Cyr/i.test(f.dict);
  return { map: null, codeLen: type0 ? 2 : 1, cp: cyr ? 'cp1251' : 'latin1', w, dw };
}
/** Сдвиг (в единицах текста, без кегля) от показа строки: сумма ширин глифов / 1000. */
function advanceOf(font, bytes, tc, tw, size) {
  const n = font.codeLen;
  let adv = 0;
  for (let i = 0; i + n - 1 < bytes.length; i += n) {
    const code = n === 2 ? (bytes[i] << 8) | bytes[i + 1] : bytes[i];
    const g = font.w && font.w.has(code) ? font.w.get(code) : font.dw || 500;
    adv += (g / 1000) * size + tc + (n === 1 && code === 32 ? tw : 0);
  }
  return adv;
}
function decodeText(font, bytes) {
  let s = '';
  const n = font.codeLen;
  for (let i = 0; i + n - 1 < bytes.length; i += n) {
    const code = n === 2 ? (bytes[i] << 8) | bytes[i + 1] : bytes[i];
    if (font.map) {
      const u = font.map.get(code);
      s += u !== undefined ? u : n === 1 ? String.fromCharCode(code) : '';
    } else if (n === 2) {
      s += String.fromCharCode(code);
    } else {
      s += font.cp === 'cp1251' && code >= 0x80 ? CP1251[code] || '' : String.fromCharCode(code);
    }
  }
  return s;
}

// ── разбор потока содержимого ─────────────────────────────────────────────
function* tokens(src) {
  const n = src.length;
  let i = 0;
  const ws = (c) => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
  const delim = (ch) => '()<>[]{}/%'.includes(ch);
  while (i < n) {
    const c = src.charCodeAt(i);
    if (ws(c)) {
      i++;
      continue;
    }
    const ch = src[i];
    if (ch === '%') {
      while (i < n && src[i] !== '\n' && src[i] !== '\r') i++;
      continue;
    }
    if (ch === '(') {
      let depth = 1;
      let out = '';
      i++;
      while (i < n && depth > 0) {
        const d = src[i];
        if (d === '\\') {
          const e = src[i + 1];
          i += 2;
          if (e === 'n') out += '\n';
          else if (e === 'r') out += '\r';
          else if (e === 't') out += '\t';
          else if (e === 'b') out += '\b';
          else if (e === 'f') out += '\f';
          else if (e >= '0' && e <= '7') {
            let oct = e;
            while (oct.length < 3 && src[i] >= '0' && src[i] <= '7') oct += src[i++];
            out += String.fromCharCode(parseInt(oct, 8) & 255);
          } else if (e === '\r') {
            if (src[i] === '\n') i++;
          } else if (e !== '\n') out += e;
          continue;
        }
        if (d === '(') depth++;
        if (d === ')') {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        out += d;
        i++;
      }
      yield { t: 'str', v: toBytes(out) };
      continue;
    }
    if (ch === '<' && src[i + 1] === '<') {
      yield { t: 'op', v: '<<' };
      i += 2;
      continue;
    }
    if (ch === '>' && src[i + 1] === '>') {
      yield { t: 'op', v: '>>' };
      i += 2;
      continue;
    }
    if (ch === '<') {
      const e = src.indexOf('>', i);
      let h = src.slice(i + 1, e < 0 ? n : e).replace(/[^0-9a-fA-F]/g, '');
      if (h.length % 2) h += '0';
      const b = new Uint8Array(h.length / 2);
      for (let k = 0; k < b.length; k++) b[k] = parseInt(h.substr(k * 2, 2), 16);
      yield { t: 'str', v: b };
      i = e < 0 ? n : e + 1;
      continue;
    }
    if (ch === '[' || ch === ']') {
      yield { t: ch };
      i++;
      continue;
    }
    if (ch === '/') {
      let j = i + 1;
      while (j < n && !ws(src.charCodeAt(j)) && !delim(src[j])) j++;
      yield { t: 'name', v: src.slice(i + 1, j) };
      i = j;
      continue;
    }
    let j = i;
    while (j < n && !ws(src.charCodeAt(j)) && !delim(src[j])) j++;
    if (j === i) j = i + 1;
    const w = src.slice(i, j);
    i = j;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) yield { t: 'num', v: Number(w) };
    else if (w === 'BI') {
      // встроенная картинка — пропустить до EI
      const e = src.indexOf('EI', i);
      i = e < 0 ? n : e + 2;
    } else yield { t: 'op', v: w };
  }
}

const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

function runContent(objs, content, fonts, xobjs, ctm0, items, depth = 0) {
  let ctm = ctm0.slice();
  const stack = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let lm = tm;
  let font = { map: null, codeLen: 1, cp: 'latin1', w: new Map(), dw: 500 };
  let size = 12;
  let leading = 0;
  let tc = 0;
  let tw = 0;
  let th = 1;
  let ops = [];
  /** Показать текст: элемент с началом/концом по X (по ширинам глифов) и сдвиг матрицы текста. */
  const emit = (str, adv) => {
    const p = mul(tm, ctm);
    const end = mul(mul([1, 0, 0, 1, adv * th, 0], tm), ctm);
    if (str) items.push({ x: p[4], xe: end[4], y: p[5], h: Math.abs(size * (p[3] || p[0] || 1)) || size, s: str });
    tm = mul([1, 0, 0, 1, adv * th, 0], tm);
  };
  const nextLine = (tx, ty) => {
    lm = mul([1, 0, 0, 1, tx, ty], lm);
    tm = lm;
  };
  for (const tk of tokens(content)) {
    if (tk.t !== 'op') {
      ops.push(tk);
      continue;
    }
    const op = tk.v;
    const a = ops;
    ops = [];
    const nums = a.filter((x) => x.t === 'num').map((x) => x.v);
    switch (op) {
      case 'q':
        stack.push(ctm.slice());
        break;
      case 'Q':
        ctm = stack.pop() || ctm0.slice();
        break;
      case 'cm':
        if (nums.length >= 6) ctm = mul(nums.slice(-6), ctm);
        break;
      case 'BT':
        tm = [1, 0, 0, 1, 0, 0];
        lm = tm;
        break;
      case 'Tf': {
        const nm = a.find((x) => x.t === 'name');
        if (nm && fonts[nm.v]) font = fonts[nm.v];
        if (nums.length) size = nums[nums.length - 1];
        break;
      }
      case 'TL':
        if (nums.length) leading = nums[0];
        break;
      case 'Tc':
        if (nums.length) tc = nums[0];
        break;
      case 'Tw':
        if (nums.length) tw = nums[0];
        break;
      case 'Tz':
        if (nums.length) th = nums[0] / 100;
        break;
      case 'Tm':
        if (nums.length >= 6) {
          tm = nums.slice(-6);
          lm = tm;
        }
        break;
      case 'Td':
        if (nums.length >= 2) nextLine(nums[0], nums[1]);
        break;
      case 'TD':
        if (nums.length >= 2) {
          leading = -nums[1];
          nextLine(nums[0], nums[1]);
        }
        break;
      case 'T*':
        nextLine(0, -leading);
        break;
      case 'Tj':
      case "'":
      case '"': {
        if (op === '"' && nums.length >= 2) {
          tw = nums[0];
          tc = nums[1];
        }
        if (op !== 'Tj') nextLine(0, -leading);
        const s = a.filter((x) => x.t === 'str').pop();
        if (s) emit(decodeText(font, s.v), advanceOf(font, s.v, tc, tw, size));
        break;
      }
      case 'TJ': {
        let out = '';
        let adv = 0;
        for (const x of a) {
          if (x.t === 'str') {
            out += decodeText(font, x.v);
            adv += advanceOf(font, x.v, tc, tw, size);
          } else if (x.t === 'num') {
            adv -= (x.v / 1000) * size;
            if (x.v < -200) out += ' '; // крупный отступ внутри TJ — пробел между словами
          }
        }
        emit(out, adv);
        break;
      }
      case 'Do': {
        const nm = a.find((x) => x.t === 'name');
        const xo = nm && xobjs[nm.v] != null ? objs.get(xobjs[nm.v]) : null;
        if (xo && depth < 4 && /\/Subtype\s*\/Form/.test(xo.dict)) {
          const mtx = /\/Matrix\s*\[([^\]]*)\]/.exec(xo.dict);
          const fm = mtx ? mtx[1].trim().split(/\s+/).map(Number) : [1, 0, 0, 1, 0, 0];
          const res = resourcesOf(objs, xo.dict);
          runContent(objs, latin1(decodeStream(xo)), { ...fonts, ...res.fonts }, { ...xobjs, ...res.xobjs }, mul(fm, ctm), items, depth + 1);
        }
        break;
      }
      default:
        break;
    }
  }
}

function resourcesOf(objs, dict, inherited) {
  const res = dictValue(objs, dict, 'Resources') || inherited || '';
  const fontRefs = namedRefs(dictValue(objs, res, 'Font'));
  const fonts = {};
  for (const k of Object.keys(fontRefs)) fonts[k] = fontInfo(objs, fontRefs[k]);
  return { fonts, xobjs: namedRefs(dictValue(objs, res, 'XObject')), res };
}

function pageContents(objs, dict) {
  const arr = /\/Contents\s*\[([^\]]*)\]/.exec(dict);
  const nums = arr ? [...arr[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1])) : [ref(dict, 'Contents')].filter((x) => x != null);
  return nums.map((n) => latin1(decodeStream(objs.get(n)))).join('\n');
}

/** Элементы текста → строки: группировка по Y (допуск ~ полвысоты шрифта), внутри — по X. */
export function groupLines(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const tol = Math.max(2, (it.h || 10) * 0.45);
    const line = lines.find((l) => Math.abs(l.y - it.y) <= tol);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((l) =>
      l.items
        .sort((a, b) => a.x - b.x)
        .reduce((acc, it, i, arr) => {
          if (!i) return it.s;
          const prev = arr[i - 1];
          // пробел только при заметном зазоре: генераторы режут слова на куски («Bur»+«ger», кернинг)
          const gap = prev.xe != null ? it.x - prev.xe : Infinity;
          const sp = gap > Math.max(1, (it.h || 10) * 0.18) && !/\s$/.test(acc) && !/^\s/.test(it.s);
          return acc + (sp ? ' ' : '') + it.s;
        }, '')
        .replace(/[\u0000-\u001f]/g, ' ')
        .replace(/\s+$/g, '')
    )
    .filter((s) => s.trim());
}

/** Строки текста PDF (по страницам, сверху вниз). Ошибка с понятным текстом, если текста нет. */
export function pdfLines(bytes) {
  if (!bytes || bytes.length < 8 || latin1(bytes, 0, 5) !== '%PDF-') throw new Error('Это не PDF-файл');
  if (/\/Encrypt\s/.test(latin1(bytes, Math.max(0, bytes.length - 4096)))) throw new Error('PDF защищён паролем — сохраните отчёт без защиты');
  const objs = readObjects(bytes);
  const pages = [...objs.entries()].filter(([, o]) => /\/Type\s*\/Page(?!s)\b/.test(o.dict)).sort((a, b) => a[0] - b[0]);
  // наследуемые ресурсы из /Pages
  const parentRes = (o) => {
    let p = ref(o.dict, 'Parent');
    for (let k = 0; p != null && k < 10; k++) {
      const po = objs.get(p);
      if (!po) break;
      const r = dictValue(objs, po.dict, 'Resources');
      if (r) return r;
      p = ref(po.dict, 'Parent');
    }
    return '';
  };
  const out = [];
  for (const [, pg] of pages) {
    const { fonts, xobjs } = resourcesOf(objs, pg.dict, parentRes(pg));
    const items = [];
    runContent(objs, pageContents(objs, pg.dict), fonts, xobjs, [1, 0, 0, 1, 0, 0], items);
    out.push(...groupLines(items));
  }
  if (!out.some((l) => /[0-9A-Za-zА-Яа-яЁё]/.test(l))) {
    throw new Error('В этом PDF нет текста (только картинка). Распечатайте отчёт в PDF ещё раз из программы — не сканом.');
  }
  return out;
}

/** base64 → байты (если файл прочитан строкой base64). */
export function base64ToBytes(b64) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = String(b64).replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (A.indexOf(clean[i]) << 18) | (A.indexOf(clean[i + 1]) << 12) | ((A.indexOf(clean[i + 2]) & 63) << 6) | (A.indexOf(clean[i + 3]) & 63);
    out[o++] = (n >> 16) & 255;
    if (clean[i + 2] !== undefined) out[o++] = (n >> 8) & 255;
    if (clean[i + 3] !== undefined) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}
