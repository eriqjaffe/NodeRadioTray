const { app, Menu, Tray } = require('electron')
const Audic = require("audic-forked")

let tray = null

var player = null;

var audic = new Audic("");

var icon = process.platform === "win32" ? './images/icons8_radio_tower_34495e.ico' : './images/icons8_radio_tower_34495e.png'

const createTray = () => {
  tray = new Tray(icon)
  contextMenu = Menu.buildFromTemplate([
    { 
        label: 'Bagel Radio', 
        click: async() => {
            audic.destroy();
            audic = new Audic("https://ais-sa3.cdnstream1.com/2606_128.aac")
            //audic = new Audic("E:\\rock\\A\\A Giant Dog\\Toy\\03. Bendover.mp3")
            await audic.play();
            tray.setToolTip(audic.src)
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