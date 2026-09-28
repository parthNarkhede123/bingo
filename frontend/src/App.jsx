import { Routes, Route, Navigate, Link } from 'react-router-dom';
import Navbar from './components/Navbar';
import GameLayout from './components/GameLayout';
import Toasts from './components/Toasts';
import CookieConsent from './components/CookieConsent';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Leaderboard from './pages/Leaderboard';
import Profile from './pages/Profile';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Keep from './pages/Keep';
import MapPage from './pages/Map';
import Barracks from './pages/Barracks';
import Trade from './pages/Trade';
import WarRoom from './pages/WarRoom';
import Reports from './pages/Reports';

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <Toasts />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/profile/:username" element={<Profile />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />

          {/* In-game screens — auth-gated, wrapped in the game shell (sub-nav + resource bar). */}
          <Route element={<GameLayout />}>
            <Route path="/keep" element={<Keep />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/barracks" element={<Barracks />} />
            <Route path="/trade" element={<Trade />} />
            <Route path="/war-room" element={<WarRoom />} />
            <Route path="/reports" element={<Reports />} />
          </Route>

          {/* Stale Bingo links → the Keep. */}
          <Route path="/play" element={<Navigate to="/keep" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <span>Ironhold · The Siege Week — a light browser strategy game</span>
        <span className="footer-links">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </span>
        <span className="muted">Play responsibly. No real-money gambling.</span>
      </footer>
      <CookieConsent />
    </div>
  );
}
