/**
 * locale.js — shared utility for Web Speech API locale mapping.
 *
 * Maps i18n language codes (en, hi, mr) to BCP-47 locale strings used by
 * the Web Speech API. Provides a robust fallback chain so TTS and voice
 * recognition always degrade gracefully even when a specific voice is absent.
 *
 * Usage:
 *   import { getLocale, getBestVoice } from './locale';
 *   const locale = getLocale(i18n.language); // 'mr' → 'mr-IN'
 *   const { voice, isFallback } = getBestVoice(locale);
 */

/** Maps i18n short codes → BCP-47 locale strings */
export const LANG_TO_LOCALE = {
  en: 'en-IN',
  hi: 'hi-IN',
  mr: 'mr-IN',
  pa: 'pa-IN',
};

/**
 * Fallback chains for TTS voice selection.
 * Each key is a target locale; its value is an ordered list of candidates
 * to try (most specific first, broadest last).
 * Chain: mr-IN → mr → hi-IN → hi → en-IN → en
 */
export const TTS_FALLBACK_CHAIN = {
  'pa-IN': ['pa-IN', 'pa', 'hi-IN', 'hi', 'en-IN', 'en'],
  'mr-IN': ['mr-IN', 'mr', 'hi-IN', 'hi', 'en-IN', 'en'],
  'hi-IN': ['hi-IN', 'hi', 'en-IN', 'en'],
  'en-IN': ['en-IN', 'en'],
};

/**
 * Fallback chains for Speech Recognition lang attribute.
 * Browsers are more forgiving here, so the chain is shorter.
 */
export const RECOGNITION_FALLBACK_CHAIN = {
  'pa-IN': ['pa-IN', 'hi-IN', 'en-IN'],
  'mr-IN': ['mr-IN', 'hi-IN', 'en-IN'],
  'hi-IN': ['hi-IN', 'en-IN'],
  'en-IN': ['en-IN'],
};

/**
 * Get the BCP-47 locale string for a given i18n language code.
 * @param {string} lang - i18n language code (e.g. 'en', 'hi', 'mr')
 * @returns {string} BCP-47 locale (e.g. 'en-IN')
 */
export function getLocale(lang) {
  // Handle codes like 'en-US' or 'hi' gracefully
  const base = lang?.split('-')[0] || 'en';
  return LANG_TO_LOCALE[base] || 'en-IN';
}

/**
 * Find the best available TTS voice for a target locale by walking the
 * fallback chain. A voice is considered a match if its lang tag starts
 * with the candidate's language subtag (e.g. 'hi-IN' matches 'hi').
 *
 * @param {string} targetLocale - BCP-47 locale string (e.g. 'mr-IN')
 * @returns {{ voice: SpeechSynthesisVoice|null, usedLocale: string, isFallback: boolean }}
 */
export function getBestVoice(targetLocale) {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  const chain = TTS_FALLBACK_CHAIN[targetLocale] || ['en-IN', 'en'];

  for (const candidate of chain) {
    // Try exact match first, then language-subtag prefix match
    const exactMatch = voices.find((v) => v.lang === candidate);
    if (exactMatch) {
      return {
        voice: exactMatch,
        usedLocale: candidate,
        isFallback: candidate !== targetLocale,
      };
    }

    const langTag = candidate.split('-')[0];
    const prefixMatch = voices.find((v) => v.lang.startsWith(langTag));
    if (prefixMatch) {
      return {
        voice: prefixMatch,
        usedLocale: prefixMatch.lang,
        isFallback: prefixMatch.lang !== targetLocale,
      };
    }
  }

  // Absolute last resort: any available voice
  const fallback = voices[0] || null;
  return {
    voice: fallback,
    usedLocale: fallback?.lang || 'en-IN',
    isFallback: true,
  };
}

/**
 * Get the best recognition locale by walking the fallback chain and
 * returning the first candidate (browser handles availability internally).
 *
 * @param {string} targetLocale - BCP-47 locale string
 * @returns {string} BCP-47 locale to use for recognition.lang
 */
export function getBestRecognitionLocale(targetLocale) {
  const chain = RECOGNITION_FALLBACK_CHAIN[targetLocale] || ['en-IN'];
  return chain[0];
}

/** Human-readable display names for locales (used in warnings) */
export const LOCALE_DISPLAY_NAMES = {
  'en-IN': 'English',
  'hi-IN': 'हिन्दी',
  'mr-IN': 'मराठी',
  'pa-IN': 'ਪੰਜਾਬੀ',
};
