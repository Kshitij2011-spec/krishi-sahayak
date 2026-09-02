/**
 * PhotoTips.jsx
 * ─────────────────────────────────────────────────────────────
 * Farmer-friendly image capture guidance shown above the upload area.
 * Collapsible on mobile. Translated via i18next.
 *
 * Props: none
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const TIP_ICONS = ['🌿', '☀️', '📷', '🔍'];

export default function PhotoTips() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  const tips = [
    t('pest.photo_tips.tip1'),
    t('pest.photo_tips.tip2'),
    t('pest.photo_tips.tip3'),
    t('pest.photo_tips.tip4'),
  ];

  return (
    <div className="photo-tips">
      <button
        type="button"
        className="photo-tips__toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {t('pest.photo_tips.heading')}
        <span className="photo-tips__chevron" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <ul className="photo-tips__list" role="list">
          {tips.map((tip, i) => (
            <li key={i} className="photo-tips__item">
              <span className="photo-tips__icon" aria-hidden="true">
                {TIP_ICONS[i]}
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
