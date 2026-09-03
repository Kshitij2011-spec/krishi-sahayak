import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { checkCropRisk } from '../lib/api';
import LocationPicker from '../components/LocationPicker';
import SpeakButton from '../components/SpeakButton';
import OfficerRequestModal from '../components/OfficerRequestModal';
import { useGeolocation } from '../hooks/useGeolocation';

// Crops supported by image detection model (PlantVillage)
const DETECTION_SUPPORTED_CROPS = new Set(['tomato', 'potato', 'corn', 'grape', 'pepper', 'apple']);


// Crops with verified data in pest_risk.json (Maharashtra)
const SUPPORTED_CROPS = [
  { value: 'cotton',    labelKey: 'Cotton' },
  { value: 'soybean',   labelKey: 'Soybean' },
  { value: 'sugarcane', labelKey: 'Sugarcane' },
];

function SeverityGauge({ score, t }) {
  if (score === null || score === undefined) return null;
  const pct = Math.min(100, Math.max(0, score));
  let color = '#22c55e';
  let gradientColor = 'linear-gradient(90deg, #22c55e, #4ade80)';
  let level = t('common.severity_low');
  if (pct >= 90) {
    color = '#ef4444';
    gradientColor = 'linear-gradient(90deg, #ef4444, #f87171)';
    level = t('common.severity_critical');
  } else if (pct >= 70) {
    color = '#f97316';
    gradientColor = 'linear-gradient(90deg, #f97316, #fb923c)';
    level = t('common.severity_high');
  } else if (pct >= 40) {
    color = '#eab308';
    gradientColor = 'linear-gradient(90deg, #eab308, #facc15)';
    level = t('common.severity_moderate');
  }

  return (
    <div className="risk-gauge-wrapper">
      <div className="risk-gauge-label">
        <span>Early Risk Score — <strong style={{ color }}>{level}</strong></span>
        <strong style={{ color }} className="risk-gauge-score">{pct}<span className="risk-gauge-unit"> / 100</span></strong>
      </div>
      <div className="risk-gauge-bar">
        <div className="risk-gauge-fill" style={{ width: `${pct}%`, background: gradientColor }} />
      </div>
      <p className="risk-gauge-note">
        {t('pest.result.risk_not_diagnosis')}
      </p>
    </div>
  );
}

function SeverityBadge({ severity }) {
  const classMap = {
    Critical: 'severity-critical',
    High:     'severity-high',
    Moderate: 'severity-moderate',
    Low:      'severity-low',
  };
  return (
    <span className={`severity-badge ${classMap[severity] || ''}`}>
      {severity}
    </span>
  );
}

function IpmCard({ risk, t }) {
  const alertLevelClass = risk.current_alert_level?.toLowerCase().replace(' ', '-') || '';

  const controlSections = [
    {
      key: 'cultural',
      icon: '🌱',
      label: t('pest.result.cultural_controls'),
      items: risk.ipm?.cultural,
      colorClass: 'ipm-section--cultural',
    },
    {
      key: 'biological',
      icon: '🐞',
      label: t('pest.result.biological_controls'),
      items: risk.ipm?.biological,
      colorClass: 'ipm-section--biological',
    },
    {
      key: 'chemical',
      icon: '🧪',
      label: t('pest.result.chemical_controls'),
      items: risk.ipm?.chemical,
      colorClass: 'ipm-section--chemical',
    },
  ].filter(s => s.items?.length > 0);

  return (
    <div className="risk-card">
      <div className="risk-card-header">
        <h4 className="risk-card-title">
          {risk.risk_name}
        </h4>
        <span className={`risk-badge ${alertLevelClass}`}>
          {risk.current_alert_level}
        </span>
      </div>

      {risk.early_signs?.length > 0 && (
        <div className="ipm-section ipm-section--signs">
          <div className="ipm-section-label">
            <span className="ipm-section-icon">🔍</span>
            {t('pest.result.early_signs')}
          </div>
          <ul className="ipm-section-list">
            {risk.early_signs.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {controlSections.length > 0 && (
        <div className="ipm-controls-grid">
          {controlSections.map(sec => (
            <div key={sec.key} className={`ipm-section ${sec.colorClass}`}>
              <div className="ipm-section-label">
                <span className="ipm-section-icon">{sec.icon}</span>
                {sec.label}
              </div>
              <ul className="ipm-section-list">
                {sec.items.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {risk.source && (
        <p className="ipm-source">
          Source: {risk.source.authority}
          {risk.source.document ? ` — ${risk.source.document}` : ''}
        </p>
      )}
    </div>
  );
}

function buildRiskSpeakText(result, crop, t) {
  if (!result || result.status === 'no_data') {
    return t('crop_risk.result.no_data');
  }
  const parts = [];
  parts.push(`${t('crop_risk.result.title', { crop })}.`);
  parts.push(`${t('pest.result.risk_not_diagnosis')}`);
  if (result.severity) parts.push(`Severity: ${result.severity}.`);
  if (result.recommended_action) {
    parts.push(`${t('crop_risk.result.action_heading')}: ${result.recommended_action}`);
  }
  return parts.join(' ');
}

export default function CropRiskPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [crop, setCrop]           = useState('');
  const [cropStage, setCropStage] = useState('');
  const [trapCount, setTrapCount] = useState('');
  const [location, setLocation]   = useState({ lat: null, lon: null, district: null, isApproximate: false });
  const [loading, setLoading]     = useState(false);
  // ── Officer request state ──────────────────────────────────────────────
  const [showRiskRequestModal,  setShowRiskRequestModal]  = useState(false);
  const [riskRequestSuccess,    setRiskRequestSuccess]    = useState(null);

  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);

  const gps = useGeolocation();
  useEffect(() => {
    if (gps.status === 'granted' && location.lat === null) {
      setLocation({ lat: gps.lat, lon: gps.lon, district: null, isApproximate: false });
    }
  }, [gps.status, gps.lat, gps.lon]);

  const handleLocationChange = useCallback((loc) => setLocation(loc), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!crop) { setError(t('crop_risk.crop_placeholder')); return; }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const payload = {
        crop,
        crop_stage: cropStage || null,
        trap_count: trapCount !== '' ? parseInt(trapCount, 10) : null,
        latitude:   location.lat  ?? null,
        longitude:  location.lon  ?? null,
        location_is_approximate: location.isApproximate,
      };
      const data = await checkCropRisk(payload);
      setResult(data);
    } catch (err) {
      setError(err.message || t('pest.errors.analysis_error'));
    } finally {
      setLoading(false);
    }
  };

  const cropLabel = crop ? crop.charAt(0).toUpperCase() + crop.slice(1) : '';
  const speakText = result ? buildRiskSpeakText(result, cropLabel, t) : '';

  return (
    <main className="crop-risk-page">

      {/* HERO */}
      <section className="hero hero-pest" style={{ minHeight: '160px' }}>
        <div className="hero-content hero-pest-content">
          <div className="hero-eyebrow">🛡️ {t('crop_risk.hero_eyebrow')}</div>
          <h1 className="hero-title">{t('crop_risk.hero_title')}</h1>
          <p className="hero-subtitle">{t('crop_risk.hero_subtitle')}</p>
          <div className="hero-accent-line" />
        </div>
      </section>

      <div className="container pest-container">

        {/* INPUT FORM */}
        <section className="pest-card">
          <div className="pest-card-header">
            <div>
              <p className="section-label">📋 {t('crop_risk.form_heading').toUpperCase()}</p>
              <h2 className="card-title">{t('crop_risk.form_heading')}</h2>
              <p className="pest-description">{t('crop_risk.form_desc')}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="crop-risk-form" noValidate>

            {/* Crop */}
            <div className="input-group">
              <label htmlFor="cr-crop">
                {t('crop_risk.crop_label')} <span className="required-star">*</span>
              </label>
              <select id="cr-crop" value={crop} onChange={e => setCrop(e.target.value)} required>
                <option value="">{t('crop_risk.crop_placeholder')}</option>
                {SUPPORTED_CROPS.map(c => (
                  <option key={c.value} value={c.value}>{c.labelKey}</option>
                ))}
              </select>
              <small className="input-hint">
                Risk data currently covers cotton, soybean, and sugarcane (Maharashtra, kharif).
              </small>
            </div>

            {/* Crop Stage */}
            <div className="input-group">
              <label htmlFor="cr-stage">{t('crop_risk.stage_label')}</label>
              <select id="cr-stage" value={cropStage} onChange={e => setCropStage(e.target.value)}>
                <option value="">{t('crop_risk.stage_placeholder')}</option>
                <option value="seedling">{t('crop_risk.stage_seedling')}</option>
                <option value="vegetative">{t('crop_risk.stage_vegetative')}</option>
                <option value="flowering">{t('crop_risk.stage_flowering')}</option>
                <option value="fruiting">{t('crop_risk.stage_fruiting')}</option>
              </select>
            </div>

            {/* Trap Count */}
            <div className="input-group">
              <label htmlFor="cr-trap">{t('crop_risk.trap_label')}</label>
              <input
                id="cr-trap"
                type="number"
                min="0"
                value={trapCount}
                onChange={e => setTrapCount(e.target.value)}
                placeholder="e.g. 5"
              />
              <small className="input-hint">{t('crop_risk.trap_hint')}</small>
            </div>

            {/* Location */}
            <div className="input-group">
              <label>{t('crop_risk.location_label')}</label>
              <LocationPicker onChange={handleLocationChange} />
              {location.isApproximate && (
                <p className="location-approx-note">
                  ⚠️ {t('common.approx_location')} — Weather-based risk may be less accurate.
                </p>
              )}
              {location.lat && !location.isApproximate && (
                <p style={{ color: 'var(--color-success, #22c55e)', fontSize: '0.82rem', margin: '4px 0 0' }}>
                  ✅ {t('common.gps_active')} — weather data will reflect your actual location.
                </p>
              )}
              {!location.lat && (
                <p className="input-hint" style={{ marginTop: 4 }}>
                  {t('common.no_location')} — weather risk adjustments will not apply.
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary pest-analyze-btn"
              disabled={loading || !crop}
              id="btn-check-risk"
              style={{ width: '100%', marginTop: '8px' }}
            >
              {loading
                ? <><span className="spinner" /> {t('crop_risk.checking')}</>
                : t('crop_risk.btn_check')
              }
            </button>

          </form>
        </section>

        {/* ERROR */}
        {error && (
          <div className="alert alert-danger pest-alert" role="alert">
            <span className="alert-icon">⚠️</span>
            <div><strong>{t('pest.errors.error_prefix')}</strong><p>{error}</p></div>
          </div>
        )}

        {/* RESULTS */}
        {result && (
          <section className="pest-result-card cr-result-card" id="crop-risk-result">

            {result.status === 'no_data' ? (
              <>
                <p className="section-label">{t('crop_risk.result.section_label')}</p>
                <div className="alert alert-info" style={{ marginTop: 12 }}>
                  <p><strong>{t('crop_risk.result.no_data')}</strong></p>
                  <p>{result.recommended_action}</p>
                </div>
              </>
            ) : (
              <>
                {/* ── Result header ── */}
                <div className="cr-result-header">
                  <div className="cr-result-header-text">
                    <p className="section-label">{t('crop_risk.result.section_label')}</p>
                    <h2 className="cr-result-title">
                      {t('crop_risk.result.title', { crop: cropLabel })}
                    </h2>
                  </div>
                  <div className="cr-result-header-badges">
                    {result.severity && <SeverityBadge severity={result.severity} />}
                    <SpeakButton text={speakText} label={t('common.listen')} />
                  </div>
                </div>

                {/* ── Risk ≠ Diagnosis banner ── */}
                <div className="risk-not-diagnosis-banner" role="note">
                  ⚠️ {t('crop_risk.result.risk_not_diagnosis')}
                </div>

                {/* ── Score gauge ── */}
                <SeverityGauge score={result.risk_score} t={t} />

                {/* ── Two-column info grid: reasons + action ── */}
                {(result.reasons?.length > 0 || result.recommended_action) && (
                  <div className="cr-info-grid">
                    {result.reasons?.length > 0 && (
                      <div className="risk-reasons-box">
                        <h3>📊 {t('crop_risk.result.reasons_heading')}</h3>
                        <ul>{result.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                      </div>
                    )}
                    {result.recommended_action && (
                      <div className="recommended-action-box">
                        <h3>✅ {t('crop_risk.result.action_heading')}</h3>
                        <p>{result.recommended_action}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Location note ── */}
                {result.location_note && (
                  <div className="alert alert-warning" style={{ marginTop: 12, fontSize: '0.85rem' }}>
                    ⚠️ {result.location_note}
                  </div>
                )}

                {/* ── Weather context ── */}
                {result.weather_context?.status === 'available' && (
                  <div className="weather-context-box">
                    <h3>🌤️ {t('crop_risk.result.weather_heading')}</h3>
                    <div className="weather-stats">
                      <div className="weather-stat">
                        <span>{t('crop_risk.result.temp')}</span>
                        <strong>{result.weather_context.current?.temperature_c ?? '—'}°C</strong>
                      </div>
                      <div className="weather-stat">
                        <span>{t('crop_risk.result.humidity')}</span>
                        <strong>{result.weather_context.current?.humidity_pct ?? '—'}%</strong>
                      </div>
                      <div className="weather-stat">
                        <span>{t('crop_risk.result.precip')}</span>
                        <strong>{result.weather_context.current?.precipitation_mm ?? '—'} mm</strong>
                      </div>
                      <div className="weather-stat">
                        <span>{t('crop_risk.result.rain_7day')}</span>
                        <strong>{result.weather_context.forecast_7day?.rainfall_total_mm ?? '—'} mm</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── IPM cards ── */}
                {result.risks?.length > 0 && (
                  <div className="ipm-action-plan">
                    <div className="ipm-action-plan-header">
                      <h3>🌿 {t('common.ipm_advice')}</h3>
                      <p className="ipm-data-note">{t('pest.result.ipm_source_note')}</p>
                    </div>
                    {result.risks.map((risk, idx) => (
                      <IpmCard key={idx} risk={risk} t={t} />
                    ))}
                  </div>
                )}

                {/* ── Disclaimer ── */}
                <p className="risk-score-note">ℹ️ {result.score_note}</p>

                {/* ── Bottom CTAs row ── */}
                <div className="cr-bottom-ctas">
                  {/* Risk → Detection bridge */}
                  <div className="risk-to-detect-bridge">
                    {DETECTION_SUPPORTED_CROPS.has(crop) ? (
                      <>
                        <p className="bridge-hint">📷 {t('home.detect_next')}</p>
                        <button
                          className="btn btn-outline bridge-btn"
                          onClick={() => navigate('/detect')}
                          id="btn-risk-to-detect"
                        >
                          {t('home.cta_detection')} →
                        </button>
                      </>
                    ) : (
                      <p className="bridge-hint bridge-hint--muted">ℹ️ {t('home.detect_unsupported')}</p>
                    )}
                  </div>

                  {/* Officer assistance CTA (Phase 7) */}
                  <div className="or-risk-officer-cta">
                    {riskRequestSuccess ? (
                      <div className="or-inline-success">
                        <p>✅ {t('officer_request.submit_success')}</p>
                        <p className="or-ref-inline">{t('officer_request.request_id')}: <strong>{riskRequestSuccess.reference_code}</strong></p>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => window.open(`/request-status/${riskRequestSuccess.reference_code}`, '_blank')}
                        >
                          {t('officer_request.view_request_status')} →
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="or-risk-cta-label">🤔 {t('officer_request.need_officer_advice', 'Need an officer\'s advice?')}</p>
                        <button
                          type="button"
                          className="btn btn-request-officer-outline"
                          id="btn-crop-risk-officer"
                          onClick={() => setShowRiskRequestModal(true)}
                        >
                          📤 {t('officer_request.request_officer_assistance')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        )}

      </div>

      {/* Officer Request Modal (from Crop Risk — no report_id) */}
      {showRiskRequestModal && (
        <OfficerRequestModal
          context={{
            crop:           crop || null,
            disease:        null,
            confidence:     null,
            confidenceTier: null,
            severity:       result?.severity || null,
            district:       location.district || null,
            reportId:       null,
          }}
          onClose={() => setShowRiskRequestModal(false)}
          onSuccess={(data) => {
            setRiskRequestSuccess(data);
            setShowRiskRequestModal(false);
          }}
        />
      )}
    </main>
  );
}
