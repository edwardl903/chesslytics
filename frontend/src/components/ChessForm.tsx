import { useEffect, useMemo, useRef, useState } from 'react';
import { EXAMPLE_CHESSCOM_PLAYERS } from '@/lib/exampleChesscomPlayers';
import { buildChessWrappedYearOptions } from '@/lib/yearOptions';
import { fetchGenerateProgress } from '@/lib/api';
import { progressLabel } from '@/lib/generateProgressUi';
import type { GenerateProgressPayload } from '@/types/generateProgress';
import LoadingBar from './LoadingBar';

interface Props {
  username: string;
  year: string;
  loading: boolean;
  /** True once a request cycle finished (success or error), for loading bar snap */
  requestSettled: boolean;
  elapsedSeconds: number;
  onUsernameChange: (value: string) => void;
  onYearChange: (value: string) => void;
  /** Called with trimmed username and selected year after validation */
  onSubmit: (username: string, year: string) => void;
}

export default function ChessForm({
  username,
  year,
  loading,
  requestSettled,
  elapsedSeconds,
  onUsernameChange,
  onYearChange,
  onSubmit,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [progress, setProgress] = useState<GenerateProgressPayload | null>(null);

  const yearOptions = useMemo(() => buildChessWrappedYearOptions(2015), []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!loading) {
      setProgress(null);
      return;
    }
    const uname = username.trim();
    const yr = year;
    let cancelled = false;

    const poll = async () => {
      const p = await fetchGenerateProgress(uname, yr);
      if (!cancelled && p !== null) {
        setProgress(p);
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 400);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [loading, username, year]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameError('Enter your Chess.com username.');
      return;
    }
    setUsernameError(null);
    if (!year) {
      setUsernameError('Select a year.');
      return;
    }
    onUsernameChange(trimmed);
    onSubmit(trimmed, year);
  }

  const barFinished = !loading && requestSettled;
  const statusLine = progressLabel(progress);

  return (
    <div className="chess-form-root">
      <form onSubmit={handleSubmit} className="chess-form" noValidate>
        <img
          src="/static/gift2.png"
          alt=""
          className="chess-form-hero-img"
          width={120}
          height={120}
        />

        <div className="chess-form-heading">
          <div className="chess-form-title-row">
            <h1 className="chess-form-title">ChessLytics: Chess Wrapped</h1>
            <div className="chess-form-year-shell">
              <label htmlFor="yearSelect" className="visually-hidden">
                Year
              </label>
              <select
                id="yearSelect"
                value={year}
                onChange={(e) => onYearChange(e.target.value)}
                disabled={loading}
                className="chess-form-year-select"
              >
                {yearOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="chess-form-subtitle">Enter your Chess.com username</p>
        </div>

        {!loading && (
          <div className="chess-form-examples" aria-label="Example Chess.com players">
            <p className="chess-form-examples-label">Try a famous player</p>
            <div className="chess-form-example-chips">
              {EXAMPLE_CHESSCOM_PLAYERS.map(({ username: u, label }) => (
                <button
                  key={u}
                  type="button"
                  className="chess-form-example-chip"
                  onClick={() => {
                    setUsernameError(null);
                    onUsernameChange(u);
                    inputRef.current?.focus();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <label htmlFor="username" className="visually-hidden">
          Chess.com username
        </label>
        <input
          ref={inputRef}
          type="text"
          id="username"
          name="username"
          autoComplete="username"
          inputMode="text"
          spellCheck={false}
          value={username}
          onChange={(e) => {
            setUsernameError(null);
            onUsernameChange(e.target.value);
          }}
          placeholder="e.g. Hikaru"
          aria-invalid={usernameError ? 'true' : 'false'}
          aria-describedby={usernameError ? 'username-error' : undefined}
          disabled={loading}
          className="chess-form-input"
        />
        {usernameError && (
          <p id="username-error" className="chess-form-field-error" role="alert">
            {usernameError}
          </p>
        )}

        <div className="chess-form-cta-shell">
          <button id="submitBtn" type="submit" className="cta-button" disabled={loading}>
            <span id="submitBtnText">
              {loading ? 'Generating…' : 'Generate Chess Analytics'}
            </span>
            {loading && (
              <span id="submitBtnSpinner" className="cta-spinner" aria-hidden style={{ display: 'inline-block' }} />
            )}
          </button>

          {loading && (
            <div className="chess-form-loading-meta">
              <p className="chess-form-loading-text" aria-live="polite">
                <span>{statusLine}</span>{' '}
                <span className="chess-form-elapsed">{elapsedSeconds.toFixed(1)}s</span>
              </p>
              <LoadingBar active={loading} finished={barFinished} stage={progress?.stage ?? null} />
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
