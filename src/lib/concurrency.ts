// Run `fn` over `items` with at most `limit` promises in flight at once,
// preserving input order in the result. Bounds outbound fan-out so a single
// request can't open thousands of upstream connections at once (e.g. the
// per-symbol price fetches behind /api/prices). `fn` is responsible for its own
// error handling — a rejection propagates and aborts the batch, so callers that
// want per-item tolerance should have `fn` catch and return a sentinel.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const worker = async (): Promise<void> => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
