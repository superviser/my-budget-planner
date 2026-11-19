/* Owner settings. Edit this file, then re-upload the app folder to your host. */
window.APP_CONFIG = {
  // Name shown until the buyer picks their own.
  defaultAppName: 'My Budget',

  // Where the "Get the full version" buttons send people: your Etsy listing.
  buyUrl: 'https://www.etsy.com/listing/4620542376',

  // Fingerprints (SHA-256) of the unlock codes you hand to buyers.
  // The codes themselves are never stored here. Manage them with:
  //   python tools/make_code.py          add a new code
  //   python tools/make_code.py --list   show the codes you created
  codeHashes: [
    'a17e17117e7ebea8474dca1104c0c5143aaa1eb8cfec78bf07e38840320fe232'
  ],

  // Set to true only by tools/build_offline.py --unlocked
  offlineUnlocked: false,

  // When it opens, the app looks for a newer version and installs it by itself. It asks GitHub, where the app
  // is published, and sends nothing about you or what you entered. Change true to false to keep exactly the
  // version you uploaded.
  updates: true,

  version: '1.1.0'
};
