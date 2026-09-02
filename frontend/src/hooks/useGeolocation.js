import { useState, useEffect } from 'react';

/**
 * useGeolocation
 *
 * Attempts browser GPS first. Returns status so callers can render
 * the appropriate fallback UI.
 *
 * status values:
 *   "pending"  – waiting for browser response
 *   "granted"  – GPS coordinates available
 *   "denied"   – user denied or browser unavailable
 */
export function useGeolocation() {
  const [location, setLocation] = useState({
    status: 'pending',
    lat: null,
    lon: null,
    error: null,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation({ status: 'denied', lat: null, lon: null, error: 'Geolocation not supported by this browser.' });
      return;
    }

    const onSuccess = (position) => {
      setLocation({
        status: 'granted',
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        error: null,
      });
    };

    const onError = (err) => {
      let message = 'Location access denied.';
      if (err.code === 1) message = 'Location permission denied by user.';
      else if (err.code === 2) message = 'Location unavailable.';
      else if (err.code === 3) message = 'Location request timed out.';
      setLocation({ status: 'denied', lat: null, lon: null, error: message });
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      timeout: 8000,
      maximumAge: 60000,
    });
  }, []);

  return location;
}
