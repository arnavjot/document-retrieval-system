import { progressOf } from '../services/uploadQueue';

// The upload progress bar, shared by the Documents tab and the chat composer.
function UploadProgress({ q, compact = false }) {
  const progress = progressOf(q);
  if (!progress) return null;
  return (
    <div className={`upbar ${progress.wait ? 'waiting' : ''} ${compact ? 'compact' : ''}`} role="status" aria-live="polite">
      <div className="upbar-top">
        <span>{compact ? `${q.current}: ` : ''}{progress.label}</span>
        <span className="pct">{progress.pct}%</span>
      </div>
      <div className="upbar-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.pct}>
        <span style={{ width: `${progress.pct}%` }} />
      </div>
      {(!compact || progress.wait) && (
        <small>
          {progress.wait
            ? `Gemini's free tier allows 100 embeddings a minute. Waiting ${progress.wait}s, then it carries on by itself.`
            : 'Large PDFs take a minute or two: every chunk is embedded with Gemini.'}
        </small>
      )}
      {q.files.length > 0 && <small>Next: {q.files.map((f) => f.name).join(', ')}</small>}
    </div>
  );
}

export default UploadProgress;
