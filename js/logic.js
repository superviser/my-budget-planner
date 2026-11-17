/* logic.js: repeating items, month maths, safe-to-spend, household, debt payoff, reminders, exports */
'use strict';
(function (A) {
  const pad = A.pad, T = A.T;

  A.FREQS = [['once', T('Just once')], ['weekly', T('Every week')], ['biweekly', T('Every 2 weeks')], ['monthly', T('Every month')], ['yearly', T('Every year')]];
  A.PER_YEAR = { once: 0, weekly: 52, biweekly: 26, monthly: 12, yearly: 1 };
  A.TYPES = [['out', T('Bill or spending')], ['in', T('Income')], ['save', T('Savings transfer')], ['debt', T('Debt payment')], ['note', T('Reminder only')]];
  A.REMIND = [['', T('No reminder')], ['0', T('On the day')], ['1', T('1 day before')], ['3', T('3 days before')], ['7', T('A week before')]];
  /* option lists are defined once in English and translated when they are shown */
  A.opts = list => list.map(o => [o[0], A.t(o[1])]);

  /* ---------- repeating rules ---------- */
  /* Dates on which rule r falls inside [from, to], inclusive.
     r.from: occurrences before it do not count (set when a schedule is changed, so the past is not re-opened).
     r.dom:  the day of the month that was meant, when the first date had to be clamped (the 31st, set up in a 30-day month). */
  A.occ = function (r, from, to) {
    const out = [];
    if (r.end && r.end < to) to = r.end;
    if (r.from && r.from > from) from = r.from;
    if (!r.start || r.start > to || from > to) return out;
    if (r.freq === 'once') { if (r.start >= from) out.push(r.start); return out; }
    if (r.freq === 'weekly' || r.freq === 'biweekly') {
      const step = r.freq === 'weekly' ? 7 : 14;
      let d = r.start;
      if (d < from) d = A.addDays(d, Math.ceil(A.diff(d, from) / step) * step);
      for (; d <= to; d = A.addDays(d, step)) out.push(d);
      return out;
    }
    const day = r.dom || +r.start.slice(8);
    if (r.freq === 'monthly') {
      let ym = A.ym(from > r.start ? from : r.start);
      for (let i = 0; i < 1300; i++, ym = A.addMonths(ym, 1)) {
        const d = ym + '-' + pad(Math.min(day, A.monthDays(ym)));
        if (d > to) break;
        if (d >= from && d >= r.start) out.push(d);
      }
      return out;
    }
    for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) {
      const ym = y + r.start.slice(4, 7), d = ym + '-' + pad(Math.min(day, A.monthDays(ym)));
      if (d >= from && d <= to && d >= r.start) out.push(d);
    }
    return out;
  };

  const paidIdx = () => A.memo('paid', () => {
    const m = {};
    A.state.tx.forEach(x => { if (x.rid) m[x.rid + '@' + x.occ] = x; });
    return m;
  });

  /* Every scheduled thing in a date range, with whether it is done. */
  A.items = function (from, to) {
    return A.memo('it' + from + to, () => {
      const idx = paidIdx(), list = [];
      A.state.rules.forEach(r => A.occ(r, from, to).forEach(d => {
        const tx = idx[r.id + '@' + d] || null;
        list.push({
          r: r, date: d, tx: tx, key: r.id + '@' + d,
          paid: r.type === 'note' ? (r.done || []).indexOf(d) >= 0 : !!tx,
          skipped: (r.skips || []).indexOf(d) >= 0
        });
      }));
      const rank = { in: 0, note: 1, out: 2, debt: 3, save: 4 };
      return list.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : rank[a.r.type] - rank[b.r.type]);
    });
  };

  /* A payment made early is dated today. One made late is dated on its due date while still in the same month,
     and today when the due date was in an earlier month, because that is the month the money actually left in. */
  const txFor = (it, t) => ({
    id: A.uid(), date: it.date > t || A.ym(it.date) < A.ym(t) ? t : it.date, amt: it.r.amt, type: it.r.type,
    ref: it.r.ref || null, name: it.r.name, rid: it.r.id, occ: it.date
  });
  A.txFor = txFor;
  const dropSkip = (r, d) => { r.skips = (r.skips || []).filter(x => x !== d); };
  A.pay = function (it) {
    A.commit(s => {
      dropSkip(it.r, it.date);
      if (it.r.type === 'note') { if ((it.r.done = it.r.done || []).indexOf(it.date) < 0) it.r.done.push(it.date); }
      else if (!s.tx.some(x => x.rid === it.r.id && x.occ === it.date)) s.tx.push(txFor(it, A.today()));
    });
  };
  /* Un-ticking something that logs itself also marks it skipped; otherwise it would be logged again on the next start. */
  A.unpay = function (it) {
    A.commit(s => {
      if (it.r.type === 'note') it.r.done = (it.r.done || []).filter(d => d !== it.date);
      else {
        s.tx = s.tx.filter(x => !(x.rid === it.r.id && x.occ === it.date));
        if (it.r.auto && (it.r.skips = it.r.skips || []).indexOf(it.date) < 0) it.r.skips.push(it.date);
      }
    });
  };
  A.skip = it => A.commit(() => { if ((it.r.skips = it.r.skips || []).indexOf(it.date) < 0) it.r.skips.push(it.date); });
  A.unskip = it => A.commit(() => { dropSkip(it.r, it.date); });

  /* Log everything marked "happens automatically" whose day has arrived. */
  A.autopost = function () {
    const t = A.today(), add = [];
    A.items(A.addDays(t, -62), t).forEach(it => {
      if (it.r.auto && !it.paid && !it.skipped && it.r.type !== 'note') add.push(txFor(it, t));
    });
    if (add.length) A.commit(s => { add.forEach(x => s.tx.push(x)); }, 'auto');
    return add.length;
  };

  /* ---------- a month, summed up ---------- */
  /* Money carried into a month: the starting balance in the month the buyer started, plus last month's leftover when rollover is on. */
  A.carry = ym => A.memo('carry' + ym, () => {
    const p = A.state.profile, start = p.startMonth || A.ym(A.today());
    let c = ym === start ? (p.startBal || 0) : 0;
    /* never look further back than the start, or than ten years: one mistyped date must not send this spinning */
    if (p.rollover && ym > start && ym > A.addMonths(A.ym(A.today()), -120)) {
      const prev = A.month(A.addMonths(ym, -1));
      c += Math.max(0, prev.inc + prev.roll - prev.out);
    }
    return c;
  });

  A.month = ym => A.memo('m' + ym, () => {
    const t = A.today(), cur = A.ym(t), from = ym + '-01', to = A.monthEnd(ym);
    const s = { ym: ym, inc: 0, spent: 0, saved: 0, debt: 0, byCat: {}, byRef: {}, tx: [], dueIn: 0, dueOut: 0, dueList: [] };
    A.state.tx.forEach(x => {
      if (x.date < from || x.date > to) return;
      s.tx.push(x);
      if (x.type === 'in') s.inc += x.amt;
      else if (x.type === 'out') { s.spent += x.amt; s.byCat[x.ref] = (s.byCat[x.ref] || 0) + x.amt; }
      else if (x.type === 'save') { s.saved += x.amt; s.byRef[x.ref] = (s.byRef[x.ref] || 0) + x.amt; }
      else if (x.type === 'debt') { s.debt += x.amt; s.byRef[x.ref] = (s.byRef[x.ref] || 0) + x.amt; }
    });
    s.items = A.items(from, to);
    const due = it => {
      if (it.paid || it.skipped || it.r.type === 'note') return;
      if (it.r.type === 'in') s.dueIn += it.r.amt;
      else { s.dueOut += it.r.amt; s.dueList.push(it); }
    };
    s.items.forEach(due);
    /* a bill from last month that is still unpaid has to come out of this month's money */
    if (ym === cur) A.items(A.addDays(from, -45), A.addDays(from, -1)).forEach(it => { if (it.r.type !== 'in') due(it); });
    s.roll = A.carry(ym);
    s.out = s.spent + s.saved + s.debt;
    s.expected = s.inc + s.dueIn;
    /* Safe to spend: what is coming in, minus what has gone out, minus what is still owed. */
    s.safe = A.r2(s.expected + s.roll - s.out - s.dueOut);
    s.daysLeft = ym === cur ? A.diff(t, to) + 1 : ym > cur ? A.monthDays(ym) : 0;
    s.perDay = s.daysLeft ? s.safe / s.daysLeft : 0;
    return s;
  });

  A.now = () => A.memo('now', () => {
    const t = A.today(), m = A.month(A.ym(t));
    const spentToday = A.sum(A.state.tx.filter(x => x.date === t && x.type === 'out' && !x.rid), x => x.amt);
    const share = m.daysLeft ? (m.safe + spentToday) / m.daysLeft : 0;
    return { t: t, m: m, spentToday: spentToday, share: share, leftToday: share - spentToday };
  });

  A.nextPay = () => A.memo('nextpay', () => {
    const t = A.today();
    return A.items(t, A.addDays(t, 62)).find(it => it.r.type === 'in' && !it.paid && !it.skipped) || null;
  });

  /* ---------- envelopes ---------- */
  A.budgetOf = (cat, ym) => {
    const o = A.state.budgets[ym];
    return o && o[cat.id] != null ? o[cat.id] : (cat.budget || 0);
  };
  A.envelopes = ym => A.memo('env' + ym, () => {
    const m = A.month(ym);
    return A.state.cats.map(c => {
      const budget = A.budgetOf(c, ym), spent = m.byCat[c.id] || 0;
      const due = A.sum(m.dueList.filter(it => it.r.type === 'out' && it.r.ref === c.id), it => it.r.amt);
      const pct = budget ? spent / budget : (spent ? 2 : 0), left = A.r2(budget - spent);
      return { c: c, ym: ym, budget: budget, spent: spent, due: due, left: left, pct: pct, state: !budget && !spent ? 'none' : left < 0 ? 'over' : left === 0 ? 'full' : pct >= 0.85 ? 'near' : 'ok' };
    });
  });
  A.envState = { none: T('No budget set'), ok: T('On track'), near: T('Nearly used'), full: T('Used as planned'), over: T('Over') };

  A.fundBal = f => A.memo('fund' + f.id, () => A.r2((f.base || 0) + A.sum(A.state.tx.filter(x => x.type === 'save' && x.ref === f.id), x => x.amt)));
  A.debtPaid = d => A.memo('dpaid' + d.id, () => A.sum(A.state.tx.filter(x => x.type === 'debt' && x.ref === d.id), x => x.amt));
  A.debtBal = d => Math.max(0, A.r2((d.base || 0) - A.debtPaid(d)));

  /* ---------- household: just me, two of us, or a family ---------- */
  A.members = () => {
    const s = A.state;
    if (s.profile.household === 'solo') return [];
    return s.profile.household === 'family' ? s.people : s.people.filter(p => p.kind !== 'child');
  };
  A.shared = () => A.members().length > 1;
  /* Who is holding this device. Kept per device, never synced, so two phones can share one budget. */
  A.meId = null;
  A.me = () => { const ms = A.members(); return A.by(ms, A.meId) || ms.find(p => p.kind !== 'child') || ms[0] || null; };
  A.setHousehold = kind => A.commit(s => {
    s.profile.household = kind;
    if (kind === 'solo') return;
    if (!s.people.some(p => p.kind !== 'child')) s.people.unshift({ id: A.uid(), name: s.profile.userName || A.t('Me'), emoji: '🦊', kind: 'adult' });
    if (s.people.filter(p => p.kind !== 'child').length < 2) s.people.push({ id: A.uid(), name: A.t('Partner'), emoji: '🌸', kind: 'adult' });
    if (kind === 'family' && !s.people.some(p => p.kind === 'child')) s.people.push({ id: A.uid(), name: A.t('Child'), emoji: '🧒', kind: 'child', allowance: 0 });
  });
  A.byPerson = ym => A.memo('who' + ym, () => {
    const out = {};
    A.month(ym).tx.forEach(x => { if (x.type === 'out') out[x.who || ''] = (out[x.who || ''] || 0) + x.amt; });
    return out;
  });
  /* Everything one month says about each person: total, where it went, and the entries themselves. */
  A.peopleMonth = ym => A.memo('people' + ym, () => {
    const m = A.month(ym), ms = A.members(), ids = ms.map(p => p.id), total = A.sum(m.tx.filter(x => x.type === 'out'), x => x.amt);
    const rows = ms.map(p => {
      const tx = m.tx.filter(x => x.type === 'out' && x.who === p.id).sort((a, b) => (a.date < b.date ? 1 : -1)), cats = {};
      tx.forEach(x => { cats[x.ref] = (cats[x.ref] || 0) + x.amt; });
      const spent = A.sum(tx, x => x.amt);
      return { p: p, spent: spent, share: total ? spent / total : 0, tx: tx,
        cats: Object.keys(cats).map(id => ({ c: A.by(A.state.cats, id), v: cats[id] })).filter(x => x.c).sort((a, b) => b.v - a.v) };
    });
    const nobody = m.tx.filter(x => x.type === 'out' && ids.indexOf(x.who) < 0);
    return { rows: rows, total: total, nobody: A.sum(nobody, x => x.amt), nobodyTx: nobody };
  });
  /* For couples who split: who passes how much to whom to be even this month. Only entries with a name count. */
  A.settle = ym => {
    const p = A.state.profile, adults = A.members().filter(x => x.kind !== 'child');
    if (!p.split || adults.length !== 2) return null;
    const w = A.byPerson(ym), a = w[adults[0].id] || 0, b = w[adults[1].id] || 0;
    const diff = A.r2(a - (a + b) * (p.splitPct == null ? 50 : p.splitPct) / 100);
    if (Math.abs(diff) < 0.5) return { even: true };
    return { from: diff > 0 ? adults[1] : adults[0], to: diff > 0 ? adults[0] : adults[1], amt: Math.abs(diff) };
  };

  /* ---------- things that need a decision ---------- */
  /* Recomputed every minute as well as on every change, so a pause that has just run out shows up by itself. */
  A.attention = () => {
    const min = Math.floor(Date.now() / 60000), c = A.cache.att;
    if (c && c.min === min) return c.val;
    const t = A.today(), out = [];
    A.items(A.addDays(t, -45), t).forEach(it => {
      if (!it.paid && !it.skipped && !(it.r.auto && it.r.type !== 'note')) out.push({ kind: it.date < t ? 'late' : 'today', it: it });
    });
    A.state.pause.forEach(p => { if (!p.done && p.at + p.hours * 36e5 <= Date.now()) out.push({ kind: 'pause', p: p }); });
    A.cache.att = { min: min, val: out };
    return out;
  };

  /* ---------- gentle rhythm instead of a breakable streak ---------- */
  A.checkin = function () {
    const t = A.today(), s = A.state;
    s.meta.awayDays = s.meta.lastOpen ? Math.max(0, A.diff(s.meta.lastOpen, t)) : 0;
    if (s.checkins.indexOf(t) < 0) { s.checkins.push(t); if (s.checkins.length > 400) s.checkins.splice(0, s.checkins.length - 400); }
    s.meta.lastOpen = t;
  };
  A.rhythm = () => {
    const t = A.today(), days = [];
    for (let i = 6; i >= 0; i--) { const d = A.addDays(t, -i); days.push({ d: d, on: A.state.checkins.indexOf(d) >= 0 }); }
    return { days: days, n: days.filter(x => x.on).length };
  };

  /* ---------- insights ---------- */
  A.yearlyBills = () => A.sum(A.state.rules.filter(r => r.type === 'out' && !(r.end && r.end < A.today())), r => r.amt * A.PER_YEAR[r.freq]);
  A.insights = function () {
    const t = A.today(), ym = A.ym(t), out = [], prev = A.addMonths(ym, -1);
    const cut = prev + '-' + pad(Math.min(+t.slice(8), A.monthDays(prev)));
    const spentUntil = (m, to) => A.sum(A.month(m).tx.filter(x => x.type === 'out' && x.date <= to), x => x.amt);
    const a = spentUntil(ym, t), b = spentUntil(prev, cut);
    if (b > 20 && a > 0) {
      const p = Math.round((a - b) / b * 100);
      if (p <= -5) out.push({ tone: 'good', text: A.t('Spending is {pct}% lower than at this point last month.', { pct: -p }) });
      else if (p >= 5) out.push({ tone: 'info', text: A.t('Spending is {pct}% higher than at this point last month.', { pct: p }) });
    }
    A.envelopes(ym).forEach(e => {
      if (e.state === 'over') out.push({ tone: 'warn', text: A.t('{name} is {amt} over. Nothing breaks: it comes out of safe-to-spend.', { name: A.nm(e.c), amt: A.money(-e.left) }) });
      else if (e.state === 'near') out.push({ tone: 'info', text: A.t('{name} has {amt} left this month.', { name: A.nm(e.c), amt: A.money(e.left) }) });
    });
    const yb = A.yearlyBills();
    if (yb > 0) out.push({ tone: 'info', text: A.t('Your repeating bills add up to {amt} a year.', { amt: A.money(yb, { whole: true }) }) });
    return out.slice(0, 4);
  };

  /* ---------- quick add: "coffee 4.50" ---------- */
  const HINTS = {
    grocer: 'grocery groceries market supermarket food aldi lidl walmart costco tesco bread milk',
    eating: 'lunch dinner breakfast brunch pizza burger restaurant takeaway takeout cafe coffee latte sushi kebab snack',
    transport: 'gas fuel petrol uber lyft taxi bus train metro parking ticket fare',
    bill: 'electric electricity water internet phone utility utilities heating',
    fun: 'cinema movie movies game games concert bar drinks beer club',
    shop: 'clothes shoes amazon shirt jeans gift present',
    health: 'pharmacy doctor dentist medicine vitamins',
    subscri: 'netflix spotify subscription disney youtube icloud'
  };
  const wordsOf = s => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2);
  A.guessCat = function (name) {
    const n = String(name || '').trim().toLowerCase(), cats = A.state.cats;
    if (!n) return null;
    for (let i = A.state.tx.length - 1; i >= 0; i--) {
      const x = A.state.tx[i];
      if (x.type === 'out' && x.name && x.name.toLowerCase() === n && A.by(cats, x.ref)) return x.ref;
    }
    /* whole words only: "the station" must not match "Other", "her" must not match anything */
    const words = wordsOf(n), same = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.indexOf(b) === 0 || b.indexOf(a) === 0));
    let hit = cats.find(c => wordsOf(A.nm(c)).some(cw => words.some(w => same(w, cw))));
    if (hit) return hit.id;
    for (const key in HINTS) {
      if (words.some(w => HINTS[key].split(' ').indexOf(w) >= 0)) {
        hit = cats.find(c => (c.def || c.name).toLowerCase().indexOf(key) >= 0);
        if (hit) return hit.id;
      }
    }
    return null;
  };
  A.fallbackCat = () => (A.state.cats.find(c => c.def === 'Other' || /other|misc/i.test(c.name)) || A.state.cats[A.state.cats.length - 1] || {}).id || null;
  /* The amount is the last number in the line, written any usual way: 4.50, 4,50, 1,200, 1.200,50 */
  A.parseQuick = function (text) {
    const m = String(text).match(/(\d[\d.,]*\d|\d)(?!.*\d)/);
    if (!m) return null;
    const amt = A.num(m[1]);
    if (!amt) return null;
    const name = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/[$€£¥]/g, '').replace(/\s+/g, ' ').trim();
    return { amt: amt, name: name };
  };

  A.addTx = function (t) {
    const x = Object.assign({ id: A.uid(), date: A.today(), type: 'out', ref: null, name: '' }, t);
    x.amt = Math.abs(A.r2(x.amt));
    x.date = A.okDate(x.date);
    if (x.who === undefined && A.shared()) { const me = A.me(); if (me) x.who = me.id; }
    if (!x.who) delete x.who;
    A.commit(s => { s.tx.push(x); });
    return x;
  };
  /* Deleting an entry that a rule logged by itself also marks that date skipped, so it is not logged again.
     Returns what is needed to put everything back. */
  A.delTx = function (id) {
    const x = A.by(A.state.tx, id);
    if (!x) return null;
    const r = x.rid ? A.by(A.state.rules, x.rid) : null, addSkip = !!(r && r.auto && (r.skips || []).indexOf(x.occ) < 0);
    A.commit(s => {
      s.tx = s.tx.filter(y => y.id !== id);
      if (addSkip) (r.skips = r.skips || []).push(x.occ);
    });
    return { undo: () => A.commit(s => { s.tx.push(x); if (addSkip) r.skips = (r.skips || []).filter(d => d !== x.occ); }) };
  };

  /* ---------- debt payoff simulation ---------- */
  A.payoff = function (debts, extra, strategy) {
    const ds = debts.map(d => ({ id: d.id, bal: A.debtBal(d), apr: +d.apr || 0, min: +d.min || 0 })).filter(d => d.bal > 0);
    const order = ds.slice().sort(strategy === 'snowball' ? (a, b) => a.bal - b.bal : (a, b) => b.apr - a.apr).map(d => d.id);
    let months = 0, interest = 0;
    const done = {};
    while (ds.some(d => d.bal > 0.005) && months < 600) {
      months++;
      let pool = +extra || 0;
      ds.forEach(d => {
        if (d.bal <= 0.005) { pool += d.min; return; }
        const i = d.bal * d.apr / 1200;
        interest += i; d.bal += i;
        const p = Math.min(d.min, d.bal);
        d.bal -= p; pool += d.min - p;
      });
      order.forEach(id => {
        const d = A.by(ds, id);
        if (d.bal > 0.005 && pool > 0) { const p = Math.min(pool, d.bal); d.bal -= p; pool -= p; }
      });
      ds.forEach(d => { if (d.bal <= 0.005 && !done[d.id]) done[d.id] = months; });
    }
    return { months: months, interest: interest, done: done, order: order, stuck: months >= 600 };
  };
  A.monthsFromNow = n => A.monthName(A.addMonths(A.ym(A.today()), n));

  /* ---------- reminders: one schedule feeds the page, the service worker and the optional cloud ---------- */
  A.schedule = function () {
    const s = A.state, t = A.today(), now = Date.now(), out = [], raw = { raw: true };
    const hm = (s.profile.remindAt || '09:00').split(':').map(Number);
    const at = (d, h, m) => { const x = A.date(d); x.setHours(h, m, 0, 0); return x.getTime(); };
    A.items(t, A.addDays(t, 75)).forEach(it => {
      const r = it.r;
      if (r.remind == null || r.remind === '' || it.paid || it.skipped) return;
      const lead = +r.remind, when = at(A.addDays(it.date, -lead), hm[0], hm[1]);
      if (when < now - 6 * 36e5) return;
      const day = lead === 0 ? A.t('today') : lead === 1 ? A.t('tomorrow') : A.tn(lead, 'in {n} day|in {n} days');
      const v = { name: r.name, when: day, amt: r.amt ? A.money(r.amt, raw) : '' };
      out.push({
        id: it.key, at: when,
        title: r.type === 'in' ? A.t('{name} arrives {when}', v) : r.type === 'note' ? A.t('{name} ({when})', v) : A.t('{name} is due {when}', v),
        body: r.type === 'note' ? A.t('A reminder you set.') : r.auto ? A.t('{amt}. It will be logged for you.', v) : A.t('{amt}. Open to mark it done.', v)
      });
    });
    s.pause.forEach(p => {
      const when = p.at + p.hours * 36e5;
      if (!p.done && when > now - 6 * 36e5) out.push({ id: 'pause' + p.id, at: when, title: A.t('Your pause on “{name}” is over', { name: p.name }), body: A.t('Still want it? {amt}. Open to decide.', { amt: A.money(p.price, raw) }) });
    });
    if (s.profile.nudge) for (let i = 0; i < 14; i++) {
      const d = A.addDays(t, i), when = at(d, 20, 0);
      if (when > now) out.push({ id: 'nudge' + d, at: when, title: A.t('10-second check-in'), body: A.t('Anything to log from today?') });
    }
    return out.sort((a, b) => a.at - b.at);
  };

  /* ---------- calendar file with alarms: reminders that work on every phone ---------- */
  A.ics = function () {
    const esc = v => String(v).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', t = A.today();
    const hm = (A.state.profile.remindAt || '09:00').split(':').map(Number);
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Budget Planner//EN', 'CALSCALE:GREGORIAN'];
    let rules = A.state.rules.filter(r => !(r.end && r.end < t) && !(r.freq === 'once' && r.start < t));
    if (rules.some(r => r.remind != null && r.remind !== '')) rules = rules.filter(r => r.remind != null && r.remind !== '');
    /* "the 30th, or the last day when the month is shorter", the way the app itself counts */
    const days = n => (n >= 31 ? 'BYMONTHDAY=-1' : n >= 29 ? 'BYMONTHDAY=' + Array.from({ length: n - 27 }, (_, i) => 28 + i).join(',') + ';BYSETPOS=-1' : '');
    rules.forEach(r => {
      const day = r.dom || +r.start.slice(8), lead = r.remind == null || r.remind === '' ? 0 : +r.remind;
      const mins = hm[0] * 60 + hm[1] - lead * 1440;
      L.push('BEGIN:VEVENT', 'UID:' + r.id + '@budget-planner', 'DTSTAMP:' + stamp,
        'DTSTART;VALUE=DATE:' + r.start.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + A.addDays(r.start, 1).replace(/-/g, ''));
      const until = r.end ? ';UNTIL=' + r.end.replace(/-/g, '') : '', by = days(day);
      if (r.freq === 'weekly') L.push('RRULE:FREQ=WEEKLY' + until);
      if (r.freq === 'biweekly') L.push('RRULE:FREQ=WEEKLY;INTERVAL=2' + until);
      if (r.freq === 'monthly') L.push('RRULE:FREQ=MONTHLY' + (by ? ';' + by : '') + until);
      if (r.freq === 'yearly') L.push('RRULE:FREQ=YEARLY' + (by ? ';BYMONTH=' + (+r.start.slice(5, 7)) + ';' + by : '') + until);
      L.push('SUMMARY:' + esc(r.name + (r.amt ? ' (' + A.money(r.amt, { raw: true }) + ')' : '')), 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(r.name),
        'TRIGGER:' + (mins < 0 ? '-PT' + (-mins) : 'PT' + mins) + 'M', 'END:VALARM', 'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return { text: L.join('\r\n'), count: rules.length };
  };

  /* every money entry as a row, oldest first, under a row of headings: for the spreadsheet export and for the Google Sheet */
  A.txTable = function () {
    const label = x => x.type === 'out' ? A.nm(A.by(A.state.cats, x.ref)) : x.type === 'save' ? A.nm(A.by(A.state.funds, x.ref)) : x.type === 'debt' ? A.nm(A.by(A.state.debts, x.ref)) : A.t('Income');
    const kind = { out: A.t('Spending'), in: A.t('Income'), save: A.t('Savings'), debt: A.t('Debt payment') };
    const who = x => (A.by(A.state.people, x.who) || {}).name || '';
    return [[A.t('Date'), A.t('Type'), A.t('Category'), A.t('Name'), A.t('Amount'), A.t('Person'), A.t('Note')]].concat(
      A.state.tx.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(x => [x.date, kind[x.type], label(x) || '', x.name, x.amt, who(x), x.note || '']));
  };
  A.csv = function () {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    return A.txTable().map((r, i) => (i ? [r[0], q(r[1]), q(r[2]), q(r[3]), r[4], q(r[5]), q(r[6])] : r.map(q)).join(',')).join('\r\n');
  };
})(window.App);
