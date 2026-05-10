import { useEffect, useRef, useState } from 'react';
import ChessForm from '@/components/ChessForm';
import ChessQuotes from '@/components/ChessQuotes';
import ResultsView from '@/components/ResultsView';
import { ApiError, generateStats } from '@/lib/api';
import type { StatsResponse } from '@/types/stats';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function HomePage() {
  const defaultYear = String(new Date().getFullYear());
  const [username, setUsername] = useState('');
  const [year, setYear] = useState(defaultYear);
  const [status, setStatus] = useState<Status>('idle');
  const [data, setData] = useState<StatsResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [elapsed, setElapsed] = useState(0);
  const [submittedYear, setSubmittedYear] = useState(defaultYear);
  const [requestSettled, setRequestSettled] = useState(false);

  const elapsedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current !== null) {
        window.clearInterval(elapsedTimerRef.current);
      }
    };
  }, []);

  async function handleGenerate(usernameIn: string, yearIn: string) {
    setStatus('loading');
    setRequestSettled(false);
    setData(null);
    setErrorMessage('');
    setElapsed(0);
    setSubmittedYear(yearIn);

    const startedAt = Date.now();
    elapsedTimerRef.current = window.setInterval(() => {
      setElapsed((Date.now() - startedAt) / 1000);
    }, 100);

    try {
      const result = await generateStats(usernameIn.trim(), yearIn);
      setData(result);
      setStatus('success');
    } catch (err) {
      console.error('generate failed:', err);
      const message =
        err instanceof ApiError
          ? err.message
          : 'Something went wrong. Check your connection and try again.';
      setErrorMessage(message);
      setStatus('error');
    } finally {
      setRequestSettled(true);
      if (elapsedTimerRef.current !== null) {
        window.clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    }
  }

  const isLoading = status === 'loading';

  return (
    <div id="home-page" className="page-content active">
      <div className="main-entry">
        <ChessForm
          username={username}
          year={year}
          loading={isLoading}
          requestSettled={requestSettled}
          elapsedSeconds={elapsed}
          onUsernameChange={setUsername}
          onYearChange={setYear}
          onSubmit={(u, y) => {
            setUsername(u);
            setYear(y);
            void handleGenerate(u, y);
          }}
        />

        <ChessQuotes active={isLoading} />

        {status === 'error' && (
          <div className="home-error-panel" role="alert">
            <p className="error">{errorMessage}</p>
          </div>
        )}

        {status === 'success' && data && <ResultsView data={data} year={submittedYear} />}
      </div>
    </div>
  );
}
