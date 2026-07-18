import { useState, useEffect } from 'react';
import api from '../services/api';

// `stats` comes from App, which already polls /api/stats.
function SecurityDashboard({ stats }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const data = await api('/api/security/logs?limit=20');
      setLogs(data.logs);
      setLoading(false);
    } catch (error) {
      console.error('Error loading security data:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="col"><p className="sub" style={{ paddingTop: '40px', textAlign: 'center' }}>Loading security data…</p></div>;
  }

  const score = stats ? Math.round(((stats.total_queries - stats.security_incidents) / Math.max(stats.total_queries, 1)) * 100) : 100;

  return (
    <div className="col wide">
      <div className="head">
        <h1>Security</h1>
        <span className="sub">Every question is checked before it reaches the model</span>
      </div>

      <div className="cards">
        <div className="card"><span className="l">Security events</span><span className="v" style={{ color: 'var(--red)' }}>{stats?.security_incidents || 0}</span><span className="s">blocked or redacted</span></div>
        <div className="card"><span className="l">PII detections</span><span className="v" style={{ color: 'var(--amber)' }}>{stats?.pii_detections || 0}</span><span className="s">redacted before sending</span></div>
        <div className="card"><span className="l">Total queries</span><span className="v">{stats?.total_queries || 0}</span><span className="s">since start-up</span></div>
        <div className="card score">
          <div style={{ display: 'grid', gap: '6px' }}><span className="l">Security score</span><span className="v">{score}%</span><span className="s">queries with no incident</span></div>
          <svg width="56" height="56" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--tint)" strokeWidth="5" />
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--mint)" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${(score / 100) * 94.25} 100`} transform="rotate(-90 18 18)" />
          </svg>
        </div>
      </div>

      <div className="events">
        <h3>Recent security events</h3>
        <div className="er h"><span className="t">Time</span><span>Query (as logged)</span><span>Flags</span><span className="pii">PII</span></div>
        {logs.length === 0 ? (
          <div className="empty-row">No security events yet.</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="er">
              <span className="t">{new Date(log.timestamp).toLocaleString()}</span>
              <span className="qtext" title={log.query}>{log.query.length > 100 ? log.query.substring(0, 100) + '…' : log.query}</span>
              <span>{log.flags.map((flag, i) => <span key={i} className={`flag ${flag.startsWith('INJECTION') ? 'inj' : ''}`}>{flag}</span>)}</span>
              <span className="pii">{log.pii_detected ? 'Yes' : 'No'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default SecurityDashboard;