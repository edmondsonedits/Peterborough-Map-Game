/* Field-level changes against the published baseline. No executable input. */
(() => {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  function diff(baseline, current) {
    const old = new Map(baseline.map(item => [item.id,item]));
    const now = new Map(current.map(item => [item.id,item]));
    const added = [], updated = [], deleted = [];
    for (const item of current) {
      const original = old.get(item.id);
      if (!original) { added.push(copy(item)); continue; }
      const changes = {}, before = {};
      for (const key of new Set([...Object.keys(original),...Object.keys(item)])) {
        if (key === 'id' || equal(original[key],item[key])) continue;
        changes[key] = item[key] ?? null;
        before[key] = original[key] ?? null;
      }
      if (Object.keys(changes).length) updated.push({id:item.id,before,changes});
    }
    for (const item of baseline) if (!now.has(item.id)) deleted.push({id:item.id});
    return {added,updated,deleted};
  }
  const count = delta => delta.added.length + delta.updated.length + delta.deleted.length;
  const api = Object.freeze({diff,count});
  if (typeof module !== 'undefined') module.exports = api;
  if (typeof window !== 'undefined') window.PTBO_LOCATION_CHANGES = api;
})();
