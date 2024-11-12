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
const M3U = parsers.M3U;
const PLS = parsers.PLS;
const ASX = parsers.ASX
const log = require('electron-log/main');

const userData = app.getPath('userData');
const iconFolder = path.join(userData,"icons")
const store = new Store()
const AutoLauncher = new AutoLaunch(
  {name: 'NodeRadioTray'}
);
const watcher = chokidar.watch([], { awaitWriteFinish: true })
  .on('change', function(path) {
    reloadBookmarks();
})

log.initialize();
log.transports.file.fileName = "metadata.log"
log.eventLogger.startLogging

const errorLog = log.create({ logId: 'errorLog' })

const updateOptions = {
	repo: 'NodeRadioTray',
	owner: 'eriqjaffe',
	currentVersion: pkg.version
};

if (!fs.existsSync(iconFolder)) {
  fs.mkdirSync(iconFolder);
}

var stream = null;
var contextMenu = null;
var idleIcon = null;
var playingIcon = null;

let tray
let editorWindow;
let aboutWindow;
let playerWindow;
let tooltipWindow;
let bookmarksArr = []

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
      tooltipWindow.webContents.send('set-theme', e.checked)
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
      store.set("html_tooltip", e.checked)
      if (e.checked) {
        enableFakeTooltip()
      } else {
        //tray.setToolTip('NodeRadioTray')
        disableFakeTooltip()
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
      shell.openPath(userData+'/bookmarks.json');
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
      fs.copyFile(path.join(__dirname, '/bookmarks.json'), userData+'/bookmarks.json', (err) => {
        if (err) {
          console.log(err)
        } else {
          reloadBookmarks();
          console.log("file copied successfully")
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
    type: 'separator'
  },
  {
    label: "Play "+store.get("lastStation"),
    id: "playButton",
    click: async() => {
      playStream(store.get('lastStation'), store.get('lastURL'));
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
    label: "Exit",
    role: "quit",
    icon: path.join(__dirname, '/images/icons8-cancel.png')
  }
]

const createTray = () => {
  tray = new Tray(idleIcon)
  
  contextMenu = Menu.buildFromTemplate(menuTemplate)
  //console.log(store.get("html_tooltip"))
  if (!htmlToolTip) {
    tray.setToolTip('NodeRadioTray')
  }
  tray.setContextMenu(contextMenu)

  tray.on("click", function(e) {
    tray.popUpContextMenu(contextMenu)
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

const fadeIn = (window, duration = 250) => {
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
    width: 300,
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
  tooltipWindow.webContents.openDevTools({ mode: 'detach' })
  tooltipWindow.webContents.on('did-finish-load', () => {
    tooltipWindow.webContents.send('set-theme', darkIcon)
    tooltipWindow.webContents.executeJavaScript(`
      let div = document.getElementById('textDiv');
      div.offsetWidth;
    `).then(width => {
      // Set a minimum width if needed, to prevent excessive shrinking
      const minWidth = 216;
      tooltipWindow.setSize(Math.max(width, minWidth)+86, tooltipWindow.getBounds().height);
    });
  });

  playerWindow = new BrowserWindow({
    width: 1024,
    height: 800,
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
  playerWindow.webContents.openDevTools({ mode: 'bottom' })

  playerWindow.on('close', (event) => {
    event.preventDefault(); // Prevent the window from closing
    playerWindow.hide(); // Hide the window instead
  });
  
  playerWindow.webContents.on('did-finish-load', () => {
    if (store.get("autoplay") == true) {
      playStream(store.get('lastStation'), store.get('lastURL'));
    }
  })

  toggleMMKeys(store.get("mmkeys"))
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
    let bookmarks = JSON.parse(fs.readFileSync(userData+'/bookmarks.json'));
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
          if (tmp.img.length > 0 && fs.existsSync(userData+'/icons/'+tmp.img)) {
            var stationIcon = nativeImage.createFromPath(userData+'/icons/'+tmp.img).resize({width:16})
          } else {
            var stationIcon = path.join(__dirname, '/images/icons8-radio-2.png')
          }
        } catch (error) {
          errorLog.error(error)
        }
        var station = {
          label: tmp.name,
          click: async => { playStream(tmp.name, tmp.url)},
          icon: stationIcon
        }
        stations.push(station)
      }
      try {
        if (obj.img.length > 0 && fs.existsSync(userData+'/icons/'+obj.img)) {
          var genreIcon = nativeImage.createFromPath(userData+'/icons/'+obj.img).resize({width:16})
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
    editorWindow.webContents.openDevTools({ mode: 'detach' })
    editorWindow.on('close', (event) => {
      event.preventDefault()
      editorWindow.webContents.send('check-tree');
    });
  } else {
    editorWindow.focus();
  }
}

async function playStream(streamName, url) {
  try {
    if (!htmlToolTip) {
      tray.setToolTip("NodeRadioTray");
    }
    tray.setImage(idleIcon);
    const streamUrl = await extractURLfromPlaylist(url);
    playerWindow.webContents.send("play", { streamName: streamName, url: streamUrl, volume: store.get("lastVolume") });
    if (streamName != "Custom URL") {
      store.set('lastStation', streamName);
      store.set('lastURL', url)
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
  if (state == true) {
    playButton.visible = false;
    stopButton.visible = true;
    volDisplay.visible = true;
    volUpButton.visible = true;
    volDownButton.visible = true;
    nextButton.visible = true;
    previousButton.visible = true;
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
    tray.setImage(idleIcon);
    if (!htmlToolTip) {
      tray.setToolTip("NodeRadioTray");
    }
    menuTemplate[9].label = "Play "+store.get("lastStation")
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
  if (!fs.existsSync(userData+'/bookmarks.json')) {
    try {
      fs.copyFileSync(path.join(__dirname, '/bookmarks.json'), userData+'/bookmarks.json');
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
  watcher.add(userData+'/bookmarks.json',
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
      type: 'input',
      icon: path.join(__dirname, 'images/playing.png')
    })
    .then((r) => {
        if(r === null) {
        } else {
            playStream('Custom URL', r);
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
  } else {
    globalShortcut.unregisterAll()
  }
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
  playStream(bookmarksArr[index].name, bookmarksArr[index].url)
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

ipcMain.on('set-tooltip-width', (event, width) => {
  const minWidth = 216;
  tooltipWindow.setSize(Math.max(width, minWidth)+86, tooltipWindow.getBounds().height);
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
  console.log(data)
  let bookmarks = JSON.parse(fs.readFileSync(userData+'/bookmarks.json'));
  let iconImage = findImageByName(data.streamName, bookmarks)
  let defaultImage = path.join(__dirname, 'images/playing.png')
  if (darkIcon == false) {
    defaultImage = path.join(__dirname, 'images/playing_white.png')
  }
  let icon = (iconImage == null) ? defaultImage : path.join(userData,'icons',iconImage)
  
  if (data.playing) {
    tray.setImage(playingIcon);
    if (!htmlToolTip) {
      tray.setToolTip(data.data)
    } else {
      tooltipWindow.webContents.send('tooltip-update', {playing: data.playing, data: data.data, streamName: data.streamName, image: icon})
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
      tooltipWindow.webContents.send('tooltip-update', { playing: false })
    }
    tray.setImage(idleIcon);
    toggleButtons(false)
  }
})

ipcMain.on('get-icon-file', (event, data) => {
  const options = {
		defaultPath: store.get("uploadImagePath", app.getPath('pictures')),
		properties: ['openFile'],
		filters: [
			{ name: 'Images', extensions: ['jpg', 'png'] }
		]
	}
	dialog.showOpenDialog(null, options).then(result => {
		  if(!result.canceled) {
        console.log(result.filePaths[0])
        try {
          fs.copyFileSync(result.filePaths[0], path.join(iconFolder,path.basename(result.filePaths[0])))
          editorWindow.webContents.send("get-icon-file-response", {id: data, image: path.basename(result.filePaths[0])})
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
  return "no image"; // Return null if the name is not found
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
      icon: path.join(__dirname, 'images/playing.png'), // Absolute path (doesn't work on balloons)
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
    playStream(store.get('lastStation'), store.get('lastURL'));
  }
})

ipcMain.on("get-initial-volume", (event, data) => {
  playerWindow.webContents.send("get-initial-volume-response", { volume: store.get("lastVolume", 1.0) })
})

ipcMain.on("set-volume-response", (event, data) => {
  store.set("lastVolume", data.volume)
  menuTemplate[11].label = "Volume: "+Math.round(parseFloat(data.volume) * 100)+"%"
  menuTemplate[11].icon = path.join(__dirname, '/images/'+Math.round(parseFloat(data.volume) * 100)+"-percent-icon.png")
  contextMenu = Menu.buildFromTemplate(menuTemplate)
  tray.setContextMenu(contextMenu)
  if (data.status == "playing") {
    toggleButtons(true)
  } else {
    toggleButtons(false)
  }
})

ipcMain.on('test-ipc', (event, arg) => {
  let bookmarks = JSON.parse(fs.readFileSync(userData+'/bookmarks.json'));
  event.sender.send('get-bookmarks', bookmarks)
})

ipcMain.on('save-bookmarks', (event, data) => {
  fs.writeFile(userData+'/bookmarks.json', data.data, function(err) {
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