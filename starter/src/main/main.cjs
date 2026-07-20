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
const { HostedOpenAIResponsesAdapter, LocalOpenAICompatibleAdapter, ModelTurnManager } = require('./model-adapter.cjs');
const { EvolutionRunManager, RawCapabilityDispatcher } = require('./evolution-loop.cjs');
const { registerIpc } = require('./ipc-router.cjs');

const packageJson = require('../../package.json');
const defaults = require('../../config/defaults.json');
const config = Object.freeze({
  ...defaults,
  localModelEndpoint: process.env.BLANKSEED_LOCAL_MODEL_ENDPOINT || defaults.localModelEndpoint,
  localModelName: process.env.BLANKSEED_LOCAL_MODEL_NAME || defaults.localModelName
});

let mainWindow = null;
let target = null;
let cleanupIpc = null;
let processSupervisor = null;
let moduleStore = null;
let modelTurnManager = null;
let evolutionRunManager = null;
let eventStore = null;
const sessionId = `ses_${crypto.randomUUID()}`;

function createWindow() {
  const dataRoot = path.join(app.getPath('userData'), 'blankseed-data');
  const workspaceRoot = process.env.BLANKSEED_WORKSPACE_ROOT
    ? path.resolve(process.env.BLANKSEED_WORKSPACE_ROOT)
    : path.join(app.getAppPath(), 'workspace');
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
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
    controlPanelWidth: config.controlPanelWidth,
    initialUrl: config.initialUrl,
    worldId: config.pageWorldId,
    eventStore,
    pushEvent
  });

  processSupervisor = new ProcessSupervisor({
    eventStore,
    workspaceRoot,
    defaultTimeoutMs: config.generatedNodeRuntimeTimeoutMs,
    maxLogBytes: config.generatedRuntimeMaxLogBytes,
    killGraceMs: config.generatedRuntimeKillGraceMs
  });
  moduleStore = new ModuleStore({
    eventStore,
    processSupervisor,
    workspaceRoot,
    defaultTimeoutMs: config.generatedNodeRuntimeTimeoutMs
  });

  const getStatus = () => ({
    protocol: 'blankseed/0.1',
    appVersion: packageJson.version,
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    node: process.versions.node,
    sessionId,
    dataRoot,
    config,
    modelAdapters: modelTurnManager?.getCatalog() || [],
    modules: moduleStore.getState(),
    target: target.getState()
  });

  const checkpointStore = new CheckpointStore(dataRoot, {
    appVersion: packageJson.version,
    eventStore,
    getState: getStatus,
    moduleStore
  });
  modelTurnManager = new ModelTurnManager({
    eventStore,
    getStatus,
    getEvents: (limit) => eventStore.tail(limit),
    getModules: () => moduleStore.list(),
    adapters: {
      'local.openai-compatible': new LocalOpenAICompatibleAdapter({
        endpoint: config.localModelEndpoint,
        model: config.localModelName
      }),
      'openai.gpt-5.6-sol': new HostedOpenAIResponsesAdapter({
        id: 'openai.gpt-5.6-sol',
        label: 'OpenAI GPT-5.6 Sol',
        model: 'gpt-5.6-sol',
        apiKey: process.env.OPENAI_API_KEY
      }),
      'openai.gpt-5.6-terra': new HostedOpenAIResponsesAdapter({
        id: 'openai.gpt-5.6-terra',
        label: 'OpenAI GPT-5.6 Terra',
        model: 'gpt-5.6-terra',
        apiKey: process.env.OPENAI_API_KEY
      }),
      'openai.gpt-5.6-luna': new HostedOpenAIResponsesAdapter({
        id: 'openai.gpt-5.6-luna',
        label: 'OpenAI GPT-5.6 Luna',
        model: 'gpt-5.6-luna',
        apiKey: process.env.OPENAI_API_KEY
      })
    },
    defaultTimeoutMs: config.modelTurnTimeoutMs,
    eventLimit: config.modelContextEventLimit
  });
  const rawCapabilityDispatcher = new RawCapabilityDispatcher({
    target,
    checkpointStore,
    eventStore,
    processSupervisor,
    moduleStore,
    config
  });
  evolutionRunManager = new EvolutionRunManager({
    eventStore,
    modelTurnManager,
    dispatcher: rawCapabilityDispatcher,
    checkpointStore,
    workspaceRoot,
    defaultMaxTurns: config.evolutionMaxTurns,
    defaultMaxActions: config.evolutionMaxActions,
    maxEvidenceBytes: config.evolutionMaxEvidenceBytes
  });

  cleanupIpc = registerIpc({
    trustedWebContents: mainWindow.webContents,
    target,
    checkpointStore,
    eventStore,
    processSupervisor,
    moduleStore,
    modelTurnManager,
    evolutionRunManager,
    sessionId,
    getStatus,
    config
  });

  eventStore.append('app.started', getStatus(), { sessionId });

  const smokeNonce = process.env.BLANKSEED_SMOKE_NONCE;
  mainWindow.loadFile(
    path.join(__dirname, '..', 'renderer', 'index.html'),
    smokeNonce ? { query: { blankseedSmokeNonce: smokeNonce } } : undefined
  );
  mainWindow.on('resize', () => target?.updateBounds());
  mainWindow.on('close', () => {
    eventStore?.append('app.window.closing', {}, { sessionId });
    evolutionRunManager?.cancel({}, { sessionId, requestId: 'req_app_shutdown_evolution' });
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
    evolutionRunManager = null;
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
