/**
 * i18n.js — i18next initialization for Krishi-Sahayak.
 *
 * Import this file ONCE in main.jsx before rendering the React tree.
 * After that, any component can call `useTranslation()` without extra config.
 *
 * Adding a new language in the future:
 *   1. Add translation JSON at src/locales/<code>/translation.json
 *   2. Import it here and add to `resources`
 *   3. Add to `supportedLngs`
 *   4. Add a button in LanguageSwitcher.jsx
 *   — no other files need to change.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en/translation.json';
import hi from './locales/hi/translation.json';
import mr from './locales/mr/translation.json';
import pa from './locales/pa/translation.json';

i18n
  .use(LanguageDetector)      // reads/writes localStorage['krishi_lang']
  .use(initReactI18next)      // connects to React context
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      mr: { translation: mr },
      pa: { translation: pa },
    },

    // Fall back to English if a key is missing in the active language
    fallbackLng: 'en',
    supportedLngs: ['en', 'hi', 'mr', 'pa'],

    detection: {
      // Detection priority: localStorage → browser navigator language
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'krishi_lang',
    },

    interpolation: {
      // React already escapes by default; disable double-escaping
      escapeValue: false,
    },
  });

export default i18n;
