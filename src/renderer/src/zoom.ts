/** Shared per-pane zoom vocabulary (browser panes). */

// Chrome-like discrete stops; keeps steps predictable and avoids float drift.
export const ZOOM_STEPS = [
  0.3, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3,
] as const;

/** The next stop from `current` in `dir` (+1 in, -1 out), clamped to the ends. */
export function nextZoom(current: number, dir: 1 | -1): number {
  // index of the nearest stop, then move one step
  let i = 0;
  for (let k = 1; k < ZOOM_STEPS.length; k++) {
    if (Math.abs(ZOOM_STEPS[k] - current) < Math.abs(ZOOM_STEPS[i] - current)) i = k;
  }
  const j = Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir));
  return ZOOM_STEPS[j];
}

/** e.g. 1 -> "100%", 0.9 -> "90%". */
export function zoomLabel(factor: number): string {
  return `${Math.round(factor * 100)}%`;
}
