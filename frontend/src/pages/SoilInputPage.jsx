import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { recommendCrop, getFertilizer } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useSpeech } from '../hooks/useSpeech';

// Districts list — these are proper nouns (place names), not translated
const DISTRICTS = [
  'Ludhiana', 'Amritsar', 'Patiala', 'Jalandhar', 'Bathinda', 'Sangrur',
];

const DEFAULT_VALUES = {
  n: '', p: '', k: '', temperature: '', humidity: '', ph: '', rainfall: '',
  district: DISTRICTS[0],
};

function SoilInputPage() {
  const { t } = useTranslation();
  const { isListening, ttsWarning, voiceError, lastTranscript, startListening, speak } = useSpeech();

  const [form, setForm] = useState(DEFAULT_VALUES);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fertilizer, setFertilizer] = useState(null);
  const [error, setError] = useState(null);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [advisoryId, setAdvisoryId] = useState(null);

  // ─── Voice Input ──────────────────────────────────────────────────────────
  // Parses numbers from the transcript using English field keywords.
  // ML field names (N, P, K etc.) are universal — no translation needed here.
  const handleVoiceInput = () => {
    startListening((transcript) => {
      // parseValue tries a list of keyword aliases (English + Hindi + Marathi)
      const parseValue = (...keywords) => {
        for (const keyword of keywords) {
          const regex = new RegExp(`${keyword}[^\\d]*([\\d.]+)`, 'i');
          const match = transcript.match(regex);
          if (match) return match[1];
        }
        return null;
      };

      setForm((prev) => {
        const next = { ...prev };
        // English | Hindi | Marathi aliases
        const n    = parseValue('nitrogen',    'नाइट्रोजन', 'नायट्रोजन', '\\bn\\b');
        const p    = parseValue('phosphorus',  'फास्फोरस',  'फॉस्फरस',   '\\bp\\b');
        const k    = parseValue('potassium',   'पोटेशियम',  'पोटॅशियम',  '\\bk\\b');
        const temp = parseValue('temperature', 'तापमान',    '\\btemp\\b');
        const hum  = parseValue('humidity',    'आर्द्रता');
        const phV  = parseValue('\\bph\\b');
        const rain = parseValue('rainfall',    'वर्षा',     'पाऊस',      '\\brain\\b');

        if (n)    next.n           = n;
        if (p)    next.p           = p;
        if (k)    next.k           = k;
        if (temp) next.temperature = temp;
        if (hum)  next.humidity    = hum;
        if (phV)  next.ph          = phV;
        if (rain) next.rainfall    = rain;

        return next;
      });
    });
  };

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setFertilizer(null);
    setFeedbackSent(false);

    try {
      const cropResult = await recommendCrop({
        n:           parseFloat(form.n),
        p:           parseFloat(form.p),
        k:           parseFloat(form.k),
        temperature: parseFloat(form.temperature),
        humidity:    parseFloat(form.humidity),
        ph:          parseFloat(form.ph),
        rainfall:    parseFloat(form.rainfall),
      });
      setResult(cropResult);

      const fertResult = await getFertilizer({
        crop: cropResult.crop,
        n:    parseFloat(form.n),
        p:    parseFloat(form.p),
        k:    parseFloat(form.k),
      });
      setFertilizer(fertResult);

      const { data: advisory, error: dbError } = await supabase
        .from('advisories')
        .insert({
          district:         form.district,
          soil_inputs:      {
            n:           parseFloat(form.n),
            p:           parseFloat(form.p),
            k:           parseFloat(form.k),
            temperature: parseFloat(form.temperature),
            humidity:    parseFloat(form.humidity),
            ph:          parseFloat(form.ph),
            rainfall:    parseFloat(form.rainfall),
          },
          recommended_crop: cropResult.crop,
          confidence:       cropResult.confidence,
          reasons:          cropResult.reasons,
        })
        .select()
        .single();

      if (!dbError && advisory) setAdvisoryId(advisory.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Feedback ─────────────────────────────────────────────────────────────
  const handleFeedback = async (helpful) => {
    if (!advisoryId || feedbackSent) return;
    setFeedbackSent(true);
    await supabase.from('feedback').insert({
      advisory_id:     advisoryId,
      helpful,
      followed_advice: null,
      notes:           null,
    });
  };

  // ─── TTS ──────────────────────────────────────────────────────────────────
  // NOTE: ML outputs (crop name, reasons, fertilizer amounts) are spoken as-is
  // in English — accent-based TTS, not translation (see AGENTS.md known issues).
  const handleTTS = () => {
    if (!result) return;
    let text = `The recommended crop is ${result.crop} with a confidence of ${(result.confidence * 100).toFixed(1)} percent. `;
    text += 'Reasons for this recommendation include: ';
    result.reasons.forEach((reason, i) => { text += `${i + 1}, ${reason}. `; });
    if (fertilizer) {
      text += `Recommended fertilizer per acre is: ${fertilizer.urea_kg_acre} kilograms of Urea, ${fertilizer.dap_kg_acre} kilograms of DAP, and ${fertilizer.mop_kg_acre} kilograms of MOP.`;
    }
    speak(text);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Hero — UI strings translated */}
      <section className="hero">
        <h1 className="hero-title">{t('soil.hero_title')}</h1>
        <p className="hero-subtitle">{t('soil.hero_subtitle')}</p>
      </section>

      <div className="container">
        {/* Input Form */}
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 className="card-title" style={{ marginBottom: 0 }}>{t('soil.card_title')}</h2>
            {/* Language switcher is now in the Navbar — only voice button here */}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleVoiceInput}
              disabled={isListening}
              id="btn-voice-input"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {isListening ? `🔴 ${t('soil.btn_voice_listening')}` : `🎤 ${t('soil.btn_voice_speak')}`}
            </button>
          </div>
          {/* Show voice error or what was heard */}
          {voiceError && (
            <div className="alert alert-danger" style={{ marginTop: 'var(--space-sm)', fontSize: '0.85rem', padding: 'var(--space-sm) var(--space-md)' }}>
              {voiceError}
            </div>
          )}
          {lastTranscript && !voiceError && (
            <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.8rem', color: 'var(--gray-600)', fontStyle: 'italic' }}>
              🎙️ Heard: &ldquo;{lastTranscript}&rdquo;
            </p>
          )}

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="field-n">{t('soil.labels.n')}</label>
              <input id="field-n" name="n" type="number" step="any"
                placeholder={t('soil.placeholders.n')}
                value={form.n} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-p">{t('soil.labels.p')}</label>
              <input id="field-p" name="p" type="number" step="any"
                placeholder={t('soil.placeholders.p')}
                value={form.p} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-k">{t('soil.labels.k')}</label>
              <input id="field-k" name="k" type="number" step="any"
                placeholder={t('soil.placeholders.k')}
                value={form.k} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-temp">{t('soil.labels.temperature')}</label>
              <input id="field-temp" name="temperature" type="number" step="any"
                placeholder={t('soil.placeholders.temperature')}
                value={form.temperature} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-humidity">{t('soil.labels.humidity')}</label>
              <input id="field-humidity" name="humidity" type="number" step="any"
                placeholder={t('soil.placeholders.humidity')}
                value={form.humidity} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-ph">{t('soil.labels.ph')}</label>
              <input id="field-ph" name="ph" type="number" step="any"
                placeholder={t('soil.placeholders.ph')}
                value={form.ph} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-rain">{t('soil.labels.rainfall')}</label>
              <input id="field-rain" name="rainfall" type="number" step="any"
                placeholder={t('soil.placeholders.rainfall')}
                value={form.rainfall} onChange={handleChange} required />
            </div>
            <div className="form-group">
              {/* District label is translated; district names are proper nouns — kept in English */}
              <label htmlFor="field-district">{t('soil.labels.district')}</label>
              <select id="field-district" name="district" value={form.district} onChange={handleChange}>
                {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading} id="btn-recommend">
              {loading ? (
                <><span className="spinner"></span>{t('soil.analyzing')}</>
              ) : (
                t('soil.btn_recommend')
              )}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 'var(--space-xl)' }}>
            <strong>{t('soil.errors.error_prefix')}</strong> {error}
          </div>
        )}

        {/* Result — crop name and reasons are ML outputs, NOT translated */}
        {result && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }} id="recommendation-result">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('soil.result.recommended_crop')}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  {/* result.crop is an ML output — displayed as-is, never translated */}
                  <h2 className="result-crop">{result.crop}</h2>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
                    onClick={handleTTS}
                    title="Read Advisory Aloud"
                    id="btn-tts"
                  >
                    🔊 {t('soil.result.btn_listen')}
                  </button>
                </div>
                {ttsWarning && (
                  <p style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '0.25rem' }}>
                    {ttsWarning}
                  </p>
                )}
              </div>
              <span className="badge badge-success" style={{ fontSize: '1rem', padding: 'var(--space-sm) var(--space-lg)' }}>
                {t('soil.result.confidence', { value: (result.confidence * 100).toFixed(1) })}
              </span>
            </div>

            <div style={{ marginTop: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', fontWeight: 500, marginBottom: 'var(--space-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('soil.result.confidence_breakdown')}
              </p>
              {(() => {
                const probs = result.probabilities || [
                  { crop: result.crop, confidence: result.confidence },
                  ...(result.alternative ? [result.alternative] : []),
                ];
                return probs.slice(0, 3).map((item, idx) => (
                  <div key={idx} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                      {/* item.crop is ML output — not translated */}
                      <span style={{ fontWeight: 500 }}>{item.crop}</span>
                      <span>{(item.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div style={{ width: '100%', backgroundColor: 'var(--gray-200)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(item.confidence * 100, 100)}%`,
                        backgroundColor: idx === 0 ? 'var(--primary-color)' : (idx === 1 ? '#3b82f6' : '#8b5cf6'),
                        height: '100%',
                        borderRadius: '4px',
                        transition: 'width 0.5s ease-in-out',
                      }}></div>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Reasons — ML outputs, displayed as-is */}
            <div className="reasons-grid">
              {result.reasons.map((reason, i) => (
                <div className="reason-card" key={i}>
                  <div className="reason-icon">{i + 1}</div>
                  <p className="reason-text">{reason}</p>
                </div>
              ))}
            </div>

            {/* Alternative crop — crop names are ML outputs, surrounding text is translated */}
            {result.alternative && (
              <div className="alert alert-info" style={{ marginTop: 'var(--space-lg)', display: 'block' }}>
                <strong style={{ display: 'block', marginBottom: 'var(--space-sm)' }}>
                  {t('soil.result.conditions_multiple')}
                </strong>
                {t('soil.result.conditions_multiple_desc', {
                  crop1: result.crop,
                  conf1: (result.confidence * 100).toFixed(1),
                  crop2: result.alternative.crop,
                  conf2: (result.alternative.confidence * 100).toFixed(1),
                })}
              </div>
            )}
          </div>
        )}

        {/* Fertilizer — fertilizer names (Urea, DAP, MOP) are translated; values are ML outputs */}
        {fertilizer && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }} id="fertilizer-result">
            <h3 className="card-title">{t('soil.fertilizer.title')}</h3>
            <table className="fert-table">
              <thead>
                <tr>
                  <th>{t('soil.fertilizer.col_fertilizer')}</th>
                  <th>{t('soil.fertilizer.col_dosage')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('soil.fertilizer.urea')}</td>
                  <td><strong>{fertilizer.urea_kg_acre}</strong></td>
                </tr>
                <tr>
                  <td>{t('soil.fertilizer.dap')}</td>
                  <td><strong>{fertilizer.dap_kg_acre}</strong></td>
                </tr>
                <tr>
                  <td>{t('soil.fertilizer.mop')}</td>
                  <td><strong>{fertilizer.mop_kg_acre}</strong></td>
                </tr>
              </tbody>
            </table>
            {/* fertilizer.note is an ML/API output — displayed as-is */}
            {fertilizer.note && (
              <p style={{ marginTop: 'var(--space-md)', fontSize: '0.85rem', color: 'var(--gray-600)', fontStyle: 'italic' }}>
                {fertilizer.note}
              </p>
            )}
          </div>
        )}

        {/* Feedback */}
        {result && (
          <div className="feedback-section" id="feedback-section">
            <p>{t('soil.feedback.question')}</p>
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button
                className={`feedback-btn ${feedbackSent ? 'selected' : ''}`}
                onClick={() => handleFeedback(true)}
                disabled={feedbackSent}
                title="Helpful"
                id="btn-feedback-up"
              >
                👍
              </button>
              <button
                className="feedback-btn"
                onClick={() => handleFeedback(false)}
                disabled={feedbackSent}
                title="Not helpful"
                id="btn-feedback-down"
              >
                👎
              </button>
            </div>
            {feedbackSent && (
              <span className="badge badge-success">{t('soil.feedback.thanks')}</span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default SoilInputPage;
