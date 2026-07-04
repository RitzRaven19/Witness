/**
 * Browser shims for the Node builtins that @meshtastic/core's bundled logger
 * (tslog) imports statically: `os.hostname`, `path.normalize`, and
 * `util.formatWithOptions` / `util.types`. Vite aliases 'os', 'path' and
 * 'util' to this module (see vite.config.ts) — only these members are used,
 * and only for log formatting.
 */

export function hostname(): string {
  return 'witness-pwa';
}

export function normalize(p: string): string {
  return p;
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.stack ?? v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** printf-lite: replaces %s/%d/%i/%f/%j/%o/%O and appends leftover args. */
export function formatWithOptions(_opts: unknown, ...args: unknown[]): string {
  if (typeof args[0] === 'string' && /%[sdifjoO]/.test(args[0])) {
    const fmt = args.shift() as string;
    let out = fmt.replace(/%[sdifjoO]/g, () =>
      args.length ? stringify(args.shift()) : '',
    );
    if (args.length) out += ' ' + args.map(stringify).join(' ');
    return out;
  }
  return args.map(stringify).join(' ');
}

/** Loose stand-in for node:util.types — misdetection only affects log style. */
export const types = new Proxy(
  {
    isDate: (v: unknown) => v instanceof Date,
    isRegExp: (v: unknown) => v instanceof RegExp,
    isMap: (v: unknown) => v instanceof Map,
    isSet: (v: unknown) => v instanceof Set,
    isNativeError: (v: unknown) => v instanceof Error,
  } as Record<string, (v: unknown) => boolean>,
  {
    get(target, prop: string) {
      return target[prop] ?? (() => false);
    },
  },
);

export default { hostname, normalize, formatWithOptions, types };
