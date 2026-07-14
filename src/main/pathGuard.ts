import { resolve, sep } from "path";

/**
 * Pure guards for the editor's filesystem surface (kept free of electron
 * imports so they can be unit-tested in plain node).
 */

/** True when `path` is inside (or is) one of the allowed roots. */
export function isUnderRoots(roots: Iterable<string>, path: string): boolean {
  const p = resolve(path);
  for (const root of roots) {
    const r = resolve(root);
    if (p === r || p.startsWith(r + sep)) return true;
  }
  return false;
}

/** Cheap binary sniff: a NUL byte in the head marks the file as non-text. */
export function looksBinary(head: Buffer): boolean {
  return head.includes(0);
}
