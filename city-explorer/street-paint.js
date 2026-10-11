/** Reviewed paint corrections, independent of geographic/physics road widths.
 * Evidence and uncertainty: docs/street-audit/README.md. No external live fetch.
 * Four Sherbrooke IDs cover Park Street to George Street; Hospital is one 118 m way.
 */
export const REVIEWED_STREET_PAINT = Object.freeze({
  '739159886': 'sherbrooke-park-george',
  '737434011': 'sherbrooke-park-george',
  '650896572': 'sherbrooke-park-george',
  '460581459': 'sherbrooke-park-george',
  '250811912': 'hospital-drive-shared-turn-2023',
});
export function reviewedPaintTags(tags, lineId) {
  const id = /^(?:way\/)?(\d+)(?::\d+)?$/.exec(String(lineId || ''))?.[1];
  // Historical imagery supports only this way. Do not propagate to the adjacent
  // 27 m transition or treat a directional/conditional road as bidirectional.
  if (id === '250811912') {
    if (tags.name !== 'Hospital Drive' || String(tags.lanes) !== '2'
      || !['', 'no', '0', 'false'].includes(String(tags.oneway ?? '').toLowerCase())
      || Object.keys(tags).some(key => key.startsWith('oneway:'))
      || tags.junction === 'roundabout' || tags.lane_markings === 'no') return tags;
    return { ...tags, lanes: '3', 'lanes:forward': '1', 'lanes:backward': '1',
      'lanes:both_ways': '1', 'sim:paint:evidence': REVIEWED_STREET_PAINT[id] };
  }
  if (!REVIEWED_STREET_PAINT[id] || tags.name !== 'Sherbrooke Street'
    || String(tags.lanes) !== '4' || ['yes','1','-1'].includes(tags.oneway)
    || tags.lane_markings === 'no') return tags;
  return { ...tags, lanes: '2', 'lanes:forward': '1', 'lanes:backward': '1',
    'lanes:both_ways': '0', divider: 'solid_line',
    'sim:paint:evidence': REVIEWED_STREET_PAINT[id] };
}

/** Return a bounded triangle strip draped on the renderer's road surface.
 * No thick floating boxes, road-width changes or data-derived curb guesses.
 * Missing supports are omitted instead of spanning an island/terrain hole.
 */
export function drapePaintStrip(a, b, width, sampleHeight, { spacing = 2, lift = 0.008 } = {}) {
  if (![a?.x,a?.z,b?.x,b?.z,width,spacing,lift].every(Number.isFinite)
    || width <= 0 || spacing <= 0 || typeof sampleHeight !== 'function') throw new TypeError('Invalid paint strip');
  const dx=b.x-a.x, dz=b.z-a.z, length=Math.hypot(dx,dz);
  if (length<0.001) return [];
  const nX=dz/length*width/2, nZ=-dx/length*width/2;
  const steps=Math.ceil(length/spacing), positions=[];
  const sample = t => {
    const x=a.x+dx*t,z=a.z+dz*t;
    const ly=sampleHeight(x+nX,z+nZ), ry=sampleHeight(x-nX,z-nZ);
    if (!Number.isFinite(ly)||!Number.isFinite(ry)) return null;
    return [[x+nX,ly+lift,z+nZ],[x-nX,ry+lift,z-nZ]];
  };
  let start=sample(0);
  for(let i=1;i<=steps;i++) {
    const end=sample(i/steps);
    const mid=sampleHeight(a.x+dx*(i-.5)/steps,a.z+dz*(i-.5)/steps);
    if(start && end && Number.isFinite(mid)) {
      const [al,ar]=start,[bl,br]=end;
      positions.push(...al,...ar,...br,...al,...br,...bl);
    }
    start=end;
  }
  return positions;
}
