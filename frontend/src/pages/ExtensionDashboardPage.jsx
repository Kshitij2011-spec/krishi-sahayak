import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getOfficerRequests, updateOfficerRequest } from '../lib/officerRequests';
import './ExtensionDashboardPage.css';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const OFFICER_PASSWORD = 'admin123';
const OFFICER_ID       = 'officer_001'; // MVP hardcoded

/** Derive a 3-state status from extension_feedback rows for one report */
function deriveStatus(feedbackRows) {
  if (!feedbackRows || feedbackRows.length === 0) return 'Pending';
  // Latest feedback wins
  const latest = feedbackRows[feedbackRows.length - 1];
  if (latest.is_verified) return 'Verified';
  if (typeof latest.notes === 'string' && latest.notes.includes('Status: Rejected')) return 'Rejected';
  return 'Needs More Information';
}

/** Validate coordinates: must be finite numbers in plausible range */
function validCoords(lat, lon) {
  return (
    typeof lat === 'number' && isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lon === 'number' && isFinite(lon) && lon >= -180 && lon <= 180
  );
}

/** Confidence tier → human-readable officer note */
const TIER_LABELS = {
  high:   'AI prediction — high confidence',
  medium: 'AI prediction — requires verification',
  low:    'AI could not identify reliably',
};

const TIER_CSS = { high: 'tier-high', medium: 'tier-medium', low: 'tier-low' };

// ─── LEAFLET MAP COMPONENT ────────────────────────────────────────────────────
/**
 * LeafletMap — loads Leaflet via CDN, renders markers for valid reports.
 * Cleans up fully on unmount.
 * Props:
 *   reports   — array of formatted report objects
 *   hotspots  — array of computed hotspot objects
 */
function LeafletMap({ reports, hotspots }) {
  const mapRef    = useRef(null);  // DOM div
  const leafletRef = useRef(null); // L instance
  const mapInstanceRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;

    let cssLink, jsScript, mounted = true;

    function initMap(L) {
      if (!mounted || !mapRef.current) return;

      // Destroy previous instance if any
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapRef.current, { zoomControl: true }).setView([19.5, 76.5], 7);
      mapInstanceRef.current = map;

      // OpenStreetMap tiles (free, no API key)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      // Severity → marker colour
      const severityColor = { High: '#ef4444', Critical: '#dc2626', Moderate: '#eab308', Low: '#22c55e', None: '#22c55e' };
      const tierBorderColor = { high: '#16a34a', medium: '#d97706', low: '#6b7280' };

      function makeIcon(L, report) {
        const bg    = severityColor[report.severity] || '#6b7280';
        const border = tierBorderColor[report.confidence_tier] || '#6b7280';
        const opacity = report.is_approximate ? 0.55 : 1.0;
        return L.divIcon({
          className: '',
          html: `<div style="
            width:14px;height:14px;border-radius:50%;
            background:${bg};border:2.5px solid ${border};
            opacity:${opacity};cursor:pointer;
            box-shadow:0 1px 4px rgba(0,0,0,0.4)">
          </div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
          popupAnchor: [0, -10],
        });
      }

      // Add report markers
      const validReports = reports.filter(r => validCoords(r.latitude, r.longitude));
      validReports.forEach(r => {
        const approxNote = r.is_approximate ? '<br>⚠️ <em>Approximate district location</em>' : '';
        const dateStr = r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '—';
        const popup = `
          <div style="font-size:0.82rem;min-width:180px;">
            <strong style="font-size:0.9rem">${r.disease || r.predicted_label || 'Unknown'}</strong>
            <table style="width:100%;margin-top:6px;border-collapse:collapse;">
              <tr><td style="color:#666;padding:1px 4px 1px 0">Crop</td><td><strong>${r.crop || '—'}</strong></td></tr>
              <tr><td style="color:#666;padding:1px 4px 1px 0">Severity</td><td><strong>${r.severity || '—'}</strong></td></tr>
              <tr><td style="color:#666;padding:1px 4px 1px 0">Confidence</td><td><strong>${r.confidence_tier || '—'}</strong></td></tr>
              <tr><td style="color:#666;padding:1px 4px 1px 0">Status</td><td>${r.status}</td></tr>
              <tr><td style="color:#666;padding:1px 4px 1px 0">Date</td><td>${dateStr}</td></tr>
            </table>
            ${approxNote}
          </div>`;
        L.marker([r.latitude, r.longitude], { icon: makeIcon(L, r) })
          .addTo(map)
          .bindPopup(popup);
      });

      // Hotspot circles
      hotspots.forEach(h => {
        if (!validCoords(h.lat, h.lon)) return;
        L.circle([h.lat, h.lon], {
          radius: 11000,
          color: '#f59e0b',
          weight: 2,
          fillColor: '#fbbf24',
          fillOpacity: 0.15,
        }).addTo(map)
          .bindPopup(`
            <div style="font-size:0.82rem;">
              <strong>⚠️ Potential Hotspot</strong><br>
              <em>Based on ${h.count} reported cases — not a confirmed outbreak</em><br>
              Dominant: ${h.dominant_disease || '—'}<br>
              Crop: ${h.dominant_crop || '—'}
            </div>`);
      });

      // Fit map to markers if any
      if (validReports.length > 0) {
        const latlngs = validReports.map(r => [r.latitude, r.longitude]);
        try { map.fitBounds(latlngs, { padding: [30, 30], maxZoom: 10 }); } catch (_) {}
      }
    }

    function loadLeaflet() {
      // Inject CSS
      if (!document.getElementById('leaflet-css')) {
        cssLink = document.createElement('link');
        cssLink.id   = 'leaflet-css';
        cssLink.rel  = 'stylesheet';
        cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(cssLink);
      }

      // Inject JS if not already loaded
      if (window.L) {
        initMap(window.L);
        return;
      }
      if (!document.getElementById('leaflet-js')) {
        jsScript = document.createElement('script');
        jsScript.id  = 'leaflet-js';
        jsScript.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        jsScript.onload = () => { if (mounted) initMap(window.L); };
        document.head.appendChild(jsScript);
        leafletRef.current = jsScript;
      } else {
        // Script tag exists but L might not be loaded yet — wait
        const poll = setInterval(() => {
          if (window.L) { clearInterval(poll); if (mounted) initMap(window.L); }
        }, 100);
      }
    }

    loadLeaflet();

    return () => {
      mounted = false;
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  // Rebuild map when data changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, hotspots]);

  const validCount = reports.filter(r => validCoords(r.latitude, r.longitude)).length;

  return (
    <div>
      <div ref={mapRef} id="outbreak-map" style={{ height: '420px', borderRadius: '12px', overflow: 'hidden' }} />
      <p className="map-note">
        📍 Showing {validCount} of {reports.length} reports with valid GPS coordinates.{' '}
        {reports.length - validCount > 0 && `${reports.length - validCount} reports have no location data and are not shown on the map.`}
      </p>
      <div className="map-legend">
        <span className="legend-item"><span className="legend-dot" style={{ background: '#ef4444' }} />High/Critical</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#eab308' }} />Moderate</span>
        <span className="legend-item"><span className="legend-dot" style={{ background: '#22c55e' }} />Low/None</span>
        <span className="legend-item"><span className="legend-circle" />Potential Hotspot</span>
        <span className="legend-item" style={{ opacity: 0.55 }}>⚠️ Faded = approximate location</span>
      </div>
    </div>
  );
}

// ─── HOTSPOT COMPUTATION ─────────────────────────────────────────────────────
function computeHotspots(reports) {
  const cells = {};
  reports.forEach(r => {
    if (!validCoords(r.latitude, r.longitude)) return;
    const key = `${(r.latitude).toFixed(1)}_${(r.longitude).toFixed(1)}`;
    if (!cells[key]) cells[key] = { lat: parseFloat(r.latitude.toFixed(1)), lon: parseFloat(r.longitude.toFixed(1)), reports: [] };
    cells[key].reports.push(r);
  });

  return Object.values(cells)
    .filter(c => c.reports.length >= 3)
    .map(c => {
      // Dominant disease
      const diseaseCounts = {};
      const cropCounts = {};
      c.reports.forEach(r => {
        const d = r.disease || r.predicted_label || 'Unknown';
        const cr = r.crop || 'Unknown';
        diseaseCounts[d] = (diseaseCounts[d] || 0) + 1;
        cropCounts[cr]   = (cropCounts[cr]   || 0) + 1;
      });
      const dominant_disease = Object.entries(diseaseCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      const dominant_crop    = Object.entries(cropCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      const recent24h = c.reports.filter(r => {
        if (!r.created_at) return false;
        return (Date.now() - new Date(r.created_at).getTime()) < 86_400_000;
      }).length;
      return { lat: c.lat, lon: c.lon, count: c.reports.length, dominant_disease, dominant_crop, recent24h };
    })
    .sort((a, b) => b.count - a.count);
}

// ─── DETAIL MODAL ─────────────────────────────────────────────────────────────
function ReportModal({ report, onClose, onSubmitFeedback }) {
  const [verifyAction, setVerifyAction] = useState('verified');
  const [comment, setComment]           = useState('');
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState(null);

  if (!report) return null;

  const dateStr = report.created_at ? new Date(report.created_at).toLocaleString('en-IN') : '—';
  const confPct = typeof report.confidence_score === 'number' ? `${(report.confidence_score * 100).toFixed(1)}%` : '—';

  const handleSubmit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const isVerified = verifyAction === 'verified';
      const statusLine = verifyAction === 'verified'
        ? 'Status: Verified'
        : verifyAction === 'rejected'
        ? 'Status: Rejected'
        : 'Status: Needs More Information';
      const notes = comment.trim() ? `${statusLine}\n${comment.trim()}` : statusLine;

      const { error } = await supabase.from('extension_feedback').insert([{
        report_id:   report.id,
        officer_id:  OFFICER_ID,
        is_verified: isVerified,
        notes,
      }]);
      if (error) throw error;
      onSubmitFeedback(report.id, verifyAction, notes);
      onClose();
    } catch (err) {
      setSaveError(err.message || 'Failed to save feedback.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-panel">
        <div className="modal-header">
          <h2 id="modal-title">
            Report Details
            {report.is_approximate && <span className="approx-badge">⚠️ Approximate location</span>}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          {/* Image */}
          {report.image_url
            ? <img src={report.image_url} alt="Farmer submitted crop" className="modal-image" />
            : <div className="modal-no-image">No image available</div>
          }

          {/* Metadata grid */}
          <div className="modal-meta-grid">
            <div className="meta-item">
              <span className="meta-label">Disease / Pest</span>
              <span className="meta-value">{report.disease || report.predicted_label || '—'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Crop</span>
              <span className="meta-value" style={{ textTransform: 'capitalize' }}>{report.crop || '—'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Severity</span>
              <span className="meta-value">{report.severity || '—'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">AI Confidence</span>
              <span className="meta-value">{confPct}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Confidence Tier</span>
              <span className={`tier-chip ${TIER_CSS[report.confidence_tier] || ''}`}>
                {TIER_LABELS[report.confidence_tier] || report.confidence_tier || '—'}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">District</span>
              <span className="meta-value">{report.district || '—'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Coordinates</span>
              <span className="meta-value">
                {validCoords(report.latitude, report.longitude)
                  ? `${report.latitude?.toFixed(4)}°N, ${report.longitude?.toFixed(4)}°E ${report.is_approximate ? '(approx.)' : '(GPS)'}`
                  : 'Not available'
                }
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Report Date</span>
              <span className="meta-value">{dateStr}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Current Status</span>
              <span className={`status-badge ${report.status?.toLowerCase().replace(/\s+/g, '-')}`}>
                {report.status}
              </span>
            </div>
          </div>

          {/* Verification action */}
          <div className="verify-panel">
            <h3>Officer Verification</h3>
            <div className="verify-options">
              {[
                { value: 'verified',   label: '✅ Verified',               desc: 'Diagnosis confirmed in field' },
                { value: 'rejected',   label: '❌ Rejected',               desc: 'Not credible / incorrect image' },
                { value: 'needs_info', label: '🔎 Needs More Information', desc: 'Request farmer to resubmit' },
              ].map(opt => (
                <label key={opt.value} className={`verify-option ${verifyAction === opt.value ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="verify-action"
                    value={opt.value}
                    checked={verifyAction === opt.value}
                    onChange={() => setVerifyAction(opt.value)}
                  />
                  <span>
                    <strong>{opt.label}</strong>
                    <small>{opt.desc}</small>
                  </span>
                </label>
              ))}
            </div>

            <textarea
              className="verify-comment"
              placeholder="Officer comment (optional)..."
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
            />

            {saveError && (
              <p className="verify-error">⚠️ {saveError}</p>
            )}

            <div className="verify-actions">
              <button className="btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
              <button className="btn-submit-verify" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving…' : 'Save Feedback'}
              </button>
            </div>
            <p className="verify-disclaimer">
              ℹ️ Officer feedback is saved as a human verification record. It does not automatically retrain the AI model.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FARMER REQUEST REVIEW MODAL (Phase 7) ────────────────────────────────────
function FarmerRequestReviewModal({ req, linkedReport, onClose, onUpdated }) {
  const [action,       setAction]       = useState('start_review');
  const [officerNotes, setOfficerNotes] = useState(req.officer_notes || '');
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState(null);

  // ESC closes
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const STATUS_TRANSITIONS = {
    start_review: { label: '🔵 Start Review',      nextStatus: 'in_review'  },
    respond:      { label: '✅ Send Response',      nextStatus: 'responded'  },
    needs_info:   { label: '🔎 Needs More Information', nextStatus: 'in_review' },
    close:        { label: '⚫ Close Request',      nextStatus: 'closed'     },
  };

  const availableActions = () => {
    const s = req.status;
    if (s === 'pending')   return ['start_review'];
    if (s === 'in_review') return ['respond', 'needs_info', 'close'];
    if (s === 'responded') return ['close'];
    return [];
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const transition = STATUS_TRANSITIONS[action];
      if (!transition) throw new Error('Select an action first.');
      const requiresNotes = action === 'respond' || action === 'needs_info';
      if (requiresNotes && !officerNotes.trim()) {
        setSaveError('Please enter a response or note for the farmer.');
        setSaving(false);
        return;
      }
      const json = await updateOfficerRequest(req.id, {
        status:        transition.nextStatus,
        officer_notes: officerNotes.trim() || undefined,
      });
      onUpdated(json.updated || { id: req.id, status: transition.nextStatus, officer_notes: officerNotes.trim() });
    } catch (err) {
      setSaveError(err.message || 'Failed to update request.');
    } finally {
      setSaving(false);
    }
  };

  const confPct = req.confidence_score != null
    ? `${(req.confidence_score * 100).toFixed(1)}%`
    : '—';

  const actions = availableActions();
  if (actions.length > 0 && !actions.includes(action)) setAction(actions[0]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="fr-modal-title"
         onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-panel" style={{ maxWidth: 640, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2 id="fr-modal-title">
            📨 Farmer Assistance Request
            <span style={{ fontSize: '0.7rem', marginLeft: 8, opacity: 0.65 }}>{req.reference_code}</span>
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          {/* Linked report image */}
          {linkedReport?.image_url && (
            <img src={linkedReport.image_url} alt="Linked detection report" className="modal-image" />
          )}
          {req.report_id && !linkedReport && (
            <div className="modal-no-image">Linked detection report image not found locally — it may not have loaded yet.</div>
          )}

          {/* Meta grid */}
          <div className="modal-meta-grid">
            <div className="meta-item">
              <span className="meta-label">Reference</span>
              <span className="meta-value">{req.reference_code}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Crop</span>
              <span className="meta-value" style={{ textTransform: 'capitalize' }}>{req.crop || '—'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">AI Result</span>
              <span className="meta-value">
                {req.confidence_tier === 'low'
                  ? <em>Could not identify reliably</em>
                  : (req.disease || '—')
                }
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Confidence</span>
              <span className="meta-value">{confPct}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Confidence Tier</span>
              <span className={`tier-chip ${TIER_CSS[req.confidence_tier] || ''}`}>
                {TIER_LABELS[req.confidence_tier] || req.confidence_tier || '—'}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Severity</span>
              <span className="meta-value">{req.severity || '—'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">District</span>
              <span className="meta-value">{req.district || '—'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Submitted</span>
              <span className="meta-value">{req.created_at ? new Date(req.created_at).toLocaleString('en-IN') : '—'}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Current Status</span>
              <span className="meta-value">{req.status?.replace('_', ' ')}</span>
            </div>
            {req.report_id && (
              <div className="meta-item">
                <span className="meta-label">Linked Report</span>
                <span className="meta-value">#{req.report_id}</span>
              </div>
            )}
          </div>

          {/* Farmer message */}
          <div className="verify-panel">
            <h3>Farmer's Message</h3>
            <blockquote style={{ margin: '8px 0', padding: '10px 14px', background: 'rgba(0,0,0,0.04)', borderLeft: '3px solid var(--clr-primary, #16a34a)', borderRadius: 6, fontStyle: 'italic' }}>
              "{req.farmer_message}"
            </blockquote>
          </div>

          {/* Officer actions */}
          {actions.length > 0 && (
            <div className="verify-panel">
              <h3>Officer Action</h3>
              <div className="verify-options">
                {actions.map(act => (
                  <label key={act} className={`verify-option ${action === act ? 'selected' : ''}`}>
                    <input
                      type="radio" name="fr-action" value={act}
                      checked={action === act}
                      onChange={() => setAction(act)}
                    />
                    <span>
                      <strong>{STATUS_TRANSITIONS[act]?.label}</strong>
                    </span>
                  </label>
                ))}
              </div>

              {(action === 'respond' || action === 'needs_info') && (
                <textarea
                  className="verify-comment"
                  placeholder={action === 'respond'
                    ? 'Enter your response for the farmer…'
                    : 'Describe what additional information is needed…'
                  }
                  value={officerNotes}
                  onChange={e => setOfficerNotes(e.target.value)}
                  rows={4}
                  maxLength={2000}
                />
              )}

              {saveError && <p className="verify-error">⚠️ {saveError}</p>}

              <div className="verify-actions">
                <button className="btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
                <button className="btn-submit-verify" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : (STATUS_TRANSITIONS[action]?.label || 'Save')}
                </button>
              </div>
            </div>
          )}

          {req.status === 'closed' && (
            <div className="verify-panel">
              <p style={{ opacity: 0.7 }}>⚫ This request is closed. No further actions available.</p>
              {req.officer_notes && (
                <>
                  <h3>Officer Response</h3>
                  <p style={{ fontStyle: 'italic' }}>{req.officer_notes}</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
function ExtensionDashboardPage() {
  // ── Auth (preserved from original) ─────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput]     = useState('');

  // ── Data ────────────────────────────────────────────────────────────────
  const [allReports, setAllReports] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // ── Phase 7: Farmer assistance requests ─────────────────────────────────
  const [officerRequests,        setOfficerRequests]        = useState([]);
  const [requestsLoading,        setRequestsLoading]        = useState(false);
  const [requestsError,          setRequestsError]          = useState(null);
  const [selectedOfficerRequest, setSelectedOfficerRequest] = useState(null);

  // ── Filters ─────────────────────────────────────────────────────────────
  const [filterCrop,     setFilterCrop]     = useState('');
  const [filterTier,     setFilterTier]     = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterDate,     setFilterDate]     = useState('all'); // '24h'|'7d'|'30d'|'all'

  // ── UI ──────────────────────────────────────────────────────────────────
  const [selectedReport, setSelectedReport] = useState(null);
  const [activeTab, setActiveTab]           = useState('table'); // 'table'|'map'|'hotspots'

  // ── FETCH — preserved + extended ────────────────────────────────────────
  const fetchRealData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const { data: reports, error: reportsErr } = await supabase
        .from('pest_reports')
        .select('*')
        .order('created_at', { ascending: false });
      if (reportsErr) throw reportsErr;

      const { data: feedback, error: feedbackErr } = await supabase
        .from('extension_feedback')
        .select('*');
      if (feedbackErr) throw feedbackErr;

      // Group feedback by report_id (a report may have multiple feedback rows)
      const feedbackByReport = {};
      (feedback || []).forEach(f => {
        if (!feedbackByReport[f.report_id]) feedbackByReport[f.report_id] = [];
        feedbackByReport[f.report_id].push(f);
      });

      const formatted = (reports || []).map(r => ({
        id:                r.id,
        created_at:        r.created_at,
        // Fix original bug: r.crop_stage was used as crop
        crop:              r.crop        || null,
        crop_stage:        r.crop_stage  || null,
        disease:           r.disease     || null,
        predicted_label:   r.predicted_label || 'Unknown',
        confidence_score:  typeof r.confidence_score === 'number' ? r.confidence_score : null,
        confidence_tier:   r.confidence_tier || null,
        severity:          r.severity    || null,
        trap_count:        r.trap_count  ?? null,
        // Fix original bug: 'Amravati' hardcoded as default
        district:          r.district    || null,
        latitude:          typeof r.latitude  === 'number' ? r.latitude  : (r.latitude  ? parseFloat(r.latitude)  : null),
        longitude:         typeof r.longitude === 'number' ? r.longitude : (r.longitude ? parseFloat(r.longitude) : null),
        is_approximate:    r.location_is_approximate === true,
        image_url:         r.image_url   || null,
        status:            deriveStatus(feedbackByReport[r.id]),
      }));

      setAllReports(formatted);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setFetchError(err.message || 'Failed to load data from Supabase.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isAuthenticated) fetchRealData(); }, [isAuthenticated, fetchRealData]);

  // ── Fetch officer requests (Phase 7) ─────────────────────────────────────
  const fetchOfficerRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const json = await getOfficerRequests();
      setOfficerRequests(json.requests || []);
    } catch (err) {
      setRequestsError(err.message || 'Failed to load farmer requests.');
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => { if (isAuthenticated) fetchOfficerRequests(); }, [isAuthenticated, fetchOfficerRequests]);

  // ── Feedback submitted from modal ────────────────────────────────────────
  const handleFeedbackSubmitted = useCallback((reportId, verifyAction) => {
    const statusMap = { verified: 'Verified', rejected: 'Rejected', needs_info: 'Needs More Information' };
    setAllReports(prev => prev.map(r =>
      r.id === reportId ? { ...r, status: statusMap[verifyAction] || r.status } : r
    ));
  }, []);

  // ── Derived statistics ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const now = Date.now();
    const total          = allReports.length;
    const last24h        = allReports.filter(r => r.created_at && (now - new Date(r.created_at).getTime()) < 86_400_000).length;
    const highConf       = allReports.filter(r => r.confidence_tier === 'high').length;
    const medLowConf     = allReports.filter(r => r.confidence_tier === 'medium' || r.confidence_tier === 'low').length;
    const pending        = allReports.filter(r => r.status === 'Pending').length;
    const verified       = allReports.filter(r => r.status === 'Verified').length;
    return { total, last24h, highConf, medLowConf, pending, verified };
  }, [allReports]);

  // ── Filtered reports ──────────────────────────────────────────────────────
  const filteredReports = useMemo(() => {
    const now = Date.now();
    const dateMs = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 };
    return allReports.filter(r => {
      if (filterCrop     && r.crop !== filterCrop)                   return false;
      if (filterTier     && r.confidence_tier !== filterTier)        return false;
      if (filterSeverity && r.severity !== filterSeverity)           return false;
      if (filterDistrict && r.district !== filterDistrict)           return false;
      if (filterStatus   && r.status !== filterStatus)               return false;
      if (filterDate !== 'all' && r.created_at) {
        if ((now - new Date(r.created_at).getTime()) > dateMs[filterDate]) return false;
      }
      return true;
    });
  }, [allReports, filterCrop, filterTier, filterSeverity, filterDistrict, filterStatus, filterDate]);

  // ── Unique values for filter dropdowns ───────────────────────────────────
  const uniqueValues = useMemo(() => ({
    crops:     [...new Set(allReports.map(r => r.crop).filter(Boolean))].sort(),
    districts: [...new Set(allReports.map(r => r.district).filter(Boolean))].sort(),
  }), [allReports]);

  // ── Hotspots ─────────────────────────────────────────────────────────────
  const hotspots = useMemo(() => computeHotspots(allReports), [allReports]);

  // ── Request stats ─────────────────────────────────────────────────────
  const requestStats = useMemo(() => ({
    pending:   officerRequests.filter(r => r.status === 'pending').length,
    in_review: officerRequests.filter(r => r.status === 'in_review').length,
    responded: officerRequests.filter(r => r.status === 'responded').length,
    closed:    officerRequests.filter(r => r.status === 'closed').length,
  }), [officerRequests]);

  // ══════════════════════════════════════════════════════════════════════════
  // LOGIN SCREEN (preserved from original)
  // ══════════════════════════════════════════════════════════════════════════
  if (!isAuthenticated) {
    return (
      <div className="page-container login-container">
        <div className="login-box">
          <h2>🔒 Officer Portal</h2>
          <p>Please enter your extension officer credentials.</p>
          <div className="login-form">
            <input
              type="password"
              placeholder="Enter Password"
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (passwordInput === OFFICER_PASSWORD) setIsAuthenticated(true);
                  else alert('Incorrect password');
                }
              }}
            />
            <button onClick={() => {
              if (passwordInput === OFFICER_PASSWORD) setIsAuthenticated(true);
              else alert('Incorrect password');
            }}>Login</button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="page-container loading">⏳ Loading Dashboard…</div>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════

  // ── Priority derived from confidence + severity ────────────────────────
  function requestPriority(req) {
    if (req.confidence_tier === 'low' || req.severity === 'High' || req.severity === 'Critical') return 'high';
    if (req.confidence_tier === 'medium') return 'medium';
    return 'low';
  }
  const PRIORITY_ICON = { high: '🔴', medium: '🟡', low: '🟢' };

  return (
    <div className="page-container extension-dashboard">
      <header className="dashboard-header">
        <h1>🌾 Extension Officer Dashboard</h1>
        <p>Real-time Early Warning &amp; Pest Outbreak Monitoring — Maharashtra</p>
      </header>

      {/* FETCH ERROR */}
      {fetchError && (
        <div className="dash-error-banner" role="alert">
          ⚠️ Could not load data from Supabase: <strong>{fetchError}</strong>
          <button onClick={fetchRealData} style={{ marginLeft: 12 }}>Retry</button>
        </div>
      )}

      {/* ── FARMER ASSISTANCE REQUESTS ─────────────────────────────────── */}
      <section className="or-officer-section">
        <div className="or-officer-section-header">
          <h2 className="or-officer-section-title">📨 Farmer Assistance Requests</h2>
          <button className="dash-refresh" onClick={fetchOfficerRequests} title="Refresh requests">↺ Refresh</button>
        </div>

        {/* Stats strip */}
        <div className="or-req-stats">
          <div className="or-req-stat or-req-stat-pending">
            <span className="or-req-stat-num">{requestStats.pending}</span>
            <span className="or-req-stat-label">🟡 Pending</span>
          </div>
          <div className="or-req-stat or-req-stat-review">
            <span className="or-req-stat-num">{requestStats.in_review}</span>
            <span className="or-req-stat-label">🔵 In Review</span>
          </div>
          <div className="or-req-stat or-req-stat-responded">
            <span className="or-req-stat-num">{requestStats.responded}</span>
            <span className="or-req-stat-label">🟢 Responded</span>
          </div>
          <div className="or-req-stat or-req-stat-closed">
            <span className="or-req-stat-num">{requestStats.closed}</span>
            <span className="or-req-stat-label">⚫ Closed</span>
          </div>
        </div>

        {requestsLoading && <p className="or-loading">⏳ Loading farmer requests…</p>}
        {requestsError  && <p className="or-err-msg">⚠️ {requestsError}</p>}

        {!requestsLoading && !requestsError && officerRequests.length === 0 && (
          <p className="or-empty">No farmer assistance requests yet.</p>
        )}

        {!requestsLoading && officerRequests.length > 0 && (
          <div className="or-req-table-wrap">
            <table className="or-req-table" aria-label="Farmer Assistance Requests">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Crop</th>
                  <th>AI Confidence</th>
                  <th>District</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {officerRequests.map(req => {
                  const pri = requestPriority(req);
                  const confPct = req.confidence_score != null
                    ? `${(req.confidence_score * 100).toFixed(0)}%`
                    : req.confidence_tier === 'low' ? 'Low (unidentified)' : '—';
                  const timeAgo = req.created_at
                    ? (() => {
                        const diffMs = Date.now() - new Date(req.created_at).getTime();
                        const mins = Math.floor(diffMs / 60000);
                        if (mins < 60) return `${mins}m ago`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `${hrs}h ago`;
                        return `${Math.floor(hrs/24)}d ago`;
                      })()
                    : '—';
                  const STATUS_BADGE = {
                    pending:   'or-badge-pending',
                    in_review: 'or-badge-review',
                    responded: 'or-badge-responded',
                    closed:    'or-badge-closed',
                  };
                  return (
                    <tr key={req.id} className={`or-req-row or-req-row-${pri}`}>
                      <td><span className="or-priority">{PRIORITY_ICON[pri]}</span></td>
                      <td style={{ textTransform: 'capitalize' }}>{req.crop || '—'}</td>
                      <td>{confPct}</td>
                      <td>{req.district || '—'}</td>
                      <td>{timeAgo}</td>
                      <td>
                        <span className={`or-req-badge ${STATUS_BADGE[req.status] || ''}`}>
                          {req.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => setSelectedOfficerRequest(req)}
                          disabled={req.status === 'closed'}
                        >
                          {req.status === 'closed' ? 'Closed' : 'Review'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Officer Request Detail Modal */}
      {selectedOfficerRequest && (
        <FarmerRequestReviewModal
          req={selectedOfficerRequest}
          linkedReport={allReports.find(r => r.id === selectedOfficerRequest.report_id)}
          onClose={() => setSelectedOfficerRequest(null)}
          onUpdated={(updatedReq) => {
            setOfficerRequests(prev => prev.map(r => r.id === updatedReq.id ? { ...r, ...updatedReq } : r));
            setSelectedOfficerRequest(null);
          }}
        />
      )}

      {/* ── PRIORITY CASES STRIP ─────────────────────────────────────────── */}
      {(() => {
        const priorityCount = allReports.filter(
          r => (r.severity === 'Critical' || r.severity === 'High') && r.status === 'Pending'
        ).length;
        return priorityCount > 0 ? (
          <div className="priority-strip" role="alert">
            🚨 <strong>Priority Cases: {priorityCount}</strong> — High/Critical severity reports awaiting verification.{' '}
            <button
              className="hotspot-strip-link"
              onClick={() => {
                setFilterSeverity('');
                setFilterStatus('Pending');
                setActiveTab('table');
              }}
            >
              View →
            </button>
          </div>
        ) : null;
      })()}

      {/* ── STATS CARDS ──────────────────────────────────────────────────── */}
      <div className="summary-cards summary-cards-6">
        <div className="card">
          <h3>Total Reports</h3>
          <div className="value">{stats.total}</div>
        </div>
        <div className="card card-blue">
          <h3>Last 24 Hours</h3>
          <div className="value">{stats.last24h}</div>
        </div>
        <div className="card card-green">
          <h3>High Confidence</h3>
          <div className="value">{stats.highConf}</div>
          <div className="card-sub">AI confident results</div>
        </div>
        <div className="card card-yellow">
          <h3>Need Verification</h3>
          <div className="value">{stats.medLowConf}</div>
          <div className="card-sub">Medium + Low tier</div>
        </div>
        <div className="card alert-card">
          <h3>Pending Review</h3>
          <div className="value">{stats.pending}</div>
        </div>
        <div className="card card-green">
          <h3>Verified</h3>
          <div className="value">{stats.verified}</div>
        </div>
      </div>

      {/* Hotspot alert strip */}
      {hotspots.length > 0 && (
        <div className="hotspot-alert-strip" role="alert">
          ⚠️ <strong>{hotspots.length} potential hotspot{hotspots.length > 1 ? 's' : ''}</strong> detected based on report clusters.{' '}
          <button className="hotspot-strip-link" onClick={() => setActiveTab('hotspots')}>View →</button>
        </div>
      )}

      {/* ── TABS ─────────────────────────────────────────────────────────── */}
      <div className="dash-tabs">
        {[
          { id: 'table',    label: `📋 Report List (${filteredReports.length})` },
          { id: 'map',      label: '🗺️ Map View' },
          { id: 'hotspots', label: `🔥 Hotspots (${hotspots.length})` },
        ].map(tab => (
          <button
            key={tab.id}
            className={`dash-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <button className="dash-refresh" onClick={fetchRealData} title="Refresh data">↺ Refresh</button>
      </div>

      {/* ── FILTER BAR (table + map share same filters) ───────────────────── */}
      {(activeTab === 'table' || activeTab === 'map') && (
        <div className="filter-bar" role="search">
          <select value={filterCrop}     onChange={e => setFilterCrop(e.target.value)}     aria-label="Filter by crop">
            <option value="">All Crops</option>
            {uniqueValues.crops.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterTier}     onChange={e => setFilterTier(e.target.value)}     aria-label="Filter by AI tier">
            <option value="">All Tiers</option>
            <option value="high">High Confidence</option>
            <option value="medium">Medium (verify)</option>
            <option value="low">Low (AI uncertain)</option>
          </select>
          <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} aria-label="Filter by severity">
            <option value="">All Severity</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Moderate">Moderate</option>
            <option value="Low">Low</option>
            <option value="None">None</option>
          </select>
          <select value={filterDistrict} onChange={e => setFilterDistrict(e.target.value)} aria-label="Filter by district">
            <option value="">All Districts</option>
            {uniqueValues.districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={filterStatus}   onChange={e => setFilterStatus(e.target.value)}   aria-label="Filter by status">
            <option value="">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Verified">Verified</option>
            <option value="Rejected">Rejected</option>
            <option value="Needs More Information">Needs More Info</option>
          </select>
          <select value={filterDate}     onChange={e => setFilterDate(e.target.value)}     aria-label="Filter by time period">
            <option value="all">All Time</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          {(filterCrop || filterTier || filterSeverity || filterDistrict || filterStatus || filterDate !== 'all') && (
            <button className="filter-clear" onClick={() => {
              setFilterCrop(''); setFilterTier(''); setFilterSeverity('');
              setFilterDistrict(''); setFilterStatus(''); setFilterDate('all');
            }}>✕ Clear Filters</button>
          )}
        </div>
      )}

      {/* ══ TAB: REPORT TABLE ══════════════════════════════════════════════ */}
      {activeTab === 'table' && (
        <>
          {filteredReports.length === 0 ? (
            <div className="dash-empty">
              {allReports.length === 0
                ? '📭 No reports have been submitted yet.'
                : '🔍 No reports match the current filters.'}
            </div>
          ) : (
            <div className="alerts-table-wrapper">
              <table className="alerts-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Crop</th>
                    <th>Disease / Pest</th>
                    <th>AI Tier</th>
                    <th>Confidence</th>
                    <th>Severity</th>
                    <th>District</th>
                    <th>Location</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map(r => {
                    const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '—';
                    const confPct = typeof r.confidence_score === 'number' ? `${(r.confidence_score * 100).toFixed(0)}%` : '—';
                    return (
                      <tr
                        key={r.id}
                        className={`${r.severity === 'High' || r.severity === 'Critical' ? 'row-high-risk' : ''} ${r.status === 'Pending' && r.confidence_tier === 'low' ? 'row-needs-attention' : ''}`}
                      >
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{dateStr}</td>
                        <td style={{ textTransform: 'capitalize' }}>{r.crop || '—'}</td>
                        <td>{r.disease || r.predicted_label || '—'}</td>
                        <td>
                          <span className={`tier-chip ${TIER_CSS[r.confidence_tier] || 'tier-unknown'}`}>
                            {r.confidence_tier || '—'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 600 }}>{confPct}</td>
                        <td>{r.severity || '—'}</td>
                        <td>{r.district || '—'}</td>
                        <td>
                          {validCoords(r.latitude, r.longitude)
                            ? (r.is_approximate ? <span title="Approximate district coords">📍~approx</span> : <span title="GPS coordinates">📍 GPS</span>)
                            : <span style={{ color: '#9ca3af', fontSize: '0.78rem' }}>No GPS</span>
                          }
                        </td>
                        <td>
                          <span className={`status-badge ${r.status.toLowerCase().replace(/\s+/g, '-')}`}>
                            {r.status}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn-review"
                            onClick={() => setSelectedReport(r)}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ══ TAB: MAP ═══════════════════════════════════════════════════════ */}
      {activeTab === 'map' && (
        <div className="map-section">
          <div className="map-disclaimer" role="note">
            ℹ️ Faded markers indicate approximate district-level coordinates, not exact farm locations.
            Do not treat marker positions as precise field locations.
          </div>
          {filteredReports.filter(r => validCoords(r.latitude, r.longitude)).length === 0 ? (
            <div className="dash-empty">
              📭 No reports with valid GPS coordinates match the current filters.
            </div>
          ) : (
            <LeafletMap reports={filteredReports} hotspots={hotspots} />
          )}
        </div>
      )}

      {/* ══ TAB: HOTSPOTS ══════════════════════════════════════════════════ */}
      {activeTab === 'hotspots' && (
        <div className="hotspots-section">
          <div className="hotspot-disclaimer" role="note">
            ⚠️ <strong>These are potential hotspots based on reported cases — not confirmed outbreaks.</strong>{' '}
            Clusters are determined by geographic proximity (≈0.1° grid ≈ 11 km). Officer field verification is required.
          </div>
          {hotspots.length === 0 ? (
            <div className="dash-empty">
              No clusters detected yet. A potential hotspot is flagged when 3 or more reports come from the same ≈11 km area.
            </div>
          ) : (
            <div className="hotspot-grid">
              {hotspots.map((h, i) => (
                <div key={i} className="hotspot-card">
                  <div className="hotspot-count">{h.count}</div>
                  <div className="hotspot-label">Reports</div>
                  <div className="hotspot-detail">
                    <strong>{h.dominant_disease || 'Unknown disease'}</strong>
                    <span>Dominant crop: {h.dominant_crop || '—'}</span>
                    <span>Recent 24h: {h.recent24h}</span>
                    <span className="hotspot-coords">
                      ~{h.lat.toFixed(1)}°N, {h.lon.toFixed(1)}°E
                    </span>
                  </div>
                  <div className="hotspot-tag">Potential hotspot — not a confirmed outbreak</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DETAIL MODAL ─────────────────────────────────────────────────── */}
      {selectedReport && (
        <ReportModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onSubmitFeedback={handleFeedbackSubmitted}
        />
      )}
    </div>
  );
}

export default ExtensionDashboardPage;
