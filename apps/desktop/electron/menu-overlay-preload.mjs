import { contextBridge, ipcRenderer } from "electron";

let latestRequest = null;
let showCallback = null;

ipcRenderer.on("redrob:menu-overlay:show", (_event, request) => {
  latestRequest = request;
  showCallback?.(request);
});

contextBridge.exposeInMainWorld("__REDROB_MENU_OVERLAY__", {
  ready() {
    ipcRenderer.send("redrob:menu-overlay:ready");
  },
  onShow(callback) {
    showCallback = callback;
    if (latestRequest) {
      callback(latestRequest);
    }
    return () => {
      if (showCallback === callback) {
        showCallback = null;
      }
    };
  },
  choose(requestId, itemId) {
    ipcRenderer.send("redrob:menu-overlay:choose", { requestId, itemId });
  },
  close(requestId) {
    ipcRenderer.send("redrob:menu-overlay:close", { requestId });
  },
});
