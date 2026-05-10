import { useEffect, useMemo, useState } from 'react';
import { stageToFillPercent } from '@/lib/generateProgressUi';

interface Props {
  active: boolean;
  /** True once POST /generate completed (success or error). */
  finished: boolean;
  /** Latest stage from GET /generate/progress (subprocess progress file). */
  stage?: string | null;
}

/**
 * Progress reflects **pipeline stage** from the backend (not wall-clock time).
 * Early stages use an indeterminate sweep; later stages use a higher fill percent.
 */
export default function LoadingBar({ active, finished, stage }: Props) {
  const [opacity, setOpacity] = useState(1);
  const { percent, indeterminate } = useMemo(() => stageToFillPercent(stage ?? undefined), [stage]);

  useEffect(() => {
    if (!finished) return;
    const fadeId = window.setTimeout(() => setOpacity(0), 400);
    const resetId = window.setTimeout(() => setOpacity(1), 800);
    return () => {
      window.clearTimeout(fadeId);
      window.clearTimeout(resetId);
    };
  }, [finished]);

  const widthPct = finished ? 100 : percent;

  return (
    <div
      id="loadingBar"
      className="loading-bar-track"
      aria-hidden={!active}
    >
      <div
        className={`loading-bar-fill${indeterminate && !finished ? ' loading-bar-fill--indeterminate' : ''}`}
        style={{
          width: indeterminate && !finished ? undefined : `${widthPct}%`,
          opacity,
          transition: 'width 0.35s ease-out, opacity 0.3s',
        }}
      />
    </div>
  );
}
