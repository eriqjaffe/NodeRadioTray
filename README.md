# NodeRadioTray

A simple cross-platform internet radio player using node.js and Electron that reads URLs from a JSON file.  Based on RadioTray.

## How to install and run

```
git clone https://github.com/eriqjaffe/NodeRadioTray
cd NodeRadioTray
yarn
npm start
```

## Known issues
- AAC+ formatted streams don't play in Linux.  The default bookmarks file has a fair number of those, so you may need to edit or replace them.  This is fixable but may rely on upstream changes.
- The app will occasionally not check the right radio button for your audio output on startup, but subsequent output selections work as expected.
