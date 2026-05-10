/** POST /generate body value for full Chess.com archive (all years). */
export const ALL_GAMES_YEAR_VALUE = 'ALL';

export function isAllGamesYear(year: string): boolean {
  const u = year.trim().toUpperCase();
  return u === ALL_GAMES_YEAR_VALUE || u === '0000';
}

/** Headline text for the wrapped banner (e.g. ProfileHeader). */
export function formatWrappedBannerYear(year: string): string {
  if (isAllGamesYear(year)) return 'ALL TIME';
  return year;
}

/** Share dialog / human-readable year phrase. */
export function formatWrappedYearPhrase(year: string): string {
  if (isAllGamesYear(year)) return 'All time';
  return year;
}

/** Safe segment for download/share filenames. */
export function formatWrappedYearFilename(year: string): string {
  if (isAllGamesYear(year)) return 'AllTime';
  return year;
}
