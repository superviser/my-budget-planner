/* core.js: utilities, dates, money, storage, state, unlock codes */
'use strict';
window.App = window.App || {};
(function (A) {
  const CFG = A.cfg = Object.assign({
    defaultAppName: 'My Budget', buyUrl: '#', codeHashes: [], offlineUnlocked: false, version: '1.1.0'
  }, window.APP_CONFIG || {});

  /* ---------- small utilities ---------- */
  const pad = A.pad = n => String(n).padStart(2, '0');
  A.uid = () => Math.random().toString(36).slice(2, 9) + (Date.now() % 1e7).toString(36);
  A.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  A.r2 = n => Math.round((+n || 0) * 100) / 100;
  A.sum = (arr, f) => arr.reduce((t, x) => t + (f ? f(x) : x), 0);
  A.by = (arr, id) => arr.find(x => x.id === id);

  /* ---------- dates: always local 'YYYY-MM-DD' strings ---------- */
  A.iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  A.date = s => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +(p[2] || 1)); };
  A.today = () => A.iso(new Date());
  A.addDays = (s, n) => { const d = A.date(s); d.setDate(d.getDate() + n); return A.iso(d); };
  A.diff = (a, b) => Math.round((A.date(b) - A.date(a)) / 864e5);
  A.ym = s => s.slice(0, 7);
  A.addMonths = (ym, n) => { const d = A.date(ym + '-01'); d.setMonth(d.getMonth() + n); return A.iso(d).slice(0, 7); };
  A.monthDays = ym => { const p = ym.split('-'); return new Date(+p[0], +p[1], 0).getDate(); };
  A.monthEnd = ym => ym + '-' + pad(A.monthDays(ym));
  /* A date somebody typed or a file carried in: accepted only inside a sane range, otherwise today. */
  A.isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && s >= '2000-01-01' && s <= '2100-12-31' && !isNaN(A.date(s));
  A.okDate = s => (A.isDate(s) ? s : A.today());

  /* Dates and numbers are written the way the chosen language writes them. */
  A.locale = () => (A.i18n && A.i18n.locale) || undefined;
  let fmtCache = {}, moneyCache = {};
  A.resetFormats = () => { fmtCache = {}; moneyCache = {}; };
  A.fmt = (s, opt) => {
    const k = JSON.stringify(opt);
    return (fmtCache[k] || (fmtCache[k] = new Intl.DateTimeFormat(A.locale(), opt))).format(A.date(s));
  };
  A.dShort = s => A.fmt(s, { month: 'short', day: 'numeric' });
  A.dLong = s => A.fmt(s, { weekday: 'long', month: 'long', day: 'numeric' });
  A.monthName = ym => A.fmt(ym + '-01', { month: 'long', year: 'numeric' });
  A.monthShort = ym => A.fmt(ym + '-01', { month: 'short' });
  A.wd = s => A.fmt(s, { weekday: 'short' });
  A.rel = s => {
    const n = A.diff(A.today(), s);
    if (n === 0) return A.t('Today');
    if (n === 1) return A.t('Tomorrow');
    if (n === -1) return A.t('Yesterday');
    if (n > 1 && n < 7) return A.fmt(s, { weekday: 'long' });
    return A.dShort(s);
  };
  A.inDays = s => {
    const n = A.diff(A.today(), s);
    if (n === 0) return A.t('today');
    if (n === 1) return A.t('tomorrow');
    if (n === -1) return A.t('yesterday');
    return n > 0 ? A.tn(n, 'in {n} day|in {n} days') : A.tn(-n, '{n} day ago|{n} days ago');
  };

  /* ---------- money ---------- */
  A.money = (n, opt) => {
    /* "Hide amounts" masks every figure on screen. Reminders and exports pass raw: true and keep the real number. */
    if (!(opt && opt.raw) && A.look().hideAmounts) return '•••';
    const cur = A.state.profile.currency;
    n = A.r2(n);
    if (opt && opt.whole) n = n < 0 ? Math.ceil(n) : Math.floor(n);
    const d = Number.isInteger(n) ? 0 : 2, k = cur + d;
    let f = moneyCache[k];
    if (!f) {
      try { f = new Intl.NumberFormat(A.locale(), { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol', minimumFractionDigits: d, maximumFractionDigits: d }); }
      catch (e) { f = new Intl.NumberFormat(A.locale(), { minimumFractionDigits: d, maximumFractionDigits: d }); }
      moneyCache[k] = f;
    }
    return f.format(n);
  };
  /* Reads an amount however it was typed: "12.5", "12,50", "1,200", "1.200,50", "$1,234.56".
     Amounts are never negative: a minus sign is ignored. */
  A.num = v => {
    const s = String(v == null ? '' : v).replace(/[^\d.,]/g, '');
    const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
    let dec = -1;
    if (dot >= 0 && comma >= 0) dec = Math.max(dot, comma);           // both marks: the later one is the decimal mark
    else if (dot >= 0 || comma >= 0) {
      const i = Math.max(dot, comma), mark = s[i], count = s.split(mark).length - 1, after = s.length - i - 1, before = s.slice(0, i);
      /* a mark that repeats ("1.000.000"), or one followed by exactly three digits ("1,200"), groups thousands */
      dec = count > 1 || (after === 3 && before !== '' && before !== '0') ? -1 : i;
    }
    const whole = (dec >= 0 ? s.slice(0, dec) : s).replace(/[.,]/g, ''), frac = dec >= 0 ? s.slice(dec + 1).replace(/[.,]/g, '') : '';
    const n = parseFloat((whole || '0') + (frac ? '.' + frac : ''));
    return isFinite(n) ? A.r2(n) : 0;
  };
  A.CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'JPY', 'CNY', 'HKD', 'SGD', 'INR', 'KRW', 'MXN', 'BRL', 'ZAR', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'UAH', 'TRY', 'AED', 'SAR', 'ILS', 'THB', 'IDR', 'MYR', 'PHP', 'VND', 'EGP', 'NGN', 'ARS', 'CLP', 'COP', 'PKR', 'BDT'];
  A.currencyName = c => { try { return new Intl.DisplayNames(A.locale(), { type: 'currency' }).of(c) + ' (' + c + ')'; } catch (e) { return c; } };
  /* A first guess at the buyer's currency from where their device says it is. They can change it. */
  const REGION = { US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', CH: 'CHF', JP: 'JPY', IN: 'INR', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', UA: 'UAH', TR: 'TRY' };
  const BYLANG = { pl: 'PLN', cs: 'CZK', hu: 'HUF', ro: 'RON', sv: 'SEK', da: 'DKK', nb: 'NOK', no: 'NOK', uk: 'UAH', ja: 'JPY', tr: 'TRY' };
  const EURO = 'de fr es it nl pt bg el fi et lv lt sk sl hr ga mt'.split(' ');
  A.guessCurrency = () => {
    const tag = String(navigator.language || 'en-US'), parts = tag.split('-'), region = (parts[1] || '').toUpperCase(), lang = parts[0].toLowerCase();
    return REGION[region] || BYLANG[lang] || (EURO.indexOf(lang) >= 0 || /^(DE|FR|ES|IT|NL|BE|AT|IE|PT|FI|GR|SK|SI|EE|LV|LT|LU|MT|CY|HR|BG)$/.test(region) ? 'EUR' : 'USD');
  };

  /* ---------- SHA-256 (synchronous, works on file:// and http) ---------- */
  A.sha256 = function (str) {
    const K = [], H = [];
    const prime = n => { for (let f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; };
    for (let n = 2, j = 0; j < 64; n++) if (prime(n)) {
      if (j < 8) H[j] = (Math.pow(n, 0.5) * 4294967296) | 0;
      K[j++] = (Math.pow(n, 1 / 3) * 4294967296) | 0;
    }
    const bytes = new TextEncoder().encode(str), l = bytes.length;
    const words = new Int32Array((((l + 8) >> 6) + 1) << 4);
    for (let i = 0; i < l; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
    words[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    words[words.length - 1] = l * 8;
    const w = new Int32Array(64), rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < words.length; o += 16) {
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let i = 0; i < 64; i++) {
        if (i < 16) w[i] = words[o + i];
        else {
          const x = w[i - 15], y = w[i - 2];
          w[i] = (w[i - 16] + (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) + w[i - 7] + (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10))) | 0;
        }
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  };

  /* ---------- storage ---------- */
  /* IndexedDB when the browser has it, localStorage only when it does not. The two are never mixed:
     a failed read is reported as a failure, never as "nothing there", so a real budget is never replaced by an empty one. */
  const DBN = 'budget-planner', STORE = 'kv';
  let dbp = null, mode = null;
  function open() {
    return new Promise((res, rej) => {
      let rq;
      try { rq = indexedDB.open(DBN, 1); } catch (e) { return rej(new Error('none')); }
      /* A database that never answers (another tab is holding it) must not leave the app on a blank screen. */
      const timer = setTimeout(() => rej(new Error('stalled')), 4000);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
      rq.onsuccess = () => {
        clearTimeout(timer);
        const d = rq.result;
        d.onversionchange = () => { d.close(); dbp = null; };
        d.onclose = () => { dbp = null; };
        res(d);
      };
      rq.onerror = () => { clearTimeout(timer); rej(new Error('none')); };
    });
  }
  const db = () => dbp || (dbp = open().catch(e => { dbp = null; throw e; }));
  const run = (m, fn) => db().then(d => new Promise((res, rej) => {
    let t;
    try { t = d.transaction(STORE, m); } catch (e) { dbp = null; return rej(e); }
    const rq = fn(t.objectStore(STORE));
    t.oncomplete = () => res(rq && rq.result);
    t.onerror = t.onabort = () => rej(t.error || new Error('failed'));
  }));
  const twice = (m, fn) => run(m, fn).catch(() => { dbp = null; return run(m, fn); });   // one more try on a fresh connection
  const ls = {
    get: k => { const v = localStorage.getItem('bp_' + k); return v == null ? undefined : JSON.parse(v); },
    set: (k, v) => { localStorage.setItem('bp_' + k, JSON.stringify(v)); },
    del: k => { localStorage.removeItem('bp_' + k); }
  };
  const viaLs = fn => new Promise((res, rej) => { try { res(fn()); } catch (e) { rej(e); } });
  A.store = {
    /* Resolves when storage is usable; rejects only when the database exists but is not answering. */
    ready: () => db().then(() => (mode = 'idb'), e => { if (e && e.message === 'stalled') throw e; return (mode = 'ls'); }),
    get: k => (mode === 'ls' ? viaLs(() => ls.get(k)) : twice('readonly', s => s.get(k))),
    set: (k, v) => (mode === 'ls' ? viaLs(() => ls.set(k, v)) : twice('readwrite', s => s.put(v, k))),
    del: k => (mode === 'ls' ? viaLs(() => ls.del(k)) : twice('readwrite', s => s.delete(k))),
    /* for things that are nice to have but safe to miss */
    peek: k => A.store.get(k).catch(() => undefined)
  };

  /* ---------- unlock codes ---------- */
  A.normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  A.codeOk = c => {
    const n = A.normCode(c);
    return n.length >= 8 && CFG.codeHashes.indexOf(A.sha256('budget-planner:' + n)) >= 0;
  };
  A.licensed = false;

  /* ---------- state ---------- */
  A.state = null;
  A.cache = {};
  A.memo = (k, fn) => (k in A.cache ? A.cache[k] : (A.cache[k] = fn()));
  const listeners = [];
  A.on = f => listeners.push(f);
  A.off = f => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); };
  A.emit = what => listeners.slice().forEach(f => f(what));

  /* Other tabs and windows of the app on this device: when one saves, the others take the new copy,
     so an old tab can never write stale data over fresh entries. */
  const TAB = A.uid();
  let bc = null;
  try { bc = window.BroadcastChannel ? new BroadcastChannel('budget-planner') : null; } catch (e) { bc = null; }
  let saveTimer = null, unsaved = false;
  A.hasUnsaved = () => unsaved;
  if (bc) bc.onmessage = e => {
    const m = e.data || {};
    if (m.t !== 'saved' || m.tab === TAB || !A.licensed || !A.state || unsaved) return;
    A.store.get('state').then(s => {
      if (!A.validState(s) || unsaved || s.meta.updatedAt === A.state.meta.updatedAt) return;
      A.state = A.migrate(s);
      A.cache = {};
      A.emit('swap');
    }, () => { /* the next save or reload settles it */ });
  };
  /* Writes only when something changed, so nothing is left half-written when the page is put away. */
  A.flush = function () {
    clearTimeout(saveTimer); saveTimer = null;
    if (!A.licensed || !A.state || !unsaved) return Promise.resolve(true);
    unsaved = false;
    const at = A.state.meta.updatedAt;
    return A.store.set('state', A.state).then(() => {
      if (A.saveFailed) { A.saveFailed = false; A.emit('saveok'); }
      if (bc) bc.postMessage({ t: 'saved', at: at, tab: TAB });
      A.emit('saved');
      return true;
    }, () => {
      /* keep the change in memory, say so once, and keep trying */
      unsaved = true;
      if (!A.saveFailed) { A.saveFailed = true; A.emit('saveerror'); }
      saveTimer = setTimeout(A.flush, 5000);
      return false;
    });
  };
  const later = () => { if (A.licensed) { clearTimeout(saveTimer); saveTimer = setTimeout(A.flush, 300); } };
  /* Every change goes through commit. In the demo nothing is written anywhere. */
  A.commit = function (fn, what) {
    if (fn) fn(A.state);
    A.state.meta.updatedAt = Date.now();
    A.cache = {};
    unsaved = true;
    later();
    A.emit(what || 'data');
  };
  /* Housekeeping that is worth saving on this device but is not a change to the budget:
     it does not redraw anything and does not count as news for other devices. */
  A.touch = function () { unsaved = true; later(); };

  A.DEFAULT_CATS = [
    [A_T('Housing'), '🏠'], [A_T('Groceries'), '🛒'], [A_T('Eating out'), '🍜'], [A_T('Transport'), '🚌'], [A_T('Bills'), '💡'],
    [A_T('Fun'), '🎈'], [A_T('Shopping'), '🛍️'], [A_T('Health'), '🩺'], [A_T('Subscriptions'), '📺'], [A_T('Other'), '📦']
  ];
  function A_T(s) { return s; }   /* marks a text for translation; the translating happens when it is shown or stored */
  A.blank = function () {
    const tr = A.t || (s => s);
    return {
      v: 1,
      meta: { createdAt: Date.now(), updatedAt: Date.now(), sample: false, onboarded: false, lastOpen: A.today() },
      profile: {
        appName: CFG.defaultAppName, icon: '🌿', iconImg: '', userName: '', currency: A.guessCurrency(), weekStart: 1,
        layout: 'tray', theme: 'sage', mode: 'auto', font: 'system', textSize: 1, lang: 'auto', own: null,
        calm: false, hideAmounts: false, motion: true, rollover: false, startBal: 0, startMonth: A.ym(A.today()),
        household: 'solo', split: false, splitPct: 50, remindAt: '09:00', nudge: false, strategy: 'avalanche', extra: 0
      },
      /* def remembers which built-in envelope this is, so its name can follow a change of language until the buyer renames it */
      cats: A.DEFAULT_CATS.map(c => ({ id: A.uid(), name: tr(c[0]), def: c[0], emoji: c[1], budget: 0 })),
      budgets: {}, tx: [], rules: [], funds: [], debts: [], goals: [], pause: [], notes: {}, checkins: [], people: []
    };
  };
  const TYPES = ['out', 'in', 'save', 'debt', 'note'], FREQS = ['once', 'weekly', 'biweekly', 'monthly', 'yearly'];
  const obj = x => x && typeof x === 'object' && !Array.isArray(x);
  /* Brings a saved, restored, moved or synced budget up to date and throws out anything malformed,
     so one bad record can never stop the app from opening. */
  A.migrate = function (s) {
    const b = A.blank(), def = Object.assign({}, b.profile);
    s.meta = Object.assign(b.meta, obj(s.meta) ? s.meta : {});
    s.profile = Object.assign(b.profile, obj(s.profile) ? s.profile : {});
    if (s.profile.font === 'serif') s.profile.font = 'elegant';
    if (s.profile.theme === 'custom') s.profile.theme = 'sage';
    if (A.CURRENCIES.indexOf(s.profile.currency) < 0) s.profile.currency = def.currency;
    if (['solo', 'couple', 'family'].indexOf(s.profile.household) < 0) s.profile.household = 'solo';
    ['appName', 'userName', 'icon', 'iconImg', 'remindAt'].forEach(k => { if (typeof s.profile[k] !== 'string') s.profile[k] = def[k]; });
    ['startBal', 'extra'].forEach(k => { s.profile[k] = Math.max(0, +s.profile[k] || 0); });
    if (s.profile.own && !obj(s.profile.own)) s.profile.own = null;
    if (!isFinite(+s.meta.updatedAt)) s.meta.updatedAt = Date.now();
    if (!isFinite(+s.meta.createdAt)) s.meta.createdAt = Date.now();
    if (!/^\d{4}-\d{2}$/.test(s.profile.startMonth || '')) s.profile.startMonth = A.ym(A.iso(new Date(+s.meta.createdAt)));
    ['cats', 'tx', 'rules', 'funds', 'debts', 'goals', 'pause', 'checkins', 'people'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
    ['budgets', 'notes'].forEach(k => { if (!obj(s[k])) s[k] = {}; });
    const withId = x => { if (typeof x.id !== 'string' || !x.id) x.id = A.uid(); return x; };
    s.cats = s.cats.filter(c => obj(c) && typeof c.name === 'string').map(withId);
    if (!s.cats.length) s.cats = b.cats;
    s.cats.forEach(c => { c.budget = Math.max(0, +c.budget || 0); if (typeof c.emoji !== 'string') c.emoji = '📁'; if (c.def && typeof c.def !== 'string') delete c.def; });
    s.tx = s.tx.filter(x => obj(x) && A.isDate(x.date) && isFinite(+x.amt) && TYPES.indexOf(x.type) >= 0 && x.type !== 'note')
      .map(x => { x.amt = Math.abs(+x.amt); if (typeof x.name !== 'string') x.name = ''; return withId(x); });
    s.rules = s.rules.filter(r => obj(r) && A.isDate(r.start) && TYPES.indexOf(r.type) >= 0 && FREQS.indexOf(r.freq) >= 0 && typeof r.name === 'string')
      .map(r => { r.amt = Math.abs(+r.amt || 0); if (!Array.isArray(r.skips)) r.skips = []; if (r.end && !A.isDate(r.end)) delete r.end; if (r.from && !A.isDate(r.from)) delete r.from; return withId(r); });
    ['funds', 'debts', 'goals', 'pause', 'people'].forEach(k => { s[k] = s[k].filter(x => obj(x)).map(withId); });
    s.people.forEach(p => { if (typeof p.name !== 'string') p.name = '?'; if (p.look && !obj(p.look)) delete p.look; });
    s.checkins = s.checkins.filter(A.isDate);
    s.v = 1;
    return s;
  };
  A.validState = s => !!(obj(s) && obj(s.profile) && Array.isArray(s.tx) && Array.isArray(s.cats));
  /* The name to show for an envelope, fund, debt or person. A built-in envelope the buyer has not renamed
     is shown in the language of whoever is looking. */
  A.nm = o => (o ? (o.def ? A.t(o.def) : o.name) : '');
  /* True when the app is served from a web address with its files beside it (not the single offline file). */
  A.hosted = () => /^https?:$/.test(location.protocol) && !document.getElementById('worker-src');

  /* An unlocked app asks the browser to keep its data even when the device runs short of space (the demo keeps nothing,
     so it never asks). Chrome and Safari decide by themselves without a question; Firefox asks the person, so there it
     is tried at most once a week. */
  A.keepStorage = async function () {
    try {
      const st = navigator.storage;
      if (!A.licensed || !st || !st.persist || !st.persisted || await st.persisted()) return;
      if (/Firefox\//.test(navigator.userAgent)) {
        if (Date.now() - (+(await A.store.peek('keepAsked')) || 0) < 7 * 864e5) return;
        await A.store.set('keepAsked', Date.now());
      }
      await st.persist();
    } catch (e) { /* not offered here: backups and the personal cloud still protect the data */ }
  };

  /* ---------- how it looks: shared by default, each person's own once a household is set up ---------- */
  A.LOOK_KEYS = ['layout', 'theme', 'own', 'mode', 'font', 'textSize', 'lang', 'calm', 'hideAmounts', 'motion'];
  A.look = () => A.memo('look', () => {
    const p = A.state.profile, me = A.shared && A.shared() ? A.me() : null;
    return me && me.look ? Object.assign({}, p, me.look) : p;
  });
  A.setLook = (k, v) => A.commit(s => {
    const me = A.shared && A.shared() ? A.me() : null;
    if (me) (me.look = me.look || {})[k] = v; else s.profile[k] = v;
  });

  /* ---------- themes: three numbers each, colours are computed in CSS ---------- */
  A.THEMES = [
    { id: 'sage', name: A_T('Sage'), h: 150, cs: 0.85 }, { id: 'blush', name: A_T('Blush'), h: 12, cs: 1 },
    { id: 'ocean', name: A_T('Ocean'), h: 232, cs: 1 }, { id: 'lavender', name: A_T('Lavender'), h: 300, cs: 0.9 },
    { id: 'peach', name: A_T('Peach'), h: 52, cs: 1.05 }, { id: 'matcha', name: A_T('Matcha'), h: 128, cs: 1.25 },
    { id: 'sky', name: A_T('Sky'), h: 210, cs: 0.9 }, { id: 'rose', name: A_T('Rosé'), h: 352, cs: 1.2 },
    { id: 'mocha', name: A_T('Mocha'), h: 62, cs: 0.55 }, { id: 'plum', name: A_T('Plum'), h: 328, cs: 0.9 },
    { id: 'bold', name: A_T('Bold'), h: 265, cs: 1.6 }, { id: 'mono', name: A_T('Mono'), h: 250, cs: 0 },
    { id: 'coral', name: A_T('Coral'), h: 30, cs: 1.35 }, { id: 'sand', name: A_T('Sand'), h: 85, cs: 0.7 },
    { id: 'teal', name: A_T('Teal'), h: 190, cs: 1.1 }, { id: 'forest', name: A_T('Forest'), h: 160, cs: 1.35 },
    { id: 'berry', name: A_T('Berry'), h: 340, cs: 1.45 }, { id: 'slate', name: A_T('Slate'), h: 250, cs: 0.35 },
    { id: 'own', name: A_T('My colours'), h: null, cs: null }
  ];
  /* Picture themes: a background picture with colours chosen to sit well on it. Files live in app/wallpapers. */
  A.WALLPAPERS = [
    { id: 'sage', name: A_T('Watercolour'), bg: '#dfe8dc', card: '#fbfdf9', text: '#1f2b22', accent: '#4a7a58' },
    { id: 'dawn', name: A_T('Sunrise'), bg: '#f6dcd2', card: '#fffaf7', text: '#3a2a33', accent: '#c2607a' },
    { id: 'sea', name: A_T('Sea'), bg: '#cfe9e8', card: '#f7fdfc', text: '#12313a', accent: '#1f7f8c' },
    { id: 'terrazzo', name: A_T('Terrazzo'), bg: '#efe6dc', card: '#fffdf9', text: '#3b302a', accent: '#b5654a' },
    { id: 'leaves', name: A_T('Leaves'), bg: '#eef0e2', card: '#fdfdf6', text: '#2a3323', accent: '#5d7a3a' },
    { id: 'night', name: A_T('Night sky'), bg: '#151a33', card: '#1e2440', text: '#eef0fb', accent: '#f2c14e' },
    { id: 'linen', name: A_T('Linen'), bg: '#e9e1d3', card: '#fdfaf4', text: '#35302a', accent: '#8a6a45' },
    { id: 'blossom', name: A_T('Blossom'), bg: '#f9e3ea', card: '#fffafb', text: '#40262f', accent: '#c84f7a' }
  ];
  A.LAYOUTS = [
    { id: 'tray', name: A_T('Day tray'), blurb: A_T('A compartment for every day. Bills sit in the day they are due.') },
    { id: 'binder', name: A_T('Binder'), blurb: A_T('Coloured divider tabs. One tidy sheet per section.') },
    { id: 'tiles', name: A_T('Big tiles'), blurb: A_T('Fewer, bigger things. Large numbers, flat colour.') }
  ];
  /* Fonts. "bundled" ones ship with the app in app/fonts and are fetched only when chosen. */
  A.FONTS = [
    { id: 'system', name: A_T('Standard'), sample: 'system-ui, sans-serif' },
    { id: 'rounded', name: A_T('Rounded'), sample: '"Nunito", ui-rounded, system-ui, sans-serif', bundled: true },
    { id: 'elegant', name: A_T('Elegant'), sample: '"Playfair Display", Georgia, serif', bundled: true },
    { id: 'hand', name: A_T('Handwritten'), sample: '"Caveat", "Segoe Print", cursive', bundled: true, scale: 1.2 },
    { id: 'mono', name: A_T('Typewriter'), sample: 'ui-monospace, Consolas, "Courier New", monospace' }
  ];
  A.ICONS = ['🌿', '🌸', '🌙', '⭐', '🍀', '🌈', '☕', '💎', '🐱', '🐶', '🦊', '🐼', '🦋', '🍓', '🌻', '🏡', '💸', '🌵', '🔥', '🎯', '🚀', '🐝', '🍑', '🌊', '🎈', '🐢', '🌼', '🍋', '👑', '❤️'];
})(window.App);
