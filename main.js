const { app, BrowserWindow } = require("electron");

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    title: "YuiRoom",
  });

  // 開発中はViteに繋ぐ
  win.loadURL("http://localhost:5173");
}

app.whenReady().then(createWindow);
