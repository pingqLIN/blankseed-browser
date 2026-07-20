'use strict';

const {
  HostedOpenAIResponsesAdapter,
  LocalOpenAICompatibleAdapter,
  OPENAI_RESPONSES_ENDPOINT,
  normalizeLoopbackEndpoint
} = require('./model-adapter.cjs');
const {
  assertPlainObject,
  assertString,
  createProtocolError,
  errorCodes
} = require('../shared/contracts.cjs');

const DEFAULT_OPENAI_MODELS = Object.freeze([
  Object.freeze({ id: 'openai.gpt-5.6-sol', label: 'OpenAI GPT-5.6 Sol', model: 'gpt-5.6-sol' }),
  Object.freeze({ id: 'openai.gpt-5.6-terra', label: 'OpenAI GPT-5.6 Terra', model: 'gpt-5.6-terra' }),
  Object.freeze({ id: 'openai.gpt-5.6-luna', label: 'OpenAI GPT-5.6 Luna', model: 'gpt-5.6-luna' })
]);

class ModelConfigurationController {
  constructor({
    eventStore,
    modelTurnManager,
    localEndpoint,
    localModel,
    environmentOpenAIApiKey = '',
    openAIModels = DEFAULT_OPENAI_MODELS
  }) {
    this.eventStore = eventStore;
    this.modelTurnManager = modelTurnManager;
    this.localEndpoint = normalizeLoopbackEndpoint(localEndpoint);
    this.localModel = normalizeModelName(localModel);
    this.environmentOpenAIApiKey = normalizeOptionalCredential(environmentOpenAIApiKey);
    this.sessionOpenAIApiKey = null;
    this.openAIModels = openAIModels.map(normalizeOpenAIModel);
    this.#replaceAdapters();
  }

  getPublicState() {
    const credentialSource = this.sessionOpenAIApiKey
      ? 'session'
      : (this.environmentOpenAIApiKey ? 'environment' : 'none');
    return {
      local: {
        endpoint: this.localEndpoint,
        model: this.localModel,
        scope: 'session',
        credentialBoundary: 'none'
      },
      openAI: {
        endpoint: OPENAI_RESPONSES_ENDPOINT,
        models: this.openAIModels.map(({ id, label, model }) => ({ id, label, model })),
        credentialConfigured: credentialSource !== 'none',
        credentialSource,
        persistence: 'memory-only'
      }
    };
  }

  updateLocal(payload, context = {}) {
    assertPlainObject(payload, 'payload');
    const endpoint = normalizeLoopbackEndpoint(assertString(payload.endpoint, 'endpoint', { min: 1, max: 2048 }));
    const model = normalizeModelName(assertString(payload.model, 'model', { min: 1, max: 120 }));
    const previous = { endpoint: this.localEndpoint, model: this.localModel };
    this.localEndpoint = endpoint;
    this.localModel = model;
    try {
      this.#replaceAdapters();
    } catch (error) {
      this.localEndpoint = previous.endpoint;
      this.localModel = previous.model;
      throw error;
    }
    this.eventStore.append('model.configuration.local.updated', { endpoint, model }, context);
    return this.getPublicState();
  }

  setSessionOpenAICredential(payload, context = {}) {
    assertPlainObject(payload, 'payload');
    const apiKey = normalizeRequiredCredential(payload.apiKey);
    const previous = this.sessionOpenAIApiKey;
    this.sessionOpenAIApiKey = apiKey;
    try {
      this.#replaceAdapters();
    } catch (error) {
      this.sessionOpenAIApiKey = previous;
      throw error;
    }
    this.eventStore.append('model.configuration.openai.updated', {
      credentialConfigured: true,
      credentialSource: 'session'
    }, context);
    return this.getPublicState();
  }

  clearSessionOpenAICredential(context = {}) {
    const previous = this.sessionOpenAIApiKey;
    this.sessionOpenAIApiKey = null;
    try {
      this.#replaceAdapters();
    } catch (error) {
      this.sessionOpenAIApiKey = previous;
      throw error;
    }
    const state = this.getPublicState();
    this.eventStore.append('model.configuration.openai.cleared', {
      credentialConfigured: state.openAI.credentialConfigured,
      credentialSource: state.openAI.credentialSource
    }, context);
    return state;
  }

  #replaceAdapters() {
    const apiKey = this.sessionOpenAIApiKey || this.environmentOpenAIApiKey;
    const adapters = {
      'local.openai-compatible': new LocalOpenAICompatibleAdapter({
        endpoint: this.localEndpoint,
        model: this.localModel
      })
    };
    for (const definition of this.openAIModels) {
      adapters[definition.id] = new HostedOpenAIResponsesAdapter({
        ...definition,
        apiKey
      });
    }
    this.modelTurnManager.replaceAdapters(adapters);
  }
}

function normalizeModelName(value) {
  const model = String(value || '').trim();
  if (!model || model.length > 120) {
    throw createProtocolError(errorCodes.invalidRequest, 'Local model name must be a non-empty string of at most 120 characters.');
  }
  return model;
}

function normalizeOptionalCredential(value) {
  if (value === undefined || value === null || value === '') return '';
  return normalizeRequiredCredential(value);
}

function normalizeRequiredCredential(value) {
  if (typeof value !== 'string') {
    throw createProtocolError(errorCodes.invalidRequest, 'OpenAI API key must be a string.');
  }
  const credential = value.trim();
  if (!credential || credential.length > 4096 || /[\r\n]/.test(credential)) {
    throw createProtocolError(errorCodes.invalidRequest, 'OpenAI API key is empty or invalid.');
  }
  return credential;
}

function normalizeOpenAIModel(definition) {
  assertPlainObject(definition, 'OpenAI model definition');
  return Object.freeze({
    id: assertString(definition.id, 'OpenAI adapter id', { min: 1, max: 120 }),
    label: assertString(definition.label, 'OpenAI adapter label', { min: 1, max: 120 }),
    model: assertString(definition.model, 'OpenAI model id', { min: 1, max: 120 })
  });
}

module.exports = {
  DEFAULT_OPENAI_MODELS,
  ModelConfigurationController,
  normalizeModelName,
  normalizeRequiredCredential
};
