// Terms of Service.
const CONTACT_EMAIL = 'ironhold.game.support@gmail.com';
const LAST_UPDATED = 'September 2026';

export default function Terms() {
  return (
    <div className="legal">
      <h1>Terms of Service</h1>
      <p className="muted">Last updated: {LAST_UPDATED}</p>

      <p>
        By creating an account or playing Ironhold, you agree to these terms.
        If you do not agree, please do not use the service.
      </p>

      <h2>The service</h2>
      <p>
        Ironhold is a free, for-entertainment online multiplayer strategy game
        with week-long seasons, rankings and a leaderboard. There is <strong>no real-money
        gambling, wagering, or cash prizes</strong>. Conquest Points, gems and standings have no monetary value.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You are responsible for activity under your account and for keeping your password safe.</li>
        <li>Provide accurate registration information and one account per person.</li>
        <li>We may suspend accounts that cheat, abuse, or disrupt the service.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        Do not attempt to hack, overload, reverse-engineer for abuse, automate,
        or otherwise interfere with the game or other players. Do not use
        offensive usernames.
      </p>

      <h2>Availability</h2>
      <p>
        The service is provided "as is" and "as available", without warranties.
        It runs on free hosting tiers and may be slow, interrupted, or reset. We
        are not liable for any loss arising from use of the service to the extent
        permitted by law.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms; continued use after changes means you accept
        them.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </div>
  );
}
