import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMandiPrices } from '../lib/api';

function MandiPricePage() {
  const { t } = useTranslation();

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
        <h1 className="hero-title">{t('mandi.hero_title')}</h1>
        <p className="hero-subtitle">{t('mandi.hero_subtitle')}</p>
      </section>

      <div className="container">
        <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
          <h2 className="card-title">{t('mandi.card_title')}</h2>
          <div className="form-grid" style={{ maxWidth: '500px' }}>
            <div className="form-group">
              {/* "Commodity" label translated; commodity values are proper commodity names kept in English */}
              <label htmlFor="commodity">{t('mandi.label_commodity')}</label>
              <select id="commodity" value={commodity} onChange={(e) => setCommodity(e.target.value)}>
                <option>Wheat</option>
                <option>Cotton</option>
                <option>Paddy (Rice)</option>
              </select>
            </div>
            <div className="form-group">
              {/* "District" label translated; district names are proper nouns kept in English */}
              <label htmlFor="mandi-district">{t('mandi.label_district')}</label>
              <select id="mandi-district" value={district} onChange={(e) => setDistrict(e.target.value)}>
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
              {loading ? (
                <><span className="spinner"></span>{t('mandi.searching')}</>
              ) : (
                t('mandi.btn_search')
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-danger" style={{ marginBottom: 'var(--space-xl)' }}>
            <strong>{t('mandi.errors.error_prefix')}</strong> {error}
          </div>
        )}

        {priceData && (
          <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
            {/* priceData.commodity and priceData.district are API outputs — displayed as-is */}
            <h2 className="card-title">
              {t('mandi.result.title', { commodity: priceData.commodity })}
            </h2>
            <p style={{ color: 'var(--gray-600)', marginBottom: 'var(--space-md)' }}>
              {t('mandi.result.district')}: {priceData.district} &nbsp;|&nbsp;
              {t('mandi.result.arrival_date')}: {priceData.arrival_date}
            </p>
            <table className="fert-table" style={{ marginTop: 'var(--space-md)' }}>
              <thead>
                <tr>
                  <th>{t('mandi.result.col_price_type')}</th>
                  <th>{t('mandi.result.col_amount')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{t('mandi.result.min_price')}</td>
                  <td>₹ {priceData.min_price}</td>
                </tr>
                <tr>
                  <td>{t('mandi.result.max_price')}</td>
                  <td>₹ {priceData.max_price}</td>
                </tr>
                <tr>
                  <td><strong>{t('mandi.result.modal_price')}</strong></td>
                  <td><strong>₹ {priceData.modal_price}</strong></td>
                </tr>
              </tbody>
            </table>
            {priceData.is_fallback && (
              <div className="alert alert-warning" style={{ marginTop: 'var(--space-lg)' }}>
                {/* Fallback note is a UI label — translated */}
                <strong>{t('mandi.result.fallback_note')}</strong>{' '}
                {t('mandi.result.fallback_desc')}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default MandiPricePage;
