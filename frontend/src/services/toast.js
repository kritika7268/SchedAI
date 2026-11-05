const listeners = new Set();
let nextId = 1;

function guessType(message) {
  const m = String(message).toLowerCase();
  if (/(could not|failed|error|invalid|cannot|can't|not allowed|expired|denied)/.test(m)) return "error";
  if (/(please|required|must|select|enter)/.test(m)) return "warning";
  if (/(success|created|added|updated|deleted|saved|uploaded|done)/.test(m)) return "success";
  return "info";
}

export function showToast(message, type) {
  const toast = { id: nextId++, message: String(message), type: type || guessType(message) };
  listeners.forEach((fn) => fn(toast));
}

export function subscribeToasts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Replace the blocking browser alert() with a toast (confirm() is left alone)
export function installToastAlert() {
  if (window.__toastAlertInstalled) return;
  window.__toastAlertInstalled = true;
  window.alert = (message) => showToast(message);
}