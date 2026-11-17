/* sample.js: the demo budget. Every date is relative to today, so the demo never goes stale.
   It is written in whatever language the app is showing, and it is a family, so every part of the app has something to show. */
'use strict';
(function (A) {
  A.sample = function () {
    const s = A.blank(), t = A.today(), ym = A.ym(t);
    let seed = 20260607;
    const rnd = () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const between = (lo, hi) => Math.round((lo + rnd() * (hi - lo)) * 100) / 100;
    const first = A.addMonths(ym, -5) + '-01';

    s.meta.sample = true; s.meta.onboarded = true;
    s.profile.userName = 'Sam';
    s.profile.household = 'family'; s.profile.split = true;
    s.profile.startMonth = A.ym(first);

    s.cats = [];
    const cat = (name, emoji, budget) => { const c = { id: A.uid(), name: name, emoji: emoji, budget: budget }; s.cats.push(c); return c.id; };
    const C = {
      rent: cat(A.t('Rent'), '🏠', 1450), groc: cat(A.t('Groceries'), '🛒', 420), eat: cat(A.t('Eating out'), '🍜', 180),
      coffee: cat(A.t('Coffee'), '☕', 45), trans: cat(A.t('Transport'), '🚌', 140), bills: cat(A.t('Bills'), '💡', 180),
      fun: cat(A.t('Fun'), '🎈', 80), shop: cat(A.t('Shopping'), '🛍️', 90), subs: cat(A.t('Subscriptions'), '📺', 45),
      health: cat(A.t('Health'), '🩺', 60), other: cat(A.t('Other'), '📦', 60)
    };

    const fund = (name, emoji, target, base, due) => { const f = { id: A.uid(), name: name, emoji: emoji, target: target, base: base, due: due || '' }; s.funds.push(f); return f.id; };
    const F = {
      cushion: fund(A.t('Emergency cushion'), '☔', 6000, 1400),
      trip: fund(A.t('Trip to Portugal'), '✈️', 3000, 450, A.addMonths(ym, 7) + '-01'),
      laptop: fund(A.t('New laptop'), '💻', 1200, 300)
    };
    const debt = (name, emoji, base, apr, min) => { const d = { id: A.uid(), name: name, emoji: emoji, base: base, apr: apr, min: min }; s.debts.push(d); return d.id; };
    const D = { card: debt(A.t('Credit card'), '💳', 3950, 22.9, 150), car: debt(A.t('Car loan'), '🚗', 14350, 6.5, 310), student: debt(A.t('Student loan'), '🎓', 10000, 4.5, 120) };

    const rule = (name, type, amt, freq, start, o) => {
      const r = Object.assign({ id: A.uid(), name: name, type: type, amt: amt, freq: freq, start: start, ref: null, auto: false, remind: null, skips: [] }, o || {});
      s.rules.push(r); return r;
    };
    const on = day => first.slice(0, 8) + A.pad(day);
    rule(A.t('Paycheck'), 'in', 2100, 'biweekly', A.addDays(t, 4 - 14 * 11), { auto: true, remind: 0 });
    rule(A.t('Rent'), 'out', 1450, 'monthly', on(1), { ref: C.rent, remind: 1 });
    rule(A.t('Internet'), 'out', 60, 'monthly', on(10), { ref: C.bills, auto: true });
    rule(A.t('Phone'), 'out', 45, 'monthly', on(12), { ref: C.bills, auto: true });
    rule(A.t('Electricity'), 'out', 75, 'monthly', on(18), { ref: C.bills, remind: 3 });
    rule(A.t('Music'), 'out', 11, 'monthly', on(5), { ref: C.subs, auto: true });
    rule(A.t('Streaming'), 'out', 18, 'monthly', on(20), { ref: C.subs, auto: true });
    rule(A.t('Gym'), 'out', 45, 'monthly', on(25), { ref: C.health, auto: true });
    rule(A.t('Emergency cushion'), 'save', 200, 'monthly', on(16), { ref: F.cushion, auto: true });
    rule(A.t('Trip fund'), 'save', 150, 'monthly', on(16), { ref: F.trip, auto: true });
    rule(A.t('Credit card payment'), 'debt', 150, 'monthly', on(8), { ref: D.card, remind: 1 });
    rule(A.t('Car loan'), 'debt', 310, 'monthly', on(8), { ref: D.car, auto: true });
    rule(A.t('Student loan'), 'debt', 120, 'monthly', on(8), { ref: D.student, auto: true });
    rule(A.t('Car insurance'), 'out', 640, 'yearly', A.addDays(t, 40), { ref: C.trans, remind: 7 });
    const late = rule(A.t('Dentist bill'), 'out', 85, 'once', A.addDays(t, -2), { ref: C.health, remind: 0 });
    rule(A.t('Renew car registration'), 'note', 0, 'once', A.addDays(t, 3), { remind: 3 });
    rule(A.t('Mum’s birthday: send a gift'), 'note', 0, 'once', A.addDays(t, 6), { remind: 1 });

    /* history: everything scheduled before today happened, except the dentist bill */
    s.rules.forEach(r => {
      if (r === late || r.type === 'note') return;
      A.occ(r, first, A.addDays(t, -1)).forEach(d => {
        s.tx.push({ id: A.uid(), date: d, amt: r.amt, type: r.type, ref: r.ref, name: r.name, rid: r.id, occ: d });
      });
    });

    /* a family: two adults and a child with pocket money. The ids are fixed so "who am I on this device" survives a change of language. */
    const sam = { id: 'p-sam', name: 'Sam', emoji: '🦊', kind: 'adult' }, alex = { id: 'p-alex', name: 'Alex', emoji: '🌸', kind: 'adult' };
    const mia = { id: 'p-mia', name: 'Mia', emoji: '🧒', kind: 'child', allowance: 20 };
    s.people = [sam, alex, mia];

    /* everyday spending */
    const spend = (d, ref, names, lo, hi) => s.tx.push({ id: A.uid(), date: d, amt: between(lo, hi), type: 'out', ref: ref, name: pick(names), who: rnd() < 0.56 ? sam.id : alex.id });
    const N = {
      groc: [A.t('Local market'), A.t('Supermarket'), A.t('Corner shop'), A.t('Farmers market')],
      eat: [A.t('Burger spot'), A.t('Brunch'), A.t('Pizza night'), A.t('Thai takeaway'), A.t('Lunch out'), A.t('Tacos')],
      coffee: [A.t('Coffee'), A.t('Latte'), A.t('Corner cafe')],
      trans: [A.t('Gas'), A.t('Bus fare'), A.t('Rideshare'), A.t('Parking')],
      fun: [A.t('Cinema'), A.t('Bowling'), A.t('Concert ticket'), A.t('New game')],
      shop: [A.t('Work trousers'), A.t('Shoes'), A.t('Books'), A.t('Home bits')],
      health: [A.t('Pharmacy'), A.t('Vitamins')],
      other: [A.t('Post office'), A.t('Key cutting'), A.t('Donation')]
    };
    let nextGroc = 2;
    for (let d = first; d < t; d = A.addDays(d, 1)) {
      if (--nextGroc <= 0) { spend(d, C.groc, N.groc, 28, 96); nextGroc = 4 + Math.floor(rnd() * 3); }
      if (rnd() < 0.19) spend(d, C.eat, N.eat, 11, 58);
      if (rnd() < 0.34) spend(d, C.coffee, N.coffee, 3.5, 6.5);
      if (rnd() < 0.15) spend(d, C.trans, N.trans, 3, 52);
      if (rnd() < 0.07) spend(d, C.fun, N.fun, 9, 42);
      if (rnd() < 0.05) spend(d, C.shop, N.shop, 14, 88);
      if (rnd() < 0.03) spend(d, C.health, N.health, 7, 34);
      if (rnd() < 0.04) spend(d, C.other, N.other, 5, 36);
    }
    /* today always opens the same way: one small coffee, most of the day's share still there */
    s.tx.push({ id: A.uid(), date: t, amt: 4.5, type: 'out', ref: C.coffee, name: A.t('Coffee'), who: sam.id });
    /* pocket money: on the days just before today, and only inside this month */
    [[1, 6.5, C.fun, A.t('Comics')], [2, 3.2, C.other, A.t('Sweets')], [9, 4, C.fun, A.t('Stickers')]].forEach(e => {
      const d = A.addDays(t, -e[0]);
      if (A.ym(d) === ym) s.tx.push({ id: A.uid(), date: d, amt: e[1], type: 'out', ref: e[2], name: e[3], who: mia.id });
    });

    s.goals = [
      { id: A.uid(), title: A.t('Pay off the credit card'), status: 1, due: A.addMonths(ym, 13) + '-01', note: A.t('Adding a little extra on top of the minimum.') },
      { id: A.uid(), title: A.t('Build a 3-month cushion'), status: 1, due: '', note: '' },
      { id: A.uid(), title: A.t('Take the trip without using credit'), status: 0, due: A.addMonths(ym, 7) + '-01', note: '' },
      { id: A.uid(), title: A.t('Cancel two unused subscriptions'), status: 2, due: '', note: '' }
    ];
    s.pause = [
      { id: A.uid(), name: A.t('Noise-cancelling headphones'), price: 179, at: Date.now() - 50 * 36e5, hours: 48, done: null },
      { id: A.uid(), name: A.t('Standing desk'), price: 320, at: Date.now() - 20 * 36e5, hours: 72, done: null },
      { id: A.uid(), name: A.t('Air fryer'), price: 95, at: Date.now() - 400 * 36e5, hours: 48, done: 'skipped' }
    ];
    s.notes[ym] = A.t('Car insurance is due next month. Setting a little aside now.');
    s.checkins = [0, 1, 3, 4, 6].map(n => A.addDays(t, -n));
    s.profile.extra = 50;
    return s;
  };

  /* The demo again in the language now showing, keeping how the visitor has set the app up. */
  A.resample = function () {
    const old = A.state, s = A.sample();
    A.LOOK_KEYS.concat(['appName', 'icon', 'iconImg', 'currency', 'weekStart', 'household', 'split', 'splitPct']).forEach(k => { s.profile[k] = old.profile[k]; });
    s.people.forEach(p => { const o = A.by(old.people, p.id); if (o && o.look) p.look = o.look; });
    return s;
  };
})(window.App);
