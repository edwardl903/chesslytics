-- Singular test: no game should have a date in the future.
-- A result set with rows = test failure.
-- Catches clock-skew or bad end_time values in raw_games.

SELECT
    game_id,
    game_date,
    game_end_timestamp,
    white_username,
    black_username
FROM {{ ref('stg_raw_games') }}
WHERE game_date > CURRENT_DATE()
