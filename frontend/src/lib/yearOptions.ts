import { ALL_GAMES_YEAR_VALUE } from '@/lib/yearLabel';

/**
 * Single-calendar-year options plus **All time** (full archive via backend `ALL` / `0000`).
 * Year values match what Flask passes to `tests/testing.py`.
 */
export function buildChessWrappedYearOptions(minYear = 2015): Array<{ value: string; label: string }> {
  const maxYear = new Date().getFullYear();
  const years: Array<{ value: string; label: string }> = [
    { value: ALL_GAMES_YEAR_VALUE, label: 'All time' },
  ];
  for (let y = maxYear; y >= minYear; y--) {
    const s = String(y);
    years.push({ value: s, label: s });
  }
  return years;
}
