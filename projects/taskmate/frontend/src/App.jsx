// Root app shell: navbar, routes, auth session bootstrap, and global footer.
// ========================
// Imports
// ========================
import { useEffect, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import "./styles/Layout.css";
import { clearToken, getCurrentUser, hasToken } from "./services/api.js";
import AboutPage from "./pages/AboutPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import ContactPage from "./pages/ContactPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import ModelInfoPage from "./pages/ModelInfoPage.jsx";

export default function App() {
  // ========================
  // State and router context
  // ========================
  // Controls open/close state of the top-right menu dropdown.
  const [menuOpen, setMenuOpen] = useState(false);
  // Holds the authenticated user object when a token session exists.
  const [user, setUser] = useState(null);
  // Prevents route UI flicker while auth bootstrap is in progress.
  const [authLoading, setAuthLoading] = useState(true);
  // Router helpers for redirects and route-aware layout.
  const navigate = useNavigate();
  const location = useLocation();
  // Hide the big header on logged-in home chat view.
  const isLoggedInHome = location.pathname === "/" && Boolean(user) && !authLoading;

  // ========================
  // Effects
  // ========================
  useEffect(() => {
    // Bootstrap user from stored token once on app start.
    async function loadUser() {
      if (!hasToken()) {
        setAuthLoading(false);
        return;
      }
      try {
        const me = await getCurrentUser();
        setUser(me);
      } catch (_error) {
        clearToken();
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    }
    loadUser();
  }, []);

  // ========================
  // Event handlers
  // ========================
  // Called by login/register page once auth succeeds.
  function handleLoginSuccess(nextUser) {
    setUser(nextUser);
    navigate("/");
  }

  // Clears local auth and redirects to login.
  function handleLogout() {
    clearToken();
    setUser(null);
    navigate("/login");
  }

  // ========================
  // Render
  // ========================
  return (
    <div className="app-root">
      {/* Decorative background elements for visual depth. */}
      <div className="ambient-orb ambient-orb--one" />
      <div className="ambient-orb ambient-orb--two" />

      {/* Global top navigation shown on all pages. */}
      <nav className="top-navbar">
        <div className="top-navbar-inner">
          {/* Brand/home entry point. */}
          <Link className="brand-name" to="/">
            TaskWork
          </Link>

          <div className="top-right-actions">
            {/* Auth action toggles between login and logout by state. */}
            {user ? (
              <button className="ghost-button" type="button" onClick={handleLogout}>
                Log out ({user.name}{user.is_admin ? " • Admin" : ""})
              </button>
            ) : (
              <Link className="ghost-button" to="/login">
                Log in
              </Link>
            )}

            <div className="menu-wrap">
              {/* Hamburger menu button for secondary routes. */}
              <button
                type="button"
                className="menu-button"
                aria-label="Open menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((prev) => !prev)}
              >
                <span />
                <span />
                <span />
              </button>

              {menuOpen && (
                /* Click any menu link and collapse dropdown. */
                <nav className="menu-dropdown" onClick={() => setMenuOpen(false)}>
                  <NavLink to="/about-us">About us</NavLink>
                  <NavLink to="/model-information">Model information</NavLink>
                  <NavLink to="/contact-us">Contact us</NavLink>
                </nav>
              )}
            </div>
          </div>
        </div>
      </nav>

      <div className="app-shell">
        {/* Marketing header is hidden on logged-in main chat page only. */}
        {!isLoggedInHome ? (
          <header className="app-header">
            <div className="header-content">
              <p className="eyebrow">TaskMate</p>
              <h1>TaskMate Workspace</h1>
              <p className="subtitle">
                Workspace where you can make each task more manageable and efficient.
              </p>
            </div>
          </header>
        ) : null}

        {/* Central route map for frontend pages. */}
        <Routes>
          <Route path="/" element={<ChatPage user={user} authLoading={authLoading} />} />
          <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} />} />
          <Route path="/about-us" element={<AboutPage />} />
          <Route path="/model-information" element={<ModelInfoPage />} />
          <Route path="/contact-us" element={<ContactPage />} />
        </Routes>
      </div>

      {/* Global footer shown across all routes. */}
      <footer className="global-footer">
        <div className="global-footer-inner">
          <p>Email: sudiplaudari@gmail.com</p>
          <p>Address: 221 Horizon Avenue, Suite 404, Sydney, NSW 2000</p>
        </div>
      </footer>
    </div>
  );
}
