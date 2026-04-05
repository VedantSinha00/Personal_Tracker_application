const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: {
      offscreen: true
    }
  });

  const svgPath = path.join(__dirname, '../assets/logo.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; padding: 0; overflow: hidden; background: transparent; }
        svg { width: 512px; height: 512px; display: block; }
      </style>
    </head>
    <body>
      ${svgContent}
    </body>
    </html>
  `;

  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);

  // Give it a moment to render
  setTimeout(async () => {
    const image = await win.webContents.capturePage();
    const png = image.toPNG();
    const outputPath = path.join(__dirname, '../assets/logo.png');
    fs.writeFileSync(outputPath, png);
    console.log('Logo rendered successfully to', outputPath);
    app.quit();
  }, 1000);
});
