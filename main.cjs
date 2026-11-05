const { app, BrowserWindow, protocol, session } = require("electron");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true }
  }
]);

const appDirectory = path.join(__dirname, "dist");
const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".task": "application/octet-stream",
  ".wasm": "application/wasm"
};

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 760,
    backgroundColor: "#111210",
    title: "Gesto em Cena",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.loadURL("app://local/index.html");
}

app.whenReady().then(() => {
  protocol.handle("app", async (request) => {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const filePath = path.resolve(appDirectory, relativePath);

    if (!filePath.startsWith(`${appDirectory}${path.sep}`)) {
      return new Response("Not found", { status: 404 });
    }

    try {
      const contents = await readFile(filePath);
      return new Response(contents, {
        headers: {
          "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
        }
      });
    } catch (error) {
      if (error.code === "ENOENT") return new Response("Not found", { status: 404 });
      throw error;
    }
  });

  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(permission === "media" && details.mediaTypes?.includes("video"));
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
