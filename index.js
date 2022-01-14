const { app, Menu, Tray } = require('electron')
const Audic = require("audic-forked")
var bass = require("bassaudio-updated");
var basslib = new bass();

basslib.EnableTags(true);
var tagsEnabled = basslib.TagsEnabled();

let tray = null

var player = null;

//var audic = new Audic("");

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

var icon = process.platform === "win32" ? './images/icons8_radio_tower_34495e.ico' : './images/icons8_radio_tower_34495e.png'

const createTray = () => {
  tray = new Tray(icon)
  contextMenu = Menu.buildFromTemplate([
    { 
        label: 'Bagel Radio', 
        click: async() => {
            //audic.destroy();
            //audic = new Audic("https://ais-sa3.cdnstream1.com/2606_128.aac")
            //audic = new Audic("E:\\rock\\A\\A Giant Dog\\Toy\\03. Bendover.mp3")
            //await audic.play();
            //tray.setToolTip(audic.src)
            var chan = basslib.BASS_StreamCreateFile(0, "E:\\rock\\A\\A Giant Dog\\Toy\\03. Bendover.mp3", 0, 0, 0);
            if (basslib.BASS_ErrorGetCode() != basslib.BASS_ErrorCode.BASS_OK) {
              console.log("error opening file:" + basslib.BASS_ErrorGetCode());
            }
            try {
              var success = basslib.BASS_ChannelPlay(chan, 0);
              if (!success) {
                console.log("error playing file:" + basslib.BASS_ErrorGetCode());
              } else {
                var artist = basslib.TAGS_Read(
                  chan,
                  basslib.BASS_TAGS_FORMAT_CONDITION.IF_X_THEN_A_IF_NOT_THEN_B(
                    basslib.BASS_TAGS_FORMAT_STRINGS.SONG_ARTIST,
                    basslib.BASS_TAGS_FORMAT_STRINGS.SONG_ARTIST,
                    "No artist"
                  )
                );
                tray.setToolTip(artist)
              }
            } catch (error) {
              console.log(error)
            }
           
        }
    },
    { 
        label: 'Indie Pop Rocks', 
        click: async() => {
            audic.destroy();
            audic = new Audic("https://somafm.com/indiepop130.pls")
            await audic.play();
            tray.setToolTip(audic.src)
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