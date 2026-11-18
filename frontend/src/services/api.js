// Same-origin: the Vite dev server proxies /api to the backend (see vite.config.js).
const BASE_URL = '';

// fetch() that resolves to the parsed JSON body and rejects on non-2xx, with
// the backend's FastAPI `detail` message on `error.detail` when there is one
// (422 validation errors carry a list there, which isn't a displayable message).
export default async function api(path, options) {
  const res = await fetch(BASE_URL + path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), {
    detail: typeof data.detail === 'string' ? data.detail : undefined
  });
  return data;
}

export { BASE_URL };
