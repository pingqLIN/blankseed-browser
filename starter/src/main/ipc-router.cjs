'use strict';

const { ipcMain } = require('electron');
const crypto = require('node:crypto');
const {
  channels,
  assertIdentifier,
  assertInteger,
  assertPayloadSize,
  assertPlainObject,
  assertString,
  createProtocolError,
  errorCodes,
  serializeError
} = require('../shared/contracts.cjs');

function registerIpc({ trustedWebContents, target, checkpointStore, eventStore, processSupervisor, moduleStore, modelTurnManager, modelConfiguration, evolutionRunManager, multiAgentRuntime, sessionId, getStatus, config }) {
  const handlers = [];
  const seenRequestIds = new Set();
  const payloadLimit = config.ipcPayloadLimitBytes;

  const normalizePayload = (payload) => {
    const value = payload === undefined ? {} : payload;
    assertPlainObject(value, 'payload');
    assertPayloadSize(value, payloadLimit);
    const requestId = value.requestId === undefined
      ? `req_${crypto.randomUUID()}`
      : assertIdentifier(value.requestId, 'requestId', 'req');
    return { payload: value, requestId };
  };

  const recordRequestId = (requestId) => {
    if (seenRequestIds.has(requestId)) {
      throw createProtocolError(errorCodes.duplicateRequestId, `Duplicate requestId: ${requestId}.`);
    }
    seenRequestIds.add(requestId);
  };

  const getExpectedTarget = (payload) => {
    const expected = {};
    if (payload.targetId !== undefined) {
      expected.targetId = assertInteger(payload.targetId, 'targetId', { min: 1 });
    }
    if (payload.documentGeneration !== undefined) {
      expected.documentGeneration = assertInteger(payload.documentGeneration, 'documentGeneration', { min: 0 });
    }
    return Object.keys(expected).length > 0 ? expected : null;
  };

  const waitForRestoreIdle = async (context) => {
    evolutionRunManager.cancel({}, context);
    multiAgentRuntime.cancel({}, context);
    modelTurnManager.cancel(context);
    const targetCancellation = target.cancelExecutions({}, context);
    const runtime = await processSupervisor.stop(context);
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && (evolutionRunManager.getActiveCount() > 0 || modelTurnManager.getActiveCount() > 0 || multiAgentRuntime.getActiveCount() > 0)) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const active = {
      evolutionRuns: evolutionRunManager.getActiveCount(),
      modelTurns: modelTurnManager.getActiveCount(),
      multiAgentRuns: multiAgentRuntime.getActiveCount(),
      nodeExecutions: processSupervisor.getActiveCount(),
      pageExecutions: targetCancellation.remaining
    };
    if (Object.values(active).some((count) => count > 0)) {
      throw createProtocolError(errorCodes.checkpointFailed, 'Runtime did not reach an idle state before Checkpoint restore.', { active }, true);
    }
    return { active, stopped: runtime.stopped, cancelledPageExecutions: targetCancellation.cancelled };
  };

  const handle = (channel, kind, fn, { evented = true } = {}) => {
    const wrapped = async (event, payload) => {
      let requestId = null;
      if (event.sender.id !== trustedWebContents.id) {
        throw Object.assign(new Error('IPC sender is not the trusted control renderer.'), { code: 'UNTRUSTED_SENDER' });
      }
      const startedAt = Date.now();
      try {
        if (payload && typeof payload === 'object' && typeof payload.requestId === 'string' && payload.requestId.startsWith('req_')) {
          requestId = payload.requestId;
        }
        const prepared = normalizePayload(payload);
        requestId = prepared.requestId;
        recordRequestId(requestId);
        if (evented) {
          eventStore.append('ipc.request.started', { channel, kind }, { sessionId, requestId });
        }
        const value = await fn(prepared.payload, {
          requestId,
          sessionId,
          kind,
          timeoutMs: config.pageExecutionTimeoutMs,
          expectedTarget: getExpectedTarget(prepared.payload)
        });
        if (evented) {
          eventStore.append('ipc.request.completed', {
            channel,
            kind,
            durationMs: Date.now() - startedAt
          }, { sessionId, requestId });
        }
        return { ok: true, protocol: 'blankseed/0.1', requestId, value };
      } catch (error) {
        const serialized = serializeError(error);
        eventStore.append('ipc.request.failed', {
          channel,
          kind,
          durationMs: Date.now() - startedAt,
          error: serialized
        }, { sessionId, requestId });
        return { ok: false, protocol: 'blankseed/0.1', requestId, error: serialized };
      }
    };
    ipcMain.handle(channel, wrapped);
    handlers.push(channel);
  };

  handle(channels.statusGet, 'status.get', async () => getStatus(), { evented: false });
  handle(channels.targetNavigate, 'target.navigate', async (payload) => {
    assertPlainObject(payload, 'payload');
    await target.navigate(assertString(payload.url, 'url', { max: 8192 }));
    return target.getState();
  });
  handle(channels.targetBack, 'target.back', async () => ({ changed: target.back() }));
  handle(channels.targetForward, 'target.forward', async () => ({ changed: target.forward() }));
  handle(channels.targetReload, 'target.reload', async () => { target.reload(); return { changed: true }; });
  handle(channels.targetSnapshot, 'page.snapshot', async (payload = {}, context) => {
    if (payload !== undefined) assertPlainObject(payload, 'payload');
    return target.snapshot({
      maxTextChars: config.snapshotMaxTextChars,
      maxElements: config.snapshotMaxElements
    }, context);
  });
  handle(channels.pageExecute, 'page.execute', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    return target.execute(assertString(payload.source, 'source', { max: 1_000_000 }), context);
  });
  handle(channels.cdpSend, 'cdp.send', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    const method = assertString(payload.method, 'method', { max: 300 });
    const params = payload.params === undefined ? {} : assertPlainObject(payload.params, 'params');
    return target.sendCdp(method, params, context);
  });
  handle(channels.executionCancel, 'execution.cancel', async (payload = {}, context) => {
    assertPlainObject(payload, 'payload');
    const executionId = payload.executionId === undefined
      ? undefined
      : assertIdentifier(payload.executionId, 'executionId', 'exe');
    return target.cancelExecutions({ executionId }, context);
  });
  handle(channels.checkpointCreate, 'checkpoint.create', async (payload = {}, context) => {
    if (payload !== undefined) assertPlainObject(payload, 'payload');
    return checkpointStore.create(payload.label ?? 'manual checkpoint', context);
  });
  handle(channels.checkpointList, 'checkpoint.list', async () => checkpointStore.list(), { evented: false });
  handle(channels.checkpointRead, 'checkpoint.read', async (payload) => {
    assertPlainObject(payload, 'payload');
    return checkpointStore.read(assertIdentifier(payload.checkpointId, 'checkpointId', 'chk'));
  }, { evented: false });
  handle(channels.checkpointRestore, 'checkpoint.restore', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    if (payload.confirmed !== true) {
      throw createProtocolError(errorCodes.invalidRequest, 'Checkpoint restore requires explicit operator confirmation.');
    }
    const checkpointId = assertIdentifier(payload.checkpointId, 'checkpointId', 'chk');
    const stopped = await waitForRestoreIdle(context);
    const restored = checkpointStore.restore(checkpointId, { confirmed: true }, context);
    return { ...restored, stopped };
  });
  handle(channels.eventsTail, 'events.tail', async () => eventStore.tail(config.eventTailLimit), { evented: false });
  handle(channels.utilityPing, 'utility.ping', async (_payload, context) => processSupervisor.ping(context));
  handle(channels.utilityExecute, 'node.execute', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    if (!config.generatedNodeRuntimeEnabled) {
      throw createProtocolError(errorCodes.invalidRequest, 'Generated Node runtime is disabled by configuration.');
    }
    const timeoutMs = payload.timeoutMs === undefined
      ? config.generatedNodeRuntimeTimeoutMs
      : assertInteger(payload.timeoutMs, 'timeoutMs', { min: 1, max: 300000 });
    const environment = payload.environment === undefined ? {} : assertPlainObject(payload.environment, 'environment');
    const cwd = payload.cwd === undefined ? undefined : assertString(payload.cwd, 'cwd', { min: 1, max: 4096 });
    return processSupervisor.execute({
      source: assertString(payload.source, 'source', { max: 1_000_000 }),
      cwd,
      timeoutMs,
      environment
    }, { ...context, kind: 'node.execute' });
  });
  handle(channels.utilityStop, 'node.stop', async (_payload, context) => processSupervisor.stop(context));
  handle(channels.moduleList, 'module.list', async () => moduleStore.list(), { evented: false });
  handle(channels.moduleCreateCandidate, 'module.candidate.create', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    return moduleStore.createCandidate({
      manifest: payload.manifest === undefined ? {} : assertPlainObject(payload.manifest, 'manifest'),
      source: assertString(payload.source, 'source', { max: 1_000_000 })
    }, context);
  });
  handle(channels.moduleTestCandidate, 'module.candidate.test', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    return moduleStore.testCandidate(assertString(payload.candidateId, 'candidateId', { max: 120 }), context);
  });
  handle(channels.moduleCommitCandidate, 'module.candidate.commit', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    return moduleStore.commitCandidate(assertString(payload.candidateId, 'candidateId', { max: 120 }), context);
  });
  handle(channels.moduleActivate, 'module.activate', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    return moduleStore.activate({
      id: assertString(payload.id, 'id', { max: 120 }),
      version: assertString(payload.version, 'version', { max: 80 })
    }, context);
  });
  handle(channels.moduleDeactivate, 'module.deactivate', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    return moduleStore.deactivate({ id: assertString(payload.id, 'id', { max: 120 }) }, context);
  });
  handle(channels.moduleRollback, 'module.rollback', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    return moduleStore.rollback({
      id: assertString(payload.id, 'id', { max: 120 }),
      version: assertString(payload.version, 'version', { max: 80 })
    }, context);
  });
  handle(channels.moduleInvoke, 'module.invoke', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    const timeoutMs = payload.timeoutMs === undefined
      ? config.generatedNodeRuntimeTimeoutMs
      : assertInteger(payload.timeoutMs, 'timeoutMs', { min: 1, max: 300000 });
    return moduleStore.invoke({
      id: assertString(payload.id, 'id', { max: 120 }),
      environment: payload.environment === undefined ? {} : assertPlainObject(payload.environment, 'environment'),
      timeoutMs
    }, context);
  });
  handle(channels.modelTurn, 'model.turn', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    const timeoutMs = payload.timeoutMs === undefined
      ? config.modelTurnTimeoutMs
      : assertInteger(payload.timeoutMs, 'timeoutMs', { min: 1, max: 300000 });
    return modelTurnManager.turn({ ...payload, timeoutMs }, context);
  });
  handle(channels.modelCancel, 'model.cancel', async (_payload, context) => modelTurnManager.cancel(context));
  handle(channels.modelConfigurationGet, 'model.configuration.get', async () => modelConfiguration.getPublicState(), { evented: false });
  handle(channels.modelConfigurationLocalUpdate, 'model.configuration.local.update', async (payload, context) => {
    return modelConfiguration.updateLocal(payload, context);
  });
  handle(channels.modelConfigurationOpenAISet, 'model.configuration.openai.set', async (payload, context) => {
    return modelConfiguration.setSessionOpenAICredential(payload, context);
  });
  handle(channels.modelConfigurationOpenAIClear, 'model.configuration.openai.clear', async (_payload, context) => {
    return modelConfiguration.clearSessionOpenAICredential(context);
  });
  handle(channels.evolutionRun, 'evolution.run', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    const timeoutMs = payload.timeoutMs === undefined
      ? config.modelTurnTimeoutMs
      : assertInteger(payload.timeoutMs, 'timeoutMs', { min: 1, max: 300000 });
    return evolutionRunManager.run({ ...payload, timeoutMs }, context);
  });
  handle(channels.evolutionCancel, 'evolution.cancel', async (payload = {}, context) => {
    assertPlainObject(payload, 'payload');
    const evolutionRunId = payload.evolutionRunId === undefined
      ? undefined
      : assertIdentifier(payload.evolutionRunId, 'evolutionRunId', 'evo');
    return evolutionRunManager.cancel({ evolutionRunId }, context);
  });
  handle(channels.multiAgentRun, 'multi_agent.run', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    return multiAgentRuntime.run(payload, context);
  });
  handle(channels.multiAgentCancel, 'multi_agent.cancel', async (payload = {}, context) => {
    assertPlainObject(payload, 'payload');
    const multiAgentRunId = payload.multiAgentRunId === undefined
      ? undefined
      : assertIdentifier(payload.multiAgentRunId, 'multiAgentRunId', 'mar');
    return multiAgentRuntime.cancel({ multiAgentRunId }, context);
  });
  handle(channels.multiAgentList, 'multi_agent.list', async () => multiAgentRuntime.list(), { evented: false });
  handle(channels.governanceApply, 'governance.apply', async (payload, context) => {
    assertPlainObject(payload, 'payload');
    if (payload.confirmed !== true) {
      throw createProtocolError(errorCodes.invalidRequest, 'Governance apply requires explicit operator confirmation.');
    }
    return multiAgentRuntime.apply(
      assertIdentifier(payload.governanceDecisionId, 'governanceDecisionId', 'gov'),
      { confirmed: true, operatorId: 'operator.local' },
      context
    );
  });

  return () => {
    for (const channel of handlers) ipcMain.removeHandler(channel);
  };
}

module.exports = { registerIpc };
