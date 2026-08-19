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
    <div className="mandi-page">

      {/* =========================
          HERO
      ========================= */}
      <section className="hero hero-mandi">
        <div className="mandi-hero-content">
          <p className="mandi-eyebrow">🏪 KRISHI-SAHAYAK MARKET</p>

          <h1 className="hero-title">
            {t('mandi.hero_title')}
          </h1>

          <p className="hero-subtitle">
            {t('mandi.hero_subtitle')}
          </p>

          <div className="mandi-accent-line"></div>
        </div>
      </section>


      {/* =========================
          MAIN CONTENT
      ========================= */}
      <div className="container mandi-container">

        {/* SEARCH CARD */}
        <div
          className="card mandi-search-card"
        >
          <div className="mandi-card-header">
            <div>
              <p className="section-label">🏪 Market Search</p>

              <h2 className="card-title">
                {t('mandi.card_title')}
              </h2>
            </div>

            <div className="mandi-live-badge">
              <span className="mandi-live-dot"></span>
              Live Market Data
            </div>
          </div>


          <div className="form-grid mandi-form-grid">

            {/* Commodity */}
            <div className="form-group">
              <label htmlFor="commodity">
                {t('mandi.label_commodity')}
              </label>

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


            {/* District */}
            <div className="form-group">
              <label htmlFor="mandi-district">
                {t('mandi.label_district')}
              </label>

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


          <div className="mandi-search-action">
            <button
              className="btn btn-primary"
              id="btn-search-mandi"
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  {t('mandi.searching')}
                </>
              ) : (
                <>
                  🔍 {t('mandi.btn_search')}
                </>
              )}
            </button>
          </div>
        </div>


        {/* ERROR */}
        {error && (
          <div className="alert alert-danger mandi-alert">
            <strong>{t('mandi.errors.error_prefix')}</strong>{' '}
            {error}
          </div>
        )}


        {/* =========================
            RESULT CARD
        ========================= */}
        {priceData && (
          <div className="card mandi-result-card">

            <div className="mandi-result-header">

              <div>
                <p className="section-label">
                  📊 Live Market Data
                </p>

                <h2 className="card-title">
                  {t('mandi.result.title', {
                    commodity: priceData.commodity
                  })}
                </h2>
              </div>

              <div className="mandi-market-status">
                <span className="mandi-live-dot"></span>
                Updated
              </div>

            </div>


            {/* Location + Date */}
            <div className="mandi-meta">

              <span>
                📍 {t('mandi.result.district')}:
                <strong>{priceData.district}</strong>
              </span>

              <span className="mandi-meta-divider">·</span>

              <span>
                📅 {t('mandi.result.arrival_date')}:
                <strong>{priceData.arrival_date}</strong>
              </span>

            </div>


            {/* PRICE CARDS */}
            <div className="price-cards-grid mandi-price-grid">

              <div className="price-card mandi-price-card">
                <div className="mandi-price-icon">↓</div>

                <p className="price-card__label">
                  {t('mandi.result.min_price')}
                </p>

                <p className="price-card__value">
                  ₹{priceData.min_price}
                </p>

                <p className="price-card__unit">
                  per quintal
                </p>
              </div>


              <div className="price-card price-card--modal mandi-price-card mandi-price-card--featured">
                <div className="mandi-price-icon">✦</div>

                <p className="price-card__label">
                  {t('mandi.result.modal_price')}
                </p>

                <p className="price-card__value">
                  ₹{priceData.modal_price}
                </p>

                <p className="price-card__unit">
                  per quintal
                </p>
              </div>


              <div className="price-card mandi-price-card">
                <div className="mandi-price-icon">↑</div>

                <p className="price-card__label">
                  {t('mandi.result.max_price')}
                </p>

                <p className="price-card__value">
                  ₹{priceData.max_price}
                </p>

                <p className="price-card__unit">
                  per quintal
                </p>
              </div>

            </div>


            {/* FALLBACK */}
            {priceData.is_fallback && (
              <div className="alert alert-warning mandi-fallback">
                <strong>
                  {t('mandi.result.fallback_note')}
                </strong>{' '}
                {t('mandi.result.fallback_desc')}
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}

export default MandiPricePage;