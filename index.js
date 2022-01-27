const { app, Menu, Tray, nativeImage, ipcRenderer } = require('electron')
const fs = require('fs');
const Store = require("electron-store");
const bass = require("bassaudio-updated");
var basslib = new bass();
var stream = null;
var outputDevice = -1;
var _tagInfo = null;

const store = new Store()

basslib.EnableTags(true);
var tagsEnabled = basslib.TagsEnabled();
if (tagsEnabled) {
  console.log("Tags enabled");
} else {
  console.log("Tags disabled");
  //process.exit();
}

pluginsLoadResults = basslib.LoadAllPlugins();
if (pluginsLoadResults === false) {
  console.log("Error loading plugins: " + basslib.BASS_ErrorGetCode());
  //process.exit();
} else {
  //console.log(pluginsLoadResults);
}

let tray = null

var genreList = loadBookmarks();

var idleIcon = null;
var playingIcon = null;
switch (process.platform) {
  case "win32":
    idleIcon = './images/tower_idle.ico'
    playingIcon = './images/tower_playing.ico'
    break;
  case "darwin":
    idleIcon = './images/tower_idle_mac.png'
    playingIcon = './images/tower_playing_mac.png'
    break;
  case "linux":
    idleIcon = './images/tower_idle.png'
    playingIcon = './images/tower_playing.png'
    break;
  default:
    idleIcon = './images/tower_idle.png'
    playingIcon = './images/tower_playing.png'
    break;
}

var cards = basslib.getDevices();
var cardsMenu = [];

for (var i = 1; i < cards.length; i++) {
  const cardsArr = [];
  cardsArr.id = i;
  cardsArr.name = cards[i].name;
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
  cardsArr.typeSpeakers = cards[i].typeSpeakers
  var card = {
    label: cards[i].name + " " ,
    type: 'radio',
    checked: cards[i].IsDefault ? true : false,
    click: async => { 
      outputDevice = parseInt(cardsArr.id);
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
        console.log("Bass initialized");
      }
      playStream(store.get("lastStation"), store.get("lastURL"))
    }
  }
  cardsMenu.push(card)
}

const prefsTemplate = [
  {
    label: 'Dark tray icon',
    click: e => {
      store.set("darkicon", e.checked)
    },
    type: "checkbox",
    checked: (store.get("darkicon") == true) ? true : false
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
    label: 'Enable activity logging',
    click: e => {
      store.set("logging", e.checked)
    },
    type: "checkbox",
    checked: (store.get("logging") == true) ? true : false
  },
  {
    label: 'Use multimedia keys',
    click: e => {
      store.set("mmkeys", e.checked)
    },
    type: "checkbox",
    checked: (store.get("mmkeys") == true) ? true : false
  },
  { 
    label: 'Back/forward keys switch stations',
    click: e => {
      store.set("stationswitcher", e.checked)
    },
    type: "checkbox",
    checked: (store.get("stationswitcher") == true) ? true : false
  },
  {
    label: 'Autostart with operating system'
  }//,
  //{
  //  label: 'Enable sleep timer',
  //  click: openAboutWindow()
  //}
]

const menuTemplate = [
  { 
    label: 'Stations',
    submenu: genreList,
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
    label: 'Sound Cards',
    submenu: cardsMenu,
    icon: './images/icons8-audio.png'
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
    icon: './images/icons8-Play.png'
  },
  {
    label: "Stop",
    id: "stopButton",
    click: async() => {
      basslib.BASS_Free();
      toggleButtons(false);
    },
    icon: './images/icons8-Stop.png',
    enabled: false
  },
  {
    label: "Next Station",
    id: "nextButton",
    icon: './images/icons8-Fast Forward.png',
    enabled: false
  },
  {
    label: "Previous Station",
    id: "previousButton",
    icon: './images/icons8-Rewind.png',
    enabled: false
  },
  { 
    type: 'separator'
  },
  {
    label: "Exit",
    click: async() => {
        process.exit();
    },
    icon: './images/icons8-cancel.png'
  }
]

const createTray = () => {
  tray = new Tray(idleIcon)
  
  contextMenu = Menu.buildFromTemplate(menuTemplate)
  tray.setToolTip('NodeRadioTray')
  tray.setContextMenu(contextMenu)
}

app.whenReady().then(() => {
  createTray()
  if (store.get("autoplay") == true) {
    playStream(store.get('lastStation'), store.get('lastURL'));
  }
})

app.on('activate', () => {})

function loadBookmarks() {
  var stationMenu = [];
  let bookmarks = JSON.parse(fs.readFileSync('bookmarks.json'));
  for(var i = 0; i < bookmarks.length; i++) {
    var obj = bookmarks[i];
    var stations = []
    for (var j = 0; j < obj.bookmark.length; j++) {
      const tmp = []
      tmp.name = obj.bookmark[j].name
      tmp.url = obj.bookmark[j].url
      tmp.img = obj.bookmark[j].img
      try {
        if (tmp.img.length > 0 && fs.existsSync('./images/'+tmp.img)) {
          var stationIcon = nativeImage.createFromPath(__dirname+'/images/'+tmp.img).resize({width:16})
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
      if (obj.img.length > 0 && fs.existsSync('./images/'+obj.img)) {
        var genreIcon = nativeImage.createFromPath(__dirname+'/images/'+obj.img).resize({width:16})
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
  return stationMenu;
}

function playStream(streamName, url) {
  basslib.BASS_Free();
  basslib.BASS_SetConfig(15, 0);
  basslib.BASS_SetConfig(21, 1);
  var init = basslib.BASS_Init(
    outputDevice,
    44100,
    basslib.BASS_Initflags.BASS_DEVICE_STEREO
  );
  if (init === false) {
    console.log("error at BASS_Init: " + basslib.BASS_ErrorGetCode());
    process.exit();
  } else {
    console.log("Bass initialized");
  }
  stream = basslib.BASS_StreamCreateURL(url, 0, 0, null, null);
  if (basslib.BASS_ErrorGetCode() != basslib.BASS_ErrorCode.BASS_OK) {
    console.log("error opening file:" + basslib.BASS_ErrorGetCode());
  }
  try {
    var success = basslib.BASS_ChannelPlay(stream, 0);
    if (!success) {
      console.log("error playing file:" + basslib.BASS_ErrorGetCode());
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
      tray.setToolTip("NodeRadioTray\r\n"+streamName)
    }
  } catch (error) {
    console.log(error)
  }
}5

function toggleButtons(state) {
  playButton = contextMenu.getMenuItemById('playButton')
  stopButton = contextMenu.getMenuItemById('stopButton')
  nextButton = contextMenu.getMenuItemById('nextButton')
  previousButton = contextMenu.getMenuItemById('previousButton')
  if (state == true) {
    playButton.enabled = false;
    //playButton.setImage('./images/icons8-Play_disabled.png');
    stopButton.enabled = true;
    //stopButton.setImage('./images/icons8-Stop.png');
    nextButton.enabled = true;
    //nextButton.setImage('./images/icons8-Fast Foward.png');
    previousButton.enabled = true;
    //nextButton.setImage('./images/icons8-Rewind.png');
    tray.setImage(playingIcon);
  } else {
    playButton.enabled = true;
    //playButton.setImage('./images/icons8-Play.png');
    stopButton.enabled = false;
    //stopButton.setImage('./images/icons8-Stop_disabled.png');
    nextButton.enabled = false;
    //nextButton.setImage('./images/icons8-Fast Foward_disabled.png');
    previousButton.enabled = false;
    //nextButton.setImage('./images/icons8-Rewind_disabled.png');
    tray.setImage(idleIcon);
  }
}