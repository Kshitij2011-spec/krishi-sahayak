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
    <main className="crop-page">
      <section className="hero-farmer">
        <h1 className="hero-title">Advanced Crop Advisory</h1>
        <p className="hero-subtitle">Get personalized, deeply reasoned agricultural advice based on local data and agronomic rules.</p>
      </section>

      <div className="container--overlap">
        <form onSubmit={handleSubmit} className="card">
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
                {isListening ? "ðŸ”´ Listening..." : "ðŸŽ¤ Speak"}
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
              <label>Budget (â‚¹)</label>
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
          <div className="adv-results-dashboard">

            {/* ROW 1: Hero recommendation */}
            <div className="adv-hero-card">
              <div className="adv-hero-card-inner">
                <div className="adv-hero-left">
                  <div className="adv-hero-eyebrow">
                    <span className="adv-ai-badge">
                      {result.gemini_available ? "✨ AI Reasoning" : "✅ Agronomic Rules"}
                    </span>
                    <span className="adv-result-label">Top Recommendation</span>
                  </div>
                  <h2 className="adv-crop-name">{result.top_recommendation.crop}</h2>
                  {result.top_recommendation.variety ? (
                    <p className="adv-variety"><span className="adv-variety-tag">Variety</span>{result.top_recommendation.variety}</p>
                  ) : (
                    <p className="adv-variety adv-variety--none">No verified variety available for this region</p>
                  )}
                  <div className="adv-hero-actions">
                    <button className="adv-tts-btn" onClick={handleTTS} title="Read Advisory Aloud">🔊 Listen</button>
                    {ttsWarning && <p className="adv-tts-warning">{ttsWarning}</p>}
                  </div>
                </div>
                {result.confidence && (
                  <div className="adv-confidence-hero">
                    <div className="adv-confidence-ring">
                      <span className="adv-confidence-pct">{result.confidence.overall}</span>
                      <span className="adv-confidence-unit">/ 100</span>
                    </div>
                    <p className="adv-confidence-status">{result.confidence.status?.replace('_', ' ')}</p>
                    <p className="adv-confidence-label">Advisory Confidence</p>
                  </div>
                )}
              </div>
            </div>

            {/* ROW 2: Confidence bars + Why this crop */}
            {result.confidence?.components && (
              <div className="adv-row-2">
                <div className="adv-card adv-card--confidence">
                  <h3 className="adv-card-title">📊 Confidence Breakdown</h3>
                  <div className="adv-conf-bars">
                    {[
                      { label: 'Agronomic Fit',    value: result.confidence.components.agronomic_fit,    max: 50, color: 'linear-gradient(90deg,#22c55e,#4ade80)' },
                      { label: 'Data Quality',      value: result.confidence.components.data_quality,      max: 30, color: 'linear-gradient(90deg,#3b82f6,#60a5fa)' },
                      { label: 'Regional Evidence', value: result.confidence.components.regional_evidence, max: 20, color: 'linear-gradient(90deg,#8b5cf6,#a78bfa)' },
                    ].map(bar => (
                      <div key={bar.label} className="adv-conf-bar-row">
                        <div className="adv-conf-bar-meta">
                          <span className="adv-conf-bar-label">{bar.label}</span>
                          <span className="adv-conf-bar-score">{bar.value} / {bar.max}</span>
                        </div>
                        <div className="adv-conf-bar-track">
                          <div className="adv-conf-bar-fill" style={{ width: `${(bar.value / bar.max) * 100}%`, background: bar.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {result.confidence.notes?.length > 0 && (
                    <div className="adv-conf-notes">
                      {result.confidence.notes.map((n, i) => <p key={i} className="adv-conf-note">• {n}</p>)}
                    </div>
                  )}
                </div>
                <div className="adv-card adv-card--reasoning">
                  <h3 className="adv-card-title">💡 Why This Crop?</h3>
                  <p className="adv-reasoning-text">
                    {result.top_recommendation.reasoning || `Selected based on: ${result.top_recommendation.selection_basis?.replace('_', ' ')}`}
                  </p>
                  {result.top_recommendation.tradeoffs?.length > 0 && (
                    <div className="adv-tradeoffs">
                      <p className="adv-tradeoffs-label">Important Notes</p>
                      <ul className="adv-tradeoffs-list">
                        {result.top_recommendation.tradeoffs.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ROW 3: Market + Fertilizer */}
            <div className="adv-row-3">
              {result.market_context?.status === 'available' ? (
                <div className="adv-card adv-card--market">
                  <h3 className="adv-card-title">📈 Market Observation</h3>
                  <p className="adv-market-commodity">{result.market_context.commodity}</p>
                  <p className="adv-market-location">{result.market_context.market} · {result.market_context.district}</p>
                  <div className="adv-market-price-row">
                    <div className="adv-market-price-main">
                      <span className="adv-market-price-label">Modal</span>
                      <span className="adv-market-price-value">&#8377;{result.market_context.modal_price}</span>
                      <span className="adv-market-price-unit">/ quintal</span>
                    </div>
                    <div className="adv-market-price-range">
                      <span>Min &#8377;{result.market_context.min_price}</span>
                      <span className="adv-market-range-sep">-</span>
                      <span>Max &#8377;{result.market_context.max_price}</span>
                    </div>
                  </div>
                  <p className="adv-market-date">As of {result.market_context.arrival_date}</p>
                  <p className="adv-market-disclaimer">Current mandi data - not a guaranteed harvest price</p>
                </div>
              ) : (
                <div className="adv-card adv-card--market adv-card--empty">
                  <h3 className="adv-card-title">📈 Market Observation</h3>
                  <p className="adv-empty-note">Market data unavailable for this crop / region</p>
                </div>
              )}

              <div className="adv-card adv-card--fertilizer">
                <h3 className="adv-card-title">🌿 Fertilizer Guidance <span className="adv-fert-subtitle">per hectare</span></h3>
                {result.top_recommendation.fertilizer?.status === 'available' ? (
                  <>
                    <div className="adv-fert-products">
                      {[
                        { name: 'Urea', sub: '46% N',       value: result.top_recommendation.fertilizer.fertilizer_products.urea_kg_ha, bg: '#dcfce7', border: '#86efac', clr: '#15803d' },
                        { name: 'DAP',  sub: '18%N 46%P',   value: result.top_recommendation.fertilizer.fertilizer_products.dap_kg_ha,  bg: '#eff6ff', border: '#bfdbfe', clr: '#1d4ed8' },
                        { name: 'MOP',  sub: '60% K',        value: result.top_recommendation.fertilizer.fertilizer_products.mop_kg_ha,  bg: '#fff7ed', border: '#fed7aa', clr: '#c2410c' },
                      ].map(p => (
                        <div key={p.name} className="adv-fert-pill" style={{ background: p.bg, borderColor: p.border }}>
                          <span className="adv-fert-pill-val" style={{ color: p.clr }}>{p.value}</span>
                          <span className="adv-fert-pill-unit">kg/ha</span>
                          <span className="adv-fert-pill-name">{p.name}</span>
                          <span className="adv-fert-pill-sub">{p.sub}</span>
                        </div>
                      ))}
                    </div>
                    <p className="adv-fert-target">
                      Target: N {result.top_recommendation.fertilizer.nutrient_recommendation.N_kg_ha} · P2O5 {result.top_recommendation.fertilizer.nutrient_recommendation.P2O5_kg_ha} · K2O {result.top_recommendation.fertilizer.nutrient_recommendation.K2O_kg_ha} kg/ha
                    </p>
                    <p className="adv-fert-source">Source: {result.top_recommendation.fertilizer.source?.authority}</p>
                  </>
                ) : (
                  <p className="adv-empty-note">No verified fertilizer recommendation available for this crop-region combination.</p>
                )}
              </div>
            </div>

            {/* ROW 4: Pest Warning */}
            {result.top_recommendation.risk_and_prevention?.status === 'available' && (
              <div className="adv-card adv-card--pest">
                <h3 className="adv-card-title adv-card-title--danger">Early Risk Warning</h3>
                <div className="adv-pest-grid">
                  {result.top_recommendation.risk_and_prevention.risks.map((risk, idx) => (
                    <div key={idx} className="adv-pest-card">
                      <div className="adv-pest-card-header">
                        <h4 className="adv-pest-name">{risk.risk_name}</h4>
                        <span className="adv-pest-likelihood">{risk.likelihood}</span>
                      </div>
                      <div className="adv-pest-sections">
                        {risk.early_signs?.length > 0 && (
                          <div className="adv-pest-section adv-pest-section--signs">
                            <p className="adv-pest-section-label">Early Signs</p>
                            <ul>{risk.early_signs.map((s, i) => <li key={i}>{s}</li>)}</ul>
                          </div>
                        )}
                        {risk.monitoring?.length > 0 && (
                          <div className="adv-pest-section adv-pest-section--monitor">
                            <p className="adv-pest-section-label">How to Monitor</p>
                            <ul>{risk.monitoring.map((m, i) => <li key={i}>{m}</li>)}</ul>
                          </div>
                        )}
                        {risk.prevention?.length > 0 && (
                          <div className="adv-pest-section adv-pest-section--prevent">
                            <p className="adv-pest-section-label">Prevention</p>
                            <ul>{risk.prevention.map((p, i) => <li key={i}>{p}</li>)}</ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ROW 5: Alternatives */}
            {result.alternatives?.length > 0 && (
              <div className="adv-card adv-card--alternatives">
                <h3 className="adv-card-title">Alternative Crops</h3>
                <div className="adv-alt-grid">
                  {result.alternatives.map((alt, idx) => (
                    <div className="adv-alt-card" key={idx}>
                      <div className="adv-alt-rank">#{idx + 1}</div>
                      <div className="adv-alt-body">
                        <strong className="adv-alt-name">{alt.crop}</strong>
                        {alt.reasoning && <p className="adv-alt-reason">{alt.reasoning}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </main>
  );
}

export default AdvancedAdvisoryPage;
