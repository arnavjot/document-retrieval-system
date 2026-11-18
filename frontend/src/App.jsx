import { useState, useEffect } from 'react';
import { FileSearch } from 'lucide-react';
import ChatInterface from './components/ChatInterface';
import DocumentUpload from './components/DocumentUpload';
import SecurityDashboard from './components/SecurityDashboard';
import api from './services/api';
import { setOnIndexed } from './services/uploadQueue';

function App() {
  const [activeTab, setActiveTab] = useState('chat');
  const [documents, setDocuments] = useState([]);
  const [stats, setStats] = useState(null);
  const [apiUp, setApiUp] = useState(true); // follows the stats poll

  useEffect(() => {
    loadDocuments();
    loadStats();
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadDocuments = async () => {
    try {
      const data = await api('/api/documents');
      setDocuments(data.documents);
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  const loadStats = async () => {
    try {
      const data = await api('/api/stats');
      setStats(data.statistics);
      setApiUp(true);
    } catch (error) {
      setApiUp(false);
      console.error('Error loading stats:', error);
    }
  };

  const handleDocumentUpload = () => {
    loadDocuments();
    loadStats();
  };

  // Uploads can start from the Documents tab or the chat's + button; either
  // way the document list refreshes when each file finishes.
  useEffect(() => { setOnIndexed(handleDocumentUpload); });

  const tabs = [
    { id: 'chat', label: 'Chat' },
    { id: 'upload', label: 'Documents', badge: documents.length || null },
    { id: 'security', label: 'Security', badge: stats?.security_incidents || null },
  ];

  return (
    <div className="app">
      <header className="bar">
        <div className="logo">
          <span className="logo-mark"><FileSearch size={18} /></span>
          <span>Document Retrieval</span>
        </div>
        <nav className="tabs" aria-label="Sections">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className="tab"
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
              {tab.badge > 0 && <span className="badge">{tab.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="status">
          {stats && (
            <span className="overview">
              <span><b>{stats.total_documents}</b> docs</span>
              <span><b>{stats.total_queries}</b> queries</span>
              <span><b>{stats.security_incidents}</b> security events</span>
            </span>
          )}
          <span><span className={`dot ${apiUp ? '' : 'down'}`} />{apiUp ? 'API connected' : 'API unreachable'}</span>
        </div>
      </header>

      <main className="content">
        {activeTab === 'chat' && <ChatInterface documents={documents} onGoToDocuments={() => setActiveTab('upload')} />}
        {activeTab === 'security' && <SecurityDashboard stats={stats} />}
        {activeTab === 'upload' && (
          <DocumentUpload
            documents={documents}
            onDeleteSuccess={handleDocumentUpload}
          />
        )}
      </main>
    </div>
  );
}

export default App;
