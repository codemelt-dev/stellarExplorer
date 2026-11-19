/**
 * Runs at most `max` tasks at once; the rest wait in order. A finished task
 * hands its slot straight to the next one waiting, so a newcomer can't slip
 * in between and push the count over.
 */
export function limiter(max: number) {
  let running = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (running < max) running++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
}
