/**
 * SpeakButton.jsx
 * ─────────────────────────────────────────────────────────────
 * A self-contained TTS button that works with the current i18n language.
 *
 * Props:
 *   text      (string)  — The text to speak
 *   label     (string)  — Optional accessible button label (defaults to t('common.listen'))
 *   className (string)  — Extra CSS class
 *
 * Behaviour:
 *   • First click → speaks `text` in the active language's voice
 *   • While speaking → shows "Stop" state; clicking cancels speech
 *   • Gracefully hides if speechSynthesis is not available
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSpeech } from '../hooks/useSpeech';

export default function SpeakButton({ text, label, className = '' }) {
  const { t } = useTranslation();
  const { speak, cancelSpeech } = useSpeech();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported('speechSynthesis' in window);
  }, []);

  // Sync button state with browser synthesis events
  useEffect(() => {
    if (!supported) return;
    const handleEnd = () => setIsSpeaking(false);
    window.speechSynthesis.addEventListener?.('voiceschanged', () => {});
    return () => window.speechSynthesis.cancel?.();
  }, [supported]);

  if (!supported) return null;

  const handleClick = () => {
    if (isSpeaking) {
      cancelSpeech();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      speak(text);
      // Listen for utterance end via polling (SpeechSynthesis doesn't have a global event)
      const poll = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          setIsSpeaking(false);
          clearInterval(poll);
        }
      }, 300);
    }
  };

  const btnLabel = isSpeaking
    ? t('common.stop_listening')
    : (label || t('common.listen'));

  return (
    <button
      type="button"
      className={`speak-btn ${isSpeaking ? 'speak-btn--active' : ''} ${className}`}
      onClick={handleClick}
      aria-label={btnLabel}
      title={btnLabel}
    >
      {isSpeaking ? '⏸ ' : '🔊 '}
      {btnLabel}
    </button>
  );
}
