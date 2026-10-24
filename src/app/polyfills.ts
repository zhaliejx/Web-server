// ── Ajest runtime polyfills for old Safari (iPad Air 2 → Safari ≤ 15.3) ─────
// Side-effect module, imported FIRST in the root layout so every later chunk
// (AjestApp, Player, reader…) boots on browsers missing modern Web APIs.
// Every patch is guarded — on modern browsers this file is a no-op.
// Syntax itself (optional chaining, nullish coalescing, class fields…) is
// handled by SWC via the "safari >= 12" browserslist in package.json.

const g: any = typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : Function('return this')();

// globalThis (Safari ≤ 12.0)
if (typeof g.globalThis === 'undefined') g.globalThis = g;

// Promise.allSettled (Safari ≤ 12.x)
if (typeof g.Promise === 'function' && typeof g.Promise.allSettled !== 'function') {
  g.Promise.allSettled = function allSettled(promises: any[]) {
    return Promise.all(
      Array.from(promises, (p: any) =>
        Promise.resolve(p).then(
          (v) => ({ status: 'fulfilled', value: v }),
          (e) => ({ status: 'rejected', reason: e })
        )
      )
    );
  };
}

// queueMicrotask (Safari ≤ 13.x)
if (typeof g.queueMicrotask !== 'function') {
  g.queueMicrotask = (cb: () => void) => Promise.resolve().then(cb);
}

// String.prototype.replaceAll (Safari ≤ 13.0)
if (typeof String.prototype.replaceAll !== 'function') {
  String.prototype.replaceAll = function (this: string, search: any, replace: any) {
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError('String.prototype.replaceAll requires a global regex');
      return (this as any).replace(search, replace);
    }
    return (this as any).split(search).join(replace);
  } as any;
}

// Array.prototype.at (Safari ≤ 15.3)
if (typeof Array.prototype.at !== 'function') {
  Object.defineProperty(Array.prototype, 'at', {
    value: function (this: any[], n: number) {
      const len = this.length >>> 0;
      const i = Math.trunc(Number(n) || 0);
      const idx = i < 0 ? len + i : i;
      return idx >= 0 && idx < len ? this[idx] : undefined;
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(String.prototype, 'at', {
    value: function (this: string, n: number) {
      const len = (this as any).length >>> 0;
      const i = Math.trunc(Number(n) || 0);
      const idx = i < 0 ? len + i : i;
      return idx >= 0 && idx < len ? (this as any)[idx] : undefined;
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

// Object.hasOwn (Safari ≤ 15.3)
if (typeof g.Object === 'object' && typeof g.Object.hasOwn !== 'function') {
  g.Object.hasOwn = (o: any, k: any) => Object.prototype.hasOwnProperty.call(o, k);
}

// Array.prototype.findLast / findLastIndex (Safari ≤ 15.3)
if (typeof Array.prototype.findLast !== 'function') {
  Object.defineProperty(Array.prototype, 'findLast', {
    value: function (this: any[], fn: (v: any, i: number, a: any[]) => unknown, thisArg?: any) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (fn.call(thisArg, this[i], i, this)) return this[i];
      }
      return undefined;
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(Array.prototype, 'findLastIndex', {
    value: function (this: any[], fn: (v: any, i: number, a: any[]) => unknown, thisArg?: any) {
      for (let i = this.length - 1; i >= 0; i--) {
        if (fn.call(thisArg, this[i], i, this)) return i;
      }
      return -1;
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

// crypto.randomUUID (Safari ≤ 15.3) — RFC 4122 v4 from getRandomValues
if (typeof g.crypto === 'object' && g.crypto !== null && typeof g.crypto.randomUUID !== 'function') {
  const rng: (arr: Uint8Array) => void =
    typeof g.crypto.getRandomValues === 'function'
      ? (arr) => g.crypto.getRandomValues(arr)
      : (arr) => {
          for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        };
  g.crypto.randomUUID = function (): string {
    const b = new Uint8Array(16);
    rng(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}

// structuredClone (Safari ≤ 15.3) — structured-data subset via JSON; falls
// back gracefully for the JSON-safe payloads Ajest clones (history entries,
// API responses). Functions/DOM nodes are out of scope for this app.
if (typeof g.structuredClone !== 'function') {
  g.structuredClone = function (value: any) {
    if (value === null || typeof value !== 'object') return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  };
}

export {};
