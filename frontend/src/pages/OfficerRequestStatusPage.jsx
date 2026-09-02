/**
 * frontend/src/pages/OfficerRequestStatusPage.jsx
 * Route: /request-status/:referenceCode
 *
 * Farmer checks the status of their officer assistance request.
 * No authentication required — access controlled by opaque reference_code.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getRequestStatus } from '../lib/officerRequests';

const STATUS_CONFIG = {
  pending:   { emoji: '🟡', labelKey: 'officer_request.status_pending',   cls: 'or-status-pending'   },
  in_review: { emoji: '🔵', labelKey: 'officer_request.status_in_review', cls: 'or-status-in-review' },
  responded: { emoji: '🟢', labelKey: 'officer_request.status_responded', cls: 'or-status-responded' },
  closed:    { emoji: '⚫', labelKey: 'officer_request.status_closed',    cls: 'or-status-closed'    },
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function OfficerRequestStatusPage() {
  const { referenceCode } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [reqData, setReqData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await getRequestStatus(referenceCode);
      setReqData(json.request);
    } catch (err) {
      if (err.status === 404) {
        setError(t('officer_request.not_found'));
      } else {
        setError(t('officer_request.submit_error'));
      }
    } finally {
      setLoading(false);
    }
  }, [referenceCode, t]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const statusCfg = reqData ? (STATUS_CONFIG[reqData.status] || STATUS_CONFIG.pending) : null;

  return (
    <main className="or-status-page">
      <div className="container">
        {/* Header */}
        <div className="or-status-header">
          <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>
            ← {t('common.back', 'Back')}
          </button>
          <h1 className="or-status-title">
            👨‍🌾 {t('officer_request.modal_title')}
          </h1>
        </div>

        {loading && (
          <div className="or-status-loading">
            <span className="spinner" /> Loading…
          </div>
        )}

        {error && (
          <div className="or-status-error" role="alert">
            <span className="or-status-error-icon">❌</span>
            <p>{error}</p>
            <button className="btn btn-outline btn-sm" onClick={fetchStatus}>
              {t('common.try_again')}
            </button>
          </div>
        )}

        {reqData && statusCfg && (
          <div className="or-status-card">
            {/* Reference + Status */}
            <div className="or-status-top-row">
              <div className="or-ref-block">
                <span className="or-ref-label">{t('officer_request.request_id')}</span>
                <span className="or-ref-code">{reqData.reference_code}</span>
              </div>
              <div className={`or-status-badge ${statusCfg.cls}`}>
                <span className="or-status-emoji" aria-hidden="true">{statusCfg.emoji}</span>
                <span>{t(statusCfg.labelKey)}</span>
              </div>
            </div>

            {/* Meta grid */}
            <div className="or-status-meta-grid">
              <div className="or-meta-item">
                <span className="or-meta-label">📅 Submitted</span>
                <span className="or-meta-value">{formatDate(reqData.created_at)}</span>
              </div>
              {reqData.reviewed_at && (
                <div className="or-meta-item">
                  <span className="or-meta-label">🕐 Reviewed</span>
                  <span className="or-meta-value">{formatDate(reqData.reviewed_at)}</span>
                </div>
              )}
              {reqData.crop && (
                <div className="or-meta-item">
                  <span className="or-meta-label">🌾 {t('pest.result.crop_label', 'Crop')}</span>
                  <span className="or-meta-value" style={{ textTransform: 'capitalize' }}>{reqData.crop}</span>
                </div>
              )}
              {reqData.disease && reqData.confidence_tier !== 'low' && (
                <div className="or-meta-item">
                  <span className="or-meta-label">🤖 AI Result</span>
                  <span className="or-meta-value">{reqData.disease}</span>
                </div>
              )}
              {reqData.confidence_tier === 'low' && (
                <div className="or-meta-item">
                  <span className="or-meta-label">🤖 AI Result</span>
                  <span className="or-meta-value or-context-low">Could not identify reliably</span>
                </div>
              )}
              {reqData.confidence_score != null && reqData.confidence_tier !== 'low' && (
                <div className="or-meta-item">
                  <span className="or-meta-label">📊 Confidence</span>
                  <span className="or-meta-value">{(reqData.confidence_score * 100).toFixed(0)}%</span>
                </div>
              )}
              {reqData.severity && reqData.severity !== 'None' && (
                <div className="or-meta-item">
                  <span className="or-meta-label">⚠️ Severity</span>
                  <span className="or-meta-value">{reqData.severity}</span>
                </div>
              )}
              {reqData.district && (
                <div className="or-meta-item">
                  <span className="or-meta-label">📍 District</span>
                  <span className="or-meta-value">{reqData.district}</span>
                </div>
              )}
            </div>

            {/* Farmer message */}
            <div className="or-section">
              <h3 className="or-section-title">💬 {t('officer_request.your_message')}</h3>
              <blockquote className="or-farmer-message">
                "{reqData.farmer_message}"
              </blockquote>
            </div>

            {/* Officer response */}
            <div className="or-section">
              <h3 className="or-section-title">
                👨‍💼 {t('officer_request.officer_response')}
              </h3>
              {reqData.status === 'responded' || reqData.status === 'closed' ? (
                reqData.officer_notes ? (
                  <div className="or-officer-response">
                    <p>{reqData.officer_notes}</p>
                    <span className="or-officer-byline">— Agriculture Officer</span>
                  </div>
                ) : (
                  <p className="or-no-response">{t('officer_request.no_response_yet')}</p>
                )
              ) : reqData.status === 'in_review' ? (
                <p className="or-pending-response">
                  🔵 Your request is currently being reviewed by an officer.
                </p>
              ) : (
                <p className="or-no-response">{t('officer_request.no_response_yet')}</p>
              )}
            </div>

            {/* Actions */}
            <div className="or-status-actions">
              <button className="btn btn-outline" onClick={fetchStatus}>
                🔄 {t('officer_request.refresh', 'Refresh Status')}
              </button>
              <button className="btn btn-outline" onClick={() => navigate('/detect')}>
                📷 {t('home.cta_detection', 'Disease Detection')}
              </button>
            </div>

            <p className="or-status-note">
              ℹ️ Save your Request ID ({reqData.reference_code}) to check back on this request later.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
