if(require('electron-squirrel-startup')) return;
const { app, Menu, Tray, nativeImage, shell, globalShortcut, BrowserWindow, ipcMain } = require('electron')
const fs = require('fs');
const Store = require("electron-store");
const bass = require("@eriqjaffe/bassaudio-updated");
const chokidar = require("chokidar");
const prompt = require('electron-prompt');
const notifier = require('node-notifier');
const path = require('path');
const AutoLaunch = require('auto-launch');
const ref = require("ref-napi");
const parser = require("icecast-parser")
//const { parseRadioID3 } = require('radio-id3');

const isMac = process.platform === 'darwin'
const userData = app.getPath('userData');
const firstSoundCard = (process.platform == "win32") ? 2 : 1;
const basslib = new bass();
const store = new Store()
const AutoLauncher = new AutoLaunch(
  {name: 'NodeRadioTray'}
);
const watcher = chokidar.watch([], { awaitWriteFinish: true })
  .on('change', function(path) {
    reloadBookmarks();
})

var stream = null;
var outputDevice = -1;
var contextMenu = null;
var idleIcon = null;
var playingIcon = null;
//var _tagInfo = new BASS_TAG_INFO;
var currentOutputDevice = -1;

let tray
let browserWindow;
let bookmarksArr = []
let radioStation;
let tooltipWindow = null;
let hideTooltipTimeout = null;

initializeWatcher();

basslib.EnableTags(true);
var tagsEnabled = basslib.TagsEnabled();
if (tagsEnabled) {
  console.log("BASS: Tags enabled");
} else {
  console.log("BASS: Tags disabled");
  //process.exit();
}

pluginsLoadResults = basslib.LoadAllPlugins();
if (pluginsLoadResults === false) {
  console.log("BASS: Error loading plugins: " + basslib.BASS_ErrorGetCode());
  //process.exit();
} else {
  console.log("BASS: Plugins loaded");
}

setInterval(function () {
  if (
    basslib.BASS_ChannelIsActive(stream) ==
    basslib.BASS_ChannelIsActiveAttribs.BASS_ACTIVE_PLAYING
  ) {
    let radioStation = new parser.Parser({
      autoUpdate: false,
      emptyInterval: 5 * 60,
      errorInterval: 10 * 60,
      metadataInterval: 1,
      notifyOnChangeOnly: false,
      url: store.get("lastURL"),
      userAgent: 'Custom User Agent',
    });

    radioStation.on('metadata', (metadata) => {
      const streamTitle = metadata.get('StreamTitle') ?? 'unknown';
      //console.log(streamTitle)
      if (streamTitle == "unknown") {
        tray.setToolTip("NodeRadioTray\r\n"+store.get("lastStation"))
      } else {
        tray.setToolTip(store.get("lastStation")+"\r\n"+streamTitle)
      }
    });

    radioStation.on('empty', () => {
      tray.setToolTip("NodeRadioTray\r\n"+store.get("lastStation"))
    })

    radioStation.on('error', () => {
      tray.setToolTip("NodeRadioTray\r\n"+store.get("lastStation"))
    })
  } else {
    tray.setToolTip('NodeRadioTray')
  }
}, 1000);

var darkIcon = (store.get("darkicon") == true) ? true : false;
setIconTheme(darkIcon);

if (!store.has("notifications")) {
  store.set("notifications", true)
} 

const template = [
  ...(isMac ? [{
      label: app.name,
      submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
      ]
  }] : []),
  {
    label: 'File',
    submenu: [
/*           {
        click: () => mainWindow.webContents.send('load','click'),
        accelerator: isMac ? 'Cmd+L' : 'Control+L',
        label: 'Load Font',
    }, */
    {
      click: () => browserWindow.webContents.send('addGroup','click'),
      accelerator: isMac ? 'Cmd+G' : 'Control+G',
      label: 'Add Group',
    },
    {
      click: () => browserWindow.webContents.send('addStation','click'),
      accelerator: isMac ? 'Cmd+A' : 'Control+A',
      label: 'Add Station',
    },
    {
        click: () => browserWindow.webContents.send('save','click'),
        accelerator: isMac ? 'Cmd+S' : 'Control+S',
        label: 'Save Bookmarks',
    },
/*     {
      click: () => mainWindow.webContents.send('import-image','click'),
      accelerator: isMac ? 'Cmd+I' : 'Control+I',
      label: 'Import Image',
    }, */
    isMac ? { role: 'close' } : { role: 'quit' }
    ]
},
{
    label: 'View',
    submenu: [
    { role: 'reload' },
    { role: 'forceReload' },
    { role: 'toggleDevTools' },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' }
    ]
},
{
    label: 'Window',
    submenu: [
    { role: 'minimize' },
    { role: 'zoom' },
    ...(isMac ? [
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' }
    ] : [
        { role: 'close' }
    ])
    ]
},
{
    role: 'help',
    submenu: [
    /* {
        click: () => mainWindow.webContents.send('about','click'),
            label: 'About the OOTP Logo Maker',
    },
    {
        label: 'About OOTP Baseball',
        click: async () => {    
        await shell.openExternal('https://www.ootpdevelopments.com/out-of-the-park-baseball-home/')
        }
    }, */
    {
        label: 'About Node.js',
        click: async () => {    
        await shell.openExternal('https://nodejs.org/en/about/')
        }
    },
    {
        label: 'About Electron',
        click: async () => {
        await shell.openExternal('https://electronjs.org')
        }
    },
    /* {
        label: 'About Fabric.js',
        click: async () => {
        await shell.openExternal('http://fabricjs.com/')
        }
    }, */
    {
        label: 'View project on GitHub',
        click: async () => {
        await shell.openExternal('https://github.com/eriqjaffe/NodeRadioTray')
        }
    }
    ]
}
]

const menu = Menu.buildFromTemplate(template)

const prefsTemplate = [
  {
    label: 'Dark tray icon',
    click: e => {
      store.set("darkicon", e.checked)
      setIconTheme(e.checked)
      if (stream == null) {
        tray.setImage(idleIcon)
      } else {
        if (basslib.BASS_ChannelIsActive(stream)) {
          tray.setImage(playingIcon)
        } else {
          tray.setImage(idleIcon)
        }
      }
    },
    type: "checkbox",
    checked: (store.get("darkicon") == true) ? true : false,
    visible: (process.platform == "darwin" ? false : true)
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
  }
  /* {
    label: 'Enable activity logging',
    click: e => {
      store.set("logging", e.checked)
    },
    type: "checkbox",
    checked: (store.get("logging") == true) ? true : false
  }, */
  /* { 
    label: 'Back/forward keys switch stations',
    click: e => {
      store.set("stationswitcher", e.checked)
    },
    type: "checkbox",
    checked: (store.get("stationswitcher") == true) ? true : false
  }, */
  /* {
    label: 'Enable sleep timer',
    click: openAboutWindow()
  } */
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
    label: 'Audio Output',
    submenu: loadCards(),
    icon: path.join(__dirname, '/images/icons8-audio.png')
  },
  { 
    label: 'Edit Stations',
    click: e => {
      shell.openPath(userData+'/bookmarks.json');
    },
    icon: path.join(__dirname, '/images/icons8-maintenance.png')
  },
  { 
    label: 'Edit Stations (experimental)',
    click: e => {
      editBookmarksGui()
    },
    icon: path.join(__dirname, '/images/icons8-maintenance.png')
  },
  { 
    label: 'Reload Stations',
    click: e => {
      reloadBookmarks();
    },
    icon: path.join(__dirname, '/images/icons8-synchronize.png')
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
    label: "Play",
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
      basslib.BASS_Free();
      toggleButtons(false);
    },
    icon: path.join(__dirname, '/images/icons8-Stop.png'),
    visible: process.platform == "linux" ? true : false
  },
  {
    label: "Volume Up",
    id: "volumeUp",
    click: async() => {
      changeVolume("up")
    },
    icon: path.join(__dirname, '/images/icons8-thick-arrow-pointing-up-16.png'),
    visible: process.platform == "linux" ? true : false
  },
  {
    label: "Volume Down",
    id: "volumeDown",
    click: async() => {
      changeVolume("down")
    },
    icon: path.join(__dirname, '/images/icons8-thick-arrow-pointing-down-16.png'),
    visible: process.platform == "linux" ? true : false
  },
  {
    label: "Next Station",
    id: "nextButton",
    click: async() => {
      //nextStation();
      changeStation("forward")
    },
    icon: path.join(__dirname, '/images/icons8-Fast Forward.png'),
    visible: process.platform == "linux" ? true : false
  },
  {
    label: "Previous Station",
    id: "previousButton",
    click: async() => {
      //nextStation();
      changeStation("backward")
    },
    icon: path.join(__dirname, '/images/icons8-Rewind.png'),
    visible: process.platform == "linux" ? true : false
  },
  { 
    type: 'separator'
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
  tray.setToolTip('NodeRadioTray')
  tray.setContextMenu(contextMenu)

  tray.on("click", function(e) {
    tray.popUpContextMenu(contextMenu)
  })
}

app.whenReady().then(() => {
  createTray()
  if (store.get("autoplay") == true) {
    playStream(store.get('lastStation'), store.get('lastURL'));
  }
  toggleMMKeys(store.get("mmkeys"))
  //console.log(contextMenu)
})

app.on('activate', () => {})

app.on('window-all-closed', () => {})

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
              url: station.url
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
          if (tmp.img.length > 0 && fs.existsSync(userData+'/images/'+tmp.img)) {
            var stationIcon = nativeImage.createFromPath(userData+'/images/'+tmp.img).resize({width:16})
          } else {
            var stationIcon = path.join(__dirname, '/images/icons8-radio-2.png')
          }
        } catch (error) {
          console.error(error)
        }
        var station = {
          label: tmp.name,
          click: async => { playStream(tmp.name, tmp.url)},
          icon: stationIcon
        }
        stations.push(station)
      }
      try {
        if (obj.img.length > 0 && fs.existsSync(userData+'/images/'+obj.img)) {
          var genreIcon = nativeImage.createFromPath(userData+'/images/'+obj.img).resize({width:16})
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
    console.log("Bookmarks loaded")
    return stationMenu;
  } catch (error) {
    console.log(error)
  }
}

function reloadBookmarks() {
  menuTemplate[0].submenu = loadBookmarks();
  menuTemplate[3].submenu = loadCards();
  contextMenu = Menu.buildFromTemplate(menuTemplate)
  tray.setContextMenu(contextMenu)
  if (
    basslib.BASS_ChannelIsActive(stream) ==
    basslib.BASS_ChannelIsActiveAttribs.BASS_ACTIVE_PLAYING
  ) {
    toggleButtons(true)
  }
}

function editBookmarksGui() {

  browserWindow = new BrowserWindow({
    width: 800,
    height: 650,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  browserWindow.setMenu(menu)
  browserWindow.loadFile('index.html');
}

function loadCards() {
  var cards = basslib.getDevices();
  var cardsMenu = [];

  for (var i = firstSoundCard; i < cards.length; i++) {
    const cardsArr = [];
    cardsArr.id = i;
  /*   cardsArr.name = cards[i].name;
    cardsArr.typeDigital = cards[i].typeDigital,
    cardsArr.typeDisplayPort = cards[i].typeDisplayPort,
    cardsArr.typeHandset = cards[i].typeHandset,
    cardsArr.typeHdmi = cards[i].typeHdmi,
    cardsArr.typeHeadPhones = cards[i].typeHeadPhones,
    cardsArr.typeHeadSet = cards[i].typeHeadSet,
    cardsArr.typeLine = cards[i].typeLine,
    cardsArr.typeMask = cards[i].typeMask,
    cardsArr.typeMicrophone = cards[i].typeMicrophone,
    cardsArr.typeNetwork = cards[i].typeNetwork,
    cardsArr.typeSPDIF = cards[i].typeSPDIF,
    cardsArr.typeSpeakers = cards[i].typeSpeakers */
    console.log ("current output: "+currentOutputDevice)
    var card = {
      label: cards[i].name + " " ,
      type: 'radio',
      checked: cardsArr.id == currentOutputDevice ? true : false,
      click: async => { 
        outputDevice = parseInt(cardsArr.id);
        currentOutputDevice = parseInt(cardsArr.id);
        console.log(currentOutputDevice + " chosen")
        basslib.BASS_Free();
        var init = basslib.BASS_Init(
          outputDevice,
          44100,
          basslib.BASS_Initflags.BASS_DEVICE_STEREO
        );
        if (init === false) {
          console.log("error at BASS_Init: " + basslib.BASS_ErrorGetCode());
          process.exit();
        } else {
          console.log("BASS: Bass initialized on device " + outputDevice);
        }
        playStream(store.get("lastStation"), store.get("lastURL"))
      }
    }
    cardsMenu.push(card)
  }
  return cardsMenu;
}

function playStream(streamName, url) {
  basslib.BASS_Free();
  tray.setToolTip("NodeRadioTray");
  tray.setImage(idleIcon);
  basslib.BASS_SetConfig(15, 0);
  basslib.BASS_SetConfig(21, 1);
  var init = basslib.BASS_Init(
    outputDevice,
    44100,
    basslib.BASS_Initflags.BASS_DEVICE_STEREO
  );
  if (init === false) {
    notifier.notify(
      {
        title: 'NodeRadioTray',
        message: 'BASS Init Error: ' + basslib.BASS_ErrorGetCode(),
        icon: path.join(__dirname, '/images/playing.png'),
        sound: true,
        wait: false,
        timeout: 3
      });
    //process.exit();
  } else {
    console.log("BASS: Bass initialized on device " + outputDevice);
  }
  stream = basslib.BASS_StreamCreateURL(url, 0, 0, null, null);
  if (basslib.BASS_ErrorGetCode() != basslib.BASS_ErrorCode.BASS_OK) {
    console.log("BASS: Error opening file:" + basslib.BASS_ErrorGetCode());
    notifier.notify(
      {
        title: 'NodeRadioTray',
        message: 'Playback Error: ' + basslib.BASS_ErrorGetCode(),
        icon: path.join(__dirname, '/images/playing.png'),
        sound: true,
        wait: false,
        timeout: 3
      });
  }
  try {
    basslib.BASS_ChannelSetAttribute(
      stream,
      basslib.BASS_ChannelAttributes.BASS_ATTRIB_VOL,
      store.get("lastVolume", 0.5)
    );
    var success = basslib.BASS_ChannelPlay(stream, 0);
    if (!success) {
      notifier.notify(
        {
          title: 'NodeRadioTray',
          message: 'Playback Error: ' + basslib.BASS_ErrorGetCode(),
          icon: path.join(__dirname, '/images/playing.png'),
          sound: true,
          wait: false,
          timeout: 3
        });
    } else {
      toggleButtons(true);
      store.set('lastStation',streamName);
      store.set('lastURL',url)
      
      if (store.get("notifications") == true) {
        notifier.notify(
          {
            title: 'NodeRadioTray',
            message: 'Now Playing: '+streamName,
            icon: path.join(__dirname, '/images/playing.png'),
            sound: true,
            wait: false,
            timeout: 3
          });
      }
    }
  } catch (error) {
    console.log(error)
  }
}

function showVolume() {
  
}

function toggleButtons(state) {
  playButton = contextMenu.getMenuItemById('playButton');
  stopButton = contextMenu.getMenuItemById('stopButton');
  volUpButton = contextMenu.getMenuItemById('volumeUp');
  volDownButton = contextMenu.getMenuItemById('volumeDown')
  nextButton = contextMenu.getMenuItemById('nextButton')
  previousButton = contextMenu.getMenuItemById('previousButton')
  if (state == true) {
    playButton.visible = false;
    stopButton.visible = true;
    volUpButton.visible = true;
    volDownButton.visible = true;
    nextButton.visible = true;
    previousButton.visible = true;
    tray.setImage(playingIcon);
  } else {
    playButton.visible = true;
    stopButton.visible = false;
    volUpButton.visible = false;
    volDownButton.visible = false;
    nextButton.visible = false;
    previousButton.visible = false;
    tray.setImage(idleIcon);
    tray.setToolTip("NodeRadioTray");
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
      console.log("User bookmarks file not found, creating...")
      fs.copyFileSync(path.join(__dirname, '/bookmarks.json'), userData+'/bookmarks.json');
    } catch (error) {
      console.log(error)
    }
  }
  if (!fs.existsSync(userData+'/images')) {
    try {
      console.log("User images directory not found, creating...")
      fs.mkdirSync(userData+'/images');
    } catch (error) {
      console.log(error)
    }
  }
  watcher.add(userData+'/bookmarks.json',
    { awaitWriteFinish: true })
    .on('ready', function() {
      console.log('Watching bookmark file:', watcher.getWatched());
  });
}

function playCustomURL() {
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
          console.log('user cancelled');
      } else {
          playStream('Custom URL', r);
      }
  })
  .catch(console.error);
}

function toggleMMKeys(state) {
  if (state == true) {
    globalShortcut.register('MediaPlayPause', () => {
      console.log("play pause button")
      if (basslib.BASS_ChannelIsActive(stream)) {
        basslib.BASS_Free();
        toggleButtons(false);
      } else {
        playStream(store.get('lastStation'), store.get('lastURL'));
      }
    })
    globalShortcut.register('MediaStop', () => {
      basslib.BASS_Free();
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

function changeVolume(direction) {
  var volume = ref.alloc("float");
  basslib.BASS_ChannelGetAttribute(
    stream,
    basslib.BASS_ChannelAttributes.BASS_ATTRIB_VOL,
    volume
  );
  console.log(ref.deref(volume));
  if (direction == "up" && ref.deref(volume) <= 1) {
    basslib.BASS_ChannelSetAttribute(
      stream,
      basslib.BASS_ChannelAttributes.BASS_ATTRIB_VOL,
      ref.deref(volume) + 0.1
    );
  }
  if (direction == "up" && ref.deref(volume) <= 1 && ref.deref(volume) >= 0.9) {
    basslib.BASS_ChannelSetAttribute(
      stream,
      basslib.BASS_ChannelAttributes.BASS_ATTRIB_VOL,
      ref.deref(volume) + 0.1
    );
  }
  if (direction == "down" && ref.deref(volume) >= 0) {
    basslib.BASS_ChannelSetAttribute(
      stream,
      basslib.BASS_ChannelAttributes.BASS_ATTRIB_VOL,
      ref.deref(volume) - 0.1
    );
  }
  if (direction == "down" && ref.deref(volume) <= 0.1) {
    basslib.BASS_ChannelSetAttribute(
      stream,
      basslib.BASS_ChannelAttributes.BASS_ATTRIB_VOL,
      0
    );
  }
  basslib.BASS_ChannelGetAttribute(
    stream,
    basslib.BASS_ChannelAttributes.BASS_ATTRIB_VOL,
    volume
  );
  console.log(ref.deref(volume));
  store.set("lastVolume", ref.deref(volume))
}

ipcMain.on('test-ipc', (event, arg) => {
  let bookmarks = JSON.parse(fs.readFileSync(userData+'/bookmarks.json'));
  event.sender.send('get-bookmarks', bookmarks)
})

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