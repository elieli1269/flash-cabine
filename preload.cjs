const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("flashCabine", {
  desktop: true,
});
