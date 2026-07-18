import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

function MessageBubble({ message }) {
  const [showSources, setShowSources] = useState(false);

  if (message.role === 'user') {
    return <div className="q">{message.content}</div>;
  }

  const sources = message.sources || [];
  return (
    <div className={`ans ${message.error ? 'error' : ''}`}>
      {message.warnings && message.warnings.length > 0 && (
        <span className="warn-pill">{message.warnings.join(' · ')}</span>
      )}
      <div className="ans-text">{message.content}</div>
      {sources.length > 0 && (
        <>
          <div className="ans-meta">
            <button className="src-toggle" onClick={() => setShowSources(!showSources)} aria-expanded={showSources}>
              {showSources ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {sources.length} source{sources.length !== 1 ? 's' : ''}
            </button>
            <span>Gemini Flash-Lite</span>
          </div>
          {showSources && (
            <div className="srcs">
              {sources.map((source, idx) => (
                <div key={idx} className="src">
                  <b>{source.source} · Page {source.page}</b>
                  <span>{source.content}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MessageBubble;
