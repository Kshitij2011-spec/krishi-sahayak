import { Routes, Route, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SoilInputPage from './pages/SoilInputPage';
import PestDetectionPage from './pages/PestDetectionPage';
import MandiPricePage from './pages/MandiPricePage';
import AdvancedAdvisoryPage from './pages/AdvancedAdvisoryPage';
import LanguageSwitcher from './components/LanguageSwitcher';

function App() {
  const { t } = useTranslation();

  return (
    <div className="app">
      <nav className="navbar">
        <NavLink to="/" className="navbar-brand">
          🌿 <span>Krishi</span>-Sahayak
        </NavLink>
        <ul className="navbar-links">
          <li>
            <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''} end>
              {t('nav.home')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/pest-detection" className={({ isActive }) => isActive ? 'active' : ''}>
              {t('nav.pest_detection')}
            </NavLink>
          </li>
          <li>
            <NavLink to="/mandi-prices" className={({ isActive }) => isActive ? 'active' : ''}>
              {t('nav.mandi_prices')}
            </NavLink>
          </li>
        </ul>
        <LanguageSwitcher />
      </nav>

      <Routes>
        <Route path="/" element={<AdvancedAdvisoryPage />} />
        <Route path="/pest-detection" element={<PestDetectionPage />} />
        <Route path="/mandi-prices" element={<MandiPricePage />} />
        <Route path="/legacy-advisory" element={<SoilInputPage />} />
      </Routes>
    </div>
  );
}

export default App;
