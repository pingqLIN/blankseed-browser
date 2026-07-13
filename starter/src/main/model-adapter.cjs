'use strict';

const crypto = require('node:crypto');
const {
  createProtocolError,
  errorCodes,
  serializeError,
  sha256
} = require('../shared/contracts.cjs');

const PROTOCOL = 'blankseed/0.1';

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createProtocolError(errorCodes.executionCancelled, 'Model turn was cancelled.', {}, true));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(createProtocolError(errorCodes.executionCancelled, 'Model turn was cancelled.', {}, true));
    }, { once: true });
  });
}

function assertNoSecrets(payload = {}) {
  const denied = ['apikey', 'secret', 'token', 'password', 'credential', 'credentials', 'secrets'];
  const blocked = [];
  const visit = (value, prefix = '') => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (denied.some((pattern) => key.toLowerCase().includes(pattern))) blocked.push(path);
      visit(child, path);
    }
  };
  visit(payload);
  if (blocked.length > 0) {
    throw createProtocolError(errorCodes.invalidRequest, 'Model turn payload must not include secrets or credentials.', {
      blockedKeys: blocked
    });
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw createProtocolError(errorCodes.invalidRequest, 'messages must be a non-empty array.');
  }
  return messages.map((message, index) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw createProtocolError(errorCodes.invalidRequest, 'message must be an object.', { index });
    }
    const role = String(message.role || '').trim();
    const content = String(message.content || '');
    if (!['system', 'user', 'assistant', 'tool'].includes(role) || content.length === 0) {
      throw createProtocolError(errorCodes.invalidRequest, 'message role/content are invalid.', { index, role });
    }
    return { role, content: content.slice(0, 12000) };
  });
}

function packageContext({ status, events, modules, eventLimit = 40 }) {
  const context = {
    protocol: PROTOCOL,
    createdAt: new Date().toISOString(),
    appVersion: status?.appVersion ?? null,
    sessionId: status?.sessionId ?? null,
    target: status?.target ? {
      url: status.target.url,
      title: status.target.title,
      targetId: status.target.targetId,
      documentGeneration: status.target.documentGeneration
    } : null,
    config: status?.config ? {
      researchProfile: status.config.researchProfile,
      generatedNodeRuntimeEnabled: Boolean(status.config.generatedNodeRuntimeEnabled),
      pageWorldId: status.config.pageWorldId
    } : null,
    modules: modules ? {
      active: modules.active || {},
      committedCount: Array.isArray(modules.modules) ? modules.modules.length : 0,
      candidateCount: Array.isArray(modules.candidates) ? modules.candidates.length : 0
    } : null,
    events: (events || []).slice(-eventLimit).map((event) => ({
      sequence: event.sequence,
      type: event.type,
      requestId: event.requestId,
      executionId: event.executionId,
      timestamp: event.timestamp,
      dataSummary: summarizeEventData(event.data)
    }))
  };
  return {
    ...context,
    contextHash: sha256(JSON.stringify(context))
  };
}

function summarizeEventData(data = {}) {
  if (data.error?.code) return { errorCode: data.error.code, message: data.error.message };
  if (data.moduleId) return { moduleId: data.moduleId, version: data.version, status: data.status };
  if (data.channel) return { channel: data.channel, kind: data.kind };
  if (data.sourceHash) return { sourceHash: data.sourceHash };
  if (data.url) return { url: data.url };
  return {};
}

class LocalManualAdapter {
  constructor({ id = 'local.manual' } = {}) {
    this.id = id;
  }

  async run({ messages, contextPackage, signal, options = {} }) {
    await sleep(options.delayMs ?? 0, signal);
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    return {
      role: 'assistant',
      content: options.response || [
        'local.manual adapter response',
        `lastUser: ${lastUser?.content ?? 'none'}`,
        `target: ${contextPackage.target?.url ?? 'none'}`,
        `activeModules: ${Object.keys(contextPackage.modules?.active || {}).length}`,
        `contextHash: ${contextPackage.contextHash}`
      ].join('\n'),
      toolRequests: []
    };
  }
}

class ModelTurnManager {
  constructor({ eventStore, getStatus, getEvents, getModules, adapters = {}, defaultTimeoutMs = 30000, eventLimit = 40 }) {
    this.eventStore = eventStore;
    this.getStatus = getStatus;
    this.getEvents = getEvents;
    this.getModules = getModules;
    this.adapters = new Map(Object.entries(adapters));
    this.adapters.set('local.manual', this.adapters.get('local.manual') || new LocalManualAdapter());
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.eventLimit = eventLimit;
    this.active = new Map();
  }

  async turn(payload = {}, context = {}) {
    assertNoSecrets(payload);
    const adapterId = payload.adapter || 'local.manual';
    const adapter = this.adapters.get(adapterId);
    if (!adapter) {
      throw createProtocolError(errorCodes.invalidRequest, 'Unknown model adapter.', { adapter: adapterId });
    }
    const messages = normalizeMessages(payload.messages);
    const timeoutMs = payload.timeoutMs ?? this.defaultTimeoutMs;
    const turnId = `turn_${crypto.randomUUID()}`;
    const startedAt = new Date().toISOString();
    const controller = new AbortController();
    const turnContext = { ...context };
    const contextPackage = packageContext({
      status: this.getStatus(),
      events: this.getEvents(this.eventLimit),
      modules: this.getModules(),
      eventLimit: this.eventLimit
    });

    this.eventStore.append('model.context.packaged', {
      turnId,
      adapter: adapterId,
      contextHash: contextPackage.contextHash,
      eventCount: contextPackage.events.length
    }, turnContext);
    this.eventStore.append('model.turn.started', {
      turnId,
      adapter: adapterId,
      messageCount: messages.length,
      timeoutMs
    }, turnContext);

    const timeout = setTimeout(() => controller.abort('timeout'), timeoutMs);
    const record = { controller, turnId, adapter: adapterId };
    this.active.set(turnId, record);
    try {
      const output = await adapter.run({
        messages,
        contextPackage,
        signal: controller.signal,
        options: payload.options || {}
      });
      clearTimeout(timeout);
      this.active.delete(turnId);
      const result = this.#result({
        adapterId,
        contextHash: contextPackage.contextHash,
        contextPackage,
        context,
        messages,
        output,
        startedAt,
        status: 'ok',
        turnId
      });
      this.eventStore.append('model.turn.completed', {
        turnId,
        adapter: adapterId,
        contextHash: contextPackage.contextHash
      }, turnContext);
      return result;
    } catch (error) {
      clearTimeout(timeout);
      this.active.delete(turnId);
      const finalError = controller.signal.aborted && controller.signal.reason === 'timeout'
        ? createProtocolError(errorCodes.executionTimeout, `Model turn exceeded ${timeoutMs} ms.`, { timeoutMs }, true)
        : error;
      const result = this.#result({
        adapterId,
        contextHash: contextPackage.contextHash,
        contextPackage,
        context,
        error: finalError,
        messages,
        output: null,
        startedAt,
        status: 'error',
        turnId
      });
      this.eventStore.append('model.turn.failed', {
        turnId,
        adapter: adapterId,
        error: serializeError(finalError)
      }, turnContext);
      return result;
    }
  }

  cancel(context = {}) {
    const active = [...this.active.values()];
    this.eventStore.append('model.turn.cancel.requested', {
      activeTurns: active.map((record) => ({ turnId: record.turnId, adapter: record.adapter }))
    }, context);
    for (const record of active) record.controller.abort('cancel');
    this.eventStore.append('model.turn.cancel.completed', {
      cancelled: active.length
    }, context);
    return { cancelled: active.length };
  }

  #result({ adapterId, contextHash, contextPackage, context, error = null, messages, output, startedAt, status, turnId }) {
    const finishedAt = new Date().toISOString();
    return {
      protocol: PROTOCOL,
      sessionId: context.sessionId,
      requestId: context.requestId,
      turnId,
      kind: 'model.turn.result',
      adapter: adapterId,
      status,
      startedAt,
      finishedAt,
      durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
      contextHash,
      messages,
      contextPackage,
      output,
      error: error ? serializeError(error) : null
    };
  }
}

module.exports = {
  LocalManualAdapter,
  ModelTurnManager,
  assertNoSecrets,
  normalizeMessages,
  packageContext
};
