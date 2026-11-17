/* i18n.js: languages.
   The English text is the key. Another language is one file, app/i18n/<code>.json, mapping each English text to its translation.
     A.t('Safe to spend')                              a fixed text
     A.t('About {amt} a day until {date}', {amt, date}) a text with values in it
     A.tn(3, '{n} thing|{n} things')                    a text that depends on a count; a translation gives one form per plural category
     A.T('Housing')                                     only marks a text for translation; A.t(variable) translates it later
   Anything a buyer typed is never passed through these. */
'use strict';
(function (A) {
  A.LANGS = [
    ['en', 'English'], ['bg', 'Български'], ['cs', 'Čeština'], ['da', 'Dansk'], ['de', 'Deutsch'], ['el', 'Ελληνικά'],
    ['es', 'Español'], ['et', 'Eesti'], ['fi', 'Suomi'], ['fr', 'Français'], ['hr', 'Hrvatski'], ['hu', 'Magyar'],
    ['it', 'Italiano'], ['lt', 'Lietuvių'], ['lv', 'Latviešu'], ['nl', 'Nederlands'], ['nb', 'Norsk'], ['pl', 'Polski'],
    ['pt', 'Português'], ['ro', 'Română'], ['sk', 'Slovenčina'], ['sl', 'Slovenščina'], ['sv', 'Svenska'], ['uk', 'Українська']
  ];
  const I = A.i18n = { lang: 'en', locale: undefined, dict: null, rules: null, pseudo: false };
  const known = code => A.LANGS.some(l => l[0] === code);
  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : vars[k])) : s);
  const mark = s => (I.pseudo ? '⟦' + s + '⟧' : s);

  A.T = s => s;
  A.t = function (key, vars) {
    const v = I.dict && I.dict[key];
    return mark(fill(typeof v === 'string' && v ? v : key, vars));
  };
  A.tn = function (n, key, vars) {
    const forms = key.split('|'), v = I.dict && I.dict[key];
    let out;
    if (v && typeof v === 'object') out = v[I.rules ? I.rules.select(n) : 'other'] || v.other || v.many || v.few || forms[forms.length - 1];
    else if (typeof v === 'string' && v) out = v;
    else out = n === 1 ? forms[0] : forms[forms.length - 1];
    return mark(fill(out, Object.assign({ n: n }, vars)));
  };

  /* The language to use: the buyer's choice, or else the first language their device asks for that the app speaks. */
  A.pickLang = function (pref) {
    if (pref && pref !== 'auto' && (known(pref) || pref === 'zz')) return pref;
    const list = (typeof navigator !== 'undefined' && (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language])) || ['en'];
    for (let i = 0; i < list.length; i++) {
      let c = String(list[i] || '').toLowerCase().split('-')[0];
      if (c === 'no' || c === 'nn') c = 'nb';
      if (known(c)) return c;
    }
    return 'en';
  };
  function use(code, dict) {
    I.lang = code; I.dict = dict; I.pseudo = code === 'zz';
    I.locale = code === 'en' || code === 'zz' ? undefined : code;
    try { I.rules = dict ? new Intl.PluralRules(code === 'zz' ? 'en' : code) : null; } catch (e) { I.rules = null; }
    if (A.resetFormats) A.resetFormats();
    if (typeof document !== 'undefined') document.documentElement.lang = code === 'zz' ? 'en' : code;
  }
  const getJson = path => {
    const el = typeof document !== 'undefined' && document.getElementById('i18n-' + path);
    if (el) return Promise.resolve(JSON.parse(el.textContent));
    return fetch('i18n/' + path + '.json').then(r => { if (!r.ok) throw new Error('missing'); return r.json(); });
  };
  /* Resolves true when the language is in place, false when its file could not be fetched (the app then stays as it was). */
  A.loadLang = function (code) {
    if (code === I.lang && (I.dict || code === 'en')) return Promise.resolve(true);
    if (code === 'en') { use('en', null); return Promise.resolve(true); }
    if (code === 'zz') {
      /* test language: every text that went through A.t comes back wrapped, so anything unwrapped on screen was missed */
      return getJson('catalog').then(keys => { const d = {}; keys.forEach(k => { d[k] = ''; }); use('zz', d); return true; }, () => { use('zz', {}); return true; });
    }
    return getJson(code).then(d => { use(code, d); return true; }, () => false);
  };
})(window.App);
