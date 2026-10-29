import {applyRecordingReferenceAppearance} from './recording-reference-appearances.js?v=1.6.151';
import {RECORDING_PHOTO_PROFILES} from './recording-photo-profiles.js?v=1.6.151';
import {applyCorridorRecordingAppearance} from './corridor-recording-appearances.js?v=1.6.151';

/** Display-only opt-out, independent of road, identity and simulation settings. */
export function recordingReferencesEnabled(search = '') {
  const params = new URLSearchParams(search);
  return params.get('recordingReferences') !== 'off' && params.get('visuals') !== 'legacy';
}

/** Preserve source records and apply a photograph only to its reviewed wall. */
export function applyRecordingAppearance(profile, enabled = true, expansionEnabled = true) {
  if (!enabled || !profile) return profile;
  const result = applyCorridorRecordingAppearance(applyRecordingReferenceAppearance(profile, enabled), expansionEnabled);
  const photo = RECORDING_PHOTO_PROFILES[profile.id];
  if (!photo) return result;
  const faceIndex = photo.frontageIndex ?? 0;
  if (faceIndex === 0) return result.facadePhoto ? result : {...result, facadePhoto: photo.facadePhoto};
  const index = faceIndex - 1;
  if (!Number.isInteger(index) || !result.additionalFrontages?.[index] || result.additionalFrontages[index].facadePhoto) return result;
  return {...result, additionalFrontages: result.additionalFrontages.map((face, i) => i === index ? {...face, facadePhoto: photo.facadePhoto} : face)};
}
