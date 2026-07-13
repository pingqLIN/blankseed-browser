'use strict';

const crypto = require('node:crypto');
const {
  assertFreshTarget,
  createExecutionFailure,
  createExecutionResult,
  createProtocolError,
  errorCodes,
  serializeError,
  sha256
} = require('../shared/contracts.cjs');

function buildSnapshotSource({ maxTextChars, maxElements }) {
  return `
    (() => {
      const visible = (el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const nodes = [...document.querySelectorAll('a,button,input,textarea,select,[role],[tabindex]')]
        .filter(visible)
        .slice(0, ${Number(maxElements)})
        .map((el, index) => ({
          ref: 'el_' + index,
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role'),
          name: (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || '').trim().slice(0, 300),
          type: el.getAttribute('type'),
          disabled: Boolean(el.disabled || el.getAttribute('aria-disabled') === 'true')
        }));
      return {
        url: location.href,
        title: document.title,
        text: (document.body?.innerText || '').slice(0, ${Number(maxTextChars)}),
        elements: nodes
      };
    })()
  `;
}

class CapabilityBroker {
  constructor({ webContents, worldId, eventStore, getTargetIdentity, defaultTimeoutMs = 10000 }) {
    this.webContents = webContents;
    this.worldId = worldId;
    this.eventStore = eventStore;
    this.getTargetIdentity = getTargetIdentity;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.debuggerApi = webContents.debugger;
    this.onDebuggerDetach = (_event, reason) => {
      this.eventStore.append('cdp.detached', {
        ...this.getTargetIdentity(),
        reason
      });
    };
    this.debuggerApi?.on?.('detach', this.onDebuggerDetach);
  }

  dispose() {
    this.debuggerApi?.off?.('detach', this.onDebuggerDetach);
  }

  async snapshot({ maxTextChars = 12000, maxElements = 200 } = {}, context = {}) {
    const source = buildSnapshotSource({ maxTextChars, maxElements });
    return this.#run({
      kind: 'page.snapshot',
      eventBase: 'page.snapshot',
      context,
      sourceHash: sha256(JSON.stringify({ maxTextChars, maxElements })),
      startedData: () => ({
        ...this.getTargetIdentity(),
        sourceHash: sha256(JSON.stringify({ maxTextChars, maxElements }))
      }),
      execute: (_eventContext, timeoutMs) => this.#withTimeout(
        this.webContents.executeJavaScriptInIsolatedWorld(this.worldId, [{ code: source }], false),
        timeoutMs
      ),
      completedData: (result) => ({
        ...this.getTargetIdentity(),
        textLength: result?.text?.length ?? 0,
        elementCount: result?.elements?.length ?? 0
      })
    });
  }

  async executePage(source, context = {}) {
    const code = `(async () => {\n${source}\n})()`;
    const sourceHash = sha256(source);
    return this.#run({
      kind: 'page.execute',
      eventBase: 'page.execution',
      context,
      sourceHash,
      startedData: () => ({
        ...this.getTargetIdentity(),
        sourceHash,
        source
      }),
      execute: (_eventContext, timeoutMs) => this.#withTimeout(
        this.webContents.executeJavaScriptInIsolatedWorld(this.worldId, [{ code }], true),
        timeoutMs
      ),
      completedData: (result, durationMs) => ({ durationMs, result })
    });
  }

  async sendCdp(method, params = {}, context = {}) {
    const sourceHash = sha256(JSON.stringify({ method, params }));
    let attachedByBroker = false;
    return this.#run({
      kind: 'cdp.send',
      eventBase: 'cdp.command',
      context,
      sourceHash,
      startedData: () => ({
        method,
        params,
        ...this.getTargetIdentity(),
        sourceHash
      }),
      execute: async (eventContext, timeoutMs) => {
        attachedByBroker = this.#ensureCdpAttached(eventContext);
        return this.#withTimeout(
          this.debuggerApi.sendCommand(method, params),
          timeoutMs,
          () => {
            if (attachedByBroker) this.#detachCdp(eventContext, 'timeout');
          }
        );
      },
      completedData: (result) => ({ method, result }),
      failedData: (error) => ({ method, error: this.#eventError(error) }),
      cleanup: (eventContext) => {
        if (attachedByBroker) this.#detachCdp(eventContext, 'command finished');
      }
    });
  }

  async #run({ kind, eventBase, context, sourceHash, startedData, execute, completedData, failedData, cleanup }) {
    const executionId = `exe_${crypto.randomUUID()}`;
    const startedAt = new Date().toISOString();
    const startedTarget = this.getTargetIdentity();
    const eventContext = { ...context, executionId };

    this.eventStore.append(`${eventBase}.started`, startedData(), eventContext);

    try {
      assertFreshTarget(this.getTargetIdentity(), context.expectedTarget);
      const timeoutMs = context.timeoutMs ?? this.defaultTimeoutMs;
      const result = this.#normalizeResult(await execute(eventContext, timeoutMs));
      assertFreshTarget(this.getTargetIdentity(), startedTarget);
      const durationMs = Date.now() - Date.parse(startedAt);
      this.eventStore.append(`${eventBase}.completed`, completedData(result, durationMs), eventContext);
      cleanup?.(eventContext);
      return createExecutionResult({
        sessionId: context.sessionId,
        requestId: context.requestId,
        executionId,
        kind,
        startedAt,
        sourceHash,
        result
      });
    } catch (error) {
      this.eventStore.append(`${eventBase}.failed`, failedData?.(error) ?? {
        durationMs: Date.now() - Date.parse(startedAt),
        error: this.#eventError(error)
      }, eventContext);
      cleanup?.(eventContext);
      return createExecutionFailure({
        sessionId: context.sessionId,
        requestId: context.requestId,
        executionId,
        kind,
        startedAt,
        sourceHash,
        error
      });
    }
  }

  #ensureCdpAttached(context) {
    if (this.debuggerApi.isAttached()) return false;
    this.eventStore.append('cdp.attach.started', this.getTargetIdentity(), context);
    try {
      this.debuggerApi.attach();
      this.eventStore.append('cdp.attach.completed', this.getTargetIdentity(), context);
      return true;
    } catch (error) {
      const wrapped = createProtocolError(errorCodes.cdpAttachFailed, 'CDP attach failed.', {
        cause: serializeError(error)
      }, true);
      this.eventStore.append('cdp.attach.failed', {
        ...this.getTargetIdentity(),
        error: this.#eventError(wrapped)
      }, context);
      throw wrapped;
    }
  }

  #detachCdp(context, reason) {
    if (!this.debuggerApi.isAttached()) return;
    this.eventStore.append('cdp.detach.started', {
      ...this.getTargetIdentity(),
      reason
    }, context);
    try {
      this.debuggerApi.detach();
      this.eventStore.append('cdp.detach.completed', {
        ...this.getTargetIdentity(),
        reason
      }, context);
    } catch (error) {
      const wrapped = createProtocolError(errorCodes.cdpDetached, 'CDP detach failed.', {
        cause: serializeError(error)
      }, true);
      this.eventStore.append('cdp.detach.failed', {
        ...this.getTargetIdentity(),
        reason,
        error: this.#eventError(wrapped)
      }, context);
      throw wrapped;
    }
  }

  #withTimeout(promise, timeoutMs = this.defaultTimeoutMs, onTimeout = null) {
    let timeout = null;
    promise.catch(() => {});
    const timeoutPromise = new Promise((_resolve, reject) => {
      timeout = setTimeout(() => {
        onTimeout?.();
        reject(createProtocolError(errorCodes.executionTimeout, `Execution exceeded ${timeoutMs} ms.`, {
          timeoutMs
        }, true));
      }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
  }

  #normalizeResult(result) {
    const value = result === undefined ? null : result;
    try {
      JSON.stringify(value);
    } catch (error) {
      throw createProtocolError(errorCodes.serializationFailed, 'Execution result is not JSON serializable.', {
        cause: serializeError(error)
      });
    }
    return value;
  }

  #eventError(error) {
    const serialized = serializeError(error);
    return {
      name: serialized.name,
      message: serialized.message,
      stack: serialized.stack,
      code: serialized.code,
      details: serialized.details,
      retryable: serialized.retryable
    };
  }
}

module.exports = { CapabilityBroker, buildSnapshotSource };
