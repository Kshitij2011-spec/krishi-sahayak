import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * HomePage — SIH demo landing page.
 * Three clear capabilities, three clear CTAs.
 * No fake data, no marketing fluff.
 */
export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const capabilities = [
    {
      icon: '🌱',
      titleKey: 'home.crop_risk_title',
      descKey:  'home.crop_risk_desc',
      ctaKey:   'home.cta_crop_risk',
      route:    '/crop-risk',
      cls:      'home-card home-card--green',
    },
    {
      icon: '📷',
      titleKey: 'home.detection_title',
      descKey:  'home.detection_desc',
      ctaKey:   'home.cta_detection',
      route:    '/detect',
      cls:      'home-card home-card--blue',
    },
    {
      icon: '👨‍💼',
      titleKey: 'home.officer_title',
      descKey:  'home.officer_desc',
      ctaKey:   'home.cta_officer',
      route:    '/extension-dashboard',
      cls:      'home-card home-card--amber',
    },
  ];

  return (
    <main className="home-page">
      {/* HERO */}
      <section className="home-hero">
        <div className="home-hero-content">
          <div className="home-hero-badge">🇮🇳 SIH 2025 — Problem Statement 25010</div>
          <h1 className="home-hero-title">
            Krishi-Sahayak
            <span className="home-hero-subtitle-block">Smart Crop Advisory System</span>
          </h1>
          <p className="home-hero-desc">
            {t('home.hero_desc')}
          </p>
          <div className="home-hero-actions">
            <button
              className="btn btn-primary home-cta-primary"
              onClick={() => navigate('/crop-risk')}
              id="btn-home-crop-risk"
            >
              🌱 {t('home.cta_crop_risk')}
            </button>
            <button
              className="btn btn-outline home-cta-secondary"
              onClick={() => navigate('/detect')}
              id="btn-home-detect"
            >
              📷 {t('home.cta_detection')}
            </button>
          </div>
        </div>
      </section>

      {/* OFFICER HELP STRIP (Phase 7) */}
      <section className="home-officer-strip">
        <div className="container">
          <div className="home-officer-strip-inner">
            <div className="home-officer-strip-text">
              <strong>🤔 {t('officer_request.not_sure_title', 'Not sure about the result?')}</strong>
              <span>{t('officer_request.not_sure_desc', 'Ask an agriculture officer to review your case.')}</span>
            </div>
            <button
              className="btn btn-request-officer-outline home-officer-strip-btn"
              onClick={() => navigate('/detect')}
              id="btn-home-officer-help"
            >
              👨‍🌾 {t('officer_request.request_officer_assistance')} →
            </button>
          </div>
        </div>
      </section>

      {/* FARMER JOURNEY STEPS */}
      <section className="home-journey">
        <div className="container">
          <h2 className="home-section-title">{t('home.journey_title')}</h2>
          <p className="home-section-subtitle">{t('home.journey_subtitle')}</p>
          <div className="home-steps">
            {[
              { step: '1', icon: '🌾', key: 'home.step1' },
              { step: '2', icon: '📍', key: 'home.step2' },
              { step: '3', icon: '📷', key: 'home.step3' },
              { step: '4', icon: '🔊', key: 'home.step4' },
              { step: '5', icon: '👨‍💼', key: 'home.step5' },
            ].map(s => (
              <div className="home-step" key={s.step}>
                <div className="home-step-num">{s.step}</div>
                <div className="home-step-icon">{s.icon}</div>
                <p className="home-step-label">{t(s.key)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THREE CAPABILITY CARDS */}
      <section className="home-capabilities">
        <div className="container">
          <div className="home-cards-grid">
            {capabilities.map(cap => (
              <div key={cap.route} className={cap.cls}>
                <div className="home-card-icon">{cap.icon}</div>
                <h3 className="home-card-title">{t(cap.titleKey)}</h3>
                <p className="home-card-desc">{t(cap.descKey)}</p>
                <button
                  className="btn home-card-btn"
                  onClick={() => navigate(cap.route)}
                  id={`btn-home-${cap.route.replace('/', '').replace('-', '_')}`}
                >
                  {t(cap.ctaKey)} →
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI TRANSPARENCY NOTE */}
      <section className="home-transparency">
        <div className="container">
          <div className="home-transparency-box">
            <h3>ℹ️ {t('home.transparency_title')}</h3>
            <ul>
              <li>{t('home.transparency_1')}</li>
              <li>{t('home.transparency_2')}</li>
              <li>{t('home.transparency_3')}</li>
              <li>{t('home.transparency_4')}</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
