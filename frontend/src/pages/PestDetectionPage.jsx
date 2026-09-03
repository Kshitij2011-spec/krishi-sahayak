import { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { detectPest } from '../lib/api';
import LocationPicker from '../components/LocationPicker';
import SpeakButton from '../components/SpeakButton';
import PhotoTips from '../components/PhotoTips';
import OfficerRequestModal from '../components/OfficerRequestModal';
import { useGeolocation } from '../hooks/useGeolocation';

// ── Client-side pre-flight limits (mirrors backend image_validator.py) ──────
const MIN_FILE_BYTES = 5_000;     // 5 KB
const MAX_FILE_BYTES = 15_000_000; // 15 MB

// ── Crops the IMAGE MODEL does NOT support ────────────────────────────────────
// These are NOT in PlantVillage. Showing a PlantVillage class for them would
// be misleading. We warn the farmer and redirect to Crop Risk instead.
const UNSUPPORTED_DETECTION_CROPS = new Set([
  'cotton', 'rice', 'wheat', 'sugarcane', 'chickpea',
  'groundnut', 'jowar', 'bajra', 'tur', 'moong',
]);

// Display name lookup for unsupported crops
const CROP_DISPLAY_NAMES = {
  cotton:    'Cotton / कपास',
  rice:      'Rice / धान',
  wheat:     'Wheat / गेहूँ',
  sugarcane: 'Sugarcane / गन्ना',
  chickpea:  'Chickpea / चना',
  groundnut: 'Groundnut / मूंगफली',
  jowar:     'Jowar / ज्वार',
  bajra:     'Bajra / बाजरा',
  tur:       'Tur / अरहर',
  moong:     'Moong / मूंग',
};

// All crops in a farmer-friendly selector
const ALL_CROPS = [
  // Supported by detection model
  { value: 'tomato',   label: 'Tomato / टमाटर',  supported: true },
  { value: 'potato',   label: 'Potato / आलू',     supported: true },
  { value: 'corn',     label: 'Corn / मक्का',      supported: true },
  { value: 'grape',    label: 'Grape / अंगूर',     supported: true },
  { value: 'pepper',   label: 'Pepper / मिर्च',    supported: true },
  { value: 'apple',    label: 'Apple / सेब',        supported: true },
  // NOT supported by detection model
  { value: 'cotton',    label: 'Cotton / कपास',     supported: false },
  { value: 'rice',      label: 'Rice / धान',        supported: false },
  { value: 'wheat',     label: 'Wheat / गेहूँ',      supported: false },
  { value: 'sugarcane', label: 'Sugarcane / गन्ना', supported: false },
  { value: 'chickpea',  label: 'Chickpea / चना',   supported: false },
  { value: 'groundnut', label: 'Groundnut / मूंगफली', supported: false },
];

// ── Severity badge ─────────────────────────────────────────────────────────
const SEVERITY_CONFIG = {
  None:    { cls: 'severity-none',    emoji: '✅' },
  Low:     { cls: 'severity-low',     emoji: '🟡' },
  Medium:  { cls: 'severity-medium',  emoji: '🟠' },
  High:    { cls: 'severity-high-d',  emoji: '🔴' },
  Unknown: { cls: 'severity-unknown', emoji: '❓' },
};

function SeverityBadge({ severity, t }) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.Unknown;
  const label = t(`common.severity_${(severity || 'unknown').toLowerCase()}`) || severity;
  return (
    <span className={`detection-severity-badge ${cfg.cls}`}>
      {cfg.emoji} {label}
    </span>
  );
}

function ConfidenceBar({ score }) {
  const pct = (score * 100).toFixed(1);
  let color, gradientColor, label;
  if (score >= 0.75) {
    color = '#22c55e'; gradientColor = 'linear-gradient(90deg, #22c55e, #4ade80)'; label = 'High';
  } else if (score >= 0.45) {
    color = '#eab308'; gradientColor = 'linear-gradient(90deg, #eab308, #facc15)'; label = 'Medium';
  } else {
    color = '#ef4444'; gradientColor = 'linear-gradient(90deg, #ef4444, #f87171)'; label = 'Low';
  }
  return (
    <div className="pd-confidence-card">
      <div className="pd-confidence-header">
        <span className="pd-confidence-label">AI Confidence</span>
        <div className="pd-confidence-value-row">
          <strong className="pd-confidence-pct" style={{ color }}>{pct}%</strong>
          <span className="pd-confidence-tier" style={{ background: color + '20', color }}>{label}</span>
        </div>
      </div>
      <div className="pd-confidence-bar">
        <div className="pd-confidence-fill" style={{ width: `${pct}%`, background: gradientColor }} />
      </div>
    </div>
  );
}

// ── Farmer-friendly error mapper ────────────────────────────────────────────
function mapError(err, t) {
  if (!err) return t('pest.errors.analysis_error');
  const status = err.status;
  if (status === 422) return t('pest.errors.validation_failed');
  if (status === 503) return t('pest.errors.api_unavailable');
  if (status === 500) return t('pest.errors.api_unavailable');
  if (err.message?.toLowerCase().includes('upload')) return t('pest.errors.upload_failed');
  if (err.message?.toLowerCase().includes('network') || err.message?.toLowerCase().includes('failed to fetch'))
    return t('pest.errors.upload_failed');
  return t('pest.errors.analysis_error');
}

// ── Build TTS text from result ──────────────────────────────────────────────
function buildSpeakText(result, t) {
  if (!result) return '';
  const parts = [];
  const tier = result.confidence_tier;
  const pct  = (result.confidence * 100).toFixed(0);

  if (tier === 'high') {
    if (result.is_healthy) {
      parts.push(`${t('common.confidence_high')}. ${result.explanation || 'Crop appears healthy.'}`);
    } else {
      parts.push(`${t('pest.result.detected_condition')}: ${result.disease}.`);
      parts.push(`${t('pest.result.severity_label')}: ${result.severity}.`);
      parts.push(`${t('common.confidence_high')}: ${pct} percent.`);
      if (result.explanation) parts.push(result.explanation);
    }
  } else if (tier === 'medium') {
    parts.push(`${t('pest.result.possible_condition')}: ${result.disease}.`);
    parts.push(t('pest.result.medium_confidence_note'));
    parts.push(`AI Confidence: ${pct} percent.`);
  } else {
    parts.push(t('pest.result.low_confidence_title'));
    parts.push(t('pest.result.low_confidence_action'));
    parts.push(t('pest.result.expert_review'));
  }

  if (result.forecast?.status === 'available' && result.forecast.risks?.length > 0) {
    const risk = result.forecast.risks[0];
    if (risk.ipm?.cultural?.[0]) {
      parts.push(`${t('pest.result.cultural_controls')}: ${risk.ipm.cultural[0]}`);
    }
  }

  return parts.join(' ');
}

// ════════════════════════════════════════════════════════════════════════════
export default function PestDetectionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [selectedCrop, setSelectedCrop]   = useState('');
  const [dragging, setDragging]           = useState(false);
  const [preview, setPreview]             = useState(null);
  const [fileToUpload, setFileToUpload]   = useState(null);
  const [loading, setLoading]             = useState(false);
  const [result, setResult]               = useState(null);
  const [error, setError]                 = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [trapCount, setTrapCount]         = useState('');
  const [cropStage, setCropStage]         = useState('');
  const [location, setLocation]           = useState({ lat: null, lon: null, district: null, isApproximate: false });
  // ── Officer request state ───────────────────────────────────────────────
  const [savedReportId,    setSavedReportId]    = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestSuccess,   setRequestSuccess]   = useState(null); // { reference_code, request_id }

  const gps = useGeolocation();
  useEffect(() => {
    if (gps.status === 'granted' && location.lat === null) {
      setLocation({ lat: gps.lat, lon: gps.lon, district: null, isApproximate: false });
    }
  }, [gps.status, gps.lat, gps.lon]);

  const isUnsupportedCrop = selectedCrop && UNSUPPORTED_DETECTION_CROPS.has(selectedCrop);

  // ── FILE HANDLING ──────────────────────────────────────────────────────
  const handleFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('pest.errors.validation_failed'));
      return;
    }
    if (file.size < MIN_FILE_BYTES) {
      setError(t('pest.errors.image_too_small'));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(t('pest.errors.image_too_large'));
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setFileToUpload(file);
    setResult(null);
    setError(null);
    setStatusMessage(null);
  };

  const handleDragOver  = (e) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setDragging(false); };
  const handleDrop      = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0]); };
  const handleFileChange = (e) => { handleFile(e.target.files?.[0]); e.target.value = ''; };

  const removeImage = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileToUpload(null);
    setResult(null);
    setError(null);
    setStatusMessage(null);
  };

  // ── ANALYZE ────────────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!fileToUpload) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setStatusMessage(null);

    try {
      // 1. Upload image to Supabase Storage
      const fileExt  = fileToUpload.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('pest-photos')
        .upload(filePath, fileToUpload);
      if (uploadError) {
        const uploadErr = new Error(uploadError.message);
        uploadErr.isUpload = true;
        throw uploadErr;
      }

      const { data: publicUrlData } = supabase.storage
        .from('pest-photos')
        .getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;

      // 2. Call /api/detect-pest
      const payload = {
        crop_stage: cropStage || null,
        trap_count: trapCount ? parseInt(trapCount) : null,
        latitude:   location.lat ?? null,
        longitude:  location.lon ?? null,
      };

      let detectionResult;
      try {
        detectionResult = await detectPest(publicUrl, payload);
      } catch (err) {
        if (err.status === 503) {
          const waitSecs = err.retry_in || 15;
          setStatusMessage(t('pest.status.warming_up', { secs: Math.round(waitSecs) }));
          await new Promise((resolve) => setTimeout(resolve, waitSecs * 1000));
          setStatusMessage(t('pest.status.retrying'));
          detectionResult = await detectPest(publicUrl, payload);
          setStatusMessage(null);
        } else {
          throw err;
        }
      }

      setResult({ ...detectionResult, imageUrl: publicUrl });
      // Reset any previous officer request state when a new detection is run
      setSavedReportId(null);
      setRequestSuccess(null);

      // 3. Persist to Supabase and capture returned ID for officer requests
      try {
        const { data: inserted } = await supabase.from('pest_reports').insert([{
          image_url:        publicUrl,
          predicted_label:  detectionResult.label,
          confidence_score: detectionResult.confidence,
          confidence_tier:  detectionResult.confidence_tier,
          severity:         detectionResult.severity,
          crop:             detectionResult.crop || selectedCrop || null,
          disease:          detectionResult.disease,
          trap_count:       payload.trap_count,
          crop_stage:       payload.crop_stage,
          latitude:         location.lat ?? null,
          longitude:        location.lon ?? null,
          district:         location.district ?? (location.lat ? 'GPS-Located' : 'Unknown'),
        }]).select('id').single();
        if (inserted?.id) setSavedReportId(inserted.id);
      } catch (insertErr) {
        console.error('Failed to log pest report:', insertErr);
      }
    } catch (err) {
      setStatusMessage(null);
      setError(mapError(err, t));
    } finally {
      setLoading(false);
    }
  };

  const speakText = result ? buildSpeakText(result, t) : '';

  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <main className="pest-page">

      {/* HERO */}
      <section className="hero hero-pest">
        <div className="hero-content hero-pest-content">
          <div className="hero-eyebrow">🌱 AI AGRICULTURE ASSISTANT</div>
          <h1 className="hero-title">{t('pest.hero_title')}</h1>
          <p className="hero-subtitle">{t('pest.hero_subtitle')}</p>
          <div className="hero-accent-line" />
        </div>
      </section>

      <div className="container pest-container">

        {/* LOCATION */}
        <section className="pest-card pest-location-card">
          <p className="section-label">📍 {t('common.location').toUpperCase()}</p>
          <LocationPicker onChange={setLocation} />
          {location.isApproximate && (
            <p className="location-approx-warning">
              ⚠️ {t('common.approx_location')} — Weather data may not reflect your exact farm.
            </p>
          )}
          {location.lat && !location.isApproximate && (
            <p className="location-gps-confirmed">
              ✅ {t('common.gps_active')} — weather data will reflect your actual location.
            </p>
          )}
        </section>

        {/* PHOTO TIPS */}
        <PhotoTips />

        {/* CROP SELECTOR */}
        <section className="pest-card pest-crop-selector-card">
          <div className="input-group">
            <label htmlFor="crop-select-detect">{t('pest.crop_select.label')}</label>
            <select
              id="crop-select-detect"
              value={selectedCrop}
              onChange={e => { setSelectedCrop(e.target.value); setResult(null); setError(null); }}
            >
              <option value="">{t('pest.crop_select.placeholder')}</option>
              <optgroup label="✅ Supported Crops">
                {ALL_CROPS.filter(c => c.supported).map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
              <optgroup label="📋 Other Crops (use Crop Risk instead)">
                {ALL_CROPS.filter(c => !c.supported).map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </optgroup>
            </select>
            <small className="input-hint">{t('pest.crop_select.hint')}</small>
          </div>

          {/* UNSUPPORTED CROP WARNING */}
          {isUnsupportedCrop && (
            <div className="unsupported-crop-warning" role="alert">
              <div className="unsupported-crop-icon">⚠️</div>
              <div>
                <strong>
                  {t('pest.unsupported_crop.title', { crop: CROP_DISPLAY_NAMES[selectedCrop] || selectedCrop })}
                </strong>
                <p>
                  {t('pest.unsupported_crop.desc', { crop: CROP_DISPLAY_NAMES[selectedCrop] || selectedCrop })}
                </p>
                <button
                  type="button"
                  className="btn btn-warning-outline unsupported-crop-btn"
                  onClick={() => navigate('/crop-risk')}
                >
                  {t('pest.unsupported_crop.action')} →
                </button>
              </div>
            </div>
          )}
        </section>

        {/* UPLOAD CARD — hide or dim for unsupported crops */}
        {!isUnsupportedCrop && (
          <section className="pest-card">
            <div className="pest-card-header">
              <div>
                <p className="section-label">🔬 IMAGE ANALYSIS</p>
                <h2 className="card-title">{t('pest.card_title')}</h2>
              </div>
              <div className="pest-ai-badge"><span>✦</span> AI Powered</div>
            </div>

            {/* UPLOAD AREA */}
            <div
              className={`pest-upload-area ${dragging ? 'dragging' : ''} ${preview ? 'has-preview' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              aria-label="Upload crop photo"
              onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
            >
              {preview ? (
                <div className="preview-wrapper">
                  <img src={preview} alt="Selected crop" className="pest-preview" />
                  <div className="preview-overlay"><span>Click to replace photo</span></div>
                </div>
              ) : (
                <div className="upload-content">
                  <div className="upload-icon-wrapper">
                    <span className="upload-icon">📷</span>
                  </div>
                  <h3>{t('pest.upload_text')}</h3>
                  <p>{t('pest.upload_hint')}</p>
                  <span className="upload-browse">{t('pest.btn_analyze')}</span>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} hidden />
            </div>

            {/* OPTIONS */}
            {preview && (
              <div className="pest-options-panel">
                <div className="input-group">
                  <label htmlFor="crop-stage-select">{t('crop_risk.stage_label')}</label>
                  <select id="crop-stage-select" value={cropStage} onChange={e => setCropStage(e.target.value)}>
                    <option value="">{t('crop_risk.stage_placeholder')}</option>
                    <option value="seedling">{t('crop_risk.stage_seedling')}</option>
                    <option value="vegetative">{t('crop_risk.stage_vegetative')}</option>
                    <option value="flowering">{t('crop_risk.stage_flowering')}</option>
                    <option value="fruiting">{t('crop_risk.stage_fruiting')}</option>
                  </select>
                </div>
                <div className="input-group">
                  <label htmlFor="trap-count-input">{t('crop_risk.trap_label')}</label>
                  <input id="trap-count-input" type="number" value={trapCount} onChange={e => setTrapCount(e.target.value)} placeholder="0" min="0" />
                  <small className="input-hint">{t('crop_risk.trap_hint')}</small>
                </div>
              </div>
            )}

            {/* ACTIONS */}
            {preview && (
              <div className="pest-actions">
                <button type="button" className="btn btn-outline" onClick={removeImage} disabled={loading}>
                  {t('common.upload_another')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary pest-analyze-btn"
                  onClick={handleAnalyze}
                  disabled={loading}
                  id="btn-analyze-pest"
                >
                  {loading
                    ? <><span className="spinner" />{t('pest.analyzing')}</>
                    : <>✦ {t('pest.btn_analyze')}</>
                  }
                </button>
              </div>
            )}

            {statusMessage && (
              <div className="pest-status">
                <span className="status-dot" />
                {statusMessage}
              </div>
            )}
          </section>
        )}

        {/* ERROR */}
        {error && (
          <div className="alert alert-danger pest-alert" role="alert">
            <span className="alert-icon">⚠️</span>
            <div>
              <strong>{t('pest.errors.error_prefix')}</strong>
              <p>{error}</p>
              <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 8 }}
                onClick={() => setError(null)}>
                {t('common.try_again')}
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            RESULT CARD — three visually distinct tiers
            ═══════════════════════════════════════════════ */}
        {result && (
          <section
            className={`pest-result-card pd-result-card result-tier-${result.confidence_tier}`}
            id="pest-result"
          >
            {/* ── Result header ── */}
            <div className="pd-result-header">
              <div className="pd-result-header-left">
                <p className="section-label">{t('pest.result.section_label')}</p>

                {/* HIGH — confirmed diagnosis */}
                {result.confidence_tier === 'high' && !result.is_healthy && (
                  <>
                    <p className="pd-result-label">{t('pest.result.detected_condition')}</p>
                    <h2 className="pd-result-title">{result.disease}</h2>
                    <p className="result-crop-label">
                      {t('pest.result.crop_label')}: <strong style={{ textTransform: 'capitalize' }}>{result.crop}</strong>
                    </p>
                    <p className="result-tier-note note-high">{t('pest.result.high_confidence_note')}</p>
                  </>
                )}

                {/* HIGH — healthy */}
                {result.confidence_tier === 'high' && result.is_healthy && (
                  <>
                    <h2 className="pd-result-title pd-result-title--healthy">✅ Crop Appears Healthy</h2>
                    <p className="result-crop-label">
                      {t('pest.result.crop_label')}: <strong style={{ textTransform: 'capitalize' }}>{result.crop}</strong>
                    </p>
                  </>
                )}

                {/* MEDIUM — uncertain */}
                {result.confidence_tier === 'medium' && (
                  <>
                    <p className="pd-result-label pd-result-label--warning">{t('pest.result.possible_condition')}</p>
                    <h2 className="pd-result-title pd-result-title--warning">⚠️ {result.disease}</h2>
                    <p className="result-crop-label">
                      {t('pest.result.crop_label')}: <strong style={{ textTransform: 'capitalize' }}>{result.crop}</strong>
                    </p>
                  </>
                )}

                {/* LOW — can't identify */}
                {result.confidence_tier === 'low' && (
                  <>
                    <h2 className="pd-result-title pd-result-title--danger">❌ {t('pest.result.low_confidence_title')}</h2>
                  </>
                )}
              </div>

              {/* Tier badge */}
              <div className={`pd-tier-badge pd-tier-badge--${result.confidence_tier}`}>
                <span className="pd-tier-badge-pct">{(result.confidence * 100).toFixed(0)}%</span>
                <span className="pd-tier-badge-label">confidence</span>
              </div>
            </div>

            {/* ── Meta row: severity + speak ── */}
            <div className="pd-result-meta-row">
              {result.confidence_tier !== 'low' && !result.is_healthy && (
                <SeverityBadge severity={result.severity} t={t} />
              )}
              <SpeakButton text={speakText} label={t('pest.result.listen_result')} />
            </div>

            {/* ── Medium confidence banner ── */}
            {result.confidence_tier === 'medium' && (
              <div className="medium-confidence-banner">
                <span>📸</span>
                <p>{t('pest.result.medium_confidence_note')}</p>
              </div>
            )}

            {/* ── Low confidence banner ── */}
            {result.confidence_tier === 'low' && (
              <div className="low-confidence-banner">
                <p>{t('pest.result.low_confidence_desc', { value: (result.confidence * 100).toFixed(0) })}</p>
                <p><strong>{t('pest.result.low_confidence_action')}</strong></p>
              </div>
            )}

            {/* CONFIDENCE BAR */}
            <ConfidenceBar score={result.confidence} />

            {/* VALIDATION NOTE */}
            {result.validation_note && (
              <div className="detection-validation-note">
                <span>📸</span>
                <p>{result.validation_note}</p>
              </div>
            )}

            {/* EXPLANATION (high/medium, non-healthy) */}
            {result.confidence_tier !== 'low' && !result.is_healthy && result.explanation && (
              <div className="detection-explanation-box">
                <h3>ℹ️ {t('pest.result.explanation_label')}</h3>
                <p>{result.explanation}</p>
                <p className="detection-explanation-note">{t('pest.result.explanation_note')}</p>
              </div>
            )}

            {/* HEALTHY MESSAGE */}
            {result.is_healthy && result.confidence_tier === 'high' && (
              <div className="detection-healthy-box">
                <p>{result.explanation}</p>
                <p style={{ marginTop: 8, fontSize: '0.82rem', opacity: 0.75 }}>
                  Continue regular monitoring and maintain good agronomic practices.
                </p>
              </div>
            )}

            {/* ALTERNATE (medium) */}
            {result.confidence_tier === 'medium' && result.top2_label && (
              <div className="detection-alternate-box">
                <p>
                  {t('pest.result.alternate_prediction')}:{' '}
                  <strong>{result.top2_label}</strong>
                  {result.top2_confidence && (
                    <span style={{ opacity: 0.7, marginLeft: 6 }}>
                      ({(result.top2_confidence * 100).toFixed(0)}%)
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* LOW — request officer review CTA */}
            {result.confidence_tier === 'low' && (
              <div className="low-confidence-box">
                <div className="low-confidence-icon">📋</div>
                <div>
                  <p>{t('pest.result.expert_review')}</p>
                  {requestSuccess ? (
                    <div className="or-inline-success">
                      <p>✅ {t('officer_request.submit_success')}</p>
                      <p className="or-ref-inline">{t('officer_request.request_id')}: <strong>{requestSuccess.reference_code}</strong></p>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => window.open(`/request-status/${requestSuccess.reference_code}`, '_blank')}
                      >
                        {t('officer_request.view_request_status')} →
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-request-officer"
                      id="btn-request-officer-low"
                      onClick={() => setShowRequestModal(true)}
                    >
                      📤 {t('officer_request.request_officer_review')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* IPM ACTION PLAN */}
            {result.forecast?.status === 'available' && result.forecast.risks?.length > 0 && (
              <div className="ipm-action-plan">
                <div className="ipm-action-plan-header">
                  <h3>🌿 {t('pest.result.ipm_title')}</h3>
                  <p className="ipm-data-note">{t('pest.result.ipm_source_note')}</p>
                </div>
                {result.forecast.risks.map((risk, idx) => {
                  const alertLevelClass = risk.current_alert_level?.toLowerCase().replace(' ', '-') || '';
                  const controlSections = [
                    { key: 'cultural',   icon: '🌱', label: t('pest.result.cultural_controls'),   items: risk.ipm?.cultural,   colorClass: 'ipm-section--cultural' },
                    { key: 'biological', icon: '🐞', label: t('pest.result.biological_controls'), items: risk.ipm?.biological, colorClass: 'ipm-section--biological' },
                    { key: 'chemical',   icon: '🧪', label: t('pest.result.chemical_controls'),   items: risk.ipm?.chemical,   colorClass: 'ipm-section--chemical' },
                  ].filter(s => s.items?.length > 0);
                  return (
                    <div key={idx} className="risk-card">
                      <div className="risk-card-header">
                        <h4 className="risk-card-title">{risk.risk_name}</h4>
                        <span className={`risk-badge ${alertLevelClass}`}>{risk.current_alert_level}</span>
                      </div>
                      {risk.early_signs?.length > 0 && (
                        <div className="ipm-section ipm-section--signs">
                          <div className="ipm-section-label"><span className="ipm-section-icon">🔍</span>{t('pest.result.early_signs')}</div>
                          <ul className="ipm-section-list">{risk.early_signs.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                      )}
                      {controlSections.length > 0 && (
                        <div className="ipm-controls-grid">
                          {controlSections.map(sec => (
                            <div key={sec.key} className={`ipm-section ${sec.colorClass}`}>
                              <div className="ipm-section-label"><span className="ipm-section-icon">{sec.icon}</span>{sec.label}</div>
                              <ul className="ipm-section-list">{sec.items.map((c, i) => <li key={i}>{c}</li>)}</ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* MEDIUM — request officer verification CTA */}
            {result.confidence_tier === 'medium' && !requestSuccess && (
              <div className="or-medium-cta">
                <p className="or-medium-cta-text">🤔 {t('officer_request.medium_confidence_cta')}</p>
                <button
                  type="button"
                  className="btn btn-request-officer-outline"
                  id="btn-request-officer-medium"
                  onClick={() => setShowRequestModal(true)}
                >
                  📤 {t('officer_request.request_officer_verification')}
                </button>
              </div>
            )}

            {/* MEDIUM success confirmation */}
            {result.confidence_tier === 'medium' && requestSuccess && (
              <div className="or-inline-success">
                <p>✅ {t('officer_request.submit_success')}</p>
                <p className="or-ref-inline">{t('officer_request.request_id')}: <strong>{requestSuccess.reference_code}</strong></p>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => window.open(`/request-status/${requestSuccess.reference_code}`, '_blank')}
                >
                  {t('officer_request.view_request_status')} →
                </button>
              </div>
            )}

            {/* CONTACT OFFICER + UPLOAD ANOTHER */}
            <div className="result-actions">
              <button type="button" className="btn btn-outline" onClick={removeImage}>
                📷 {t('pest.result.upload_another')}
              </button>
              {result.confidence_tier === 'high' && !requestSuccess && (
                <button
                  type="button"
                  className="btn btn-request-officer-sm"
                  id="btn-request-officer-high"
                  onClick={() => setShowRequestModal(true)}
                >
                  👨‍🌾 {t('officer_request.request_officer_assistance')}
                </button>
              )}
              {result.confidence_tier === 'high' && requestSuccess && (
                <span className="or-high-success">✅ {t('officer_request.request_id')}: <strong>{requestSuccess.reference_code}</strong></span>
              )}
            </div>
            <p className="contact-officer-note">{t('common.contact_officer_desc')}</p>

            {/* Analyzed image thumbnail */}
            {result.imageUrl && (
              <div className="result-image-section">
                <img src={result.imageUrl} alt="Analyzed crop" className="result-image" />
              </div>
            )}

          </section>
        )}

      </div>

      {/* Officer Request Modal */}
      {showRequestModal && result && (
        <OfficerRequestModal
          context={{
            crop:           result.crop || selectedCrop || null,
            disease:        result.is_healthy ? null : (result.disease || null),
            confidence:     result.confidence,
            confidenceTier: result.confidence_tier,
            severity:       result.is_healthy ? null : (result.severity || null),
            district:       location.district || null,
            reportId:       savedReportId,
          }}
          onClose={() => setShowRequestModal(false)}
          onSuccess={(data) => {
            setRequestSuccess(data);
            setShowRequestModal(false);
          }}
        />
      )}
    </main>
  );
}