/**
 * frontend/src/components/OfficerRequestModal.jsx
 *
 * Reusable modal for a farmer to request agriculture officer assistance.
 * Pre-fills context from a detection result (or crop-risk context).
 * Only asks the farmer for a free-text message.
 *
 * Props:
 *   context     - { crop, disease, confidence, confidenceTier, severity, district, reportId }
 *   onClose     - fn()
 *   onSuccess   - fn({ reference_code, request_id })
 */
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { submitOfficerRequest } from '../lib/officerRequests';

const TIER_LABELS = {
  high:   'High Confidence',
  medium: 'Medium Confidence',
  low:    'Low Confidence',
};

export default function OfficerRequestModal({ context = {}, onClose, onSuccess }) {
  const { t } = useTranslation();
  const { crop, disease, confidence, confidenceTier, severity, district, reportId } = context;

  const [message, setMessage]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState(null);
  const firstFocusRef = useRef(null);
  const textareaRef   = useRef(null);

  // Focus textarea on open
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // ESC closes modal
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const isLow    = confidenceTier === 'low';
  const isMedium = confidenceTier === 'medium';

  const confidencePct = typeof confidence === 'number'
    ? `${(confidence * 100).toFixed(0)}%`
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const msg = message.trim();
    if (!msg) {
      setError(t('officer_request.your_message') + ' ' + t('common.required', 'is required.'));
      return;
    }
    if (msg.length > 1000) {
      setError('Message too long (max 1000 characters).');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitOfficerRequest({
        report_id:      reportId   || null,
        farmer_message: msg,
        crop:           crop       || null,
      });
      onSuccess({ reference_code: result.reference_code, request_id: result.request_id });
    } catch (err) {
      if (err.error_code === 'DUPLICATE_REQUEST') {
        setError(t('officer_request.duplicate_warning'));
      } else if (err.message?.toLowerCase().includes('network') || err.message?.toLowerCase().includes('fetch')) {
        setError(t('officer_request.network_error', 'Connection problem. Please check your internet connection and try again.'));
      } else {
        setError(t('officer_request.submit_error'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="or-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="or-modal-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="or-modal-panel">
        {/* Header */}
        <div className="or-modal-header">
          <h2 id="or-modal-title" className="or-modal-title">
            👨‍🌾 {t('officer_request.modal_title')}
          </h2>
          <button
            className="or-modal-close"
            onClick={onClose}
            aria-label={t('cancel', 'Close')}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="or-modal-body">
            {/* Context summary */}
            <div className="or-context-grid">
              {crop && (
                <div className="or-context-item">
                  <span className="or-context-label">🌾 {t('pest.result.crop_label', 'Crop')}</span>
                  <span className="or-context-value" style={{ textTransform: 'capitalize' }}>{crop}</span>
                </div>
              )}

              {(isLow || !disease) ? (
                <div className="or-context-item or-context-span">
                  <span className="or-context-label">🤖 {t('pest.result.section_label', 'AI Result')}</span>
                  <span className="or-context-value or-context-low">
                    {t('officer_request.low_confidence_cta')}
                  </span>
                </div>
              ) : disease ? (
                <div className="or-context-item">
                  <span className="or-context-label">🤖 {t('pest.result.section_label', 'AI Result')}</span>
                  <span className="or-context-value">{disease}</span>
                </div>
              ) : null}

              {confidencePct && !isLow && (
                <div className="or-context-item">
                  <span className="or-context-label">📊 {t('common.confidence_label', 'Confidence')}</span>
                  <span className="or-context-value">{confidencePct} ({TIER_LABELS[confidenceTier] || confidenceTier})</span>
                </div>
              )}

              {severity && severity !== 'None' && !isLow && (
                <div className="or-context-item">
                  <span className="or-context-label">⚠️ {t('pest.result.severity_label', 'Severity')}</span>
                  <span className="or-context-value">{severity}</span>
                </div>
              )}

              {district && (
                <div className="or-context-item">
                  <span className="or-context-label">📍 District</span>
                  <span className="or-context-value">{district}</span>
                </div>
              )}
            </div>

            {/* Contextual guidance */}
            {isMedium && (
              <p className="or-guidance-note or-guidance-medium">
                ℹ️ {t('officer_request.medium_confidence_cta')}
              </p>
            )}
            {isLow && (
              <p className="or-guidance-note or-guidance-low">
                ℹ️ {t('officer_request.low_confidence_cta')}
              </p>
            )}

            {/* Message field */}
            <div className="or-field-group">
              <label htmlFor="or-farmer-message" className="or-field-label">
                {t('officer_request.your_message')} <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="or-farmer-message"
                ref={textareaRef}
                className="or-message-textarea"
                rows={4}
                maxLength={1000}
                placeholder={t('officer_request.message_placeholder', 'Describe your concern or question for the officer...')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={submitting}
                required
                aria-required="true"
              />
              <small className="or-char-count">{message.length}/1000</small>
            </div>

            {error && (
              <div className="or-error" role="alert">⚠️ {error}</div>
            )}
          </div>

          {/* Footer */}
          <div className="or-modal-footer">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={submitting}
            >
              {t('officer_request.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || !message.trim()}
              id="btn-send-officer-request"
            >
              {submitting
                ? <><span className="spinner" /> Sending…</>
                : <>📤 {t('officer_request.send_request')}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
