import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';
import Footer from './Footer';
import CursorEffects from './CursorEffects';

export default function Layout() {
  return (
    <div className="app-shell">
      <div id="background" aria-hidden />
      <div id="overlay" aria-hidden />

      <Navigation />

      <main id="contentContainer" className="app-main">
        <Outlet />
        <Footer />
      </main>

      <CursorEffects />
    </div>
  );
}
