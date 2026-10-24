'use client';

// ── Lite mode for old / underpowered devices ────────────────────────────────
// iPad Air 2 class: A8X, 2 GB RAM, Safari ≤ 15. Detect once and tag <html>
// with `aj-lite` so CSS can drop the most expensive effects (backdrop-filter,
// ken-burns, hover transforms), and so the Player can shrink hls.js buffers.

/** True when this device should run in lite mode. */
export function isLiteDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number };
  // Low core count (A8X reports 2–3), low memory hint, or an old iOS/iPadOS.
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 && nav.hardwareConcurrency <= 3) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 2) return true;
  const ua = nav.userAgent || '';
  const ios = ua.match(/OS (\d+)_/); // "iPhone OS 15_5" / "iPad OS 14_8"
  if (ios && parseInt(ios[1], 10) <= 14) return true;
  return false;
}

/** Apply the aj-lite tag once per document (idempotent). */
export function applyLiteMode(): boolean {
  if (typeof document === 'undefined') return false;
  const lite = isLiteDevice();
  if (lite) document.documentElement.classList.add('aj-lite');
  return lite;
}

/** Shrink hls.js buffers on weak devices to avoid memory-pressure stalls. */
export function liteHlsConfig(): { maxBufferLength: number; maxMaxBufferLength: number; maxBufferSize: number } | null {
  return isLiteDevice() ? { maxBufferLength: 16, maxMaxBufferLength: 32, maxBufferSize: 20 } : null;
}
