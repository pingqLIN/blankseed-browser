'use strict';

const { WebContentsView } = require('electron');
const { CapabilityBroker } = require('./capability-broker.cjs');
const { normalizeConsoleMessage, normalizeUrl } = require('../shared/contracts.cjs');

class TargetViewController {
  constructor({ window, controlPanelWidth, initialUrl, worldId, eventStore, pushEvent }) {
    this.window = window;
    this.controlPanelWidth = controlPanelWidth;
    this.worldId = worldId;
    this.eventStore = eventStore;
    this.pushEvent = pushEvent;
    this.documentGeneration = 0;
    this.view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: 'persist:blankseed-target'
      }
    });

    this.window.contentView.addChildView(this.view);
    this.#bindEvents();
    this.broker = new CapabilityBroker({
      webContents: this.webContents,
      worldId: this.worldId,
      eventStore: this.eventStore,
      getTargetIdentity: () => this.getTargetIdentity()
    });
    this.eventStore.append('target.created', {
      ...this.getTargetIdentity(),
      initialUrl,
      rendererPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });
    this.updateBounds();
    this.view.webContents.loadURL(normalizeUrl(initialUrl));
  }

  get webContents() {
    return this.view.webContents;
  }

  getState() {
    const wc = this.webContents;
    return {
      targetId: wc.id,
      url: wc.getURL(),
      title: wc.getTitle(),
      isLoading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      documentGeneration: this.documentGeneration,
      rendererPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    };
  }

  getTargetIdentity() {
    return {
      targetId: this.webContents.id,
      documentGeneration: this.documentGeneration
    };
  }

  updateBounds() {
    const [width, height] = this.window.getContentSize();
    this.view.setBounds({
      x: this.controlPanelWidth,
      y: 0,
      width: Math.max(0, width - this.controlPanelWidth),
      height: Math.max(0, height)
    });
  }

  navigate(url) {
    const normalizedUrl = normalizeUrl(url);
    this.eventStore.append('target.navigation.requested', {
      ...this.getTargetIdentity(),
      action: 'navigate',
      url: normalizedUrl
    });
    return this.webContents.loadURL(normalizedUrl);
  }

  back() {
    if (this.webContents.navigationHistory.canGoBack()) {
      this.eventStore.append('target.navigation.requested', {
        ...this.getTargetIdentity(),
        action: 'back',
        url: this.webContents.getURL()
      });
      this.webContents.navigationHistory.goBack();
      return true;
    }
    return false;
  }

  forward() {
    if (this.webContents.navigationHistory.canGoForward()) {
      this.eventStore.append('target.navigation.requested', {
        ...this.getTargetIdentity(),
        action: 'forward',
        url: this.webContents.getURL()
      });
      this.webContents.navigationHistory.goForward();
      return true;
    }
    return false;
  }

  reload() {
    this.eventStore.append('target.navigation.requested', {
      ...this.getTargetIdentity(),
      action: 'reload',
      url: this.webContents.getURL()
    });
    this.webContents.reload();
  }

  async snapshot({ maxTextChars = 12000, maxElements = 200 } = {}, context = {}) {
    return this.broker.snapshot({ maxTextChars, maxElements }, context);
  }

  async execute(source, context = {}) {
    return this.broker.executePage(source, context);
  }

  async sendCdp(method, params = {}, context = {}) {
    return this.broker.sendCdp(method, params, context);
  }

  destroy() {
    if (this.view && !this.view.webContents.isDestroyed()) {
      const targetId = this.view.webContents.id;
      this.view.webContents.once('destroyed', () => {
        this.eventStore.append('target.destroyed', {
          targetId,
          isDestroyed: true
        });
        this.broker?.dispose();
      });
      this.eventStore.append('target.destroying', this.getTargetIdentity());
      this.window.contentView.removeChildView(this.view);
      this.view.webContents.close();
    }
  }

  #bindEvents() {
    const wc = this.webContents;
    const emit = (type, data) => {
      const event = this.eventStore.append(type, data);
      this.pushEvent(event);
    };

    wc.setWindowOpenHandler(({ url }) => {
      this.navigate(url).catch((error) => emit('target.navigation.failed', { url, message: error.message }));
      return { action: 'deny' };
    });

    wc.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) this.documentGeneration += 1;
      emit('target.navigation.started', {
        targetId: wc.id,
        url,
        isInPlace,
        isMainFrame,
        documentGeneration: this.documentGeneration
      });
    });
    wc.on('did-navigate', (_event, url, httpResponseCode, httpStatusText) => {
      emit('target.navigation.completed', {
        targetId: wc.id,
        url,
        httpResponseCode,
        httpStatusText,
        documentGeneration: this.documentGeneration
      });
    });
    wc.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      emit('target.navigation.in-page', {
        targetId: wc.id,
        url,
        isMainFrame,
        documentGeneration: this.documentGeneration
      });
    });
    wc.on('page-title-updated', (_event, title) => emit('target.title.updated', {
      targetId: wc.id,
      documentGeneration: this.documentGeneration,
      url: wc.getURL(),
      title
    }));
    wc.on('console-message', (...args) => {
      const [details, legacyLevel, legacyMessage, legacyLineNumber, legacySourceId] = args;
      emit('target.console', normalizeConsoleMessage(
        details,
        legacyLevel,
        legacyMessage,
        legacyLineNumber,
        legacySourceId
      ));
    });
    wc.on('render-process-gone', (_event, details) => emit('target.renderer.gone', {
      ...this.getTargetIdentity(),
      url: wc.getURL(),
      details
    }));
    wc.on('unresponsive', () => emit('target.unresponsive', { ...this.getTargetIdentity(), url: wc.getURL() }));
    wc.on('responsive', () => emit('target.responsive', { ...this.getTargetIdentity(), url: wc.getURL() }));
    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      emit('target.navigation.failed', {
        ...this.getTargetIdentity(),
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame
      });
    });
  }
}

module.exports = { TargetViewController };
