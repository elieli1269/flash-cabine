const { app, BrowserWindow, session } = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

function serve(root) {
  const rootResolved = path.resolve(root);
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        let pathname = decodeURIComponent(url.pathname);
        if (pathname.endsWith("/")) pathname += "index.html";
        const relative = pathname.replace(/^[/\\]+/, "");
        const file = path.resolve(rootResolved, relative);
        if (file !== rootResolved && !file.startsWith(rootResolved + path.sep)) {
          res.writeHead(403);
          res.end("interdit");
          return;
        }
        fs.readFile(file, (error, data) => {
          if (error) {
            res.writeHead(404);
            res.end("introuvable");
            return;
          }
          const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
          res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache" });
          res.end(data);
        });
      } catch {
        res.writeHead(400);
        res.end("requête invalide");
      }
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("port"));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

function allowMedia(permission) {
  return permission === "media" || permission === "mediaKeySystem" || permission === "display-capture";
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 390,
    minHeight: 640,
    backgroundColor: "#1c1612",
    title: "Flash Cabine",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadURL(`http://127.0.0.1:${port}/`);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setAppUserModelId("me.flashcabine.app");
  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(allowMedia(permission));
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowMedia(permission));
    const { port } = await serve(path.join(__dirname, "renderer"));
    createWindow(port);
    app.on("second-instance", () => {
      const [win] = BrowserWindow.getAllWindows();
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.focus();
    });
  });
  app.on("window-all-closed", () => app.quit());
}
