const { exec } = require('child_process');
const path = require('path');
const pkg = require('./package.json');

const appName = 'NodeRadioTray';
const outDir = 'dist';
const installerDir = path.join(outDir, 'installer');
const version = pkg.version;

// Architectures supported by Electron for macOS.
const VALID_ARCHS = ['arm64', 'x64'];

function parseArchs() {
  const args = process.argv.slice(2);
  let arch;

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--arch=')) {
      arch = args[i].slice('--arch='.length);
    } else if (args[i] === '--arch') {
      arch = args[++i];
    } else if (!args[i].startsWith('-')) {
      arch = args[i];
    }
  }

  // "all" builds both Intel and Apple Silicon.
  if (arch === 'all') {
    return VALID_ARCHS;
  }

  // Default to the host architecture (arm64 on Apple Silicon).
  if (!arch) {
    arch = process.arch;
  }

  if (!VALID_ARCHS.includes(arch)) {
    throw new Error(`Unsupported macOS architecture "${arch}". Use one of: ${VALID_ARCHS.join(', ')}, all`);
  }

  return [arch];
}

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

async function buildForArch(arch) {
  const appFolderName = `${appName}-darwin-${arch}`;
  const appPath = path.join(outDir, appFolderName, `${appName}.app`);
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  const dmgName = `${appName}_${version}_${arch}`;

  console.log(`\n=== Building macOS ${arch} ===`);

  // 1) Pack for macOS
  await runCommand(`electron-packager . --out ${outDir} --overwrite --platform=darwin --arch=${arch} --icon=build/icon.icns --asar`);

  // 2) Add LSUIElement string "1" to Info.plist
  const plistCmd = `/usr/libexec/PlistBuddy -c "Add LSUIElement string 1" "${plistPath}"`;
  await runCommand(plistCmd);

  // 3) Re-sign the app ad-hoc. This is required on Apple Silicon because
  //    editing Info.plist invalidates the signature that shipped with Electron.
  const signCmd = `codesign --force --deep --sign - "${appPath}"`;
  await runCommand(signCmd);

  // 4) Create DMG installer
  const dmgCmd = `electron-installer-dmg "${appPath}" "${dmgName}" --out "${installerDir}" --icon "./build/icon.icns" --title "${dmgName}" --overwrite`;
  await runCommand(dmgCmd);
}

async function main() {
  try {
    const archs = parseArchs();

    for (const arch of archs) {
      await buildForArch(arch);
    }

    console.log(`\nmacOS packaging and DMG creation completed successfully (${archs.join(', ')})!`);
  } catch (err) {
    console.error('Error during macOS packaging:', err);
    process.exit(1);
  }
}

main();
