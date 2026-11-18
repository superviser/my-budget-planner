/* main.js: app shell, navigation, language, start-up */
'use strict';
(function (A) {
  const h = A.h, T = A.T;
  /* so: hue offset of the section, used by the binder layout's divider tabs. when: only shown while it returns true. */
  const NAV = A.NAV = [
    { id: 'today', label: T('Today'), icon: 'today', so: 0 },
    { id: 'budget', label: T('Budget'), icon: 'budget', so: 55 },
    { id: 'plan', label: T('Plan'), icon: 'plan', so: 200 },
    { id: 'people', label: T('People'), icon: 'people', so: 30, x: 1, hint: T('Who spent what, month by month'), when: () => A.shared() },
    { id: 'save', label: T('Savings'), icon: 'save', so: 120, x: 1, hint: T('Funds and goals') },
    { id: 'debt', label: T('Debt'), icon: 'debt', so: 320, x: 1, hint: T('Payoff order and the date it ends') },
    { id: 'pause', label: T('Pause list'), icon: 'pause', so: 265, x: 1, hint: T('Wait before you buy') },
    { id: 'review', label: T('Review'), icon: 'review', so: 160, x: 1, hint: T('Where the money went') },
    { id: 'settings', label: T('Settings'), icon: 'settings', so: 90, x: 1, hint: T('Name, look, reminders, backups') }
  ];
  A.navItems = () => NAV.filter(n => !n.when || n.when());
  const offsetOf = id => (A.by(NAV, id) || { so: 90 }).so;

  function demoBar() {
    return h('div.demo-bar', { role: 'region', 'aria-label': A.t('Demo notice') },
      h('p', null, h('strong', { text: A.t('Demo.') + ' ' }), h('span', { text: A.t('Try everything. Nothing is saved.') })),
      h('div.demo-actions', null,
        h('button.chip.demo-own', { type: 'button', onclick: A.demoFresh }, A.t('Use my own numbers')),
        h('button.chip.solid', { type: 'button', onclick: () => A.unlockSheet() }, A.icon('unlock'), A.t('Unlock'))));
  }

  function shell() {
    const p = A.state.profile, app = A.$('#app');
    app.replaceChildren();
    if (!A.licensed) app.append(demoBar());
    app.append(h('nav.nav', { 'aria-label': A.t('Sections') },
      h('a.brand', { href: '#/today' }, h('span.brand-icon', { 'aria-hidden': 'true' }), h('span.brand-name', { text: p.appName })),
      h('button.nav-add', { type: 'button', 'aria-label': A.t('Add spending or income'), onclick: () => A.addSheet() }, A.icon('plus'), h('span', { text: A.t('Add') })),
      A.navItems().map(n => h('a.nav-item' + (n.x ? '.nav-x' : ''), { href: '#/' + n.id, 'data-id': n.id, style: { '--so': n.so } }, A.icon(n.icon), h('span', { text: A.t(n.label) }))),
      h('a.nav-item.nav-more', { href: '#/more', 'data-id': 'more', style: { '--so': 90 } }, A.icon('more'), h('span', { text: A.t('More') }))),
      h('main', { id: 'main', tabindex: '-1' }));
  }

  const routeId = () => {
    const id = (location.hash.replace(/^#\/?/, '') || 'today').split('/')[0];
    if (!A.views[id]) return 'today';
    const n = A.by(NAV, id);
    return n && n.when && !n.when() ? 'today' : id;
  };
  let raf = 0, ready = false, shellSig = '', lastAtt = -1;
  A.render = function () {
    cancelAnimationFrame(raf); raf = 0;
    if (!ready || !A.state) return;
    /* the frame around the pages is rebuilt only when what it shows has changed: who shares the budget, the language, demo or full */
    const sig = [A.shared(), A.i18n.lang, A.licensed].join('|');
    if (sig !== shellSig || !A.$('#main')) { shellSig = sig; shell(); A.route = null; }
    const main = A.$('#main'), id = routeId(), changed = id !== A.route, y = window.scrollY, p = A.state.profile, el = document.documentElement;
    A.route = id;
    el.dataset.section = id;
    el.style.setProperty('--so', offsetOf(id));
    A.applyLook();
    const page = h('div.page.page-' + id);
    A.views[id](page);
    /* the same page drawn again keeps the keyboard where it was */
    if (changed) main.replaceChildren(page); else A.keepFocus(main, () => main.replaceChildren(page));
    const isX = (A.by(NAV, id) || {}).x || id === 'more', n = A.attention().length;
    lastAtt = n;
    document.querySelectorAll('.nav-item').forEach(a => {
      const on = a.dataset.id === id || (a.dataset.id === 'more' && isX);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      if (a.dataset.id === 'today') {
        const old = a.querySelector('.badge');
        if (old) old.remove();
        if (n) a.append(h('span.badge', { 'aria-label': A.tn(n, '{n} thing waiting on you|{n} things waiting on you'), text: String(n) }));
      }
    });
    const bi = A.$('.brand-icon'), bn = A.$('.brand-name');
    if (bi) { bi.textContent = p.iconImg ? '' : p.icon; bi.style.backgroundImage = p.iconImg ? 'url("' + p.iconImg + '")' : ''; }
    if (bn) bn.textContent = p.appName;
    window.scrollTo(0, changed ? 0 : y);
    if (A.refocus) { const f = A.$(A.refocus); A.refocus = null; if (f) f.focus({ preventScroll: true }); }
  };
  const paint = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(A.render); };

  /* ---------- language: follows the person using the device ---------- */
  let langBusy = false, langFailed = '';
  A.syncLang = function () {
    if (!A.state || langBusy) return;
    const want = A.pickLang(A.look().lang);
    if (want === A.i18n.lang || want === langFailed) return;
    langBusy = true;
    A.loadLang(want).then(ok => {
      langBusy = false;
      if (!ok) { langFailed = want; A.toast(A.t('That language could not be loaded. Check your connection and try again.'), { ms: 6000 }); return; }
      langFailed = '';
      A.cache = {};
      /* the demo budget is written out again in the new language; a real budget is never touched */
      if (!A.licensed && A.state.meta.sample) { A.state = A.resample(); A.cache = {}; A.emit('mode'); }
      else A.emit('lang');
      A.syncLang();
    });
  };

  A.on(what => {
    if (what === 'saved' || what === 'quiet') return;
    if (what === 'stale') { ready = false; A.closeSheets(); newer(false); return; }
    if (what === 'saveerror') { A.toast(A.t('This device would not save just now. Keep the app open: it keeps trying.'), { ms: 9000 }); return; }
    if (what === 'saveok') { A.toast(A.t('Saved. Everything is safe again.')); return; }
    if (what === 'cloud') { if (A.route === 'settings' && !document.querySelector('dialog[open]')) paint(); return; }
    /* the budget itself was swapped for another one: anything still open would be editing the old one */
    if (what === 'mode' || what === 'swap') { A.closeSheets(); A.ui.fill = null; }
    if (what !== 'lang') A.syncLang();
    paint();
    A.rem.tick();
  });

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const notice = (lines, button) => A.$('#app').replaceChildren(h('div.boot', null, lines.map(t => h('p', { text: t })),
    button ? h('p', null, h('button.btn.primary', { type: 'button', onclick: () => location.reload() }, button)) : null));

  /* Data that a newer version of the app has saved is never opened by this one: it would not understand all of it, and would
     save it back with parts missing. Nothing more is read and nothing is written; the newer version is fetched if this copy can. */
  const newer = async first => {
    if (first) await A.loadLang(A.pickLang('auto'));
    notice([A.t('A newer version of the app has already saved here. Nothing has been changed, and nothing is lost.'),
      A.t('Reload to get the newer version. If this shows again, wait a minute and reload once more.')], A.t('Reload'));
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/[?&]nosw\b/.test(location.search)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* nothing to fetch it with */ });
      A.update.start();
      A.update.nudge();
    }
  };

  async function boot() {
    try { await A.store.ready(); }
    catch (e) {
      /* Never guess when saved data cannot be reached: opening an empty budget over it would be worse than waiting. */
      await A.loadLang(A.pickLang('auto'));
      notice([A.t('Your saved budget is busy in another tab or window of this app.'), A.t('Close the other one, then reload. Nothing has been lost.')], A.t('Reload'));
      return;
    }
    const unreadable = async () => {
      await A.loadLang(A.pickLang('auto'));
      notice([A.t('Your saved budget could not be read just now.'), A.t('Nothing has been changed. Close other tabs of this app, then reload.')], A.t('Reload'));
    };
    const link = A.readLink();
    if (link && link.move) await A.openMove(link);
    let lic = null, saved, cloud = null, me = null;
    try { lic = await A.store.get('licence'); } catch (e) { await unreadable(); return; }
    A.licensed = !!A.cfg.offlineUnlocked || !!(lic && A.codeOk(lic.code));
    /* Arriving through the link from the purchase, or from another device: unlock without typing anything. */
    if (link && !A.licensed && A.codeOk(link.code)) {
      try { await A.store.set('licence', { code: A.normCode(link.code), at: Date.now() }); A.licensed = true; link.unlocked = true; }
      catch (e) { /* stays in the demo; the link is explained below */ }
    }
    if (A.licensed) {
      try { saved = await A.store.get('state'); cloud = await A.store.get('cloud'); me = await A.store.get('me'); }
      catch (e) { await unreadable(); return; }
      if (A.tooNew(saved)) { await newer(true); return; }
    }
    A.keepStorage();
    await A.backupLoad(lic && lic.at);
    const known = A.validState(saved);
    /* ?lang=de opens a demo or a new budget in that language; a saved budget keeps the language its owner chose */
    const force = (/[?&]lang=([a-z]{2})\b/.exec(location.search) || [])[1];
    A.meId = me || null;
    if (known) {
      /* the first time a new release opens what an earlier one saved, a copy of it as it was is kept before anything is written */
      const before = (await A.update.changed()) ? JSON.stringify(saved) : '';
      A.state = A.migrate(saved);
      await A.loadLang(A.pickLang(A.look().lang));
      if (before) await A.update.keepBefore(before);
    } else {
      await A.loadLang(A.pickLang(force || 'auto'));
      A.state = A.licensed ? A.blank() : A.sample();
      if (force && A.i18n.lang === force) A.state.profile.lang = force;
    }
    A.cache = {};
    A.cloud.cfg = cloud || null;
    /* Unlocked and connected to a cloud, yet nothing saved here: the budget is brought back from the cloud, never replaced by an empty one. */
    const lost = A.licensed && !known && !!A.cloud.cfg;
    let settled = !A.cloud.cfg;
    if (A.cloud.cfg) {
      if (lost) A.cloud.cfg.syncedAt = 0;
      const pulled = (lost ? A.cloud.restore() : A.cloud.pull()).then(() => { settled = true; A.cloud.queue(); }, () => { settled = true; });
      await Promise.race([pulled, wait(2500)]);
      /* things that log themselves wait for the cloud's answer, so they are not logged on top of an older copy */
      if (!settled) pulled.then(() => { A.autopost(); });
    }
    A.checkin();
    if (A.licensed) A.touch();
    if (settled) A.autopost();
    let lostNote = false;
    if (lost && !A.state.meta.onboarded) { A.state.meta.onboarded = true; A.touch(); lostNote = true; }
    ready = true;
    A.render();
    window.addEventListener('hashchange', () => {
      /* a one-tap link opened while the app is already showing: start again so it is handled like any other arrival */
      if (/^#(unlock|join|move)=/.test(location.hash)) A.reload(); else A.render();
    });
    if (lostNote) A.toast(A.t('Your budget is kept in your personal cloud, which could not be reached just now. It comes back by itself once this device is online.'), { ms: 12000 });
    if (A.licensed && !A.state.meta.onboarded && !(link && (link.join || link.state))) A.onboard();
    if (link) A.afterLink(link, known);

    let day = A.today();
    const tick = () => {
      if (A.today() !== day) {
        /* a new day: nothing stays pointed at yesterday */
        day = A.today(); A.cache = {};
        A.ui.day = A.ui.ym = A.ui.calYm = A.ui.reviewYm = A.ui.peopleYm = A.ui.fill = null;
        A.checkin(); A.touch(); A.autopost(); A.render();
      } else if (A.attention().length !== lastAtt && !document.querySelector('dialog[open]')) A.render();   /* a pause that has just run out */
      A.rem.tick();
    };
    setInterval(tick, 60000);
    A.rem.tick();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { A.flush(); if (A.cloud.cfg) A.cloud.push(); }
      else { tick(); if (A.cloud.cfg) A.cloud.sync(); }
    });

    /* add ?nosw to the address while developing, so edits show up without the offline cache in the way */
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/[?&]nosw\b/.test(location.search)) {
      let had = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('sw.js').catch(() => { /* the app still works without offline support */ });
      A.update.start();
      /* whatever this visit has already loaded (the language, a font, a picture) is handed over to be kept for offline use */
      const keep = () => navigator.serviceWorker.ready.then(reg => {
        const urls = performance.getEntriesByType('resource').map(r => r.name).filter(u => u.indexOf(location.origin) === 0);
        if (A.i18n.lang !== 'en') urls.push(new URL('i18n/' + A.i18n.lang + '.json', location.href).href);
        if (reg.active) reg.active.postMessage({ type: 'keep', urls: Array.from(new Set(urls)) });
      }).catch(() => null);
      keep();
      A.on(what => { if (what === 'lang') keep(); });
      navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open') { A.go('today'); A.attentionSheet(); } });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        /* the worker has just taken charge: hand over what was loaded before it did, and once more for what was still on its way */
        keep(); setTimeout(keep, 4000);
        if (had) A.toast(A.t('A newer version of the app is ready.'), { action: A.t('Reload'), fn: A.reload, ms: 20000 });
        had = true;
      });
    }
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); A.installEvt = e; if (A.route === 'settings') A.render(); });

  boot().catch(err => {
    console.error(err);
    const app = document.getElementById('app');
    if (app) app.replaceChildren(h('p.boot', { text: A.t('Something went wrong while opening. Reload the page; your saved budget is not affected.') }));
  });
})(window.App);
