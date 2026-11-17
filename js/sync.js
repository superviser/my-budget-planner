/* sync.js: reminders (no server needed) and the optional personal cloud (the buyer's own free Cloudflare Worker, or a Google Sheet of their own) */
'use strict';
(function (A) {
  const h = A.h;
  const hasSW = 'serviceWorker' in navigator && /^https?:$/.test(location.protocol);
  const getReg = () => hasSW ? navigator.serviceWorker.getRegistration().catch(() => null) : Promise.resolve(null);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const when = ms => new Date(ms).toLocaleString(A.locale());
  /* is there anything in this budget worth keeping a copy of */
  const worth = s => s.tx.length + s.rules.length + s.funds.length + s.debts.length + s.goals.length + s.pause.length > 0;

  /* ================= reminders ================= */
  const R = A.rem = { supported: 'Notification' in window };
  R.perm = () => (R.supported ? Notification.permission : 'unsupported');
  let lastSched = '', ticking = false, tickAgain = false;
  const memShown = {};

  R.show = async function (e) {
    const opt = { body: e.body, tag: e.id, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: location.href.split('#')[0] } };
    try {
      const reg = await getReg();
      if (reg && reg.showNotification) await reg.showNotification(e.title, opt);
      else new Notification(e.title, opt);
      return true;
    } catch (err) { return false; }
  };

  /* Runs on open, every minute while open, and whenever the data changes. One run at a time, so nothing is shown twice. */
  R.tick = async function () {
    if (!A.state) return;
    if (ticking) { tickAgain = true; return; }
    ticking = true;
    try {
      const sched = A.schedule(), now = Date.now(), json = JSON.stringify(sched);
      if (A.licensed && json !== lastSched) {
        lastSched = json;
        /* the service worker reads this when the app is closed; the fallback text is for a push that arrives with nothing to say */
        A.store.set('schedule', { at: now, name: A.state.profile.appName, items: sched,
          fallback: { title: A.t('A reminder from your budget'), body: A.t('Open the app to see what needs you.') } }).catch(() => { lastSched = ''; });
      }
      const n = A.attention().length;
      try { if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n); else navigator.clearAppBadge(); } } catch (e) { /* badge not allowed */ }
      if (R.perm() !== 'granted') return;
      const shown = A.licensed ? ((await A.store.peek('shown')) || {}) : memShown;
      const due = sched.filter(e => e.at <= now && e.at > now - 36 * 36e5 && !shown[e.id]);
      if (!due.length) return;
      for (const e of due) { await R.show(e); shown[e.id] = now; }
      Object.keys(shown).forEach(k => { if (shown[k] < now - 14 * 864e5) delete shown[k]; });
      if (A.licensed) await A.store.set('shown', shown).catch(() => { /* shown again next time at worst */ });
    } finally {
      ticking = false;
      if (tickAgain) { tickAgain = false; R.tick(); }
    }
  };

  R.enable = async function () {
    if (!R.supported) { A.toast(A.t('This browser cannot show notifications. “Add to my calendar” works everywhere.'), { ms: 6000 }); return 'unsupported'; }
    let p = 'default';
    try { p = await Notification.requestPermission(); } catch (e) { p = R.perm(); }
    if (p === 'granted') {
      try {
        const reg = await getReg();
        if (reg && reg.periodicSync) {
          const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
          if (st.state === 'granted') await reg.periodicSync.register('reminders', { minInterval: 6 * 36e5 });
        }
      } catch (e) { /* background checks are a bonus where the browser offers them */ }
      R.tick();
      if (A.cloud.cfg) A.cloud.subscribe();
      A.toast(A.t('Notifications are on.'));
    } else {
      A.toast(p === 'denied' ? A.t('Notifications are blocked for this site. You can allow them in your browser’s site settings.') : A.t('No problem. You can turn them on later.'), { ms: 6000 });
    }
    A.render();
    return p;
  };
  R.test = async function () {
    if (R.perm() !== 'granted') { const p = await R.enable(); if (p !== 'granted') return; }
    const ok = await R.show({ id: 'test' + Date.now(), title: A.t('This is how a reminder looks'), body: A.t('Rent is due tomorrow. Open to mark it done.') });
    if (!ok) A.toast(A.t('The notification could not be shown here.'));
  };

  A.remindersPanel = function () {
    const p = A.state.profile, perm = R.perm(), n = A.schedule().length;
    const status = perm === 'granted' ? A.tn(n, 'Notifications are on. {n} reminder scheduled.|Notifications are on. {n} reminders scheduled.')
      : perm === 'denied' ? A.t('Notifications are blocked for this site in your browser settings.')
        : perm === 'unsupported' ? A.t('This browser cannot show notifications. Use the calendar option below.')
          : A.t('Off. Turn them on to be told about the things you marked “Remind me”.');
    return A.sec('remind', A.t('Reminders'), status,
      h('div.actions.start', null,
        perm === 'default' ? A.btn(A.t('Turn on notifications'), R.enable, 'primary', 'bell') : null,
        perm === 'granted' ? A.btn(A.t('Send a test'), R.test, null, 'bell') : null,
        A.btn(A.t('Add to my calendar'), () => A.needFull(A.exportIcs, A.t('Calendar export')), null, 'download')),
      h('div.form', null,
        A.field(A.t('Remind me at'), h('input', { type: 'time', value: p.remindAt, onchange: e => A.commit(s => { s.profile.remindAt = /^\d\d:\d\d$/.test(e.target.value) ? e.target.value : '09:00'; }) }))),
      h('div.toggles', null, A.toggle(A.t('Evening check-in'), A.t('A nudge at 8 pm: “Anything to log from today?”'), p.nudge, v => A.commit(s => { s.profile.nudge = v; }))),
      h('details.more-info', null, h('summary', { text: A.t('When do notifications arrive?') }),
        h('ul.steps', null,
          h('li', { text: A.t('While the app is open: always, on every device.') }),
          h('li', { text: A.t('Android and computers with the app installed: the browser also checks in the background a few times a day.') }),
          h('li', { text: A.t('iPhone and iPad: add the app to the Home Screen first. For alerts while it is closed, use “Add to my calendar” or connect your personal cloud below.') }),
          h('li', { text: A.t('“Add to my calendar” puts your bills in the phone’s own calendar with alarms. That works everywhere, with nothing to set up.') }))));
  };

  /* ================= personal cloud ================= */
  const C = A.cloud = { cfg: null, status: 'off', err: '' };
  const rndKey = () => { const a = new Uint8Array(24); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); };
  const b64ToBytes = s => { const p = (s + '==='.slice((s.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(p), out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; };
  /* only an encrypted connection, except a cloud running on this very computer */
  const okUrl = u => /^https:\/\//i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(u);

  /* ---------- the same cloud, kept in a Google Sheet ----------
     A buyer without a Cloudflare account can keep the copy in a Google Sheet of their own: a few lines of Apps Script in
     that sheet (sheet-backup.js) answer the same questions the Worker does. A Google web app takes one kind of request
     only (a plain POST with no extra headers), always answers 200 and cannot send notifications, so the question and the
     real status travel inside the body. The copy is sent as plain ASCII with a checksum: it counts as a copy only if it
     comes back exactly as a device sent it. */
  const isSheet = u => /^https:\/\/script\.google\.com\/(?:a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/macros\/s\/[\w-]+\/exec$/i.test(u);
  const ascii = s => s.replace(/[\u007f-\uffff]/g, c => '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4));
  const fnv = s => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x01000193); return (x >>> 0).toString(16); };
  const sheetHelp = () => A.t('Google did not answer as expected. In the Apps Script editor choose “Deploy”, “Manage deployments”: “Who has access” has to say “Anyone”, and the address to paste ends in /exec.');
  const unreadable = () => A.t('The copy in your Google Sheet cannot be read, because the “Planner backup” tab was changed by hand. Open the sheet and use “File”, “Version history” to go back.');
  C.kind = () => (C.cfg ? (isSheet(C.cfg.url) ? 'sheet' : 'worker') : '');

  async function callSheet(path, method, body, cfg) {
    const at = path.indexOf('?'), query = {};
    if (at >= 0) path.slice(at + 1).split('&').forEach(p => { const i = p.indexOf('='); if (i > 0) query[p.slice(0, i)] = decodeURIComponent(p.slice(i + 1)); });
    let send = body || null, tabs = '';
    if (send && send.state) {
      const blob = ascii(JSON.stringify(send.state));
      send = { blob: blob, sum: fnv(blob), updatedAt: send.updatedAt, base: send.base, name: send.name };
      /* the tab a person can read is sent only when what it shows has changed */
      const tables = A.sheetTables(), sum = fnv(JSON.stringify(tables));
      if (sum !== cfg.tabs) { send.tables = tables; tabs = sum; }
    }
    const ctl = window.AbortController ? new AbortController() : null, timer = setTimeout(() => { if (ctl) ctl.abort(); }, 60000);
    let r, env = null;
    try {
      r = await fetch(cfg.url, {
        method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, credentials: 'omit', redirect: 'follow',
        body: JSON.stringify({ v: 1, key: cfg.key, path: at >= 0 ? path.slice(0, at) : path, method: method || 'GET', query: query, body: send }), signal: ctl ? ctl.signal : undefined
      });
    } catch (e) { const er = new Error(A.t('No connection to your cloud right now.')); er.offline = true; throw er; }
    finally { clearTimeout(timer); }
    try { env = await r.json(); } catch (e) { /* a sign-in page or an error page instead of the script's answer */ }
    if (!env || typeof env.status !== 'number') throw new Error(sheetHelp());
    const data = env.data || {};
    if ('blob' in data) {
      let state = null;
      try { if (data.blob && fnv(data.blob) === data.sum) state = JSON.parse(data.blob); } catch (e) { state = null; }
      delete data.blob;
      if (state) data.state = state; else data.damaged = true;
    }
    if (env.status >= 400) { const er = new Error(data.error || A.t('The cloud answered with error {code}.', { code: env.status })); er.status = env.status; er.data = data; throw er; }
    if (tabs && data.tables) cfg.tabs = tabs;
    return data;
  }

  async function call(path, method, body, cfg) {
    cfg = cfg || C.cfg;
    if (isSheet(cfg.url)) return callSheet(path, method, body, cfg);
    const ctl = window.AbortController ? new AbortController() : null, timer = setTimeout(() => { if (ctl) ctl.abort(); }, 20000);
    let r;
    try {
      r = await fetch(cfg.url + path, {
        method: method || 'GET',
        headers: Object.assign({ authorization: 'Bearer ' + cfg.key }, body ? { 'content-type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined, signal: ctl ? ctl.signal : undefined
      });
    } catch (e) { const er = new Error(A.t('No connection to your cloud right now.')); er.offline = true; throw er; }
    finally { clearTimeout(timer); }
    let data = null;
    try { data = await r.json(); } catch (e) { /* not JSON */ }
    if (!r.ok) { const er = new Error((data && data.error) || A.t('The cloud answered with error {code}.', { code: r.status })); er.status = r.status; er.data = data; throw er; }
    return data;
  }
  const saveCfg = () => A.store.set('cloud', C.cfg).catch(() => { /* kept in memory; written again on the next sync */ });
  const mark = (status, err) => {
    C.status = status; C.err = err || '';
    if (C.cfg && status !== 'syncing') {
      /* how long the cloud has been out of reach: from the first failure to the latest, with no success between them */
      const had = C.cfg.failedAt || 0;
      if (status === 'error') { C.cfg.failedAt = had || Date.now(); C.cfg.failedLast = Date.now(); saveCfg(); }
      else if (had) { C.cfg.failedAt = C.cfg.failedLast = 0; saveCfg(); }
    }
    A.emit('cloud');
  };
  /* The cloud stores each copy under the time of its last change. This device is in step when that time matches its own;
     no clocks are compared, so two devices with different times cannot confuse each other. */
  const dirty = () => !!C.cfg && A.state.meta.updatedAt !== C.cfg.syncedAt;
  const inStep = async at => { C.cfg.syncedAt = at; C.cfg.syncedLocal = Date.now(); await saveCfg(); };
  /* changes have been waiting for a cloud that stayed out of reach for days: the first page then says so */
  C.stuck = () => !!(C.cfg && A.state && dirty() && C.cfg.failedAt && C.cfg.failedLast - C.cfg.failedAt > 3 * 864e5);
  /* another tab or window of the app may have synced since this one last did */
  async function fresh() {
    const c = await A.store.peek('cloud');
    if (c && C.cfg && c.url === C.cfg.url && c.key === C.cfg.key && (c.syncedLocal || 0) > (C.cfg.syncedLocal || 0)) { C.cfg.syncedAt = c.syncedAt; C.cfg.syncedLocal = c.syncedLocal; }
  }
  /* one cloud conversation at a time */
  let chain = Promise.resolve();
  const serial = fn => { const p = chain.then(fn, fn); chain = p.catch(() => null); return p; };

  /* Take the cloud copy. Whatever was on this device is kept as an earlier copy first, so nothing is lost. */
  async function adopt(remote, keepLocal) {
    if (keepLocal) await A.snapshot(A.t('This device, before syncing from the cloud'));
    A.state = A.migrate(remote.state);
    A.state.meta.updatedAt = remote.updatedAt;
    A.cache = {};
    await inStep(remote.updatedAt);
    A.checkin();
    A.touch();
    await A.flush();
    A.emit('swap');
    A.autopost();
    if (keepLocal) A.toast(A.t('Synced from your other device. What was on this device is kept in Settings under “Earlier copies”.'), { ms: 9000 });
  }

  let pushTimer = null, retryTimer = null, retryIn = 0;
  function retryLater() {
    clearTimeout(retryTimer);
    retryIn = Math.min(retryIn ? retryIn * 2 : 30000, 300000);
    retryTimer = setTimeout(() => C.sync(), retryIn);
  }
  async function send(force) {
    const sent = A.state.meta.updatedAt;
    try {
      mark('syncing');
      const res = await call('/data', 'PUT', { state: A.state, updatedAt: sent, base: force ? null : C.cfg.syncedAt, schedule: A.schedule(), name: A.state.profile.appName });
      await inStep(res.updatedAt);
      retryIn = 0; clearTimeout(retryTimer);
      mark('ok');
      if (A.state.meta.updatedAt !== sent) C.queue();   /* something changed while this was on its way */
      return true;
    } catch (e) {
      const there = e.status === 409 && e.data;
      /* the copy in the cloud was changed by hand and cannot be read: this device has something worth keeping, so it writes a good copy over it */
      if (there && e.data.damaged && !force && worth(A.state)) return send(true);
      if (there && A.validState(e.data.state)) {
        /* the cloud holds a different version: the same one this device has (sent from another tab), or a newer one from another device */
        if (e.data.updatedAt === A.state.meta.updatedAt) await inStep(e.data.updatedAt);
        else await adopt(e.data, worth(A.state));
        mark('ok');
        return true;
      }
      mark('error', there && e.data.damaged ? unreadable() : e.message);
      retryLater();
      return false;
    }
  }
  C.push = force => serial(async () => {
    if (!C.cfg || !A.licensed) return false;
    await fresh();
    if (!force && !dirty()) { if (C.status !== 'ok') mark('ok'); return true; }
    return send(force);
  });
  C.queue = function () { if (!C.cfg || !A.licensed) return; clearTimeout(pushTimer); pushTimer = setTimeout(() => C.push(), 4000); };
  C.pull = () => serial(async () => {
    if (!C.cfg) return false;
    await fresh();
    try {
      const r = await call('/data?since=' + encodeURIComponent(C.cfg.syncedAt || 0));
      /* a copy that was changed by hand: a device with something worth keeping writes a good one over it; an empty one says what is wrong */
      if (r && r.damaged) { if (worth(A.state)) return 'heal'; mark('error', unreadable()); return false; }
      if (r && A.validState(r.state) && r.updatedAt !== C.cfg.syncedAt) {
        if (r.updatedAt === A.state.meta.updatedAt) await inStep(r.updatedAt);
        else await adopt(r, dirty() && worth(A.state));
      }
      mark('ok');
      return true;
    } catch (e) { mark('error', e.message); return false; }
  }).then(ok => (ok === 'heal' ? C.push(true) : ok));
  /* Changes made here go up first; otherwise look for changes made elsewhere. Then send anything that is still waiting. */
  C.sync = () => (dirty() ? C.push() : C.pull().then(ok => (ok && dirty() ? C.push() : ok)));
  /* The budget on this device is missing but the cloud is connected: bring the cloud copy back. */
  C.restore = () => serial(async () => {
    try {
      const r = await call('/data?since=0');
      if (r && r.damaged) { mark('error', unreadable()); return false; }
      if (r && A.validState(r.state)) { await adopt(r, false); mark('ok'); return true; }
      mark('ok');
      return false;
    } catch (e) { mark('error', e.message); return false; }
  });

  C.subscribe = async function () {
    if (!C.cfg || isSheet(C.cfg.url) || !hasSW || !('PushManager' in window) || R.perm() !== 'granted') return false;
    try {
      /* never wait forever for a service worker that is not coming */
      const reg = await Promise.race([navigator.serviceWorker.ready, wait(5000).then(() => null)]);
      if (!reg) throw new Error(A.t('the app is not installed for offline use yet. Reload once and try again.'));
      const v = await call('/vapid');
      let sub = await reg.pushManager.getSubscription();
      if (sub && C.cfg.vapid && C.cfg.vapid !== v.key) { await sub.unsubscribe(); sub = null; }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(v.key) });
      await call('/subscribe', 'POST', { device: C.cfg.device, sub: sub.toJSON() });
      C.cfg.vapid = v.key; C.cfg.push = true;
      await saveCfg();
      mark(C.status === 'off' ? 'ok' : C.status);
      return true;
    } catch (e) { if (C.cfg) C.cfg.push = false; mark('error', A.t('Push could not be switched on: {why}', { why: e.message })); return false; }
  };

  /* Connect. If the cloud already holds a budget the buyer picks which one to keep, and the other is kept as an earlier copy. */
  C.connect = async function (text, opt) {
    opt = opt || {};
    let url = String(text || '').trim(), key = null;
    const at = url.indexOf('#');
    if (at >= 0) { key = url.slice(at + 1).trim(); url = url.slice(0, at); }
    if (!url) throw new Error(A.t('Paste the address of your cloud first.'));
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    url = url.replace(/\/+$/, '');
    /* a Google address has to be the web app itself: not the sheet, not the editor, not the test address */
    if (/^https:\/\/[^/]*\bgoogle\.com(\/|$)/i.test(url)) { url = url.replace(/[?].*$/, ''); if (!isSheet(url)) throw new Error(sheetHelp()); }
    if (!okUrl(url)) throw new Error(A.t('The address has to start with https://, so that nobody on the way can read your budget.'));
    const cfg = { url: url, key: key || rndKey(), syncedAt: 0, syncedLocal: 0, device: A.uid() };
    try { await call('/claim', 'POST', { key: cfg.key }, cfg); }
    catch (e) {
      if (e.status === 401) throw new Error(key ? A.t('That device code does not match this cloud.') : A.t('This cloud is already connected to a device. On that device open Settings, Personal cloud, “Add another device”, and paste the code it shows here.'));
      if (!e.status) throw new Error(isSheet(url) ? sheetHelp() : A.t('Could not reach that address. Check it is the full address of your Worker, starting with https://.'));
      throw e;
    }
    const remote = await call('/data', 'GET', null, cfg), has = !!(remote && A.validState(remote.state));
    /* a copy that cannot be read is not an empty cloud: a device with nothing of its own must not settle on top of it */
    if (remote && remote.damaged && !worth(A.state)) throw new Error(unreadable());
    const start = async useRemote => {
      C.cfg = cfg;
      await saveCfg();
      let ok = true;
      if (useRemote) { await adopt(remote, worth(A.state)); mark('ok'); }
      /* a device that joins an empty cloud with nothing of its own must not fill the cloud with an empty budget */
      else if (!has && opt.join && !worth(A.state)) { await inStep(A.state.meta.updatedAt); mark('ok'); }
      else {
        if (has) await A.snapshot(A.t('The cloud copy, before this device replaced it'), remote.state);
        ok = await C.push(true);
      }
      if (R.perm() === 'granted') C.subscribe();
      A.render();
      return ok;
    };
    if (has) return { remote: remote, start: start };
    return { ok: await start(false), empty: true };
  };
  C.disconnect = async function (wipe) {
    if (!C.cfg) return;
    try { if (wipe) await call('/data', 'DELETE'); else await call('/unsubscribe', 'POST', { device: C.cfg.device }); } catch (e) { /* offline: disconnect locally anyway */ }
    try { const reg = await getReg(), sub = reg && await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) { /* no push */ }
    clearTimeout(pushTimer); clearTimeout(retryTimer);
    C.cfg = null; C.status = 'off';
    await A.store.del('cloud').catch(() => null);
    A.render();
  };
  /* A device opened through a setup link. The address it will talk to is always shown first, and nothing connects without a yes. */
  A.joinCloud = function (code, hadData) {
    if (C.cfg) { A.toast(A.t('This device is already connected to a personal cloud.'), { ms: 6000 }); return; }
    const addr = String(code).split('#')[0];
    let host = addr, going = false;
    try { host = new URL(addr).host; } catch (e) { /* shown as it came */ }
    const fail = e => A.sheet(A.t('Could not connect this device'), (body, api) => body.append(h('p.lead', { text: e.message }), h('div.stack', null,
      A.btn(A.t('Try again'), () => { api.close(); go(); }, 'primary'),
      A.btn(A.t('Carry on without the cloud for now'), () => { api.close(); if (!A.state.meta.onboarded) A.onboard(); }))));
    const go = () => C.connect(code, { join: true }).then(res => (res.remote ? res.start(true).then(() => 'in') : 'empty')).then(how => {
      /* not a change to the budget, so it is not sent to the cloud as one */
      if (!A.state.meta.onboarded) { A.state.meta.onboarded = true; A.touch(); }
      A.toast(how === 'in' ? A.t('This device now shares your budget.') : A.t('Connected. The cloud is still empty: open the app on the device that holds your budget and it uploads by itself.'), { ms: 8000 });
    }, fail);
    A.sheet(A.t('Connect this device to a shared budget?'), (body, api) => body.append(
      h('p.lead', { text: A.t('It will keep in step with the cloud at {host}.', { host: host }) }),
      h('p.note', { text: A.t('Only continue if this link came from you, or from someone you share the budget with.') }),
      hadData ? h('p.sub', { text: A.t('What is on this device now is kept under Settings, “Earlier copies”.') }) : null,
      h('div.actions', null, A.btn(A.t('Cancel'), api.close), A.btn(A.t('Connect'), () => { going = true; api.close(); go(); }, 'primary'))),
    { onclose: () => { if (!going && !A.state.meta.onboarded) A.onboard(); } });
  };

  A.workerSource = function () {
    const el = document.getElementById('worker-src');
    if (el) return Promise.resolve(el.textContent);
    return fetch('cloud-worker.js', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('missing'); return r.text(); });
  };

  A.sheetSource = function () {
    const el = document.getElementById('sheet-src');
    if (el) return Promise.resolve(el.textContent);
    return fetch('sheet-backup.js', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('missing'); return r.text(); });
  };
  /* what the Google Sheet shows in a tab a person can read: the money entries, as in the spreadsheet export */
  A.sheetTables = () => [{ name: A.t('Money entries'), rows: A.txTable() }];

  /* every change to the budget is sent on; a copy that arrived from outside is not sent back */
  A.on(what => {
    if (what === 'data' || what === 'auto' || what === 'quiet' || what === 'mode') C.queue();
    else if (what === 'swap' && C.cfg) fresh();
  });
  window.addEventListener('online', () => { if (C.cfg && A.licensed && A.state) C.sync(); });

  A.cloudPanel = function () {
    const c = C.cfg;
    if (c) {
      const status = C.status === 'error' ? A.t('Could not reach your cloud: {why} Your budget is safe on this device and will sync when the connection is back.', { why: C.err })
        : C.status === 'syncing' ? A.t('Syncing…') : c.syncedLocal ? A.t('Connected. Last synced {when}.', { when: when(c.syncedLocal) }) : A.t('Connected. Not synced yet.');
      const pushOn = c.push && R.perm() === 'granted', inSheet = isSheet(c.url);
      return A.sec('cloud', A.t('Personal cloud'), status,
        h('p.sub', { text: inSheet ? A.t('The copy is in your own Google Sheet. To go back to an earlier day, open the sheet and use “File”, “Version history”.') : pushOn ? A.t('Real notifications are on for this device, even when the app is closed.') : A.t('Turn on notifications to get reminders on this device even when the app is closed.') }),
        h('div.actions.start', null,
          A.btn(A.t('Sync now'), () => C.sync().then(ok => A.toast(ok ? A.t('Synced.') : A.t('Could not sync right now.')))),
          inSheet ? null : pushOn ? A.btn(A.t('Send a test from the cloud'), () => call('/test', 'POST', { title: A.t('Your cloud reminders work'), body: A.t('This came from your own Cloudflare Worker.') }).then(() => A.toast(A.t('Sent. It should arrive within a few seconds.')), e => A.toast(e.message)), null, 'bell')
            : A.btn(A.t('Turn on real notifications'), async () => {
              if (R.perm() !== 'granted') { const p = await R.enable(); if (p !== 'granted') return; }
              const ok = await C.subscribe();
              A.toast(ok ? A.t('Real notifications are on.') : A.t('This browser cannot receive push here. On iPhone, add the app to your Home Screen first.'), { ms: 6000 });
              A.render();
            }, 'primary', 'bell'),
          A.btn(A.t('Add another device'), () => A.sheet(A.t('Add another device'), body => {
            const code = c.url + '#' + c.key;
            const byHand = [
              h('p.sub', { text: A.t('On the other device unlock the app, open Settings, Personal cloud, and paste this code as the address. Keep it private: it opens your budget.') }),
              h('textarea.code-box', { readOnly: true, rows: 3, value: code, onfocus: e => e.target.select() }),
              h('div.actions', null, A.btn(A.t('Copy the code'), () => A.copy(code, A.t('Code copied.'))))];
            if (!/^https?:$/.test(location.protocol)) { body.append(byHand); return; }
            A.store.peek('licence').then(lic => {
              const pack = btoa(JSON.stringify({ u: c.url, k: c.key, c: (lic && lic.code) || '' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
              const link = location.origin + location.pathname + '#join=' + pack;
              body.append(
                h('p.lead', { text: A.t('Send this link to your other phone, tablet or computer and open it there. That device unlocks itself and shows the same budget.') }),
                h('p.note', { text: A.t('Send it only to yourself or to someone who shares this budget. Whoever opens the link can see it.') }),
                h('div.stack', null,
                  navigator.share ? A.btn(A.t('Send the setup link'), () => A.shareLink(link, A.t('Open this on your other device to share the budget.')), 'primary') : null,
                  A.btn(A.t('Copy the setup link'), () => A.copy(link, A.t('Link copied.')), navigator.share ? null : 'primary')),
                h('details.more-info', null, h('summary', { text: A.t('Connect by hand instead') }), byHand));
            });
          }))),
        h('button.link.danger', { type: 'button', onclick: () => A.sheet(A.t('Disconnect the cloud?'), (body, api) => {
          body.append(h('p.lead', { text: A.t('Your budget stays on this device either way.') }), h('div.stack', null,
            A.btn(A.t('Disconnect this device only'), () => { api.close(); C.disconnect(false); }, 'primary'),
            A.btn(A.t('Disconnect and erase the cloud copy'), () => { api.close(); C.disconnect(true); }, 'danger'), A.btn(A.t('Cancel'), api.close)));
        }) }, A.t('Disconnect')));
    }
    const url = h('input', { type: 'text', inputmode: 'url', autocomplete: 'off', autocapitalize: 'none', spellcheck: false, placeholder: 'https://my-budget.yourname.workers.dev', 'aria-label': A.t('Your cloud address') });
    const msg = h('p.field-hint.error', { role: 'alert' });
    const connect = () => A.needFull(async () => {
      msg.textContent = A.t('Connecting…');
      try {
        const res = await C.connect(url.value);
        msg.textContent = '';
        if (res.remote) {
          A.sheet(A.t('This cloud already holds a budget'), (body, api) => {
            const done = (ok, text) => A.toast(ok ? text : A.t('Connected, but the first upload did not go through. It will try again by itself.'), { ms: 7000 });
            body.append(h('p.lead', { text: A.t('It was last changed {when}. Which one should this device use? The other is kept under “Earlier copies”, so nothing is lost.', { when: when(res.remote.updatedAt) }) }),
              h('div.stack', null,
                A.btn(A.t('Use the cloud copy on this device'), () => { api.close(); res.start(true).then(ok => done(ok, A.t('Connected.'))); }, 'primary'),
                A.btn(A.t('Keep this device’s copy and send it to the cloud'), () => { api.close(); res.start(false).then(ok => done(ok, A.t('Connected. This device’s budget is now in your cloud.'))); }),
                A.btn(A.t('Cancel'), api.close)));
          });
        } else A.toast(res.ok ? A.t('Connected. Your budget is now backed up to your own cloud.') : A.t('Connected, but the first upload did not go through. It will try again by itself.'), { ms: 7000 });
      } catch (e) { msg.textContent = e.message; }
    }, A.t('The personal cloud'));
    const link = h('a', { href: 'https://dash.cloudflare.com/sign-up', target: '_blank', rel: 'noopener' }, 'dash.cloudflare.com');
    return A.sec('cloud', A.t('Personal cloud (optional)'), A.t('Free, and yours alone: it runs in your own Google or Cloudflare account. The app works fully without it.'),
      h('ul.steps.benefits', null,
        h('li', null, h('strong', { text: A.t('Automatic backup.') + ' ' }), A.t('A lost or reset phone no longer means a lost budget.')),
        h('li', null, h('strong', { text: A.t('Same budget on every device.') + ' ' }), A.t('Phone, tablet and computer stay in step.')),
        h('li', null, h('strong', { text: A.t('Still private.') + ' ' }), A.t('Nobody else, including the seller of this app, can see it.'))),
      h('details.more-info', null, h('summary', { text: A.t('With Google Sheets: about 5 minutes') }),
        h('p.sub', { text: A.t('Everything is copied into a Google Sheet in your own Google account, by itself, whenever something changes. Do these steps once, on a computer.') }),
        h('ol.steps', null,
          h('li', null, A.rich(A.t('Open {link} while signed in to your own Google account (a work or school account may not allow this). A new, empty sheet opens. Give it a name, for example {name}.'), { link: h('a', { href: 'https://sheets.new', target: '_blank', rel: 'noopener' }, 'sheets.new'), name: h('em', { text: 'Planner backup' }) })),
          h('li', { text: A.t('In the menu of the sheet choose “Extensions”, then “Apps Script”. A code editor opens.') }),
          h('li', null, A.t('Delete everything in the editor, paste the code from the button below, and press the save icon.'),
            h('div.actions.start', null, A.btn(A.t('Copy the code for Google Sheets'), () => A.sheetSource().then(t => A.copy(t, A.t('Code copied. Paste it into the Apps Script editor.')), () => A.toast(A.t('Could not load the code. Open cloud-worker.js from your download instead.').replace('cloud-worker.js', 'sheet-backup.js'))), 'primary'))),
          h('li', { text: A.t('Press “Deploy”, then “New deployment”. Press the gear next to “Select type” and choose “Web app”. Set “Execute as” to “Me” and “Who has access” to “Anyone”, then press “Deploy”.') }),
          h('li', { text: A.t('Google asks for permission once: press “Authorize access” and choose your account. If it says the app is not verified, choose “Advanced”, then “Go to … (unsafe)”: it says so because the code is your own copy. Then allow what it lists, which is this one sheet.') }),
          h('li', { text: A.t('Copy the “Web app” address (it ends in /exec), paste it below and press Connect. Everything already in this app is copied for you.') })),
        h('p.field-hint', { text: A.t('Google shows these names in your own language, in the same places. “Anyone” is needed because the app does not sign in to Google; the device code that the app makes is what keeps other people out.') }),
        h('p.field-hint', { text: A.t('This way has no notifications while the app is closed. For those, use “Add to my calendar” or the Cloudflare way.') })),
      h('details.more-info', null, h('summary', { text: A.t('With Cloudflare: about 10 minutes') }),
        h('p.sub', null, h('strong', { text: A.t('Real notifications.') + ' ' }), A.t('Reminders arrive even when the app is closed, including on iPhone.')),
        h('ol.steps', null,
          h('li', null, A.rich(A.t('Create a free account at {link}. No card is needed.'), { link: link })),
          h('li', null, A.rich(A.t('Open “Workers & Pages”, choose Create, then “Start with Hello World”. Name it, for example {name}, and press Deploy.'), { name: h('em', { text: 'my-budget' }) })),
          h('li', null, A.t('Press “Edit code”. Delete everything in the editor, paste the code from the button below, and press Deploy.'),
            h('div.actions.start', null, A.btn(A.t('Copy the cloud code'), () => A.workerSource().then(t => A.copy(t, A.t('Cloud code copied. Paste it into the Cloudflare editor.')), () => A.toast(A.t('Could not load the code. Open cloud-worker.js from your download instead.'))), 'primary'))),
          h('li', null, A.rich(A.t('Open “Storage & Databases”, then KV, and create a namespace called {name}.'), { name: h('em', { text: 'budget' }) })),
          h('li', null, A.rich(A.t('Back in your Worker: Settings, Bindings, Add, “KV namespace”. Variable name {db} (capital letters), namespace {name}. Save.'), { db: h('strong', { text: 'DB' }), name: h('em', { text: 'budget' }) })),
          h('li', null, A.rich(A.t('Still in Settings: Trigger Events, Add, “Cron Triggers”. Choose every 10 minutes, or type {cron}. Save.'), { cron: h('code', { text: '*/10 * * * *' }) })),
          h('li', { text: A.t('Copy the Worker address shown at the top (it ends in workers.dev), paste it below and press Connect. Everything already in this app is uploaded for you.') })),
        h('p.field-hint', { text: A.t('Cloudflare renames its menus now and then. If a label differs, look for the closest match. You need four things in the end: a Worker, this code inside it, a KV namespace bound as DB, and a 10-minute cron trigger.') })),
      h('form.form', { onsubmit: e => { e.preventDefault(); connect(); } }, A.field(A.t('Your cloud address, or a device code'), url), msg,
        h('div.actions.start', null, h('button.btn.primary', { type: 'submit' }, A.icon('cloud'), A.t('Connect')))));
  };
})(window.App);
