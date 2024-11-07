#!/bin/bash

yarn run pack:linux64
yarn run pack:arm
electron-installer-debian --src=./dist/NodeRadioTray-linux-x64/ --dest dist/installer --arch amd64
electron-installer-debian --src=./dist/NodeRadioTray-linux-armv7l/ --dest dist/installer --arch armv7l
electron-installer-redhat --src=./dist/NodeRadioTray-linux-x64/ --dest dist/installer --arch amd64

