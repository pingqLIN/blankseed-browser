import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(resolve(import.meta.dirname, '../src/renderer/i18n.js'), 'utf8');
const sandbox = { Intl, globalThis: { navigator: { languages: [] }, localStorage: null } };
vm.runInNewContext(source, sandbox, { filename: 'i18n.js' });
const { DEFAULT_LOCALE, SUPPORTED_LOCALES, catalogFor, catalogKeys, formatTime, getLocale, resolveLocale, setLocale, sourceKeyFor, t, translateSource } = sandbox.globalThis.BlankSeedI18n;

test('locale resolver preserves the Traditional Chinese product fallback', () => {
  assert.equal(DEFAULT_LOCALE, 'zh-TW');
  assert.equal(resolveLocale('en'), 'en');
  assert.equal(resolveLocale('zh-CN'), 'zh-CN');
  assert.equal(resolveLocale('', ['zh-Hant-HK']), 'zh-TW');
  assert.equal(resolveLocale('', ['zh-Hans-SG']), 'zh-CN');
  assert.equal(resolveLocale('', ['en-GB']), 'en');
  assert.equal(resolveLocale('unsupported', ['fr-FR']), 'zh-TW');
});

test('all three locale catalogs have the same non-empty key set', () => {
  const expected = Array.from(catalogKeys());
  for (const locale of SUPPORTED_LOCALES) {
    const catalog = catalogFor(locale);
    assert.deepEqual(Array.from(Object.keys(catalog).sort()), expected, `${locale} key set differs`);
    for (const key of expected) assert.ok(catalog[key].trim(), `${locale}:${key} is empty`);
  }
});

test('translations, fallback, and time formatting follow the active locale', () => {
  setLocale('en');
  assert.equal(getLocale(), 'en');
  assert.equal(t('module.status.candidate'), 'Candidate');
  assert.equal(t('missing.key', {}, 'fallback'), 'fallback');
  assert.match(formatTime('2026-07-24T12:34:56Z'), /^\d{2}:\d{2}:\d{2}$/);

  setLocale('zh-CN');
  assert.equal(t('module.status.tested'), '已测试');
  setLocale('zh-TW');
});

test('source-copy bindings translate only registered interface copy', () => {
  assert.equal(sourceKeyFor('重新整理'), 'common.refresh');
  assert.equal(sourceKeyFor('sha256:untrusted-page-payload'), null);

  setLocale('en');
  assert.equal(translateSource('重新整理'), 'Refresh');
  assert.equal(translateSource('sha256:untrusted-page-payload'), 'sha256:untrusted-page-payload');
  setLocale('zh-TW');
});
