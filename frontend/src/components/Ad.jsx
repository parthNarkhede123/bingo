import { useEffect, useRef, useState } from 'react';
import { hasAdConsent } from '../api/consent';

/**
 * Ad slot. Renders a real Google AdSense unit only when BOTH a client id is
 * configured (VITE_ADSENSE_CLIENT) AND the user has granted ads consent.
 * Otherwise it shows a clearly-labelled placeholder, so the layout is complete
 * during development, before AdSense approval, and when a user declines ads.
 */
const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT;
// Per-placement slot ids. Referenced statically so Vite can inline them at build
// time. Each is optional and falls back to the default slot, so a single
// configured VITE_ADSENSE_SLOT still fills every placement on the site.
const SLOTS = {
  default: import.meta.env.VITE_ADSENSE_SLOT,
  home: import.meta.env.VITE_ADSENSE_SLOT_HOME || import.meta.env.VITE_ADSENSE_SLOT,
  play: import.meta.env.VITE_ADSENSE_SLOT_PLAY || import.meta.env.VITE_ADSENSE_SLOT,
  leaderboard: import.meta.env.VITE_ADSENSE_SLOT_LEADERBOARD || import.meta.env.VITE_ADSENSE_SLOT,
  profile: import.meta.env.VITE_ADSENSE_SLOT_PROFILE || import.meta.env.VITE_ADSENSE_SLOT,
};

function loadAdSenseOnce() {
  if (document.querySelector('script[data-adsbygoogle]')) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
  s.crossOrigin = 'anonymous';
  s.setAttribute('data-adsbygoogle', 'true');
  document.head.appendChild(s);
}

export default function Ad({ label = 'Advertisement', placement = 'default', format = 'auto', style }) {
  const ref = useRef(null);
  const [consented, setConsented] = useState(hasAdConsent());

  // React to consent changes without a full page reload.
  useEffect(() => {
    const onConsent = () => setConsented(hasAdConsent());
    window.addEventListener('bingo-consent', onConsent);
    return () => window.removeEventListener('bingo-consent', onConsent);
  }, []);

  const slot = SLOTS[placement] || SLOTS.default;
  const showRealAd = !!CLIENT && consented;

  useEffect(() => {
    if (!showRealAd) return;
    loadAdSenseOnce();
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (_) {
      // AdSense not ready yet; ignore.
    }
  }, [showRealAd]);

  if (!showRealAd) {
    return (
      <div className="ad ad--placeholder" style={style} aria-label={label}>
        <span>{label}</span>
        <small>
          {CLIENT ? 'Ads paused — enable in cookie settings' : 'Ad slot'}
        </small>
      </div>
    );
  }

  return (
    <div className="ad" style={style}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
        ref={ref}
      />
    </div>
  );
}
