/** Resolve an initial station model load into exactly one ready or fallback path. */
export async function loadSelectedStationOrFallback(load, onReady, onFallback) {
  let loaded;
  try {
    loaded = await load();
  } catch (error) {
    onFallback(error);
    return false;
  }
  if (loaded) { onReady(); return true; }
  onFallback(null);
  return false;
}
