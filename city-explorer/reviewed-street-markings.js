/** Appearance-only corrections with explicit scope and dated evidence.
 * Neither OSM source geometry, public routing, widths nor pavement polygons are
 * edited. These observations do NOT certify the current 2026 paint condition.
 */
export const STREET_MARKING_REVIEWS = Object.freeze({
  '460581459': Object.freeze({ street: 'Sherbrooke Street', expectedOSMLanes: '4', lanes: '2',
    orn: [1500534296], imagery: 'data/survey/station-one-district-orthophoto-2023.jpg',
    observationYear: 2023, reviewed: '2026-10-10',
    interpretation: 'Two opposing travel lanes with roadside parking, not four travel lanes. Single centre divider; no parallel white travel-lane dividers.' }),
  '650896572': Object.freeze({ street: 'Sherbrooke Street', expectedOSMLanes: '4', lanes: '2',
    imagery: 'data/survey/station-one-district-orthophoto-2023.jpg',
    observationYear: 2023, reviewed: '2026-10-10',
    interpretation: 'Two opposing travel lanes in the reviewed downtown block; parking width must not become extra travel-lane stripes.' }),
});

export function reviewedMarkingTags(tags = {}, lineId = '') {
  const id=String(lineId).match(/(?:^|\/)(\d+)(?::\d+)?$/)?.[1];
  const review=STREET_MARKING_REVIEWS[id];
  if (!review || tags.name !== review.street || String(tags.lanes) !== review.expectedOSMLanes) return tags;
  // If the source is corrected upstream or a future layout differs, this guard
  // stops applying the stale correction instead of overwriting fresh tagging.
  return { ...tags, lanes: review.lanes, 'lanes:forward': '1', 'lanes:backward': '1',
    'lanes:both_ways': '0', 'ptbo:marking-review': id };
}
