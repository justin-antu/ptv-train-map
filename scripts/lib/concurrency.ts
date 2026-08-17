/**
 * Runs `fn` over every item in `items`, with at most `concurrency` calls
 * in flight at once. Used to fetch PTV departures for many (line, station)
 * pairs without either doing everything sequentially (slow for ~300+ pairs
 * across the whole Metro network) or firing hundreds of requests at once
 * (unnecessarily hammering the API, even though it has no documented hard
 * rate limit).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
