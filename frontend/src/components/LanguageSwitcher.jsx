/**
 * LanguageSwitcher.jsx — global language selector rendered in the Navbar.
 *
 * Renders: 🌐 English | हिन्दी | मराठी
 *
 * Calling i18n.changeLanguage(code) is sufficient — the i18next
 * LanguageDetector middleware automatically persists the selection to
 * localStorage['krishi_lang'] so it survives page refreshes.
 *
 * To add a future language:
 *   1. Add it to the LANGUAGES array below
 *   2. Add its resource in src/i18n.js
 *   — nothing else needs to change.
 */

import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const handleChange = (code) => {
    i18n.changeLanguage(code);
  };

  return (
    <div className="lang-switcher" role="navigation" aria-label="Language switcher">
      <span className="lang-globe" aria-hidden="true">🌐</span>
      {LANGUAGES.map((lang, idx) => (
        <span key={lang.code} style={{ display: 'inline-flex', alignItems: 'center' }}>
          <button
            id={`lang-btn-${lang.code}`}
            className={`lang-btn${i18n.language === lang.code ? ' lang-btn--active' : ''}`}
            onClick={() => handleChange(lang.code)}
            aria-pressed={i18n.language === lang.code}
            title={`Switch to ${lang.label}`}
          >
            {lang.label}
          </button>
          {idx < LANGUAGES.length - 1 && (
            <span className="lang-separator" aria-hidden="true">|</span>
          )}
        </span>
      ))}
    </div>
  );
}
