export function applyConditionDamage(condition, amount) {
  const impact = Math.max(0, Math.min(15, Number(amount) || 0));
  const rounded = value => Math.round(value * 1000) / 1000;
  return {
    body: rounded(Math.max(0, Math.min(100, condition.body - impact))),
    steering: rounded(Math.max(35, Math.min(100, condition.steering - impact * .42))),
    engine: rounded(Math.max(40, Math.min(100, condition.engine - impact * .28))),
    lights: rounded(Math.max(45, Math.min(100, condition.lights - impact * .18))),
    pump: rounded(Math.max(45, Math.min(100, condition.pump - impact * .22)))
  };
}

export function buildWeightedCallPool(calls, history = []) {
  const last = history.at(-1)?.callId;
  const weighted = [];
  for (const call of calls) {
    if (call.id === last && calls.length > 1) continue;
    const repeats = history.filter(item => item.callId === call.id).length;
    const weight = Math.max(1, 5 - Math.min(3, repeats));
    for (let index = 0; index < weight; index += 1) weighted.push(call);
  }
  return weighted;
}

export function calculateCallScore({ collisions = 0, roadHits = 0, positioned = false, correctEquipment = false, waterSupply = false, crewCommands = 0, damageDelta = 0, isFire = false } = {}) {
  const safeDriving = Math.max(0, 250 - collisions * 75 - roadHits * 12);
  const positioning = positioned ? 120 : 45;
  const equipment = correctEquipment ? 140 : 55;
  const supply = isFire ? (waterSupply ? 110 : 55) : 80;
  const crew = Math.min(100, crewCommands * 25);
  const completion = 320;
  const score = Math.max(100, Math.round(safeDriving + positioning + equipment + supply + crew + completion - Math.max(0, damageDelta) * 5));
  const rank = score >= 900 ? 'S' : score >= 740 ? 'A' : score >= 560 ? 'B' : 'C';
  return { score, rank, breakdown: { safeDriving, positioning, equipment, supply, crew, completion } };
}
