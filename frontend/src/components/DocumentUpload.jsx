import { useState } from 'react';
import { Upload, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import api from '../services/api';

function DocumentUpload({ onUploadSuccess, documents, onDeleteSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [deletingFile, setDeletingFile] = useState(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleUpload(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e) => {
    if (e.target.files?.[0]) handleUpload(e.target.files[0]);
    e.target.value = '';
  };

  const handleUpload = async (file) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadStatus({ type: 'error', message: 'Only PDF files are allowed.' });
      return;
    }

    setUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const data = await api('/api/upload', { method: 'POST', body: formData });
      setUploadStatus({
        type: 'success',
        message: `"${file.name}" uploaded — ${data.chunks} chunks indexed`
      });
      onUploadSuccess();
    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: error.detail || 'Upload failed. Please try again.'
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename) => {
    if (!window.confirm(`Delete "${filename}"?`)) return;
    setDeletingFile(filename);
    try {
      await api(`/api/documents/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      setUploadStatus({ type: 'success', message: `"${filename}" deleted.` });
      onDeleteSuccess();
    } catch {
      setUploadStatus({ type: 'error', message: `Failed to delete "${filename}".` });
    } finally {
      setDeletingFile(null);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const formatDate = (isoString) => {
    try {
      return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '—';
    }
  };

  return (
    <div className="col">
      <div className="head">
        <h1>Documents</h1>
        <span className="sub">PDF only · up to 10 MB each</span>
      </div>

      <div
        className={`drop ${dragActive ? 'active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <b>{uploading ? 'Uploading and indexing…' : 'Drop a PDF here'}</b>
        <p>or choose a file. It is split into chunks and indexed so you can ask about it.</p>
        <label className="btn-primary" style={{ display: 'inline-flex' }}>
          {uploading ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
          {uploading ? 'Processing…' : 'Choose file'}
          <input type="file" accept=".pdf" onChange={handleFileInput} disabled={uploading} hidden />
        </label>
      </div>

      {uploadStatus && (
        <div className={`notice ${uploadStatus.type === 'success' ? 'ok' : 'err'}`} style={{ marginTop: '14px' }} role="status">
          {uploadStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {uploadStatus.message}
        </div>
      )}

      <div className="table">
        <div className="tr h"><span /><span>Name ({documents.length})</span><span className="size">Size</span><span className="date">Uploaded</span><span /></div>
        {documents.length === 0 ? (
          <div className="empty-row">No documents yet. Upload a PDF to start asking questions.</div>
        ) : (
          documents.map((doc) => (
            <div key={doc.filename} className="tr">
              <span className="pdf">PDF</span>
              <span className="name" title={doc.filename}>{doc.filename}</span>
              <span className="m size">{formatFileSize(doc.size)}</span>
              <span className="m date">{formatDate(doc.uploaded_at)}</span>
              <button className="del" onClick={() => handleDelete(doc.filename)} disabled={deletingFile === doc.filename}>
                <Trash2 size={13} /> {deletingFile === doc.filename ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default DocumentUpload;
