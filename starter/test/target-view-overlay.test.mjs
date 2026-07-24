import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalLoad = Module._load;
const views = [];

class FakeWebContentsView {
  constructor() {
    this.visible = true;
    this.webContents = {
      id: 41,
      navigationHistory: {
        canGoBack: () => false,
        canGoForward: () => false
      },
      setWindowOpenHandler() {},
      on() {},
      loadURL: async () => {},
      getURL: () => 'https://example.test/',
      getTitle: () => 'Fixture',
      isLoading: () => false
    };
    views.push(this);
  }

  setBounds() {}

  setVisible(visible) {
    this.visible = visible;
  }
}

Module._load = function loadWithElectronMock(request, parent, isMain) {
  if (request === 'electron') return { WebContentsView: FakeWebContentsView };
  return originalLoad.call(this, request, parent, isMain);
};

const { TargetViewController } = require('../src/main/target-view.cjs');
Module._load = originalLoad;

test('TargetViewController hides the native target while a control confirmation is active', () => {
  const events = [];
  const pushed = [];
  const window = {
    contentView: { addChildView() {} },
    getContentSize: () => [1500, 920]
  };
  const eventStore = {
    append(type, data) {
      const event = { type, data };
      events.push(event);
      return event;
    }
  };
  const controller = new TargetViewController({
    window,
    controlPanelWidth: 760,
    initialUrl: 'https://example.test/',
    worldId: 1004,
    eventStore,
    pushEvent: (event) => pushed.push(event)
  });

  assert.deepEqual(controller.getState().presentation, {
    overlayActive: false,
    visible: true
  });

  assert.deepEqual(controller.setOverlayActive(true), {
    changed: true,
    overlayActive: true,
    visible: false
  });
  assert.equal(views.at(-1).visible, false);
  assert.deepEqual(controller.getState().presentation, {
    overlayActive: true,
    visible: false
  });

  assert.deepEqual(controller.setOverlayActive(false), {
    changed: true,
    overlayActive: false,
    visible: true
  });
  assert.equal(views.at(-1).visible, true);
  assert.equal(events.filter((event) => event.type === 'target.presentation.changed').length, 2);
  assert.equal(pushed.filter((event) => event.type === 'target.presentation.changed').length, 2);
});

test('TargetViewController overlay updates are idempotent', () => {
  const controller = new TargetViewController({
    window: {
      contentView: { addChildView() {} },
      getContentSize: () => [1500, 920]
    },
    controlPanelWidth: 760,
    initialUrl: 'https://example.test/',
    worldId: 1004,
    eventStore: { append: (type, data) => ({ type, data }) },
    pushEvent() {}
  });

  assert.deepEqual(controller.setOverlayActive(false), {
    changed: false,
    overlayActive: false,
    visible: true
  });
  assert.equal(views.at(-1).visible, true);
});
