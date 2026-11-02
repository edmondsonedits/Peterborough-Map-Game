/** Cache one request promise per stable key for this page lifetime. */
export function createPromiseCache() {
  const requests = new Map();
  return function cachedRequest(key, load) {
    if (!requests.has(key)) {
      const request = Promise.resolve().then(load);
      requests.set(key, request);
      request.catch(() => {
        if (requests.get(key) === request) requests.delete(key);
      });
    }
    return requests.get(key);
  };
}
