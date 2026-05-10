// TypeScript types for the JSON returned by `POST /generate`.
// These mirror the dictionary built in app.py and the per-user statistics
// produced by tests/testing.py and src/data/processor.total_statistics().

export interface TotalTimeSpent {
  years: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total_time: string;
  total_time_in_days: number;
  total_time_in_hours: number;
  total_time_in_minutes: number;
  total_time_in_seconds: number;
  percentage_of_year: number;
}

export interface WinDrawLoss {
  win: number;
  draw: number;
  lose: number;
}

// Pandas-orient='dict'-style: column -> { rowIndex: value }.
export interface OpponentTable {
  Opponent: Record<string, string>;
  Games_Played: Record<string, number>;
}

export interface TimeControlTable {
  Time_Control: Record<string, string>;
  Games_Played: Record<string, number>;
}

export interface HighestRating {
  rating: number;
  time_control: string;
  date: string;
}

export interface MostTimeSpentDay {
  date: string;
  time_spent: string;
}

export interface OpeningPair {
  white_opening: string;
  black_opening: string;
}

export interface BiggestGameBase {
  opp_username: string;
  opp_rating: number;
  time_class: string;
  date: string;
  link: string;
}

export interface BiggestGameWithMoves extends BiggestGameBase {
  my_num_moves: number;
}

export interface BiggestGameWithTimeSpent extends BiggestGameBase {
  time_spent: number;
}

export interface BiggestGameWithCheckmate extends BiggestGameBase {
  time_spent: number;
  my_num_moves: number;
}

export interface BiggestGameWithMyTimeLeft extends BiggestGameBase {
  my_time_left: number;
}

export interface BiggestGameWithOppTimeLeft extends BiggestGameBase {
  opp_time_left: number;
}

export interface BiggestGames {
  victory: BiggestGameBase;
  upset: BiggestGameBase;
  checkmate: BiggestGameWithCheckmate;
  opponent: BiggestGameBase;
  longest: BiggestGameWithTimeSpent;
  moves: BiggestGameWithMoves;
  least_time_won: BiggestGameWithMyTimeLeft;
  least_time_lost: BiggestGameWithOppTimeLeft;
}

export interface RatingPoint {
  date: string;
  // The backend writes "N/A" when no games exist in a time class.
  my_rating: number | string;
}

export type LastGameRatings = Record<string, RatingPoint[]>;

export interface EmbedConfig {
  dashboard_id: string;
  filters: {
    username_year?: string;
    [key: string]: string | undefined;
  };
  user_attributes?: Record<string, string>;
}

export interface StatsResponse {
  images: string[];
  my_avatar: string;
  my_username: string;
  total_time_spent: TotalTimeSpent;
  total_moves: number;
  total_win_draw_loss: WinDrawLoss;
  total_results: Record<string, number>;
  total_en_passant: number;
  total_promotions: number;
  total_games: number;
  longest_winning_streak: number;
  longest_losing_streak: number;
  most_played_opponent: OpponentTable;
  highest_rating: HighestRating;
  most_time_spent_day_dict: MostTimeSpentDay;
  my_openings: OpeningPair;
  timecontrol_counts: TimeControlTable;
  timeclass_counts: Record<string, number>;
  biggest_games: BiggestGames;
  last_game_ratings: LastGameRatings;
  personalized_dashboard_url: string | null;
  embed_config: EmbedConfig | null;
}

export interface ErrorResponse {
  error: string;
}
