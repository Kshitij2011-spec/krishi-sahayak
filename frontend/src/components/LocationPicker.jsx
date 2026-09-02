import { useState } from 'react';
import { useGeolocation } from '../hooks/useGeolocation';

/**
 * Approximate district centre coordinates for Maharashtra.
 * These are intentionally labelled "approximate" throughout the UI.
 * Source: standard geographic centroids, not precision survey data.
 */
export const MAHARASHTRA_DISTRICTS = [
  { name: 'Akola',       lat: 20.7002, lon: 77.0082 },
  { name: 'Amravati',    lat: 20.9374, lon: 77.7796 },
  { name: 'Aurangabad',  lat: 19.8762, lon: 75.3433 },
  { name: 'Buldhana',    lat: 20.5292, lon: 76.1842 },
  { name: 'Dhule',       lat: 20.9042, lon: 74.7749 },
  { name: 'Hingoli',     lat: 19.7197, lon: 77.1498 },
  { name: 'Jalgaon',     lat: 21.0077, lon: 75.5626 },
  { name: 'Kolhapur',    lat: 16.7050, lon: 74.2433 },
  { name: 'Latur',       lat: 18.4088, lon: 76.5604 },
  { name: 'Nagpur',      lat: 21.1458, lon: 79.0882 },
  { name: 'Nanded',      lat: 19.1383, lon: 77.3210 },
  { name: 'Nashik',      lat: 19.9975, lon: 73.7898 },
  { name: 'Osmanabad',   lat: 18.1860, lon: 76.0450 },
  { name: 'Parbhani',    lat: 19.2671, lon: 76.7741 },
  { name: 'Pune',        lat: 18.5204, lon: 73.8567 },
  { name: 'Satara',      lat: 17.6805, lon: 74.0183 },
  { name: 'Solapur',     lat: 17.6868, lon: 75.9064 },
  { name: 'Wardha',      lat: 20.7453, lon: 78.6022 },
  { name: 'Washim',      lat: 20.1112, lon: 77.1343 },
  { name: 'Yavatmal',    lat: 20.3888, lon: 78.1204 },
];

/**
 * LocationPicker
 *
 * Primary flow: browser GPS → real lat/lon
 * Fallback: district dropdown → approximate coords, clearly labelled
 *
 * Props:
 *   onChange({ lat, lon, district, isApproximate }) — called whenever location changes
 */
export default function LocationPicker({ onChange }) {
  const gps = useGeolocation();
  const [selectedDistrict, setSelectedDistrict] = useState('');

  // When GPS is granted, propagate immediately
  if (gps.status === 'granted') {
    // Only call onChange if values actually changed (avoid re-render loop via effect)
    // We do this inline with a ref pattern handled by the parent reading the prop.
  }

  const handleDistrictChange = (e) => {
    const districtName = e.target.value;
    setSelectedDistrict(districtName);
    const match = MAHARASHTRA_DISTRICTS.find(d => d.name === districtName);
    if (match) {
      onChange({ lat: match.lat, lon: match.lon, district: match.name, isApproximate: true });
    }
  };

  // Notify parent when GPS resolves
  const handleGpsUse = () => {
    if (gps.status === 'granted') {
      onChange({ lat: gps.lat, lon: gps.lon, district: null, isApproximate: false });
    }
  };

  // ── RENDER ──────────────────────────────────────────────────────────────

  if (gps.status === 'pending') {
    return (
      <div className="location-picker location-pending">
        <span className="location-spinner">⏳</span>
        <span>Detecting your location…</span>
      </div>
    );
  }

  if (gps.status === 'granted') {
    return (
      <div className="location-picker location-granted">
        <span className="location-icon">📍</span>
        <span>
          GPS Location: <strong>{gps.lat.toFixed(4)}°N, {gps.lon.toFixed(4)}°E</strong>
        </span>
        <button
          type="button"
          className="location-use-btn"
          onClick={handleGpsUse}
        >
          Use My Location
        </button>
      </div>
    );
  }

  // GPS denied — show district dropdown fallback
  return (
    <div className="location-picker location-fallback">
      <span className="location-icon">📍</span>
      <div className="location-fallback-inner">
        <label htmlFor="district-select">
          Select District (Maharashtra)
          <span className="location-approx-tag"> — Approximate location</span>
        </label>
        <select
          id="district-select"
          value={selectedDistrict}
          onChange={handleDistrictChange}
        >
          <option value="">-- Select your district --</option>
          {MAHARASHTRA_DISTRICTS.map(d => (
            <option key={d.name} value={d.name}>{d.name}</option>
          ))}
        </select>
        {selectedDistrict && (
          <p className="location-approx-note">
            ⚠️ Using approximate coordinates for {selectedDistrict} district. For accurate weather data, allow location access.
          </p>
        )}
      </div>
    </div>
  );
}
