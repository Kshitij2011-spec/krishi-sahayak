import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { detectPest } from '../lib/api';

function PestDetectionPage() {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);

  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('Please select a valid image file.');
      return;
    }

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    const imageUrl = URL.createObjectURL(file);

    setPreview(imageUrl);
    setFileToUpload(file);
    setResult(null);
    setError(null);
    setStatusMessage(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);

    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    handleFile(file);

    // Allow selecting the same file again
    e.target.value = '';
  };

  const handleAnalyze = async () => {
    if (!fileToUpload) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setStatusMessage(null);

    try {
      // 1. Upload image to Supabase
      const fileExt = fileToUpload.name.split('.').pop();

      const fileName = `${Math.random()
        .toString(36)
        .substring(2, 15)}_${Date.now()}.${fileExt}`;

      const filePath = `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('pest-photos')
        .upload(filePath, fileToUpload);

      if (uploadError) {
        throw uploadError;
      }

      // 2. Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('pest-photos')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;

      // 3. Call pest detection API
      let detectionResult;

      try {
        detectionResult = await detectPest(publicUrl);
      } catch (err) {
        if (err.status === 503) {
          const waitSecs = err.retry_in || 15;

          setStatusMessage(
            t('pest.status.warming_up', {
              secs: Math.round(waitSecs),
            })
          );

          await new Promise((resolve) =>
            setTimeout(resolve, waitSecs * 1000)
          );

          setStatusMessage(t('pest.status.retrying'));

          detectionResult = await detectPest(publicUrl);

          setStatusMessage(null);
        } else {
          throw err;
        }
      }

      setResult({
        ...detectionResult,
        imageUrl: publicUrl,
      });
    } catch (err) {
      setStatusMessage(null);
      setError(
        err.message || t('pest.errors.analysis_error')
      );
    } finally {
      setLoading(false);
    }
  };

  const removeImage = () => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setPreview(null);
    setFileToUpload(null);
    setResult(null);
    setError(null);
    setStatusMessage(null);
  };

  return (
    <main className="pest-page">

      {/* HERO */}
      <section className="hero hero-pest">

        <div className="hero-content hero-pest-content">
          <div className="hero-eyebrow">
            🌱 AI AGRICULTURE ASSISTANT
          </div>

          <h1 className="hero-title">
            {t('pest.hero_title')}
          </h1>

          <p className="hero-subtitle">
            {t('pest.hero_subtitle')}
          </p>

          <div className="hero-accent-line" />
        </div>

      </section>

      {/* MAIN CONTENT */}
      <div className="container pest-container">

        {/* UPLOAD CARD */}
        <section className="pest-card">

          <div className="pest-card-header">
            <div>
              <p className="section-label">
                🔬 IMAGE ANALYSIS
              </p>

              <h2 className="card-title">
                {t('pest.card_title')}
              </h2>

              <p className="pest-description">
                Upload a clear image of your crop or plant leaf.
                Our AI model will analyze it and identify possible
                pests or diseases.
              </p>
            </div>

            <div className="pest-ai-badge">
              <span>✦</span>
              AI Powered
            </div>
          </div>

          {/* UPLOAD AREA */}
          <div
            className={`pest-upload-area ${dragging ? 'dragging' : ''
              } ${preview ? 'has-preview' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >

            {preview ? (
              <div className="preview-wrapper">

                <img
                  src={preview}
                  alt="Selected crop"
                  className="pest-preview"
                />

                <div className="preview-overlay">
                  <span>Click to replace image</span>
                </div>

              </div>
            ) : (
              <div className="upload-content">

                <div className="upload-icon-wrapper">
                  <span className="upload-icon">📷</span>
                </div>

                <h3>
                  {t('pest.upload_text')}
                </h3>

                <p>
                  {t('pest.upload_hint')}
                </p>

                <span className="upload-browse">
                  Browse Image
                </span>

              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              hidden
            />
          </div>

          {/* FILE ACTIONS */}
          {preview && (
            <div className="pest-actions">

              <button
                type="button"
                className="btn btn-outline"
                onClick={removeImage}
                disabled={loading}
              >
                Remove Image
              </button>

              <button
                type="button"
                className="btn btn-primary pest-analyze-btn"
                onClick={handleAnalyze}
                disabled={loading}
                id="btn-analyze-pest"
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    {t('pest.analyzing')}
                  </>
                ) : (
                  <>
                    ✦ {t('pest.btn_analyze')}
                  </>
                )}
              </button>

            </div>
          )}

          {/* LOADING STATUS */}
          {statusMessage && (
            <div className="pest-status">
              <span className="status-dot" />
              {statusMessage}
            </div>
          )}

        </section>

        {/* ERROR */}
        {error && (
          <div className="alert alert-danger pest-alert">
            <span className="alert-icon">⚠️</span>

            <div>
              <strong>
                {t('pest.errors.error_prefix')}
              </strong>

              <p>{error}</p>
            </div>
          </div>
        )}

        {/* RESULT */}
        {result && (
          <section
            className="pest-result-card"
            id="pest-result"
          >

            <div className="result-header">

              <div>
                <p className="section-label">
                  AI ANALYSIS RESULT
                </p>

                {result.escalate ? (
                  <h2 className="result-title warning">
                    {t('pest.result.low_confidence_title')}
                  </h2>
                ) : (
                  <>
                    <p className="result-label">
                      {t('pest.result.detected_condition')}
                    </p>

                    <h2 className="result-title">
                      {result.label}
                    </h2>
                  </>
                )}
              </div>

              <div
                className={`confidence-badge ${result.escalate ? 'warning' : ''
                  }`}
              >
                {(result.confidence * 100).toFixed(1)}%
                <span>confidence</span>
              </div>

            </div>

            {result.escalate ? (
              <div className="low-confidence-box">

                <div className="low-confidence-icon">
                  ⚠️
                </div>

                <div>
                  <h3>
                    {t('pest.result.low_confidence_title')}
                  </h3>

                  <p>
                    {t('pest.result.low_confidence_desc', {
                      value: (result.confidence * 100).toFixed(1),
                    })}
                  </p>

                  <strong>
                    {t('pest.result.query_sent', {
                      id: Math.floor(Math.random() * 90000) + 10000,
                    })}
                  </strong>

                  <p className="expert-review">
                    {t('pest.result.expert_review')}
                  </p>
                </div>

              </div>
            ) : (
              <>

                <div className="confidence-section">

                  <div className="confidence-info">
                    <span>Detection confidence</span>
                    <strong>
                      {(result.confidence * 100).toFixed(1)}%
                    </strong>
                  </div>

                  <div className="confidence-bar">
                    <div
                      className="confidence-fill"
                      style={{
                        width: `${result.confidence * 100}%`,
                      }}
                    />
                  </div>

                </div>

                {result.imageUrl && (
                  <div className="result-image-section">
                    <img
                      src={result.imageUrl}
                      alt="Analyzed crop"
                      className="result-image"
                    />
                  </div>
                )}

              </>
            )}

          </section>
        )}

      </div>
    </main>
  );
}

export default PestDetectionPage;