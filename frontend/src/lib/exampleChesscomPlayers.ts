/**
 * Famous Chess.com accounts for quick-try on the home form.
 * Usernames are public profile handles (case-insensitive on Chess.com).
 */
export interface ExampleChesscomPlayer {
  /** Chess.com username to fetch */
  username: string;
  /** Short label on the chip */
  label: string;
}

export const EXAMPLE_CHESSCOM_PLAYERS: ExampleChesscomPlayer[] = [
  { username: 'Hikaru', label: 'Hikaru' },
  { username: 'GothamChess', label: 'GothamChess' },
  { username: 'DanielNaroditsky', label: 'Naroditsky' },
  { username: 'Anna_Chess', label: 'Anna Cramling' },
  { username: 'MagnusCarlsen', label: 'Magnus Carlsen' },
  { username: 'Firouzja2003', label: 'Alireza Firouzja' },
  { username: 'FabianoCaruana', label: 'Fabiano Caruana' },
  { username: 'PolgarJudit', label: 'Judit Polgár' },
];
