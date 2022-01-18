const { app, Menu, Tray } = require('electron')
var bass = require("bassaudio-updated");
var basslib = new bass();

basslib.EnableTags(true);

let tray = null

var icon = process.platform === "win32" ? './images/icons8_radio_tower_34495e.ico' : './images/icons8_radio_tower_34495e.png'

const createTray = () => {
  tray = new Tray(icon)
  contextMenu = Menu.buildFromTemplate([
    { 
        label: 'Bagel Radio', 
        click: async() => {
            playStream("Bagel Radio", "https://ais-sa3.cdnstream1.com/2606_128.mp3");           
        }
    },
    { 
        label: 'Indie Pop Rocks', 
        click: async() => {
            playStream("Indie Pop Rocks", "https://ice2.somafm.com/indiepop-128-mp3")
        }
    },
  ])
  tray.setToolTip('NodeRadioTray')
  tray.setContextMenu(contextMenu)
}

app.whenReady().then(() => {
  createTray()
})

app.on('activate', () => {})

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
      var artist = basslib.TAGS_Read(
        stream,
        basslib.BASS_TAGS_FORMAT_CONDITION.IF_X_THEN_A_IF_NOT_THEN_B(
          basslib.BASS_TAGS_FORMAT_STRINGS.SONG_ARTIST,
          basslib.BASS_TAGS_FORMAT_STRINGS.SONG_ARTIST,
          "No artist"
        )
      );
      tray.setToolTip(streamName)
    }
  } catch (error) {
    console.log(error)
  }
}