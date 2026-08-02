import { useState } from 'react';
import { recommendCrop, getFertilizer } from '../lib/api';
import { supabase } from '../lib/supabase';

const DISTRICTS = [
  'Ludhiana', 'Amritsar', 'Patiala', 'Jalandhar', 'Bathinda', 'Sangrur'
];

const DEFAULT_VALUES = {
  n: '', p: '', k: '', temperature: '', humidity: '', ph: '', rainfall: '', district: DISTRICTS[0],
};

function SoilInputPage() {
  const [form, setForm] = useState(DEFAULT_VALUES);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fertilizer, setFertilizer] = useState(null);
  const [error, setError] = useState(null);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [advisoryId, setAdvisoryId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [language, setLanguage] = useState('hi-IN');
  const [ttsWarning, setTtsWarning] = useState('');

  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input is not supported in your browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e) => {
      console.error("Speech error", e.error);
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      console.log("Heard:", transcript);

      const parseValue = (keyword) => {
        const regex = new RegExp(`${keyword}[^\\d]*([\\d.]+)`, 'i');
        const match = transcript.match(regex);
        return match ? match[1] : null;
      };

      setForm((prev) => {
        const nextForm = { ...prev };
        const n = parseValue('nitrogen') || parseValue('\\bn\\b');
        const p = parseValue('phosphorus') || parseValue('\\bp\\b');
        const k = parseValue('potassium') || parseValue('\\bk\\b');
        const temp = parseValue('temperature') || parseValue('\\btemp\\b');
        const hum = parseValue('humidity');
        const phVal = parseValue('\\bph\\b');
        const rain = parseValue('rainfall') || parseValue('\\brain\\b');

        if (n) nextForm.n = n;
        if (p) nextForm.p = p;
        if (k) nextForm.k = k;
        if (temp) nextForm.temperature = temp;
        if (hum) nextForm.humidity = hum;
        if (phVal) nextForm.ph = phVal;
        if (rain) nextForm.rainfall = rain;

        return nextForm;
      });
    };

    recognition.start();
  };

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setFertilizer(null);
    setFeedbackSent(false);

    try {
      // Call crop recommendation API
      const cropResult = await recommendCrop({
        n: parseFloat(form.n),
        p: parseFloat(form.p),
        k: parseFloat(form.k),
        temperature: parseFloat(form.temperature),
        humidity: parseFloat(form.humidity),
        ph: parseFloat(form.ph),
        rainfall: parseFloat(form.rainfall),
      });
      setResult(cropResult);

      // Call fertilizer API
      const fertResult = await getFertilizer({
        crop: cropResult.crop,
        n: parseFloat(form.n),
        p: parseFloat(form.p),
        k: parseFloat(form.k),
      });
      setFertilizer(fertResult);

      // Save advisory to Supabase
      const { data: advisory, error: dbError } = await supabase
        .from('advisories')
        .insert({
          district: form.district,
          soil_inputs: {
            n: parseFloat(form.n),
            p: parseFloat(form.p),
            k: parseFloat(form.k),
            temperature: parseFloat(form.temperature),
            humidity: parseFloat(form.humidity),
            ph: parseFloat(form.ph),
            rainfall: parseFloat(form.rainfall),
          },
          recommended_crop: cropResult.crop,
          confidence: cropResult.confidence,
          reasons: cropResult.reasons,
        })
        .select()
        .single();

      if (!dbError && advisory) {
        setAdvisoryId(advisory.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFeedback = async (helpful) => {
    if (!advisoryId || feedbackSent) return;
    setFeedbackSent(true);

    await supabase.from('feedback').insert({
      advisory_id: advisoryId,
      helpful,
      followed_advice: null,
      notes: null,
    });
  };

  const handleTTS = () => {
    if (!result) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setTtsWarning('');
      
      let selectedLang = language;
      if (language === 'pa-IN') {
        const voices = window.speechSynthesis.getVoices();
        const hasPunjabi = voices.some(v => v.lang.startsWith('pa'));
        if (!hasPunjabi) {
          selectedLang = 'hi-IN';
          setTtsWarning("Punjabi voice not natively supported on this device. Falling back to Hindi.");
          console.warn("Punjabi TTS voice not found. Falling back to Hindi (hi-IN).");
        }
      }

      let text = `The recommended crop is ${result.crop} with a confidence of ${(result.confidence * 100).toFixed(1)} percent. `;
      text += "Reasons for this recommendation include: ";
      result.reasons.forEach((reason, i) => {
        text += `${i + 1}, ${reason}. `;
      });
      if (fertilizer) {
        text += `Recommended fertilizer per acre is: ${fertilizer.urea_kg_acre} kilograms of Urea, ${fertilizer.dap_kg_acre} kilograms of DAP, and ${fertilizer.mop_kg_acre} kilograms of MOP.`;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = selectedLang;
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Text-to-speech is not supported in your browser.");
    }
  };

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <h1 className="hero-title">AI-Powered Crop Advisory</h1>
        <p className="hero-subtitle">Enter your soil &amp; climate data to get personalized crop recommendations</p>
      </section>

      <div className="container">
        {/* Input Form */}
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Soil &amp; Climate Parameters</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value)}
                style={{ padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc' }}
                id="select-language"
              >
                <option value="hi-IN">Hindi (hi-IN)</option>
                <option value="mr-IN">Marathi (mr-IN)</option>
                <option value="pa-IN">Punjabi (pa-IN)</option>
              </select>
              <button type="button" className="btn btn-secondary" onClick={handleVoiceInput} disabled={isListening} id="btn-voice-input" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {isListening ? "🔴 Listening..." : "🎤 Speak"}
              </button>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="field-n">Nitrogen (N) kg/ha</label>
              <input id="field-n" name="n" type="number" step="any" placeholder="e.g. 90" value={form.n} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-p">Phosphorus (P) kg/ha</label>
              <input id="field-p" name="p" type="number" step="any" placeholder="e.g. 42" value={form.p} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-k">Potassium (K) kg/ha</label>
              <input id="field-k" name="k" type="number" step="any" placeholder="e.g. 43" value={form.k} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-temp">Temperature (&deg;C)</label>
              <input id="field-temp" name="temperature" type="number" step="any" placeholder="e.g. 25.5" value={form.temperature} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-humidity">Humidity (%)</label>
              <input id="field-humidity" name="humidity" type="number" step="any" placeholder="e.g. 80" value={form.humidity} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-ph">Soil pH</label>
              <input id="field-ph" name="ph" type="number" step="any" placeholder="e.g. 6.5" value={form.ph} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-rain">Rainfall (mm)</label>
              <input id="field-rain" name="rainfall" type="number" step="any" placeholder="e.g. 200" value={form.rainfall} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label htmlFor="field-district">District</label>
              <select id="field-district" name="district" value={form.district} onChange={handleChange}>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading} id="btn-recommend">
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Analyzing...
                </>
              ) : (
                'Get Crop Recommendation'
              )}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 'var(--space-xl)' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }} id="recommendation-result">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recommended Crop</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <h2 className="result-crop">{result.crop}</h2>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)' }}
                    onClick={handleTTS}
                    title="Read Advisory Aloud"
                    id="btn-tts"
                  >
                    🔊 Listen
                  </button>
                </div>
                {ttsWarning && <p style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '0.25rem' }}>{ttsWarning}</p>}
              </div>
              <span className="badge badge-success" style={{ fontSize: '1rem', padding: 'var(--space-sm) var(--space-lg)' }}>
                {(result.confidence * 100).toFixed(1)}% confidence
              </span>
            </div>

            <div style={{ marginTop: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
              <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', fontWeight: 500, marginBottom: 'var(--space-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confidence Breakdown</p>
              {(() => {
                const probs = result.probabilities || [
                  { crop: result.crop, confidence: result.confidence },
                  ...(result.alternative ? [result.alternative] : [])
                ];
                
                return probs.slice(0, 3).map((item, idx) => (
                  <div key={idx} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 500 }}>{item.crop}</span>
                      <span>{(item.confidence * 100).toFixed(1)}%</span>
                    </div>
                    <div style={{ width: '100%', backgroundColor: 'var(--gray-200)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                      <div style={{ 
                        width: `${Math.min(item.confidence * 100, 100)}%`, 
                        backgroundColor: idx === 0 ? 'var(--primary-color)' : (idx === 1 ? '#3b82f6' : '#8b5cf6'), 
                        height: '100%', 
                        borderRadius: '4px',
                        transition: 'width 0.5s ease-in-out'
                      }}></div>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Reasons */}
            <div className="reasons-grid">
              {result.reasons.map((reason, i) => (
                <div className="reason-card" key={i}>
                  <div className="reason-icon">{i + 1}</div>
                  <p className="reason-text">{reason}</p>
                </div>
              ))}
            </div>

            {/* Explainability / Alternatives */}
            {result.alternative && (
              <div className="alert alert-info" style={{ marginTop: 'var(--space-lg)', display: 'block' }}>
                <strong style={{ display: 'block', marginBottom: 'var(--space-sm)' }}>Conditions suit multiple crops</strong>
                {result.crop} ({(result.confidence * 100).toFixed(1)}%) or <strong>{result.alternative.crop}</strong> ({(result.alternative.confidence * 100).toFixed(1)}%) — both match your soil conditions closely.
              </div>
            )}
          </div>
        )}

        {/* Fertilizer */}
        {fertilizer && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }} id="fertilizer-result">
            <h3 className="card-title">Fertilizer Recommendation (per acre)</h3>
            <table className="fert-table">
              <thead>
                <tr>
                  <th>Fertilizer</th>
                  <th>Dosage (kg/acre)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Urea (46% N)</td>
                  <td><strong>{fertilizer.urea_kg_acre}</strong></td>
                </tr>
                <tr>
                  <td>DAP (20% P)</td>
                  <td><strong>{fertilizer.dap_kg_acre}</strong></td>
                </tr>
                <tr>
                  <td>MOP (50% K)</td>
                  <td><strong>{fertilizer.mop_kg_acre}</strong></td>
                </tr>
              </tbody>
            </table>
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
            <p>Was this recommendation helpful?</p>
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
                className={`feedback-btn ${feedbackSent ? '' : ''}`}
                onClick={() => handleFeedback(false)}
                disabled={feedbackSent}
                title="Not helpful"
                id="btn-feedback-down"
              >
                👎
              </button>
            </div>
            {feedbackSent && (
              <span className="badge badge-success">Thank you for your feedback!</span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default SoilInputPage;
