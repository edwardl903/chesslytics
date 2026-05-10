import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

interface NavItem {
  to: string;
  label: string;
  comingSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Year in Review' },
  { to: '/opening-analyzer', label: 'Opening Analyzer', comingSoon: true },
  { to: '/progress-tracker', label: 'Progress Tracker', comingSoon: true },
  { to: '/game-analyzer', label: 'Game Analyzer', comingSoon: true },
  { to: '/about', label: 'About' },
];

const MOBILE_QUERY = '(max-width: 900px)';

export default function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const apply = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) setMobileMenuOpen(false);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  return (
    <nav id="navigation" className="site-nav" aria-label="Main">
      <div className="site-nav-inner">
        <NavLink to="/" className="site-nav-brand" end onClick={() => setMobileMenuOpen(false)}>
          <img src="/static/gift2.png" alt="" className="site-nav-logo" width={40} height={40} />
          <span className="site-nav-title">ChessLytics</span>
        </NavLink>

        {isMobile ? (
          <>
            <button
              type="button"
              className="site-nav-burger"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-drawer"
              onClick={() => setMobileMenuOpen((o) => !o)}
            >
              <span className="visually-hidden">{mobileMenuOpen ? 'Close menu' : 'Open menu'}</span>
              <span className="site-nav-burger-bar" aria-hidden />
              <span className="site-nav-burger-bar" aria-hidden />
              <span className="site-nav-burger-bar" aria-hidden />
            </button>
            {mobileMenuOpen && (
              <>
                <button
                  type="button"
                  className="site-nav-backdrop"
                  aria-label="Close menu"
                  onClick={() => setMobileMenuOpen(false)}
                />
                <div id="mobile-nav-drawer" className="site-nav-drawer">
                  <ul className="site-nav-drawer-list">
                    {NAV_ITEMS.map((item) => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.to === '/'}
                          className={({ isActive }) =>
                            `site-nav-drawer-link${isActive ? ' active' : ''}`
                          }
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          {item.label}
                          {item.comingSoon && (
                            <span className="nav-badge" title="Work in progress">
                              Soon
                            </span>
                          )}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </>
        ) : (
          <ul className="site-nav-links">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `nav-link site-nav-link${isActive ? ' active' : ''}`}
                >
                  {item.label}
                  {item.comingSoon && (
                    <span className="nav-badge" title="Work in progress">
                      Soon
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </nav>
  );
}
