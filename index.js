const { app, Menu, Tray } = require('electron')
const xml2js = require('xml2js');
const fs = require('fs');
const parser = new xml2js.Parser({ attrkey: "ATTR" });
var bass = require("bassaudio-updated");
var basslib = new bass();

basslib.EnableTags(true);

let tray = null

var genreList = [];
loadBookmarks();

var icon = process.platform === "win32" ? './images/icons8_radio_tower_34495e.ico' : './images/icons8_radio_tower_34495e.png'

var cards = basslib.getDevices();
var cardsMenu = [];

for (var i = 1; i < cards.length; i++) {
  /* console.log(
      cards[i].name +
      " is enabled:" +
      cards[i].enabled +
      " ,IsDefault:" +
      cards[i].IsDefault +
      " , IsInitialized:" +
      cards[i].IsInitialized +
      " ,typeSpeakers:" +
      cards[i].typeSpeakers
  ) */
  var card = {
    label: cards[i].name + " " ,
    type: 'radio',
    checked: cards[i].IsDefault ? true : false
  }
  cardsMenu.push(card)
}

const createTray = () => {
  tray = new Tray(icon)
  contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Sound Cards',
      submenu: cardsMenu
    },
    { 
      type: 'separator'
    },
    { 
      label: 'Stations',
      submenu: genreList
    },
    { 
        type: 'separator'
    },
    {
        label: "Exit",
        click: async() => {
            process.exit();
        }
    }
  ])
  tray.setToolTip('NodeRadioTray')
  tray.setContextMenu(contextMenu)
}

app.whenReady().then(() => {
  createTray()
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
          var bookmark = {
            label: result.bookmarks.group[i].bookmark[j].ATTR.name,
            click: async => { playStream(tmp.name, tmp.url)}
          }
          bookmarks.push(bookmark)
        }
        var genre = {
          label: result.bookmarks.group[i].ATTR.name,
          submenu: bookmarks
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
    -1,
    44100,
    basslib.BASS_Initflags.BASS_DEVICE_STEREO
  );
  if (init === false) {
    console.log("error at BASS_Init: " + basslib.BASS_ErrorGetCode());
    process.exit();
  } else {
    console.log("Bass initialized");
  }
  var stream = basslib.BASS_StreamCreateURL(url, 0, 0, null, null);
  if (basslib.BASS_ErrorGetCode() != basslib.BASS_ErrorCode.BASS_OK) {
    console.log("error opening file:" + basslib.BASS_ErrorGetCode());
  }
  try {
    var success = basslib.BASS_ChannelPlay(stream, 0);
    if (!success) {
      console.log("error playing file:" + basslib.BASS_ErrorGetCode());
    } else {
      //var tags = new basslib.TAGS_Read();
      var artist = basslib.TAGS_Read(
        stream,
        basslib.BASS_TAGS_FORMAT_CONDITION.IF_X_THEN_A_IF_NOT_THEN_B(
          basslib.BASS_TAGS_FORMAT_STRINGS.SONG_ARTIST,
          basslib.BASS_TAGS_FORMAT_STRINGS.SONG_ARTIST,
          "No artist"
        )
      );
      //console.log("hello")
      tray.setToolTip(artist)
    }
  } catch (error) {
    console.log(error)
  }
}