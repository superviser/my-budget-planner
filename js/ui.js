/* ui.js: DOM helper, icons, sheets, toasts, form pieces */
'use strict';
(function (A) {
  function add(el, c) {
    if (c == null || c === false || c === true) return;
    if (Array.isArray(c)) c.forEach(x => add(el, x));
    else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  /* In this app every element's append() and replaceChildren() skip empty values and flatten lists, exactly like h().
     The browser's own versions print the word "null" for a missing child, which is never what a view means. */
  Element.prototype.append = function () { add(this, Array.from(arguments)); };
  Element.prototype.replaceChildren = function () { this.textContent = ''; add(this, Array.from(arguments)); };
  A.safe = el => el;

  /* h('div.panel.wide', {onclick: fn}, child, ...) */
  const h = A.h = function (sel, attrs) {
    const parts = sel.split('.'), el = document.createElement(parts[0] || 'div');
    if (parts.length > 1) el.className = parts.slice(1).join(' ');
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null) continue;
      if (v === false) { if (k === 'spellcheck' || k === 'draggable') el.setAttribute(k, 'false'); continue; }
      if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') { for (const p in v) { if (p.slice(0, 2) === '--') el.style.setProperty(p, v[p]); else el.style[p] = v[p]; } }
      else if (k in el && k !== 'list' && k !== 'form' && k !== 'style') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  };
  A.$ = (q, root) => (root || document).querySelector(q);

  /* Redraw part of the page without losing the place: whatever had the keyboard focus gets it back
     in the rebuilt markup, with the cursor where it was. */
  function pathOf(el, root) {
    const p = [];
    while (el && el !== root) {
      const par = el.parentNode;
      if (!par) return null;
      p.unshift(Array.prototype.indexOf.call(par.children, el));
      el = par;
    }
    return el === root ? p : null;
  }
  A.keepFocus = function (root, redraw) {
    const a = document.activeElement, p = a && a !== document.body && root.contains(a) ? pathOf(a, root) : null;
    const tag = a && a.tagName, type = a && a.type;
    let caret = null;
    try { if (p && a.selectionStart != null) caret = [a.selectionStart, a.selectionEnd]; } catch (e) { /* this input type has no caret */ }
    redraw();
    if (!p) return;
    let b = root;
    for (let i = 0; i < p.length && b; i++) b = b.children[p[i]];
    if (b && b.tagName === tag && b.type === type && b !== document.activeElement) {
      b.focus({ preventScroll: true });
      try { if (caret && b.setSelectionRange) b.setSelectionRange(caret[0], caret[1]); } catch (e) { /* no caret here */ }
    }
  };

  /* ---------- icons: 24px, stroked ---------- */
  const P = {
    today: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2.5v2.5 M12 19v2.5 M2.5 12H5 M19 12h2.5 M5.3 5.3l1.8 1.8 M16.9 16.9l1.8 1.8 M5.3 18.7l1.8-1.8 M16.9 7.1l1.8-1.8',
    budget: 'M3.5 7.5h17v11h-17z M3.5 8l8.5 6 8.5-6',
    plan: 'M4.5 6h15v14h-15z M4.5 10.5h15 M8.5 3.5v4 M15.5 3.5v4',
    save: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z M12 12h.01',
    debt: 'M3.5 7l6 6 4-4 7 7 M20.5 11.5V16H16',
    pause: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M10 9v6 M14 9v6',
    review: 'M5 20v-9 M12 20V4.5 M19 20v-6',
    people: 'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16.500 11.200a3.200 3.200 0 1 0-1.200-6.100 M17.500 14.200a5.500 5.500 0 0 1 4 5.800',
    settings: 'M4 7.5h9 M18 7.5h2 M4 16.5h3 M12 16.5h8 M15.5 10a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M9.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    more: 'M5.5 12h.01 M12 12h.01 M18.5 12h.01',
    plus: 'M12 5v14 M5 12h14',
    x: 'M6.5 6.5l11 11 M17.5 6.5l-11 11',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    left: 'M14.5 5.5L8 12l6.5 6.5',
    right: 'M9.5 5.5L16 12l-6.5 6.5',
    bell: 'M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z M10 20.5a2 2 0 0 0 4 0',
    repeat: 'M4.5 11V9.5a3 3 0 0 1 3-3h11 M15.5 3.5l3 3-3 3 M19.5 13v1.5a3 3 0 0 1-3 3h-11 M8.5 20.5l-3-3 3-3',
    trash: 'M5 7.5h14 M10 7.5v-3h4v3 M7 7.5l1 12.5h8l1-12.5',
    edit: 'M4.5 19.5h4L19.5 8.5l-4-4L4.5 15.5z',
    lock: 'M6.5 11h11v9h-11z M9 11V8a3 3 0 0 1 6 0v3',
    unlock: 'M6.5 11h11v9h-11z M9 11V8a3 3 0 0 1 5.6-1.5',
    cloud: 'M7.5 18.5a4 4 0 0 1-.6-7.9 6 6 0 0 1 11.4 1.6 3.3 3.3 0 0 1-.8 6.3z',
    download: 'M12 4v11 M7.5 10.5L12 15l4.5-4.5 M5 19.5h14',
    eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    eyeoff: 'M4 4l16 16 M9.9 5.8A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4 M6.3 7.4A16 16 0 0 0 2.5 12s3.5 6.5 9.5 6.5c1.5 0 2.8-.4 4-.9',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
    back: 'M9 13.5L4.5 9 9 4.5 M4.5 9H14a5.5 5.5 0 0 1 0 11h-3',
    spark: 'M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6-5.6-1.9 5.6-1.9z'
  };
  A.icon = function (name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', P[name] || P.more);
    s.append(p);
    return s;
  };

  /* ---------- toasts ---------- */
  /* While a sheet is open everything outside it cannot be tapped, so the toasts move into the open sheet
     and back out again when it closes. That keeps "Undo" reachable at all times. */
  let toastBox = null;
  const toastHost = () => { const open = document.querySelectorAll('dialog[open]'); return open.length ? open[open.length - 1] : document.body; };
  function placeToasts() {
    if (!toastBox) return;
    const host = toastHost();
    if (toastBox.parentNode !== host) host.appendChild(toastBox);
  }
  A.toast = function (msg, opt) {
    opt = opt || {};
    if (!toastBox) toastBox = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
    placeToasts();
    const el = h('div.toast', null, h('span', { text: msg }));
    const kill = () => { el.remove(); };
    if (opt.action) el.append(h('button.toast-btn', { type: 'button', onclick: () => { kill(); opt.fn(); } }, opt.action));
    toastBox.append(el);
    while (toastBox.children.length > 3) toastBox.firstChild.remove();
    setTimeout(kill, opt.ms || (opt.action ? 7000 : 3400));
  };

  /* ---------- sheets: bottom sheet on phones, dialog on larger screens ---------- */
  A.sheet = function (title, build, opts) {
    opts = opts || {};
    /* the title may be a function, so a sheet that stays open can follow a change of language */
    const say = () => (typeof title === 'function' ? title() : title);
    const dlg = h('dialog.sheet' + (opts.wide ? '.wide' : ''), { 'aria-label': say() }), body = h('div.sheet-body'), head = h('h2', { text: say() });
    const closeBtn = h('button.icon-btn', { type: 'button', 'aria-label': A.t('Close'), onclick: () => api.close() }, A.icon('x'));
    const api = { dlg: dlg, body: body, close: () => { if (dlg.open) dlg.close(); } };
    dlg.append(h('div.sheet-in', null, h('header.sheet-head', null, head, closeBtn), body));
    build(body, api);
    /* live sheets redraw themselves when the data, or the language, changes underneath them */
    const redraw = what => {
      if ((what !== 'data' && what !== 'auto' && what !== 'lang') || !dlg.open) return;
      head.textContent = say(); dlg.setAttribute('aria-label', say()); closeBtn.setAttribute('aria-label', A.t('Close'));
      A.keepFocus(body, () => { body.replaceChildren(); build(body, api); });
    };
    if (opts.live) A.on(redraw);
    dlg.addEventListener('close', () => {
      A.off(redraw);
      if (toastBox && dlg.contains(toastBox)) document.body.appendChild(toastBox);
      dlg.remove();
      placeToasts();
      if (opts.onclose) opts.onclose();
    });
    /* a tap on the dimmed area closes the sheet; dragging a text selection out of it does not */
    let downOutside = false;
    dlg.addEventListener('pointerdown', e => { downOutside = e.target === dlg; });
    dlg.addEventListener('click', e => { if (e.target === dlg && downOutside) api.close(); });
    document.body.append(dlg);
    dlg.showModal();
    placeToasts();
    return api;
  };
  A.closeSheets = () => document.querySelectorAll('dialog[open]').forEach(d => d.close());

  A.confirm = function (title, text, okLabel, fn, danger) {
    A.sheet(title, (body, api) => {
      body.append(h('p.lead', { text: text }), h('div.actions', null,
        h('button.btn', { type: 'button', onclick: api.close }, A.t('Cancel')),
        h('button.btn.' + (danger ? 'danger' : 'primary'), { type: 'button', onclick: () => { api.close(); fn(); } }, okLabel)));
    });
  };

  /* ---------- form pieces ---------- */
  A.field = (label, control, hint) => h('label.field', null, h('span.field-label', { text: label }), control, hint ? h('span.field-hint', { text: hint }) : null);
  /* a caption over a set of buttons: not a <label>, or a tap on the caption would press the first button */
  A.group = (label, control, hint) => h('div.field', { role: 'group', 'aria-label': label }, h('span.field-label', { 'aria-hidden': 'true', text: label }), control, hint ? h('span.field-hint', { text: hint }) : null);
  A.select = (opts, val, attrs) => h('select', attrs, opts.map(o => h('option', { value: o[0], text: o[1], selected: String(o[0]) === String(val == null ? '' : val) })));
  A.seg = function (opts, val, onpick, label) {
    const box = h('div.seg', { role: 'group', 'aria-label': label || null });
    opts.forEach((o, i) => box.append(h('button', {
      type: 'button', 'aria-pressed': String(o[0] === val), onclick: () => {
        box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false'));
        box.children[i].setAttribute('aria-pressed', 'true');
        onpick(o[0]);
      }
    }, o[1])));
    return box;
  };
  A.toggle = (label, hint, on, fn) => h('label.toggle', null,
    h('span.toggle-text', null, h('span.toggle-label', { text: label }), hint ? h('span.field-hint', { text: hint }) : null),
    h('input', { type: 'checkbox', role: 'switch', checked: !!on, onchange: e => fn(e.target.checked) }));
  A.meter = (pct, state) => h('div.meter', { 'data-state': state || 'ok', 'aria-hidden': 'true' }, h('i', { style: { '--p': A.clamp(+pct || 0, 0, 1).toFixed(3) } }));
  A.pill = (text, tone) => h('span.pill', { 'data-tone': tone || null, text: text });
  A.empty = (text, label, fn) => h('div.empty', null, h('p', { text: text }), label ? h('button.btn.primary', { type: 'button', onclick: fn }, label) : null);
  A.btn = (label, fn, cls, ic) => h('button.btn' + (cls ? '.' + cls : ''), { type: 'button', onclick: fn }, ic ? A.icon(ic) : null, label);
  /* amounts are typed as text so every keyboard and every decimal mark works; this keeps them tidy */
  A.amountInput = (value, attrs) => h('input', Object.assign({ type: 'text', inputmode: 'decimal', autocomplete: 'off', value: value ? String(value) : '', placeholder: '0' }, attrs || {}));
  A.dateInput = (value, attrs) => h('input', Object.assign({ type: 'date', value: value || '', min: '2000-01-01', max: '2100-12-31' }, attrs || {}));

  /* a translated sentence with pieces of markup inside it: A.rich(A.t('Open {link} first.'), { link: h('a', ...) }) */
  A.rich = (text, parts) => text.split(/(\{\w+\})/).map(s => { const m = /^\{(\w+)\}$/.exec(s); return m && parts[m[1]] != null ? parts[m[1]] : s; });

  A.download = function (name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  A.copy = function (text, done) {
    const ok = () => A.toast(done || A.t('Copied.')), no = () => A.toast(A.t('Could not copy. Select the text and copy it by hand.'));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, no);
    else no();
  };
})(window.App);
