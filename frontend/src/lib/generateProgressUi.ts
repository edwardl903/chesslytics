import type { GenerateProgressPayload } from '@/types/generateProgress';

/** User-facing status line from polled backend progress. */
export function progressLabel(p: GenerateProgressPayload | null): string {
  if (!p?.stage) return 'Working…';
  const n = p.games != null ? p.games.toLocaleString() : null;
  switch (p.stage) {
    case 'starting':
      return 'Starting…';
    case 'fetching':
      return 'Fetching games from Chess.com…';
    case 'processing_games':
      return n != null ? `Analyzing ${n} games…` : 'Analyzing games…';
    case 'cleaning':
      return n != null ? `Cleaning and filtering ${n} games…` : 'Cleaning game data…';
    case 'statistics':
      return n != null ? `Computing statistics (${n} games)…` : 'Computing statistics…';
    case 'charts':
      return 'Building charts…';
    case 'uploading':
      return 'Syncing to analytics…';
    default:
      return 'Working…';
  }
}

/**
 * Map backend stage to bar fill. Early stages are indeterminate; later stages
 * climb so the bar reflects "almost done" without claiming false time estimates.
 */
export function stageToFillPercent(stage: string | undefined): {
  percent: number;
  indeterminate: boolean;
} {
  if (!stage) return { percent: 10, indeterminate: true };
  if (stage === 'starting' || stage === 'fetching') {
    return { percent: 12, indeterminate: true };
  }

  const map: Record<string, number> = {
    processing_games: 42,
    cleaning: 55,
    statistics: 68,
    charts: 82,
    uploading: 92,
  };
  const p = map[stage];
  if (p === undefined) return { percent: 28, indeterminate: true };
  return { percent: p, indeterminate: false };
}
