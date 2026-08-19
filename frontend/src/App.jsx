import { Routes, Route, NavLink } from 'react-router-dom';
import SoilInputPage from './pages/SoilInputPage';
import PestDetectionPage from './pages/PestDetectionPage';
import MandiPricePage from './pages/MandiPricePage';
import AdvancedAdvisoryPage from './pages/AdvancedAdvisoryPage';

function App() {
  return (
    <div className="app">
      <nav className="navbar">
        <NavLink to="/" className="navbar-brand">
          <span>Krishi</span>-Sahayak
        </NavLink>
        <ul className="navbar-links">
          <li>
            <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''} end>
              Home
            </NavLink>
          </li>
          <li>
            <NavLink to="/pest-detection" className={({ isActive }) => isActive ? 'active' : ''}>
              Pest Detection
            </NavLink>
          </li>
          <li>
            <NavLink to="/mandi-prices" className={({ isActive }) => isActive ? 'active' : ''}>
              Mandi Prices
            </NavLink>
          </li>
        </ul>
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
