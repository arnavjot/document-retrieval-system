import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Math between $...$ or $$...$$, rendered by KaTeX. Its output is KaTeX's own
// markup built from escaped input (trust stays off, so no links, classes or
// data attributes), which makes it the one place answers become HTML.
function MathTex({ tex, display }) {
  const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore' });
  return <span className={display ? 'math-block' : 'math'} dangerouslySetInnerHTML={{ __html: html }} />;
}

// The UI lists sources under every answer, so citations the model writes
// anyway, like "(paper.pdf, page 3; paper.pdf, page 5)", are dropped.
const CITATION = /\s*\((?:[^()]*?\.pdf,\s*pages?\s*[\d,\s–-]+;?\s*)+\)/gi;

function bold(text, key) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
      : part
  );
}

// Gemini sometimes answers in Markdown despite the prompt. Render what it uses,
// **bold**, "- " / "* " bullet lists and $math$, as React elements, and leave
// everything else as plain text.
function inline(text, key) {
  return text.replace(CITATION, '').split(/(\$\$[^$]+\$\$|\$[^$\n]+\$)/g).flatMap((part, i) => {
    if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
      return [<MathTex key={`${key}-m${i}`} tex={part.slice(2, -2)} display />];
    }
    if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
      return [<MathTex key={`${key}-m${i}`} tex={part.slice(1, -1)} />];
    }
    return bold(part, `${key}-${i}`);
  });
}

function renderAnswer(text) {
  const blocks = [];
  let items = [];
  let para = [];
  const flush = () => {
    if (para.length) {
      const lines = para;
      blocks.push(<p key={blocks.length}>{lines.flatMap((l, i) => (i ? [<br key={`br${i}`} />, ...inline(l, i)] : inline(l, i)))}</p>);
    }
    if (items.length) {
      const list = items;
      blocks.push(<ul key={blocks.length}>{list.map((t, i) => <li key={i}>{inline(t, `li${i}`)}</li>)}</ul>);
    }
    para = [];
    items = [];
  };
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trimEnd();
    const item = line.match(/^\s*[-*•]\s+(.*)$/);
    if (item) {
      if (para.length) flush();
      items.push(item[1]);
    } else if (!line.trim()) {
      flush();
    } else {
      if (items.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

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
      <div className="ans-text">{renderAnswer(message.content)}</div>
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
