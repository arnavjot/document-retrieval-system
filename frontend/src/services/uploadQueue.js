import { useEffect, useState } from 'react';
import api, { BASE_URL } from './api';

// One upload queue for the whole app (the Documents tab and the chat's + button).
// It lives outside any component, so it keeps going, and is still shown, when
// the user switches tabs. Files are sent one at a time: the server indexes one
// PDF at a time.

// Sent with XMLHttpRequest, not fetch: only XHR reports upload progress.
function sendFile(formData, onSent) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    // wait=false: the server answers once the file is saved and indexes it in the
    // background, so a long PDF can't outlast a proxy's request timeout.
    xhr.open('POST', `${BASE_URL}/api/upload?wait=false`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onSent(e.loaded / e.total); };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(Object.assign(new Error(`HTTP ${xhr.status}`), {
        status: xhr.status,
        detail: typeof data.detail === 'string' ? data.detail : undefined
      }));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(formData);
  });
}

// Sending is the first 10%, chunking pages the next 40%, indexing chunks the rest.
function describe(sent, server) {
  if (sent < 1 || !server?.active) {
    return { pct: Math.round(sent * 10), label: sent < 1 ? 'Uploading the file' : 'Reading the PDF' };
  }
  const { stage, done = 0, total = 0, waiting_s: wait = 0 } = server;
  const part = total ? done / total : 0;
  if (stage === 'chunking') {
    return { pct: Math.round(10 + 40 * part), label: `Splitting page ${done} of ${total} into chunks` };
  }
  if (stage === 'indexing') {
    return { pct: Math.round(50 + 50 * part), label: `Indexing ${done} of ${total} chunks with Gemini`, wait };
  }
  return { pct: 10, label: 'Reading the PDF' };
}

// The progress bar for a queue snapshot, or null when nothing is uploading.
export function progressOf(q) {
  if (!q.running) return null;
  if (q.server?.active && q.server.filename !== q.current) {
    return { ...describe(1, q.server), label: `Waiting for ${q.server.filename} to finish` };
  }
  return describe(q.sent, q.server);
}

const queue = { files: [], running: false, current: null, sent: 0, server: null, status: null };
const listeners = new Set();
let onIndexed = () => {};
let following = null;
const snapshot = () => ({ ...queue, files: [...queue.files] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function update(patch) {
  Object.assign(queue, patch);
  listeners.forEach((fn) => fn(snapshot()));
}

// Show a message under the upload controls (also used for deletes).
export function setUploadStatus(status) {
  update({ status });
}

// Called after each file finishes (or fails), to refresh the document list.
export function setOnIndexed(fn) {
  onIndexed = fn;
}

// Poll the server's progress until nothing is indexing (or, given a name,
// until that file has finished).
async function pollUntilIdle(filename) {
  for (;;) {
    await sleep(800);
    let p;
    try { p = await api('/api/upload/progress'); } catch { continue; } // keep polling through blips
    update({ server: p });
    if (!p.active && (!filename || p.filename === filename)) return p;
  }
}

async function runQueue() {
  if (queue.running) return;
  update({ running: true });
  while (queue.files.length) {
    const file = queue.files.shift();
    update({ current: file.name, sent: 0, server: null });
    const formData = new FormData();
    formData.append('file', file);
    try {
      let data;
      for (;;) {
        try {
          data = await sendFile(formData, (s) => update({ sent: s }));
          break;
        } catch (e) {
          if (e.status !== 409) throw e;
          await pollUntilIdle(); // another PDF is indexing: wait for it, then send this one
        }
      }
      const result = data.status === 'processing' ? await pollUntilIdle(data.filename) : { state: 'done', chunks: data.chunks };
      if (result.state !== 'done') {
        throw Object.assign(new Error('Indexing failed'), { detail: result.error });
      }
      update({ status: { type: 'success', message: `"${file.name}" uploaded — ${result.chunks} chunks indexed` } });
    } catch (error) {
      update({ status: { type: 'error', message: `"${file.name}": ${error.detail || 'Upload failed. Please try again.'}` } });
    }
    onIndexed();
  }
  update({ running: false, current: null, sent: 0, server: null });
}

// Queue PDFs from a file input or a drop; anything else is skipped.
export function addFiles(fileList) {
  const files = [...(fileList || [])];
  const pdfs = files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
  if (pdfs.length < files.length) {
    update({ status: { type: 'error', message: 'Only PDF files are allowed; other files were skipped.' } });
  }
  if (!pdfs.length) return;
  queue.files.push(...pdfs);
  update({});
  runQueue();
}

// An upload may already be indexing (started before the page was reloaded):
// show it until it finishes. Several components call this; one check runs.
function followRunningUpload() {
  if (queue.running || following) return;
  following = (async () => {
    let p;
    try { p = await api('/api/upload/progress'); } catch { return; }
    if (!p.active || queue.running) return;
    update({ running: true, current: p.filename, sent: 1, server: p });
    const result = await pollUntilIdle(p.filename);
    update({
      status: result.state === 'done'
        ? { type: 'success', message: `"${p.filename}" uploaded — ${result.chunks} chunks indexed` }
        : { type: 'error', message: `"${p.filename}": ${result.error || 'Indexing failed.'}` },
      running: false, current: null, sent: 0, server: null
    });
    onIndexed();
    if (queue.files.length) runQueue();
  })().finally(() => { following = null; });
}

// The queue's current state, re-rendering the component whenever it changes.
export function useUploadQueue() {
  const [q, setQ] = useState(snapshot);
  useEffect(() => {
    listeners.add(setQ);
    setQ(snapshot());
    followRunningUpload();
    return () => { listeners.delete(setQ); };
  }, []);
  return q;
}
