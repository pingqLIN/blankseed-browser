'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { channels } = require('../shared/contracts.cjs');
const { EventStore } = require('./event-store.cjs');
const { CheckpointStore } = require('./checkpoint-store.cjs');
const { TargetViewController } = require('./target-view.cjs');
const { ProcessSupervisor } = require('./process-supervisor.cjs');
const { ModuleStore } = require('./module-store.cjs');
const { ModelTurnManager } = require('./model-adapter.cjs');
const { registerIpc } = require('./ipc-router.cjs');

const packageJson = require('../../package.json');
const defaults = require('../../config/defaults.json');

let mainWindow = null;
let target = null;
let cleanupIpc = null;
let processSupervisor = null;
let moduleStore = null;
let modelTurnManager = null;
let eventStore = null;
const sessionId = `ses_${crypto.randomUUID()}`;

function createWindow() {
  const dataRoot = path.join(app.getPath('userData'), 'blankseed-data');
  fs.mkdirSync(dataRoot, { recursive: true });
  eventStore = new EventStore(dataRoot, { sessionId });

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1000,
    minHeight: 680,
    title: 'BlankSeed Browser Starter',
    backgroundColor: '#111418',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  const pushEvent = (event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channels.eventPush, event);
    }
  };

  target = new TargetViewController({
    window: mainWindow,
    controlPanelWidth: defaults.controlPanelWidth,
    initialUrl: defaults.initialUrl,
    worldId: defaults.pageWorldId,
    eventStore,
    pushEvent
  });

  processSupervisor = new ProcessSupervisor({
    eventStore,
    workspaceRoot: path.join(app.getAppPath(), 'workspace'),
    defaultTimeoutMs: defaults.generatedNodeRuntimeTimeoutMs,
    maxLogBytes: defaults.generatedRuntimeMaxLogBytes,
    killGraceMs: defaults.generatedRuntimeKillGraceMs
  });
  moduleStore = new ModuleStore({
    eventStore,
    processSupervisor,
    workspaceRoot: path.join(app.getAppPath(), 'workspace'),
    defaultTimeoutMs: defaults.generatedNodeRuntimeTimeoutMs
  });

  const getStatus = () => ({
    protocol: 'blankseed/0.1',
    appVersion: packageJson.version,
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    sessionId,
    dataRoot,
    config: defaults,
    modules: moduleStore.getState(),
    target: target.getState()
  });

  const checkpointStore = new CheckpointStore(dataRoot, {
    appVersion: packageJson.version,
    eventStore,
    getState: getStatus
  });
  modelTurnManager = new ModelTurnManager({
    eventStore,
    getStatus,
    getEvents: (limit) => eventStore.tail(limit),
    getModules: () => moduleStore.list(),
    defaultTimeoutMs: defaults.modelTurnTimeoutMs,
    eventLimit: defaults.modelContextEventLimit
  });

  cleanupIpc = registerIpc({
    trustedWebContents: mainWindow.webContents,
    target,
    checkpointStore,
    eventStore,
    processSupervisor,
    moduleStore,
    modelTurnManager,
    sessionId,
    getStatus,
    config: defaults
  });

  eventStore.append('app.started', getStatus(), { sessionId });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.on('resize', () => target?.updateBounds());
  mainWindow.on('close', () => {
    eventStore?.append('app.window.closing', {}, { sessionId });
    processSupervisor?.shutdown({ sessionId, requestId: 'req_app_shutdown_runtime' });
    target?.destroy();
    cleanupIpc?.();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    target = null;
    cleanupIpc = null;
    processSupervisor = null;
    moduleStore = null;
    modelTurnManager = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
