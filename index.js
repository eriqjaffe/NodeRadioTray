const { app, Menu, Tray, nativeImage, shell, globalShortcut } = require('electron')
const fs = require('fs');
const os = require('os');
const Store = require("electron-store");
const bass = require("bassaudio-updated");
const chokidar = require("chokidar");
const prompt = require('electron-prompt');
const notifier = require('node-notifier');
const path = require('path');
const AutoLaunch = require('auto-launch');
const regedit = require('regedit');

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
var _tagInfo = null;
var currentOutputDevice = -1;
var tray = null;



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

if (process.platform == "win32") {
  if (store.get("darkicon", "not set") == "not set") {
    var theme = null;
    regedit.list('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', function(err, result) {
      if (result['HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'].values['AppsUseLightTheme'].value == 1) {
        setIconTheme(false);
      } else {
        setIconTheme(true);
      }
    })
  } else {
    setIconTheme((store.get("darkicon") == true) ? true : false);
  }
} else {
  setIconTheme((store.get("darkicon") == true) ? true : false)
}

if (!store.has("notifications")) {
  store.set("notifications", true)
} 

const prefsTemplate = [
  {
    label: 'Dark tray icon',
    click: e => {
      store.set("darkicon", e.checked)
      setIconTheme(e.checked)
      console.log(idleIcon)
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
    visible: (process.platform == "darwin") ? false : true
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
    icon: './images/icons8-radio-2.png'
  },
  { 
    type: 'separator'
  },
  { label: 'Preferences',
    submenu: prefsTemplate,
    icon: './images/icons8-settings.png'
  },
  { 
    label: 'Audio Output',
    submenu: loadCards(),
    icon: './images/icons8-audio.png'
  },
  { 
    label: 'Edit Stations',
    click: e => {
      shell.openPath(userData+'/bookmarks.json');
    },
    icon: './images/icons8-maintenance.png'
  },
  { 
    label: 'Reload Stations',
    click: e => {
      reloadBookmarks();
    },
    icon: './images/icons8-synchronize.png'
  },
  { label: 'Play Custom URL',
    click: e => {
      playCustomURL();
    },
    icon: './images/icons8-add-link.png'
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
    icon: './images/icons8-Play.png',
    visible: true
  },
  {
    label: "Stop",
    id: "stopButton",
    click: async() => {
      basslib.BASS_Free();
      toggleButtons(false);
    },
    icon: './images/icons8-Stop.png',
    visible: process.platform == "linux" ? true : false
  },
  /*{
    label: "Next Station",
    id: "nextButton",
    click: async() => {
      nextStation();
    },
    icon: './images/icons8-Fast Forward.png',
    visible: process.platform == "linux" ? true : false
  },*/
  /*{
    label: "Previous Station",
    id: "previousButton",
    click: async() => {
      previousStation();
    },
    icon: './images/icons8-Rewind.png',
    visible: process.platform == "linux" ? true : false
  },*/
  { 
    type: 'separator'
  },
  {
    label: "Exit",
    role: "quit",
    icon: './images/icons8-cancel.png'
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
})

app.on('activate', () => {})

app.on('window-all-closed', () => {})

function loadBookmarks() {
  var stationMenu = [];
  try {
    let bookmarks = JSON.parse(fs.readFileSync(userData+'/bookmarks.json'));
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
            var stationIcon = './images/icons8-radio-2.png'
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
          var genreIcon = './images/icons8-radio-2.png'
        }
      } catch (error) {
        var genreIcon = './images/icons8-radio-2.png'
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
}

function loadCards() {
  var cards = basslib.getDevices();
  var cardsMenu = [];

  for (var i = firstSoundCard; i < cards.length; i++) {
    const cardsArr = [];
    cardsArr.id = i;
    cardsArr.name = cards[i].name;
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
      var artist = basslib.TAGS_Read(
        stream,
        basslib.BASS_TAGS_FORMAT_CONDITION.IF_X_THEN_A_IF_NOT_THEN_B(
          basslib.BASS_TAGS_FORMAT_STRINGS.SONG_ARTIST,
          basslib.BASS_TAGS_FORMAT_STRINGS.SONG_ARTIST,
          "No artist"
        )
      );
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
      tray.setToolTip("NodeRadioTray\r\n"+streamName)
    }
  } catch (error) {
    console.log(error)
  }
}

function toggleButtons(state) {
  playButton = contextMenu.getMenuItemById('playButton')
  stopButton = contextMenu.getMenuItemById('stopButton')
  //nextButton = contextMenu.getMenuItemById('nextButton')
  //previousButton = contextMenu.getMenuItemById('previousButton')
  if (state == true) {
    playButton.visible = false;
    stopButton.visible = true;
    //nextButton.visible = true;
    //previousButton.visible = true;
    tray.setImage(playingIcon);
  } else {
    playButton.visible = true;
    stopButton.visible = false;
    //nextButton.visible = false;
    //previousButton.visible = false;
    tray.setImage(idleIcon);
  }
}

function setIconTheme(checked) {
  switch (process.platform) {
    case "darwin":
      idleIcon = './images/idleTemplate.png'
      playingIcon = './images/playingTemplate.png'
      break;
    case "win32":
      if (checked) {
        idleIcon = './images/idle.ico'
        playingIcon = './images/playing.ico'
      } else {
        idleIcon = './images/idle_white.ico'
        playingIcon = './images/playing_white.ico'
      }
      break;
    case "linux":
      if (checked) {
        idleIcon = './images/idle.png'
        playingIcon = './images/playing.png'
      } else {
        idleIcon = './images/idle_white.png'
        playingIcon = './images/playing_white.png'
      }
      break;
    default:
      if (checked) {
        idleIcon = './images/idle.png'
        playingIcon = './images/playing.png'
      } else {
        idleIcon = './images/idle_white.png'
        playingIcon = './images/playing_white.png'
      }
      break;
  }
}

function initializeWatcher() {
  if (!fs.existsSync(userData+'/bookmarks.json')) {
    try {
      console.log("User bookmarks file not found, creating...")
      fs.copyFileSync(__dirname+"/bookmarks.json", userData+'/bookmarks.json');
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
    icon: './images/playing.png'
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
  } else {
    globalShortcut.unregisterAll()
  }
}