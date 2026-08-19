/**
 * useSpeech.js — reusable hook for Speech Recognition + TTS.
 *
 * Encapsulates all Web Speech API logic so pages never interact with
 * the API directly. Automatically adapts locale to the active i18n language.
 *
 * Usage:
 *   const { isListening, ttsWarning, voiceError, lastTranscript, startListening, speak } = useSpeech();
 */

import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocale, getBestVoice, LOCALE_DISPLAY_NAMES } from '../lib/locale';

export function useSpeech() {
  const { t, i18n } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [ttsWarning, setTtsWarning] = useState('');
  const [voiceError, setVoiceError] = useState('');   // visible error shown in UI
  const [lastTranscript, setLastTranscript] = useState(''); // what the mic heard
  const recognitionRef = useRef(null);

  const targetLocale = getLocale(i18n.language);

  /**
   * Start speech recognition.
   * @param {(transcript: string) => void} onResult - called with the lowercased transcript
   */
  const startListening = useCallback(
    (onResult) => {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setVoiceError('Voice input is not supported in this browser. Please use Chrome or Edge.');
        return;
      }

      setVoiceError('');
      setLastTranscript('');

      const recognition = new SpeechRecognition();
      recognition.lang = targetLocale;
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend   = () => setIsListening(false);

      recognition.onerror = (e) => {
        setIsListening(false);
        // Map Web Speech API error codes to user-friendly messages
        const errorMessages = {
          'not-allowed':       '🎤 Microphone access denied. Please allow microphone in your browser settings and try again.',
          'no-speech':         '🔇 No speech detected. Please speak clearly and try again.',
          'audio-capture':     '🎤 No microphone found. Please connect a microphone.',
          'network':           '🌐 Network error during voice recognition. Check your connection.',
          'aborted':           '',   // user cancelled — no message needed
          'service-not-allowed': '🎤 Speech service not allowed. Use Chrome/Edge on localhost or HTTPS.',
        };
        const msg = errorMessages[e.error] ?? `Voice error: ${e.error}`;
        if (msg) setVoiceError(msg);
        console.error('Speech recognition error:', e.error);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase();
        setLastTranscript(transcript); // show what was heard in the UI
        onResult(transcript);
      };

      recognitionRef.current = recognition;
      recognition.start();
    },
    [targetLocale, t]
  );

  /** Abort any in-progress recognition session. */
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  /**
   * Speak text using TTS.
   * Voice locale follows i18n.language with the full fallback chain.
   *
   * @param {string} text - The text to speak (English).
   */
  const speak = useCallback(
    (text) => {
      if (!('speechSynthesis' in window)) {
        alert(t('soil.errors.tts_unsupported'));
        return;
      }

      window.speechSynthesis.cancel();
      setTtsWarning('');

      const { voice, usedLocale, isFallback } = getBestVoice(targetLocale);

      if (isFallback && targetLocale !== 'en-IN') {
        const requestedName = LOCALE_DISPLAY_NAMES[targetLocale] || targetLocale;
        setTtsWarning(t('soil.tts_fallback_warning', { lang: requestedName }));
        console.warn(`TTS: requested locale ${targetLocale} not found. Using ${usedLocale}.`);
      }

      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || usedLocale || targetLocale;
      window.speechSynthesis.speak(utterance);
    },
    [targetLocale, t]
  );

  /** Cancel any in-progress TTS and clear warnings. */
  const cancelSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    setTtsWarning('');
  }, []);

  return {
    isListening,
    ttsWarning,
    setTtsWarning,
    voiceError,       // show this in the UI when voice fails
    lastTranscript,   // show what the mic heard, for debugging/confirmation
    targetLocale,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
  };
}
