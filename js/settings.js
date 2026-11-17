/* settings.js: look and identity, Settings page, More page, first-run setup, unlock, backups, one-tap links */
'use strict';
(function (A) {
  const h = A.h, V = A.views;
  /* what an empty budget keeps from the one before it */
  const KEEP = ['appName', 'icon', 'iconImg', 'currency', 'weekStart'].concat(A.LOOK_KEYS);
  const worth = s => s.tx.length + s.rules.length + s.funds.length + s.debts.length > 0;

  /* ---------- look ---------- */
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  let lookSig = '', idSig = '';
  A.cssColor = function (v) {
    const t = h('i', { style: { color: v, display: 'none' } });
    document.body.append(t);
    const c = getComputedStyle(t).color;
    t.remove();
    return c;
  };
  A.hex = function (v) {
    const c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = c.height = 1;
    try { x.fillStyle = A.cssColor(v); } catch (e) { /* keep default */ }
    x.fillRect(0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map(n => n.toString(16).padStart(2, '0')).join('');
  };
  const rgbOf = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''), n = m ? parseInt(m[1], 16) : 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  A.lum = hex => {
    const c = rgbOf(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  A.contrast = (a, b) => { const x = A.lum(a), y = A.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  /* The colours on screen right now, as plain values the buyer can then change one by one. */
  A.currentColours = () => ({ bg: A.hex('var(--ground)'), card: A.hex('var(--well)'), text: A.hex('var(--ink)'), accent: A.hex('var(--accent)') });
  /* Photos are shrunk before they are kept, so a big camera picture does not bloat the budget file. */
  const loadImage = (file, draw) => new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { try { res(draw(img)); } catch (e) { rej(e); } finally { URL.revokeObjectURL(url); } };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('not an image')); };
    img.src = url;
  });
  A.shrinkImage = (file, max, quality) => loadImage(file, img => {
    const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  });
  A.squareImage = (file, size, quality) => loadImage(file, img => {
    const c = document.createElement('canvas'), side = Math.min(img.width, img.height);
    c.width = c.height = size;
    c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
    return c.toDataURL('image/jpeg', quality);
  });
  const notPicture = () => A.toast(A.t('That file is not a picture this browser can read.'));

  /* Several look values in one go, into the same place A.setLook writes: this person's own look, or the shared one. */
  const setLooks = o => A.commit(s => { const me = A.shared() ? A.me() : null; Object.assign(me ? (me.look = me.look || {}) : s.profile, o); });
  const set = (k, v) => A.commit(s => { s.profile[k] = v; });

  A.applyLook = function () {
    const p = A.state.profile, L = A.look(), el = document.documentElement, th = A.by(A.THEMES, L.theme) || A.THEMES[0];
    const own = L.theme === 'own' && L.own ? L.own : null;
    let font = A.by(A.FONTS, L.font) || A.FONTS[0];
    if (font.bundled && !A.hosted()) font = A.FONTS[0];   /* the single offline file carries no font files */
    /* With the buyer's own colours, light or dark follows the card colour they picked. */
    const dark = own ? A.lum(own.card) < 0.3 : L.mode === 'dark' || (L.mode !== 'light' && mq && mq.matches);
    const ownSig = own ? [own.bg, own.card, own.text, own.accent, own.veil, (own.bgImg || '').length, (own.bgImg || '').slice(-24), (own.cardImg || '').length, (own.cardImg || '').slice(-24)].join(',') : '';
    const size = A.clamp(+L.textSize || 1, 0.8, 1.5);
    const sig = [L.layout, L.theme, ownSig, dark, font.id, size, L.calm, L.motion, A.licensed].join('|');
    if (sig !== lookSig) {
      lookSig = sig;
      el.dataset.layout = A.by(A.LAYOUTS, L.layout) ? L.layout : 'tray'; el.dataset.mode = dark ? 'dark' : 'light'; el.dataset.font = font.id;
      el.dataset.calm = L.calm ? '1' : '0'; el.dataset.motion = L.motion === false ? '0' : '1'; el.dataset.demo = A.licensed ? '0' : '1';
      if (th.h != null) { el.style.setProperty('--h', th.h); el.style.setProperty('--cs', th.cs); }
      el.style.fontSize = Math.round(size * (font.scale || 1) * 100) + '%';
      el.dataset.own = own ? '1' : '0';
      el.dataset.bgimg = own && own.bgImg ? '1' : '0';
      el.dataset.cardimg = own && own.cardImg ? '1' : '0';
      const put = (k, v) => { if (v) el.style.setProperty(k, v); else el.style.removeProperty(k); };
      put('--own-bg', own && own.bg); put('--own-card', own && own.card); put('--own-text', own && own.text); put('--own-accent', own && own.accent);
      put('--own-on', own && (A.contrast(own.accent, '#ffffff') >= A.contrast(own.accent, '#15181a') ? '#ffffff' : '#15181a'));
      put('--veil', own ? String(own.veil == null ? 0.35 : own.veil) : '');
      put('--bg-img', own && own.bgImg ? 'url("' + own.bgImg + '")' : '');
      put('--card-img', own && own.cardImg ? 'url("' + own.cardImg + '")' : '');
    }
    const tc = A.$('meta[name="theme-color"]');
    if (tc) tc.content = A.hex(L.layout === 'binder' ? 'var(--board)' : L.layout === 'tiles' ? 'var(--well)' : 'var(--ground)');
    document.title = p.appName || A.cfg.defaultAppName;
    A.syncIdentity();
  };
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (A.state) { A.applyLook(); } });

  /* ---------- the buyer's own name and icon ---------- */
  let iconPhoto = null, iconPhotoSrc = '';
  A.drawIcon = function (size, maskable) {
    const c = document.createElement('canvas'), x = c.getContext('2d');
    c.width = c.height = size;
    const g = x.createLinearGradient(0, 0, size, size);
    try { g.addColorStop(0, A.cssColor('var(--icon-a)')); g.addColorStop(1, A.cssColor('var(--icon-b)')); }
    catch (e) { g.addColorStop(0, '#cfe3d3'); g.addColorStop(1, '#7fb08e'); }
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    if (A.state.profile.iconImg && iconPhoto && iconPhotoSrc === A.state.profile.iconImg) { x.drawImage(iconPhoto, 0, 0, size, size); return c; }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = Math.round(size * (maskable ? 0.46 : 0.58)) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    x.fillText(A.state.profile.icon || '🌿', size / 2, size / 2 + size * 0.04);
    return c;
  };
  function customManifest() {
    const p = A.state.profile, base = new URL('./', location.href).href, bg = A.hex('var(--ground)');
    const png = (size, mask) => new Promise(res => A.drawIcon(size, mask).toBlob(res, 'image/png'));
    caches.open('custom').then(async c => {
      const m = {
        name: p.appName, short_name: p.appName.slice(0, 12), description: A.t('Your private budget planner.'), lang: A.i18n.lang === 'zz' ? 'en' : A.i18n.lang,
        start_url: './', scope: './', display: 'standalone', background_color: bg, theme_color: bg,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      };
      await c.put(base + 'manifest.webmanifest', new Response(JSON.stringify(m), { headers: { 'content-type': 'application/manifest+json' } }));
      const put = async (name, size, mask) => c.put(base + 'icons/' + name, new Response(await png(size, mask), { headers: { 'content-type': 'image/png' } }));
      await put('icon-192.png', 192); await put('icon-512.png', 512); await put('maskable-512.png', 512, true); await put('apple-touch-icon.png', 180);
    }).catch(() => { /* cache storage unavailable: the default icon stays */ });
  }
  A.syncIdentity = function () {
    const p = A.state.profile, L = A.look(), own = L.own || {}, pic = p.iconImg || '';
    /* a photo has to be decoded before it can be drawn into the home-screen icons; one that will not decode falls back to the emoji */
    if (pic && iconPhotoSrc !== pic) {
      const im = new Image(), done = ok => { iconPhoto = ok ? im : null; iconPhotoSrc = pic; idSig = ''; if (A.state) A.syncIdentity(); };
      im.onload = () => done(true);
      im.onerror = () => done(false);
      iconPhotoSrc = pic; iconPhoto = null;
      im.src = pic;
      return;
    }
    const sig = [p.appName, p.icon, pic.length, pic.slice(-24), !!iconPhoto, L.theme, own.accent, own.card, A.licensed, A.i18n.lang].join('|');
    if (sig === idSig) return;
    idSig = sig;
    const fav = A.$('link[rel="icon"]'), at = A.$('link[rel="apple-touch-icon"]'), ti = A.$('meta[name="apple-mobile-web-app-title"]');
    if (fav) fav.href = (pic && iconPhoto ? pic : '') || 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="88">' + (p.icon || '🌿') + '</text></svg>');
    if (ti) ti.content = p.appName;
    try { if (at) at.href = A.drawIcon(180).toDataURL('image/png'); } catch (e) { /* canvas blocked */ }
    /* Only an unlocked app writes anything to the device, including its own home-screen name. */
    if (A.licensed && window.caches && /^https?:$/.test(location.protocol)) customManifest();
  };

  /* An empty budget that keeps how the app looks. A real household keeps its people; the demo's sample people are dropped. */
  A.freshState = function () {
    const b = A.blank(), old = A.state;
    KEEP.forEach(k => { b.profile[k] = old.profile[k]; });
    if (old.meta.sample) {
      /* the look the visitor chose in the demo, wherever it was kept, becomes the look of their own budget */
      const L = A.look();
      A.LOOK_KEYS.forEach(k => { b.profile[k] = L[k]; });
    } else {
      b.people = (old.people || []).map(p => Object.assign({}, p));
      ['household', 'split', 'splitPct', 'userName'].forEach(k => { b.profile[k] = old.profile[k]; });
    }
    return b;
  };
  A.setMe = id => { A.meId = id; if (A.licensed) A.store.set('me', id).catch(() => null); A.cache = {}; A.emit('data'); };

  /* ---------- pickers shared by Settings and first-run setup ---------- */
  function langSelect() {
    const L = A.look(), auto = A.pickLang('auto'), name = (A.LANGS.find(l => l[0] === auto) || ['en', 'English'])[1];
    return A.select([['auto', A.t('Same as my device ({name})', { name: name })]].concat(A.LANGS), L.lang || 'auto', { onchange: e => A.setLook('lang', e.target.value) });
  }
  function iconPicker() {
    const p = A.state.profile, box = h('div.chips');
    const pick = e => A.commit(s => { s.profile.icon = e; s.profile.iconImg = ''; });
    A.ICONS.forEach(e => box.append(h('button.chip.emoji', { type: 'button', 'aria-pressed': String(!p.iconImg && p.icon === e), 'aria-label': A.t('Icon {icon}', { icon: e }), onclick: () => pick(e) }, e)));
    box.append(h('input.emoji-in', { type: 'text', maxLength: 8, placeholder: A.t('or type'), 'aria-label': A.t('Type any emoji'), value: A.ICONS.indexOf(p.icon) < 0 ? p.icon : '', onchange: e => { if (e.target.value.trim()) pick(e.target.value.trim()); } }));
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: e => {
      const f = e.target.files[0];
      if (f) A.squareImage(f, 512, 0.86).then(url => set('iconImg', url), notPicture);
      e.target.value = '';
    } });
    return h('div.stack', null, box, h('div.icon-pic', null, file,
      p.iconImg ? h('span.icon-thumb', { role: 'img', 'aria-label': A.t('Your app picture'), style: { backgroundImage: 'url("' + p.iconImg + '")' } }) : null,
      A.btn(p.iconImg ? A.t('Change picture') : A.t('Use my own picture'), () => file.click()),
      p.iconImg ? A.btn(A.t('Remove picture'), () => set('iconImg', '')) : null,
      h('span.field-hint', { text: p.iconImg ? A.t('This picture is your app icon, also on the home screen.') : A.t('A photo or logo. It is cropped to a square.') })));
  }
  function layoutPicker() {
    const L = A.look();
    return h('div.choices', { role: 'group', 'aria-label': A.t('Layout') }, A.LAYOUTS.map(l =>
      h('button.choice', { type: 'button', 'aria-pressed': String(L.layout === l.id), onclick: () => A.setLook('layout', l.id) },
        h('span.thumb.thumb-' + l.id, { 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
        h('strong', { text: A.t(l.name) }), h('span.field-hint', { text: A.t(l.blurb) }))));
  }
  function fontPicker() {
    const L = A.look(), files = A.hosted();
    return h('div.fonts', { role: 'group', 'aria-label': A.t('Font') }, A.FONTS.filter(f => files || !f.bundled).map(f =>
      h('button.font', { type: 'button', 'aria-pressed': String(L.font === f.id), onclick: () => A.setLook('font', f.id) },
        h('span.font-aa', { 'aria-hidden': 'true', style: { fontFamily: f.sample }, text: 'Aa 123' }), h('span.font-name', { text: A.t(f.name) }))));
  }
  function themePicker() {
    const L = A.look(), box = h('div.swatches', { role: 'group', 'aria-label': A.t('Colour') });
    A.THEMES.forEach(t => {
      const mine = t.id === 'own';
      box.append(h('button.sw' + (mine ? '.sw-own' : ''), {
        type: 'button', 'aria-pressed': String(L.theme === t.id),
        style: mine ? (L.own ? { '--dot': L.own.accent } : null) : { '--h': t.h, '--cs': t.cs },
        onclick: () => {
          /* first time: start from the colours on screen now, so nothing jumps */
          if (mine && !A.look().own) setLooks({ own: Object.assign(A.currentColours(), { bgImg: '', cardImg: '', veil: 0.35 }), theme: 'own' });
          else A.setLook('theme', t.id);
        }
      }, h('i', { 'aria-hidden': 'true' }), A.t(t.name)));
    });
    const wrap = h('div.stack', null, box);
    /* picture themes need their files, so they are offered in the hosted app, not in the single offline file */
    if (A.hosted()) wrap.append(
      h('p.field-label', { text: A.t('Or a theme with a picture') }),
      h('div.pics', { role: 'group', 'aria-label': A.t('Themes with a picture') }, A.WALLPAPERS.map(wp => h('button.pic', {
        type: 'button', 'aria-label': A.t(wp.name), title: A.t(wp.name), style: { backgroundImage: 'url("wallpapers/' + wp.id + '-thumb.jpg")', backgroundColor: wp.bg },
        onclick: () => fetch('wallpapers/' + wp.id + '.jpg').then(r => { if (!r.ok) throw new Error('missing'); return r.blob(); })
          .then(b => A.shrinkImage(b, 1400, 0.8))
          .then(url => setLooks({ own: { bg: wp.bg, card: wp.card, text: wp.text, accent: wp.accent, bgImg: url, cardImg: '', veil: 0.2 }, theme: 'own' }),
            () => A.toast(A.t('That picture could not be loaded. Check your connection and try again.')))
      }, h('span', { text: A.t(wp.name) })))));
    if (L.theme === 'own' && L.own) wrap.append(ownEditor());
    return wrap;
  }
  function ownEditor() {
    const o = A.look().own, root = document.documentElement;
    /* always a new object, so one person's colours never leak into the shared look or another person's */
    const setOwn = (k, v) => { const n = Object.assign({}, A.look().own); n[k] = v; A.setLook('own', n); };
    const colour = (k, label, hint) => h('label.own-row', null,
      h('span.own-label', null, label, hint ? h('span.field-hint', { text: hint }) : null),
      h('input', { type: 'color', value: o[k], oninput: e => root.style.setProperty('--own-' + k, e.target.value), onchange: e => setOwn(k, e.target.value) }));
    const picture = (k, label, max) => {
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: e => {
        const f = e.target.files[0];
        if (f) A.shrinkImage(f, max, 0.78).then(url => setOwn(k, url), notPicture);
        e.target.value = '';
      } });
      return h('div.own-pic', null, file,
        o[k] ? h('span.own-thumb', { role: 'img', 'aria-label': label, style: { backgroundImage: 'url("' + o[k] + '")' } }) : null,
        A.btn(o[k] ? A.t('Change picture') : A.t('Use a picture instead'), () => file.click()),
        o[k] ? A.btn(A.t('Remove picture'), () => setOwn(k, '')) : null);
    };
    const notes = [];
    if (A.contrast(o.text, o.card) < 4.5) notes.push(h('p.note', null, A.t('The text is hard to read on that card colour.') + ' ',
      h('button.link', { type: 'button', onclick: () => setOwn('text', A.contrast('#15181a', o.card) >= A.contrast('#f7f7f4', o.card) ? '#15181a' : '#f7f7f4') }, A.t('Fix the text colour'))));
    if (A.contrast(o.accent, o.card) < 2.2) notes.push(h('p.note', { text: A.t('Buttons are hard to see against the cards. A darker or brighter button colour will stand out more.') }));
    const from = A.select([['', A.t('Start again from a theme…')]].concat(A.THEMES.filter(t => t.h != null).map(t => [t.id, A.t(t.name)])), '', {
      'aria-label': A.t('Start again from a theme'), onchange: e => {
        const t = A.by(A.THEMES, e.target.value);
        if (!t) return;
        /* read that theme's colours without showing it: switch the tokens, measure, switch back */
        const keep = [root.dataset.own, root.style.getPropertyValue('--h'), root.style.getPropertyValue('--cs')];
        root.dataset.own = '0'; root.style.setProperty('--h', t.h); root.style.setProperty('--cs', t.cs);
        const c = A.currentColours();
        root.dataset.own = keep[0]; root.style.setProperty('--h', keep[1]); root.style.setProperty('--cs', keep[2]);
        A.setLook('own', Object.assign({}, A.look().own, c));
      }
    });
    return h('div.own', null,
      h('p.field-hint', { text: A.t('Change any colour on its own. A picture fills its space edge to edge, like a wallpaper; it is never squeezed to fit.') }),
      h('div.own-group', null, colour('bg', A.t('Background'), A.t('Behind everything')), picture('bgImg', A.t('Background picture'), 1600)),
      h('div.own-group', null, colour('card', A.t('Cards'), A.t('The panels your numbers sit on')), picture('cardImg', A.t('Card picture'), 1000)),
      h('div.own-group', null, colour('text', A.t('Text'))),
      h('div.own-group', null, colour('accent', A.t('Buttons and highlights'))),
      o.bgImg || o.cardImg ? A.field(A.t('How much colour shows over the pictures'), h('input', { type: 'range', min: 0, max: 0.9, step: 0.05, value: o.veil == null ? 0.35 : o.veil, oninput: e => root.style.setProperty('--veil', e.target.value), onchange: e => setOwn('veil', +e.target.value) }), A.t('More colour makes text easier to read.')) : null,
      notes, from);
  }
  /* what: the thing being asked for, already in the buyer's language */
  A.needFull = function (fn, what) {
    if (A.licensed) fn();
    else A.unlockSheet(A.t('{what} is part of the full version. The demo keeps nothing and exports nothing.', { what: what || A.t('This') }));
  };

  /* ---------- Settings ---------- */
  const sec = (id, title, sub, ...kids) => {
    const s = h('section.panel', { id: 'set-' + id }, h('div.panel-head', null, h('h2', { text: title })), sub ? h('p.sub', { text: sub }) : null);
    kids.forEach(k => { if (k) s.append(k); });
    return s;
  };
  A.sec = sec;
  V.settings = function (root) {
    const p = A.state.profile, L = A.look(), me = A.shared() ? A.me() : null;
    root.append(A.pageHead(A.t('Settings'), A.t('Make it yours. Change anything, any time.')));
    const text = (k, ph, max) => h('input', { type: 'text', value: p[k] || '', placeholder: ph, maxLength: max || 40, onchange: e => set(k, e.target.value.trim() || (k === 'appName' ? A.cfg.defaultAppName : '')) });

    const left = h('div.col-main', null,
      sec('you', A.t('Name and icon'), A.t('Call it anything. The name and icon also appear on your home screen when you install it.'),
        h('div.form', null, A.field(A.t('App name'), text('appName', A.t('Our Budget, Mia’s Money…'))), p.household === 'solo' ? A.field(A.t('Your name'), text('userName', A.t('Optional'))) : null), iconPicker()),
      householdPanel(),
      sec('look', me ? A.t('Your look, {name}', { name: me.name }) : A.t('Look'), me ? A.t('Only you see these choices. Everyone else keeps their own.') : null,
        h('div.form', null, A.field(A.t('Language'), langSelect())),
        h('p.field-label', { text: A.t('Layout') }), layoutPicker(),
        h('p.field-label', { text: A.t('Colour') }), themePicker(),
        h('div.form', null,
          L.theme === 'own' ? null : A.group(A.t('Light or dark'), A.seg([['auto', A.t('Match my device')], ['light', A.t('Light')], ['dark', A.t('Dark')]], L.mode, v => A.setLook('mode', v), A.t('Light or dark'))),
          A.group(A.t('Font'), fontPicker()),
          A.group(A.t('Text size'), A.seg([[0.9, A.t('Small')], [1, A.t('Standard')], [1.12, A.t('Large')], [1.25, A.t('Largest')]], L.textSize, v => A.setLook('textSize', v), A.t('Text size')))),
        h('div.toggles', null,
          A.toggle(A.t('Calm mode'), A.t('Today shows only the number, the days and what is due.'), L.calm, v => A.setLook('calm', v)),
          A.toggle(A.t('Hide amounts'), A.t('For when someone is looking over your shoulder.'), L.hideAmounts, v => A.setLook('hideAmounts', v)),
          A.toggle(A.t('Animations'), A.t('Turn off if movement is distracting.'), L.motion !== false, v => A.setLook('motion', v)))),
      sec('prefs', A.t('How it behaves'), null,
        h('div.form', null,
          h('div.form-row', null, A.field(A.t('Currency'), A.select(A.CURRENCIES.map(c => [c, A.currencyName(c)]), p.currency, { onchange: e => set('currency', e.target.value) })),
            A.field(A.t('Week starts on'), A.select([[1, A.t('Monday')], [0, A.t('Sunday')], [6, A.t('Saturday')]], p.weekStart, { onchange: e => set('weekStart', +e.target.value) }))),
          A.field(A.t('Money you already had when you started'), A.amountInput(p.startBal, { onchange: e => set('startBal', A.num(e.target.value)) }), A.t('Counted once, in {month}.', { month: A.monthName(p.startMonth) }))),
        h('div.toggles', null,
          A.toggle(A.t('Carry leftover money into next month'), null, p.rollover, v => set('rollover', v)))));

    const right = h('div.col-side', null, A.unlockPanel(), A.remindersPanel(), A.cloudPanel(), A.ownCopyPanel(), dataPanel(), installPanel(), A.updatePanel(),
      h('p.quiet.about', { text: A.t('Version {v}. Your budget lives on this device. Nothing here connects to a bank.', { v: A.cfg.version }) }));
    root.append(h('div.cols', null, left, right));
  };

  function householdPanel() {
    const p = A.state.profile, kind = p.household, ms = A.members(), me = A.me();
    const s = sec('people', A.t('Who is it for'), A.t('Just you, the two of you, or the whole family. Switch any time; nothing is lost.'),
      A.seg([['solo', A.t('Just me')], ['couple', A.t('Two of us')], ['family', A.t('Family')]], kind, v => A.setHousehold(v), A.t('Who is it for')));
    if (kind === 'solo') return s;
    const adults = ms.filter(m => m.kind !== 'child');
    s.append(h('div.people', null, ms.map(m => h('div.person', null,
      h('input.emoji-in', { type: 'text', value: m.emoji, maxLength: 8, 'aria-label': A.t('Emoji for {name}', { name: m.name }), onchange: e => A.commit(() => { m.emoji = e.target.value.trim() || m.emoji; }) }),
      h('input', { type: 'text', value: m.name, maxLength: 30, 'aria-label': A.t('Name'), onchange: e => A.commit(() => { m.name = e.target.value.trim() || m.name; }) }),
      m.kind === 'child'
        ? A.amountInput(m.allowance, { placeholder: A.t('Pocket money'), 'aria-label': A.t('Monthly pocket money for {name}', { name: m.name }), onchange: e => A.commit(() => { m.allowance = A.num(e.target.value); }) })
        : h('span.person-kind', { text: A.t('Adult') }),
      m.kind === 'child'
        ? h('button.icon-btn', { type: 'button', 'aria-label': A.t('Remove {name}', { name: m.name }), onclick: () => A.confirm(A.t('Remove {name}?', { name: m.name }), A.t('Entries with their name stay in your history, just without a name on them.'), A.t('Remove'), () => A.commit(st => { st.people = st.people.filter(x => x.id !== m.id); st.tx.forEach(x => { if (x.who === m.id) delete x.who; }); }), true) }, A.icon('trash'))
        : h('span')))));
    if (kind === 'family') s.append(
      h('p.field-hint', { text: A.t('Pocket money is a monthly amount. Each child gets their own bar on Today.') }),
      h('div.actions.start', null, A.btn(A.t('Add a child'), () => A.commit(st => { st.people.push({ id: A.uid(), name: A.t('Child'), emoji: '🧒', kind: 'child', allowance: 0 }); }), null, 'plus')));
    s.append(A.field(A.t('On this device I am'), A.select(ms.map(m => [m.id, m.emoji + ' ' + m.name]), me ? me.id : '', { onchange: e => A.setMe(e.target.value) }),
      A.t('New entries from this device carry this name, and the app looks the way this person set it up. Every phone or tablet remembers its own.')));
    if (adults.length === 2) {
      const pct = p.splitPct == null ? 50 : p.splitPct, say = v => A.t('{a} covers {pct}%, {b} {rest}%', { a: adults[0].name, b: adults[1].name, pct: v, rest: 100 - v });
      const label = h('strong', { text: say(pct) });
      s.append(h('div.toggles', null, A.toggle(A.t('We split what we spend'), A.t('Shows who should pass money to whom to be even each month.'), p.split, v => set('split', v))),
        p.split ? h('div.slider', null, label, h('input', { type: 'range', min: 0, max: 100, step: 5, value: pct, 'aria-label': A.t('The share {name} covers', { name: adults[0].name }),
          oninput: e => { label.textContent = say(+e.target.value); }, onchange: e => set('splitPct', +e.target.value) })) : null);
    }
    s.append(h('div.actions.start', null, A.btn(A.t('See who spent what'), () => A.go('people'), null, 'people')));
    return s;
  }

  A.unlockPanel = function () {
    if (A.licensed) {
      const web = /^https?:$/.test(location.protocol) && !A.cfg.offlineUnlocked;
      return sec('unlock', A.t('Full version'), A.t('Unlocked on this device. Everything you enter is saved here automatically.'),
        web ? h('div.actions.start', null, A.btn(A.t('Open it on my other device'), () => {
          if (A.cloud.cfg) { A.toast(A.t('Use “Add another device” under Personal cloud: that link also brings your budget along.'), { ms: 7000 }); return; }
          A.store.peek('licence').then(lic => A.shareLink(location.origin + location.pathname + '#unlock=' + encodeURIComponent((lic && lic.code) || ''), A.t('Open this link to unlock the budget app on this device.')));
        })) : null,
        web ? h('p.field-hint', { text: A.t('The link unlocks the app there without typing the code. Each device keeps its own budget unless you connect the personal cloud.') }) : null);
    }
    return sec('unlock', A.t('You are in the demo'), A.t('Everything works, with no limits. Nothing is saved: closing or reloading starts over.'),
      h('div.actions.start', null, A.btn(A.t('Unlock saving'), () => A.unlockSheet(), 'primary', 'unlock'),
        h('a.btn', { href: A.cfg.buyUrl, target: '_blank', rel: 'noopener' }, A.t('Get the full version')),
        A.btn(A.t('Try with my own numbers'), A.demoFresh)));
  };

  function installPanel() {
    const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    if (standalone) return null;
    if (!/^https?:$/.test(location.protocol)) return sec('install', A.t('This is the offline file'), A.t('It runs from this file on this computer. For a home-screen app on your phone, open the app link from your purchase instead.'));
    const install = () => {
      const ev = A.installEvt;
      A.installEvt = null;
      if (!ev) { A.render(); return; }
      ev.prompt();
      (ev.userChoice || Promise.resolve()).then(() => A.render(), () => A.render());
    };
    return sec('install', A.t('Install as an app'), A.t('It then opens full screen, works without internet and gets its own icon.'),
      A.installEvt ? h('div.actions.start', null, A.btn(A.t('Install'), install, 'primary', 'download')) : null,
      h('ul.steps', null,
        h('li', null, h('strong', { text: A.t('iPhone or iPad:') + ' ' }), A.t('open in Safari, tap Share, then “Add to Home Screen”.')),
        h('li', null, h('strong', { text: A.t('Android:') + ' ' }), A.t('open in Chrome, tap the menu, then “Install app” or “Add to Home screen”.')),
        h('li', null, h('strong', { text: A.t('Computer:') + ' ' }), A.t('in Chrome or Edge, use the install icon at the end of the address bar.'))));
  }

  /* ---------- backups ---------- */
  /* Keeps a copy (of the current budget, or of the one handed in) under "Earlier copies". Throws if it cannot be written,
     so nothing is replaced unless the copy that was promised really exists. */
  A.snapshot = async function (reason, state) {
    if (!A.licensed) return;
    const list = (await A.store.get('snapshots')) || [];
    list.unshift({ at: Date.now(), reason: reason, state: JSON.parse(JSON.stringify(state || A.state)) });
    await A.store.set('snapshots', list.slice(0, 5));
  };
  const noCopy = () => A.toast(A.t('An earlier copy could not be kept, so nothing was changed. Free some space on this device and try again.'), { ms: 8000 });
  A.replaceState = async function (state, reason) {
    try { await A.snapshot(reason); } catch (e) { noCopy(); return false; }
    A.state = A.migrate(JSON.parse(JSON.stringify(state)));
    A.cache = {};
    A.checkin();
    A.commit(null, 'mode');
    A.autopost();
    return true;
  };
  const backupName = ext => 'budget-backup-' + A.today() + ext;
  const backupText = () => JSON.stringify({ app: 'budget-planner', v: 1, exported: new Date().toISOString(), state: A.state });
  const backupDone = () => { if (A.licensed) backupKeep(b => { b.at = Date.now(); }); };
  const backupFile = () => { A.download(backupName('.json'), backupText(), 'application/json'); backupDone(); };
  /* On a phone a downloaded file stays on the very device it is meant to protect. The share menu hands it to another app
     instead: a cloud drive, or an email to yourself. Some phones pass on plain text files only, so that is the second try. */
  const shareAs = () => {
    try {
      if (!navigator.canShare || !navigator.share || !window.File) return null;
      for (const k of [['.json', 'application/json'], ['.txt', 'text/plain']]) if (navigator.canShare({ files: [new File(['{}'], 'backup' + k[0], { type: k[1] })] })) return k;
    } catch (e) { /* not offered here */ }
    return null;
  };
  const backupShare = () => {
    const k = shareAs();
    if (!k) { backupFile(); return; }
    navigator.share({ files: [new File([backupText()], backupName(k[0]), { type: k[1] })], title: A.state.profile.appName }).then(backupDone, () => { /* closed without sending */ });
  };

  /* ---------- backup reminder ----------
     Everything lives in the browser of one device, so a lost phone is a lost planner unless a copy exists somewhere else.
     With the personal cloud that copy is made by itself. Without it the app asks now and then: a week after unlocking,
     a month after the last backup, a week after "Later". Never in the demo, which keeps nothing. */
  const DAY = 864e5;
  A.backup = { since: 0, at: 0, later: 0 };
  A.backupLoad = async function (since) {
    if (!A.licensed) return;
    const b = Object.assign({ since: 0, at: 0, later: 0 }, (await A.store.peek('backup')) || {});
    if (!b.since) { b.since = +since || Date.now(); A.store.set('backup', b).catch(() => {}); }
    A.backup = b;
  };
  const backupKeep = change => { change(A.backup); A.store.set('backup', A.backup).catch(() => {}); A.render(); };
  A.backupDue = function () {
    const b = A.backup, s = A.state;
    if (!A.licensed || !b.since || (A.cloud && A.cloud.cfg) || !s || s.meta.sample || !s.meta.onboarded) return false;
    return Date.now() >= Math.max(b.at ? b.at + 30 * DAY : b.since + 7 * DAY, b.later + 7 * DAY);
  };
  const backupLine = () => (A.backup.at ? A.t('Last backup: {date}.', { date: A.dShort(A.iso(new Date(A.backup.at))) }) : A.t('No backup has been made yet.'));
  /* to the personal cloud in Settings, from wherever the reminder was shown */
  const toCloud = () => { A.go('settings'); setTimeout(() => { const el = document.getElementById('set-cloud'); if (el) el.scrollIntoView(); }, 200); };
  A.backupCard = function () {
    const b = A.backup, later = A.btn(A.t('Later'), () => backupKeep(x => { x.later = Date.now(); }));
    /* the cloud that should be keeping the copy has been out of reach for days */
    if (A.licensed && A.cloud && A.cloud.stuck() && Date.now() >= Math.max(b.at, b.later) + 7 * DAY) {
      return h('section.panel.welcome.backup-card', null, h('h2', { text: A.t('Your automatic backup needs a look') }),
        h('p', { text: A.t('Your cloud could not be reached for a few days. What you changed since then is only on this device.') }),
        h('div.actions.start', null,
          A.btn(A.t('Try again'), () => A.cloud.sync().then(ok => { A.toast(ok ? A.t('Synced.') : A.t('Could not sync right now.')); A.render(); }), 'primary'),
          A.btn(A.t('Download a backup'), backupFile, null, 'download'), later));
    }
    if (!A.backupDue()) return null;
    return h('section.panel.welcome.backup-card', null, h('h2', { text: A.t('Keep a copy somewhere safe') }),
      h('p', { text: A.t('Everything here is stored on this device only. A backup file keeps it safe if the device is lost or reset.') }),
      h('p.sub', { text: backupLine() }),
      h('div.actions.start', null, A.btn(A.t('Download a backup'), backupFile, 'primary', 'download'),
        shareAs() ? A.btn(A.t('Send a backup to another app'), backupShare) : null, later),
      h('button.link', { type: 'button', onclick: toCloud }, A.t('Make it automatic')));
  };
  function dataPanel() {
    const file = h('input', { type: 'file', accept: 'application/json,text/plain,.json,.txt', hidden: true, onchange: e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (f.size > 40e6) { A.toast(A.t('That file is not a backup from this app.')); return; }
      f.text().then(t => {
        const d = JSON.parse(t), st = d && d.state ? d.state : d;
        if (!A.validState(st)) throw new Error('bad');
        A.confirm(A.t('Restore this backup?'), A.t('It replaces what is in the app now. The current version is kept under “Earlier copies” in case you change your mind.'), A.t('Restore'), () => A.replaceState(st, A.t('Before restoring a backup')).then(ok => { if (ok) A.toast(A.t('Backup restored.')); }));
      }).catch(() => A.toast(A.t('That file is not a backup from this app.')));
    } });
    const copies = h('div');
    if (A.licensed) A.store.peek('snapshots').then(list => {
      if (!list || !list.length) return;
      copies.append(h('h3', { text: A.t('Earlier copies') }), h('div.rows', null, list.map(s => h('div.row', null,
        h('span.row-main', null, h('span.row-title', { text: new Date(s.at).toLocaleString(A.locale()) }), h('span.row-meta', { text: s.reason })),
        A.btn(A.t('Bring back'), () => A.confirm(A.t('Bring this copy back?'), A.t('It replaces what is in the app now. The current version is kept as another earlier copy.'), A.t('Bring back'), () => A.replaceState(s.state, A.t('Before bringing back an earlier copy'))))))));
    });
    return sec('data', A.t('Your data'), A.t('Stored on this device only. A backup file is how you move it or keep it safe.'),
      h('div.actions.start', null,
        A.btn(A.t('Download a backup'), () => A.needFull(backupFile, A.t('The backup file')), null, 'download'),
        shareAs() ? A.btn(A.t('Send a backup to another app'), () => A.needFull(backupShare, A.t('The backup file'))) : null,
        A.btn(A.t('Restore a backup'), () => A.needFull(() => file.click(), A.t('Restoring a backup'))),
        A.btn(A.t('Export as spreadsheet (CSV)'), () => A.needFull(() => A.download('budget-entries-' + A.today() + '.csv', '﻿' + A.csv(), 'text/csv'), A.t('The spreadsheet export')))),
      A.licensed ? h('p.sub', { text: backupLine() }) : null,
      file, copies,
      h('button.link.danger', { type: 'button', onclick: () => A.confirm(A.t('Erase everything and start over?'), A.licensed ? A.t('All entries, bills, funds and debts are removed from this device. One earlier copy is kept so you can undo this.') : A.t('The demo goes back to an empty budget.'), A.t('Erase everything'), () => {
        const b = A.freshState();
        b.meta.onboarded = true;
        A.replaceState(b, A.t('Before erasing everything')).then(ok => { if (ok) A.toast(A.t('Erased. A fresh start.')); });
      }, true) }, A.t('Erase everything and start over')));
  }

  /* ---------- More (phones) ---------- */
  V.more = function (root) {
    root.append(A.pageHead(A.state.profile.appName, A.t('Everything else lives here.')));
    root.append(h('section.panel', null, h('div.rows', null, A.navItems().filter(n => n.x).map(n =>
      h('a.row.row-btn.nav-row', { href: '#/' + n.id }, h('span.row-emoji', null, A.icon(n.icon)), h('span.row-main', null, h('span.row-title', { text: A.t(n.label) }), h('span.row-meta', { text: A.t(n.hint) })), A.icon('right'))))));
    if (!A.licensed) root.append(A.unlockPanel());
  };

  /* ---------- links that set a device up in one tap ---------- */
  /* #unlock=CODE comes with the purchase. #join=... comes from another device and also connects the shared budget.
     #move=... carries a whole budget to another address. All live after the # so they are never sent to the server that hosts the app.
     Whatever arrives this way is treated as untrusted: sizes are capped and nothing connects or replaces data without a yes. */
  const LINK_MAX = 400000;
  A.readLink = function () {
    const m = /^#(unlock|join|move)=(.+)$/.exec(location.hash || '');
    if (!m) return null;
    try { history.replaceState(null, '', location.pathname + location.search + '#/today'); } catch (e) { location.hash = '#/today'; }
    if (m[2].length > LINK_MAX) return { code: '', bad: true };
    if (m[1] === 'unlock') { try { return { code: decodeURIComponent(m[2]) }; } catch (e) { return { code: '', bad: true }; } }
    if (m[1] === 'move') return { code: '', move: m[2] };
    try {
      const j = JSON.parse(atob(m[2].replace(/-/g, '+').replace(/_/g, '/')));
      if (!j || typeof j.u !== 'string' || typeof j.k !== 'string' || !j.u || !j.k) throw new Error('incomplete');
      return { code: typeof j.c === 'string' ? j.c : '', join: j.u + '#' + j.k };
    } catch (e) { return { code: '', bad: true }; }
  };
  A.afterLink = function (link, hadData) {
    if (link.bad) { A.toast(A.t('That setup link is incomplete. Copy it again on the other device.'), { ms: 7000 }); return; }
    if (!A.licensed) { A.unlockSheet(link.code ? A.t('The code in that link did not work. Type the code from your purchase instead.') : A.t('Unlock this device first, then open the setup link again.')); return; }
    if (link.join) { A.joinCloud(link.join, hadData); return; }
    if (link.state) { A.receiveMove(link.state, hadData); return; }
    if (link.unlocked) A.toast(A.t('Unlocked. Everything you enter is saved on this device from now on.'), { ms: 6000 });
  };
  A.shareLink = function (link, text) {
    if (navigator.share) navigator.share({ title: A.state.profile.appName, text: text, url: link }).catch(() => { /* closed without sending */ });
    else A.copy(link, A.t('Link copied. Paste it into a message to yourself.'));
  };

  /* ---------- moving a budget to another address: the buyer's own copy ---------- */
  /* A budget is stored per web address. To move it, the whole budget travels inside a link (squeezed small),
     together with the unlock code, so the new address opens unlocked with everything in place. */
  const MOVE_MAX = 30000, UNPACK_MAX = 8e6;
  const b64u = bytes => { let s = ''; bytes.forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = str => { const raw = atob(str.replace(/-/g, '+').replace(/_/g, '/')), out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; };
  const pipe = (bytes, stream) => new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer().then(b => new Uint8Array(b));
  async function pack(obj) {
    const json = new TextEncoder().encode(JSON.stringify(obj));
    return window.CompressionStream ? 'z' + b64u(await pipe(json, new CompressionStream('gzip'))) : 'j' + b64u(json);
  }
  async function unpack(str) {
    const bytes = unb64u(str.slice(1)), raw = str[0] === 'z' ? await pipe(bytes, new DecompressionStream('gzip')) : bytes;
    if (raw.length > UNPACK_MAX) throw new Error('too big');
    return JSON.parse(new TextDecoder().decode(raw));
  }
  A.openMove = async function (link) {
    try { const d = await unpack(link.move); link.code = typeof d.c === 'string' ? d.c : ''; link.state = A.validState(d.s) ? d.s : null; if (!link.state) link.bad = true; }
    catch (e) { link.bad = true; }
  };
  A.receiveMove = function (state, hadData) {
    const go = async () => {
      if (hadData) { try { await A.snapshot(A.t('Before moving a budget in')); } catch (e) { noCopy(); return; } }
      A.state = A.migrate(state);
      A.state.meta.onboarded = true;
      A.cache = {};
      A.checkin();
      A.commit(null, 'mode');
      A.autopost();
      A.toast(A.t('Your budget has arrived. From now on it is saved at this address.'), { ms: 8000 });
    };
    if (hadData) A.confirm(A.t('Bring your budget in?'), A.t('It replaces what this copy holds now. That version is kept under Settings, “Earlier copies”.'), A.t('Bring it in'), go);
    else go();
  };
  A.moveTo = async function (address) {
    let url = String(address || '').trim(), target;
    if (!url) throw new Error(A.t('Type the address of your own copy first.'));
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { target = new URL(url); } catch (e) { throw new Error(A.t('That does not look like a web address.')); }
    const dir = u => u.origin + u.pathname.replace(/[^/]*$/, ''), base = dir(target), place = u => u.host + u.pathname.replace(/[^/]*$/, '');
    if (place(target) === place(location)) throw new Error(A.t('That is the address you are using now. Type the address of your own copy.'));
    const lic = await A.store.peek('licence'), code = (lic && lic.code) || '';
    let link, how = 'link';
    if (A.cloud.cfg) {
      /* connected to a personal cloud: the new address only needs to join it, and the budget comes down from there */
      link = base + '#join=' + b64u(new TextEncoder().encode(JSON.stringify({ u: A.cloud.cfg.url, k: A.cloud.cfg.key, c: code })));
      how = 'cloud';
    } else {
      /* pictures are far too big for a link: they stay behind and can be picked again */
      const copy = JSON.parse(JSON.stringify(A.state));
      let dropped = false;
      const strip = o => { if (o && (o.bgImg || o.cardImg)) { o.bgImg = ''; o.cardImg = ''; dropped = true; } };
      strip(copy.profile.own);
      copy.people.forEach(p => { if (p.look) strip(p.look.own); });
      if (copy.profile.iconImg) { copy.profile.iconImg = ''; dropped = true; }
      if (dropped) how = 'nopics';
      link = base + '#move=' + await pack({ c: code, s: copy });
      if (link.length > MOVE_MAX) { link = base + '#unlock=' + encodeURIComponent(code); how = 'file'; }
    }
    A.sheet(how === 'file' ? A.t('Move it in two steps') : A.t('Your copy is ready to open'), body => {
      const open = label => h('a.btn.primary', { href: link, target: '_blank', rel: 'noopener' }, label);
      if (how === 'file') body.append(
        h('p.lead', { text: A.t('Your budget is too large to travel inside a link, so it goes across as a file.') }),
        h('div.stack', null, A.btn(A.t('1. Download a backup'), backupFile, null, 'download'), open(A.t('2. Open my own copy'))),
        h('p.sub', { text: A.t('Your copy opens unlocked. There, go to Settings, “Restore a backup”, and pick the file you just downloaded.') }));
      else body.append(
        h('p.lead', { text: how === 'cloud' ? A.t('Your copy will unlock itself, connect to your personal cloud and show this same budget.') : A.t('Your copy will unlock itself, and your budget will already be there.') }),
        how === 'nopics' ? h('p.note', { text: A.t('Your own pictures stay behind. Pick them again there under Settings.') }) : null,
        h('div.stack', null, open(A.t('Open my own copy'))));
      body.append(h('p.field-hint', { text: A.t('Nothing is removed here. Once you see your budget at your own address, use that one from now on, and add it to your home screen from there.') }));
    });
    return how;
  };
  A.ownCopyPanel = function () {
    const url = h('input', { type: 'text', inputmode: 'url', autocomplete: 'off', autocapitalize: 'none', spellcheck: false, placeholder: 'https://my-budget.pages.dev', 'aria-label': A.t('Address of your own copy') });
    const msg = h('p.field-hint.error', { role: 'alert' });
    return sec('owncopy', A.t('Your own copy (optional)'), A.t('Run the app from your own free address, so it depends on nobody but you. The files and the steps are in the ZIP from your purchase.'),
      h('div.actions.start', null, A.btn(A.t('Show me how, with pictures'), () => A.guide())),
      h('form.form', { onsubmit: e => { e.preventDefault(); msg.textContent = ''; A.needFull(() => { A.moveTo(url.value).catch(err => { msg.textContent = err.message; }); }, A.t('Moving your budget to your own copy')); } },
        A.field(A.t('The address of your own copy'), url), msg,
        h('div.actions.start', null, h('button.btn.primary', { type: 'submit' }, A.t('Move my budget there')))));
  };

  /* ---------- demo to full ---------- */
  A.demoFresh = function () {
    const go = () => {
      A.state = A.freshState();
      A.cache = {};
      A.checkin();
      A.commit(null, 'mode');
      A.go('today');
      A.onboard();
    };
    /* a second time round it would clear what was typed in, so it asks first */
    if (!A.state.meta.sample && worth(A.state)) A.confirm(A.t('Start over with an empty budget?'), A.t('What you have typed into the demo so far is cleared.'), A.t('Start over'), go);
    else go();
  };
  A.unlockSheet = function (note) {
    A.sheet(A.t('Unlock saving'), (body, api) => {
      const code = h('input.code-in', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false, placeholder: 'XXXX-XXXX-XXXX', maxLength: 40, 'aria-label': A.t('Unlock code') });
      const msg = h('p.field-hint.error', { role: 'alert' });
      const finish = async (how, saved) => {
        try { await A.store.set('licence', { code: A.normCode(code.value), at: Date.now() }); }
        catch (e) { A.toast(A.t('This browser would not save the unlock. Check that it is not in private mode, then try again.'), { ms: 8000 }); return; }
        A.licensed = true;
        A.cloud.cfg = (await A.store.peek('cloud')) || null;
        A.keepStorage();
        await A.backupLoad();
        A.meId = (await A.store.peek('me')) || A.meId;
        /* a budget saved here earlier is never thrown away without a copy */
        if (A.validState(saved) && how !== 'saved') { try { await A.snapshot(A.t('Your saved budget, before starting again'), saved); } catch (e) { /* the unlock itself still goes ahead */ } }
        if (how === 'saved') A.state = A.migrate(saved);
        else if (how === 'fresh') A.state = A.freshState();
        else A.state.meta.onboarded = true;
        A.cache = {};
        A.checkin();
        A.commit(null, 'mode');
        A.autopost();
        A.flush();
        api.close();
        A.toast(A.t('Unlocked. Everything is saved on this device from now on.'), { ms: 5000 });
        if (how === 'fresh') A.onboard();
      };
      const choose = saved => {
        const sample = A.state.meta.sample, opts = [];
        if (A.validState(saved)) opts.push(A.btn(A.t('Open my saved budget'), () => finish('saved', saved), 'primary'));
        if (!sample) opts.push(A.btn(A.t('Keep what I just entered'), () => finish('keep', saved), opts.length ? null : 'primary'));
        opts.push(A.btn(A.t('Start fresh with my own numbers'), () => finish('fresh', saved), opts.length ? null : 'primary'));
        if (sample) opts.push(A.btn(A.t('Keep the sample budget to explore'), () => finish('keep', saved)));
        body.replaceChildren(h('p.lead', { text: A.t('That code works. Where would you like to start?') }), h('div.stack', null, opts));
      };
      const go = () => {
        if (!A.codeOk(code.value)) { msg.textContent = A.t('That code does not match. Check for a typo: it is in the PDF from your purchase.'); return; }
        A.store.get('state').then(choose, () => choose(null));
      };
      body.append(note ? h('p.note', { text: note }) : null,
        h('p.lead', { text: A.t('The demo keeps nothing. Enter the code from your purchase and your budget is saved on this device from then on.') }),
        h('form.form', { onsubmit: e => { e.preventDefault(); go(); } }, A.field(A.t('Unlock code'), code), msg,
          h('div.actions', null, h('a.btn', { href: A.cfg.buyUrl, target: '_blank', rel: 'noopener' }, A.t('Get the full version')), h('button.btn.primary', { type: 'submit' }, A.t('Unlock')))));
      setTimeout(() => code.focus(), 30);
    });
  };

  /* ---------- first-run setup: four short steps, every one skippable ---------- */
  /* name, the built-in envelope it belongs to, the usual day of the month */
  const BILLS = [[A.T('Rent or mortgage'), 'Housing', 1], [A.T('Electricity'), 'Bills', 15], [A.T('Internet'), 'Bills', 10], [A.T('Phone'), 'Bills', 12], [A.T('Insurance'), 'Bills', 20], [A.T('Streaming'), 'Subscriptions', 5], [A.T('Gym'), 'Health', 25]];
  const STEPS = [A.T('Make it yours'), A.T('The basics'), A.T('Your paycheck'), A.T('Regular bills')];
  A.onboard = function () {
    const st = { step: 0, pay: { amt: '', freq: 'biweekly', date: A.today(), auto: true }, bills: BILLS.map(b => ({ on: false, key: b[0], cat: b[1], day: String(b[2]), amt: '' })) };
    /* a ticked bill with no amount would vanish without a word, so it is asked for instead */
    const missing = () => st.bills.find(b => b.on && !A.num(b.amt));
    const done = () => {
      const t = A.today();
      A.commit(s => {
        s.meta.onboarded = true;
        const amt = A.num(st.pay.amt);
        if (amt) s.rules.push({ id: A.uid(), name: A.t('Paycheck'), type: 'in', amt: amt, freq: st.pay.freq, start: A.okDate(st.pay.date), ref: null, auto: st.pay.auto, remind: 0, skips: [] });
        st.bills.forEach(b => {
          const a = A.num(b.amt);
          if (!b.on || !a) return;
          const cat = s.cats.find(c => c.def === b.cat) || s.cats[s.cats.length - 1];
          const day = A.clamp(Math.round(A.num(b.day)) || 1, 1, 31), ym = +t.slice(8) <= day ? A.ym(t) : A.addMonths(A.ym(t), 1);
          const r = { id: A.uid(), name: A.t(b.key), type: 'out', amt: a, freq: 'monthly', start: ym + '-' + A.pad(Math.min(day, A.monthDays(ym))), ref: cat.id, auto: false, remind: 1, skips: [] };
          /* the 29th, 30th or 31st is remembered as meant, so a short first month does not move the bill for good */
          if (day > 28) r.dom = day;
          s.rules.push(r);
          cat.budget = A.r2((cat.budget || 0) + a);
        });
      });
      A.autopost();
    };
    /* The sheet is live: picking a language, layout or colour repaints the app and this step together. */
    A.sheet(() => A.t('Set up'), function build(body, api) {
      const again = () => { body.replaceChildren(); build(body, api); };
      const last = STEPS.length - 1;
      const next = () => {
        if (st.step < last) { st.step++; again(); return; }
        const m = missing();
        if (m) { A.toast(A.t('Add the amount for {name}, or untick it.', { name: A.t(m.key) })); return; }
        api.close(); done();
        A.toast(A.t('All set. Use the + button whenever you spend.'), { ms: 5000 });
      };
      const p2 = A.state.profile, i = st.step, end = i === last;
      body.append(h('p.step-of', { text: A.t('Step {n} of {total}', { n: i + 1, total: STEPS.length }) }), h('h3.step-title', { text: A.t(STEPS[i]) }));
      if (i === 0) body.append(
        h('div.form', null, A.field(A.t('Language'), langSelect()),
          A.field(A.t('What should the app be called?'), h('input', { type: 'text', value: p2.appName, maxLength: 40, onchange: e => set('appName', e.target.value.trim() || A.cfg.defaultAppName) }))),
        h('p.field-label', { text: A.t('Pick an icon') }), iconPicker(), h('p.field-label', { text: A.t('Pick a layout') }), layoutPicker(),
        h('p.field-label', { text: A.t('Pick a colour') }), themePicker(), h('p.field-label', { text: A.t('Pick a font') }), fontPicker());
      if (i === 1) {
        const ms = A.members(), me = A.me();
        body.append(h('div.form', null,
          A.group(A.t('Who is this budget for?'), A.seg([['solo', A.t('Just me')], ['couple', A.t('Two of us')], ['family', A.t('Family')]], p2.household, v => A.setHousehold(v), A.t('Who is this budget for?'))),
          A.field(A.t('Your first name'), h('input', { type: 'text', value: p2.userName, maxLength: 30, placeholder: A.t('Optional'), onchange: e => A.commit(s => { s.profile.userName = e.target.value.trim(); const first = s.people.find(x => x.kind !== 'child'); if (first && s.profile.userName) first.name = s.profile.userName; }) })),
          ms.length > 1 ? A.field(A.t('On this device I am'), A.select(ms.map(m => [m.id, m.emoji + ' ' + m.name]), me ? me.id : '', { onchange: e => A.setMe(e.target.value) }), A.t('Names, children and pocket money are in Settings, under “Who is it for”.')) : null,
          A.field(A.t('Currency'), A.select(A.CURRENCIES.map(c => [c, A.currencyName(c)]), p2.currency, { onchange: e => set('currency', e.target.value) }))));
      }
      if (i === 2) body.append(h('p.sub', { text: A.t('Add it once and it repeats by itself. Skip this if your income varies; you can log it as it arrives.') }), h('div.form', null,
        A.field(A.t('How much lands in your account'), A.amountInput(st.pay.amt, { oninput: e => { st.pay.amt = e.target.value; } })),
        h('div.form-row', null,
          A.field(A.t('How often'), A.select(A.opts(A.FREQS.filter(f => f[0] === 'weekly' || f[0] === 'biweekly' || f[0] === 'monthly')), st.pay.freq, { onchange: e => { st.pay.freq = e.target.value; } })),
          A.field(A.t('Next payday'), A.dateInput(st.pay.date, { onchange: e => { st.pay.date = e.target.value; } }))),
        h('label.check', null, h('input', { type: 'checkbox', checked: st.pay.auto, onchange: e => { st.pay.auto = e.target.checked; } }), h('span', { text: A.t('It arrives by itself, so log it for me on payday') }))));
      if (i === 3) body.append(h('p.sub', { text: A.t('Tick the ones you have and add the amount. You get a reminder the day before each one. More can be added later.') }),
        h('div.bill-list', null, st.bills.map(b => {
          const name = A.t(b.key), tick = h('input', { type: 'checkbox', checked: b.on, onchange: e => { b.on = e.target.checked; } });
          return h('div.bill', null,
            h('label.check', null, tick, h('span', { text: name })),
            A.amountInput(b.amt, { placeholder: A.t('Amount'), 'aria-label': A.t('{name}: amount', { name: name }), oninput: e => { b.amt = e.target.value; if (e.target.value) { b.on = true; tick.checked = true; } } }),
            h('label.day-of', null, h('span', { text: A.t('day') }), h('input', { type: 'text', inputmode: 'numeric', maxLength: 2, 'aria-label': A.t('{name}: day of the month', { name: name }), value: b.day, oninput: e => { b.day = e.target.value; } })));
        })));
      body.append(h('div.actions', null,
        i > 0 ? A.btn(A.t('Back'), () => { st.step--; again(); }) : null,
        A.btn(end ? A.t('Skip') : A.t('Skip this'), () => { if (end) st.bills.forEach(b => { b.on = false; }); else if (i === 2) st.pay.amt = ''; next(); }),
        A.btn(end ? A.t('Finish') : A.t('Next'), next, 'primary')));
    }, { live: true, onclose: () => { if (!A.state.meta.onboarded) A.commit(s => { s.meta.onboarded = true; }, 'quiet'); } });
  };
})(window.App);
