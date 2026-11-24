// Minimal observable store. Subscribers get (state, changedKeys: Set).
export function createState(initial) {
  let st = { ...initial };
  const subs = new Set();
  return {
    get: () => st,
    set(patch) {
      const changed = new Set(Object.keys(patch).filter((k) => st[k] !== patch[k]));
      if (!changed.size) return;
      st = { ...st, ...patch };
      for (const f of subs) f(st, changed);
    },
    on(f) {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}
