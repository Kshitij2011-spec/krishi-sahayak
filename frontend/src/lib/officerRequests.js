/**
 * frontend/src/lib/officerRequests.js
 * API helpers for the Phase 7 farmer→officer request system.
 * All calls go through the Flask backend (never directly to Supabase).
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const OFFICER_TOKEN = 'admin123'; // MVP hardcoded, matches backend

// ── Farmer: submit a new officer request ─────────────────────────────────────
export async function submitOfficerRequest({ report_id, farmer_message, crop }) {
  const res = await fetch(`${API_URL}/api/officer-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_id, farmer_message, crop }),
  });
  const json = await res.json().catch(() => ({ status: 'error', message: 'Request failed' }));
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.error_code = json.error_code;
    throw err;
  }
  return json; // { status, request_id, reference_code, message }
}

// ── Farmer: check status of a request by opaque reference code ───────────────
export async function getRequestStatus(referenceCode) {
  const res = await fetch(`${API_URL}/api/officer-requests/${encodeURIComponent(referenceCode)}`);
  const json = await res.json().catch(() => ({ status: 'error', message: 'Request failed' }));
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json; // { status: 'ok', request: { ... } }
}

// ── Officer: fetch all requests (requires token) ──────────────────────────────
export async function getOfficerRequests(statusFilter = '') {
  const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
  const res = await fetch(`${API_URL}/api/officer-requests${qs}`, {
    headers: { 'X-Officer-Token': OFFICER_TOKEN },
  });
  const json = await res.json().catch(() => ({ status: 'error', message: 'Request failed' }));
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json; // { status: 'ok', requests: [ ... ] }
}

// ── Officer: update a request (status transition + notes) ────────────────────
export async function updateOfficerRequest(requestId, { status, officer_notes }) {
  const res = await fetch(`${API_URL}/api/officer-requests/${requestId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Officer-Token': OFFICER_TOKEN,
    },
    body: JSON.stringify({ status, officer_notes }),
  });
  const json = await res.json().catch(() => ({ status: 'error', message: 'Request failed' }));
  if (!res.ok) {
    const err = new Error(json.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json; // { status: 'ok', updated: { ... } }
}
