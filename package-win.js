const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const pkg = require("./package.json");

const appName = pkg.name;
const platform = "win32";
const arch = "x64";
const outDir = "dist";
const version = pkg.version;
const folderName = `${appName}-${platform}-${arch}`;
const fullFolderPath = path.join(outDir, folderName);
const zipName = `${folderName}-${version}-portable.zip`;
const zipPath = path.join(outDir, "installers", zipName);
const installerDest = path.join(outDir, "installers");

console.log(`Packing app to dist/${folderName}...`);

exec(
  `electron-packager . --out=${outDir} --overwrite --platform=${platform} --arch=${arch} --icon=build/icon.ico --asar`,
  (packErr, packStdout, packStderr) => {
    if (packErr) {
      console.error("Error during packaging:", packErr);
      return;
    }
    console.log(packStdout);

    console.log(`Creating zip: ${zipName}`);

    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(`${archive.pointer()} total bytes`);
      console.log("Zip file created successfully.");

      // After zip is done, create the installer
      const iconPath = path.resolve("./images/playing.ico"); // update path as needed
      const animationPath = path.resolve("./build/installer.gif"); // update path as needed
      const srcPath = fullFolderPath;
      const destPath = installerDest;

      // Ensure the installers output directory exists
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }

      console.log("Creating Windows installer...");

      const installerCmd = `electron-installer-windows --icon "${iconPath}" --animation "${animationPath}" --src "${srcPath}" --dest "${destPath}"`;

      exec(installerCmd, (instErr, instStdout, instStderr) => {
        if (instErr) {
          console.error("Error during installer creation:", instErr);
          return;
        }
        console.log(instStdout);
        console.log("Windows installer created successfully.");

        const filesToDelete = [
          path.join(destPath, `${appName}-${version}-setup.msi`),
          path.join(destPath, `${appName}-${version}-full.nupkg`),
        ];

        filesToDelete.forEach((file) => {
          if (fs.existsSync(file)) {
            try {
              fs.unlinkSync(file);
              console.log(`Deleted ${file}`);
            } catch (unlinkErr) {
              console.error(`Failed to delete ${file}:`, unlinkErr);
            }
          } else {
            console.log(`File not found (skipping): ${file}`);
          }
        });
      });
    });

    archive.on("error", (err) => {
      throw err;
    });

    archive.pipe(output);
    archive.directory(fullFolderPath, false);
    archive.finalize();
  }
);
