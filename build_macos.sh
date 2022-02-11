#!/bin/sh

yarn run pack:darwin
/usr/libexec/PListBuddy -c 'add LSUIElement string 1' ./dist/NodeRadioTray-darwin-x64/NodeRadioTray.app/Contents/Info.plist
electron-installer-dmg ./dist/NodeRadioTray-darwin-x64/NodeRadioTray.app/ "NodeRadioTray 0.9.0" --out ./dist/installer/ --icon=./build/icon.icns --title="NodeRadioTray 0.9.0" --overwrite