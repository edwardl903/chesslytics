import { Route, Routes } from 'react-router-dom';
import Layout from '@/components/Layout';
import ErrorBoundary from '@/components/ErrorBoundary';
import HomePage from '@/pages/HomePage';
import OpeningAnalyzerPage from '@/pages/OpeningAnalyzerPage';
import ProgressTrackerPage from '@/pages/ProgressTrackerPage';
import GameAnalyzerPage from '@/pages/GameAnalyzerPage';
import AboutPage from '@/pages/AboutPage';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="/opening-analyzer" element={<OpeningAnalyzerPage />} />
          <Route path="/progress-tracker" element={<ProgressTrackerPage />} />
          <Route path="/game-analyzer" element={<GameAnalyzerPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="*" element={<HomePage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
