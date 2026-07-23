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
const { ModelConfigurationController } = require('./model-configuration.cjs');
const { EvolutionRunManager, RawCapabilityDispatcher } = require('./evolution-loop.cjs');
const { MultiAgentRuntime } = require('./multi-agent-runtime.cjs');
const { createSandboxAutoApplyPolicy } = require('./sandbox-auto-apply-policy.cjs');
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
let modelConfiguration = null;
let evolutionRunManager = null;
let multiAgentRuntime = null;
let eventStore = null;
const sessionId = `ses_${crypto.randomUUID()}`;

function createWindow() {
  const dataRoot = process.env.BLANKSEED_DATA_ROOT
    ? path.resolve(process.env.BLANKSEED_DATA_ROOT)
    : path.join(app.getPath('userData'), 'blankseed-data');
  const workspaceRoot = process.env.BLANKSEED_WORKSPACE_ROOT
    ? path.resolve(process.env.BLANKSEED_WORKSPACE_ROOT)
    : path.join(app.getAppPath(), 'workspace');
  const sandboxAutoApplyPolicy = createSandboxAutoApplyPolicy({
    requested: process.env.BLANKSEED_SANDBOX_AGENT_AUTO_APPLY === '1',
    workspaceRoot,
    dataRoot,
    localModelEndpoint: config.localModelEndpoint
  });
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
    config: {
      ...config,
      sandboxAgentAutoApply: sandboxAutoApplyPolicy?.metadata ?? { enabled: false }
    },
    modelAdapters: modelTurnManager?.getCatalog() || [],
    modelConfiguration: modelConfiguration?.getPublicState() || null,
    multiAgentActive: multiAgentRuntime?.getActiveCount() || 0,
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
    adapters: {},
    defaultTimeoutMs: config.modelTurnTimeoutMs,
    eventLimit: config.modelContextEventLimit
  });
  modelConfiguration = new ModelConfigurationController({
    eventStore,
    modelTurnManager,
    localEndpoint: config.localModelEndpoint,
    localModel: config.localModelName,
    environmentOpenAIApiKey: process.env.OPENAI_API_KEY
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
    modelConfiguration,
    dispatcher: rawCapabilityDispatcher,
    checkpointStore,
    workspaceRoot,
    defaultMaxTurns: config.evolutionMaxTurns,
    defaultMaxActions: config.evolutionMaxActions,
    maxObservationChars: config.evolutionObservationMaxChars,
    timeoutPolicyMs: config.modelTurnTimeoutPolicyMs,
    maxEvidenceBytes: config.evolutionMaxEvidenceBytes
  });
  multiAgentRuntime = new MultiAgentRuntime({
    eventStore,
    evolutionRunManager,
    checkpointStore,
    moduleStore,
    workspaceRoot,
    sandboxAutoApplyPolicy
  });

  cleanupIpc = registerIpc({
    trustedWebContents: mainWindow.webContents,
    target,
    checkpointStore,
    eventStore,
    processSupervisor,
    moduleStore,
    modelTurnManager,
    modelConfiguration,
    evolutionRunManager,
    multiAgentRuntime,
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
    multiAgentRuntime?.cancel({}, { sessionId, requestId: 'req_app_shutdown_multi_agent' });
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
    modelConfiguration = null;
    evolutionRunManager = null;
    multiAgentRuntime = null;
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
