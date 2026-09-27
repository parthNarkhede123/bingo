// Privacy Policy. Required for Google AdSense and general compliance.
// IMPORTANT: replace CONTACT_EMAIL with a real address you monitor before
// submitting the site to AdSense.
const CONTACT_EMAIL = 'REPLACE_ME@example.com';
const LAST_UPDATED = 'September 2026';

export default function Privacy() {
  return (
    <div className="legal">
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: {LAST_UPDATED}</p>

      <p>
        Bingo Arena ("we", "us") operates this website, a free online
        multiplayer Bingo game. This policy explains what we collect, why, and
        your choices.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account data:</strong> your username and email address, and a securely hashed (never plaintext) password.</li>
        <li><strong>Gameplay data:</strong> your rating, wins, losses, draws, and match history, used for ranking and the leaderboard.</li>
        <li><strong>Technical data:</strong> your IP address and basic connection metadata, used only to rate-limit abuse and keep the service secure. We do not sell this.</li>
      </ul>

      <h2>Cookies and local storage</h2>
      <ul>
        <li><strong>Strictly necessary:</strong> a login token stored in your browser so you stay signed in. The game does not work without it.</li>
        <li><strong>Advertising (optional):</strong> if you accept cookies, Google AdSense may set cookies to show and measure ads. If you reject, ads are not loaded.</li>
      </ul>

      <h2>Advertising</h2>
      <p>
        We show ads through Google AdSense to keep the game free. Google and its
        partners may use cookies to serve ads based on your prior visits to this
        and other websites. You can manage or opt out of personalized ads via
        {' '}<a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">Google Ads Settings</a>{' '}
        and learn more at{' '}
        <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer">Google's advertising policy</a>.
      </p>

      <h2>How we use your data</h2>
      <p>
        To run your account, match you with opponents, maintain rankings and the
        leaderboard, keep the service secure, and (with consent) show ads. We do
        not sell your personal data.
      </p>

      <h2>Data retention and your rights</h2>
      <p>
        We keep account and match data while your account exists. You may request
        access to, correction of, or deletion of your data by contacting us at{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Depending on your
        location, you may have additional rights under laws such as the GDPR or
        CCPA.
      </p>

      <h2>Children</h2>
      <p>
        This service is not directed to children under 13, and we do not
        knowingly collect their data.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy? Email{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </div>
  );
}
