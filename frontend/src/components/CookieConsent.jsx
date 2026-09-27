import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getConsent, setConsent } from '../api/consent';

/**
 * Bottom cookie/ads consent banner. Shows until the user chooses. Choosing
 * "Accept" allows the AdSense script to load (see Ad.jsx); "Reject" keeps ads
 * off and only strictly-necessary storage (login token) is used.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent() == null) setVisible(true);
  }, []);

  if (!visible) return null;

  const choose = (value) => {
    setConsent(value);
    setVisible(false);
  };

  return (
    <div className="cookie-banner" role="dialog" aria-label="Cookie consent">
      <div className="cookie-text">
        We use cookies for login and, if you allow it, to show ads that keep
        Bingo Arena free. See our <Link to="/privacy">Privacy Policy</Link>.
      </div>
      <div className="cookie-actions">
        <button className="btn btn-ghost btn-small" onClick={() => choose('denied')}>
          Reject non-essential
        </button>
        <button className="btn btn-primary btn-small" onClick={() => choose('granted')}>
          Accept
        </button>
      </div>
    </div>
  );
}
