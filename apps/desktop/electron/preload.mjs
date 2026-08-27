import { contextBridge, ipcRenderer } from "electron";

const NATIVE_DEEP_LINK_EVENT = "redrob:deep-link-native";
const NATIVE_MENU_OPEN_SETTINGS_EVENT = "redrob:native-menu:open-settings";
const NATIVE_MENU_TOGGLE_SIDEBAR_EVENT = "redrob:native-menu:toggle-sidebar";
const NATIVE_MENU_CHECK_UPDATES_EVENT = "redrob:native-menu:check-updates";
const NATIVE_MENU_ZOOM_EVENT = "redrob:native-menu:zoom";
const AUTOMATION_RUNNER_CREDENTIAL_REJECTED_EVENT = "redrob:automation-runner:credential-rejected";

function normalizePlatform(value) {
  if (value === "darwin" || value === "linux") return value;
  if (value === "win32") return "windows";
  return "linux";
}

function applyShellDocumentMarkers() {
  try {
    const root = document?.documentElement;
    if (!root) return false;

    root.dataset.redrobShell = "electron";
    root.classList.add("redrob-electron");
    if (process.platform === "darwin") {
      root.classList.add("redrob-platform-mac");
    } else if (process.platform === "win32") {
      root.classList.add("redrob-platform-windows");
    } else if (process.platform === "linux") {
      root.classList.add("redrob-platform-linux");
    }
    return true;
  } catch {
    return false;
  }
}

function notifyMenuOverlayDismiss() {
  ipcRenderer.send("redrob:menu-overlay:dismiss");
}

function installMenuOverlayDismissListeners() {
  try {
    const target = window;
    target.addEventListener("pointerdown", notifyMenuOverlayDismiss, { capture: true });
    target.addEventListener("wheel", notifyMenuOverlayDismiss, { capture: true, passive: true });
    target.addEventListener("keydown", notifyMenuOverlayDismiss, { capture: true });
    return true;
  } catch {
    return false;
  }
}

let desktopBootstrap = null;
let desktopDistribution = null;
try {
  desktopBootstrap = ipcRenderer.sendSync("redrob:desktop-bootstrap-sync");
  desktopDistribution = ipcRenderer.sendSync("redrob:desktop-distribution-sync");
} catch {
  desktopBootstrap = null;
  desktopDistribution = null;
}

contextBridge.exposeInMainWorld("__REDROB_ELECTRON__", {
  invokeDesktop(command, ...args) {
    return ipcRenderer.invoke("redrob:desktop", command, ...args);
  },
  automationRunner: {
    onCredentialRejected(callback) {
      const handler = () => callback();
      ipcRenderer.on(AUTOMATION_RUNNER_CREDENTIAL_REJECTED_EVENT, handler);
      return () => ipcRenderer.removeListener(AUTOMATION_RUNNER_CREDENTIAL_REJECTED_EVENT, handler);
    },
  },
  shell: {
    openExternal(url) {
      return ipcRenderer.invoke("redrob:shell:openExternal", url);
    },
    relaunch() {
      return ipcRenderer.invoke("redrob:shell:relaunch");
    },
  },
  system: {
    getArchitectureInfo() {
      return ipcRenderer.invoke("redrob:system:architecture");
    },
    getMicrophoneStatus() {
      return ipcRenderer.invoke("redrob:system:microphoneStatus");
    },
    askMicrophoneAccess() {
      return ipcRenderer.invoke("redrob:system:askMicrophoneAccess");
    },
  },
  migration: {
    readSnapshot() {
      return ipcRenderer.invoke("redrob:migration:read");
    },
    ackSnapshot() {
      return ipcRenderer.invoke("redrob:migration:ack");
    },
  },
  brandIcon: {
    apply(url) {
      return ipcRenderer.invoke("redrob:desktop", "__applyBrandIcon", url ?? null);
    },
    getState() {
      return ipcRenderer.invoke("redrob:desktop", "__getBrandIconState");
    },
  },
  dev: {
    evalRelaunch() {
      return ipcRenderer.invoke("redrob:desktop", "__evalRelaunch");
    },
  },
  nuke: {
    preview(options) {
      return ipcRenderer.invoke("redrob:desktop", "nukeRedrobAndOpencodeConfigPreview", options);
    },
    execute(options) {
      return ipcRenderer.invoke("redrob:desktop", "nukeRedrobAndOpencodeConfigAndExit", options);
    },
  },
  updater: {
    getChannel() {
      return ipcRenderer.invoke("redrob:updater:getChannel");
    },
    setChannel(channel) {
      return ipcRenderer.invoke("redrob:updater:setChannel", channel);
    },
    check(channel, targetVersion) {
      return ipcRenderer.invoke("redrob:updater:check", channel, targetVersion);
    },
    download() {
      return ipcRenderer.invoke("redrob:updater:download");
    },
    installAndRestart() {
      return ipcRenderer.invoke("redrob:updater:installAndRestart");
    },
    /** Subscribe to incremental download progress from electron-updater. */
    onDownloadProgress(callback) {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("redrob:updater:download-progress", handler);
      return () => {
        ipcRenderer.removeListener("redrob:updater:download-progress", handler);
      };
    },
  },
  recovery: {
    recordHealthy() {
      return ipcRenderer.invoke("redrob:recovery:recordHealthy");
    },
    list(policy) {
      return ipcRenderer.invoke("redrob:recovery:list", policy);
    },
    restorePrevious() {
      return ipcRenderer.invoke("redrob:recovery:restorePrevious");
    },
    use(id) {
      return ipcRenderer.invoke("redrob:recovery:use", id);
    },
  },
  browser: {
    show(bounds) { return ipcRenderer.invoke("redrob:browser:show", bounds); },
    hide() { return ipcRenderer.invoke("redrob:browser:hide"); },
    openUrl(url, provider) { return ipcRenderer.invoke("redrob:browser:openUrl", url, provider); },
    navigate(url) { return ipcRenderer.invoke("redrob:browser:navigate", url); },
    back() { return ipcRenderer.invoke("redrob:browser:back"); },
    forward() { return ipcRenderer.invoke("redrob:browser:forward"); },
    reload() { return ipcRenderer.invoke("redrob:browser:reload"); },
    setBounds(bounds) { return ipcRenderer.invoke("redrob:browser:bounds", bounds); },
    getState() { return ipcRenderer.invoke("redrob:browser:state"); },
    createTab(url) { return ipcRenderer.invoke("redrob:browser:createTab", url); },
    closeTab(tabId) { return ipcRenderer.invoke("redrob:browser:closeTab", tabId); },
    closeAllTabs() { return ipcRenderer.invoke("redrob:browser:closeAllTabs"); },
    selectTab(tabId) { return ipcRenderer.invoke("redrob:browser:selectTab", tabId); },
    reorderTabs(tabIds) { return ipcRenderer.invoke("redrob:browser:reorderTabs", tabIds); },
    listTabs() { return ipcRenderer.invoke("redrob:browser:listTabs"); },
    setProxy(proxy) { return ipcRenderer.invoke("redrob:browser:setProxy", proxy); },
    getProxy() { return ipcRenderer.invoke("redrob:browser:getProxy"); },
    showTabContextMenu(tabId, point) { return ipcRenderer.invoke("redrob:browser:tabContextMenu", tabId, point); },
    destroy() { return ipcRenderer.invoke("redrob:browser:destroy"); },
    onStateChange(callback) {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on("redrob:browser:state", handler);
      return () => ipcRenderer.removeListener("redrob:browser:state", handler);
    },
    onPanelOpened(callback) {
      const handler = () => callback();
      ipcRenderer.on("redrob:browser:panel-opened", handler);
      return () => ipcRenderer.removeListener("redrob:browser:panel-opened", handler);
    },
    onPanelClosed(callback) {
      const handler = () => callback();
      ipcRenderer.on("redrob:browser:panel-closed", handler);
      return () => ipcRenderer.removeListener("redrob:browser:panel-closed", handler);
    },
  },
  terminal: {
    create(options) { return ipcRenderer.invoke("redrob:terminal:create", options); },
    write(terminalId, data) { return ipcRenderer.invoke("redrob:terminal:write", terminalId, data); },
    resize(terminalId, cols, rows) { return ipcRenderer.invoke("redrob:terminal:resize", terminalId, cols, rows); },
    kill(terminalId) { return ipcRenderer.invoke("redrob:terminal:kill", terminalId); },
    onData(callback) {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("redrob:terminal:data", handler);
      return () => ipcRenderer.removeListener("redrob:terminal:data", handler);
    },
    onExit(callback) {
      const handler = (_event, payload) => callback(payload);
      ipcRenderer.on("redrob:terminal:exit", handler);
      return () => ipcRenderer.removeListener("redrob:terminal:exit", handler);
    },
  },
  meta: {
    desktopBootstrap,
    distribution: desktopDistribution,
    initialDeepLinks: [],
    platform: normalizePlatform(process.platform),
    version: process.versions.electron,
    evalFatalBootstrapFailure: process.env.REDROB_EVAL_FATAL_DESKTOP_BOOTSTRAP_FAILURE ?? null,
  },
});

if (
  process.env.REDROB_EVAL_FATAL_DESKTOP_BOOTSTRAP_FAILURE
  && (process.env.REDROB_EVAL_RECOVERY_CANDIDATES || process.env.REDROB_EVAL_RECOVERY_RELEASES)
) {
  contextBridge.exposeInMainWorld("__redrobRecoveryControl", {
    snapshot() {
      return ipcRenderer.invoke("redrob:recovery:evalSnapshot");
    },
    select(id) {
      return ipcRenderer.invoke("redrob:recovery:use", id);
    },
  });
}

ipcRenderer.on(NATIVE_DEEP_LINK_EVENT, (_event, urls) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NATIVE_DEEP_LINK_EVENT, { detail: urls }));
});

ipcRenderer.on(NATIVE_MENU_OPEN_SETTINGS_EVENT, () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NATIVE_MENU_OPEN_SETTINGS_EVENT));
});

ipcRenderer.on(NATIVE_MENU_TOGGLE_SIDEBAR_EVENT, () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NATIVE_MENU_TOGGLE_SIDEBAR_EVENT));
});

ipcRenderer.on(NATIVE_MENU_CHECK_UPDATES_EVENT, () => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NATIVE_MENU_CHECK_UPDATES_EVENT));
});

ipcRenderer.on(NATIVE_MENU_ZOOM_EVENT, (_event, action) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NATIVE_MENU_ZOOM_EVENT, { detail: action }));
});

if (!applyShellDocumentMarkers() && typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", applyShellDocumentMarkers, { once: true });
}

if (!installMenuOverlayDismissListeners() && typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", installMenuOverlayDismissListeners, { once: true });
}
