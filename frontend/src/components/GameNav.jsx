import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/keep', label: 'Keep', icon: '🏰' },
  { to: '/map', label: 'Map', icon: '🗺️' },
  { to: '/barracks', label: 'Barracks', icon: '⚔️' },
  { to: '/trade', label: 'Trade', icon: '🤝' },
  { to: '/war-room', label: 'War Room', icon: '📯' },
  { to: '/reports', label: 'Reports', icon: '📜' },
];

// Sub-navigation for the in-game screens. Horizontally scrollable on phones.
export default function GameNav() {
  return (
    <nav className="game-nav">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => `game-nav__tab${isActive ? ' is-active' : ''}`}>
          <span className="game-nav__icon" aria-hidden="true">{t.icon}</span>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
