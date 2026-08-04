import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { detectPest } from '../lib/api';

function PestDetectionPage() {
  const { t } = useTranslation();

  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(file));
      setFileToUpload(file);
      setResult(null);
      setError(null);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      setFileToUpload(file);
      setResult(null);
      setError(null);
    }
  };

  const handleAnalyze = async () => {
    if (!fileToUpload) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setStatusMessage(null);

    try {
      // 1. Upload to Supabase Storage
      const fileExt = fileToUpload.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('pest-photos')
        .upload(filePath, fileToUpload);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: publicUrlData } = supabase.storage
        .from('pest-photos')
        .getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;

      // 3. Call backend API with retry logic for 503
      let detectionResult;
      try {
        detectionResult = await detectPest(publicUrl);
      } catch (err) {
        if (err.status === 503) {
          const waitSecs = err.retry_in || 15;
          // Status messages are UI strings — translated
          setStatusMessage(t('pest.status.warming_up', { secs: Math.round(waitSecs) }));
          await new Promise((resolve) => setTimeout(resolve, waitSecs * 1000));
          setStatusMessage(t('pest.status.retrying'));
          detectionResult = await detectPest(publicUrl);
          setStatusMessage(null);
        } else {
          throw err;
        }
      }

      // 4. Set result — result.label is an ML output, not translated
      setResult({ ...detectionResult, imageUrl: publicUrl });
    } catch (err) {
      setStatusMessage(null);
      // Use fallback error message from translations; err.message is an API output kept as-is
      setError(err.message || t('pest.errors.analysis_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="hero">
        <h1 className="hero-title">{t('pest.hero_title')}</h1>
        <p className="hero-subtitle">{t('pest.hero_subtitle')}</p>
      </section>

      <div className="container">
        <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
          <h2 className="card-title">{t('pest.card_title')}</h2>
          <div
            className={`upload-area ${dragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input').click()}
          >
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: 'var(--radius-md)' }}
              />
            ) : (
              <>
                <div className="upload-icon">📷</div>
                <p className="upload-text">{t('pest.upload_text')}</p>
                <p className="upload-hint">{t('pest.upload_hint')}</p>
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
              <button
                className="btn btn-primary"
                onClick={handleAnalyze}
                disabled={loading}
                id="btn-analyze-pest"
              >
                {loading ? (
                  <><span className="spinner"></span>{t('pest.analyzing')}</>
                ) : (
                  t('pest.btn_analyze')
                )}
              </button>
              {statusMessage && (
                <p style={{ marginTop: 'var(--space-md)', color: 'var(--gray-600)' }}>
                  {statusMessage}
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 'var(--space-xl)' }}>
            <strong>{t('pest.errors.error_prefix')}</strong> {error}
          </div>
        )}

        {result && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }} id="pest-result">
            {result.escalate ? (
              <div className="alert alert-warning" style={{ display: 'block' }}>
                <strong style={{ display: 'block', marginBottom: 'var(--space-sm)' }}>
                  {t('pest.result.low_confidence_title')}
                </strong>
                {/* confidence value is a number — interpolated into translated string */}
                {t('pest.result.low_confidence_desc', {
                  value: (result.confidence * 100).toFixed(1),
                })}
                <br /><br />
                {/* ID is a runtime number — interpolated into translated string */}
                <strong>
                  {t('pest.result.query_sent', {
                    id: Math.floor(Math.random() * 90000) + 10000,
                  })}
                </strong>
                <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.9rem' }}>
                  {t('pest.result.expert_review')}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
                <div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('pest.result.detected_condition')}
                  </p>
                  {/* result.label is an ML/HF API output — displayed as-is, never translated */}
                  <h2 className="result-crop" style={{ color: 'var(--danger)' }}>{result.label}</h2>
                </div>
                <span className="badge badge-danger" style={{ fontSize: '1rem', padding: 'var(--space-sm) var(--space-lg)' }}>
                  {(result.confidence * 100).toFixed(1)}% confidence
                </span>
              </div>
            )}

            {!result.escalate && (
              <div className="confidence-bar" style={{ marginTop: 'var(--space-lg)' }}>
                <div
                  className="confidence-fill"
                  style={{ width: `${result.confidence * 100}%`, background: 'linear-gradient(90deg, var(--accent-600), var(--danger))' }}
                ></div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default PestDetectionPage;
