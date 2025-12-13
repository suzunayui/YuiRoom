const { app, BrowserWindow, shell } = require("electron");

function createWindow() {
  const startUrl = process.env.ELECTRON_START_URL || "http://localhost:5173";
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    title: "YuiRoom",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // 開発中はViteに繋ぐ
  win.setMenu(null);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (typeof url === "string" && /^https?:\\/\\//i.test(url)) {
      try { void shell.openExternal(url); } catch {}
    }
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url === startUrl || url.startsWith(startUrl + "/")) return;
    e.preventDefault();
  });

  win.loadURL(startUrl);
}

app.whenReady().then(createWindow);
