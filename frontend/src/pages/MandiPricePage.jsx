import { useState } from 'react';
import { getMandiPrices } from '../lib/api';

function MandiPricePage() {
  const [commodity, setCommodity] = useState('Wheat');
  const [district, setDistrict] = useState('Ludhiana');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [priceData, setPriceData] = useState(null);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    setPriceData(null);
    try {
      const data = await getMandiPrices(commodity, district);
      setPriceData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="hero">
        <h1 className="hero-title">Mandi Price Lookup</h1>
        <p className="hero-subtitle">Check latest commodity prices from nearby mandis</p>
      </section>

      <div className="container">
        <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
          <h2 className="card-title">Search Commodity Prices</h2>
          <div className="form-grid" style={{ maxWidth: '500px' }}>
            <div className="form-group">
              <label htmlFor="commodity">Commodity</label>
              <select 
                id="commodity" 
                value={commodity} 
                onChange={(e) => setCommodity(e.target.value)}
              >
                <option>Wheat</option>
                <option>Cotton</option>
                <option>Paddy (Rice)</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="mandi-district">District</label>
              <select 
                id="mandi-district" 
                value={district} 
                onChange={(e) => setDistrict(e.target.value)}
              >
                <option>Ludhiana</option>
                <option>Amritsar</option>
                <option>Bathinda</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-xl)' }}>
            <button 
              className="btn btn-primary" 
              id="btn-search-mandi"
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? 'Searching...' : 'Search Prices'}
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 'var(--space-xl)' }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {priceData && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            <h2 className="card-title">Price Results for {priceData.commodity}</h2>
            <p style={{ color: 'var(--gray-600)', marginBottom: 'var(--space-md)' }}>
              District: {priceData.district} | Arrival Date: {priceData.arrival_date}
            </p>
            <table className="fert-table" style={{ marginTop: 'var(--space-md)' }}>
              <thead>
                <tr>
                  <th>Price Type</th>
                  <th>Amount (₹ / Quintal)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Minimum Price</td>
                  <td>₹ {priceData.min_price}</td>
                </tr>
                <tr>
                  <td>Maximum Price</td>
                  <td>₹ {priceData.max_price}</td>
                </tr>
                <tr>
                  <td><strong>Modal (Average) Price</strong></td>
                  <td><strong>₹ {priceData.modal_price}</strong></td>
                </tr>
              </tbody>
            </table>
            {priceData.is_fallback && (
              <div className="alert alert-warning" style={{ marginTop: 'var(--space-lg)' }}>
                <strong>Note:</strong> Displaying estimated fallback prices. Live Agmarknet data pending API response.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default MandiPricePage;
