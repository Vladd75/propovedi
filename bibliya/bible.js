/* bible.js — «Библия» на сайте проповедей: поиск и окошко со стихом.

   Один файл на две роли:
   - на странице bibliya.html — строка поиска и текст главы;
   - на страницах бесед — окошко снизу по нажатию на ссылку [Мф. 5:17].

   Поиск повторяет окно «📖 Библия» из Max Viewer (bible_window.py) и
   bible_quotes.py: те же norm(), similarity() и отбор кандидатов. Сходство
   там считает питоновский difflib — здесь он переписан один в один, чтобы
   сайт находил то же, что программа. Сверка двух вариантов:
   _проверка поиска (браузер и программа).py рядом с publish_sermons.py.

   Собирается и кладётся на сайт скриптом publish_sermons.py (bible_site.py).
   Править здесь, в assets, а не в site\bibliya — там копия. */
(function (root) {
'use strict';

// ------------------------------------------------------------------ книги
var BOOKS = {}, ABBR = {}, ORDER = [];

function setBooks(list) {            // [[номер, "Мф", "От Матфея", глав, [сокращения]], …]
  BOOKS = {}; ABBR = {}; ORDER = [];
  for (var i = 0; i < list.length; i++) {
    var b = list[i];
    BOOKS[b[0]] = { id: b[0], short: b[1], name: b[2], chapters: b[3] };
    ORDER.push(b[0]);
    for (var k = 0; k < b[4].length; k++) ABBR[b[4][k]] = b[0];
  }
}

function refLabel(book, ch, v1, v2) {
  var s = BOOKS[book].short + '. ' + ch + ':' + v1;
  return (v2 && v2 !== v1) ? s + '-' + v2 : s;
}

// ------------------------------------------------------------------ разбор запроса
var REF_RE = /^\s*(\d?)\s*([А-Яа-яЁё]+)\.?\s*(\d+)\s*[:,.]\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*(\?)?\s*$/;
var CHAPTER_RE = /^\s*(\d?)\s*([А-Яа-яЁё]+)\.?\s*(\d+)\s*$/;

function bookByName(num, name) {
  return ABBR[(num || '') + name.toLowerCase().replace(/ё/g, 'е')] || null;
}

function parseRef(s) {               // «Мф. 5:3-5» -> {book, ch, v1, v2}
  var m = REF_RE.exec(s);
  if (!m) return null;
  var book = bookByName(m[1], m[2]);
  if (!book) return null;
  var v1 = parseInt(m[4], 10), v2 = m[5] ? parseInt(m[5], 10) : v1, t;
  if (v2 < v1) { t = v1; v1 = v2; v2 = t; }
  return { book: book, ch: parseInt(m[3], 10), v1: v1, v2: v2 };
}

function parseChapter(s) {           // «Ин 3» -> {book, ch}
  var m = CHAPTER_RE.exec(s);
  if (!m) return null;
  var book = bookByName(m[1], m[2]);
  return book ? { book: book, ch: parseInt(m[3], 10) } : null;
}

/* Адрес стиха в ссылке — числами, чтобы его не портили мессенджеры:
   40.5.17 · 40.5.17-19 · 40.5 (глава) · 43.6.51,56 · 44.7.58;44.8.1 */
function parseHash(s) {
  var segs = [], parts = String(s).split(';');
  for (var i = 0; i < parts.length; i++) {
    var m = /^(\d+)\.(\d+)(?:\.([\d,\-]+))?$/.exec(parts[i]);
    if (!m || !BOOKS[+m[1]]) return null;
    var ranges = [], rs = m[3] ? m[3].split(',') : [];
    for (var k = 0; k < rs.length; k++) {
      var r = /^(\d+)(?:-(\d+))?$/.exec(rs[k]);
      if (!r) return null;
      ranges.push([+r[1], r[2] ? +r[2] : +r[1]]);
    }
    segs.push({ book: +m[1], ch: +m[2], ranges: ranges });
  }
  return segs.length ? segs : null;
}

// ------------------------------------------------------------------ сходство (как в bible_quotes.py)
function norm(s) {
  return s.replace(/<[^>]+>/g, ' ').toLowerCase().replace(/ё/g, 'е')
    .replace(/[^а-яa-z0-9 ]+/g, ' ').split(' ').filter(Boolean).join(' ');
}

/* difflib.SequenceMatcher(None, a, b) с autojunk=True: строка b разбирается
   один раз, «популярные» буквы (чаще 1% + 1 при длине от 200) в поиск
   совпадений не идут — так делает Python, и без этого проценты разойдутся. */
function Matcher(b) {
  var n = b.length, b2j = Object.create(null), i, ch;
  for (i = 0; i < n; i++) { ch = b[i]; (b2j[ch] || (b2j[ch] = [])).push(i); }
  if (n >= 200) {
    var ntest = Math.floor(n / 100) + 1;
    for (ch in b2j) if (b2j[ch].length > ntest) delete b2j[ch];
  }
  this.b = b; this.b2j = b2j;
  this.cur = new Int32Array(n + 1); this.nxt = new Int32Array(n + 1);
}

Matcher.prototype.longest = function (a, alo, ahi, blo, bhi) {
  var b = this.b, b2j = this.b2j, cur = this.cur, nxt = this.nxt;
  var besti = alo, bestj = blo, bestsize = 0, i, x, idx, j, k, t;
  var tcur = [], tnxt;
  for (i = alo; i < ahi; i++) {
    tnxt = [];
    idx = b2j[a[i]];
    if (idx) for (x = 0; x < idx.length; x++) {
      j = idx[x];
      if (j < blo) continue;
      if (j >= bhi) break;
      k = cur[j] + 1;                // cur[j] — длина совпадения, кончающегося в j-1
      nxt[j + 1] = k; tnxt.push(j + 1);
      if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
    }
    for (x = 0; x < tcur.length; x++) cur[tcur[x]] = 0;
    t = cur; cur = nxt; nxt = t; tcur = tnxt;
  }
  for (x = 0; x < tcur.length; x++) cur[tcur[x]] = 0;
  this.cur = cur; this.nxt = nxt;
  while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) { besti--; bestj--; bestsize++; }
  while (besti + bestsize < ahi && bestj + bestsize < bhi &&
         a[besti + bestsize] === b[bestj + bestsize]) bestsize++;
  return [besti, bestj, bestsize];
};

Matcher.prototype.matches = function (a, alo, ahi, blo, bhi) {
  var m = this.longest(a, alo, ahi, blo, bhi), i = m[0], j = m[1], k = m[2];
  if (!k) return 0;
  var total = k;
  if (alo < i && blo < j) total += this.matches(a, alo, i, blo, j);
  if (i + k < ahi && j + k < bhi) total += this.matches(a, i + k, ahi, j + k, bhi);
  return total;
};

Matcher.prototype.ratio = function (a) {
  var len = a.length + this.b.length;
  return len ? 2.0 * this.matches(a, 0, a.length, 0, this.b.length) / len : 1.0;
};

/* Сходство 0..1. Запрос может быть частью стиха — сравниваем и целиком,
   и с окном той же длины (в словах) внутри стиха. Обе строки уже norm(). */
function similarityN(q, v) {
  if (!q || !v) return 0.0;
  var best = new Matcher(v).ratio(q);
  var qw = q.split(' '), vw = v.split(' '), n = qw.length, i, r;
  if (n < vw.length) {
    for (i = 0; i + n <= vw.length; i++) {
      r = new Matcher(vw.slice(i, i + n).join(' ')).ratio(q);
      if (r > best) best = r;
    }
  }
  return best;
}

function similarity(quote, verse) { return similarityN(norm(quote), norm(verse)); }

// ------------------------------------------------------------------ поиск по словам
/* all — {номер книги: [глава: [стих, стих, …]]}. Порядок в индексе — по
   книге, главе, стиху: на него опирается порядок при равном сходстве. */
function makeIndex(all) {
  var ids = Object.keys(all).map(Number).sort(function (x, y) { return x - y; });
  var ix = { book: [], ch: [], v: [], text: [], norm: [], pad: [] };
  for (var i = 0; i < ids.length; i++) {
    var chapters = all[ids[i]];
    for (var c = 0; c < chapters.length; c++) {
      for (var v = 0; v < chapters[c].length; v++) {
        var t = chapters[c][v];
        if (!t) continue;
        ix.book.push(ids[i]); ix.ch.push(c + 1); ix.v.push(v + 1);
        var nt = norm(t);
        ix.text.push(t); ix.norm.push(nt); ix.pad.push(' ' + nt + ' ');
      }
    }
  }
  return ix;
}

/* То же, что BibleWindow._run_search. wordMode=false — по смыслу фразы,
   true — нужны все слова запроса. В отбор идут все слова: короткое (до 5
   букв) — только целым словом, длинное — по вхождению. Редкое слово весит
   больше частого; вес — целое число, чтобы совпадать с программой до знака.
   При равном сходстве Новый Завет чуть выше (+0.03). */
function bitLength(x) { var n = 0; while (x > 0) { n++; x = Math.floor(x / 2); } return n; }

function search(ix, query, bookId, wordMode, top) {
  var q = norm(query), seen = {}, words = [], i, j, n;
  q.split(' ').forEach(function (w) { if (w && !seen[w]) { seen[w] = 1; words.push(w); } });
  if (!words.length) return { found: [], words: words };
  var needles = words.map(function (w) { return w.length >= 5 ? w : ' ' + w + ' '; });
  var counts = words.map(function () { return 0; }), matched = [];
  for (n = 0; n < ix.pad.length; n++) {
    var hit = null;
    for (j = 0; j < needles.length; j++) {
      if (ix.pad[n].indexOf(needles[j]) >= 0) { (hit || (hit = [])).push(j); counts[j]++; }
    }
    if (hit && (!bookId || ix.book[n] === bookId)) matched.push([n, hit]);
  }
  var total = 0, weight = counts.map(function (c) {
    var w = c ? bitLength(Math.floor(ix.pad.length / c)) : 0;
    total += w;
    return w;
  });
  var cands = [];
  for (i = 0; i < matched.length; i++) {
    var score = 0, h = matched[i][1];
    for (j = 0; j < h.length; j++) score += weight[h[j]];
    if (wordMode ? h.length === words.length : score * 3 >= total) cands.push([score, matched[i][0]]);
  }
  var desc = function (x, y) { return (y[0] - x[0]) || (y[1] - x[1]); };
  cands.sort(desc);
  var out = [];
  for (i = 0; i < cands.length && i < 100; i++) {
    n = cands[i][1];
    var bonus = (ix.book[n] >= 40 && ix.book[n] <= 66) ? 0.03 : 0.0;
    out.push([similarityN(q, ix.norm[n]) + bonus, n]);
  }
  out.sort(desc);
  return {
    words: words,
    found: out.slice(0, top || 10).map(function (o) {
      return { score: o[0], book: ix.book[o[1]], ch: ix.ch[o[1]], v: ix.v[o[1]], text: ix.text[o[1]] };
    })
  };
}

var core = {
  setBooks: setBooks, refLabel: refLabel, parseRef: parseRef, parseChapter: parseChapter,
  parseHash: parseHash, norm: norm, similarity: similarity, makeIndex: makeIndex, search: search
};
if (typeof module !== 'undefined' && module.exports) { module.exports = core; return; }

// ================================================================== дальше — только браузер
setBooks(root.BIBLE_BOOKS || []);
var BASE = (document.currentScript ? document.currentScript.src : '').replace(/[^\/]*$/, '');
var bookCache = {}, indexPromise = null;

function getJSON(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function loadBook(id) {              // одна книга — 20–90 КБ
  if (!bookCache[id]) {
    bookCache[id] = getJSON(BASE + 'b/' + id + '.json');
    bookCache[id].catch(function () { delete bookCache[id]; });
  }
  return bookCache[id];
}

function loadIndex() {               // весь текст — один раз, при первом поиске по словам
  if (!indexPromise) {
    indexPromise = getJSON(BASE + 'all.json').then(function (all) {
      for (var id in all) bookCache[id] = Promise.resolve(all[id]);
      return makeIndex(all);
    });
    indexPromise.catch(function () { indexPromise = null; });
  }
  return indexPromise;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hashOf(book, ch, v1, v2) {
  var s = book + '.' + ch;
  if (v1) s += '.' + v1 + (v2 && v2 !== v1 ? '-' + v2 : '');
  return s;
}

function addStyle(css) {
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
}

// ------------------------------------------------------------------ «Назад к беседе»
/* Со страницы беседы на «Библию» уходят посреди чтения. Чтобы было куда
   вернуться, беседа при уходе запоминает себя: адрес, место в тексте и
   минуту записи. «Библия» показывает кнопку «← Назад к беседе», а беседа,
   открывшись по ней, встаёт на то же место (запись — на паузе, с той же минуты).
   Память — на вкладку (sessionStorage): закрыли страницу — забылось. */
var BACK_KEY = 'sermonBack', RETURN_KEY = 'sermonReturn';

function store(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}
function recall(key) {
  try { return JSON.parse(sessionStorage.getItem(key)); } catch (e) { return null; }
}

/* «▶ Продолжить с 12:34» у плеера части: место в записи запоминается само (раз в
   5 секунд, на паузе), у каждого читателя в его браузере. Дослушал до конца — забылось.
   Кнопка появляется, если остановились дальше первых 30 секунд. Сама запись не
   перематывается, пока человек не нажмёт — вдруг он хочет начать сначала. */
function initListenResume(aud, returning) {
  if (!aud) return;
  var key = 'listen:' + location.pathname, last = 0, saved = 0;
  try { saved = +localStorage.getItem(key) || 0; } catch (e) {}
  function put(t) {
    try { if (t > 0) localStorage.setItem(key, String(Math.floor(t))); else localStorage.removeItem(key); } catch (e) {}
  }
  aud.addEventListener('timeupdate', function () {
    var now = Date.now();
    if (now - last > 5000 && aud.currentTime > 0) { last = now; put(aud.currentTime); }
  });
  aud.addEventListener('pause', function () { if (aud.currentTime > 0) put(aud.currentTime); });
  aud.addEventListener('ended', function () { put(0); });
  if (returning || saved <= 30) return;      // возврат из «Библии» ставит место сам
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'resume';
  btn.textContent = '▶ Продолжить с ' + Math.floor(saved / 60) + ':' + ('0' + saved % 60).slice(-2);
  btn.onclick = function () {
    var seek = function () { try { aud.currentTime = saved; } catch (e) {} aud.play(); };
    if (aud.readyState >= 1) seek(); else aud.addEventListener('loadedmetadata', seek, { once: true });
  };
  aud.addEventListener('play', function () { if (btn.parentNode) btn.parentNode.removeChild(btn); });
  aud.parentNode.insertBefore(btn, aud.nextSibling);
}

function initSermonMemory() {
  var aud = document.getElementById('aud');
  var back = recall(BACK_KEY);
  var returning = !!(recall(RETURN_KEY) && back && back.url === location.pathname);
  initListenResume(aud, returning);
  if (returning) {
    var restore = function () { window.scrollTo(0, back.y || 0); };
    restore(); window.addEventListener('load', restore);
    if (aud && back.t > 0) {
      var seek = function () { try { aud.currentTime = back.t; } catch (e) {} };
      if (aud.readyState >= 1) seek(); else aud.addEventListener('loadedmetadata', seek);
    }
  }
  store(RETURN_KEY, null);
  window.addEventListener('pagehide', function () {
    var h = document.querySelector('h1');
    store(BACK_KEY, { url: location.pathname, y: window.pageYOffset,
                      t: aud ? aud.currentTime : 0, title: h ? h.textContent : '' });
  });
}

function initBackLink() {
  var link = document.getElementById('bback'), back = recall(BACK_KEY);
  if (!link || !back || !back.url) return;
  link.href = back.url;
  link.textContent = '← Назад к беседе' + (back.title ? ' (' + back.title.toLowerCase() + ')' : '');
  link.hidden = false;
  link.addEventListener('click', function () { store(RETURN_KEY, 1); });
}

// ------------------------------------------------------------------ окошко на странице беседы
function initSheet() {
  var sheet = null, seq = 0;
  addStyle(
    '.bsheet{position:fixed;left:0;right:0;bottom:0;z-index:50;max-height:62vh;display:flex;' +
    'flex-direction:column;background:var(--bg);color:var(--fg);border-top:2px solid var(--accent);' +
    'border-radius:14px 14px 0 0;box-shadow:0 -6px 24px rgba(0,0,0,.28)}' +
    '.bsheet-in{max-width:680px;width:100%;margin:0 auto;display:flex;flex-direction:column;min-height:0}' +
    '.bsheet-head{display:flex;align-items:center;gap:10px;padding:10px 14px 6px 20px}' +
    '.bsheet-title{flex:1;font-weight:600;font-size:17px;color:var(--accent)}' +
    '.bsheet-close{font:inherit;font-size:22px;line-height:1;width:40px;height:40px;border-radius:10px;' +
    'border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}' +
    '.bsheet-body{overflow-y:auto;padding:2px 20px 4px;font-size:19px;line-height:1.55}' +
    '.bsheet-body p{margin:0 0 .6em}.bsheet-body b{color:var(--muted);font-size:.72em;margin-right:.35em}' +
    '.bsheet-body .where{color:var(--muted);font-size:14px;margin:.4em 0 .3em}' +
    '.bsheet-more{display:block;padding:8px 20px 16px;font-size:15px;color:var(--accent);text-decoration:none}' +
    '.player .resume{font:inherit;font-size:15px;margin-top:10px;padding:7px 14px;border-radius:10px;' +
    'border:1px solid var(--accent);background:transparent;color:var(--accent);cursor:pointer}'
  );

  function close() {
    if (sheet) { sheet.parentNode.removeChild(sheet); sheet = null; }
  }

  function open(link, segs) {
    close();
    var my = ++seq, href = link.getAttribute('href');
    sheet = document.createElement('div');
    sheet.className = 'bsheet';
    sheet.innerHTML = '<div class="bsheet-in"><div class="bsheet-head"><span class="bsheet-title">' +
      esc(link.textContent.replace(/^\[|\]$/g, '')) + '</span>' +
      '<button type="button" class="bsheet-close" aria-label="Закрыть">×</button></div>' +
      '<div class="bsheet-body"><p style="color:var(--muted)">Открываю…</p></div>' +
      '<a class="bsheet-more" href="' + esc(href) + '">Открыть главу целиком →</a></div>';
    document.body.appendChild(sheet);
    sheet.querySelector('.bsheet-close').onclick = close;
    var body = sheet.querySelector('.bsheet-body');

    Promise.all(segs.map(function (s) { return loadBook(s.book); })).then(function (books) {
      if (my !== seq || !sheet) return;
      var html = [];
      segs.forEach(function (s, i) {
        var chapter = books[i][s.ch - 1] || [];
        if (segs.length > 1) html.push('<p class="where">' + esc(BOOKS[s.book].short) + '. ' + s.ch + '</p>');
        s.ranges.forEach(function (r) {
          for (var v = r[0]; v <= r[1]; v++) {
            if (chapter[v - 1]) html.push('<p><b>' + v + '</b>' + esc(chapter[v - 1]) + '</p>');
          }
        });
      });
      body.innerHTML = html.length ? html.join('') :
        '<p style="color:var(--muted)">Такого стиха в Синодальном переводе нет — возможно, в ссылке опечатка.</p>';
    }).catch(function () {
      if (my !== seq || !sheet) return;
      body.innerHTML = '<p style="color:var(--muted)">Не удалось загрузить текст — проверьте интернет.</p>';
    });
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a.bref') : null;
    if (!a) {
      if (sheet && !sheet.contains(e.target)) close();
      return;
    }
    var segs = parseHash(decodeURIComponent((a.getAttribute('href').split('#')[1] || '')));
    if (!segs) return;
    for (var i = 0; i < segs.length; i++) if (!segs[i].ranges.length) return;   // глава целиком — обычный переход
    e.preventDefault();
    open(a, segs);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
}

// ------------------------------------------------------------------ страница «Библия»
function initPage(app) {
  var $ = function (id) { return document.getElementById(id); };
  var input = $('bq'), wordBox = $('bw'), selBook = $('bbook'), selCh = $('bch');
  var status = $('bstatus'), also = $('balso'), title = $('btitle'), textBox = $('btext');
  var btnPrev = $('bprev'), btnNext = $('bnext');
  var marksBox = $('bmarks'), contBox = $('bcont'), recentBox = $('brecent');
  var curHash = null;                // выделенный стих («40.5.9») — его и кладём в закладки
  var tapSelect = false;             // стих выделили касанием — страницу не прокручивать
  var cur = null;                    // {book, ch} — что сейчас на экране
  var seq = 0, keepAlso = false, lastSearch = null;

  // --- выбор книги и главы
  (function () {
    var groups = [['Новый Завет', 40, 66], ['Ветхий Завет', 1, 39], ['Неканонические книги', 67, 99]];
    var html = '<option value="">Книга…</option>';
    groups.forEach(function (g) {
      html += '<optgroup label="' + g[0] + '">';
      ORDER.forEach(function (id) {
        if (id >= g[1] && id <= g[2]) html += '<option value="' + id + '">' + esc(BOOKS[id].name) + '</option>';
      });
      html += '</optgroup>';
    });
    selBook.innerHTML = html;
  })();

  function fillChapters(book, ch) {
    var html = '', n = book ? BOOKS[book].chapters : 0;
    for (var i = 1; i <= n; i++) html += '<option value="' + i + '">' + i + '</option>';
    selCh.innerHTML = html;
    selCh.disabled = !n;
    if (ch) selCh.value = String(ch);
  }

  function go(hash) {                // вся навигация — через адрес: работает «назад» в браузере
    if (location.hash.slice(1) === hash) route(); else location.hash = hash;
  }

  selBook.onchange = function () { if (selBook.value) go(selBook.value + '.1'); };
  selCh.onchange = function () { if (cur) go(cur.book + '.' + selCh.value); };
  btnPrev.onclick = function () { if (cur && cur.ch > 1) go(cur.book + '.' + (cur.ch - 1)); };
  btnNext.onclick = function () { if (cur && cur.ch < BOOKS[cur.book].chapters) go(cur.book + '.' + (cur.ch + 1)); };

  $('bf').onsubmit = function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) return;
    input.blur();
    var ref = parseRef(q), chap = ref ? null : parseChapter(q);
    if (ref) go(hashOf(ref.book, ref.ch, ref.v1, ref.v2));
    else if (chap) go(hashOf(chap.book, chap.ch));
    else go('q=' + encodeURIComponent(q) + (wordBox.checked ? '&w=1' : ''));
  };

  also.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') keepAlso = true;       // список «также похоже» остаётся на экране
  });

  function markWords(text, words) {
    var safe = esc(text);
    if (!words || !words.length) return safe;
    // длинное слово — по вхождению, короткое — только целым («вы», но не «ВЫвел»)
    var L = '[а-яёА-ЯЁa-zA-Z0-9]';
    var longW = [], shortW = [];
    words.forEach(function (w) { (w.length >= 5 ? longW : shortW).push(w.replace(/е/g, '[её]')); });
    if (longW.length) safe = safe.replace(new RegExp('(' + longW.join('|') + ')', 'gi'), '<mark>$1</mark>');
    if (shortW.length) {
      safe = safe.replace(new RegExp('(^|[^а-яёА-ЯЁa-zA-Z0-9<>/])(' + shortW.join('|') + ')(?!' + L + ')', 'gi'),
                          '$1<mark>$2</mark>');
    }
    return safe;
  }

  function showChapter(book, ch, ranges, words) {
    var my = ++seq;
    if (!BOOKS[book] || ch < 1 || ch > BOOKS[book].chapters) {
      title.textContent = ''; textBox.innerHTML = ''; cur = null;
      status.textContent = 'Такой главы нет.';
      return;
    }
    loadBook(book).then(function (data) {
      if (my !== seq) return;
      var chapter = data[ch - 1] || [], html = [], first = 0;
      for (var v = 1; v <= chapter.length; v++) {
        if (!chapter[v - 1]) continue;
        var hl = false;
        for (var i = 0; i < ranges.length; i++) if (v >= ranges[i][0] && v <= ranges[i][1]) hl = true;
        if (hl && !first) first = v;
        html.push('<p id="v' + v + '"' + (hl ? ' class="hl"' : '') + '><b>' + v + '</b>' +
                  (hl ? markWords(chapter[v - 1], words) : esc(chapter[v - 1])) +
                  (hl && v === first ? '<button type="button" class="vmark"></button>' : '') + '</p>');
      }
      cur = { book: book, ch: ch };
      title.textContent = BOOKS[book].name + ', ' + (book === 19 ? 'псалом ' : 'глава ') + ch;
      textBox.innerHTML = html.join('');
      selBook.value = String(book);
      fillChapters(book, ch);
      btnPrev.disabled = ch <= 1;
      btnNext.disabled = ch >= BOOKS[book].chapters;
      app.className = 'ready';
      if ($('btop')) $('btop').hidden = false;
      if (ranges.length && !first) status.textContent = 'Такого стиха в этой главе нет.';
      curHash = ranges.length ? hashOf(book, ch, ranges[0][0], ranges[0][1]) : null;
      updateMarkBtn();
      var el = first ? $('v' + first) : null, pv = pendingVerse;
      pendingVerse = 0;
      if (tapSelect) tapSelect = false;
      else if (pv && $('v' + pv)) { $('v' + pv).scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }  // «Продолжить»
      else if (el) el.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);   // отступ сверху — в стилях страницы
      rememberChapter(book, ch, pv || first || 1);
    }).catch(function () {
      if (my !== seq) return;
      status.textContent = 'Не удалось загрузить текст — проверьте интернет и попробуйте ещё раз.';
    });
  }

  // --- закладки: у каждого читателя свои, хранятся только в его браузере (localStorage),
  // на сайт ничего не уходит. Почистил браузер или сменил телефон — закладки пропали.
  var MARKS_KEY = 'bibleBookmarks';
  function loadMarks() {
    try { var m = JSON.parse(localStorage.getItem(MARKS_KEY)); return Array.isArray(m) ? m : []; }
    catch (e) { return []; }
  }
  function saveMarks(m) { try { localStorage.setItem(MARKS_KEY, JSON.stringify(m)); } catch (e) {} }
  function markLabel(h) {
    var s = parseHash(h);
    if (!s || !s[0].ranges.length) return null;
    return refLabel(s[0].book, s[0].ch, s[0].ranges[0][0], s[0].ranges[0][1]);
  }
  function renderMarks() {
    var m = loadMarks().filter(markLabel);
    marksBox.innerHTML = m.length ? '⭐ Мои закладки: ' + m.map(function (h) {
      return '<a href="#' + h + '">' + esc(markLabel(h)) + '</a>';
    }).join(' ') : '';
  }
  function updateMarkBtn() {
    var btn = textBox.querySelector('.vmark');
    if (!btn || !curHash) return;
    var on = loadMarks().indexOf(curHash) >= 0;
    btn.className = on ? 'vmark on' : 'vmark';
    btn.textContent = on ? '★ в закладках' : '☆ в закладки';
  }
  function toggleMark() {
    if (!curHash) return;
    var m = loadMarks(), i = m.indexOf(curHash);
    if (i >= 0) m.splice(i, 1); else m.unshift(curHash);
    saveMarks(m.slice(0, 50));
    updateMarkBtn(); renderMarks();
  }
  textBox.addEventListener('click', function (e) {   // касание стиха — выделить его
    if (e.target.closest && e.target.closest('.vmark')) { toggleMark(); return; }
    var p = e.target.closest ? e.target.closest('p[id^="v"]') : null;
    if (!p || !cur) return;
    tapSelect = true;
    go(cur.book + '.' + cur.ch + '.' + p.id.slice(1));
  });
  renderMarks();

  // --- история чтения: «Продолжить» (последняя глава и стих, до которого долистали)
  // и «Недавно» (последние 8 глав). Пишется сама, без кнопок; хранится, как и закладки,
  // только в браузере читателя. «✕ забыть» стирает историю (закладки не трогает).
  var HIST_KEY = 'bibleHistory', pendingVerse = 0, resume = null, posTimer = null;
  function loadHist() {
    try {
      var h = JSON.parse(localStorage.getItem(HIST_KEY));
      return Array.isArray(h) ? h.filter(function (x) { return x && BOOKS[x.b]; }) : [];
    } catch (e) { return []; }
  }
  function saveHist(h) { try { localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0, 8))); } catch (e) {} }
  function isCur(x) { return cur && cur.book === x.b && cur.ch === x.c; }
  function rememberChapter(b, c, v) {
    var h = loadHist().filter(function (x) { return !(x.b === b && x.c === c); });
    h.unshift({ b: b, c: c, v: v });
    saveHist(h);
    renderHistory();
  }
  function renderHistory() {
    var r = resume && !isCur(resume) ? resume : null;
    contBox.innerHTML = r ? '<a href="#' + r.b + '.' + r.c + '" data-v="' + r.v + '">📖 Продолжить: ' +
      esc(BOOKS[r.b].name) + ', ' + (r.b === 19 ? 'псалом ' : 'глава ') + r.c + (r.v > 1 ? ', стих ' + r.v : '') + '</a>' : '';
    var rest = loadHist().filter(function (x) { return !isCur(x) && !(r && x.b === r.b && x.c === r.c); });
    recentBox.innerHTML = rest.length || r ? (rest.length ? '🕘 Недавно: ' + rest.map(function (x) {
      return '<a href="#' + x.b + '.' + x.c + '" data-v="' + x.v + '">' + esc(BOOKS[x.b].short + ' ' + x.c) + '</a>';
    }).join(' ') + ' ' : '') + '<button type="button" class="forget">✕ забыть историю</button>' : '';
  }
  function onHistClick(e) {
    if (e.target.closest && e.target.closest('.forget')) { saveHist([]); resume = null; renderHistory(); return; }
    var a = e.target.closest ? e.target.closest('a[data-v]') : null;
    if (!a) return;
    e.preventDefault();
    pendingVerse = +a.getAttribute('data-v') || 0;
    go(a.getAttribute('href').slice(1));
  }
  contBox.addEventListener('click', onHistClick);
  recentBox.addEventListener('click', onHistClick);
  window.addEventListener('scroll', function () {    // до какого стиха дочитали — первый вверху экрана
    if (posTimer || !cur) return;
    posTimer = setTimeout(function () {
      posTimer = null;
      var ps = textBox.children, v = 0, h = loadHist();
      for (var i = 0; i < ps.length; i++) {
        if (ps[i].getBoundingClientRect().bottom > 90) { v = +ps[i].id.slice(1); break; }
      }
      if (v && h[0] && isCur(h[0]) && h[0].v !== v) { h[0].v = v; saveHist(h); }
    }, 500);
  }, { passive: true });
  resume = loadHist()[0] || null;
  renderHistory();

  function showAlso(found, current) {
    if (found.length < 2) { also.innerHTML = ''; return; }
    var html = 'Также похоже: ';
    html += found.map(function (f) {
      var label = refLabel(f.book, f.ch, f.v, f.v);
      return '<a href="#' + hashOf(f.book, f.ch, f.v) + '"' + (f === current ? ' class="on"' : '') +
             ' title="' + esc(f.text) + '">' + esc(label) + '</a>';
    }).join(' ');
    also.innerHTML = html;
  }

  function doSearch(q, wordMode) {
    var my = ++seq;
    input.value = q; wordBox.checked = wordMode;
    also.innerHTML = '';
    var key = (wordMode ? 'w:' : 'p:') + q;
    function show(res) {
      lastSearch = { key: key, res: res };
      if (!res.words.length) {
        status.textContent = 'Введите слова или ссылку: «Ин 3:16», «1 Кор 13».';
        return;
      }
      if (!res.found.length) { status.textContent = 'Ничего не нашлось.'; return; }
      var f = res.found[0];
      status.textContent = '';
      showAlso(res.found, f);
      showChapter(f.book, f.ch, [[f.v, f.v]], res.words);
    }
    if (lastSearch && lastSearch.key === key) { show(lastSearch.res); return; }
    status.textContent = indexPromise ? 'Ищу…' : 'Загружаю текст для поиска (один раз, около 2 МБ)…';
    loadIndex().then(function (ix) {
      if (my !== seq) return;
      status.textContent = 'Ищу…';
      setTimeout(function () {       // дать браузеру показать «Ищу…»
        if (my !== seq) return;
        show(search(ix, q, null, wordMode, 10));
      }, 30);
    }).catch(function () {
      if (my !== seq) return;
      status.textContent = 'Не удалось загрузить текст для поиска — проверьте интернет.';
    });
  }

  function route() {
    var raw = location.hash.slice(1);
    status.textContent = '';
    if (!raw) { also.innerHTML = ''; return; }
    if (raw.slice(0, 2) === 'q=') {
      var parts = raw.split('&'), q;
      try { q = decodeURIComponent(parts[0].slice(2)); } catch (e) { q = parts[0].slice(2); }
      keepAlso = false;
      doSearch(q, parts.indexOf('w=1') > 0);
      return;
    }
    var segs;
    try { segs = parseHash(decodeURIComponent(raw)); } catch (e) { segs = null; }
    if (!segs) { status.textContent = 'Не понял ссылку.'; return; }
    if (keepAlso) {
      var links = also.getElementsByTagName('a');
      for (var i = 0; i < links.length; i++) {
        links[i].className = (links[i].getAttribute('href') === '#' + raw) ? 'on' : '';
      }
    } else {
      also.innerHTML = '';
      var s = segs[0];
      input.value = s.ranges.length
        ? refLabel(s.book, s.ch, s.ranges[0][0], s.ranges[0][1])
        : BOOKS[s.book].short + ' ' + s.ch;
    }
    var words = keepAlso && lastSearch ? lastSearch.res.words : null;
    keepAlso = false;
    showChapter(segs[0].book, segs[0].ch, segs[0].ranges, words);
  }

  // «↑» — наверх, к строке поиска: по ссылке на стих страница открывается уже прокрученной
  // Видна всегда, пока открыта глава (её показывает showChapter). Раньше она
  // появлялась по прокрутке — на телефоне после перехода к стиху её не было,
  // пока не сдвинешь страницу пальцем.
  var btnTop = $('btop');
  if (btnTop) btnTop.onclick = function () { window.scrollTo(0, 0); };

  fillChapters(null);
  window.addEventListener('hashchange', route);
  route();
}

function start() {
  var app = document.getElementById('bible-app');
  if (app) { initBackLink(); initPage(app); } else { initSermonMemory(); initSheet(); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

})(this);
