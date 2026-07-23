import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  PAGE_CONTENT_MARKER,
  TARGET_MARKER,
  redactForPersistence,
  redactTextForPersistence
} = require('../src/shared/persistence-redaction.cjs');

test('persistence redaction removes external target identity and page content without mutating the caller value', () => {
  const page = {
    url: 'https://private-site.example/path?account=123',
    title: 'Sensitive page title',
    text: 'Sensitive page body',
    elements: [{ tag: 'button', name: 'Sensitive control label' }]
  };
  const { value, metadata } = redactForPersistence(page);

  assert.equal(page.url, 'https://private-site.example/path?account=123');
  assert.equal(page.title, 'Sensitive page title');
  assert.equal(value.url, TARGET_MARKER);
  assert.equal(value.title, PAGE_CONTENT_MARKER);
  assert.equal(value.text, PAGE_CONTENT_MARKER);
  assert.equal(value.elements[0].name, PAGE_CONTENT_MARKER);
  assert.equal(value.elements[0].tag, 'button');
  assert.equal(metadata.status, 'redacted');
  assert.equal(metadata.externalTargetFields, 1);
  assert.equal(metadata.pageContentFields, 3);
  assert.equal(JSON.stringify(value).includes('private-site.example'), false);
  assert.equal(JSON.stringify(value).includes('Sensitive page'), false);
});

test('persistence redaction preserves loopback and fixture targets while redacting external references in free text', () => {
  const fixture = {
    url: 'https://example.org/fixture',
    title: 'Fixture title',
    text: 'Fixture text'
  };
  const safe = redactForPersistence(fixture);
  const externalText = redactTextForPersistence(
    'Captured from https://private-site.example/landing: sensitive page content.',
    { wholeString: true }
  );
  const externalIp = redactTextForPersistence('Observed 203.0.113.9/path in a page log.');

  assert.deepEqual(safe.value, fixture);
  assert.equal(safe.metadata.status, 'not_needed');
  assert.equal(externalText.value, PAGE_CONTENT_MARKER);
  assert.equal(externalText.metadata.status, 'redacted');
  assert.equal(externalText.value.includes('private-site.example'), false);
  assert.equal(externalIp.value.includes('203.0.113.9'), false);
});
