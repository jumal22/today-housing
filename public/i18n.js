/* 오늘의 하우징 — 언어 전환 (한국어 / English)
 *
 * 동작 방식
 *  - 화면은 한국어로 그려지고, English 모드에서는 DOM(텍스트·placeholder·title·aria-label 등)을
 *    /i18n-en.js 사전으로 즉시 바꿔 끼운다. 새로 그려지는 내용(목록·토스트·튜토리얼)은
 *    MutationObserver 가 잡아서 바로 번역한다. 한국어로 돌아오면 원문을 되돌린다.
 *  - 사용자가 쓴 글(제목·닉네임·댓글)은 data-i18n-skip 이 붙은 곳은 건드리지 않는다.
 *  - 선택은 localStorage "oh-lang" 에 저장된다. (?lang=en 으로도 지정 가능)
 *  - window.OH_I18N : { lang, set(l), t(str), onChange(fn) }
 */
(function () {
  'use strict';
  if (window.OH_I18N) return;

  var KEY = 'oh-lang';
  var H = /[가-힣]/;
  var lang = 'ko';
  try { var s0 = localStorage.getItem(KEY); if (s0 === 'en' || s0 === 'ko') lang = s0; } catch (e) {}
  try { var q0 = new URLSearchParams(location.search).get('lang'); if (q0 === 'en' || q0 === 'ko') lang = q0; } catch (e) {}

  /* ---------------------------------------------------------------- 사전 */
  var dict = null;
  function prep(raw) {
    var d = { exact: Object.create(null), tpl: [], html: Object.create(null), css: raw.css || {} };
    Object.keys(raw.exact).forEach(function (k) { d.exact[k] = raw.exact[k]; });
    Object.keys(raw.html || {}).forEach(function (k) { d.html[k] = raw.html[k]; });
    (raw.tpl || []).forEach(function (p) {
      var ko = p[0], names = [];
      var src = ko.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\d+)\}/g, function (_, n) { names.push(n); return '\u0001'; });
      src = src.replace(/\u0001/g, '([\\s\\S]*?)');
      var map = {}; names.forEach(function (n, i) { map[n] = i + 1; });
      d.tpl.push({ re: new RegExp('^' + src + '$'), en: p[1], map: map, w: ko.replace(/\{\d+\}/g, '').length });
    });
    d.tpl.sort(function (a, b) { return b.w - a.w; });
    return d;
  }
  function loadDict(cb) {
    if (dict) { cb(); return; }
    if (window.OH_I18N_EN) { dict = prep(window.OH_I18N_EN); cb(); return; }
    var sc = document.createElement('script');
    sc.src = '/i18n-en.js';
    sc.onload = function () { if (window.OH_I18N_EN) dict = prep(window.OH_I18N_EN); cb(); };
    sc.onerror = function () { cb(); };
    (document.head || document.documentElement).appendChild(sc);
  }
  /* 처음부터 English 면, 깜빡임 없이 바로 번역되도록 파서를 멈추고 사전을 먼저 읽는다 */
  if (lang === 'en' && !window.OH_I18N_EN && document.readyState === 'loading') {
    try { document.write('<script src="/i18n-en.js"><\/script>'); } catch (e) {}
  }
  if (window.OH_I18N_EN) dict = prep(window.OH_I18N_EN);

  /* ---------------------------------------------------------------- 번역 함수 */
  function sub(g) {
    if (!g || !H.test(g)) return g;
    var x = tr(g);
    return x === null ? g : x;
  }
  var OP_EN = { '삭제': 'deleted', '닫기': 'closed', '추가': 'added', '변경': 'changed' };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function trCore(c) {
    var v = dict.exact[c];
    if (v !== undefined) return v;
    var md = /^(\d{1,2})월 (\d{1,2})일$/.exec(c);              // 새 글 기본 제목의 "10월 18일"
    if (md && md[1] >= 1 && md[1] <= 12) return MON[md[1] - 1] + ' ' + md[2];
    for (var i = 0; i < dict.tpl.length; i++) {
      var t = dict.tpl[i], r = t.re.exec(c);
      if (r) return t.en.replace(/\{(\d+)\}/g, function (_, n) { return sub(r[t.map[n]]); });
    }
    var sp = c.indexOf(' ');                                       // "소파 이동 · 회전" → "Sofa moved · rotated" (가구 이름 + 변경 종류)
    if (sp > 0 && c.length < 80) {
      var nm = dict.exact[c.slice(0, sp)];
      if (nm !== undefined) {
        var ops = c.slice(sp + 1).split(' · '), okOps = [];
        for (var oi = 0; oi < ops.length; oi++) {
          var ov = OP_EN[ops[oi]];
          if (ov === undefined) { var o2 = dict.exact[ops[oi]]; ov = o2 === undefined ? null : o2.charAt(0).toLowerCase() + o2.slice(1); }
          if (ov === null) { okOps = null; break; }
          okOps.push(ov);
        }
        if (okOps) return nm + ' ' + okOps.join(' · ');
      }
    }
    var em = /^((?:[\u2190-\u2BFF\u{1F000}-\u{1FAFF}\uFE0F\u200D]+)\s+)([\s\S]+)$/u.exec(c);     // "💬 의견" 처럼 이모지가 앞에 붙은 글자
    if (em) { var rest = trCore(em[2]); if (rest !== null) return em[1] + rest; }
    if (c.length < 240 && c.indexOf(' · ') > 0) {                     // "가로 3m · 세로 4m · 가구 5개" 처럼 · 로 이어진 줄
      var any = false, parts = c.split(' · ').map(function (p) {
        var x = trCore(p); if (x === null) return p; any = true; return x;
      });
      if (any) return parts.join(' · ');
    }
    return null;
  }
  function tr(raw) {
    if (!dict && window.OH_I18N_EN) dict = prep(window.OH_I18N_EN);
    if (!dict || !raw) return null;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
    if (!m[2]) return null;
    var out = trCore(m[2].replace(/\s+/g, ' '));
    return out === null ? null : m[1] + out + m[3];
  }

  /* ---------------------------------------------------------------- DOM 적용 */
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-label'];
  var SKIPTAG = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1 };
  var INLINE = { B: 1, KBD: 1, I: 1, EM: 1, STRONG: 1, SPAN: 1, SMALL: 1, BR: 1, U: 1 };
  var DATE_KO = /^(\d{4})\. (\d{1,2})\. (\d{1,2})\.$/, DATE_ADMIN = /^(\d{4})\.(\d{2})\.(\d{2})$/;
  var textRec = new WeakMap(), attrRec = new WeakMap(), htmlRec = new WeakMap();

  function doText(n) {
    var pe = n.parentNode;
    if (pe && pe.nodeType === 1 && SKIPTAG[pe.tagName]) return;       // 스크립트·스타일 속 글자는 절대 건드리지 않는다
    var rec = textRec.get(n), d = n.data;
    if (lang === 'en') {
      if (rec && d === rec.en) return;
      if (rec) textRec.delete(n);
      if (!H.test(d)) {
        var dm = DATE_KO.exec(d) || DATE_ADMIN.exec(d);           // 2026. 10. 12. / 2026.10.12 → 10/12/2026
        if (dm) { var nd = (+dm[2]) + '/' + (+dm[3]) + '/' + dm[1]; textRec.set(n, { ko: d, en: nd }); n.data = nd; }
        return;
      }
      var t = tr(d);
      if (t !== null) { textRec.set(n, { ko: d, en: t }); n.data = t; }
    } else if (rec) {
      if (d === rec.en) n.data = rec.ko;
      textRec.delete(n);
    }
  }
  function doAttrs(el) {
    var list = ATTRS;
    var isMeta = el.tagName === 'META';
    var rec = attrRec.get(el);
    var i, a, v;
    if (isMeta) {
      var nm = el.getAttribute('name') || el.getAttribute('property') || '';
      if (!/^(description|og:title|og:description|twitter:title|twitter:description)$/.test(nm)) return;
      list = ['content'];
    }
    for (i = 0; i < list.length; i++) {
      a = list[i];
      if (!el.hasAttribute(a)) continue;
      v = el.getAttribute(a);
      var r = rec && rec[a];
      if (lang === 'en') {
        if (r && v === r.en) continue;
        if (r) { delete rec[a]; }
        if (!H.test(v)) continue;
        var t = tr(v);
        if (t !== null) {
          if (!rec) { rec = {}; attrRec.set(el, rec); }
          rec[a] = { ko: v, en: t };
          el.setAttribute(a, t);
        }
      } else if (r) {
        if (v === r.en) el.setAttribute(a, r.ko);
        delete rec[a];
      }
    }
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/.test(el.type) && el.value && H.test(el.value) && lang === 'en') {
      var tv = tr(el.value); if (tv !== null) el.value = tv;
    }
  }
  function hasDirectHangul(el) {
    for (var c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && H.test(c.data)) return true;
    return false;
  }
  function tryHtml(el) {            // <b>·<kbd> 가 문장 중간에 끼는 안내문은 통째로 한 문장으로 번역
    if (!el.firstElementChild || !dict || !hasDirectHangul(el)) return false;
    var notes = [], c;
    for (c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (c.tagName === 'SPAN' && c.classList.contains('tut-note')) { notes.push(c); continue; }
      if (!INLINE[c.tagName]) return false;
      if (c.tagName === 'SPAN' && c.firstElementChild) return false;
    }
    var base = el.innerHTML, key = base, tail = '';
    if (notes.length) {                 // 튜토리얼의 보충 설명(.tut-note)은 따로 번역하고, 본문만 통째로 번역
      var clone = el.cloneNode(true), cn = clone.querySelectorAll(':scope > span.tut-note');
      for (var i = 0; i < cn.length; i++) clone.replaceChild(document.createTextNode('\u0002'), cn[i]);
      key = clone.innerHTML;
      var ix = key.indexOf('\u0002');
      if (ix !== key.length - 1) return false;
      key = key.slice(0, ix); tail = '\u0002';
    }
    key = key.replace(/\s+/g, ' ').trim();
    var v = dict.html[key];
    if (v === undefined) return false;
    if (tail) {
      el.innerHTML = v + '<span data-oh-ph></span>';
      var ph = el.querySelector('span[data-oh-ph]');
      ph.parentNode.replaceChild(notes[0], ph);
      walk(notes[0]);
    } else el.innerHTML = v;
    htmlRec.set(el, { ko: base, en: el.innerHTML });
    return true;
  }
  function walk(node) {
    if (node.nodeType === 3) { doText(node); return; }
    if (node.nodeType !== 1) return;
    var el = node;
    if (el.hasAttribute('data-i18n-skip')) return;
    doAttrs(el);                                       // textarea 의 placeholder 는 번역하되 안의 글자는 건드리지 않는다
    if (SKIPTAG[el.tagName]) return;
    var hr = htmlRec.get(el);
    if (hr) {
      if (lang === 'ko') { if (el.innerHTML === hr.en) el.innerHTML = hr.ko; htmlRec.delete(el); return; }
      if (el.innerHTML === hr.en) return;
      htmlRec.delete(el);
    }
    if (lang === 'en' && tryHtml(el)) return;
    for (var c = el.firstChild; c; c = c.nextSibling) walk(c);
  }

  var mo = null;
  function observe() {
    if (!mo) return;
    mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['content']) });
  }
  function onMut(muts) {
    if (!dict && window.OH_I18N_EN) dict = prep(window.OH_I18N_EN);
    if (lang !== 'en' || !dict) return;
    mo.disconnect();
    try {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') {
          var p = m.target.parentNode;
          if (p && p.nodeType === 1 && !SKIPTAG[p.tagName] && !p.closest('[data-i18n-skip]')) doText(m.target);
        } else if (m.type === 'childList') {
          var t = m.target;
          if (t.nodeType === 1 && t.closest && t.closest('[data-i18n-skip]')) continue;
          if (t.nodeType === 1 && !htmlRec.has(t) && !SKIPTAG[t.tagName] && tryHtml(t)) continue;   // 문장 통째 번역을 먼저
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            var par = n.parentNode;
            if (par && par.nodeType === 1 && par.closest && par.closest('[data-i18n-skip]')) continue;
            walk(n);
          }
        } else if (m.type === 'attributes') {
          if (m.target.closest && m.target.closest('[data-i18n-skip]')) continue;
          doAttrs(m.target);
        }
      }
    } finally { mo.takeRecords(); observe(); }
  }
  if (window.MutationObserver) mo = new MutationObserver(onMut);

  /* CSS ::after 로 그려지는 글자는 CSS 변수로 갈아 끼운다 */
  function applyCssVars() {
    var st = document.documentElement.style;
    if (!dict && window.OH_I18N_EN) dict = prep(window.OH_I18N_EN);
    if (lang === 'en' && dict) {
      st.setProperty('--oh-t-trash', JSON.stringify(dict.css['놓으면 삭제'] || 'Drop to delete'));
      st.setProperty('--oh-t-ok', JSON.stringify('  ' + (dict.css['✓ 좋아요!'] || '✓ Nice!')));
    } else {
      st.removeProperty('--oh-t-trash');
      st.removeProperty('--oh-t-ok');
    }
  }
  function applyAll() {
    if (mo) mo.disconnect();
    if (document.documentElement) walk(document.documentElement);
    applyCssVars();
    if (mo) { mo.takeRecords(); observe(); }
  }

  /* alert / confirm / prompt */
  ['alert', 'confirm', 'prompt'].forEach(function (nm) {
    var orig = window[nm];
    if (typeof orig !== 'function') return;
    window[nm] = function (msg) {
      var args = Array.prototype.slice.call(arguments);
      if (lang === 'en' && typeof msg === 'string') { var t = tr(msg); if (t !== null) args[0] = t; }
      return orig.apply(window, args);
    };
  });

  /* ---------------------------------------------------------------- 공개 API */
  var listeners = [];
  function fire() {
    listeners.forEach(function (fn) { try { fn(lang); } catch (e) {} });
    try { window.dispatchEvent(new CustomEvent('oh-lang-change', { detail: { lang: lang } })); } catch (e) {}
  }
  /* 글자가 한꺼번에 뚝 바뀌지 않도록, 일반 페이지에서는 새 화면이 부드럽게 겹쳐 나타나게 한다 (다크/라이트 전환과 같은 View Transition 방식).
   * 모션 줄이기 설정, 지원 안 하는 브라우저, 3D 편집기(가구 배치 화면·팝업 편집기)에서는 효과 없이 바로 바꾼다. */
  function inEditor() {
    if (/[?&]embed=1/.test(location.search)) return true;
    var b = document.querySelector('.sims-btn');
    return !!(b && b.offsetParent !== null);
  }
  function runSwap(fn) {
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !document.startViewTransition || inEditor()) { fn(); return; }
    try {
      var vt = document.startViewTransition(fn);
      vt.ready.then(function () {
        document.documentElement.animate({ opacity: [0, 1] },
          { duration: 280, easing: 'cubic-bezier(.3,.1,.3,1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(function () {});
    } catch (e) { fn(); }
  }
  function setLang(l, fromStorage) {
    l = (l === 'en') ? 'en' : 'ko';
    var changed = l !== lang;
    lang = l;
    if (!fromStorage) { try { localStorage.setItem(KEY, l); } catch (e) {} }
    document.documentElement.setAttribute('lang', l);
    function swap() { applyAll(); updateUI(); }
    function swapAndFire() { swap(); fire(); }
    if (!changed) { if (l === 'en') loadDict(swap); else swap(); return; }
    if (l === 'en') loadDict(function () { runSwap(swapAndFire); });
    else runSwap(swapAndFire);
  }
  window.OH_I18N = {
    get lang() { return lang; },
    set: function (l) { setLang(l, false); },
    t: function (s) { if (lang !== 'en' || typeof s !== 'string') return s; var x = tr(s); return x === null ? s : x; },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); }
  };
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && (e.newValue === 'en' || e.newValue === 'ko') && e.newValue !== lang) setLang(e.newValue, true);
  });


  /* ---------------------------------------------------------------- 댓글 번역
   * 다른 언어로 쓴 댓글에 "번역하기" 버튼을 붙인다.
   *  - 지금은 Chrome 내장 번역(Translator API, 기기 안에서 동작)을 쓴다.
   *  - 나중에 AI(Gemma 등)를 붙이면 OH_I18N.setTranslateEngine({ supported(), translate(text, from, to) }) 로 엔진만 바꿔 끼우면 된다.
   *    translate 는 Promise<string> 을 돌려주면 된다.
   */
  var progressCb = null;
  var chromeEngine = (function () {
    var pairs = {};
    return {
      name: 'chrome',
      supported: function () { return typeof window.Translator !== 'undefined' && window.Translator && typeof window.Translator.create === 'function'; },
      translate: function (text, from, to) {
        if (!this.supported()) return Promise.reject(new Error('unsupported'));
        var k = from + '>' + to;
        if (!pairs[k]) {
          var guard = new Promise(function (_, rej) { setTimeout(function () { rej(new Error('unavailable')); }, 8000); });
          pairs[k] = Promise.race([Promise.resolve(window.Translator.availability({ sourceLanguage: from, targetLanguage: to })), guard]).then(function (a) {
            if (a === 'unavailable') throw new Error('unavailable');
            return window.Translator.create({
              sourceLanguage: from, targetLanguage: to,
              monitor: function (m) { m.addEventListener('downloadprogress', function (e) { if (progressCb) progressCb(e.loaded); }); }
            });
          });
          pairs[k].catch(function () { delete pairs[k]; });
        }
        return pairs[k].then(function (t) { return t.translate(text); });
      }
    };
  })();
  var engine = chromeEngine;
  window.OH_I18N.setTranslateEngine = function (e) { if (e && typeof e.translate === 'function') engine = e; };

  var detector = null;
  function detectSource(text) {
    if (/[가-힣]/.test(text)) return Promise.resolve('ko');
    if (typeof window.LanguageDetector === 'undefined') return Promise.resolve('en');
    if (!detector) detector = Promise.resolve(window.LanguageDetector.create()).catch(function () { return null; });
    return detector.then(function (d) {
      if (!d) return 'en';
      return d.detect(text).then(function (r) {
        var top = r && r[0];
        return (top && top.confidence >= 0.5 && top.detectedLanguage && top.detectedLanguage !== 'und') ? top.detectedLanguage : 'en';
      });
    }).catch(function () { return 'en'; });
  }
  function shouldOffer(text) {
    var ko = (text.match(/[가-힣]/g) || []).length, la = (text.match(/[A-Za-z]/g) || []).length;
    if (lang === 'en') return ko >= 2 && ko / (ko + la) >= 0.3;
    return la >= 4 && la / (ko + la) >= 0.6;
  }
  var L = {
    en: { all: 'Translate comments to English', allOff: 'Show all originals', busy: 'Translating…', orig: 'Show original', trans: 'Show translation',
          unsupported: "Translation isn't available in this browser", fail: "Couldn't translate", dl: 'Downloading language pack… ' },
    ko: { all: '댓글 한국어로 번역하기', allOff: '전체 원문 보기', busy: '번역하는 중…', orig: '원문 보기', trans: '번역 보기',
          unsupported: '이 브라우저에서는 번역을 쓸 수 없어요', fail: '번역하지 못했어요', dl: '언어 팩을 받는 중… ' }
  };
  var tCache = {}, pinOrig = {}, allOn = false, queue = Promise.resolve(), pending = 0, total = 0, flashMsg = '';
  function targetLang() { return lang === 'en' ? 'en' : 'ko'; }
  function cidOf(p) { var c = p.closest ? p.closest('[data-cid]') : null; return c ? c.getAttribute('data-cid') : null; }
  function keyOf(p) { var c = cidOf(p); return c ? c + '|' + targetLang() : null; }

  /* 댓글 하나: 번역/원문 전환 */
  function ensureOrigBtn(p) {
    var actions = p.parentNode && p.parentNode.querySelector('.comment-actions');
    if (!actions) return null;
    var b = actions.querySelector('.comment-trans-btn');
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'comment-reply-btn comment-trans-btn';
      b.setAttribute('data-i18n-skip', '');
      b.addEventListener('click', function () {
        var key = keyOf(p);
        if (p._ohShown) { if (key) pinOrig[key] = true; showOriginal(p); }
        else { if (key) delete pinOrig[key]; allOn = true; translateComment(p).then(syncGlobal); }
        syncGlobal();
      });
      actions.appendChild(b);
    }
    return b;
  }
  function showTranslated(p, out) {
    p.textContent = out; p._ohShown = true;
    var b = ensureOrigBtn(p); if (b) { b.textContent = L[lang].orig; b.disabled = false; }
  }
  function showOriginal(p) {
    if (p._ohOrig != null) p.innerHTML = p._ohOrig;
    p._ohShown = false;
    var b = ensureOrigBtn(p); if (b) { b.textContent = L[lang].trans; b.disabled = false; }
  }
  function translateComment(p) {
    var key = keyOf(p), tgt = targetLang(), text = p._ohOrigText;
    if (key && tCache[key]) { showTranslated(p, tCache[key]); return Promise.resolve(true); }
    var b = ensureOrigBtn(p); if (b) { b.disabled = true; b.textContent = L[lang].busy; }
    return detectSource(text).then(function (from) {
      if (from === tgt) throw new Error('same');
      return engine.translate(text, from, tgt);
    }).then(function (out) {
      if (key) tCache[key] = out;
      if (p.isConnected) showTranslated(p, out);
      return true;
    }).catch(function (err) {
      var un = err && (err.message === 'unsupported' || err.message === 'unavailable');
      if (p.isConnected && b) { b.remove(); }
      if (err && err.message === 'same') return false;
      flash(un ? L[lang].unsupported : L[lang].fail);
      allOn = false;
      return false;
    });
  }
  function eligible() {
    var out = [], ps = document.querySelectorAll('p[data-cbody]');
    for (var i = 0; i < ps.length; i++) if (ps[i]._ohElig) out.push(ps[i]);
    return out;
  }
  function enqueue(p) {
    var key = keyOf(p);
    if (p._ohShown || (key && pinOrig[key]) || p._ohQueued) return;
    p._ohQueued = true; pending++; total++;
    var b = ensureOrigBtn(p); if (b) { b.disabled = true; b.textContent = L[lang].busy; }
    queue = queue.then(function () {
      progressCb = function (f) { setGlobalText(L[lang].dl + Math.round((f || 0) * 100) + '%'); };
      return translateComment(p);
    }).catch(function () {}).then(function () {
      p._ohQueued = false; pending--; if (!pending) { total = 0; progressCb = null; }
      syncGlobal();
    });
    syncGlobal();
  }

  /* 맨 위 "의견 (N)" 옆 버튼: 다른 언어 댓글을 한 번에 번역 */
  var gBtn = null, flashTimer = 0;
  function flash(msg) {
    flashMsg = msg; syncGlobal();
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { flashMsg = ''; syncGlobal(); }, 2800);
  }
  function setGlobalText(t) { if (gBtn) gBtn.textContent = t; }
  function syncGlobal() {
    var cnt = document.getElementById('commentCount');
    var host = cnt && cnt.parentNode;
    var list = eligible();
    if (!host || !list.length) { if (gBtn && gBtn.parentNode) gBtn.parentNode.removeChild(gBtn); return; }
    if (!gBtn || !gBtn.isConnected) {
      gBtn = document.createElement('button');
      gBtn.type = 'button';
      gBtn.className = 'comment-trans-all';
      gBtn.setAttribute('data-i18n-skip', '');
      gBtn.addEventListener('click', function () {
        if (pending) return;
        if (allOn) {                                      // 전부 원문으로
          allOn = false;
          eligible().forEach(function (p) { if (p._ohShown) showOriginal(p); });
        } else {                                          // 전부 번역
          allOn = true; pinOrig = {};
          eligible().forEach(enqueue);
        }
        syncGlobal();
      });
      host.appendChild(gBtn);
    }
    var T = L[lang];
    if (flashMsg) { gBtn.textContent = flashMsg; gBtn.disabled = true; return; }
    if (pending) { gBtn.textContent = T.busy + ' (' + (total - pending) + '/' + total + ')'; gBtn.disabled = true; return; }
    gBtn.disabled = false;
    var anyShown = list.some(function (p) { return p._ohShown; });
    if (!anyShown && allOn) allOn = false;
    gBtn.textContent = anyShown ? T.allOff : T.all;
  }

  /* 새로 그려진 댓글을 찾아 준비 (이미 번역해 둔 건 바로 보여주고, 전체 번역이 켜져 있으면 이어서 번역) */
  function setupComment(p) {
    if (p._ohTb) return;
    p._ohTb = true;
    var text = p.textContent;
    p._ohOrigText = text; p._ohOrig = p.innerHTML;
    p._ohElig = shouldOffer(text);
    if (!p._ohElig) return;
    var key = keyOf(p);
    if (key && tCache[key] && !pinOrig[key] && allOn) showTranslated(p, tCache[key]);
    else if (allOn) enqueue(p);
  }
  function scanComments() {
    var ps = document.querySelectorAll('p[data-cbody]');
    for (var i = 0; i < ps.length; i++) setupComment(ps[i]);
    syncGlobal();
  }
  function resetComments() {
    var ps = document.querySelectorAll('p[data-cbody]');
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p._ohShown && p._ohOrig != null) p.innerHTML = p._ohOrig;
      p._ohTb = false; p._ohShown = false; p._ohQueued = false; p._ohElig = false;
    }
    [].forEach.call(document.querySelectorAll('.comment-trans-btn'), function (b) { b.remove(); });
    if (gBtn && gBtn.parentNode) gBtn.parentNode.removeChild(gBtn);
    allOn = false; pinOrig = {}; pending = 0; total = 0; flashMsg = '';
    queue = Promise.resolve();
    scanComments();
  }
  window.OH_I18N.onChange(resetComments);
  (function watchComments() {
    if (!window.MutationObserver) return;
    var raf = 0;
    new MutationObserver(function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; scanComments(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  })();

  /* ---------------------------------------------------------------- 헤더 번역 버튼 + 리본 메뉴 */
  var CSS = '' +
    '.oh-lang-wrap{position:relative;display:flex;align-items:center;flex:none}' +
    '.oh-lang-btn{appearance:none;cursor:pointer;width:38px;height:38px;padding:0;border-radius:50%;' +
      'border:1px solid var(--line,#DAD3C3);background:var(--paper-raised,#fff);color:var(--ink-soft,#5B6169);' +
      'display:flex;align-items:center;justify-content:center;flex:none}' +
    '.oh-lang-btn:hover,.oh-lang-btn[aria-expanded="true"]{color:var(--ink,#23262B);border-color:var(--ink-soft,#5B6169)}' +
    '.oh-lang-btn:focus-visible{outline:2px solid var(--focus,#C4703F);outline-offset:2px}' +
    '.oh-lang-btn svg{display:block}' +
    '.oh-lang-menu{position:absolute;top:calc(100% + 12px);left:0;z-index:300;min-width:176px;padding:8px;' +
      'background:var(--paper-raised,#fff);border:1px solid var(--line,#DAD3C3);border-radius:16px;' +
      'box-shadow:0 14px 36px -14px var(--shadow,rgba(0,0,0,.35));' +
      'transform-origin:top center;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-8px) scale(.9);' +
      'transition:opacity .16s ease,transform .18s ease,visibility 0s linear .18s}' +
    '.oh-lang-menu.open{opacity:1;visibility:visible;pointer-events:auto;transform:none;' +
      'transition:opacity .18s ease,transform .38s cubic-bezier(.34,1.56,.64,1),visibility 0s}' +
    '@media (prefers-reduced-motion:reduce){.oh-lang-menu,.oh-lang-menu.open{transform:none;transition:opacity .12s linear,visibility 0s linear .12s}' +
      '.oh-lang-menu.open{transition:opacity .12s linear,visibility 0s}}' +
    '.oh-lang-item{display:flex;align-items:center;justify-content:space-between;gap:14px;width:100%;box-sizing:border-box;' +
      'padding:11px 12px;border:0;border-radius:10px;background:none;color:var(--ink,#23262B);font:inherit;font-size:.95rem;' +
      'cursor:pointer;text-align:left;line-height:1.2}' +
    '.oh-lang-item:hover,.oh-lang-item:focus-visible{background:var(--paper,#FAF7F1);outline:none}' +
    '.oh-lang-item[aria-checked="true"]{font-weight:600}' +
    '.oh-lang-item .chk{display:inline-flex;opacity:0;color:var(--terra,#C4703F)}' +
    '.oh-lang-item[aria-checked="true"] .chk{opacity:1}' +
        '.comment-trans-all{appearance:none;cursor:pointer;font:inherit;font-size:.78rem;font-weight:600;line-height:1.4;margin-left:6px;padding:3px 11px;' +
      'border-radius:100px;border:1px solid var(--line,#DAD3C3);background:var(--paper-raised,#fff);color:var(--blueprint,var(--ink-soft,#5B6169));align-self:center}' +
    '.comment-trans-all:hover:not(:disabled){border-color:var(--blueprint,var(--ink-soft,#5B6169))}' +
    '.comment-trans-all:disabled{cursor:default;opacity:.75}' +
    '.comment-trans-all:focus-visible{outline:2px solid var(--focus,#C4703F);outline-offset:2px}' +
    '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}' +
    '::view-transition-old(root){z-index:1}::view-transition-new(root){z-index:2}' +
    'header .logo,header .brand{white-space:nowrap}' +
    /* 영어는 문장이 길어서, 소개 문구가 중간에 꺾이지 않고 쭉 이어지도록 폭을 풀어준다 */
    'html[lang="en"] .section-head,html[lang="en"] #features .section-head{max-width:none}' +
    'html[lang="en"] .section-head h2{font-size:clamp(1.4rem,2.4vw,1.9rem)}' +
    'html[lang="en"] .demo-panel p{max-width:none}' +
    '@media (max-width:430px){html[lang="en"] header .logo{font-size:1.02rem}html[lang="en"] header .logo svg{width:19px;height:19px}}';

  var ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3.5 5.5h9M8 3.2v2.3M5.6 5.5c.4 3.1 2.5 5.7 5.2 7.1M11.6 5.5c-.5 3.3-3 6-6.6 7.6"/>' +
    '<path d="M12.2 20.8l4.1-9.6 4.1 9.6M13.8 17.4h5"/></svg>';
  var CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  var wrap = null, btn = null, menu = null;
  // 메뉴는 아이콘 바로 아래 가운데에 펼치되, 화면 양쪽 끝을 넘으면 그만큼만 안쪽으로 당긴다
  function placeMenu() {
    menu.style.left = '0px';
    var w = menu.offsetWidth, r = wrap.getBoundingClientRect();
    var vw = document.documentElement.clientWidth, pad = 10;
    var left = (r.width - w) / 2;
    var abs = r.left + left;
    if (abs + w > vw - pad) left -= abs + w - (vw - pad);
    if (r.left + left < pad) left = pad - r.left;
    menu.style.left = left + 'px';
  }
  function openMenu(open) {
    if (!menu) return;
    if (open) placeMenu();
    menu.classList.toggle('open', !!open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function updateUI() {
    if (!btn) return;
    var en = lang === 'en';
    var lbl = en ? 'Language' : '언어 선택';
    btn.setAttribute('aria-label', lbl);
    btn.setAttribute('title', lbl);
    [].forEach.call(menu.querySelectorAll('.oh-lang-item'), function (it) {
      it.setAttribute('aria-checked', it.getAttribute('data-l') === lang ? 'true' : 'false');
    });
  }
  function buildUI() {
    if (document.getElementById('ohLangWrap')) return;
    if (/[?&]embed=1/.test(location.search)) return;           // 팝업 속 편집기(iframe)에는 따로 버튼을 달지 않는다
    wrap = document.createElement('div');
    wrap.className = 'oh-lang-wrap';
    wrap.id = 'ohLangWrap';
    wrap.setAttribute('data-i18n-skip', '');
    wrap.innerHTML =
      '<button type="button" class="oh-lang-btn" id="ohLangBtn" aria-haspopup="menu" aria-expanded="false">' + ICON + '</button>' +
      '<div class="oh-lang-menu" id="ohLangMenu" role="menu">' +
        '<button type="button" class="oh-lang-item" role="menuitemradio" data-l="ko" aria-checked="false"><span>한국어</span><span class="chk">' + CHECK + '</span></button>' +
        '<button type="button" class="oh-lang-item" role="menuitemradio" data-l="en" aria-checked="false"><span>English</span><span class="chk">' + CHECK + '</span></button>' +
      '</div>';
    var host = document.getElementById('themeToggle');
    if (host && host.parentNode) host.parentNode.insertBefore(wrap, host);
    else {
      var bar = document.querySelector('header .bar') || document.querySelector('header');
      if (!bar) return;
      bar.appendChild(wrap);
    }
    btn = wrap.querySelector('#ohLangBtn');
    menu = wrap.querySelector('#ohLangMenu');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var d = document.getElementById('loginDropdown');
      if (d && d.classList.contains('open')) { var lb = document.getElementById('loginBtn'); if (lb) lb.click(); }
      openMenu(!menu.classList.contains('open'));
    });
    menu.addEventListener('click', function (e) {
      var it = e.target.closest('.oh-lang-item');
      if (!it) return;
      openMenu(false);
      btn.focus();
      var pick = it.getAttribute('data-l');
      setTimeout(function () { window.OH_I18N.set(pick); }, 170);          // 메뉴가 먼저 접힌 뒤에 전환
    });
    document.addEventListener('click', function (e) { if (menu.classList.contains('open') && !wrap.contains(e.target)) openMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) { openMenu(false); btn.focus(); }
    });
    updateUI();
  }

  /* ---------------------------------------------------------------- 시작 */
  (function injectCss() {
    var st = document.createElement('style');
    st.id = 'ohLangCss';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  })();
  document.documentElement.setAttribute('lang', lang);
  if (lang === 'en') { applyCssVars(); observe(); }
  function ready() {
    buildUI();
    if (lang === 'en') loadDict(function () { applyAll(); updateUI(); });
    else updateUI();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();
