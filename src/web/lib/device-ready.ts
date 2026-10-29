// Whether this device has Python and the course's libraries kept (#191): set by the get-ready page
// once everything downloaded and a test ran, per Pyodide version (a new version downloads anew).
// Only a convenience: the course page stops suggesting the page. Storage may be blocked; then it
// keeps suggesting it, which is harmless.

const KEY = `python-ready:${__PYODIDE_VERSION__}`;

export function deviceReady() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function markDeviceReady() {
  try {
    localStorage.setItem(KEY, new Date().toISOString());
  } catch {
    // Not kept: the page will be suggested again.
  }
}

/** The libraries the course's notebooks import, with about what each downloads (measure:room). */
export const COURSE_LIBRARIES = [
  { name: 'numpy', code: 'import numpy', mb: 3 },
  { name: 'networkx', code: 'import networkx', mb: 1 },
  { name: 'matplotlib', code: 'import matplotlib.pyplot', mb: 10 },
  { name: 'plotly', code: 'import plotly', mb: 11 },
] as const;

/** The engine's share of the download, for the progress bar. */
export const ENGINE_MB = 6;
