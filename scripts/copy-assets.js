const fs = require('fs');
const path = require('path');

// 复制 web/public 到 dist/public (仅保留必要的静态资源)
const srcDir = path.join(__dirname, '..', 'web', 'public');
const destDir = path.join(__dirname, '..', 'dist', 'public');

if (fs.existsSync(srcDir)) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  fs.readdirSync(srcDir).forEach(file => {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);
    fs.copyFileSync(srcPath, destPath);
  });
  
  console.log('[build] Copied web/public -> dist/public');
}

// 复制 system 目录到 dist/system (Tauri 资源)
const systemSrc = path.join(__dirname, '..', 'system');
const systemDest = path.join(__dirname, '..', 'dist', 'system');

if (fs.existsSync(systemSrc)) {
  if (!fs.existsSync(systemDest)) {
    fs.mkdirSync(systemDest, { recursive: true });
  }
  
  function copyDirRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(file => {
      const srcPath = path.join(src, file);
      const destPath = path.join(dest, file);
      if (fs.lstatSync(srcPath).isDirectory()) {
        copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    });
  }
  
  copyDirRecursive(systemSrc, systemDest);
  console.log('[build] Copied system -> dist/system');
}
