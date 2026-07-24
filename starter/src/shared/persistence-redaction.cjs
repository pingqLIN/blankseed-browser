'use strict';

const SAFE_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  'example.com',
  'example.net',
  'example.org'
]);
const SAFE_HOST_SUFFIXES = Object.freeze(['.localhost', '.test', '.invalid']);
const TARGET_REFERENCE_KEYS = new Set([
  'url',
  'href',
  'origin',
  'targeturl',
  'target_url',
  'validatedurl',
  'validated_url',
  'sourceurl',
  'source_url',
  'frameurl',
  'frame_url'
]);
const PAGE_CONTENT_KEYS = new Set([
  'title',
  'text',
  'html',
  'body',
  'content',
  'innertext',
  'outerhtml',
  'name',
  'description',
  'message',
  'report',
  'output',
  'value',
  'label',
  'task',
  'proposalcontent',
  'reason',
  'arialabel',
  'aria_label',
  'placeholder',
  'alt',
  'stack'
]);
const HTTP_URL_PATTERN = /\bhttps?:\/\/[^\s<>"'\`\\]+/gi;
const HOST_REFERENCE_PATTERN = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63})(?::\d{1,5})?(?:\/[^\s<>"'\`]*)?/gi;
const IPV4_REFERENCE_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?:\/[^\s<>"'\`]*)?/g;
const TARGET_MARKER = '[redacted:external-target]';
const PAGE_CONTENT_MARKER = '[redacted:external-page-content]';
const REDACTION_KEY = 'persistenceRedaction';
const REDACTION_SCHEMA = 'blankseed-persistence-redaction/0.1';

function normalizeKey(key) {
  return String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function hostFromReference(reference) {
  const value = String(reference || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.hostname.toLowerCase();
  } catch {
    try {
      return new URL('https://' + value).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}

function isSafeHost(host) {
  const normalized = String(host || '').replace(/^\[|\]$/g, '').toLowerCase();
  return SAFE_HOSTS.has(normalized) || SAFE_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function isExternalReference(reference) {
  const host = hostFromReference(reference);
  return Boolean(host && !isSafeHost(host));
}

function createSummary() {
  return {
    externalTargetFields: 0,
    externalReferenceTokens: 0,
    externalTextFields: 0,
    pageContentFields: 0
  };
}

function metadataFor(summary) {
  const redactedFields = summary.externalTargetFields + summary.externalTextFields + summary.pageContentFields;
  return {
    schema: REDACTION_SCHEMA,
    status: redactedFields > 0 || summary.externalReferenceTokens > 0 ? 'redacted' : 'not_needed',
    externalTargetFields: summary.externalTargetFields,
    externalReferenceTokens: summary.externalReferenceTokens,
    externalTextFields: summary.externalTextFields,
    pageContentFields: summary.pageContentFields
  };
}

function hasRedactions(metadata) {
  return metadata.status === 'redacted';
}

function redactExternalReferences(text, summary, { wholeString = false } = {}) {
  let foundExternalReference = false;
  let redacted = String(text).replace(HTTP_URL_PATTERN, (match) => {
    if (!isExternalReference(match)) return match;
    foundExternalReference = true;
    summary.externalReferenceTokens += 1;
    return TARGET_MARKER;
  });
  redacted = redacted.replace(HOST_REFERENCE_PATTERN, (match) => {
    if (!isExternalReference(match)) return match;
    foundExternalReference = true;
    summary.externalReferenceTokens += 1;
    return TARGET_MARKER;
  });
  redacted = redacted.replace(IPV4_REFERENCE_PATTERN, (match) => {
    if (!isExternalReference(match)) return match;
    foundExternalReference = true;
    summary.externalReferenceTokens += 1;
    return TARGET_MARKER;
  });
  return {
    value: foundExternalReference && wholeString ? PAGE_CONTENT_MARKER : redacted,
    foundExternalReference
  };
}

function hasOwnExternalTarget(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value).some(([key, child]) => (
    TARGET_REFERENCE_KEYS.has(normalizeKey(key))
    && (typeof child === 'string' || child instanceof URL)
    && isExternalReference(String(child))
  ));
}

function redactValue(value, summary, context, seen) {
  if (typeof value === 'string') {
    const redacted = redactExternalReferences(value, summary, {
      wholeString: Boolean(context.forceTextRedaction)
    });
    if (redacted.foundExternalReference && context.forceTextRedaction) summary.externalTextFields += 1;
    return redacted.value;
  }
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof URL) {
    if (isExternalReference(value.toString())) {
      summary.externalTargetFields += 1;
      return TARGET_MARKER;
    }
    return value.toString();
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return Buffer.from(value);
  if (seen.has(value)) return seen.get(value);

  if (Array.isArray(value)) {
    const output = [];
    seen.set(value, output);
    for (const child of value) output.push(redactValue(child, summary, context, seen));
    return output;
  }

  const output = {};
  seen.set(value, output);
  const pageScope = context.pageScope || hasOwnExternalTarget(value);
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    const isTargetReference = TARGET_REFERENCE_KEYS.has(normalizedKey);
    const isPageContent = PAGE_CONTENT_KEYS.has(normalizedKey);

    if (isTargetReference && (typeof child === 'string' || child instanceof URL) && isExternalReference(String(child))) {
      summary.externalTargetFields += 1;
      output[key] = TARGET_MARKER;
      continue;
    }
    if (pageScope && isPageContent && typeof child === 'string' && child) {
      summary.pageContentFields += 1;
      output[key] = PAGE_CONTENT_MARKER;
      continue;
    }
    output[key] = redactValue(child, summary, {
      pageScope,
      forceTextRedaction: isPageContent
    }, seen);
  }
  return output;
}

function redactForPersistence(value) {
  const summary = createSummary();
  const redactedValue = redactValue(value, summary, {
    pageScope: false,
    forceTextRedaction: false
  }, new WeakMap());
  return { value: redactedValue, metadata: metadataFor(summary) };
}

function redactTextForPersistence(value, { wholeString = false } = {}) {
  const summary = createSummary();
  const redacted = redactExternalReferences(String(value ?? ''), summary, { wholeString });
  if (redacted.foundExternalReference && wholeString) summary.externalTextFields += 1;
  return { value: redacted.value, metadata: metadataFor(summary) };
}

function attachPersistenceRedaction(value, metadata) {
  if (!hasRedactions(metadata)) return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value, [REDACTION_KEY]: metadata };
  }
  return { value, [REDACTION_KEY]: metadata };
}

module.exports = {
  PAGE_CONTENT_MARKER,
  REDACTION_KEY,
  REDACTION_SCHEMA,
  TARGET_MARKER,
  attachPersistenceRedaction,
  isExternalReference,
  redactForPersistence,
  redactTextForPersistence
};
