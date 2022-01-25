const { app, Menu, Tray, nativeImage, ipcRenderer } = require('electron')
const xml2js = require('xml2js');
const fs = require('fs');
const parser = new xml2js.Parser({ attrkey: "ATTR" });
const Store = require("electron-store");
const bass = require("bassaudio-updated");
var basslib = new bass();
var stream = null;
var outputDevice = -1;

const store = new Store()

basslib.EnableTags(true);

let tray = null

var genreList = [];
loadBookmarks();

var icon = null;
switch (process.platform) {
  case "win32":
    icon = './images/tower_playing.ico'
    break;
  case "darwin":
    icon = './images/tower_playing_mac.png'
    break;
  case "linux":
    icon = './images/tower_playing.png'
    break;
  default:
    icon = './images/tower_playing.png'
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
  tray = new Tray(icon)
  
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
  let xml_string = fs.readFileSync("bookmarks.xml", "utf8")

  parser.parseString(xml_string, function(error, result) {
    if(error === null) {
      for (var i = 0; i < result.bookmarks.group.length; i++) {
        var bookmarks = [];
        for (var j = 0; j < result.bookmarks.group[i].bookmark.length; j++) {
          const tmp = []
          tmp.name = result.bookmarks.group[i].bookmark[j].ATTR.name 
          tmp.url = result.bookmarks.group[i].bookmark[j].ATTR.url
          tmp.img = result.bookmarks.group[i].bookmark[j].ATTR.img
          try {
            if (tmp.img.length > 0 && fs.existsSync('./images/'+tmp.img)) {
              var stationIcon = nativeImage.createFromPath(__dirname+'/images/'+tmp.img).resize({width:16})
            } else {
              var stationIcon = './images/icons8-radio-2.png'
            }
          } catch(err) {
            console.error(err)
          }
          var bookmark = {
            label: result.bookmarks.group[i].bookmark[j].ATTR.name,
            click: async => { playStream(tmp.name, tmp.url)},
            icon: stationIcon
          }
          bookmarks.push(bookmark)
        }
        var genre = {
          label: result.bookmarks.group[i].ATTR.name,
          submenu: bookmarks,
          icon: './images/icons8-radio-2.png'
        }
        genreList.push(genre)
      }
    }
    else {
        console.log(error);
    }
  });
}

function playStream(streamName, url) {
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
      //var tags = new basslib.TAGS_Read(stream);
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
}

function changeOutput(output) {
  console.log(stream)
  console.log(output)
  console.log(outputDevice)
  //basslib.BASS_Free();
  var result = basslib.BASS_ChannelIsActive(stream);
  if (result == basslib.BASS_ChannelIsActiveAttribs.BASS_ACTIVE_PLAYING) {
    console.log("channel is playing");
    var success = basslib.BASS_ChannelSetDevice(stream, output);
    if (!success) {
      console.log("error init sound card:" + basslib.BASS_ErrorGetCode);
    }
  } else {
    console.log("not playing")
  }
  
}

function toggleButtons(state) {
  playButton = contextMenu.getMenuItemById('playButton')
  stopButton = contextMenu.getMenuItemById('stopButton')
  nextButton = contextMenu.getMenuItemById('nextButton')
  previousButton = contextMenu.getMenuItemById('previousButton')
  if (state == true) {
    playButton.enabled = false;
    //playButton.icon = './images/icons8-Play_disabled.png'
    stopButton.enabled = true;
    //stopButton.icon = './images/icons8-Stop.png'
    nextButton.enabled = true;
    //nextButton.icon = './images/icons8-Fast Foward.png'
    previousButton.enabled = true;
    //nextButton.icon = './images/icons8-Rewind.png'
  } else {
    playButton.enabled = true;
    //playButton.icon = './images/icons8-Play.png'
    stopButton.enabled = false;
    //stopButton.icon = './images/icons8-Stop_disabled.png'
    nextButton.enabled = false;
    //nextButton.icon = './images/icons8-Fast Foward_disabled.png'
    previousButton.enabled = false;
    //nextButton.icon = './images/icons8-Rewind_disabled.png'
  }
}