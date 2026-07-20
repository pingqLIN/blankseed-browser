'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed Electron preloads cannot import arbitrary local CommonJS modules.
// Keep these transport channel names aligned with src/shared/contracts.cjs.
const channels = Object.freeze({
  statusGet: 'blankseed:status:get',
  targetNavigate: 'blankseed:target:navigate',
  targetBack: 'blankseed:target:back',
  targetForward: 'blankseed:target:forward',
  targetReload: 'blankseed:target:reload',
  targetSnapshot: 'blankseed:target:snapshot',
  pageExecute: 'blankseed:page:execute',
  cdpSend: 'blankseed:cdp:send',
  executionCancel: 'blankseed:execution:cancel',
  checkpointCreate: 'blankseed:checkpoint:create',
  checkpointList: 'blankseed:checkpoint:list',
  checkpointRead: 'blankseed:checkpoint:read',
  checkpointRestore: 'blankseed:checkpoint:restore',
  eventsTail: 'blankseed:events:tail',
  utilityPing: 'blankseed:utility:ping',
  utilityExecute: 'blankseed:utility:execute',
  utilityStop: 'blankseed:utility:stop',
  moduleList: 'blankseed:module:list',
  moduleCreateCandidate: 'blankseed:module:candidate:create',
  moduleTestCandidate: 'blankseed:module:candidate:test',
  moduleCommitCandidate: 'blankseed:module:candidate:commit',
  moduleActivate: 'blankseed:module:activate',
  moduleDeactivate: 'blankseed:module:deactivate',
  moduleRollback: 'blankseed:module:rollback',
  moduleInvoke: 'blankseed:module:invoke',
  modelTurn: 'blankseed:model:turn',
  modelCancel: 'blankseed:model:cancel',
  evolutionRun: 'blankseed:evolution:run',
  evolutionCancel: 'blankseed:evolution:cancel',
  eventPush: 'blankseed:event:push'
});

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload).then((response) => {
    if (!response?.ok) {
      return Promise.reject({
        name: response?.error?.name || 'BlankSeedIpcError',
        message: response?.error?.message || 'BlankSeed IPC request failed.',
        stack: response?.error?.stack || null,
        code: response?.error?.code,
        details: response?.error?.details || {},
        retryable: Boolean(response?.error?.retryable),
        protocol: response?.protocol,
        requestId: response?.requestId
      });
    }
    return response.value;
  });
}

function withOptions(payload, options = {}) {
  const extra = {};
  for (const key of ['requestId', 'targetId', 'documentGeneration', 'timeoutMs', 'cwd', 'environment', 'adapter', 'options', 'maxTurns', 'maxActions']) {
    if (options[key] !== undefined) extra[key] = options[key];
  }
  return Object.keys(extra).length > 0 ? { ...payload, ...extra } : payload;
}

contextBridge.exposeInMainWorld('blankseed', {
  status: {
    get: (options) => invoke(channels.statusGet, withOptions({}, options))
  },
  target: {
    navigate: (url, options) => invoke(channels.targetNavigate, withOptions({ url }, options)),
    back: (options) => invoke(channels.targetBack, withOptions({}, options)),
    forward: (options) => invoke(channels.targetForward, withOptions({}, options)),
    reload: (options) => invoke(channels.targetReload, withOptions({}, options)),
    snapshot: (options) => invoke(channels.targetSnapshot, withOptions({}, options))
  },
  page: {
    execute: (source, options) => invoke(channels.pageExecute, withOptions({ source }, options))
  },
  cdp: {
    send: (method, params, options) => invoke(channels.cdpSend, withOptions({ method, params }, options))
  },
  execution: {
    cancel: (executionId, options) => invoke(
      channels.executionCancel,
      withOptions(executionId ? { executionId } : {}, options)
    )
  },
  checkpoint: {
    create: (label, options) => invoke(channels.checkpointCreate, withOptions({ label }, options)),
    list: (options) => invoke(channels.checkpointList, withOptions({}, options)),
    read: (checkpointId, options) => invoke(channels.checkpointRead, withOptions({ checkpointId }, options)),
    restore: (checkpointId, options) => invoke(channels.checkpointRestore, withOptions({ checkpointId, confirmed: options?.confirmed === true }, options))
  },
  events: {
    tail: (options) => invoke(channels.eventsTail, withOptions({}, options)),
    subscribe: (listener) => {
      const wrapped = (_event, value) => listener(value);
      ipcRenderer.on(channels.eventPush, wrapped);
      return () => ipcRenderer.removeListener(channels.eventPush, wrapped);
    }
  },
  utility: {
    ping: (options) => invoke(channels.utilityPing, withOptions({}, options)),
    execute: (source, options) => invoke(channels.utilityExecute, withOptions({ source }, options)),
    stop: (options) => invoke(channels.utilityStop, withOptions({}, options))
  },
  modules: {
    list: (options) => invoke(channels.moduleList, withOptions({}, options)),
    createCandidate: (manifest, source, options) => invoke(channels.moduleCreateCandidate, withOptions({ manifest, source }, options)),
    testCandidate: (candidateId, options) => invoke(channels.moduleTestCandidate, withOptions({ candidateId }, options)),
    commitCandidate: (candidateId, options) => invoke(channels.moduleCommitCandidate, withOptions({ candidateId }, options)),
    activate: (id, version, options) => invoke(channels.moduleActivate, withOptions({ id, version }, options)),
    deactivate: (id, options) => invoke(channels.moduleDeactivate, withOptions({ id }, options)),
    rollback: (id, version, options) => invoke(channels.moduleRollback, withOptions({ id, version }, options)),
    invoke: (id, options) => invoke(channels.moduleInvoke, withOptions({ id }, options))
  },
  model: {
    turn: (messages, options) => invoke(channels.modelTurn, withOptions({ messages }, options)),
    cancel: (options) => invoke(channels.modelCancel, withOptions({}, options))
  },
  evolution: {
    run: (messages, options) => invoke(channels.evolutionRun, withOptions({ messages }, options)),
    cancel: (evolutionRunId, options) => invoke(
      channels.evolutionCancel,
      withOptions(evolutionRunId ? { evolutionRunId } : {}, options)
    )
  }
});
