import { useState } from 'react';

function PestDetectionPage() {
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
    }
  };

  return (
    <>
      <section className="hero">
        <h1 className="hero-title">Pest &amp; Disease Detection</h1>
        <p className="hero-subtitle">Upload a photo of the affected plant leaf for AI-powered diagnosis</p>
      </section>

      <div className="container">
        <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
          <h2 className="card-title">Upload Plant Image</h2>
          <div
            className={`upload-area ${dragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input').click()}
          >
            {preview ? (
              <img src={preview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: 'var(--radius-md)' }} />
            ) : (
              <>
                <div className="upload-icon">📷</div>
                <p className="upload-text">Drag &amp; drop an image here, or click to browse</p>
                <p className="upload-hint">Supports JPG, PNG up to 5MB</p>
              </>
            )}
            <input
              id="file-input"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {preview && (
            <div style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
              <button className="btn btn-primary" disabled id="btn-analyze-pest">
                Analyze Image (Coming Day 3)
              </button>
            </div>
          )}
        </div>

        <div className="alert alert-warning">
          <strong>Coming Soon:</strong> Full pest detection with pretrained plant disease model will be available on Day 3.
          The model will identify diseases from leaf images and escalate low-confidence results to KVK extension officers.
        </div>
      </div>
    </>
  );
}

export default PestDetectionPage;
