import React, { useState } from 'react';
import { getAdvancedAdvisory } from '../lib/api';

const DISTRICTS = [
  'Ludhiana', 'Amritsar', 'Patiala', 'Jalandhar', 'Bathinda', 'Sangrur',
  'Nagpur', 'Pune', 'Amravati'
];

function AdvancedAdvisoryPage() {
  const [formData, setFormData] = useState({
    state: 'Maharashtra',
    district: 'Nagpur',
    season: 'kharif',
    ph: '7.0',
    nitrogen_kg_ha: '250',
    phosphorus_kg_ha: '20',
    potassium_kg_ha: '150',
    data_source: 'soil_health_card',
    farm_size_acres: '2',
    irrigation_type: 'rainfed',
    water_availability: 'moderate',
    budget_available_inr: '10000',
    risk_appetite: 'low',
    primary_goal: 'max_profit'
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // Voice State
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

      setFormData((prev) => {
        const nextForm = { ...prev };
        const n = parseValue('nitrogen') || parseValue('\\bn\\b');
        const p = parseValue('phosphorus') || parseValue('\\bp\\b');
        const k = parseValue('potassium') || parseValue('\\bk\\b');
        const phVal = parseValue('\\bph\\b');
        const farmSize = parseValue('farm size') || parseValue('acres');
        const budget = parseValue('budget');

        if (n) nextForm.nitrogen_kg_ha = n;
        if (p) nextForm.phosphorus_kg_ha = p;
        if (k) nextForm.potassium_kg_ha = k;
        if (phVal) nextForm.ph = phVal;
        if (farmSize) nextForm.farm_size_acres = farmSize;
        if (budget) nextForm.budget_available_inr = budget;

        return nextForm;
      });
    };

    recognition.start();
  };

  const handleTTS = () => {
    if (!result || !result.top_recommendation) return;
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

      const top = result.top_recommendation;
      const conf = result.confidence;
      let text = `The recommended crop is ${top.crop}. `;
      if (conf) {
        text += `The overall confidence is ${conf.overall} out of 100. `;
      }
      
      if (top.reasoning) {
        text += `${top.reasoning}. `;
      } else if (top.selection_basis) {
        text += `This was selected based on ${top.selection_basis.replace('_', ' ')}. `;
      }

      if (top.fertilizer && top.fertilizer.status === 'available') {
        const fp = top.fertilizer.fertilizer_products;
        text += `Recommended fertilizer per hectare is: ${fp.urea_kg_ha} kilograms of Urea, ${fp.dap_kg_ha} kilograms of DAP, and ${fp.mop_kg_ha} kilograms of MOP.`;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = selectedLang;
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Text-to-speech is not supported in your browser.");
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    const payload = {
      location: { state: formData.state, district: formData.district },
      soil: {
        ph: parseFloat(formData.ph),
        nitrogen_kg_ha: parseFloat(formData.nitrogen_kg_ha),
        phosphorus_kg_ha: parseFloat(formData.phosphorus_kg_ha),
        potassium_kg_ha: parseFloat(formData.potassium_kg_ha),
        data_source: formData.data_source
      },
      climate: { season: formData.season },
      land: {
        farm_size_acres: parseFloat(formData.farm_size_acres),
        irrigation_type: formData.irrigation_type,
        water_availability: formData.water_availability
      },
      farmer_constraints: {
        budget_available_inr: parseInt(formData.budget_available_inr, 10),
        risk_appetite: formData.risk_appetite,
        primary_goal: formData.primary_goal
      }
    };

    try {
      const data = await getAdvancedAdvisory(payload);
      setResult(data);
    } catch (err) {
      if (err.message.includes("400")) {
        setError("Validation failed. Please check your inputs.");
      } else if (err.message.includes("500") || err.message.includes("503")) {
        setError("The advisory service is temporarily unavailable.");
      } else {
        setError("We couldn't reach the advisory service. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="hero">
        <h1 className="hero-title">Advanced Crop Advisory</h1>
        <p className="hero-subtitle">Get personalized, deeply reasoned agricultural advice based on local data and agronomic rules.</p>
      </section>

      <div className="container">
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Farm & Field Parameters</h2>
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
              <button type="button" className="btn btn-secondary" onClick={handleVoiceInput} disabled={isListening} id="btn-voice-input" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--gray-300)', padding: '0.4rem 0.8rem', background: 'var(--white)', borderRadius: '4px' }}>
                {isListening ? "🔴 Listening..." : "🎤 Speak"}
              </button>
            </div>
          </div>
          
          {/* LOCATION */}
          <h3 style={{ fontSize: '1rem', color: 'var(--green-800)', marginBottom: 'var(--space-sm)', paddingBottom: 'var(--space-xs)', borderBottom: '2px solid var(--green-200)' }}>Location & Climate</h3>
          <div className="form-grid" style={{ marginBottom: 'var(--space-lg)' }}>
            <div className="form-group">
              <label>State</label>
              <input type="text" name="state" value={formData.state} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>District</label>
              <input type="text" name="district" value={formData.district} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Season</label>
              <select name="season" value={formData.season} onChange={handleChange}>
                <option value="kharif">Kharif</option>
                <option value="rabi">Rabi</option>
                <option value="zaid">Zaid</option>
              </select>
            </div>
          </div>

          {/* SOIL */}
          <h3 style={{ fontSize: '1rem', color: 'var(--green-800)', marginBottom: 'var(--space-sm)', paddingBottom: 'var(--space-xs)', borderBottom: '2px solid var(--green-200)' }}>Soil Conditions</h3>
          <div className="form-grid" style={{ marginBottom: 'var(--space-lg)' }}>
            <div className="form-group">
              <label>pH</label>
              <input type="number" step="0.1" min="0" max="14" name="ph" value={formData.ph} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Nitrogen (kg/ha)</label>
              <input type="number" step="0.1" min="0" name="nitrogen_kg_ha" value={formData.nitrogen_kg_ha} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Phosphorus (kg/ha)</label>
              <input type="number" step="0.1" min="0" name="phosphorus_kg_ha" value={formData.phosphorus_kg_ha} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Potassium (kg/ha)</label>
              <input type="number" step="0.1" min="0" name="potassium_kg_ha" value={formData.potassium_kg_ha} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Data Source</label>
              <select name="data_source" value={formData.data_source} onChange={handleChange}>
                <option value="soil_health_card">Soil Health Card</option>
                <option value="farmer_entered">Farmer Entered</option>
              </select>
            </div>
          </div>

          {/* LAND */}
          <h3 style={{ fontSize: '1rem', color: 'var(--green-800)', marginBottom: 'var(--space-sm)', paddingBottom: 'var(--space-xs)', borderBottom: '2px solid var(--green-200)' }}>Land & Irrigation</h3>
          <div className="form-grid" style={{ marginBottom: 'var(--space-lg)' }}>
            <div className="form-group">
              <label>Farm Size (Acres)</label>
              <input type="number" step="0.1" min="0.1" name="farm_size_acres" value={formData.farm_size_acres} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Irrigation Type</label>
              <select name="irrigation_type" value={formData.irrigation_type} onChange={handleChange}>
                <option value="rainfed">Rainfed</option>
                <option value="canal">Canal</option>
                <option value="borewell">Borewell</option>
                <option value="drip">Drip</option>
                <option value="sprinkler">Sprinkler</option>
              </select>
            </div>
            <div className="form-group">
              <label>Water Availability</label>
              <select name="water_availability" value={formData.water_availability} onChange={handleChange}>
                <option value="scarce">Scarce</option>
                <option value="moderate">Moderate</option>
                <option value="abundant">Abundant</option>
              </select>
            </div>
          </div>

          {/* PREFERENCES */}
          <h3 style={{ fontSize: '1rem', color: 'var(--green-800)', marginBottom: 'var(--space-sm)', paddingBottom: 'var(--space-xs)', borderBottom: '2px solid var(--green-200)' }}>Farmer Preferences</h3>
          <div className="form-grid" style={{ marginBottom: 'var(--space-lg)' }}>
            <div className="form-group">
              <label>Budget (₹)</label>
              <input type="number" min="0" name="budget_available_inr" value={formData.budget_available_inr} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Risk Appetite</label>
              <select name="risk_appetite" value={formData.risk_appetite} onChange={handleChange}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div className="form-group">
              <label>Primary Goal</label>
              <select name="primary_goal" value={formData.primary_goal} onChange={handleChange}>
                <option value="max_profit">Max Profit</option>
                <option value="food_security">Food Security</option>
                <option value="soil_health">Soil Health</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-xl)', textAlign: 'center' }}>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Analyzing your field conditions...
                </>
              ) : (
                'Get Advanced Advisory'
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 'var(--space-xl)' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {result && result.top_recommendation && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            {/* Status Header */}
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <span className="badge badge-success">
                {result.gemini_available 
                  ? "✨ AI reasoning available" 
                  : "✅ Advisory generated using verified agronomic rules"}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
              <div>
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recommended Crop</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                  <h2 className="result-crop">{result.top_recommendation.crop}</h2>
                  <button 
                    className="btn" 
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gray-300)', background: 'var(--white)' }}
                    onClick={handleTTS}
                    title="Read Advisory Aloud"
                  >
                    🔊 Listen
                  </button>
                </div>
                {ttsWarning && <p style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '0.25rem' }}>{ttsWarning}</p>}
                <div style={{ marginTop: 'var(--space-xs)' }}>
                  {result.top_recommendation.variety ? (
                    <p style={{ color: 'var(--green-800)', fontWeight: 600 }}>Variety: {result.top_recommendation.variety}</p>
                  ) : (
                    <p style={{ color: 'var(--gray-500)', fontStyle: 'italic', fontSize: '0.9rem' }}>No verified variety recommendation is currently available for this crop and region.</p>
                  )}
                </div>
              </div>
              {result.confidence && (
                <div style={{ textAlign: 'right' }}>
                  <span className="badge badge-success" style={{ fontSize: '1rem', padding: 'var(--space-sm) var(--space-lg)', display: 'inline-block', marginBottom: '0.25rem' }}>
                    {result.confidence.overall}% confidence
                  </span>
                  <div style={{ fontSize: '0.8rem', color: 'var(--gray-600)', textTransform: 'capitalize' }}>
                    {result.confidence.status?.replace('_', ' ')}
                  </div>
                </div>
              )}
            </div>

            {/* Confidence Breakdown */}
            {result.confidence && result.confidence.components && (
              <div style={{ marginTop: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--gray-600)', fontWeight: 500, marginBottom: 'var(--space-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confidence Breakdown</p>
                
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 500 }}>Agronomic Fit</span>
                    <span>{result.confidence.components.agronomic_fit}/50</span>
                  </div>
                  <div className="confidence-bar">
                    <div className="confidence-fill" style={{ width: `${(result.confidence.components.agronomic_fit / 50) * 100}%` }}></div>
                  </div>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 500 }}>Data Quality</span>
                    <span>{result.confidence.components.data_quality}/30</span>
                  </div>
                  <div className="confidence-bar">
                    <div className="confidence-fill" style={{ width: `${(result.confidence.components.data_quality / 30) * 100}%`, background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }}></div>
                  </div>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 500 }}>Regional Evidence</span>
                    <span>{result.confidence.components.regional_evidence}/20</span>
                  </div>
                  <div className="confidence-bar">
                    <div className="confidence-fill" style={{ width: `${(result.confidence.components.regional_evidence / 20) * 100}%`, background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }}></div>
                  </div>
                </div>

                {result.confidence.notes && result.confidence.notes.length > 0 && (
                  <div style={{ marginTop: 'var(--space-sm)', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
                    {result.confidence.notes.map((n, i) => <p key={i}>• {n}</p>)}
                  </div>
                )}
              </div>
            )}

            {/* Why this crop */}
            <div style={{ marginTop: 'var(--space-lg)' }}>
              <h3 className="card-title">Why this crop?</h3>
              <p style={{ color: 'var(--gray-700)', lineHeight: '1.6' }}>
                {result.top_recommendation.reasoning || `Selected based on: ${result.top_recommendation.selection_basis?.replace('_', ' ')}`}
              </p>
            </div>
          </div>
        )}

        {/* Market Context */}
        {result && result.market_context && result.market_context.status === 'available' && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <h3 className="card-title">📈 Current Market Observation</h3>
            <div className="alert alert-success" style={{ display: 'block' }}>
              <p style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.25rem' }}>{result.market_context.commodity} - {result.market_context.market} ({result.market_context.district})</p>
              <p style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>Modal Price: <strong>₹{result.market_context.modal_price} / quintal</strong></p>
              <p style={{ fontSize: '0.9rem', color: 'var(--green-900)' }}>Range: ₹{result.market_context.min_price} – ₹{result.market_context.max_price}</p>
              <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', color: 'var(--green-900)' }}>As of: {result.market_context.arrival_date}</p>
            </div>
            <p style={{ fontSize: '0.85rem', fontStyle: 'italic', color: 'var(--warning)', marginTop: 'var(--space-sm)' }}>
              This is current mandi data, not a guaranteed harvest price.
            </p>
          </div>
        )}

        {/* Pest Warning */}
        {result && result.top_recommendation && result.top_recommendation.risk_and_prevention && result.top_recommendation.risk_and_prevention.status === 'available' && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <h3 className="card-title" style={{ color: 'var(--danger)' }}>⚠️ Early Risk Warning</h3>
            {result.top_recommendation.risk_and_prevention.risks.map((risk, idx) => (
              <div key={idx} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: idx !== result.top_recommendation.risk_and_prevention.risks.length -1 ? '1px solid var(--gray-200)' : 'none' }}>
                <h4 style={{ color: 'var(--danger)', marginBottom: '0.25rem' }}>{risk.risk_name}</h4>
                <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}><strong>Risk Likelihood:</strong> <span style={{ textTransform: 'capitalize' }}>{risk.likelihood}</span></p>
                <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  <strong>Early Signs:</strong>
                  <ul style={{ marginLeft: '1.5rem', marginTop: '0.25rem', color: 'var(--gray-700)' }}>
                    {risk.early_signs?.map((s, i) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
                <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  <strong>How to Monitor:</strong>
                  <ul style={{ marginLeft: '1.5rem', marginTop: '0.25rem', color: 'var(--gray-700)' }}>
                    {risk.monitoring?.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
                <div style={{ fontSize: '0.9rem' }}>
                  <strong>Prevention (Non-Chemical):</strong>
                  <ul style={{ marginLeft: '1.5rem', marginTop: '0.25rem', color: 'var(--gray-700)' }}>
                    {risk.prevention?.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Fertilizer Guidance */}
        {result && result.top_recommendation && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <h3 className="card-title">Fertilizer Guidance (per hectare)</h3>
            {result.top_recommendation.fertilizer && result.top_recommendation.fertilizer.status === 'available' ? (
              <>
                <table className="fert-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Dosage (kg/ha)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Urea (46% N)</td>
                      <td><strong>{result.top_recommendation.fertilizer.fertilizer_products.urea_kg_ha}</strong></td>
                    </tr>
                    <tr>
                      <td>DAP (18% N, 46% P)</td>
                      <td><strong>{result.top_recommendation.fertilizer.fertilizer_products.dap_kg_ha}</strong></td>
                    </tr>
                    <tr>
                      <td>MOP (60% K)</td>
                      <td><strong>{result.top_recommendation.fertilizer.fertilizer_products.mop_kg_ha}</strong></td>
                    </tr>
                  </tbody>
                </table>
                <p style={{ marginTop: 'var(--space-sm)', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
                  Target Nutrients (kg/ha): N: {result.top_recommendation.fertilizer.nutrient_recommendation.N_kg_ha}, P₂O₅: {result.top_recommendation.fertilizer.nutrient_recommendation.P2O5_kg_ha}, K₂O: {result.top_recommendation.fertilizer.nutrient_recommendation.K2O_kg_ha}
                </p>
                <p style={{ marginTop: 'var(--space-xs)', fontSize: '0.85rem', color: 'var(--gray-600)' }}>
                  Source: {result.top_recommendation.fertilizer.source?.authority}
                </p>
              </>
            ) : (
              <p style={{ color: 'var(--gray-600)', fontStyle: 'italic' }}>A verified fertilizer recommendation is not currently available for this crop-region combination.</p>
            )}
          </div>
        )}

        {/* Alternatives */}
        {result && result.alternatives && result.alternatives.length > 0 && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <h3 className="card-title">Alternatives</h3>
            <div className="reasons-grid">
              {result.alternatives.map((alt, idx) => (
                <div className="reason-card" key={idx}>
                  <div className="reason-icon">{idx + 1}</div>
                  <div>
                    <strong style={{ textTransform: 'capitalize', fontSize: '1.1rem', color: 'var(--green-900)' }}>{alt.crop}</strong>
                    {alt.reasoning && <p className="reason-text" style={{ marginTop: '0.25rem' }}>{alt.reasoning}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Important Notes */}
        {result && result.top_recommendation && result.top_recommendation.tradeoffs && result.top_recommendation.tradeoffs.length > 0 && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <h3 className="card-title">Important Notes</h3>
            <ul style={{ marginLeft: '1.5rem', color: 'var(--gray-700)' }}>
              {result.top_recommendation.tradeoffs.map((t, i) => <li key={i} style={{ marginBottom: '0.5rem' }}>{t}</li>)}
            </ul>
          </div>
        )}

      </div>
    </>
  );
}

export default AdvancedAdvisoryPage;
