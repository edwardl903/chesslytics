/** Matches JSON written by `src/data/generate_progress.py` during POST /generate. */
export interface GenerateProgressPayload {
  stage?: string;
  games?: number;
  username?: string;
  year?: string;
}
