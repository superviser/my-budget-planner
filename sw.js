/* sw.js: offline support, the buyer's own home-screen name and icon, and reminder notifications */
'use strict';
/* Stamped by tools/stamp.py on every release. A new stamp makes the browser fetch the whole app again in one go,
   so a device never runs half an old version and half a new one. */
const VERSION = 'd82df58ad89f';
/* When this release was made, and where newer ones are published: see "fixes reach every copy" below. Stamped as well. */
const BUILT = 1794957100;
const UPDATES = 'https://raw.githubusercontent.com/superviser/my-budget-planner/';
const SHELL = 'shell-' + VERSION, CUSTOM = 'custom';
const FILES = [
  './', 'index.html', 'config.js', 'css/app.css', 'css/fonts.css', 'manifest.webmanifest', 'cloud-worker.js', 'sheet-backup.js', 'update.json',
  'js/core.js', 'js/i18n.js', 'js/logic.js', 'js/sample.js', 'js/ui.js', 'js/views.js', 'js/views2.js', 'js/settings.js', 'js/sync.js', 'js/guide.js', 'js/update.js', 'js/release.js', 'js/main.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/badge-96.png', 'icons/favicon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    /* only this app's own older caches: another app on the same address keeps its own */
    .then(keys => Promise.all(keys.filter(k => k.indexOf('shell-') === 0 && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Serve from the device first and refresh in the background, so the app opens instantly and offline.
   Languages, fonts and pictures are kept the first time they are used.
   config.js goes to the network first so new unlock codes reach buyers quickly. */
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  /* one copy per file, whatever follows the "?" */
  const key = url.origin + url.pathname;
  const keep = res => (res && res.ok && res.type === 'basic' ? caches.open(SHELL).then(c => c.put(key, res.clone())).then(() => res, () => res) : res);
  const fresh = () => fetch(req).then(keep);

  if (url.pathname.endsWith('/config.js')) {
    e.respondWith((async () => {
      const cached = await caches.match(key);
      try {
        const res = await Promise.race([fresh(), new Promise((ok, no) => setTimeout(() => no(new Error('slow')), 3000))]);
        return res.ok ? res : (cached || res);   /* a server error must not lock a buyer out: the copy on the device still works */
      } catch (err) { return cached || fetch(req); }
    })());
    return;
  }
  /* every time the app is opened: is there a newer release? Asked from here, so it happens even if the page itself is broken */
  if (req.mode === 'navigate') e.waitUntil(checkUpdates(false));
  e.respondWith((async () => {
    const custom = await (await caches.open(CUSTOM)).match(key);
    if (custom) return custom;
    const newer = await fromUpdate(url);
    if (newer) return newer;
    const hit = await (await caches.open(SHELL)).match(key);
    if (hit) { e.waitUntil(fresh().catch(() => null)); return hit; }
    try { return await fresh(); }
    catch (err) {
      if (req.mode === 'navigate') { const page = await caches.match(new URL('index.html', self.registration.scope).href); if (page) return page; }
      throw err;
    }
  })());
});

/* On a first visit the page loads before this worker is in charge, so what it fetched then (the language file, a chosen font)
   never passed through here. The page sends that list once, and anything not kept yet is fetched and kept. */
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'update') { e.waitUntil(updateAsked(d, e.source)); return; }
  if (d.type !== 'keep' || !Array.isArray(d.urls)) return;
  e.waitUntil(caches.open(SHELL).then(async c => {
    for (const u of d.urls.slice(0, 120)) {
      try {
        const url = new URL(u, location.href);
        if (url.origin !== location.origin) continue;
        const key = url.origin + url.pathname;
        if (await c.match(key)) continue;
        const res = await fetch(key);
        if (res.ok && res.type === 'basic') await c.put(key, res);
      } catch (err) { /* kept the next time it is used */ }
    }
  }));
});

/* ---------- fixes reach every copy, whoever hosts it ----------
   A copy on somebody's own address is uploaded once and never again, so by itself it would stay the version it was on that day.
   Instead, when the app is opened this worker asks the app's public GitHub repository which release is the newest. If that is
   newer than this copy, and newer than what the copy's own address serves, the files that changed are fetched, checked and
   kept on the device, and from then on they are served in place of the older ones.

   Nothing is taken on trust. The list of files (update.json) carries a signature only the maker of the app can produce, it
   must be for this app and newer than what is running, and every file must match its fingerprint in that list.
   Two files always stay as the copy's own address serves them: config.js (the copy's own settings) and this worker.
   A copy that sets updates: false in config.js never asks. */
const UPKEY = { x: 'jNAmKzD0Wk6cYnEV7ghbQRmcxHdbPRMwZqMnoiJsXCc', y: 'YB-8ifk1KddWuJLKcfCQH0SWwaq8VS9ZaJQp2oT9KUc' };
/* Raise by hand when a release needs this file itself to be newer. An older worker then leaves that release alone
   (Settings says a newer version is out) instead of running pages it was not written for. */
const WORKER = 1;
const APP_ID = 'budget-planner';
const UP = SHELL.split('shell-')[0] + 'update-', UPSTATE = UP + 'state';
const TYPES = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8',
  webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', woff2: 'font/woff2', txt: 'text/plain; charset=utf-8'
};
const base = () => self.registration.scope;
const hex = buf => Array.from(new Uint8Array(buf), b => ('0' + b.toString(16)).slice(-2)).join('');
const json = v => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });
/* GitHub is told nothing about the copy that asks: not the address it runs on, no cookies */
const github = path => fetch(UPDATES + path, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });

/* what the updater remembers between visits: when it last asked, what the newest release was, whether this copy wants updates */
async function upState() {
  try { const r = await (await caches.open(UPSTATE)).match(base() + '__state'); return r ? await r.json() : {}; }
  catch (err) { return {}; }
}
async function upRemember(patch) {
  const st = Object.assign(await upState(), patch);
  await (await caches.open(UPSTATE)).put(base() + '__state', json(st));
  return st;
}

/* update.json is { sig, body }: body is the exact text that was signed */
async function signedList(text) {
  const env = JSON.parse(text);
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: UPKEY.x, y: UPKEY.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const sig = Uint8Array.from(atob(env.sig), c => c.charCodeAt(0));
  if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, new TextEncoder().encode(env.body)))) throw new Error('signature');
  const m = JSON.parse(env.body);
  if (m.app !== APP_ID || !(m.built > 0) || !m.files || typeof m.files !== 'object') throw new Error('list');
  return m;
}

/* The newer release kept on this device, if there is one: { built, version, files, lazy, cache }.
   A release is only used once all of it is here (its list is written last), and only while it is newer than the copy itself:
   after the copy is uploaded again with something newer, what was kept is thrown away. */
let upFound = null;
const kept = () => upFound || (upFound = findKept().catch(() => null));
async function findKept() {
  let best = null;
  const names = (await caches.keys()).filter(n => n.indexOf(UP) === 0 && n !== UPSTATE);
  for (const n of names) {
    const built = +n.slice(UP.length);
    if (!(built > BUILT)) continue;
    const c = await caches.open(n), r = await c.match(base() + '__update');
    if (r && (!best || built > best.built)) { const m = await r.json(); best = { built: built, version: m.version, files: m.files, lazy: m.lazy || {}, cache: c }; }
  }
  /* older than the copy, or older than the release in use: no longer needed. One that is still being fetched is newer, and stays. */
  for (const n of names) { if (+n.slice(UP.length) <= Math.max(BUILT, best ? best.built - 1 : 0)) await caches.delete(n); }
  return best;
}

/* one file of a release, from its tag in the repository; kept only if it is exactly the file the signed list names */
async function pull(rel, path, cache) {
  const res = await github('r' + rel.built + '/' + path);
  if (!res.ok) throw new Error('fetch ' + res.status);
  const buf = await res.arrayBuffer();
  if (hex(await crypto.subtle.digest('SHA-256', buf)) !== rel.files[path]) throw new Error('fingerprint');
  const out = new Response(buf, { headers: { 'content-type': TYPES[path.split('.').pop()] || 'application/octet-stream' } });
  await cache.put(base() + path, out.clone());
  return out;
}

/* a request for one of the app's files: the newer release answers if it has that file */
async function fromUpdate(url) {
  const up = await kept(), root = new URL(base()).pathname;
  if (!up || url.pathname.indexOf(root) !== 0) return null;
  const path = url.pathname.slice(root.length) || 'index.html';
  const hit = await up.cache.match(base() + path);
  if (hit) return hit;
  /* changed in that release, but not needed until now (another language, a picture): fetched the first time it is asked for */
  if (!up.lazy[path]) return null;
  try { return await pull(up, path, up.cache); } catch (err) { return null; }
}

async function installUpdate(m, up) {
  const root = base(), cache = await caches.open(UP + m.built);
  /* the fingerprints of this copy's own files: only what differs from them is fetched */
  let own = {};
  try {
    const r = (await (await caches.open(SHELL)).match(root + 'update.json')) || (await fetch(root + 'update.json'));
    const mine = JSON.parse((await r.json()).body);
    if (mine.built === BUILT) own = mine.files;
  } catch (err) { /* not known: everything counts as changed */ }
  /* fetched now: what the app needs in order to open, and whatever this device already keeps for use without a connection */
  const want = {};
  (m.shell || []).forEach(p => { want[p] = 1; });
  for (const c of [await caches.open(SHELL), up && up.cache]) {
    if (!c) continue;
    (await c.keys()).forEach(rq => { if (rq.url.indexOf(root) === 0) want[rq.url.slice(root.length) || 'index.html'] = 1; });
  }
  const lazy = {};
  for (const p of Object.keys(m.files)) {
    if (m.files[p] === own[p]) continue;
    if (!want[p]) { lazy[p] = 1; continue; }
    if (await cache.match(root + p)) continue;                                  /* already here from an attempt that was cut short */
    const have = up && up.files[p] === m.files[p] && (await up.cache.match(root + p));
    if (have) await cache.put(root + p, have); else await pull(m, p, cache);
  }
  await cache.put(root + '__update', json({ version: m.version, built: m.built, files: m.files, lazy: lazy }));
  upFound = null;
  await kept();
  (await self.clients.matchAll({ type: 'window' })).forEach(c => c.postMessage({ type: 'updated' }));
}

/* One look at a time. Asked for by the person: always. Otherwise at most once an hour, and not for ten minutes after a failed attempt. */
let upQueue = Promise.resolve();
function checkUpdates(asked) {
  if (!UPDATES) return upState();
  upQueue = upQueue.then(() => checkNow(asked)).catch(() => upRemember({ failedAt: Date.now() })).catch(() => ({}));
  return upQueue;
}
async function checkNow(asked) {
  const st = await upState(), now = Date.now();
  if (!asked && (st.off || now - (st.checkedAt || 0) < HOUR || now - (st.failedAt || 0) < HOUR / 6)) return st;
  const res = await github('main/update.json');
  if (!res.ok) throw new Error('fetch ' + res.status);
  const m = await signedList(await res.text());
  const up = await kept(), done = { checkedAt: now, failedAt: 0, latest: { built: m.built, version: m.version }, manual: false };
  if (!(m.built > (up ? up.built : BUILT)) || st.off) return upRemember(done);
  /* this address may serve that release itself: the app's own address after a release, or a copy that was uploaded again.
     Then the browser's ordinary update does the work. */
  try {
    const mine = await fetch(base() + 'update.json', { cache: 'no-store' });
    if (mine.ok && JSON.parse((await mine.json()).body).built >= m.built) { self.registration.update().catch(() => null); return upRemember(done); }
  } catch (err) { /* cannot tell: go on */ }
  if (m.worker > WORKER) { done.manual = true; return upRemember(done); }
  await installUpdate(m, up);
  return upRemember(done);
}

/* from the page: whether this copy wants updates at all, a request to look right now, and always an answer with where things stand */
async function updateAsked(d, client) {
  if (typeof d.auto === 'boolean' && !!(await upState()).off === d.auto) await upRemember({ off: !d.auto });
  const st = d.check ? await checkUpdates(true) : await upState();
  const up = await kept();
  if (client) client.postMessage({ type: 'update-state', on: !!UPDATES, built: up ? up.built : BUILT, state: st, checked: !!d.check });
  if (!d.check) await checkUpdates(false);
}

/* ---------- a tiny key-value reader/writer over the same database the app uses ---------- */
function db() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open('budget-planner', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
const kv = (mode, fn) => db().then(d => new Promise((res, rej) => {
  const t = d.transaction('kv', mode), rq = fn(t.objectStore('kv'));
  t.oncomplete = () => { d.close(); res(rq && rq.result); };
  t.onerror = t.onabort = () => { d.close(); rej(t.error); };
}));
const get = k => kv('readonly', s => s.get(k)).catch(() => undefined);
const set = (k, v) => kv('readwrite', s => s.put(v, k)).catch(() => undefined);

const HOUR = 36e5;
async function notify(items, shown) {
  const now = Date.now();
  for (const it of items) {
    await self.registration.showNotification(it.title, {
      body: it.body, tag: it.id, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: self.registration.scope }
    });
    shown[it.id] = now;
  }
  Object.keys(shown).forEach(k => { if (shown[k] < now - 14 * 24 * HOUR) delete shown[k]; });
  await set('shown', shown);
}
/* Reminders that have come due according to the schedule the app last saved on this device. */
async function localDue(includeRecent) {
  const sched = await get('schedule'), shown = (await get('shown')) || {}, now = Date.now();
  const items = ((sched && sched.items) || []).filter(e => e.at <= now && e.at > now - 36 * HOUR && (!shown[e.id] || (includeRecent && shown[e.id] > now - 2 * HOUR)));
  return { items: items, shown: shown, fallback: sched && sched.fallback };
}

/* Android and desktop: the browser wakes the app now and then, even when it is closed. */
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'reminders') return;
  e.waitUntil(localDue(false).then(r => r.items.length ? notify(r.items, r.shown) : null));
});

/* Personal cloud: the Worker sends an empty push; the text comes from the cloud, or from this device if it is offline. */
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    const cloud = await get('cloud'), local = await localDue(true);
    let items = [];
    if (cloud && cloud.url) {
      try {
        const r = await fetch(cloud.url + '/due', { headers: { authorization: 'Bearer ' + cloud.key } });
        if (r.ok) items = (await r.json()).items || [];
      } catch (err) { /* offline: fall back to what this device knows */ }
    }
    if (!items.length) items = local.items;
    /* the app saves this line in the buyer's own language; the English is only for a device that has never opened the app */
    const fb = local.fallback || { title: 'A reminder from your budget', body: 'Open the app to see what needs you.' };
    if (!items.length) items = [{ id: 'reminder', title: fb.title, body: fb.body }];
    await notify(items, local.shown);
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.indexOf(self.registration.scope) === 0);
    if (open) { open.postMessage({ type: 'open' }); return open.focus(); }
    return self.clients.openWindow(self.registration.scope);
  }));
});
