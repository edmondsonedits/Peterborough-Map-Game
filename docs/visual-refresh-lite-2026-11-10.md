# Lite frontage and sign replacement — 2026-11-10

The shared frontage renderer previously treated `lite` only as a window-count cap. The app could omit a frontage while the directory layer still suppressed its name from profile intent. This change makes essential reviewed facades usable in Lite and makes suppression depend on a sign that was actually constructed.

## Renderer behavior

- `createFootageFacade({ ..., lite: true })` retains panels, trim, openings, signs, and reviewed enclosed bays. It omits `facadePhoto`, `texturePatch`, and `frontGarden` before deriving geometry, makes no photo downloads, and does not mutate the source profile. Existing Lite window limits remain.
- Normal photo and garden behavior remains. A successful full-face photo hides the procedural frontage unless `keepProceduralDetails` is explicitly true. Hidden procedural signs are removed from the reported list. Explicitly verified lettering in the loaded photograph can replace them as described below. Failed photo loads retain the actual procedural signs.
- Up to three explicit `additionalFrontages` are supported, for four total reviewed faces. Their sign indices are `0` through `3`. A new tenant's `signText` does not inherit the primary face's `signBusinessName` alias.
- `signStyle: 'applied'` creates transparent lettering without a backing box or an opaque canvas fill. Existing board signs keep their prior appearance.
- Explicit `enclosedBays` are delegated to `createRecordedEnclosedBays`. Bays belong to the face that declares them; they do not inherit onto other faces. This helper makes no image requests and is safe in Lite.

## Actual sign contract

Every returned frontage group has `group.userData.renderedSigns`, including an empty array when no replacement was created. A procedural record is appended only after canvas text, texture, material, and sign mesh have been constructed and the mesh attached:

```js
{
  sourceId: 'way/123',
  frontageIndex: 1,
  name: 'Tenant name',       // explicit signBusinessName or the full sign text
  text: 'TENANT NAME',       // actual drawn text, capped at 38 characters
  frontage: [{ lat, lon }, { lat, lon }]
}
```

Missing DOM, unavailable canvas context, drawing failures, or a failed sign construction produce no procedural record. Essential facade geometry remains. Multi-face roots aggregate their child records immediately and refresh after all child photo operations settle. The array is updated in place.

The app must finish constructing the facade groups and await every `group.userData.photoReady` before supplying the live records to the directory renderer:

```js
await Promise.all([...footageFacadeGroups.values()].map(group => group.userData.photoReady));
const renderedSignsBySourceId = new Map(
  [...footageFacadeGroups].map(([sourceId, group]) => [sourceId, group.userData.renderedSigns || []])
);
createBusinessSignLayer({ /* existing options */, renderedSignsBySourceId });
```

`profiles` remains an input for opening and facade-offset clearance. It no longer demonstrates that a replacement sign exists. Missing rendered metadata preserves a directory fallback.

Suppression requires exact source identity, nonempty drawn text, the same frontage, and an exact normalized match between the directory tenant name and the record's `name` or `text`. Brand prefixes do not suppress a different tenant. Indexed rows require the same frontage index. Older directory rows have no indices; their two endpoints must lie within 0.25 m of the actual sign's supporting wall, with more than 0.1 m of longitudinal overlap. The existing `existingProfileSigns` statistic and `existingProfileSign` sample property are retained for QA compatibility; suppressed samples now include the actual `frontageIndex`.

## Verified photo interaction

The local LCBO photograph `assets/sherbrooke-frontages/n03.jpg` visibly contains readable LCBO lettering on the right awning. Its profile, `way/194192530`, is the only photo annotated with `facadePhoto.verifiedSignTexts: ['LCBO']`. No photo claims are derived from profile sign intent, filenames, or failed downloads. Other photographs require direct pixel review before this field is added.

After the photograph mesh attaches successfully, the renderer appends `{ kind: 'photo', sourceId, frontageIndex, name: 'LCBO', text: 'LCBO', frontage }`. The photo mesh also stores those same records in `mesh.userData.renderedSigns`. The normal full-face photo still hides and removes the procedural record, so the directory sees exactly the verified loaded replacement. A failed photo emits no photo record; an actual procedural sign can still serve as its replacement. If both photo and procedural text are unavailable, the directory fallback remains. Lite downloads no photo, creates no photo metadata, and keeps its successful procedural LCBO sign.

## Verification

The focused renderer, directory layout, Chemong integration, photo lifecycle, arches, and enclosed-bay suite passes **63/63** tests. Coverage includes unavailable canvas text, missing replacement fallback, a second tenant on an additional frontage, wrong source/frontage/name, Lite download omission, applied lettering, four-face bounds, and prevention of bay inheritance. LCBO tests use its real mapped ring and frontage and cover successful photo load, failed photo with and without procedural text, Lite omission, directory suppression/fallback, and the single reviewed photo annotation. Both edited renderer modules and the profile module pass `node --check`.

Actual Normal/Lite cab and oblique screenshots, download observations, and full-suite release verification remain with the app integration pass.
