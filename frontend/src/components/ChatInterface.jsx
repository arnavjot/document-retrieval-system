import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, FileText, FileSearch, MessageSquare, Zap, Download, Trash2, Upload } from 'lucide-react';
import MessageBubble from './MessageBubble';
import api from '../services/api';

function ChatInterface({ documents }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [noDocWarning, setNoDocWarning] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    if (documents.length === 0) {
      setNoDocWarning(true);
      setTimeout(() => setNoDocWarning(false), 3000);
      return;
    }

    setNoDocWarning(false);
    const question = input.trim();
    const userMessage = { role: 'user', content: question };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const data = await api('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, conversation_history: messages })
      });

      const assistantMessage = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        warnings: data.security_warnings
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: error.detail || 'Sorry, I encountered an error processing your question.',
        error: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  const exportChat = () => {
    const lines = ['# Document Retrieval System — Chat Export', '', `_Exported on ${new Date().toLocaleString()}_`, ''];
    messages.forEach(m => {
      lines.push(`**${m.role === 'user' ? 'You' : 'Assistant'}:**`, '', m.content, '');
      if (m.sources?.length) {
        const pages = m.sources.map(s => `${s.source ?? s.filename ?? 'document'}${s.page != null ? ` (p. ${s.page})` : ''}`);
        lines.push(`_Sources: ${[...new Set(pages)].join(', ')}_`, '');
      }
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearChat = () => {
    if (window.confirm('Clear the whole conversation?')) setMessages([]);
  };

  const hasDocuments = documents.length > 0;

  return (
    <div className="chat">
      <div className="col">
        {messages.length > 0 && (
          <div className="head" style={{ paddingTop: '18px' }}>
            <span className="sub">Chat · {documents.length} document{documents.length !== 1 ? 's' : ''}</span>
            <span style={{ display: 'flex', gap: '6px' }}>
              <button type="button" className="btn" onClick={exportChat} disabled={loading}><Download size={14} /> Export</button>
              <button type="button" className="btn" onClick={clearChat} disabled={loading} title="Clear conversation"><Trash2 size={14} /> Clear</button>
            </span>
          </div>
        )}

        {noDocWarning && (
          <div className="notice warn" style={{ marginTop: '16px' }} role="alert">
            <FileText size={16} />
            No documents uploaded yet. Go to the Documents tab to upload a PDF first.
          </div>
        )}

        {messages.length === 0 ? (
          <div className="welcome">
            <div>
              <span className="logo-mark" style={{ width: '60px', height: '60px', borderRadius: '18px', margin: '0 auto' }}><FileSearch size={30} strokeWidth={1.8} /></span>
              <h2>Ask your documents</h2>
              <p>Powered by Gemini Flash-Lite. Upload a PDF and ask anything about its contents.</p>
              <div className="tiles">
                {[
                  { icon: <Upload size={18} />, text: 'Upload PDFs' },
                  { icon: <Zap size={18} />, text: 'Instant answers' },
                  { icon: <MessageSquare size={18} />, text: 'Follow-up questions' }
                ].map((item, i) => (
                  <div key={i} className="tile"><span className="tile-icon">{item.icon}</span>{item.text}</div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="thread" aria-live="polite">
            {messages.map((message, index) => <MessageBubble key={index} message={message} />)}
            {loading && (
              <div className="thinking"><Loader2 size={16} className="spin" /> Thinking…</div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="composer">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={hasDocuments ? 'Ask a question about your documents…' : 'Upload a document to start asking questions'}
            disabled={loading}
            aria-label="Your question"
          />
          <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
            Send <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatInterface;
