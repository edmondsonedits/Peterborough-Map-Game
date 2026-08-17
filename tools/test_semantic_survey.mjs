import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SEMANTIC_SURVEY_SCHEMA_VERSION,
  createDraftPointFeature,
  semanticSurveySummary,
  validateSemanticSurvey,
} from '../city-explorer/semantic-survey.js';

const survey = JSON.parse(await readFile(new URL('../city-explorer/data/survey/station-one-survey.geojson', import.meta.url), 'utf8'));
const inventory = JSON.parse(await readFile(new URL('../city-explorer/data/survey/station-one-district-inventory.geojson', import.meta.url), 'utf8'));
const validation = validateSemanticSurvey(survey);
assert.equal(validation.valid, true, validation.errors.join('\n'));
assert.equal(survey.metadata.schema_version, SEMANTIC_SURVEY_SCHEMA_VERSION);
assert.match(survey.metadata.source.licence, /Open Government Licence/);
assert.equal(survey.metadata.reference_overlay.developer_only, true);
assert.equal(survey.metadata.production_policy.stable_features_only, true);
const summary = semanticSurveySummary(survey);
assert.ok(summary.byType.tree >= 10);
assert.equal(summary.byType.parked_vehicle, undefined);
assert.equal(summary.total, survey.features.length);
assert.equal(summary.reviewed, survey.features.length);
assert.ok(inventory.metadata.coverage.target_area_m2 / inventory.metadata.coverage.baseline_area_m2 >= 9.999);
assert.ok(inventory.metadata.coverage.target_area_m2 / inventory.metadata.coverage.baseline_area_m2 <= 10.001);
assert.ok(inventory.metadata.coverage.feature_counts.building >= 400);
assert.ok(inventory.metadata.coverage.feature_counts.tree >= 90);
assert.ok(inventory.metadata.coverage.feature_counts.curb >= 250);
assert.ok(inventory.metadata.coverage.feature_counts.paved_area >= 100);
assert.equal(validateSemanticSurvey(inventory).valid, true, validateSemanticSurvey(inventory).errors.join('\n'));
const draft = createDraftPointFeature({ id: 'draft-tree-1', semanticType: 'tree', lon: -78.32, lat: 44.3 });
assert.equal(draft.geometry.type, 'Point');
assert.equal(draft.properties.review_status, 'draft');
const invalid = structuredClone(survey);
invalid.features[0].geometry.coordinates = [-79, 45];
assert.equal(validateSemanticSurvey(invalid).valid, false);

console.log(JSON.stringify({ status: 'pass', schema: SEMANTIC_SURVEY_SCHEMA_VERSION, ...summary }));
