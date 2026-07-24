import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalLoad = Module._load;
const views = [];

class FakeWebContentsView {
  constructor() {
    this.bounds = null;
    this.webContents = {
      id: 42,
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

  setBounds(bounds) {
    this.bounds = bounds;
  }
}

Module._load = function loadWithElectronMock(request, parent, isMain) {
  if (request === 'electron') return { WebContentsView: FakeWebContentsView };
  return originalLoad.call(this, request, parent, isMain);
};

const {
  MIN_CONTROL_PANEL_WIDTH,
  MIN_TARGET_PANEL_WIDTH,
  TargetViewController,
  clampControlPanelWidth
} = require('../src/main/target-view.cjs');
Module._load = originalLoad;

test('control-panel width preserves minimum space for both panes', () => {
  assert.equal(clampControlPanelWidth(200, 1500), MIN_CONTROL_PANEL_WIDTH);
  assert.equal(clampControlPanelWidth(1400, 1500), 1500 - MIN_TARGET_PANEL_WIDTH);
  assert.equal(clampControlPanelWidth(684.4, 1500), 684);
});

test('TargetViewController applies and reports a governed panel resize', () => {
  const events = [];
  const pushed = [];
  const controller = new TargetViewController({
    window: {
      contentView: { addChildView() {} },
      getContentSize: () => [1500, 920]
    },
    controlPanelWidth: 500,
    initialUrl: 'https://example.test/',
    worldId: 1004,
    eventStore: {
      append(type, data, context) {
        const event = { type, data, context };
        events.push(event);
        return event;
      }
    },
    pushEvent: (event) => pushed.push(event)
  });

  assert.deepEqual(controller.setControlPanelWidth(700, { requestId: 'req_layout_test' }), {
    changed: true,
    controlPanelWidth: 700,
    targetPanelWidth: 800,
    minControlPanelWidth: MIN_CONTROL_PANEL_WIDTH,
    minTargetPanelWidth: MIN_TARGET_PANEL_WIDTH
  });
  assert.deepEqual(views.at(-1).bounds, { x: 700, y: 0, width: 800, height: 920 });
  assert.equal(controller.getState().layout.controlPanelWidth, 700);
  assert.equal(events.at(-1).type, 'target.layout.changed');
  assert.equal(events.at(-1).context.requestId, 'req_layout_test');
  assert.equal(pushed.at(-1).type, 'target.layout.changed');
});
