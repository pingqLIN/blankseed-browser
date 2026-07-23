'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { serializeError } = require('../shared/contracts.cjs');
const {
  attachPersistenceRedaction,
  REDACTION_KEY,
  REDACTION_SCHEMA,
  redactForPersistence
} = require('../shared/persistence-redaction.cjs');

class EventStore {
  constructor(baseDirectory, { sessionId = null } = {}) {
    this.directory = path.join(baseDirectory, 'events');
    this.filePath = path.join(this.directory, 'events.jsonl');
    this.sequence = 0;
    this.sessionId = sessionId;
    fs.mkdirSync(this.directory, { recursive: true });
    this.sequence = this.#readLastSequence();
  }

  append(type, data = {}, context = {}) {
    let persistedData;
    try {
      const redacted = redactForPersistence(data);
      persistedData = attachPersistenceRedaction(redacted.value, redacted.metadata);
    } catch {
      persistedData = {
        [REDACTION_KEY]: {
          schema: REDACTION_SCHEMA,
          status: 'failed_closed'
        }
      };
    }
    const event = {
      eventId: `evt_${crypto.randomUUID()}`,
      sequence: ++this.sequence,
      type,
      timestamp: new Date().toISOString(),
      sessionId: context.sessionId ?? this.sessionId,
      requestId: context.requestId ?? null,
      executionId: context.executionId ?? null,
      evolutionRunId: context.evolutionRunId ?? null,
      multiAgentRunId: context.multiAgentRunId ?? null,
      agentId: context.agentId ?? null,
      handoffId: context.handoffId ?? null,
      governanceDecisionId: context.governanceDecisionId ?? null,
      restoreTransitionId: context.restoreTransitionId ?? null,
      turnId: context.turnId ?? null,
      actionId: context.actionId ?? null,
      data: persistedData
    };
    fs.appendFileSync(this.filePath, `${this.#stringifyEvent(event)}\n`, 'utf8');
    return event;
  }

  tail(limit = 100) {
    if (!fs.existsSync(this.filePath)) return [];
    const lines = fs.readFileSync(this.filePath, 'utf8').trim().split(/\r?\n/).filter(Boolean);
    return lines.slice(-Math.max(1, limit)).map((line) => {
      try { return JSON.parse(line); } catch { return { type: 'event.parse.failed', raw: line }; }
    });
  }

  #readLastSequence() {
    const last = this.tail(1)[0];
    return Number.isInteger(last?.sequence) ? last.sequence : 0;
  }

  #stringifyEvent(event) {
    try {
      return JSON.stringify(event);
    } catch (error) {
      return JSON.stringify({
        ...event,
        type: 'event.serialization.failed',
        data: {
          originalType: event.type,
          error: serializeError(error, 'SERIALIZATION_FAILED')
        }
      });
    }
  }
}

module.exports = { EventStore };
