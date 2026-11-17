// Budget Planner: your personal cloud.
//
// Paste this whole file into your own Cloudflare Worker and press Deploy.
// It needs two things in the Worker's settings:
//   1. a KV namespace bound with the variable name  DB
//   2. a Cron Trigger that runs every 10 minutes:   */10 * * * *
//
// What it does: keeps a backup of your budget, keeps your devices in step,
// and sends your reminders as real notifications. It runs in your account;
// nobody else can read it. The first device that connects sets the access key.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-max-age': '86400'
};
const HOUR = 3600000;
const enc = new TextEncoder();
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });
const b64u = buf => {
  let s = '';
  new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const sha = async text => b64u(await crypto.subtle.digest('SHA-256', enc.encode(text)));
const read = async (env, key, fallback) => (await env.DB.get(key, 'json')) || fallback;
const write = (env, key, value) => env.DB.put(key, JSON.stringify(value));

/* The key pair that proves to phones that a notification really comes from this Worker. Made once, kept in KV. */
async function vapid(env) {
  let v = await env.DB.get('vapid', 'json');
  if (!v) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    v = { key: b64u(await crypto.subtle.exportKey('raw', pair.publicKey)), jwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
    await write(env, 'vapid', v);
  }
  return v;
}

/* An empty push. The app fetches the text from /due, so nothing readable travels through the push service. */
async function pushTo(sub, v, origin) {
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(sub.endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: origin })));
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body)));
  return fetch(sub.endpoint, { method: 'POST', headers: { TTL: '86400', Urgency: 'high', Authorization: 'vapid t=' + head + '.' + body + '.' + sig + ', k=' + v.key } });
}

async function sendAll(env) {
  const subs = await read(env, 'subs', []);
  if (!subs.length) return 0;
  const v = await vapid(env), origin = (await env.DB.get('origin')) || 'https://workers.cloudflare.com';
  const gone = [];
  for (const s of subs) {
    try {
      const r = await pushTo(s.sub, v, origin);
      if (r.status === 404 || r.status === 410) gone.push(s.sub.endpoint);   // that device unsubscribed
    } catch (e) { /* a push service that is down today is not a reason to forget the device */ }
  }
  // read the list again before trimming it, so a device that subscribed in the meantime is not dropped
  if (gone.length) await write(env, 'subs', (await read(env, 'subs', [])).filter(s => gone.indexOf(s.sub.endpoint) < 0));
  return subs.length - gone.length;
}

/* Runs on the cron trigger: send whatever has come due since the last run. */
async function tick(env) {
  const sched = await read(env, 'schedule', []);
  if (!sched.length) return 0;
  const fired = await read(env, 'fired', {}), now = Date.now();
  const due = sched.filter(e => e.at <= now && e.at > now - 24 * HOUR && !fired[e.id]);
  if (!due.length) return 0;
  due.forEach(e => { fired[e.id] = now; });
  Object.keys(fired).forEach(k => { if (fired[k] < now - 7 * 24 * HOUR) delete fired[k]; });
  await write(env, 'fired', fired);
  await write(env, 'due', { at: now, items: due.map(e => ({ id: e.id, title: e.title, body: e.body })) });
  await sendAll(env);
  return due.length;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname.replace(/\/+$/, '') || '/', method = req.method;
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (!env.DB) return json({ error: 'Almost there: the storage is not connected. In this Worker open Settings, Bindings, add a KV namespace and name the variable DB.' }, 500);
    if (path === '/' && method === 'GET') {
      return new Response('Your budget cloud is running.\nPaste this address into the app (Settings, Personal cloud):\n' + url.origin + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS } });
    }

    const auth = await env.DB.get('auth');
    if (path === '/claim' && method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (!body.key || String(body.key).length < 16) return json({ error: 'Missing key.' }, 400);
      const hash = await sha(String(body.key));
      if (!auth) {
        await env.DB.put('auth', hash);
        await env.DB.put('origin', url.origin);
        return json({ ok: true, fresh: true });
      }
      return auth === hash ? json({ ok: true }) : json({ error: 'This cloud is already connected with a different device code.' }, 401);
    }
    const key = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!auth || !key || (await sha(key)) !== auth) return json({ error: 'Not allowed.' }, 401);

    if (path === '/data' && method === 'GET') {
      const d = await env.DB.get('data', 'json');
      if (!d) return json({ empty: true });
      if (String(d.updatedAt) === url.searchParams.get('since')) return json({ same: true, updatedAt: d.updatedAt });
      return json({ state: d.state, updatedAt: d.updatedAt });
    }
    if (path === '/data' && method === 'PUT') {
      const body = await req.json().catch(() => null);
      if (!body || !body.state) return json({ error: 'Nothing to save.' }, 400);
      const cur = await env.DB.get('data', 'json');
      /* Another device saved since this one last synced: hand back that copy instead of overwriting it. */
      if (cur && body.base != null && cur.updatedAt !== body.base) return json({ error: 'Changed on another device.', state: cur.state, updatedAt: cur.updatedAt }, 409);
      const updatedAt = body.updatedAt || Date.now();
      await write(env, 'data', { state: body.state, updatedAt });
      const sched = JSON.stringify(body.schedule || []);
      if (sched !== (await env.DB.get('schedule'))) await env.DB.put('schedule', sched);
      return json({ ok: true, updatedAt });
    }
    if (path === '/data' && method === 'DELETE') {
      for (const k of ['data', 'schedule', 'fired', 'due', 'subs', 'auth', 'origin']) await env.DB.delete(k);
      return json({ ok: true });
    }
    if (path === '/vapid' && method === 'GET') return json({ key: (await vapid(env)).key });
    if (path === '/subscribe' && method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (!body.sub || !body.sub.endpoint) return json({ error: 'Missing subscription.' }, 400);
      const subs = (await read(env, 'subs', [])).filter(s => s.device !== body.device && s.sub.endpoint !== body.sub.endpoint);
      subs.push({ device: body.device || '', sub: body.sub, at: Date.now() });
      await write(env, 'subs', subs.slice(-10));
      return json({ ok: true });
    }
    if (path === '/unsubscribe' && method === 'POST') {
      const body = await req.json().catch(() => ({}));
      await write(env, 'subs', (await read(env, 'subs', [])).filter(s => s.device !== body.device));
      return json({ ok: true });
    }
    if (path === '/due' && method === 'GET') {
      const d = await env.DB.get('due', 'json');
      return json({ items: d && d.at > Date.now() - 2 * HOUR ? d.items : [] });
    }
    if (path === '/test' && method === 'POST') {
      // the app sends the two lines in the buyer's own language
      const body = await req.json().catch(() => ({}));
      const title = String(body.title || 'Your cloud reminders work').slice(0, 120), text = String(body.body || 'This came from your own Cloudflare Worker.').slice(0, 200);
      await write(env, 'due', { at: Date.now(), items: [{ id: 'test' + Date.now(), title, body: text }] });
      const n = await sendAll(env);
      return n ? json({ ok: true, sent: n }) : json({ error: 'No device has notifications switched on yet.' }, 400);
    }
    return json({ error: 'Not found.' }, 404);
  },

  async scheduled(event, env, ctx) {
    if (env.DB) ctx.waitUntil(tick(env));
  }
};
