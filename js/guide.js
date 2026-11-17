/* guide.js: how to put your own copy online, step by step with pictures (Cloudflare, Netlify) */
'use strict';
(function (A) {
  const h = A.h;

  /* One list feeds the guide inside the app and the one in the download (tools/make_guide.py reads it).
     {link} and {folder} are filled in where the text is shown. The pictures are the files in app/guide/.
     A step marked "app" only makes sense inside the app; the download ends with its own chapter instead. */
  const UNZIP = { text: A.T('On a computer, unzip your download and find the folder {folder}.'), pics: ['zip'] };
  const MOVE = { app: true, pics: ['own-copy'],
    text: A.T('Copy your address, close this guide, and paste it into the box under “Your own copy”. The button below it moves everything across and opens your copy, already unlocked.') };
  A.GUIDE = {
    cloudflare: {
      name: 'Cloudflare',
      about: A.T('Free, with no ads and no badge. Your address will end in workers.dev.'),
      steps: [
        UNZIP,
        { text: A.T('Create a free account at {link}. No card is needed.'), link: ['dash.cloudflare.com', 'https://dash.cloudflare.com/sign-up'] },
        { text: A.T('In the menu on the left open “Compute”, then “Workers & Pages”, and press “Create application”.'), pics: ['cf-1'] },
        { text: A.T('Choose “Upload your static files”.'), pics: ['cf-2'] },
        { text: A.T('Drag the app folder into the box, or press “folder” and choose it there.'), pics: ['cf-3'] },
        { text: A.T('Under “Worker name” type a name for your copy, then press “Deploy”.'), pics: ['cf-4'] },
        { text: A.T('Your address appears at the top and ends in workers.dev. “Visit” opens it.'), pics: ['cf-5'] },
        MOVE
      ]
    },
    netlify: {
      name: 'Netlify',
      about: A.T('Free, and the quickest to set up. New sites show a small Netlify badge in the corner; the last steps here remove it.'),
      steps: [
        UNZIP,
        { text: A.T('Create a free account at {link}, or log in.'), link: ['app.netlify.com/signup', 'https://app.netlify.com/signup'], pics: ['nf-0'] },
        { text: A.T('Open {link} and drag the app folder onto the page.'), link: ['app.netlify.com/drop', 'https://app.netlify.com/drop'], pics: ['nf-1'] },
        { text: A.T('A minute later it is online. Your address is shown, and ends in netlify.app.'), pics: ['nf-2'] },
        { text: A.T('Choose your address now, because it should not change later: press “Project configuration”, then “Change project name”, type a name that is free and press “Save”.'), pics: ['nf-3', 'nf-4', 'nf-5'] },
        { text: A.T('The badge in the corner: in “Project configuration” choose “Powered by Netlify badge”, press “Configure”, untick “Show the badge on this project” and press “Save”.'), pics: ['nf-6', 'nf-7', 'nf-8'] },
        MOVE
      ]
    }
  };

  /* a picture fills the width; a tap shows it as large as the screen allows, another tap puts it back */
  function picture(name, n, dlg) {
    const img = h('img', { src: 'guide/' + name + '.webp', alt: '', loading: 'lazy', decoding: 'async' });
    const btn = h('button.guide-pic', { type: 'button', 'aria-label': A.t('Picture for step {n}. Press to see it larger.', { n: n }), onclick: () => {
      const big = h('button.guide-zoom', { type: 'button', 'aria-label': A.t('Close'), onclick: () => { big.remove(); btn.focus(); } }, h('img', { src: img.src, alt: '' }));
      dlg.append(big);
      big.focus();
    } }, img);
    /* the single-file copy carries no pictures: the steps read on their own */
    img.onerror = () => btn.remove();
    return btn;
  }

  A.guide = function (which) {
    let host = which === 'netlify' ? 'netlify' : 'cloudflare';
    return A.sheet(() => A.t('Put your own copy online'), (body, api) => {
      const draw = () => {
        const g = A.GUIDE[host];
        body.replaceChildren(
          A.seg([['cloudflare', A.t('Cloudflare')], ['netlify', A.t('Netlify')]], host, v => { host = v; draw(); api.dlg.querySelector('.sheet-in').scrollTop = 0; }, A.t('Put your own copy online')),
          h('p.sub', { text: A.t(g.about) }),
          h('ol.steps.guide', null, g.steps.map((s, i) => h('li', null,
            h('span', null, A.rich(A.t(s.text), {
              link: s.link ? h('a', { href: s.link[1], target: '_blank', rel: 'noopener' }, s.link[0]) : null,
              folder: h('em', { text: 'host-it-yourself / app' })
            })),
            (s.pics || []).map(p => picture(p, i + 1, api.dlg))))));
      };
      draw();
    }, { wide: true });
  };
})(window.App);
