if(require('electron-squirrel-startup')) return;
const { nativeTheme, app, Menu, Tray, nativeImage, shell, globalShortcut, BrowserWindow, ipcMain, dialog, screen } = require('electron')
const fs = require('fs');
const Store = require("electron-store");
const chokidar = require("chokidar");
const prompt = require('electron-prompt');
const notifier = require('node-notifier');
const path = require('path');
const AutoLaunch = require('auto-launch');
const pkg = require('./package.json')
const parsers = require("playlist-parser");
const versionCheck = require('github-version-checker')
const Jimp = require("jimp");
const M3U = parsers.M3U;
const PLS = parsers.PLS;
const ASX = parsers.ASX
const log = require('electron-log/main');
const RadioBrowser = require('radio-browser');
const gotTheLock = app.requestSingleInstanceLock();
const userData = app.getPath('userData');
//const iconFolder = path.join(userData,"icons")

let countries
let languages 
let tags
let bookmarkFile

const removeEmojis = (str) => str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}]/gu, '');

RadioBrowser.getCategory("countries")
  .then(data => {
    countries = data.map(entry => entry.name);
    countries.sort((a, b) => a.localeCompare(b));
    countries = ["Any", ...countries.filter(tag => tag !== "Any")];
    countries = countries.filter(country => {
      return country.trim().length > 18;
    });
  })
  .catch(error => console.error(error));

RadioBrowser.getCategory("languages")
  .then(data => {
    languages = data.map(entry => entry.name);
    if (!languages.includes("Any")) {
      languages.push("Any");
    }
    languages.sort((a, b) => a.localeCompare(b));
    languages = ["Any", ...languages.filter(tag => tag !== "Any")];
    languages = languages.filter(lang => {
      return lang.trim().length > 18;
    });
  })
  .catch(error => console.error(error));

RadioBrowser.getCategory("tags")
  .then(data => {
    tags = data.map(entry => removeEmojis(entry.name).trim());
    if (!tags.includes("Any")) {
      tags.push("Any");
    }
    tags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    tags = ["Any", ...tags.filter(tag => tag !== "Any")];
    tags = tags.filter(tag => {
      return tag.trim().length > 18;
    });
  })
  .catch(error => console.error(error));

const helpInfo = `
Options:
  -P, --play      Begins playing the last played station
  -H, --help      Displays this information

The following options are also available if NodeRadioTray is currently running:
  -S, --stop      Stops playback
  -U, --volup     Raises the stream's volume
  -D, --voldown   Lowers the streams' volume
  -M, --mute      Mutes the stream
  -N, --next      Switches to the next station in the bookmark file
  -R, --prev      Switches to the previous station in the bookmark file
`;

if (!gotTheLock) {
  app.on('ready', () => {
    process.exit(0);
  });
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    const validCommands = ['-S', '-P', '-U', '-D', '-M', '-N', '-R', '--stop', '--play', '--volup', '--voldown', '--mute', '--next', '--prev'];
    const foundCommands = commandLine.filter(arg => validCommands.includes(arg));
    const command = foundCommands[0];
    switch(command) {
      case '-S':
        toggleButtons(false);
        break;
      case '-P':
        playStream(store.get('lastStation'), store.get('lastURL'), true);
        break;
      case '-N':
        changeStation("forward")
        break;
      case '-R':
        changeStation('backward')
        break;
      case '-U':
        changeVolume('up')
        break;
      case '-D':
        changeVolume('down')
        break;
      case '-M':
        playerWindow.webContents.send('toggle-mute', null)
        break;
      case '--stop':
        toggleButtons(false);
        break;
      case '--play':
        playStream(store.get('lastStation'), store.get('lastURL'), true);
        break;
      case '--next':
        changeStation("forward")
        break;
      case '--prev':
        changeStation('backward')
        break;
      case '--volup':
        changeVolume('up')
        break;
      case '--voldown':
        changeVolume('down')
        break;
      case '--mute':
        playerWindow.webContents.send('toggle-mute', null)
        break;
    }
  });
}

const store = new Store()
const AutoLauncher = new AutoLaunch(
  {name: 'NodeRadioTray'}
);
const watcher = chokidar.watch([], { awaitWriteFinish: true })
  .on('change', function(path) {
    reloadBookmarks();
})

bookmarkFile = store.get("customBookmarkPath", path.join(userData, "bookmarks.json"))

log.initialize();
log.transports.file.fileName = "metadata.log"
log.eventLogger.startLogging

const errorLog = log.create({ logId: 'errorLog' })

const updateOptions = {
	repo: 'NodeRadioTray',
	owner: 'eriqjaffe',
	currentVersion: pkg.version
};

/* if (!fs.existsSync(iconFolder)) {
  fs.mkdirSync(iconFolder);
} */

var stream = null;
var contextMenu = null;
var idleIcon = null;
var playingIcon = null;

let tray
let editorWindow;
let aboutWindow;
let playerWindow;
let tooltipWindow;
let randomWindow;
let bookmarksArr = []
let currentStreamData;
let lastStationImage = path.join(__dirname, '/images/playing.png')

initializeWatcher();

var darkIcon = (store.get("darkicon") == true) ? true : false;
var htmlToolTip = (store.get("html_tooltip") == true) ? true : false;

if (!store.has("notifications")) {
  store.set("notifications", false)
} 

const prefsTemplate = [
  {
    label: 'Dark tray icon',
    click: e => {
      store.set("darkicon", e.checked)
      setIconTheme(e.checked)
      tooltipWindow.webContents.send('set-theme', { dark: e.checked, initial: false })
      if (stream == null) {
        tray.setImage(idleIcon)
      } else {
        playerWindow.webContents.send("get-player-status", null)
      }
    },
    type: "checkbox",
    checked: (store.get("darkicon") == true) ? true : false,
    visible: (process.platform == "darwin" ? false : true)
  },
  {
    label: 'Use HTML tooltip',
    click: e => {
      if (store.get("suppress-tooltip-confirmation") === true) {
        store.set("html_tooltip", e.checked)
        if (e.checked) {
          enableFakeTooltip()
        } else {
          //tray.setToolTip('NodeRadioTray')
          disableFakeTooltip()
        }
        app.quit();
        app.relaunch();
      } else {
        dialog.showMessageBox(null, {
          type: 'question',
          message: "This will cause NodeRadioTray to restart",
          buttons: ['OK'],
          checkboxLabel: 'Don\'t show this again',
          checkboxChecked: false
        }).then(result => {
          store.set("html_tooltip", e.checked)
          store.set("suppress-tooltip-confirmation", result.checkboxChecked)
          if (e.checked) {
            enableFakeTooltip()
          } else {
            //tray.setToolTip('NodeRadioTray')
            disableFakeTooltip()
          }
          app.quit();
          app.relaunch();
        })
      }     
    },
    type: "checkbox",
    checked: (store.get("html_tooltip") == true) ? true : false
  },
  {
    label: 'Auto play last station on startup',
    click: e => {
      store.set("autoplay", e.checked)
    },
    type: "checkbox",
    checked: (store.get("autoplay") == true) ? true : false
  },
  { 
    label: 'Show notifications',
    click: e => {
      store.set("notifications", e.checked)
    },
    type: "checkbox",
    checked: (store.get("notifications") == true) ? true : false
  },
  { 
    label: 'Log metadata',
    click: e => {
      store.set("metadataLog", e.checked)
    },
    type: "checkbox",
    checked: (store.get("metadataLog") == true) ? true : false
  },
  {
    label: 'Use multimedia keys',
    click: e => {
      store.set("mmkeys", e.checked)
      toggleMMKeys(e.checked)
    },
    type: "checkbox",
    checked: (store.get("mmkeys") == true) ? true : false
  },
  {
    label: 'Autostart with operating system',
    click: e => {
      if (e.checked) {
        store.set("autorun", true)
        AutoLauncher.enable()
      } else {
        store.set("autorun", false)
        AutoLauncher.disable()
      }
    },
    type: "checkbox",
    checked: (store.get("autorun") == true) ? true : false
  },
  {
    label: 'Check for updates on startup',
    click: e => {
      store.set("checkForUpdates", e.checked)
    },
    type: "checkbox",
    checked: (store.get("checkForUpdates") == true) ? true : false
  },
  {
    label: 'Custom bookmark file location',
    id: 'customBookmarkPath',
    click: e => {
      if (!e.checked) {
        // revert back to the default path
        moveBookmarks(path.join(store.get("customBookmarkPath")), path.join(userData,"bookmarks.json"))
      } else {
        // switch to a user-defined path
        dialog.showOpenDialog(null, {properties: ['openDirectory', 'createDirectory']}).then(result => {
          if(!result.canceled) {
            if (!fs.existsSync(path.join(result.filePaths[0],"NodeRadioTray"))) {
              fs.mkdirSync(path.join(result.filePaths[0],"NodeRadioTray"))
            }
            moveBookmarks(path.join(userData,"bookmarks.json"), path.join(result.filePaths[0],'NodeRadioTray','bookmarks.json'))
          }
        })
      }
    },
    type: "checkbox",
    checked: (bookmarkFile != path.join(userData,"bookmarks.json")) ? true : false
  }

]

var menuTemplate = [
  { 
    id: 'stationMenu',
    label: 'Stations',
    submenu: loadBookmarks(),
    icon: path.join(__dirname, 'images/icons8-radio-2.png')
  },
  { 
    type: 'separator'
  },
  { label: 'Preferences',
    submenu: prefsTemplate,
    icon: path.join(__dirname, 'images/icons8-settings.png')
  },
  { 
    label: 'Edit Stations',
    click: e => {
      editBookmarksGui()
    },
    icon: path.join(__dirname, '/images/icons8-maintenance.png')
  },
  { 
    label: 'Edit Station JSON file',
    click: e => {
      shell.openPath(bookmarkFile);
    },
    icon: path.join(__dirname, '/images/icons8-edit-text-file.png')
  },
  { 
    label: 'Reload Stations',
    click: e => {
      reloadBookmarks();
    },
    icon: path.join(__dirname, '/images/icons8-synchronize.png')
  },
  { 
    label: 'Restore Original Station list',
    click: e => {
      fs.copyFile(path.join(__dirname, '/bookmarks.json'), bookmarkFile, (err) => {
        if (err) {
          errorLog.error(err)
        } else {
          reloadBookmarks();
          errorLog.info("Bookmarks restored successfully")
        }
      })
    },
    icon: path.join(__dirname, '/images/icons8-restore.png')
  },
  { label: 'Play Custom URL',
    click: e => {
      playCustomURL();
    },
    icon: path.join(__dirname, '/images/icons8-add-link.png')
  },
  { 
    id: 'devicesMenu',
    label: 'Audio Outputs',
    submenu: [],
    icon: path.join(__dirname, 'images/icons8-speaker.png'),
    visible: true
  },
  { 
    type: 'separator'
  },
  {
    label: "Play "+store.get("lastStation"),
    id: "playButton",
    click: async() => {
      playStream(store.get('lastStation'), store.get('lastURL'), true);
    },
    icon: path.join(__dirname, '/images/icons8-Play.png'),
    visible: true
  },
  {
    label: "Stop",
    id: "stopButton",
    click: async() => {
      toggleButtons(false);
    },
    icon: path.join(__dirname, '/images/icons8-Stop.png'),
    visible: false
  },
  { label: "Volume: "+Math.round(parseFloat(store.get("lastVolume", 1)) * 100)+"%",
    id: "volumeDisplay",
    icon: path.join(__dirname, '/images/'+Math.round(parseFloat(store.get("lastVolume", .5)) * 100)+"-percent-icon.png"),
    visible: false
  },
  {
    label: "Volume Up",
    id: "volumeUp",
    click: async() => {
      changeVolume("up")
    },
    icon: path.join(__dirname, '/images/icons8-thick-arrow-pointing-up-16.png'),
    visible: false
  },
  {
    label: "Volume Down",
    id: "volumeDown",
    click: async() => {
      changeVolume("down")
    },
    icon: path.join(__dirname, '/images/icons8-thick-arrow-pointing-down-16.png'),
    visible: false
  },
  {
    label: "Next Station",
    id: "nextButton",
    click: async() => {
      changeStation("forward")
    },
    icon: path.join(__dirname, '/images/icons8-Fast Forward.png'),
    visible: false
  },
  {
    label: "Previous Station",
    id: "previousButton",
    click: async() => {
      changeStation("backward")
    },
    icon: path.join(__dirname, '/images/icons8-Rewind.png'),
    visible: false
  },
  {
    label: "Google This Track",
    id: "googleIt",
    click: async() => {
      let foo = currentStreamData.data.split("\r\n")
      let parts = foo[1].trim().split(" - ");
      let left = `"${parts[0].trim().replace(/ /g, "+")}"`;
      let right = `"${parts[1].trim().replace(/ /g, "+").replace(/ /g, "_")}"`;
      shell.openExternal(`https://www.google.com/search?q=${left}+${right}`)
    },
    icon: path.join(__dirname, '/images/icons8-google.png'),
    visible: false
  },
  { 
    type: 'separator'
  },
  {
    label: "About",
    id: "About",
    click: async() => {
      showAbout()
    },
    icon: path.join(__dirname, '/images/icons8-about.png')
  },
  {
    label: "Toggle Debugging Window",
    id: "ToggleDebug",
    click: async() => {
      if (playerWindow.isVisible()) {
        playerWindow.hide()
      } else {
        playerWindow.show()
      }
    },
    icon: path.join(__dirname, '/images/icons8-debug.png')
  },
  {
    label: "Open Log Folder",
    id: "OpenLogFolder",
    click: async() => {
      shell.openPath(userData+'/logs/')
    },
    icon: path.join(__dirname, '/images/icons8-log.png')
  },
  { 
    label: "Play a Random Station!",
    id: "FindSomeStations",
    click: async() => {
      randomStation()
    },
    icon: path.join(__dirname, '/images/icons8-random-16.png'),
    visible: true
  },
  { 
    label: "Bookmark This Station",
    id: "bookmark",
    click: async() => {
      bookmarkStation()
    },
    icon: path.join(__dirname, '/images/icons8-bookmark-16.png'),
    visible: false
  },
  {
    label: "Exit",
    role: "quit",
    icon: path.join(__dirname, '/images/icons8-cancel.png')
  }
]

const createTray = () => {
  tray = new Tray(idleIcon)
  
  contextMenu = Menu.buildFromTemplate(menuTemplate)
  if (!htmlToolTip) {
    tray.setToolTip('NodeRadioTray')
  }
  tray.setContextMenu(contextMenu)

  tray.on("click", function(e) {
    tray.popUpContextMenu(contextMenu)
    if (htmlToolTip) {
      fadeOut(tooltipWindow)
    }
  })

  if (htmlToolTip) {
    tray.on('mouse-enter', function(e) {
      positionTooltipWindow();
      fadeIn(tooltipWindow);
    })
  
    tray.on('mouse-leave', function(e) {
      fadeOut(tooltipWindow)
    })
  }

}

/* const fadeIn = (window, duration = 250) => {
  let opacity = 0;
  window.setOpacity(opacity);
  window.show();

  const increment = 1 / (duration / 10);
  const fadeInterval = setInterval(() => {
    opacity += increment;
    if (opacity >= 1) {
      window.setOpacity(1);
      clearInterval(fadeInterval);
    } else {
      window.setOpacity(opacity);
    }
  }, 10);
};

// Fade-out function
const fadeOut = (window, duration = 250) => {
  let opacity = 1;
  const decrement = 1 / (duration / 10);
  const fadeInterval = setInterval(() => {
    opacity -= decrement;
    if (opacity <= 0) {
      if (window) {
        window.setOpacity(0);
        window.hide();
        clearInterval(fadeInterval);
      }
    } else {
      if (window) {
        window.setOpacity(opacity);
      }
    }
  }, 10);
}; */

const fadeIn = (window, duration = 250) => {
  if (!window || window.isDestroyed()) return; // Check if the window exists and is not destroyed
  let opacity = 0;
  window.setOpacity(opacity);
  window.show();

  const increment = 1 / (duration / 10);
  const fadeInterval = setInterval(() => {
    if (window.isDestroyed()) {
      clearInterval(fadeInterval);
      return;
    }

    opacity += increment;
    if (opacity >= 1) {
      window.setOpacity(1);
      clearInterval(fadeInterval);
    } else {
      window.setOpacity(opacity);
    }
  }, 10);
};

const fadeOut = (window, duration = 250) => {
  if (!window || window.isDestroyed()) return; // Check if the window exists and is not destroyed
  let opacity = 1;
  const decrement = 1 / (duration / 10);
  const fadeInterval = setInterval(() => {
    if (window.isDestroyed()) {
      clearInterval(fadeInterval);
      return;
    }

    opacity -= decrement;
    if (opacity <= 0) {
      window.setOpacity(0);
      window.hide();
      clearInterval(fadeInterval);
    } else {
      window.setOpacity(opacity);
    }
  }, 10);
};

const positionTooltipWindow = () => {
  const trayBounds = tray.getBounds();  // Gets the position of the tray icon
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const displayBounds = display.bounds;

  let x = trayBounds.x + trayBounds.width / 2 - tooltipWindow.getBounds().width / 2;
  let y;

  // Check if tray icon is in the upper half or lower half of the screen
  if (trayBounds.y < displayBounds.height / 2) {
    // Position below the tray icon
    y = trayBounds.y + trayBounds.height + 5;  // A slight offset
  } else {
    // Position above the tray icon
    y = trayBounds.y - tooltipWindow.getBounds().height - 5;  // A slight offset
  }

  tooltipWindow.setPosition(Math.round(x), Math.round(y));
};

app.whenReady().then(() => {
  if (process.platform == "darwin") {
    setIconTheme(nativeTheme.shouldUseDarkColors)
  } else {
    setIconTheme(darkIcon);
  }
  lastStationImage = (darkIcon == true) ? path.join(__dirname, '/images/playing.png') : path.join(__dirname, '/images/playing_white.png')
  if (store.get("checkForUpdates") == true) {
    versionCheck(updateOptions, function (error, update) {
      if (error) {
        errorLog.error(error.message)
      }
      if (update) {
        dialog.showMessageBox(null, {
          type: 'info',
          message: update.name +" is now available.\r\n\r\nClick 'OK' to close NodeRadioTray and go to the download page.",
          buttons: ['OK', 'Cancel'],
        }).then(result => {
          if (result.response === 0) {
            shell.openExternal(update.url)
            app.quit();
          } 
        })
      } 
    });
  }

  createTray()

  tooltipWindow = new BrowserWindow({
    //width: auto,
    hasShadow: false,
    height: 75,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    opacity: 0,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  tooltipWindow.setMenu(null)
  tooltipWindow.loadFile('tooltip.html')
  //tooltipWindow.webContents.openDevTools({ mode: 'detach' })

  playerWindow = new BrowserWindow({
    width: 1024,
    height: 480,
    show: false,
    skipTaskbar: true,
    icon: path.join(__dirname, 'images/playing.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  playerWindow.setMenu(null)
  playerWindow.loadFile('player.html')
  //playerWindow.webContents.openDevTools({ mode: 'bottom' })
  //playerWindow.show()

  playerWindow.on('close', (event) => {
    event.preventDefault(); // Prevent the window from closing
    playerWindow.hide(); // Hide the window instead
  });
  
  playerWindow.webContents.on('did-finish-load', () => {
    if (store.get("autoplay") == true) {
      playStream(store.get('lastStation'), store.get('lastURL'), true);
    }
  })

  toggleMMKeys(store.get("mmkeys"))

  const args = process.argv;
  const validCommands = ['-H', '--help', '-P', '--play'];
  const foundCommands = args.filter(arg => validCommands.includes(arg));
  const command = foundCommands[0];
  switch (command) {
    case "-H":
      console.log(helpInfo);
      break;
    case "--help":
      console.log(helpInfo)
      break
    case "--P":
      playStream(store.get('lastStation'), store.get('lastURL'), true)
    case "--play":
      playStream(store.get('lastStation'), store.get('lastURL'), true)
  }
})

app.on('activate', () => {})

app.on('window-all-closed', () => {})

app.on('before-quit', function (evt) {
  playerWindow.destroy()
  tray.destroy();
});

if (process.platform == "darwin") {
  app.dock.hide()
}

function loadBookmarks() {
  var stationMenu = [];
  bookmarksArr = []
  try {
    let bookmarks = JSON.parse(fs.readFileSync(bookmarkFile));
    bookmarks.forEach(genre => {
      genre.bookmark.forEach(station => {
          bookmarksArr.push({
              name: station.name,
              url: station.url,
              icon: station.img
          });
      });
    });
    for(var i = 0; i < bookmarks.length; i++) {
      var obj = bookmarks[i];
      var stations = []
      for (var j = 0; j < obj.bookmark.length; j++) {
        const tmp = []
        tmp.name = obj.bookmark[j].name
        tmp.url = obj.bookmark[j].url
        tmp.img = obj.bookmark[j].img
        try {
          if (tmp.img.length > 0) {
            var stationIcon = nativeImage.createFromDataURL(tmp.img).resize({width:16})
          } else {
            var stationIcon = path.join(__dirname, '/images/icons8-radio-2.png')
          }
        } catch (error) {
          errorLog.error(error)
        }
        var station = {
          label: tmp.name,
          click: async => { playStream(tmp.name, tmp.url, true)},
          icon: stationIcon
        }
        stations.push(station)
      }
      try {
        if (obj.img.length > 0) {
          var genreIcon = nativeImage.createFromDataURL(obj.img).resize({width:16})
        } else {
          var genreIcon = path.join(__dirname, '/images/icons8-radio-2.png')
        }
      } catch (error) {
        var genreIcon = path.join(__dirname, '/images/icons8-radio-2.png')
      }
      var genre = {
        label: obj.name,
        submenu: stations,
        icon: genreIcon
      }
      stationMenu.push(genre)
    }
    return stationMenu;
  } catch (error) {
    errorLog.error(error)
  }
}

function reloadBookmarks() {
  menuTemplate[0].submenu = loadBookmarks();
  contextMenu = Menu.buildFromTemplate(menuTemplate)
  tray.setContextMenu(contextMenu)
  playerWindow.webContents.send("get-player-status", null)
}

function moveBookmarks(oldFile, newFile) {
  let menuItem = contextMenu.getMenuItemById('customBookmarkPath');
  if (fs.existsSync(newFile)) {
    let result = dialog.showMessageBoxSync(null, {
      type: 'question',
      message: "Ovewrite the existing bookmark file:\r\n\r\n"+newFile+"?",
      buttons: ['Yes', 'No', 'Cancel']
    })
    switch (result) {
      case 0:
        console.log("you said yes!")
        fs.copyFileSync(oldFile, newFile)
        changeWatcher(oldFile, newFile)
        store.set("customBookmarkPath", newFile)
        bookmarkFile = newFile
        if (bookmarkFile == path.join(userData,"bookmarks.json")) {
          store.delete("customBookmarkPath")
          menuItem.checked = false
        } else {
          menuItem.checked = true
        }
        break;
      case 1:
        console.log("you said no!")
        changeWatcher(oldFile, newFile)
        store.set("customBookmarkPath", newFile)
        bookmarkFile = newFile
        if (bookmarkFile == path.join(userData,"bookmarks.json")) {
          store.delete("customBookmarkPath")
          menuItem.checked = false
        } else {
          menuItem.checked = true
        }
        break;
      default:
        console.log("you said cancel")
        bookmarkFile = oldFile
        if (bookmarkFile == path.join(userData,"bookmarks.json")) {
          store.delete("customBookmarkPath")
          menuItem.checked = false
        } else {
          menuItem.checked = true
        }
        break;
    }
  } else {
    fs.copyFileSync(oldFile, newFile)
    changeWatcher(oldFile, newFile)
    bookmarkFile = newFile
    if (newFile == path.join(userData,"bookmarks.json")) {
      store.delete("customBookmarkPath")
      menuItem.checked = false
    } else {
      menuItem.checked = true
    }
  }
  reloadBookmarks()
}

function showAbout() {
  if (editorWindow) {
    editorWindow.close()
  }
  if (!aboutWindow) {
    aboutWindow = new BrowserWindow({
      width: 800,
      height: 600,
      skipTaskbar: true,
      icon: path.join(__dirname, 'images/playing.ico'),
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    })
    aboutWindow.setMenu(null)
    aboutWindow.loadFile('about.html')
    aboutWindow.on('closed', () => {
      aboutWindow.destroy()
      aboutWindow = null
    })
    aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });
  } else {
    aboutWindow.focus();
  }
}

function editBookmarksGui() {
  if (aboutWindow) {
    aboutWindow.close()
  }
  if (!editorWindow) {
    editorWindow = new BrowserWindow({
      width: 800,
      height: 650,
      icon: path.join(__dirname, 'images/playing.ico'),
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    })
    editorWindow.setMenu(null)
    editorWindow.loadFile('stationeditor.html');
    //editorWindow.webContents.openDevTools({ mode: 'detach' })
    editorWindow.on('close', (event) => {
      event.preventDefault()
      editorWindow.webContents.send('check-tree');
    });
  } else {
    editorWindow.focus();
  }
}

async function playStream(streamName, url, fromBookmark) {
  try {
    let bookmarkButton = contextMenu.getMenuItemById('bookmark');
    if (!htmlToolTip) {
      tray.setToolTip("NodeRadioTray");
    }
    tray.setImage(idleIcon);
    const streamUrl = await extractURLfromPlaylist(url);
    playerWindow.webContents.send("play", { streamName: streamName, url: streamUrl, volume: store.get("lastVolume") });
    let bookmarks = JSON.parse(fs.readFileSync(bookmarkFile));
    let iconImage = findImageByName(streamName, bookmarks)
    let defaultImage = path.join(__dirname, 'images/playing.png')
    if (darkIcon == false) {
      defaultImage = path.join(__dirname, 'images/playing_white.png')
    }
    lastStationImage = (iconImage == null) ? defaultImage : iconImage
    
    if (fromBookmark) {
      store.set('lastStation', streamName);
      store.set('lastURL', url)
      bookmarkButton.visible = false;
    } else {
      if (streamName != undefined || streamName != null) {
        bookmarkButton.visible = true;
      }
    }
    toggleButtons(true);
  } catch (error) {
    toggleButtons(false);
    errorLog.error(`Error playing stream: ${error.message}`);
  }
}

function toggleButtons(state) {
  playButton = contextMenu.getMenuItemById('playButton');
  stopButton = contextMenu.getMenuItemById('stopButton');
  volDisplay = contextMenu.getMenuItemById('volumeDisplay')
  volUpButton = contextMenu.getMenuItemById('volumeUp');
  volDownButton = contextMenu.getMenuItemById('volumeDown')
  nextButton = contextMenu.getMenuItemById('nextButton')
  previousButton = contextMenu.getMenuItemById('previousButton')
  googleIt =  contextMenu.getMenuItemById('googleIt')
  if (state == true) {
    playButton.visible = false;
    stopButton.visible = true;
    volDisplay.visible = true;
    volUpButton.visible = true;
    volDownButton.visible = true;
    nextButton.visible = true;
    previousButton.visible = true;
    googleIt.visible = true;
    tray.setImage(playingIcon);
    tray.setContextMenu(contextMenu)
  } else {
    playButton.visible = true;
    stopButton.visible = false;
    volDisplay.visible = false;
    volUpButton.visible = false;
    volDownButton.visible = false;
    nextButton.visible = false;
    previousButton.visible = false;
    googleIt.visible = false;
    tray.setImage(idleIcon);
    if (!htmlToolTip) {
      tray.setToolTip("NodeRadioTray");
    }
    menuTemplate[10].label = "Play "+store.get("lastStation")
    contextMenu = Menu.buildFromTemplate(menuTemplate)
    tray.setContextMenu(contextMenu)
    playerWindow.webContents.send("stop", null)
  }
}

function setIconTheme(checked) {
  switch (process.platform) {
    case "darwin":
      idleIcon = path.join(__dirname, '/images/idleTemplate.png')
      playingIcon = path.join(__dirname, '/images/playingTemplate.png')
      break;
    case "win32":
      if (checked) {
        idleIcon = path.join(__dirname, '/images/idle.ico')
        playingIcon = path.join(__dirname, '/images/playing.ico')
      } else {
        idleIcon = path.join(__dirname, '/images/idle_white.ico')
        playingIcon = path.join(__dirname, '/images/playing_white.ico')
      }
      break;
    case "linux":
      if (checked) {
        idleIcon = path.join(__dirname, '/images/idle.png')
        playingIcon = path.join(__dirname, '/images/playing.png')
      } else {
        idleIcon = path.join(__dirname, '/images/idle_white.png')
        playingIcon = path.join(__dirname, '/images/playing_white.png')
      }
      break;
    default:
      if (checked) {
        idleIcon = path.join(__dirname, '/images/idle.png')
        playingIcon = path.join(__dirname, '/images/playing.png')
      } else {
        idleIcon = path.join(__dirname, '/images/idle_white.png')
        playingIcon = path.join(__dirname, '/images/playing_white.png')
      }
      break;
  }
}

function initializeWatcher() {
  if (!fs.existsSync(bookmarkFile)) {
    try {
      fs.copyFileSync(path.join(__dirname, '/bookmarks.json'), bookmarkFile);
    } catch (error) {
      errorLog.error(error)
      .catch(error => {
        errorLog.error(error)
      });
    }
  }
  if (!fs.existsSync(userData+'/images')) {
    try {
      fs.mkdirSync(userData+'/images');
    } catch (error) {
      errorLog.error(error)
      .catch(error => {
        errorLog.error(error)
      });
    }
  }
  watcher.add(bookmarkFile,
    { awaitWriteFinish: true })
    .on('ready', function() {});
}

function playCustomURL() {
  try {
    prompt({
      title: 'Custom URL',
      label: 'URL:',
      value: '',
      inputAttrs: {
          type: 'url'
      },
      height: 175,
      type: 'input',
      customStylesheet: path.join(__dirname, 'scripts','style.css'),
      icon: path.join(__dirname, 'images','playing.png')
    })
    .then((r) => {
        if(r === null) {
        } else {
            playStream('Custom URL', r, false);
        }
    })
  } catch(error) {
    errorLog.error(`Error playing URL: ${error.message}`);
  };
}

function toggleMMKeys(state) {
  if (state == true) {
    globalShortcut.register('MediaPlayPause', () => {
      playerWindow.webContents.send("mm-get-player-status", null)
    })
    globalShortcut.register('MediaStop', () => {
      toggleButtons(false);
    })
    globalShortcut.register('Ctrl+VolumeUp', () => {
      changeVolume("up")
    })
    globalShortcut.register('Ctrl+VolumeDown', () => {
      changeVolume("down")
    })
    globalShortcut.register('MediaNextTrack', () => {
      changeStation("forward")
    })
    globalShortcut.register('MediaPreviousTrack', () => {
      changeStation("backward")
    })
  } else {
    globalShortcut.unregisterAll()
  }
}

async function changeWatcher(stop, start) {
  await watcher.unwatch(path.join(stop))
  await watcher.add(path.join(start))
}

function changeStation(dir) {
  let index;
  const currentIndex = bookmarksArr.findIndex(station => station.name === store.get('lastStation'));
  if (currentIndex === -1) {
      return null; // Return null if the name is not found
  }
  if (dir == "forward") {
    index = (currentIndex + 1) % bookmarksArr.length;
  } else {
    index = (currentIndex - 1 + bookmarksArr.length) % bookmarksArr.length;
  }
  playStream(bookmarksArr[index].name, bookmarksArr[index].url, true)
}

function changeVolume(direction) {
  playerWindow.webContents.send("set-volume", { direction: direction })
}

async function extractURLfromPlaylist(url) {
  try {
    switch (url.toLowerCase().slice(-4)) {
      case ".pls":
        const plsResponse = await fetch(url);
        const plsData = await plsResponse.text();
        const plsPlaylist = PLS.parse(plsData);
        return plsPlaylist[0].file;
      case ".m3u":
        const m3uResponse = await fetch(url);
        const m3uData = await m3uResponse.text();
        const m3uPlaylist = M3U.parse(m3uData);
        return m3uPlaylist[0].file;
      case ".asx":
        const asxResponse = await fetch(url);
        const asxData = await asxResponse.text();
        const asxPlaylist = ASX.parse(asxData);
        return asxPlaylist[0].file;
      default:
        return url;
    }
  } catch (error) {
    return url;
  }
}

async function randomStation() {
  if (!randomWindow) {
    randomWindow = new BrowserWindow({
      width: 300,
      height: 260,
      icon: path.join(__dirname, 'images/playing.ico'),
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    })
    randomWindow.setMenu(null)
    randomWindow.loadFile('random.html');
    //randomWindow.webContents.openDevTools({ mode: 'detach' })
  }
  /* prompt2({
    title: 'Prompt example',
    type: "multiInput",
    customStylesheet: path.join(__dirname, 'scripts','style.css'),
    icon: path.join(__dirname, 'images', 'playing.png'),
    multiInputOptions:
        [
          {
            label: "Country:",
            selectOptions: countries
          },
          {
            label: "Language:",
            selectOptions: languages
          },
          {
            label: "Tag:",
            selectOptions: tags
          }
      ],
    height: 300
  })
  .then((r) => {
      if(r === null) {
          console.log('user cancelled');
      } else {
          console.log('result', r);
      }
  })
  .catch(console.error); */
/*   let filter = {
    limit: 500,
    by: 'tag',  
    order: 'random'
  }
  await RadioBrowser.getRandomHost()
  RadioBrowser.searchStations(filter)
      .then(data => {
        let station = data[Math.floor(Math.random()*data.length)]
        playStream(station.name, station.url_resolved, false)
      })
      .catch(error => console.error(error))
       */
}

async function bookmarkStation() {
  let name = currentStreamData.streamName
  if (currentStreamData.streamName === "Custom URL") {
    await prompt({
      title: 'Custom URL',
      label: 'Please Enter a Name for the Stream:',
      value: '',
      type: 'input',
      inputAttrs: {
        required: true
      },
      height: 175,
      customStylesheet: path.join(__dirname, 'scripts','style.css'),
      icon: path.join(__dirname, 'images', 'playing.png')
    })
    .then((r) => {
        name = r
    })
  }
  let bookmarks = JSON.parse(fs.readFileSync(bookmarkFile));
  const selectOptions = bookmarks.reduce((acc, item) => {
    acc[item.name] = item.name;
    return acc;
  }, {});
  prompt({
    title: 'Bookmark A Station',
    label: 'Genre:',
    selectOptions: selectOptions,
    type: 'select',
    height: 175,
    customStylesheet: path.join(__dirname, 'scripts','style.css'),
    icon: path.join(__dirname, 'images','playing.png')
  })
  .then((r) => {
      if(r === null) {
      } else {
        const group = bookmarks.find(category => category.name === r)
        const bookmarkExists = group.bookmark.some(bookmark => bookmark.name === name);
        if (bookmarkExists) {
          dialog.showMessageBox(null, {
            type: 'question',
            message: "You already have a bookmarked station called \""+name+"\" in \""+r+".\"\r\n\r\nDo you want to add this bookmark anyways?",
            buttons: ['Yes', 'No'],
          }).then(result => {
            if (result.response === 0) {
              group.bookmark.push({name: name, url: currentStreamData.url, img: "" })
              group.bookmark.sort((a, b) => a.name.localeCompare(b.name));
              fs.writeFile(bookmarkFile, JSON.stringify(bookmarks, null, 3), function(err) {
                if(err) {
                  dialog.showMessageBox(null, {
                    type: 'error',
                    message: "An error occurred saving bookmarks:\r\r\n" + err,
                    buttons: ['OK'],
                  }).then(result => {})
                  errorLog.error(err);
                } else {
                  store.set("lastStation", name)
                  store.set("lastURL", currentStreamData.url)
                  bookmarkButton = contextMenu.getMenuItemById('bookmark');
                  bookmarkButton.visible = false;
                  reloadBookmarks();
                }
              });
            }
          })
        } else {
          group.bookmark.push({name: name, url: currentStreamData.url, img: "" })
          group.bookmark.sort((a, b) => a.name.localeCompare(b.name));
          fs.writeFile(bookmarkFile, JSON.stringify(bookmarks, null, 3), function(err) {
            if(err) {
              dialog.showMessageBox(null, {
                type: 'error',
                message: "An error occurred saving bookmarks:\r\r\n" + err,
                buttons: ['OK'],
              }).then(result => {})
              errorLog.error(err);
            } else {
              store.set("lastStation", name)
              store.set("lastURL", currentStreamData.url)
              bookmarkButton = contextMenu.getMenuItemById('bookmark');
              bookmarkButton.visible = false;
              reloadBookmarks();
            }
          });
        }
      }
  })
}

ipcMain.on("audio-devices-list", (event, devices) => {
  const defaultDevice = store.get('defaultAudioDevice', "default")
  const parsedDevices = JSON.parse(devices);
  const submenuItems = parsedDevices.map((device, index) => ({
    label: device.label || `Device ${index + 1}`, // Fallback for empty labels
    type: 'radio', // Use 'radio' for mutually exclusive selection
    checked: device.deviceId === defaultDevice,
    click: () => {
      store.set('defaultAudioDevice', device.deviceId)
      playerWindow.webContents.send('change-audio-output', device.deviceId);
    }
  }));
  menuTemplate[8].submenu = submenuItems
  contextMenu = Menu.buildFromTemplate(menuTemplate)
  tray.setContextMenu(contextMenu)
  const selectedItem = menuTemplate[8].submenu.find(item => item.checked)
  selectedItem.click()
  playerWindow.webContents.send("get-player-status", null)
});

ipcMain.on('toggle-dev-tools', (event, arg) => {
  if (playerWindow.webContents.isDevToolsOpened()) {
    playerWindow.webContents.closeDevTools();
    playerWindow.setSize(1024, 480);
    playerWindow.webContents.send('dev-tool-state', "Open Dev Console")
  } else {
    playerWindow.setSize(1024, 780);
    playerWindow.webContents.openDevTools({ mode: 'bottom' });
    playerWindow.webContents.send('dev-tool-state', "Close Dev Console")
  }
  centerPlayerWindow(playerWindow.getBounds().height)
})

function centerPlayerWindow(height) {
  const currentWindowBounds = playerWindow.getBounds();
  const currentDisplay = screen.getDisplayNearestPoint({ x: currentWindowBounds.x, y: currentWindowBounds.y });
  const { width: displayWidth, height: displayHeight } = currentDisplay.workAreaSize;
  const newX = Math.round(currentDisplay.workArea.x + (displayWidth - 1024) / 2);
  const newY = Math.round(currentDisplay.workArea.y + (displayHeight - height) / 2);
  playerWindow.setPosition(newX, newY);
}

ipcMain.on('set-tooltip-width', (event, width) => {
  tooltipWindow.setSize(width, tooltipWindow.getBounds().height);
});

ipcMain.on('extract-url', async (event, data) => {
  try {
    let url = await extractURLfromPlaylist(data.url);
    editorWindow.webContents.send('extract-url-response', { action: data.action, url: url })
  } catch (error) {
    console.error("Error extracting URL:", error);
    editorWindow.webContents.send('extract-url-response', { action: data.action, url: data.url })
  }
});

ipcMain.on('reset', (event, data) => {
  toggleButtons(false)
  playerWindow.webContents.reloadIgnoringCache()
})

ipcMain.on('get-player-status-response', (event, data) => {
  if (data == "playing") {
    toggleButtons(true)
  }
})

ipcMain.on('check-tree-response', (event, response) => {
  if (response == false) {
    editorWindow.destroy()
    editorWindow = null;
  } else {
    dialog.showMessageBox(null, {
      type: 'question',
      message: "The bookmarks appear to have been edited?  Do you want to save your changes?",
      buttons: ['Yes', 'No'],
    }).then(result => {
      if (result.response === 1) {
        editorWindow.destroy()
        editorWindow = null;
      } else {
        editorWindow.webContents.send('save','dialog')
      }
    })
  }
});

ipcMain.on('get-app-version', (event, response) => {
  event.sender.send('get-app-version-response', pkg.version)
})

ipcMain.on('set-tooltip', (event, data) => {
  currentStreamData = data; 
  if (data.playing) {
    toggleButtons(true)
    tray.setImage(playingIcon);
    if (!htmlToolTip) {
      tray.setToolTip(data.data)
    } else {
      tooltipWindow.webContents.send('tooltip-update', {playing: data.playing, data: data.data, streamName: data.streamName, image: lastStationImage})
    }
    if (store.get("metadataLog") == true) {
      log.info(data.data.replace("\r\n"," - "))
    }
    if (store.get("notifications") == true) {
      notifier.notify(
        {
          title: 'NodeRadioTray',
          message: data.data,
          icon: icon, // Absolute path (doesn't work on balloons)
          sound: false,
          wait: false
        }
      );
    }
  } else {
    if (htmlToolTip) {
      tooltipWindow.webContents.send('tooltip-update', { playing: false, image: playingIcon })
    }
    tray.setImage(idleIcon);
    toggleButtons(false)
  }
})

ipcMain.on('get-icon-file', (event, data) => {
  const options = {
		defaultPath: store.get("uploadImagePath", app.getPath("downloads")),
		properties: ['openFile'],
		filters: [
			{ name: 'Images', extensions: ['jpg', 'png'] }
		]
	}
	dialog.showOpenDialog(null, options).then(result => {
		  if(!result.canceled) {
        try {
          store.set("uploadImagePath", path.dirname(userFile.filePaths[0]));
          readImage(data, result.filePaths[0])
          async function readImage(data, file) {
            const image = await Jimp.read(file);
            image.scaleToFit(50, 50)
            let b64 = await image.getBase64Async(Jimp.AUTO)
            editorWindow.webContents.send("get-icon-file-response", {id: data, image: b64})
          }
          /* fs.copyFileSync(result.filePaths[0], path.join(iconFolder,path.basename(result.filePaths[0])))
          editorWindow.webContents.send("get-icon-file-response", {id: data, image: path.basename(result.filePaths[0])}) */
        } catch (err) {
          console.log(err)
        }
      } else {
        
      }
  })
})

function findImageByName(targetName, bookmarks) {
  for (const category of bookmarks) {
      for (const bookmark of category.bookmark) {
          if (bookmark.name === targetName) {
            return bookmark.img || null;
          }
      }
  }
  return null; // Return null if the name is not found
}

function onMouseEnter() {
  positionTooltipWindow();
  fadeIn(tooltipWindow);
}

function onMouseLeave() {
  fadeOut(tooltipWindow);
}

function enableFakeTooltip() {
  tray.setToolTip('')
  tray.on('mouse-enter', onMouseEnter);
  tray.on('mouse-leave', onMouseLeave);
}

function disableFakeTooltip() {
  tray.setToolTip('NodeRadioTray')
  tray.removeListener('mouse-enter', onMouseEnter);
  tray.removeListener('mouse-leave', onMouseLeave);
}

ipcMain.on('error-notification', (event, data) => {
  notifier.notify(
    {
      title: 'NodeRadioTray Error',
      message: data,
      icon: path.join(__dirname, 'images','playing.png'), // Absolute path (doesn't work on balloons)
      sound: false,
      wait: false
    }
  );
  errorLog.error(data)
})

ipcMain.on('mm-get-player-status-response', (event, data) => {
  if (data == "playing") {
    toggleButtons(false)
  } else {
    playStream(store.get('lastStation'), store.get('lastURL'), true);
  }
})

ipcMain.on("get-initial-volume", (event, data) => {
  playerWindow.webContents.send("get-initial-volume-response", { volume: store.get("lastVolume", 1.0) })
})

ipcMain.on("set-volume-response", (event, data) => {
  store.set("lastVolume", data.volume)
  menuTemplate[12].label = "Volume: "+Math.round(parseFloat(data.volume) * 100)+"%"
  menuTemplate[12].icon = path.join(__dirname, '/images/'+Math.round(parseFloat(data.volume) * 100)+"-percent-icon.png")
  contextMenu = Menu.buildFromTemplate(menuTemplate)
  tray.setContextMenu(contextMenu)
  if (data.status == "playing") {
    toggleButtons(true)
  } else {
    toggleButtons(false)
  }
})

ipcMain.on('get-bookmarks', (event, arg) => {
  let bookmarks = JSON.parse(fs.readFileSync(bookmarkFile));
  event.sender.send('get-bookmarks-response', bookmarks)
})

ipcMain.on('save-bookmarks', (event, data) => {
  let cleanedString = data.data.replaceAll("images/playing.png", "")
  fs.writeFile(bookmarkFile, cleanedString, function(err) {
    if(err) {
      dialog.showMessageBox(null, {
        type: 'error',
        message: "An error occurred saving bookmarks:\r\r\n" + err,
        buttons: ['OK'],
      }).then(result => {})
      errorLog.error(err);
    } else {
      reloadBookmarks();
      if (data.source == "dialog") {
        editorWindow.destroy()
        editorWindow = null;
      } else {
        event.sender.send('save-complete', null)
      }
    }
  });
})

ipcMain.on('check-for-update', (event, arg) => {
	versionCheck(updateOptions, function (error, update) {
		if (error) {
      errorLog.error(error.message)
		}
		if (update) {
      aboutWindow.webContents.send('update-available',{update: true, currentVersion: pkg.version, newVersion: update.name, url: update.url})
		} 
	});
})

ipcMain.on('get-radio-browser-stuff', (event, arg) => {
  randomWindow.webContents.send('get-radio-browser-stuff-response', { countries: countries, languages: languages, tags: tags})
})