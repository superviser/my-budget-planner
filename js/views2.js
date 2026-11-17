/* views2.js: Plan, Savings and goals, Debt, Pause list, Review, Who spent what */
'use strict';
(function (A) {
  const h = A.h, V = A.views;
  const curYm = () => A.ym(A.today());
  const MARKS = [['in', A.T('Income')], ['out', A.T('Bill')], ['save', A.T('Savings')], ['debt', A.T('Debt')], ['note', A.T('Reminder')]];
  const mark = it => h('i.mark', { 'data-type': it.r.type, 'data-done': it.paid ? '1' : null });
  const monthYear = d => A.fmt(d, { month: 'short', year: 'numeric' });

  /* ---------- Plan ---------- */
  function ruleRow(r) {
    const t = A.today(), next = A.occ(r, t, A.addDays(t, 400))[0], freq = A.t((A.FREQS.find(f => f[0] === r.freq) || ['', ''])[1]);
    const meta = [freq, next ? A.t('next {date}', { date: A.dShort(next) }) : A.t('finished')];
    if (r.auto && r.type !== 'note') meta.push(A.t('automatic'));
    return h('button.row.row-btn', { type: 'button', onclick: () => A.ruleSheet(r) },
      h('span.row-main', null, h('span.row-title', null, r.name, r.remind != null && r.remind !== '' ? h('span.inline-ic', { title: A.t('Reminder on') }, A.icon('bell')) : null),
        h('span.row-meta', { text: meta.join(' · ') })),
      r.type === 'note' ? null : h('span.row-amt' + (r.type === 'in' ? '.in' : ''), { text: (r.type === 'in' ? '+' : '') + A.money(r.amt) }));
  }
  A.exportIcs = function () {
    const f = A.ics();
    if (!f.count) { A.toast(A.t('Add a bill or reminder first.')); return; }
    A.download('budget-reminders.ics', f.text, 'text/calendar');
    A.toast(A.tn(f.count, 'Open the downloaded file to add {n} reminder to your calendar.|Open the downloaded file to add {n} reminders to your calendar.'), { ms: 6000 });
  };
  const calendarExport = () => A.needFull(A.exportIcs, A.t('Calendar export'));
  function repeating(root) {
    const t = A.today(), rules = A.state.rules.filter(r => !(r.freq === 'once' && r.start < t) && !(r.end && r.end < t));
    if (!rules.length) {
      root.append(h('section.panel', null, A.empty(A.t('Nothing repeats yet. Add your paycheck and regular bills once, and they fill themselves in from then on.'), A.t('Add the first one'), () => A.ruleSheet())));
      return;
    }
    [['in', A.t('Income')], ['out', A.t('Bills and spending')], ['save', A.t('Savings transfers')], ['debt', A.t('Debt payments')], ['note', A.t('Reminders')]].forEach(g => {
      const rs = rules.filter(r => r.type === g[0]);
      if (!rs.length) return;
      const monthly = A.sum(rs, r => r.amt * A.PER_YEAR[r.freq] / 12);
      root.append(h('section.panel', null,
        h('div.panel-head', null, h('h2', { text: g[1] }), monthly ? h('p.sub', { text: A.t('about {amt} a month', { amt: A.money(monthly, { whole: true }) }) }) : null),
        h('div.rows', null, rs.map(ruleRow))));
    });
    root.append(h('section.panel', null,
      h('div.panel-head', null, h('h2', { text: A.t('Reminders on your phone') })),
      h('p', { text: A.t('Put these in your phone’s own calendar, with alarms. It works on every phone, even when this app is closed.') }),
      h('div.actions.start', null, A.btn(A.t('Add to my calendar'), calendarExport, null, 'download'), A.btn(A.t('Notification settings'), () => A.go('settings')))));
  }
  V.plan = function (root) {
    const t = A.today(), ym = A.ui.calYm || (A.ui.calYm = A.ym(t));
    root.append(A.pageHead(A.t('Plan'), A.t('Bills, paydays and reminders, in the day they fall on.'), A.btn(A.t('Add'), () => A.ruleSheet(), null, 'plus')));
    root.append(h('div.toolbar', null, A.seg([['cal', A.t('Calendar')], ['rep', A.t('Repeating')]], A.ui.planTab, v => { A.ui.planTab = v; A.render(); }, A.t('View'))));
    if (A.ui.planTab === 'rep') { repeating(root); return; }

    const ws = A.state.profile.weekStart, lead = (A.date(ym + '-01').getDay() - ws + 7) % 7, days = A.monthDays(ym);
    const items = A.items(ym + '-01', A.monthEnd(ym)).filter(it => !it.skipped), grid = h('div.cal');
    for (let i = 0; i < 7; i++) grid.append(h('span.cal-wd', { text: A.fmt('2024-09-0' + (1 + (ws + i) % 7), { weekday: 'short' }) }));
    for (let i = 0; i < lead; i++) grid.append(h('span.cal-pad'));
    for (let d = 1; d <= days; d++) {
      const date = ym + '-' + A.pad(d), its = items.filter(it => it.date === date);
      grid.append(h('button.cal-day' + (date === t ? '.is-today' : '') + (date < t ? '.past' : ''), {
        type: 'button', 'aria-label': A.dLong(date) + ', ' + (its.length ? its.map(it => it.r.name).join(', ') : A.t('nothing scheduled')),
        onclick: () => A.daySheet(date)
      }, h('span.cal-n', { text: String(d) }), h('span.day-marks', null, its.slice(0, 4).map(mark))));
    }
    root.append(h('div.cols', null,
      h('div.col-main', null, h('section.panel', null, A.monthNav(ym, v => { A.ui.calYm = v; A.render(); }), grid,
        h('ul.legend', null, MARKS.map(m => h('li', null, h('i.mark', { 'data-type': m[0] }), A.t(m[1])))))),
      h('div.col-side', null, h('section.panel', null, h('div.panel-head', null, h('h2', { text: A.t('Coming up') })), A.agenda(t, 30, A.t('Nothing in the next 30 days.'))))));
  };

  /* ---------- Savings and goals ---------- */
  const STATUS = [A.T('Not started'), A.T('In progress'), A.T('Done')], TONE = [null, 'warn', 'good'];
  function fundRow(f) {
    const bal = A.fundBal(f), target = +f.target || 0, pct = target ? bal / target : 0, meta = [];
    meta.push(target ? A.t('{amt} of {target} · {pct}%', { amt: A.money(bal), target: A.money(target), pct: Math.round(pct * 100) }) : A.t('{amt} saved', { amt: A.money(bal) }));
    if (target && bal < target && f.due && f.due > A.today()) {
      const months = Math.max(1, (+f.due.slice(0, 4) - +curYm().slice(0, 4)) * 12 + (+f.due.slice(5, 7) - +curYm().slice(5, 7)));
      meta.push(A.t('about {amt} a month reaches it by {date}', { amt: A.money((target - bal) / months, { whole: true }), date: monthYear(f.due) }));
    }
    return h('button.row.row-btn.env', { type: 'button', onclick: () => A.fundSheet(f) },
      h('span.row-emoji', { 'aria-hidden': 'true', text: f.emoji || '🎯' }),
      h('span.row-main', null, h('span.row-title', { text: f.name }), target ? A.meter(pct, 'ok') : null, h('span.row-meta', { text: meta.join(' · ') })),
      target ? h('span.row-amt', null, bal >= target ? A.t('Reached') : A.money(target - bal), bal >= target ? null : h('small', { text: ' ' + A.t('to go') })) : null);
  }
  A.fundSheet = function (f0) {
    const isNew = !f0, f = f0 || { name: '', emoji: '🎯', target: 0, base: 0, due: '' };
    A.sheet(isNew ? A.t('New savings fund') : f.name, (body, api) => {
      const name = h('input', { type: 'text', value: f.name, maxLength: 40, placeholder: A.t('Emergency cushion, Holiday…') }), emoji = h('input.emoji-in', { type: 'text', value: f.emoji, maxLength: 8, 'aria-label': A.t('Emoji') });
      const target = A.amountInput(f.target), bal = A.amountInput(isNew ? '' : A.fundBal(f)), due = A.dateInput(f.due || '');
      body.append(h('div.form', null, h('div.form-row.emoji-row', null, A.field(A.t('Emoji'), emoji), A.field(A.t('Name'), name)),
        h('div.form-row', null, A.field(A.t('Saved so far'), bal), A.field(A.t('Target'), target)), A.field(A.t('Reach it by (optional)'), due)),
        h('div.actions', null,
          isNew ? null : A.btn(A.t('Delete'), () => A.confirm(A.t('Delete {name}?', { name: f.name }), A.t('Its transfers stay in your history. Repeating transfers into it stop.'), A.t('Delete'), () => {
            A.commit(s => { s.funds = s.funds.filter(x => x.id !== f0.id); s.rules = s.rules.filter(r => !(r.type === 'save' && r.ref === f0.id)); });
            api.close();
          }, true), 'danger'),
          isNew ? null : A.btn(A.t('Add money'), () => { api.close(); A.addSheet({ type: 'save', ref: f.id }); }),
          A.btn(isNew ? A.t('Create fund') : A.t('Save'), () => {
            if (!name.value.trim()) { A.toast(A.t('Give it a name.')); return; }
            A.commit(s => {
              const o = isNew ? { id: A.uid(), base: 0 } : f0, moved = isNew ? 0 : A.fundBal(f0) - (f0.base || 0);
              o.name = name.value.trim(); o.emoji = emoji.value.trim() || '🎯'; o.target = A.num(target.value); o.due = A.isDate(due.value) ? due.value : '';
              o.base = A.r2(A.num(bal.value) - moved);
              if (isNew) s.funds.push(o);
            });
            api.close();
          }, 'primary')));
    });
  };
  function goalRow(g) {
    const st = A.t(STATUS[g.status] || STATUS[0]);
    return h('div.row', null,
      h('button.pill.pill-btn', { type: 'button', 'data-tone': TONE[g.status], 'aria-label': A.t('{status}. Tap to change.', { status: st }), onclick: () => A.commit(() => { g.status = ((+g.status || 0) + 1) % 3; }) }, st),
      h('button.row-main', { type: 'button', onclick: () => A.goalSheet(g) }, h('span.row-title', { text: g.title }),
        g.due || g.note ? h('span.row-meta', { text: [g.due ? A.t('by {date}', { date: monthYear(g.due) }) : null, g.note].filter(Boolean).join(' · ') }) : null));
  }
  A.goalSheet = function (g0) {
    const isNew = !g0, g = g0 || { title: '', status: 0, due: '', note: '' };
    A.sheet(isNew ? A.t('New goal') : A.t('Edit goal'), (body, api) => {
      const title = h('input', { type: 'text', value: g.title, maxLength: 80, placeholder: A.t('Pay off the card, Save a cushion…') });
      const due = A.dateInput(g.due || ''), note = h('input', { type: 'text', value: g.note || '', maxLength: 120, placeholder: A.t('Optional') });
      body.append(h('div.form', null, A.field(A.t('The goal'), title), A.field(A.t('By when (optional)'), due), A.field(A.t('Note'), note)),
        h('div.actions', null,
          isNew ? null : A.btn(A.t('Delete'), () => {
            const at = A.state.goals.indexOf(g0);
            A.commit(s => { s.goals = s.goals.filter(x => x.id !== g0.id); });
            api.close();
            A.toast(A.t('Goal deleted.'), { action: A.t('Undo'), fn: () => A.commit(s => { if (!A.by(s.goals, g0.id)) s.goals.splice(Math.max(0, at), 0, g0); }) });
          }, 'danger'),
          A.btn(isNew ? A.t('Add goal') : A.t('Save'), () => {
            if (!title.value.trim()) { A.toast(A.t('Write the goal first.')); return; }
            A.commit(s => {
              const o = isNew ? { id: A.uid(), status: 0 } : g0;
              o.title = title.value.trim(); o.due = A.isDate(due.value) ? due.value : ''; o.note = note.value.trim();
              if (isNew) s.goals.push(o);
            });
            api.close();
          }, 'primary')));
    });
  };
  V.save = function (root) {
    const funds = A.state.funds, goals = A.state.goals, total = A.sum(funds, A.fundBal), target = A.sum(funds, f => +f.target || 0);
    const sub = !funds.length ? A.t('Money you are setting aside, one fund at a time.')
      : target ? A.t('{amt} saved of {target} · {pct}%', { amt: A.money(total), target: A.money(target), pct: Math.round(total / target * 100) }) : A.t('{amt} saved', { amt: A.money(total) });
    root.append(A.pageHead(A.t('Savings and goals'), sub, A.btn(A.t('New fund'), () => A.fundSheet(), null, 'plus')));
    root.append(h('div.cols', null,
      h('div.col-main', null, h('section.panel', null, h('div.panel-head', null, h('h2', { text: A.t('Funds') })),
        funds.length ? h('div.rows', null, funds.map(fundRow)) : A.empty(A.t('No funds yet. Start with a small cushion for surprises; even a little takes the edge off.'), A.t('Create a fund'), () => A.fundSheet()))),
      h('div.col-side', null, h('section.panel', null,
        h('div.panel-head', null, h('h2', { text: A.t('Goals') }), h('button.link', { type: 'button', onclick: () => A.goalSheet() }, A.t('New goal'))),
        goals.length ? h('div.rows', null, goals.slice().sort((a, b) => (a.status === 2) - (b.status === 2)).map(goalRow)) : h('p.quiet', { text: A.t('The bigger picture. What is all this planning for?') })))));
  };

  /* ---------- Debt ---------- */
  A.debtSheet = function (d0) {
    const isNew = !d0, d = d0 || { name: '', emoji: '💳', base: 0, apr: 0, min: 0 };
    A.sheet(isNew ? A.t('Add a debt') : d.name, (body, api) => {
      const name = h('input', { type: 'text', value: d.name, maxLength: 40, placeholder: A.t('Credit card, Car loan…') }), emoji = h('input.emoji-in', { type: 'text', value: d.emoji, maxLength: 8, 'aria-label': A.t('Emoji') });
      const bal = A.amountInput(isNew ? '' : A.debtBal(d)), apr = A.amountInput(d.apr), min = A.amountInput(d.min);
      body.append(h('div.form', null, h('div.form-row.emoji-row', null, A.field(A.t('Emoji'), emoji), A.field(A.t('Name'), name)),
        A.field(A.t('Balance today'), bal), h('div.form-row', null, A.field(A.t('Interest rate, % a year'), apr), A.field(A.t('Minimum a month'), min))),
        h('div.actions', null,
          isNew ? null : A.btn(A.t('Delete'), () => A.confirm(A.t('Delete {name}?', { name: d.name }), A.t('Its payments stay in your history.'), A.t('Delete'), () => {
            A.commit(s => { s.debts = s.debts.filter(x => x.id !== d0.id); s.rules = s.rules.filter(r => !(r.type === 'debt' && r.ref === d0.id)); });
            api.close();
          }, true), 'danger'),
          isNew ? null : A.btn(A.t('Log a payment'), () => { api.close(); A.addSheet({ type: 'debt', ref: d.id }); }),
          A.btn(isNew ? A.t('Add debt') : A.t('Save'), () => {
            if (!name.value.trim()) { A.toast(A.t('Give it a name.')); return; }
            A.commit(s => {
              const o = isNew ? { id: A.uid() } : d0, paid = isNew ? 0 : A.debtPaid(d0);
              o.name = name.value.trim(); o.emoji = emoji.value.trim() || '💳'; o.apr = Math.min(A.num(apr.value), 200); o.min = A.num(min.value);
              o.base = A.r2(A.num(bal.value) + paid);
              if (isNew) s.debts.push(o);
            });
            api.close();
          }, 'primary')));
    });
  };
  V.debt = function (root) {
    const ds = A.state.debts, p = A.state.profile, owed = A.sum(ds, A.debtBal);
    const mins = A.sum(ds.filter(d => A.debtBal(d) > 0), d => +d.min || 0);
    const sub = !ds.length ? A.t('Every balance, and roughly when it will be gone.')
      : owed ? A.t('{amt} still owed · {min} a month in minimums', { amt: A.money(owed), min: A.money(mins) }) : A.t('All clear. Nothing owed.');
    root.append(A.pageHead(A.t('Debt'), sub, A.btn(A.t('Add a debt'), () => A.debtSheet(), null, 'plus')));
    if (!ds.length) { root.append(h('section.panel', null, A.empty(A.t('Nothing here yet. Add what you owe and this page works out the order to pay it and the date it ends.'), A.t('Add a debt'), () => A.debtSheet()))); return; }

    const sim = A.payoff(ds, p.extra, p.strategy), result = h('p.plan-result'), label = h('strong');
    const say = extra => {
      const base = A.payoff(ds, 0, p.strategy), s = A.payoff(ds, extra, p.strategy);
      label.textContent = A.t('{amt} extra a month', { amt: A.money(extra) });
      if (s.stuck) { result.textContent = A.t('With these payments the balance never clears, because interest outruns them. Even a small extra amount changes that.'); return; }
      let text = A.t('Debt-free by {date}.', { date: A.monthsFromNow(s.months) }) + ' ';
      if (extra > 0 && base.stuck) text += A.t('With minimums only it would never clear.');
      else if (extra > 0 && base.months > s.months) text += A.tn(base.months - s.months, 'That is {n} month sooner and about {amt} less interest than minimums only.|That is {n} months sooner and about {amt} less interest than minimums only.', { amt: A.money(base.interest - s.interest, { whole: true }) });
      else text += A.t('Interest on the way: about {amt}.', { amt: A.money(s.interest, { whole: true }) });
      result.textContent = text;
    };
    /* the slider's range follows the size of the payments, so it is as useful in yen as in dollars */
    const step = Math.pow(10, Math.max(1, Math.floor(Math.log10(Math.max(mins, 50))) - 1)), extra = +p.extra || 0;
    const top = Math.max(step * 50, Math.ceil(extra / step) * step);
    const slider = h('input', { type: 'range', min: 0, max: top, step: step, value: extra, 'aria-label': A.t('Extra payment each month'), oninput: e => say(+e.target.value), onchange: e => A.commit(s => { s.profile.extra = +e.target.value; }) });
    say(extra);
    const plan = h('section.panel', null, h('div.panel-head', null, h('h2', { text: A.t('The plan') })),
      A.seg([['avalanche', A.t('Highest interest first')], ['snowball', A.t('Smallest balance first')]], p.strategy, v => A.commit(s => { s.profile.strategy = v; }), A.t('Which debt gets the extra money')),
      h('p.field-hint', { text: p.strategy === 'avalanche' ? A.t('Costs the least interest overall.') : A.t('Clears a whole debt soonest, which keeps you going.') }),
      h('div.slider', null, label, slider), result);

    const order = sim.order.map(id => A.by(ds, id)).concat(ds.filter(d => sim.order.indexOf(d.id) < 0));
    const rows = order.map((d, i) => {
      const bal = A.debtBal(d), paidPct = d.base ? A.clamp(1 - bal / d.base, 0, 1) : 1;
      return h('button.row.row-btn.env', { type: 'button', onclick: () => A.debtSheet(d) },
        h('span.row-emoji', { 'aria-hidden': 'true', text: d.emoji || '💳' }),
        h('span.row-main', null, h('span.row-title', null, d.name, i === 0 && bal > 0 ? A.pill(A.t('Focus first'), 'warn') : null),
          A.meter(paidPct, 'ok'),
          h('span.row-meta', { text: bal > 0 ? A.t('{amt} owed · {apr}% · {min} a month · {pct}% paid off', { amt: A.money(bal), apr: +d.apr || 0, min: A.money(d.min), pct: Math.round(paidPct * 100) }) : A.t('Paid off') })),
        h('span.row-amt', null, bal > 0 && sim.done[d.id] ? [h('small', { text: A.t('clear by') + ' ' }), monthYear(A.addMonths(curYm(), sim.done[d.id]) + '-01')] : bal > 0 ? '' : A.t('Done')));
    });
    root.append(h('div.cols', null, h('div.col-main', null, h('section.panel', null, h('div.panel-head', null, h('h2', { text: A.t('In payoff order') })), h('div.rows', null, rows))),
      h('div.col-side', null, plan)));
  };

  /* ---------- Pause list ---------- */
  A.pauseRow = function (p) {
    const span = p.hours * 36e5, left = p.at + span - Date.now(), ready = left <= 0, hrs = Math.ceil(left / 36e5);
    const when = ready ? A.t('The wait is over. Still want it?') : hrs >= 48 ? A.tn(Math.ceil(hrs / 24), '{n} day to go|{n} days to go') : A.tn(hrs, '{n} hour to go|{n} hours to go');
    const set = v => A.commit(s => { const x = A.by(s.pause, p.id); if (x) x.done = v; });
    return h('div.row.pause-row' + (ready ? '.ready' : ''), null,
      h('span.row-emoji', { 'aria-hidden': 'true', text: ready ? '🔔' : '⏳' }),
      h('span.row-main', null, h('span.row-title', { text: p.name }), ready ? null : A.meter(1 - left / span, 'ok'),
        h('span.row-meta', { text: A.money(p.price) + ' · ' + when })),
      h('span.row-actions', null,
        A.btn(ready ? A.t('Skip it') : A.t('Drop it'), () => { set('skipped'); A.toast(A.t('{amt} stays in your pocket.', { amt: A.money(p.price) }), { action: A.t('Undo'), fn: () => set(null) }); }),
        ready ? A.btn(A.t('Buy it'), () => A.addSheet({ amt: p.price, name: p.name, title: A.t('Log the purchase'), onsave: () => set('bought'), onundo: () => set(null) }), 'primary') : null));
  };
  V.pause = function (root) {
    const list = A.state.pause, waiting = list.filter(p => !p.done), decided = list.filter(p => p.done);
    const skipped = decided.filter(p => p.done === 'skipped'), kept = A.sum(skipped, p => p.price);
    root.append(A.pageHead(A.t('Pause list'), A.t('Want something? Park it here first. If you still want it when the timer ends, buy it and enjoy it.')));
    const name = h('input', { type: 'text', maxLength: 60, placeholder: A.t('What is it?') }), price = A.amountInput('');
    const wait = A.select([['24', A.t('1 day')], ['48', A.t('2 days')], ['72', A.t('3 days')], ['168', A.t('1 week')], ['720', A.t('30 days')]], '48');
    root.append(h('div.cols', null,
      h('div.col-main', null,
        h('section.panel', null, h('div.panel-head', null, h('h2', { text: A.t('Waiting') })),
          waiting.length ? h('div.rows', null, waiting.map(A.pauseRow)) : h('p.quiet', { text: A.t('Nothing on pause right now.') })),
        decided.length ? h('section.panel.calm-hide', null,
          h('div.panel-head', null, h('h2', { text: A.t('Decided') }), kept ? h('p.sub', { text: A.tn(skipped.length, '{amt} stayed in your pocket from {n} skipped thing.|{amt} stayed in your pocket from {n} skipped things.', { amt: A.money(kept) }) }) : null),
          h('div.rows', null, decided.slice(-12).reverse().map(p => h('div.row', null,
            h('span.row-main', null, h('span.row-title', { text: p.name }), h('span.row-meta', { text: A.money(p.price) })),
            A.pill(p.done === 'skipped' ? A.t('Skipped') : A.t('Bought'), p.done === 'skipped' ? 'good' : null))))) : null),
      h('div.col-side', null, h('section.panel', null, h('div.panel-head', null, h('h2', { text: A.t('Park something') })),
        h('form.form', {
          onsubmit: e => {
            e.preventDefault();
            if (!name.value.trim() || !A.num(price.value)) { A.toast(A.t('Add what it is and what it costs.')); return; }
            A.commit(s => { s.pause.push({ id: A.uid(), name: name.value.trim(), price: A.num(price.value), at: Date.now(), hours: +wait.value, done: null }); });
            A.toast(A.t('Parked. You will be reminded when the wait is over.'));
          }
        }, A.field(A.t('What you want'), name), h('div.form-row', null, A.field(A.t('Price'), price), A.field(A.t('Wait for'), wait)),
          h('div.actions', null, h('button.btn.primary', { type: 'submit' }, A.t('Start the pause'))))))));
  };

  /* ---------- Review ---------- */
  V.review = function (root) {
    const ym = A.ui.reviewYm || (A.ui.reviewYm = curYm()), m = A.month(ym), year = ym.slice(0, 4);
    root.append(A.pageHead(A.t('Review'), A.t('Where the money went, without the spreadsheet.')));
    root.append(h('div.toolbar', null, A.monthNav(ym, v => { A.ui.reviewYm = v; A.render(); })));

    const cats = A.state.cats.map(c => ({ c: c, v: m.byCat[c.id] || 0 })).filter(x => x.v > 0).sort((a, b) => b.v - a.v), top = cats.length ? cats[0].v : 1;
    const where = h('section.panel', null,
      h('div.panel-head', null, h('h2', { text: A.t('Where it went') }), h('p.sub', { text: A.t('{amt} spent in {month}', { amt: A.money(m.spent), month: A.monthName(ym) }) })),
      cats.length ? h('div.ranked', null, cats.map(x => h('div.ranked-row', { title: A.nm(x.c) + ': ' + A.money(x.v) },
        h('span.ranked-name', null, h('span', { 'aria-hidden': 'true', text: x.c.emoji + ' ' }), A.nm(x.c)),
        h('span.ranked-bar', { 'aria-hidden': 'true' }, h('i', { style: { width: Math.max(2, x.v / top * 100) + '%' } })),
        h('span.ranked-val', null, A.money(x.v), h('small', { text: ' ' + (m.spent ? Math.round(x.v / m.spent * 100) : 0) + '%' })))))
        : h('p.quiet', { text: A.t('No spending logged in this month.') }),
      h('dl.figures', null,
        h('div', null, h('dt', { text: A.t('Income') }), h('dd', { text: A.money(m.inc) })),
        h('div', null, h('dt', { text: A.t('Spending') }), h('dd', { text: A.money(m.spent) })),
        h('div', null, h('dt', { text: A.t('Into savings') }), h('dd', { text: A.money(m.saved) })),
        h('div', null, h('dt', { text: A.t('Debt paid') }), h('dd', { text: A.money(m.debt) })),
        h('div.strong', null, h('dt', { text: A.t('Left over') }), h('dd', { text: A.money(m.inc - m.out) }))));

    const months = [];
    for (let i = 1; i <= 12; i++) { const k = year + '-' + A.pad(i), s = A.month(k); months.push({ k: k, inc: s.inc, out: s.out }); }
    const max = Math.max(1, Math.max.apply(null, months.map(x => Math.max(x.inc, x.out))));
    const readout = h('p.chart-readout', { 'aria-live': 'polite', text: A.t('Tap a month for its numbers.') });
    const vals = x => ({ month: A.monthName(x.k), inc: A.money(x.inc), out: A.money(x.out), left: A.money(x.inc - x.out) });
    const show = x => { readout.textContent = A.t('{month}: {inc} in, {out} out, {left} left.', vals(x)); };
    const chart = h('div.yearchart', { role: 'group', 'aria-label': A.t('Income and money out for each month of {year}', { year: year }) },
      months.map(x => h('button.ycol' + (x.k === ym ? '.is-sel' : ''), {
        type: 'button', 'aria-label': A.t('{month}: {inc} in, {out} out', vals(x)),
        onclick: () => show(x), onmouseenter: () => show(x), onfocus: () => show(x)
      }, h('span.ybars', { 'aria-hidden': 'true' },
        h('i.in', { style: { height: (x.inc / max * 100) + '%' } }), h('i.out', { style: { height: (x.out / max * 100) + '%' } })),
        h('span.ylab', { text: A.monthShort(x.k) }))));
    const live = months.filter(x => x.inc || x.out), tin = A.sum(live, x => x.inc), tout = A.sum(live, x => x.out);
    const yearPanel = h('section.panel', null,
      h('div.panel-head', null, h('h2', { text: A.t('{year}, month by month', { year: year }) }), h('p.sub', { text: A.t('{inc} in · {out} out · {left} left', { inc: A.money(tin), out: A.money(tout), left: A.money(tin - tout) }) })),
      chart, h('ul.legend', null, h('li', null, h('i.swatch.in'), A.t('Income')), h('li', null, h('i.swatch.out'), A.t('Money out'))), readout,
      live.length ? h('div.table-wrap', null, h('table.table', null, h('thead', null, h('tr', null, h('th', { text: A.t('Month') }), h('th.num', { text: A.t('In') }), h('th.num', { text: A.t('Out') }), h('th.num', { text: A.t('Left') }))),
        h('tbody', null, live.map(x => h('tr', null, h('td', { text: A.fmt(x.k + '-01', { month: 'long' }) }), h('td.num', { text: A.money(x.inc) }), h('td.num', { text: A.money(x.out) }), h('td.num', { text: A.money(x.inc - x.out) })))))) : null);

    const ins = ym === curYm() ? A.insights() : [];
    let whoPanel = null;
    if (A.shared()) {
      const w = A.byPerson(ym), ms = A.members().map(p => ({ p: p, v: w[p.id] || 0 })).sort((a, b) => b.v - a.v), big = Math.max(1, ms[0].v);
      whoPanel = h('section.panel', null, h('div.panel-head', null, h('h2', { text: A.t('By person') }), h('button.link', { type: 'button', onclick: () => { A.ui.peopleYm = ym; A.go('people'); } }, A.t('See all'))),
        h('div.ranked', null, ms.map(x => h('div.ranked-row', null,
          h('span.ranked-name', null, h('span', { 'aria-hidden': 'true', text: x.p.emoji + ' ' }), x.p.name),
          h('span.ranked-bar', { 'aria-hidden': 'true' }, h('i', { style: { width: Math.max(2, x.v / big * 100) + '%' } })),
          h('span.ranked-val', { text: A.money(x.v) })))),
        w[''] ? h('p.sub', { text: A.t('{amt} has no name on it.', { amt: A.money(w['']) }) }) : null);
    }
    root.append(h('div.cols', null, h('div.col-main', null, where, yearPanel),
      h('div.col-side', null, whoPanel, ins.length ? h('section.panel', null, h('div.panel-head', null, h('h2', { text: A.t('Worth knowing') })),
        h('ul.insights', null, ins.map(i => h('li', { 'data-tone': i.tone, text: i.text })))) : null)));
  };

  /* ---------- Who spent what: couples and families ---------- */
  V.people = function (root) {
    const ym = A.ui.peopleYm || (A.ui.peopleYm = curYm()), d = A.peopleMonth(ym), prev = A.peopleMonth(A.addMonths(ym, -1));
    const st = A.settle(ym), me = A.me(), named = A.r2(d.total - d.nobody), open = A.ui.open || (A.ui.open = {});
    const max = Math.max.apply(null, [1].concat(d.rows.map(r => r.spent)));
    root.append(A.pageHead(A.t('Who spent what'), A.t('Everyday spending, person by person. Bills with no name on them stay shared.'),
      A.btn(A.t('People'), () => A.go('settings'), null, 'people')));
    root.append(h('div.toolbar', null, A.monthNav(ym, v => { A.ui.peopleYm = v; A.render(); })));

    const fold = (key, summary, kids) => h('details.more-info', { open: !!open[key], ontoggle: e => { open[key] = e.target.open; } }, h('summary', { text: summary }), kids);
    const card = r => {
      const p = r.p, pocket = p.kind === 'child' && p.allowance > 0, before = (prev.rows.find(x => x.p.id === p.id) || { spent: 0 }).spent, facts = [];
      if (named > 0 && r.spent > 0) facts.push(A.t('{pct}% of what has a name on it', { pct: Math.round(r.spent / named * 100) }));
      if (before > 0 || r.spent > 0) facts.push(A.t('{amt} the month before', { amt: A.money(before) }));
      const v = { amt: A.money(Math.abs((p.allowance || 0) - r.spent)), total: A.money(p.allowance || 0) };
      return h('section.panel.person-card', null,
        h('div.person-head', null,
          h('span.row-emoji', { 'aria-hidden': 'true', text: p.emoji }),
          h('div.person-name', null, h('h2', null, p.name, me && p.id === me.id ? A.pill(A.t('this device')) : null), facts.length ? h('p.sub', { text: facts.join(' · ') }) : null),
          h('strong.person-total', { text: A.money(r.spent) })),
        A.meter(pocket ? r.spent / p.allowance : r.spent / max, pocket && r.spent > p.allowance ? 'over' : 'ok'),
        pocket ? h('p.sub', { text: r.spent > p.allowance ? A.t('{amt} over this month’s pocket money of {total}.', v) : A.t('{amt} left of this month’s pocket money of {total}.', v) }) : null,
        r.cats.length ? h('ul.tags', { 'aria-label': A.t('Where it went') }, r.cats.slice(0, 4).map(x => h('li.tag', null, h('span', { 'aria-hidden': 'true', text: x.c.emoji + ' ' }), A.nm(x.c), h('strong', { text: ' ' + A.money(x.v) })))) : null,
        r.tx.length ? fold(p.id, A.tn(r.tx.length, 'Show the {n} entry|Show all {n} entries'), h('div.rows', null, r.tx.map(x => A.txRow(x, { date: true, noWho: true }))))
          : h('p.quiet', { text: A.t('Nothing with this name on it in {month}.', { month: A.monthName(ym) }) }));
    };

    const adults = A.members().filter(x => x.kind !== 'child');
    const side = h('div.col-side', null,
      h('section.panel', null, h('div.panel-head', null, h('h2', { text: A.t('Together') }), h('p.sub', { text: A.monthName(ym) })),
        h('dl.figures.two', null,
          h('div.strong', null, h('dt', { text: A.t('Spent in all') }), h('dd', { text: A.money(d.total) })),
          h('div', null, h('dt', { text: A.t('With a name on it') }), h('dd', { text: A.money(named) })),
          h('div', null, h('dt', { text: A.t('Shared, no name') }), h('dd', { text: A.money(d.nobody) }))),
        d.nobodyTx.length ? fold('nobody', A.tn(d.nobodyTx.length, 'Show the {n} shared entry|Show all {n} shared entries'), h('div.rows', null, d.nobodyTx.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map(x => A.txRow(x, { date: true })))) : null),
      st ? h('section.panel', null, h('div.panel-head', null, h('h2', { text: A.t('Settling up') })),
        h('p.settle', { text: A.settleText(st) }), h('p.field-hint', { text: A.t('Only entries with a name on them count. Change the split in Settings, under “Who is it for”.') }))
        : adults.length === 2 ? h('section.panel', null, h('div.panel-head', null, h('h2', { text: A.t('Settling up') })),
          h('p.sub', { text: A.t('Do you split what you spend? Turn it on and this page works out who passes how much to whom each month.') }),
          h('div.actions.start', null, A.btn(A.t('Turn on splitting'), () => A.commit(s => { s.profile.split = true; })))) : null,
      h('p.quiet', { text: A.t('New entries carry the name of whoever is using the device. Tap any entry to change whose it is.') }));
    root.append(h('div.cols', null, h('div.col-main', null, d.rows.map(card)), side));
  };
})(window.App);
