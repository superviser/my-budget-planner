/* views.js: Today (three layouts), shared rows, add/edit sheets, Budget */
'use strict';
(function (A) {
  const h = A.h, V = A.views = {};
  A.ui = { ym: null, day: null, budgetTab: 'env', planTab: 'cal', q: '', seenBack: false };
  const curYm = () => A.ym(A.today());
  A.go = v => { location.hash = '#/' + v; };

  A.pageHead = (title, sub, right) => h('header.page-head', null,
    h('div', null, h('h1', { text: title }), sub ? h('p.sub', { text: sub }) : null),
    right ? h('div.page-actions', null, right) : null);

  A.monthNav = (ym, set) => h('div.monthnav', null,
    h('button.icon-btn', { type: 'button', 'aria-label': A.t('Previous month'), onclick: () => set(A.addMonths(ym, -1)) }, A.icon('left')),
    h('strong.monthnav-label', { text: A.monthName(ym) }),
    h('button.icon-btn', { type: 'button', 'aria-label': A.t('Next month'), onclick: () => set(A.addMonths(ym, 1)) }, A.icon('right')),
    ym !== curYm() ? h('button.chip', { type: 'button', onclick: () => set(curYm()) }, A.t('This month')) : null);

  A.curSym = () => {
    try {
      return new Intl.NumberFormat(A.locale(), { style: 'currency', currency: A.state.profile.currency, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0).find(p => p.type === 'currency').value;
    } catch (e) { return ''; }
  };
  /* the decimal mark of the chosen language, for the on-screen keypad */
  const decMark = () => { try { const m = (1.1).toLocaleString(A.locale()).replace(/\d/g, ''); return m === ',' ? ',' : '.'; } catch (e) { return '.'; } };
  A.refList = type => type === 'out' ? A.state.cats : type === 'save' ? A.state.funds : type === 'debt' ? A.state.debts : null;
  A.refOf = (type, ref) => { const l = A.refList(type); return l ? A.by(l, ref) : null; };
  const refOpts = list => list.map(c => [c.id, (c.emoji ? c.emoji + ' ' : '') + A.nm(c)]);
  const typeWord = { in: A.T('Income'), out: A.T('Bill'), save: A.T('Savings'), debt: A.T('Debt'), note: A.T('Reminder') };

  /* ---------- rows ---------- */
  function markDone(it) {
    A.pay(it);
    const r = it.r, v = { name: r.name };
    A.toast(r.type === 'note' ? A.t('Done.') : r.type === 'in' ? A.t('{name} marked received.', v) : A.t('{name} marked paid.', v), { action: A.t('Undo'), fn: () => A.unpay(it) });
  }
  A.itemRow = function (it, opt) {
    opt = opt || {};
    const r = it.r, late = !it.paid && !it.skipped && it.date < A.today(), meta = [];
    if (opt.date) meta.push(A.rel(it.date));
    meta.push(A.t(typeWord[r.type]));
    if (r.freq !== 'once') meta.push(A.t('repeats'));
    if (r.auto && r.type !== 'note') meta.push(A.t('automatic'));
    if (late) meta.push(A.inDays(it.date));
    const amt = r.type === 'note' ? null : h('span.row-amt' + (r.type === 'in' ? '.in' : ''), { text: (r.type === 'in' ? '+' : '') + A.money(r.amt) });
    /* a skipped one stays visible in its day, greyed, with a way back */
    if (it.skipped) return h('div.row.skipped', null,
      h('button.row-main', { type: 'button', onclick: () => A.itemSheet(it) },
        h('span.row-title', { text: r.name }), h('span.row-meta', { text: meta.concat(A.t('skipped')).join(' · ') })),
      h('button.chip', { type: 'button', onclick: () => A.unskip(it) }, A.t('Bring back')));
    return h('div.row' + (it.paid ? '.done' : '') + (late ? '.late' : ''), null,
      h('button.tick', {
        type: 'button', role: 'checkbox', 'aria-checked': String(it.paid),
        'aria-label': it.paid ? A.t('Undo: {name}', { name: r.name }) : A.t('Mark done: {name}', { name: r.name }),
        onclick: () => { if (it.paid) A.unpay(it); else markDone(it); }
      }, it.paid ? A.icon('check') : null),
      h('button.row-main', { type: 'button', onclick: () => A.itemSheet(it) },
        h('span.row-title', { text: r.name }), h('span.row-meta', { text: meta.join(' · ') })),
      amt);
  };
  A.txRow = function (x, opt) {
    const ref = A.refOf(x.type, x.ref), meta = [];
    const label = x.type === 'in' ? A.t('Income') : ref ? A.nm(ref) : x.type === 'save' ? A.t('Savings') : x.type === 'debt' ? A.t('Debt payment') : A.t('No envelope');
    meta.push(label);
    if (opt && opt.date) meta.push(A.dShort(x.date));
    if (x.rid) meta.push(A.t('scheduled'));
    const who = x.who && A.shared() && !(opt && opt.noWho) ? A.by(A.members(), x.who) : null;
    if (who) meta.push(who.name);
    return h('button.row.row-btn', { type: 'button', onclick: () => A.txSheet(x) },
      h('span.row-emoji', { 'aria-hidden': 'true', text: x.type === 'in' ? '💰' : (ref && ref.emoji) || '•' }),
      h('span.row-main', null, h('span.row-title', { text: x.name || label }), h('span.row-meta', { text: meta.join(' · ') })),
      h('span.row-amt' + (x.type === 'in' ? '.in' : ''), { text: (x.type === 'in' ? '+' : '') + A.money(x.amt) }));
  };
  A.envRow = e => h('button.row.row-btn.env', { type: 'button', onclick: () => A.envSheet(e.c, e.ym) },
    h('span.row-emoji', { 'aria-hidden': 'true', text: e.c.emoji }),
    h('span.row-main', null, h('span.row-title', { text: A.nm(e.c) }), A.meter(e.pct, e.state),
      h('span.row-meta', { text: e.budget
        ? A.t('{spent} of {budget} · {state}', { spent: A.money(e.spent), budget: A.money(e.budget), state: A.t(A.envState[e.state]) })
        : A.t('{spent} spent · no budget set', { spent: A.money(e.spent) }) })),
    e.budget ? h('span.row-amt', null, A.money(Math.abs(e.left)), h('small', { text: ' ' + (e.left >= 0 ? A.t('left') : A.t('over')) })) : null);

  A.quickAdd = function () {
    const input = h('input.quick-input', { id: 'quick', type: 'text', placeholder: A.t('Type it: coffee 4.50'), autocomplete: 'off', enterkeyhint: 'done', 'aria-label': A.t('Quick add: what it was and how much') });
    return h('form.quick', {
      onsubmit: e => {
        e.preventDefault();
        const q = A.parseQuick(input.value);
        if (!q) { A.toast(A.t('Add an amount, like “coffee 4.50”.')); return; }
        const ref = A.guessCat(q.name) || A.fallbackCat(), c = A.by(A.state.cats, ref);
        A.refocus = '#quick';
        const x = A.addTx({ amt: q.amt, name: q.name, ref: ref });
        A.toast(c ? A.t('Logged {amt} to {name}.', { amt: A.money(q.amt), name: A.nm(c) }) : A.t('Logged {amt}.', { amt: A.money(q.amt) }), { action: A.t('Change'), fn: () => A.txSheet(x) });
      }
    }, input, h('button.btn.primary', { type: 'submit' }, A.t('Log it')));
  };

  /* ---------- Today pieces ---------- */
  function hero(N) {
    const m = N.m, neg = m.safe < 0, n = m.dueList.length;
    if (!m.expected && !m.out && !m.roll) return h('div.hero', null,
      h('p.hero-label', { text: A.t('Safe to spend') }), h('p.hero-num', { text: A.money(0) }),
      h('p.hero-sub', { text: A.t('Add what comes in, and this number starts working for you.') }),
      h('div.actions.start', { style: { marginTop: '12px' } },
        A.btn(A.t('Add my paycheck'), () => A.ruleSheet({ type: 'in', name: A.t('Paycheck'), freq: 'biweekly', auto: true, remind: 0 }), 'primary'),
        A.btn(A.t('Log income once'), () => A.addSheet({ type: 'in' }))));
    const num = A.money(Math.abs(m.safe), { whole: true });
    return h('div.hero' + (neg ? '.neg' : ''), null,
      h('p.hero-label', { text: neg ? A.t('Past this month’s money by') : A.t('Safe to spend') }),
      h('p.hero-num' + (num.length > 7 ? '.long' : ''), { text: num }),
      h('p.hero-sub', { text: neg ? A.t('Bills are already counted. Nothing to fix today.') : A.t('About {amt} a day until {date}', { amt: A.money(Math.max(0, N.share), { whole: true }), date: A.dShort(A.monthEnd(m.ym)) }) }),
      n ? h('button.hero-note', { type: 'button', onclick: () => A.go('plan') },
        A.tn(n, '{amt} already set aside for {n} bill still to pay|{amt} already set aside for {n} bills still to pay', { amt: A.money(m.dueOut, { whole: true }) })) : null);
  }

  function strip(N) {
    const box = h('div.strip', { role: 'group', 'aria-label': A.t('The next two weeks') });
    const items = A.items(N.t, A.addDays(N.t, 13)), sel = A.ui.day || N.t;
    const fill = N.share > 0 ? A.clamp(N.leftToday / N.share, 0, 1) : 0;
    /* the one authored motion: today's well drains from where it was to where it is now */
    const from = A.ui.fill == null ? fill : A.ui.fill;
    A.ui.fill = fill;
    for (let i = 0; i < 14; i++) {
      const d = A.addDays(N.t, i), its = items.filter(it => it.date === d && !it.skipped);
      box.append(h('button.day' + (i === 0 ? '.is-today' : '') + (its.some(it => it.r.type === 'in') ? '.has-pay' : ''), {
        type: 'button', 'aria-pressed': String(sel === d),
        'aria-label': A.dLong(d) + ', ' + (its.length ? A.tn(its.length, '{n} item|{n} items') : A.t('nothing scheduled')),
        style: i === 0 ? { '--fill': from } : null,
        onclick: () => { A.ui.day = d; A.render(); }
      },
        h('span.day-wd', { text: i === 0 ? A.t('Today') : A.fmt(d, { weekday: 'short' }) }),
        h('span.day-n', { text: String(+d.slice(8)) }),
        h('span.day-marks', null, its.slice(0, 4).map(it => h('i.mark', { 'data-type': it.r.type, 'data-done': it.paid ? '1' : null })))));
    }
    if (from !== fill) requestAnimationFrame(() => requestAnimationFrame(() => { if (box.firstChild) box.firstChild.style.setProperty('--fill', fill); }));
    return box;
  }

  function dayContents(d, N) {
    const isToday = d === N.t, its = A.items(d, d);
    const spends = A.state.tx.filter(x => x.date === d && !x.rid), list = h('div.rows');
    its.forEach(it => list.append(A.itemRow(it)));
    spends.forEach(x => list.append(A.txRow(x)));
    if (!its.length && !spends.length) list.append(h('p.quiet', { text: isToday ? A.t('Nothing due today.') : A.t('Nothing scheduled for this day.') }));
    return list;
  }
  function dayPanel(N) {
    const d = A.ui.day || N.t, isToday = d === N.t;
    let sub = A.inDays(d);
    if (isToday) sub = N.m.safe < 0 ? '' : N.leftToday >= 0
      ? A.t('{left} left of today’s {share}', { left: A.money(N.leftToday, { whole: true }), share: A.money(N.share, { whole: true }) })
      : A.t('Today went {amt} past its share. The other days adjust by themselves.', { amt: A.money(-N.leftToday, { whole: true }) });
    return h('section.panel.daypanel', null,
      h('div.panel-head', null, h('h2', { text: isToday ? A.t('Today') : A.dLong(d) }), sub ? h('p.sub', { text: sub }) : null),
      isToday ? A.quickAdd() : null, dayContents(d, N),
      h('div.actions.start', null,
        isToday ? null : A.btn(A.t('Log a spend on this day'), () => A.addSheet({ date: d })),
        A.btn(A.t('Add a bill or reminder'), () => A.ruleSheet({ start: d, freq: 'once' }))));
  }

  /* tick off, or skip, a whole list in one go; one tap takes it all back */
  function bulk(list, done) {
    const t = A.today(), touched = [];
    A.commit(s => list.forEach(a => {
      const it = a.it, r = it.r;
      if (!done) { if ((r.skips = r.skips || []).indexOf(it.date) < 0) { r.skips.push(it.date); touched.push(it); } }
      else if (r.type === 'note') { if ((r.done = r.done || []).indexOf(it.date) < 0) { r.done.push(it.date); touched.push(it); } }
      else if (!s.tx.some(x => x.rid === r.id && x.occ === it.date)) { s.tx.push(A.txFor(it, t)); touched.push(it); }
    }));
    A.toast(done ? A.t('All marked done.') : A.t('All skipped.'), {
      action: A.t('Undo'), fn: () => A.commit(s => touched.forEach(it => {
        const r = A.by(s.rules, it.r.id);
        if (!r) return;
        if (!done) r.skips = (r.skips || []).filter(d => d !== it.date);
        else if (r.type === 'note') r.done = (r.done || []).filter(d => d !== it.date);
        else s.tx = s.tx.filter(x => !(x.rid === r.id && x.occ === it.date));
      }))
    });
  }
  function attention(att) {
    if (!att.length) return null;
    const list = h('div.rows'), late = att.filter(a => a.kind === 'late');
    att.forEach(a => list.append(a.it ? A.itemRow(a.it, { date: true }) : A.pauseRow(a.p)));
    return h('section.panel.attention', { id: 'attention' },
      h('div.panel-head', null, h('h2', { text: A.t('Waiting on you') }),
        h('p.sub', { text: A.tn(att.length, '{n} thing. Tick it off or skip it; either is fine.|{n} things. Tick them off or skip them; either is fine.') })),
      list,
      late.length > 1 ? h('div.actions.start', null, A.btn(A.t('Mark all as done'), () => bulk(late, true)), A.btn(A.t('Skip all'), () => bulk(late, false))) : null);
  }
  function welcomeBack(att) {
    const n = A.state.meta.awayDays || 0, late = att.filter(a => a.kind === 'late');
    if (n < 4 || A.ui.seenBack) return null;
    const dismiss = () => { A.ui.seenBack = true; A.render(); };
    return h('section.panel.welcome', null, h('h2', { text: A.t('Welcome back') }),
      h('p', { text: late.length
        ? A.tn(late.length, '{n} thing came and went while you were away. No catching up needed: clear it in one tap and carry on from today.|{n} things came and went while you were away. No catching up needed: clear them in one tap and carry on from today.')
        : A.t('Nothing piled up while you were away. Carry on from today.') }),
      h('div.actions.start', null,
        late.length ? A.btn(A.t('Mark all as done'), () => { bulk(late, true); dismiss(); }, 'primary') : null,
        late.length ? A.btn(A.t('Skip all'), () => { bulk(late, false); dismiss(); }) : null,
        A.btn(late.length ? A.t('I’ll look myself') : A.t('Got it'), dismiss)));
  }
  function envMini() {
    const env = A.envelopes(curYm()).filter(e => e.budget > 0 && e.state !== 'full').sort((a, b) => b.pct - a.pct).slice(0, 5);
    if (!env.length) return null;
    return h('section.panel.calm-hide', null,
      h('div.panel-head', null, h('h2', { text: A.t('Envelopes') }), h('button.link', { type: 'button', onclick: () => A.go('budget') }, A.t('See all'))),
      h('div.rows', null, env.map(A.envRow)));
  }
  function insights() {
    const list = A.insights();
    if (!list.length) return null;
    return h('section.panel.calm-hide', null, h('div.panel-head', null, h('h2', { text: A.t('Worth knowing') })),
      h('ul.insights', null, list.map(i => h('li', { 'data-tone': i.tone, text: i.text }))));
  }
  /* one line per person: what they spent this month, and pocket money for the children */
  A.personRow = function (m, v, max, onclick) {
    const me = A.me(), pocket = m.kind === 'child' && m.allowance > 0;
    return h(onclick ? 'button.row.row-btn' : 'div.row', onclick ? { type: 'button', onclick: onclick } : null,
      h('span.row-emoji', { 'aria-hidden': 'true', text: m.emoji }),
      h('span.row-main', null, h('span.row-title', null, m.name, me && m.id === me.id ? A.pill(A.t('this device')) : null),
        A.meter(pocket ? v / m.allowance : v / max, pocket && v > m.allowance ? 'over' : 'ok'),
        h('span.row-meta', { text: pocket
          ? (v > m.allowance ? A.t('{spent} of {amt} pocket money · over', { spent: A.money(v), amt: A.money(m.allowance) }) : A.t('{spent} of {amt} pocket money', { spent: A.money(v), amt: A.money(m.allowance) }))
          : A.t('Spent this month') })),
      h('span.row-amt', { text: A.money(v) }));
  };
  A.settleText = st => (st.even ? A.t('You two are even this month.') : A.t('To be even this month, {from} gives {to} {amt}.', { from: st.from.name, to: st.to.name, amt: A.money(st.amt) }));
  function people() {
    if (!A.shared()) return null;
    const ym = curYm(), w = A.byPerson(ym), ms = A.members(), st = A.settle(ym);
    const max = Math.max.apply(null, [1].concat(ms.map(m => w[m.id] || 0)));
    return h('section.panel.calm-hide', null,
      h('div.panel-head', null, h('h2', { text: A.t('Who spent what') }), h('button.link', { type: 'button', onclick: () => A.go('people') }, A.t('See all'))),
      h('div.rows', null, ms.map(m => A.personRow(m, w[m.id] || 0, max))),
      w[''] ? h('p.sub', { text: A.t('{amt} more has no name on it: shared bills and the like.', { amt: A.money(w['']) }) }) : null,
      st ? h('p.settle', { text: A.settleText(st) }) : null);
  }
  function rhythm() {
    const r = A.rhythm();
    return h('div.rhythm.calm-hide', null,
      h('div.rhythm-dots', { 'aria-hidden': 'true' }, r.days.map(d => h('i', { 'data-on': d.on ? '1' : null }))),
      h('p', { text: A.tn(r.n, '{n} check-in in the last 7 days.|{n} check-ins in the last 7 days.') + ' ' + (r.n >= 4 ? A.t('That is a rhythm.') : A.t('Every one counts.')) }));
  }
  A.agenda = function (from, days, emptyText) {
    const items = A.items(from, A.addDays(from, days - 1)).filter(it => !it.skipped), box = h('div.agenda');
    let last = null, rows = null;
    items.forEach(it => {
      if (it.date !== last) {
        last = it.date; rows = h('div.rows');
        const near = Math.abs(A.diff(from, it.date)) < 7 && from === A.today();
        box.append(h('h3.date-head', null, near ? A.rel(it.date) : A.fmt(it.date, { weekday: 'long' }), h('small', { text: ' ' + A.dShort(it.date) })), rows);
      }
      rows.append(A.itemRow(it));
    });
    if (!items.length) box.append(h('p.quiet', { text: emptyText || A.t('Nothing scheduled.') }));
    return box;
  };

  function todayTiles(N, att) {
    const t = N.t, m = N.m;
    const next = A.items(t, A.addDays(t, 45)).find(it => !it.paid && !it.skipped && it.r.type !== 'in');
    const pay = A.nextPay(), neg = m.safe < 0;
    const cap = s => s.charAt(0).toLocaleUpperCase(A.locale()) + s.slice(1);
    const tile = (cls, label, big, small, fn) => h('button.tile.' + cls, { type: 'button', onclick: fn },
      h('span.tile-label', { text: label }), h('span.tile-big' + (/\p{L}{4}/u.test(big) ? '.words' : ''), { text: big }), small ? h('span.tile-small', { text: small }) : null);
    const grid = h('div.tiles');
    grid.append(
      tile('t-hero', neg ? A.t('Past this month’s money by') : A.t('Safe to spend'), A.money(Math.abs(m.safe), { whole: true }),
        neg ? A.t('Bills are already counted') : A.tn(m.daysLeft, 'About {amt} a day · {n} day left|About {amt} a day · {n} days left', { amt: A.money(Math.max(0, N.share), { whole: true }) }), () => A.go('budget')),
      tile('t1', A.t('Today'), A.money(Math.abs(N.leftToday), { whole: true }), N.leftToday >= 0 ? A.t('left of {amt}', { amt: A.money(N.share, { whole: true }) }) : A.t('past today’s share'), () => A.daySheet(t)),
      tile('t2', A.t('Next up'), next ? next.r.name : A.t('Nothing due'), next ? A.inDays(next.date) + (next.r.amt ? ' · ' + A.money(next.r.amt) : '') : A.t('for the next 45 days'), () => A.go('plan')));
    if (pay) grid.append(tile('t3', A.t('Payday'), cap(A.inDays(pay.date)), pay.r.name + ' · ' + A.money(pay.r.amt), () => A.go('plan')));
    if (att.length) grid.append(tile('t4', A.t('Waiting on you'), String(att.length), A.tn(att.length, '{n} thing to tick off|{n} things to tick off'), () => A.attentionSheet()));
    A.envelopes(A.ym(t)).filter(e => e.budget > 0 && e.state !== 'full').sort((a, b) => b.pct - a.pct).slice(0, 4).forEach((e, i) =>
      grid.append(tile('t' + (i % 4 + 1) + '.calm-hide', A.nm(e.c), A.money(Math.abs(e.left), { whole: true }), e.left >= 0 ? A.t('left this month') : A.t('over this month'), () => A.envSheet(e.c, e.ym))));
    const saved = A.sum(A.state.funds, A.fundBal), owed = A.sum(A.state.debts, A.debtBal);
    if (A.state.funds.length) grid.append(tile('t5.calm-hide', A.t('Saved'), A.money(saved, { whole: true }), A.tn(A.state.funds.length, 'across {n} fund|across {n} funds'), () => A.go('save')));
    if (A.state.debts.length) grid.append(tile('t6.calm-hide', A.t('Owed'), A.money(owed, { whole: true }), A.tn(A.state.debts.length, 'across {n} debt|across {n} debts'), () => A.go('debt')));
    return [grid, h('section.panel', null, A.quickAdd()), people()];
  }

  V.today = function (root) {
    const p = A.state.profile, L = A.look(), N = A.now(), att = A.attention(), hr = new Date().getHours();
    const myName = A.shared() && A.me() ? A.me().name : p.userName, v = { name: myName };
    const hi = myName
      ? (hr < 5 ? A.t('Still up, {name}', v) : hr < 12 ? A.t('Good morning, {name}', v) : hr < 18 ? A.t('Good afternoon, {name}', v) : A.t('Good evening, {name}', v))
      : (hr < 5 ? A.t('Still up') : hr < 12 ? A.t('Good morning') : hr < 18 ? A.t('Good afternoon') : A.t('Good evening'));
    root.append(A.pageHead(hi, A.dLong(N.t), [
      h('button.icon-btn', { type: 'button', 'aria-label': L.hideAmounts ? A.t('Show amounts') : A.t('Hide amounts'), 'aria-pressed': String(!!L.hideAmounts), onclick: () => A.setLook('hideAmounts', !L.hideAmounts) }, A.icon(L.hideAmounts ? 'eyeoff' : 'eye')),
      att.length ? h('button.icon-btn.has-badge', { type: 'button', 'aria-label': A.tn(att.length, '{n} thing waiting on you|{n} things waiting on you'), onclick: () => A.attentionSheet() }, A.icon('bell'), h('span.badge', { text: String(att.length) })) : null
    ]));
    root.append(welcomeBack(att), A.backupCard());
    if (L.layout === 'tiles') {
      root.append(todayTiles(N, att));
    } else if (L.layout === 'binder') {
      root.append(h('div.cols', null,
        h('div.col-main', null, h('section.panel.lead-panel', null, hero(N), A.quickAdd()), attention(att),
          h('section.panel', null, h('div.panel-head', null, h('h2', { text: A.t('Next 7 days') }), h('button.link', { type: 'button', onclick: () => A.go('plan') }, A.t('Calendar'))), A.agenda(N.t, 7, A.t('A clear week.')))),
        h('div.col-side', null, people(), envMini(), insights(), rhythm())));
    } else {
      root.append(h('div.cols', null,
        h('div.col-main', null, h('section.tray', null, hero(N), strip(N)), dayPanel(N)),
        h('div.col-side', null, attention(att), people(), envMini(), insights(), rhythm())));
    }
  };

  A.attentionSheet = () => A.sheet(() => A.t('Waiting on you'), body => {
    const att = A.attention(), list = h('div.rows');
    att.forEach(a => list.append(a.it ? A.itemRow(a.it, { date: true }) : A.pauseRow(a.p)));
    body.append(att.length ? list : h('p.quiet', { text: A.t('All clear. Nothing is waiting on you.') }));
  }, { live: true });

  A.daySheet = d => A.sheet(() => A.dLong(d), (body, api) => {
    body.append(dayContents(d, A.now()), h('div.actions.start', null,
      A.btn(A.t('Log a spend'), () => { api.close(); A.addSheet({ date: d }); }, 'primary'),
      A.btn(A.t('Add a bill or reminder'), () => { api.close(); A.ruleSheet({ start: d, freq: 'once' }); })));
  }, { live: true });

  /* ---------- add: amount, then one tap on an envelope ---------- */
  A.addSheet = function (pre) {
    pre = pre || {};
    const st = { type: pre.type || 'out', amt: pre.amt ? String(pre.amt) : '', ref: pre.ref || null, name: pre.name || '', date: pre.date || A.today(), note: '', more: !!(pre.name || pre.more), who: '' };
    const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches), dec = decMark();
    const members = A.shared() ? A.members() : [];
    if (members.length) st.who = (A.me() || members[0]).id;
    A.sheet(pre.title || A.t('Add'), (body, api) => {
      const out = h('output.amount-out', { text: st.amt || '0' });
      const input = h('input.amount-in', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0', value: st.amt, 'aria-label': A.t('Amount'), oninput: e => { st.amt = e.target.value; }, onkeydown: e => { if (e.key === 'Enter') save(); } });
      const chips = h('div.chips'), more = h('div.form'), hint = h('p.field-hint');
      function save() {
        const amt = A.num(st.amt);
        if (!amt) { A.toast(A.t('Add an amount first.')); return; }
        if (st.type !== 'in' && !st.ref) { A.toast(st.type === 'out' ? A.t('Pick an envelope.') : st.type === 'save' ? A.t('Pick a savings fund.') : A.t('Pick a debt.')); return; }
        const x = A.addTx({ amt: amt, type: st.type, ref: st.type === 'in' ? null : st.ref, name: st.name.trim(), date: st.date, note: st.note.trim(), who: st.who || null });
        const ref = A.refOf(x.type, x.ref), v = { amt: A.money(amt), name: A.nm(ref) };
        api.close();
        if (pre.onsave) pre.onsave(x);
        A.toast(ref ? A.t('Logged {amt} · {name}.', v) : x.type === 'in' ? A.t('Logged {amt} of income.', v) : A.t('Logged {amt}.', v),
          { action: A.t('Undo'), fn: () => { A.delTx(x.id); if (pre.onundo) pre.onundo(); } });
      }
      function press(k) {
        let a = st.amt;
        const at = Math.max(a.indexOf('.'), a.indexOf(','));
        if (k === 'del') a = a.slice(0, -1);
        else if (k === 'dec') { if (at < 0) a = (a || '0') + dec; }
        else {
          if ((at >= 0 && a.length - at > 2) || a.replace(/[.,]/, '').length >= 9) return;
          a = a === '0' ? k : a + k;
        }
        st.amt = a; out.textContent = a || '0';
      }
      function drawChips() {
        chips.replaceChildren();
        const list = A.refList(st.type);
        hint.textContent = st.type === 'in' ? '' : st.more ? A.t('Pick one, then save.') : A.t('Amount first, then tap where it goes. That saves it.');
        if (!list) return;
        if (!list.length) {
          chips.append(h('p.quiet', { text: st.type === 'save' ? A.t('No savings funds yet.') : A.t('No debts added yet.') }),
            A.btn(st.type === 'save' ? A.t('Create a fund') : A.t('Add a debt'), () => { api.close(); if (st.type === 'save') A.fundSheet(); else A.debtSheet(); }));
          return;
        }
        let ordered = list;
        if (st.type === 'out') {
          const since = A.addDays(A.today(), -60), n = {};
          A.state.tx.forEach(x => { if (x.type === 'out' && x.date >= since && !x.rid) n[x.ref] = (n[x.ref] || 0) + 1; });
          ordered = list.slice().sort((a, b) => (n[b.id] || 0) - (n[a.id] || 0));
        }
        ordered.forEach(c => chips.append(h('button.chip.big', {
          type: 'button', 'aria-pressed': String(st.ref === c.id),
          onclick: () => { st.ref = c.id; if (A.num(st.amt) > 0 && !st.more) save(); else drawChips(); }
        }, c.emoji ? h('span', { 'aria-hidden': 'true', text: c.emoji + ' ' }) : null, A.nm(c))));
      }
      function drawMore() {
        more.replaceChildren();
        if (!st.more && st.type !== 'in') {
          more.append(h('button.link', { type: 'button', onclick: () => { st.more = true; drawMore(); drawChips(); } }, A.t('Add a name, date or note')));
          return;
        }
        more.append(
          A.field(st.type === 'in' ? A.t('Where from') : A.t('Name'), h('input', { type: 'text', value: st.name, maxLength: 60, placeholder: st.type === 'in' ? A.t('Paycheck') : A.t('Optional'), oninput: e => { st.name = e.target.value; } })),
          A.field(A.t('Date'), A.dateInput(st.date, { onchange: e => { st.date = A.okDate(e.target.value); } })),
          A.field(A.t('Note'), h('input', { type: 'text', value: st.note, maxLength: 120, placeholder: A.t('Optional'), oninput: e => { st.note = e.target.value; } })));
      }
      let whoRow = null;
      if (members.length) {
        const pick = (id, e) => { st.who = id; whoRow.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); };
        whoRow = h('div.who', { role: 'group', 'aria-label': A.t('Whose is it') },
          members.map(m => h('button.chip', { type: 'button', 'aria-pressed': String(st.who === m.id), onclick: e => pick(m.id, e) }, h('span', { 'aria-hidden': 'true', text: m.emoji + ' ' }), m.name)),
          h('button.chip', { type: 'button', 'aria-pressed': String(!st.who), onclick: e => pick('', e) }, A.t('Shared')));
      }
      if (coarse) body.classList.add('add-touch');
      body.append(
        A.seg([['out', A.t('Spend')], ['in', A.t('Income')], ['save', A.t('Savings')], ['debt', A.t('Debt')]], st.type, v => { st.type = v; st.ref = null; drawChips(); drawMore(); }, A.t('What kind')),
        whoRow,
        h('div.amount', null, h('span.amount-cur', { text: A.curSym() }), coarse ? out : input),
        hint, chips, more,
        coarse ? h('div.keypad', null, ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'dec', '0', 'del'].map(k =>
          h('button', { type: 'button', 'aria-label': k === 'del' ? A.t('Delete last digit') : k === 'dec' ? A.t('Decimal point') : k, onclick: () => press(k) }, k === 'del' ? A.icon('back') : k === 'dec' ? dec : k))) : null,
        h('div.actions', null, h('button.btn.primary.grow', { type: 'button', onclick: save }, A.t('Save'))));
      drawChips(); drawMore();
      if (!coarse) setTimeout(() => input.focus(), 30);
    });
  };

  A.txSheet = function (x) {
    A.sheet(A.t('Edit entry'), (body, api) => {
      const amt = A.amountInput(x.amt), name = h('input', { type: 'text', value: x.name || '', maxLength: 60 }), date = A.dateInput(x.date);
      const note = h('input', { type: 'text', value: x.note || '', maxLength: 120 }), list = A.refList(x.type);
      let ref = null, who = null;
      if (list) {
        const o = refOpts(list);
        /* what it was filed under has since been deleted: it stays as it is unless something else is picked */
        if (!A.by(list, x.ref)) o.unshift([x.ref || '', A.t('(removed)')]);
        ref = A.select(o, x.ref || '');
      }
      if (A.shared()) {
        const ms = A.members(), o = [['', A.t('Nobody in particular')]].concat(ms.map(m => [m.id, m.emoji + ' ' + m.name]));
        if (x.who && !A.by(ms, x.who)) { const p = A.by(A.state.people, x.who); o.push([x.who, p ? p.emoji + ' ' + p.name : A.t('(removed)')]); }
        who = A.select(o, x.who || '');
      }
      body.append(h('div.form', null, A.field(A.t('Amount'), amt), A.field(A.t('Name'), name), who ? A.field(A.t('Whose is it'), who) : null,
        ref ? A.field(x.type === 'out' ? A.t('Envelope') : x.type === 'save' ? A.t('Fund') : A.t('Debt'), ref) : null,
        A.field(A.t('Date'), date), A.field(A.t('Note'), note)),
        h('div.actions', null,
          A.btn(A.t('Delete'), () => {
            const u = A.delTx(x.id);
            api.close();
            A.toast(A.t('Deleted.'), u ? { action: A.t('Undo'), fn: u.undo } : null);
          }, 'danger'),
          A.btn(A.t('Save'), () => {
            const a = A.num(amt.value);
            if (!a) { A.toast(A.t('Add an amount.')); return; }
            A.commit(() => {
              x.amt = a; x.name = name.value.trim(); x.date = A.okDate(date.value || x.date); x.note = note.value.trim();
              if (ref) x.ref = ref.value || null;
              if (who) { if (who.value) x.who = who.value; else delete x.who; }
            });
            api.close();
          }, 'primary')));
    });
  };

  /* ---------- a repeating bill, payday or reminder ---------- */
  /* After the dates of a repeat change, it counts from now on: what was already paid or skipped stays as history
     and is never asked for a second time. */
  function countFrom(r, s) {
    const t = A.today();
    let last = '';
    s.tx.forEach(x => { if (x.rid === r.id && x.occ > last) last = x.occ; });
    if (r.freq === 'monthly' && last && A.ym(last) === A.ym(t)) return A.addMonths(A.ym(t), 1) + '-01';
    if ((r.freq === 'weekly' || r.freq === 'biweekly') && last >= t) return A.addDays(last, 1);
    return t;
  }
  A.ruleSheet = function (r0) {
    const isNew = !r0 || !r0.id;
    const r = Object.assign({ name: '', type: 'out', amt: 0, freq: 'monthly', start: A.today(), ref: null, auto: false, remind: null }, r0 || {});
    A.sheet(isNew ? A.t('Add a bill, payday or reminder') : A.t('Edit {name}', { name: r.name }), (body, api) => {
      const name = h('input', { type: 'text', value: r.name, maxLength: 60, placeholder: A.t('Rent, Paycheck, Renew passport…') });
      const type = A.select(A.opts(A.TYPES), r.type, { onchange: () => drawRef() });
      const amt = A.amountInput(r.amt);
      const freq = A.select(A.opts(A.FREQS), r.freq), start = A.dateInput(r.start);
      const auto = h('input', { type: 'checkbox', checked: !!r.auto });
      const remind = A.select(A.opts(A.REMIND), r.remind == null ? '' : String(r.remind));
      const refBox = h('div'), amtField = A.field(A.t('Amount'), amt);
      const autoField = h('label.check', null, auto, h('span', null, A.t('It happens by itself'), h('span.field-hint', { text: A.t('Autopay or direct deposit: log it for me on the day.') })));
      let refSel = null;
      function drawRef() {
        const t = type.value, list = A.refList(t);
        refBox.replaceChildren(); refSel = null;
        amtField.hidden = autoField.hidden = t === 'note';
        if (!list) return;
        if (!list.length) { refBox.append(h('p.field-hint', { text: t === 'save' ? A.t('Create a savings fund first, on the Savings page.') : A.t('Add the debt first, on the Debt page.') })); return; }
        refSel = A.select(refOpts(list), r.ref);
        refBox.append(A.field(t === 'out' ? A.t('Envelope') : t === 'save' ? A.t('Into fund') : A.t('Towards debt'), refSel));
      }
      function save() {
        const t = type.value, v = {
          name: name.value.trim(), type: t, amt: t === 'note' ? 0 : A.num(amt.value), freq: freq.value, start: A.okDate(start.value),
          ref: refSel ? refSel.value : null, auto: t !== 'note' && auto.checked, remind: remind.value === '' ? null : +remind.value
        };
        if (!v.name) { A.toast(A.t('Give it a name.')); return; }
        if (t !== 'note' && !v.amt) { A.toast(A.t('Add an amount.')); return; }
        if ((t === 'save' || t === 'debt') && !v.ref) { A.toast(t === 'save' ? A.t('Create a savings fund first.') : A.t('Add the debt first.')); return; }
        A.commit(s => {
          if (isNew) {
            const n = Object.assign({ id: A.uid(), skips: [] }, v), m1 = A.ym(A.today()) + '-01';
            /* a repeat added today never reaches back before this month */
            if (n.freq !== 'once' && n.start < m1) n.from = m1;
            s.rules.push(n);
          } else {
            const moved = r0.start !== v.start || r0.freq !== v.freq;
            Object.assign(r0, v);
            if (moved) { delete r0.dom; delete r0.from; if (r0.freq !== 'once') r0.from = countFrom(r0, s); }
          }
        });
        A.autopost();
        api.close();
        A.toast(isNew ? A.t('Added.') : A.t('Saved.'));
      }
      body.append(h('div.form', null, A.field(A.t('What is it'), name), A.field(A.t('Kind'), type), amtField, refBox,
        h('div.form-row', null, A.field(A.t('How often'), freq), A.field(isNew ? A.t('First date') : A.t('Starts'), start)),
        A.field(A.t('Remind me'), remind, A.t('Reminders show here, and as notifications once you turn them on in Settings.')), autoField),
        h('div.actions', null,
          isNew ? null : A.btn(A.t('Delete'), () => A.confirm(A.t('Delete {name}?', { name: r.name }), A.t('Past payments stay in your history. Future ones stop.'), A.t('Delete'), () => {
            A.commit(s => { s.rules = s.rules.filter(x => x.id !== r0.id); });
            api.close();
          }, true), 'danger'),
          A.btn(isNew ? A.t('Add') : A.t('Save'), save, 'primary')));
      drawRef();
    });
  };

  A.itemSheet = function (it) {
    const r = it.r, freq = A.t((A.FREQS.find(f => f[0] === r.freq) || ['', ''])[1]);
    A.sheet(r.name, (body, api) => {
      body.append(h('p.lead', { text: [A.dLong(it.date), r.type === 'note' ? null : A.money(r.amt), freq].filter(Boolean).join(' · ') }),
        it.paid ? A.pill(r.type === 'in' ? A.t('Received') : A.t('Done'), 'good') : it.skipped ? A.pill(A.t('Skipped')) : null,
        h('div.stack', null,
          it.skipped
            ? A.btn(A.t('Bring it back'), () => { api.close(); A.unskip(it); }, 'primary')
            : A.btn(it.paid ? A.t('Undo') : r.type === 'in' ? A.t('Mark received') : r.type === 'note' ? A.t('Mark done') : A.t('Mark paid'), () => { api.close(); if (it.paid) A.unpay(it); else markDone(it); }, 'primary'),
          !it.paid && !it.skipped ? A.btn(A.t('Skip this one'), () => { api.close(); A.skip(it); A.toast(A.t('Skipped this one.'), { action: A.t('Undo'), fn: () => A.unskip(it) }); }) : null,
          A.btn(r.freq === 'once' ? A.t('Edit') : A.t('Edit the repeat'), () => { api.close(); A.ruleSheet(r); })));
    });
  };

  /* ---------- envelopes ---------- */
  A.envSheet = function (c, ymArg) {
    const ym = ymArg || curYm(), draft = {};
    /* what is being typed survives the sheet redrawing itself when something else changes */
    const keep = k => ev => { draft[k] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value; };
    const val = (k, v) => (k in draft ? draft[k] : v);
    A.sheet(() => c.emoji + ' ' + A.nm(c), (body, api) => {
      const e = A.envelopes(ym).find(x => x.c.id === c.id);
      if (!e) { api.close(); return; }
      const over = A.state.budgets[ym] && A.state.budgets[ym][c.id] != null, month = A.monthName(ym);
      const budget = A.amountInput(val('budget', e.budget || ''), { oninput: keep('budget') });
      const every = h('input', { type: 'checkbox', checked: val('every', !over), onchange: keep('every') });
      const name = h('input', { type: 'text', value: val('name', A.nm(c)), maxLength: 40, oninput: keep('name') });
      const emoji = h('input.emoji-in', { type: 'text', value: val('emoji', c.emoji), maxLength: 8, 'aria-label': A.t('Emoji'), oninput: keep('emoji') });
      const txs = A.month(ym).tx.filter(x => x.type === 'out' && x.ref === c.id).sort((a, b) => a.date < b.date ? 1 : -1);
      const save = () => {
        const b = A.num(budget.value), nm = name.value.trim(), em = emoji.value.trim(), all = every.checked;
        Object.keys(draft).forEach(k => { delete draft[k]; });
        A.commit(s => {
          if (nm && nm !== A.nm(c)) { c.name = nm; delete c.def; }
          if (em) c.emoji = em;
          if (all) { c.budget = b; if (s.budgets[ym]) delete s.budgets[ym][c.id]; }
          else (s.budgets[ym] = s.budgets[ym] || {})[c.id] = b;
        });
        A.toast(A.t('Saved.'));
      };
      const del = () => {
        if (A.state.cats.length < 2) { A.toast(A.t('Keep at least one envelope.')); return; }
        A.confirm(A.t('Delete {name}?', { name: A.nm(c) }), A.t('Spending already logged here moves to another envelope, so your totals stay right.'), A.t('Delete'), () => {
          api.close();
          A.commit(s => {
            s.cats = s.cats.filter(x => x.id !== c.id);
            const to = (s.cats.find(x => x.def === 'Other' || /other|misc/i.test(x.name)) || s.cats[s.cats.length - 1]).id;
            s.tx.forEach(x => { if (x.type === 'out' && x.ref === c.id) x.ref = to; });
            s.rules.forEach(x => { if (x.type === 'out' && x.ref === c.id) x.ref = to; });
            Object.keys(s.budgets).forEach(k => { delete s.budgets[k][c.id]; });
          });
        }, true);
      };
      const v = { spent: A.money(e.spent), month: month, amt: A.money(Math.abs(e.left)) };
      body.append(
        h('p.lead', { text: !e.budget ? A.t('{spent} spent in {month}', v) : e.left >= 0 ? A.t('{spent} spent in {month} · {amt} left', v) : A.t('{spent} spent in {month} · {amt} over', v) }),
        A.meter(e.pct, e.state),
        h('div.form', null, h('div.form-row.emoji-row', null, A.field(A.t('Emoji'), emoji), A.field(A.t('Name'), name)),
          A.field(A.t('Budget for {month}', v), budget), h('label.check', null, every, h('span', { text: A.t('Use this budget every month') }))),
        h('div.actions', null, A.btn(A.t('Add spending'), () => { api.close(); A.addSheet({ ref: c.id, date: ym === curYm() ? A.today() : ym + '-01', more: ym !== curYm() }); }), A.btn(A.t('Save'), save, 'primary')),
        h('h3', { text: A.t('Spending in {month}', v) }),
        txs.length ? h('div.rows', null, txs.map(x => A.txRow(x, { date: true }))) : h('p.quiet', { text: A.t('Nothing logged yet.') }),
        h('button.link.danger', { type: 'button', onclick: del }, A.t('Delete this envelope')));
    }, { live: true });
  };
  A.envNew = () => A.sheet(A.t('New envelope'), (body, api) => {
    const name = h('input', { type: 'text', maxLength: 40, placeholder: A.t('Pets, Kids, Hobbies…') }), emoji = h('input.emoji-in', { type: 'text', value: '📁', maxLength: 8, 'aria-label': A.t('Emoji') });
    const budget = A.amountInput('');
    body.append(h('div.form', null, h('div.form-row.emoji-row', null, A.field(A.t('Emoji'), emoji), A.field(A.t('Name'), name)), A.field(A.t('Monthly budget'), budget)),
      h('div.actions', null, A.btn(A.t('Add envelope'), () => {
        if (!name.value.trim()) { A.toast(A.t('Give it a name.')); return; }
        A.commit(s => { s.cats.push({ id: A.uid(), name: name.value.trim(), emoji: emoji.value.trim() || '📁', budget: A.num(budget.value) }); });
        api.close();
      }, 'primary')));
  });

  /* ---------- Budget ---------- */
  V.budget = function (root) {
    const ym = A.ui.ym || (A.ui.ym = curYm()), m = A.month(ym), env = A.envelopes(ym);
    const set = v => { A.ui.ym = v; A.render(); };
    root.append(A.pageHead(A.t('Budget'), A.t('Give every bit of money a job, then watch the envelopes.'), A.btn(A.t('New envelope'), A.envNew, null, 'plus')));
    root.append(h('div.toolbar', null, A.monthNav(ym, set),
      A.seg([['env', A.t('Envelopes')], ['log', A.t('Everything logged')]], A.ui.budgetTab, v => { A.ui.budgetTab = v; A.render(); }, A.t('View'))));

    if (A.ui.budgetTab === 'log') {
      const list = h('div'), draw = () => {
        const q = A.ui.q.trim().toLowerCase();
        const txs = m.tx.filter(x => !q || (x.name || '').toLowerCase().indexOf(q) >= 0 || A.nm(A.refOf(x.type, x.ref)).toLowerCase().indexOf(q) >= 0)
          .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
        list.replaceChildren(h('p.sub', { text: A.tn(txs.length, '{n} entry · {amt} out|{n} entries · {amt} out', { amt: A.money(A.sum(txs.filter(x => x.type !== 'in'), x => x.amt)) }) }));
        let last = null, rows = null;
        txs.forEach(x => {
          if (x.date !== last) { last = x.date; rows = h('div.rows'); list.append(h('h3.date-head', { text: A.dLong(x.date) }), rows); }
          rows.append(A.txRow(x));
        });
        if (!txs.length) list.append(h('p.quiet', { text: q ? A.t('Nothing matches that.') : A.t('Nothing logged this month yet.') }));
      };
      root.append(h('section.panel', null,
        h('label.search', null, A.icon('search'), h('input', { type: 'search', placeholder: A.t('Search this month'), value: A.ui.q, 'aria-label': A.t('Search this month'), oninput: e => { A.ui.q = e.target.value; draw(); } })),
        list));
      draw();
      return;
    }

    const planned = A.sum(env, e => e.budget) + A.sum(m.items.filter(it => (it.r.type === 'save' || it.r.type === 'debt') && !it.skipped), it => it.r.amt);
    const toJob = A.r2(m.expected + m.roll - planned);
    root.append(h('section.panel', null,
      h('dl.figures', null,
        h('div', null, h('dt', { text: A.t('Coming in') }), h('dd', { text: A.money(m.expected + m.roll) })),
        h('div', null, h('dt', { text: A.t('Gone out') }), h('dd', { text: A.money(m.out) })),
        h('div', null, h('dt', { text: A.t('Still to pay') }), h('dd', { text: A.money(m.dueOut) })),
        h('div.strong', null, h('dt', { text: m.safe < 0 ? A.t('Over by') : A.t('Safe to spend') }), h('dd', { text: A.money(Math.abs(m.safe)) }))),
      h('p.sub', { text: toJob >= 0 ? A.t('{amt} of this month’s money has no job yet.', { amt: A.money(toJob) }) : A.t('Budgets and transfers add up to {amt} more than is coming in.', { amt: A.money(-toJob) }) })));

    const inc = m.tx.filter(x => x.type === 'in'), exp = m.items.filter(it => it.r.type === 'in' && !it.paid && !it.skipped);
    root.append(h('section.panel', null,
      h('div.panel-head', null, h('h2', { text: A.t('Money in') }), h('button.link', { type: 'button', onclick: () => A.addSheet({ type: 'in', date: ym === curYm() ? A.today() : ym + '-01' }) }, A.t('Add income'))),
      h('div.rows', null, inc.map(x => A.txRow(x, { date: true })), exp.map(it => A.itemRow(it, { date: true }))),
      !inc.length && !exp.length ? h('p.quiet', { text: A.t('No income logged for this month.') }) : null));

    root.append(h('section.panel', null,
      h('div.panel-head', null, h('h2', { text: A.t('Envelopes') }),
        h('p.sub', { text: A.t('{amt} left across envelopes', { amt: A.money(A.sum(env, e => Math.max(0, e.left))) }) })),
      h('div.rows', null, env.map(A.envRow))));

    const moves = m.items.filter(it => (it.r.type === 'save' || it.r.type === 'debt') && !it.skipped);
    if (moves.length) root.append(h('section.panel', null,
      h('div.panel-head', null, h('h2', { text: A.t('Savings and debt this month') })), h('div.rows', null, moves.map(it => A.itemRow(it, { date: true })))));

    const note = h('textarea', { rows: 3, maxLength: 2000, placeholder: A.t('Anything worth remembering about this month'), 'aria-label': A.t('Notes for {month}', { month: A.monthName(ym) }), value: A.state.notes[ym] || '', onchange: e => A.commit(s => { s.notes[ym] = e.target.value; }, 'quiet') });
    root.append(h('section.panel.calm-hide', null, h('div.panel-head', null, h('h2', { text: A.t('Notes') })), note));
  };
})(window.App);
