const {
  app,
  BrowserWindow,
  Tray,
  Menu
} = require("electron");

const path = require("path");

let splash;
let win;
let tray;

function createSplash() {
  splash = new BrowserWindow({
    width: 500,
    height: 320,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, "assets/icon.png"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  splash.loadFile("splash.html");
}

function createMain() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    show: false,
    title: "Feretory",
    icon: path.join(__dirname, "assets/icon.png"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile("index.html");

  setTimeout(() => {
    splash.close();
    win.show();
  }, 2200);

  win.on("close", (e) => {
    e.preventDefault();
    win.hide();
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, "assets/tray.png"));

  tray.setToolTip("Feretory");

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "Open Feretory",
      click: () => win.show()
    },
    {
      label: "Quit",
      click: () => {
        app.exit();
      }
    }
  ]));

  tray.on("double-click", () => win.show());
}

app.whenReady().then(() => {
  createSplash();
  createMain();
  createTray();
});
