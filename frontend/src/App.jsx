import { Routes, Route, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PestDetectionPage from './pages/PestDetectionPage';
import MandiPricePage from './pages/MandiPricePage';
import AdvancedAdvisoryPage from './pages/AdvancedAdvisoryPage';
import ExtensionDashboardPage from './pages/ExtensionDashboardPage';
import CropRiskPage from './pages/CropRiskPage';
import SoilInputPage from './pages/SoilInputPage';
import HomePage from './pages/HomePage';
import OfficerRequestStatusPage from './pages/OfficerRequestStatusPage';
import LanguageSwitcher from './components/LanguageSwitcher';

function App() {
  const { t } = useTranslation();

  return (
    <div className="app">
      <nav className="navbar">
        <NavLink to="/" className="navbar-brand" end>
          🌿 <span>Krishi</span>-Sahayak
        </NavLink>
        <ul className="navbar-links">
          <li>
            <NavLink to="/crop-risk" className={({ isActive }) => isActive ? 'active' : ''}>
              {t('nav.crop_risk') || 'Crop Risk'}
            </NavLink>
          </li>
          <li>
            <NavLink to="/detect" className={({ isActive }) => isActive ? 'active' : ''}>
              {t('nav.pest_detection') || 'Disease Detection'}
            </NavLink>
          </li>
          <li>
            <NavLink to="/soil-advisory" className={({ isActive }) => isActive ? 'active' : ''}>
              {t('nav.soil_advisory') || 'Soil Advisory'}
            </NavLink>
          </li>
          {/* Officer dashboard — secondary nav, not primary farmer CTA */}
          <li className="nav-officer">
            <NavLink to="/extension-dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
              {t('nav.dashboard') || 'Officer Dashboard'}
            </NavLink>
          </li>
        </ul>
        <LanguageSwitcher />
      </nav>

      <Routes>
        <Route path="/"                    element={<HomePage />} />
        <Route path="/crop-risk"           element={<CropRiskPage />} />
        <Route path="/detect"              element={<PestDetectionPage />} />
        <Route path="/soil-advisory"       element={<AdvancedAdvisoryPage />} />
        <Route path="/extension-dashboard" element={<ExtensionDashboardPage />} />
        <Route path="/legacy-advisory"     element={<SoilInputPage />} />
        <Route path="/mandi-prices"        element={<MandiPricePage />} />
        <Route path="/request-status/:referenceCode" element={<OfficerRequestStatusPage />} />
      </Routes>
    </div>
  );
}

export default App;
