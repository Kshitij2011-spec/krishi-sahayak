const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function recommendCrop(soilData) {
  const res = await fetch(`${API_URL}/api/recommend-crop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(soilData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getFertilizer(data) {
  const res = await fetch(`${API_URL}/api/fertilizer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function detectPest(imageUrl) {
  const res = await fetch(`${API_URL}/api/detect-pest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error(errData.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.retry_in = errData.retry_in;
    throw err;
  }
  return res.json();
}
