export class AsyncResourceScope {
  #closed = false;
  #entries = [];

  defer(label, cleanup) {
    if (this.#closed) throw new Error('Cannot register cleanup after the resource scope is closed.');
    if (typeof cleanup !== 'function') throw new TypeError('Cleanup must be a function.');
    this.#entries.push({ label, cleanup });
  }

  async close() {
    if (this.#closed) return [];
    this.#closed = true;
    const failures = [];
    for (const entry of this.#entries.reverse()) {
      try {
        await entry.cleanup();
      } catch (error) {
        failures.push({ label: entry.label, error });
      }
    }
    return failures;
  }
}

export function throwWithCleanupFailures(primaryError, cleanupFailures) {
  if (!primaryError && cleanupFailures.length === 0) return;
  if (primaryError && cleanupFailures.length === 0) throw primaryError;
  const errors = [primaryError, ...cleanupFailures.map((failure) => failure.error)].filter(Boolean);
  const labels = cleanupFailures.map((failure) => failure.label).join(', ');
  throw new AggregateError(errors, primaryError
    ? `Smoke execution failed and cleanup also failed: ${labels}`
    : `Smoke cleanup failed: ${labels}`);
}
