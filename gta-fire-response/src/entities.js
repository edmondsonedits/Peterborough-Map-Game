export class EntityManager {
  constructor(budgets = {}) {
    this.budgets = { ...budgets };
    this.entities = new Map();
    this.pools = new Map();
    this.nextId = 1;
  }
  count(type = null) {
    if (!type) return [...this.entities.values()].filter(entity => entity.active).length;
    return [...this.entities.values()].filter(entity => entity.active && entity.type === type).length;
  }
  active(type = null) {
    return [...this.entities.values()].filter(entity => entity.active && (!type || entity.type === type));
  }
  acquire(type, initial = {}) {
    const cap = this.budgets[type] ?? Infinity;
    if (this.count(type) >= cap) return null;
    const pool = this.pools.get(type) || [];
    const entity = pool.pop() || { id: `${type}-${this.nextId++}`, type };
    Object.assign(entity, {
      type, active: true, state: 'idle', updatePriority: 1, spawnSource: 'runtime',
      position: { lat: 0, lng: 0 }, heading: 0, renderRef: null,
      cleanup: null, ...initial
    });
    this.pools.set(type, pool);
    this.entities.set(entity.id, entity);
    return entity;
  }
  release(entityOrId) {
    const entity = typeof entityOrId === 'string' ? this.entities.get(entityOrId) : entityOrId;
    if (!entity) return false;
    try { entity.cleanup?.(entity); } catch {}
    entity.active = false;
    entity.renderRef = null;
    this.entities.delete(entity.id);
    if (!this.pools.has(entity.type)) this.pools.set(entity.type, []);
    this.pools.get(entity.type).push(entity);
    return true;
  }
  clear(type = null) {
    for (const entity of [...this.entities.values()]) if (!type || entity.type === type) this.release(entity);
  }
  summary() {
    const result = {};
    for (const entity of this.active()) result[entity.type] = (result[entity.type] || 0) + 1;
    return result;
  }
}
