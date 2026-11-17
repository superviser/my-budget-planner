# Budget Planner

These are the published files of the Budget Planner app. They are here so that every copy of the app, wherever it is
hosted, can find the newest release and update itself.

**The app needs the unlock code from a purchase.** Without one it runs as a demo and saves nothing.

## If you host your own copy

You do not have to do anything. When your copy is opened, it asks this repository which release is the newest and
installs it by itself. Only releases signed by the maker of the app are accepted, and your own `config.js` is never
replaced. Nothing about you, your address or what you entered is sent.

To switch this off, open `config.js` in your copy, change `updates: true` to `updates: false`, and upload the
folder again.

## If the app says it cannot install a newer version by itself

- **A copy on your own address:** download this repository (the green **Code** button, then **Download ZIP**),
  unzip it, put your own `config.js` back if you had changed it, and upload the folder to your host the same way
  you did the first time.
- **The single file on your computer:** first download a backup inside the app (Settings). Then download
  `offline/budget-planner-offline.html` from here and put it in place of the old file: same folder, same file name.

All rights reserved. This is not open-source software: the files are published for the people who bought the app.
