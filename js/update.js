/* update.js: which release this is, and whether a newer one is out.
   A copy on its own address fetches newer releases by itself; that work is done in sw.js, where it carries on even if a page
   is broken. This file shows where things stand in Settings and lets anybody ask on the spot. The single file for a computer
   cannot replace itself and never goes online by itself: there the button only says whether a newer one is out, and where. */
'use strict';
(function (A) {
  const h = A.h, R = A.release = window.APP_RELEASE || null;
  const U = A.update = { state: null, busy: false, ready: false, failed: false };
  const on = () => !!(R && R.source);
  const worker = () => ('serviceWorker' in navigator && navigator.serviceWorker.controller) || null;
  const wanted = () => A.cfg.updates !== false;
  /* Settings is drawn again if it is the page being shown */
  const repaint = () => A.emit('cloud');

  /* called once the worker is registered */
  U.start = function () {
    if (!on()) return;
    navigator.serviceWorker.addEventListener('message', e => {
      const d = e.data || {};
      if (d.type === 'updated') {
        U.ready = true;
        A.toast(A.t('A newer version of the app is ready.'), { action: A.t('Reload'), fn: () => location.reload(), ms: 20000 });
        repaint();
      }
      if (d.type === 'update-state') {
        U.state = d.state || {};
        if (d.checked) { U.busy = false; U.failed = (U.state.failedAt || 0) > (U.state.checkedAt || 0); }
        repaint();
      }
    });
    navigator.serviceWorker.ready.then(reg => { if (reg.active) reg.active.postMessage({ type: 'update', auto: wanted() }); }).catch(() => null);
  };

  U.check = function () {
    if (U.busy || !on()) return;
    U.busy = true; U.failed = false;
    repaint();
    const w = worker();
    if (w) {
      w.postMessage({ type: 'update', auto: wanted(), check: true });
      /* an answer always comes; this is only for a worker that was stopped half-way */
      setTimeout(() => { if (U.busy) { U.busy = false; U.failed = true; repaint(); } }, 120000);
      return;
    }
    /* no worker in charge (the single file, or the very first visit): only ask which release is the newest */
    fetch(R.source + 'main/update.json', { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(r => { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
      .then(env => { const m = JSON.parse(env.body); U.state = { latest: { built: m.built, version: m.version }, manual: true }; })
      .catch(() => { U.failed = true; })
      .then(() => { U.busy = false; repaint(); });
  };

  /* '' until anything is known */
  U.status = function () {
    const st = U.state || {}, latest = st.latest;
    if (U.failed) return 'failed';
    if (U.ready) return 'ready';
    if (latest && latest.built > R.built) return st.manual || st.off ? 'manual' : 'ready';
    return latest ? 'newest' : '';
  };

  A.updatePanel = function () {
    if (!on()) return null;
    const what = U.status(), auto = !!worker() && wanted();
    const date = new Date(R.built * 1000).toLocaleDateString(A.i18n.lang, { day: 'numeric', month: 'long', year: 'numeric' });
    const line = what === 'failed' ? A.t('Could not check just now. Try again when you are online.')
      : what === 'ready' ? A.t('A newer version of the app is ready.')
        : what === 'manual' ? A.t('A newer version is out, but this copy cannot install it by itself.')
          : what === 'newest' ? A.t('You have the newest version ({date}).', { date: date }) : '';
    const check = A.btn(A.t('Check for updates'), U.check);
    check.disabled = U.busy;
    return A.sec('updates', A.t('Updates'), auto ? A.t('When it opens, the app looks for a newer version and installs it by itself. Nothing you have entered is touched.') : null,
      line ? h('p.field-hint', { role: 'status', text: line }) : null,
      h('div.actions.start', null,
        what === 'ready' ? A.btn(A.t('Reload'), () => location.reload(), 'primary') : null,
        what === 'manual' ? h('a.btn.primary', { href: R.home, target: '_blank', rel: 'noopener' }, A.t('Get the newest version')) : null,
        check));
  };
})(window.App);
