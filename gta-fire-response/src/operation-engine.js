export class OperationEngine {
  constructor(template, now = 0) {
    if (!template?.objectives?.length) throw new Error('Operation template requires objectives.');
    this.template = template;
    this.startedAt = now;
    this.objectives = template.objectives.map((objective, index) => ({
      ...objective,
      index,
      status: objective.dependencies?.length ? 'locked' : 'available',
      progress: 0,
      completedAt: 0,
      source: null
    }));
    this.refresh();
  }

  get(id) { return this.objectives.find(objective => objective.id === id) || null; }

  dependenciesComplete(objective) {
    return (objective.dependencies || []).every(id => this.get(id)?.status === 'complete');
  }

  refresh() {
    for (const objective of this.objectives) {
      if (objective.status === 'locked' && this.dependenciesComplete(objective)) objective.status = 'available';
    }
    return this;
  }

  begin(id) {
    const objective = this.get(id);
    if (!objective || !['available', 'active'].includes(objective.status)) return false;
    objective.status = 'active';
    return true;
  }

  advance(id, amount, source = 'player', now = 0) {
    const objective = this.get(id);
    if (!objective || !['available', 'active'].includes(objective.status)) return false;
    objective.status = 'active';
    objective.progress = Math.max(0, Math.min(100, objective.progress + Math.max(0, Number(amount) || 0)));
    if (objective.progress >= 100) return this.complete(id, source, now);
    return true;
  }

  complete(id, source = 'system', now = 0) {
    const objective = this.get(id);
    if (!objective || objective.status === 'complete' || objective.status === 'failed') return false;
    if (!this.dependenciesComplete(objective)) return false;
    objective.status = 'complete';
    objective.progress = 100;
    objective.completedAt = now;
    objective.source = source;
    this.refresh();
    return true;
  }

  fail(id, source = 'system', now = 0) {
    const objective = this.get(id);
    if (!objective || ['complete', 'failed'].includes(objective.status)) return false;
    objective.status = 'failed';
    objective.completedAt = now;
    objective.source = source;
    this.refresh();
    return true;
  }

  completionRatio() {
    const count = this.objectives.filter(objective => objective.status === 'complete').length;
    return count / this.objectives.length;
  }

  essentialComplete() {
    return this.objectives.filter(objective => objective.essential !== false).every(objective => objective.status === 'complete');
  }

  failedEssentialCount() {
    return this.objectives.filter(objective => objective.essential !== false && objective.status === 'failed').length;
  }

  next() {
    return this.objectives.find(objective => ['available', 'active'].includes(objective.status)) || null;
  }

  snapshot() {
    return {
      id: this.template.id,
      label: this.template.label,
      completionRatio: this.completionRatio(),
      essentialComplete: this.essentialComplete(),
      objectives: this.objectives.map(objective => ({
        id: objective.id,
        label: objective.label,
        status: objective.status,
        progress: objective.progress,
        essential: objective.essential !== false,
        source: objective.source
      }))
    };
  }
}
