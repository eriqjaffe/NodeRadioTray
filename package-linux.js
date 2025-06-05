const { exec } = require('child_process');
const path = require('path');

const appName = 'NodeRadioTray';
const outDir = 'dist';
const installerDir = path.join(outDir, 'installer');

// Helper to run commands and print output/errors
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
    // 1) Pack x64 linux
    console.log('Packing x64...');
    await runCommand(`electron-packager . --out ${outDir} --overwrite --platform linux --arch x64 --icon=build/icon.png --asar`);

    // 2) Pack ARMv7 linux
    console.log('Packing armv1');
    await runCommand(`electron-packager . --out ${outDir} --overwrite --platform linux --arch armv7l --icon=build/icon.png --asar`);

    // 3) Build Debian installer for x64
    console.log('Building debian-x64');
    await runCommand(`electron-installer-debian --src=./${outDir}/${appName}-linux-x64/ --dest ${installerDir} --arch amd64`);

    // 4) Build RedHat installer for x64
    console.log('Building redhat-x64');
    await runCommand(`electron-installer-redhat --src=./${outDir}/${appName}-linux-x64/ --dest ${installerDir} --arch amd64`);

    // 5) Build Debian installer for ARM
    console.log('Building debian-arm');
    await runCommand(`electron-installer-debian --src=./${outDir}/${appName}-linux-armv7l/ --dest ${installerDir} --arch armv7l`);

    console.log('All Linux packages and installers created successfully!');
  } catch (err) {
    console.error('Error in packaging process:', err);
    process.exit(1);
  }
}

main();
