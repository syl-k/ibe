/**
 * A tiny rAF-coalesced trigger so any part of the UI (resizer drag, ResizeObserver,
 * window resize) can ask for a bounds re-sync without each doing its own throttling.
 * App registers the actual runner; everyone else just calls requestBoundsSync().
 */
let pending = 0;
let runner: (() => void) | null = null;

export function registerBoundsRunner(fn: () => void): void {
  runner = fn;
}

export function requestBoundsSync(): void {
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    runner?.();
  });
}
