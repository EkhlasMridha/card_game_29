/**
 * Display-text sanitisation shared by client (for previews) and server (authoritative).
 * Removes control and bidirectional-override characters, collapses whitespace and truncates.
 */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿<>]/g;

export function sanitizeDisplayText(input: string, maxLength: number): string {
  const cleaned = input.normalize('NFC').replace(UNSAFE, '').replace(/\s+/g, ' ').trim();
  return Array.from(cleaned).slice(0, maxLength).join('').trim();
}
