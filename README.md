# NodeRadioTray

A simple cross-platform internet radio player using the BASS audio library (thanks to [bassaudio-updated](https://www.npmjs.com/package/bassaudio-updated)) node.js and Electron that reads URLs from a JSON file.  Based on [Radio Tray](https://github.com/lubosz/radiotray), originally written by Carlos Ribiero.

![Windows screenshot](https://i.imgur.com/HNKCfwm.png)![Linux screenshot](https://i.imgur.com/W9jLwMM.png)![macOS screenshot](https://i.imgur.com/1bYZex8.png)

## Prerequisites
- node.js, at least version v16.14.0.  Older versions may work but haven't been tried.
- yarn package manager

## How to install and run

```
git clone https://github.com/eriqjaffe/NodeRadioTray
cd NodeRadioTray
yarn
npm start
```

## Usage notes

- To play a station, simply pick it from the list.
- The "Play" button will always start playing the last station you played (unless, of course, you've *never* played any stations).
- Turning notifications on will just cause a notification when a station starts playing.  Error notifications always show up even if you have notifications off.
- Bookmarks are stored in a .json file.  Stations and groups can be added, changed & removed manually.  If NodeRadioTray is running the changes will be reflected upon saving the file (there's a 2 second delay to make sure the file is done writing).  The "Edit stations" option will automaticlly open it in whatever your default json editor is, but if you want to open it directly the file location depends on your operating system.
  - ```Windows:  C:\Users\<user>\AppData\Roaming\noderadiotray```
  - ```macOS: /Users/<user>/Library/Application Support/noderadiotray```
  - ```Linux: /home/<user>/.config/noderadiotray```
- Dark and light tray icons are included.  macOS will automatically adjust the icons based on whether the system is in Dark Mode or not, but Windows and Linux users have to choose the icon theme manually. I have not yet figured out how to reliably auto-detect the appropriate color theme but it's on the to-do list.
- If you turn multimedia keys on, you can control the stream's volume with CTRL+VolUp and CTRL+VolDown without affecting the overall system volume.

## Known issues
- The app will occasionally not check the right radio button for your audio output on startup, but subsequent output selections (including checking the button that's already checked) should work as expected.

## Credits

Icons are from [icons8](https://icons8.com/).
