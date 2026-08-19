import React, { useState } from 'react';
import { getAdvancedAdvisory } from '../lib/api';

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

  const renderRecommendation = () => {
    if (!result) return null;
    const top = result.top_recommendation;
    const conf = result.confidence;

    return (
      <div className="advisory-result">
        <div className="status-badge">
          {result.gemini_available 
            ? "✨ AI reasoning available" 
            : "✅ Advisory generated using verified agronomic rules"}
        </div>

        <div className="result-card top-crop-card">
          <h2>YOUR RECOMMENDATION</h2>
          <h1 className="crop-name">🌱 {top.crop?.charAt(0).toUpperCase() + top.crop?.slice(1)}</h1>
          
          <div className="variety-section">
            {top.variety ? (
              <p className="variety-name"><strong>Variety:</strong> {top.variety}</p>
            ) : (
              <p className="variety-unavailable">No verified variety recommendation is available for this crop and region yet.</p>
            )}
          </div>

          {(top.reasoning || top.selection_basis) && (
            <div className="reasoning-section">
              <h3>Why this crop?</h3>
              <p>{top.reasoning || `Selected based on: ${top.selection_basis.replace('_', ' ')}`}</p>
            </div>
          )}
        </div>

        {conf && (
          <div className="result-card confidence-card">
            <h2>ADVISORY CONFIDENCE</h2>
            <div className="confidence-score-large">
              <span className="score-val">{conf.overall}</span> / 100
              <span className="score-status"> ({conf.status?.replace('_', ' ')})</span>
            </div>
            
            <div className="confidence-breakdown-details">
              <h3>Why this confidence?</h3>
              <ul>
                <li><strong>Agronomic fit:</strong> {conf.components?.agronomic_fit}</li>
                <li><strong>Data quality:</strong> {conf.components?.data_quality}</li>
                <li><strong>Regional evidence:</strong> {conf.components?.regional_evidence}</li>
              </ul>
              {conf.notes && (
                <div className="confidence-notes">
                  {conf.notes.map((note, idx) => <p key={idx}>• {note}</p>)}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="result-card fertilizer-card">
          <h2>FERTILIZER GUIDANCE</h2>
          {top.fertilizer?.status === "available" ? (
            <div className="fert-details">
              <div className="fert-row">
                <strong>Reference Recommendation (kg/ha)</strong>
                <p>N: {top.fertilizer.nutrient_recommendation.N_kg_ha} | P₂O₅: {top.fertilizer.nutrient_recommendation.P2O5_kg_ha} | K₂O: {top.fertilizer.nutrient_recommendation.K2O_kg_ha}</p>
              </div>
              <div className="fert-row">
                <strong>Fertilizer Products (kg/ha)</strong>
                <p>Urea: {top.fertilizer.fertilizer_products.urea_kg_ha} | DAP: {top.fertilizer.fertilizer_products.dap_kg_ha} | MOP: {top.fertilizer.fertilizer_products.mop_kg_ha}</p>
              </div>
              <div className="fert-source">
                <small>Source: {top.fertilizer.source?.authority}</small>
              </div>
            </div>
          ) : (
            <p className="fert-unavailable">A verified fertilizer recommendation is not currently available for this crop-region combination.</p>
          )}
        </div>

        {top.risk_and_prevention && top.risk_and_prevention.status === "available" && (
          <div className="result-card warnings-card">
            <h2>⚠️ EARLY RISK WARNING</h2>
            {top.risk_and_prevention.risks.map((risk, idx) => (
              <div key={idx} style={{ marginBottom: "15px", borderBottom: "1px solid #eee", paddingBottom: "10px" }}>
                <h3 style={{ margin: "5px 0", color: "#d9534f" }}>{risk.risk_name}</h3>
                <p><strong>Risk:</strong> <span style={{textTransform: "capitalize"}}>{risk.likelihood}</span></p>
                <div style={{ marginTop: "8px" }}>
                  <strong>Early signs:</strong>
                  <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                    {risk.early_signs.map((sign, i) => <li key={i}>{sign}</li>)}
                  </ul>
                </div>
                <div style={{ marginTop: "8px" }}>
                  <strong>How to monitor:</strong>
                  <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                    {risk.monitoring.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
                <div style={{ marginTop: "8px" }}>
                  <strong>Prevention:</strong>
                  <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                    {risk.prevention.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}

        {result.alternatives && result.alternatives.length > 0 && (
          <div className="result-card alternatives-card">
            <h2>ALTERNATIVES</h2>
            <ul className="alt-list">
              {result.alternatives.map((alt, idx) => (
                <li key={idx}>
                  <strong>{alt.crop?.charAt(0).toUpperCase() + alt.crop?.slice(1)}</strong>
                  {alt.reasoning && <p className="alt-reason">{alt.reasoning}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(top.tradeoffs && top.tradeoffs.length > 0) && (
          <div className="result-card warnings-card">
            <h2>IMPORTANT NOTES</h2>
            <ul>
              {top.tradeoffs.map((t, idx) => <li key={idx}>{t}</li>)}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="advanced-advisory-page fade-in">
      <header className="page-header">
        <h1>Advanced Crop Advisory</h1>
        <p>Get personalized, deeply reasoned agricultural advice based on local data and agronomic rules.</p>
      </header>

      <div className="advisory-content">
        <div className="advisory-form-container card">
          <form onSubmit={handleSubmit} className="advisory-form">
            
            <section className="form-section">
              <h3>Location & Climate</h3>
              <div className="form-grid">
                <div className="input-group">
                  <label>State</label>
                  <input type="text" name="state" value={formData.state} onChange={handleChange} required />
                </div>
                <div className="input-group">
                  <label>District</label>
                  <input type="text" name="district" value={formData.district} onChange={handleChange} required />
                </div>
                <div className="input-group">
                  <label>Season</label>
                  <select name="season" value={formData.season} onChange={handleChange}>
                    <option value="kharif">Kharif</option>
                    <option value="rabi">Rabi</option>
                    <option value="zaid">Zaid</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="form-section">
              <h3>Soil Conditions</h3>
              <div className="form-grid">
                <div className="input-group">
                  <label>pH</label>
                  <input type="number" step="0.1" min="0" max="14" name="ph" value={formData.ph} onChange={handleChange} required />
                </div>
                <div className="input-group">
                  <label>Nitrogen (kg/ha)</label>
                  <input type="number" step="0.1" min="0" name="nitrogen_kg_ha" value={formData.nitrogen_kg_ha} onChange={handleChange} required />
                </div>
                <div className="input-group">
                  <label>Phosphorus (kg/ha)</label>
                  <input type="number" step="0.1" min="0" name="phosphorus_kg_ha" value={formData.phosphorus_kg_ha} onChange={handleChange} required />
                </div>
                <div className="input-group">
                  <label>Potassium (kg/ha)</label>
                  <input type="number" step="0.1" min="0" name="potassium_kg_ha" value={formData.potassium_kg_ha} onChange={handleChange} required />
                </div>
              </div>
            </section>

            <section className="form-section">
              <h3>Land & Irrigation</h3>
              <div className="form-grid">
                <div className="input-group">
                  <label>Farm Size (Acres)</label>
                  <input type="number" step="0.1" min="0.1" name="farm_size_acres" value={formData.farm_size_acres} onChange={handleChange} required />
                </div>
                <div className="input-group">
                  <label>Irrigation Type</label>
                  <select name="irrigation_type" value={formData.irrigation_type} onChange={handleChange}>
                    <option value="rainfed">Rainfed</option>
                    <option value="canal">Canal</option>
                    <option value="tubewell">Tubewell</option>
                    <option value="drip">Drip</option>
                    <option value="sprinkler">Sprinkler</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Water Availability</label>
                  <select name="water_availability" value={formData.water_availability} onChange={handleChange}>
                    <option value="scarce">Scarce</option>
                    <option value="moderate">Moderate</option>
                    <option value="abundant">Abundant</option>
                  </select>
                </div>
              </div>
            </section>

            <section className="form-section">
              <h3>Farmer Constraints</h3>
              <div className="form-grid">
                <div className="input-group">
                  <label>Budget (₹)</label>
                  <input type="number" min="0" name="budget_available_inr" value={formData.budget_available_inr} onChange={handleChange} required />
                </div>
                <div className="input-group">
                  <label>Risk Appetite</label>
                  <select name="risk_appetite" value={formData.risk_appetite} onChange={handleChange}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Primary Goal</label>
                  <select name="primary_goal" value={formData.primary_goal} onChange={handleChange}>
                    <option value="max_profit">Max Profit</option>
                    <option value="yield_stability">Yield Stability</option>
                    <option value="soil_health">Soil Health</option>
                  </select>
                </div>
              </div>
            </section>

            <button type="submit" className="primary-btn submit-btn" disabled={loading}>
              {loading ? 'Analyzing your field conditions...' : 'Get Advisory'}
            </button>
          </form>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div className="advisory-result-container">
          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Preparing your advisory...</p>
            </div>
          )}
          {!loading && renderRecommendation()}
          {!loading && !result && !error && (
            <div className="empty-state card">
              <p>Enter your farm details on the left to receive a comprehensive agricultural advisory.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdvancedAdvisoryPage;
