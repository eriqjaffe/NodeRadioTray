const { exec } = require('child_process');
const path = require('path');
const pkg = require('./package.json');

const appName = 'NodeRadioTray';
const outDir = 'dist';
const installerDir = path.join(outDir, 'installer');
const version = pkg.version;
const appFolderName = `${appName}-darwin-x64`;
const appPath = path.join(outDir, appFolderName, `${appName}.app`);
const plistPath = path.join(appPath, 'Contents', 'Info.plist');

function runCommand(cmd) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${cmd}`);
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error running command: ${cmd}\n`, error);
        reject(error);
        return;
      }
      console.log(stdout);
      if (stderr) {
        console.warn(stderr);
      }
      resolve();
    });
  });
}

async function main() {
  try {
    // 1) Pack for macOS
    await runCommand(`electron-packager . --out ${outDir} --overwrite --platform=darwin --icon=build/icon.icns --asar`);

    // 2) Add LSUIElement string "1" to Info.plist
    const plistCmd = `/usr/libexec/PlistBuddy -c "Add LSUIElement string 1" "${plistPath}"`;
    await runCommand(plistCmd);

    // 3) Create DMG installer
    const dmgCmd = `electron-installer-dmg "${appPath}" "${appName}_${version}" --out "${installerDir}" --icon "./build/icon.icns" --title "${appName}_${version}" --overwrite`;
    await runCommand(dmgCmd);

    console.log('macOS packaging and DMG creation completed successfully!');
  } catch (err) {
    console.error('Error during macOS packaging:', err);
    process.exit(1);
  }
}

main();
