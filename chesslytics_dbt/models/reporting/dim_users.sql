{{
    config(materialized='table')
}}

/*
  Dimension table: one row per unique Chess.com username.

  Builds a set of latest/aggregate stats per user so BI tools don't
  need to aggregate fct_games themselves for simple "current rating"
  type lookups.
*/

WITH all_usernames AS (

    -- All usernames that appear as either player in any game
    SELECT DISTINCT white_username AS username FROM {{ ref('stg_raw_games') }}
    UNION DISTINCT
    SELECT DISTINCT black_username AS username FROM {{ ref('stg_raw_games') }}

),

latest_game_stats AS (

    SELECT
        my_username                         AS username,
        MAX(game_date)                      AS last_game_date,
        MIN(game_date)                      AS first_game_date,
        COUNT(DISTINCT game_date)           AS active_days,
        COUNT(*)                            AS total_games,
        COUNTIF(outcome = 'win')            AS total_wins,
        COUNTIF(outcome = 'lose')           AS total_losses,
        COUNTIF(outcome = 'draw')           AS total_draws,

        -- Latest rating — rating on the most recent game day
        MAX_BY(my_rating, game_end_timestamp) AS current_rating,
        MAX(my_rating)                      AS peak_rating,
        MIN(my_rating)                      AS lowest_rating

    FROM {{ ref('int_player_games') }}
    WHERE my_username IS NOT NULL
    GROUP BY my_username

),

time_class_stats AS (

    SELECT
        my_username AS username,
        COUNTIF(time_class = 'blitz')  AS blitz_games,
        COUNTIF(time_class = 'rapid')  AS rapid_games,
        COUNTIF(time_class = 'bullet') AS bullet_games,
        COUNTIF(time_class = 'daily')  AS daily_games
    FROM {{ ref('int_player_games') }}
    WHERE my_username IS NOT NULL
    GROUP BY my_username

)

SELECT
    {{ dbt_utils.generate_surrogate_key(['au.username']) }} AS user_key,
    au.username,

    -- Stats from latest game records
    COALESCE(lgs.current_rating, 0)   AS current_rating,
    COALESCE(lgs.peak_rating, 0)      AS peak_rating,
    COALESCE(lgs.lowest_rating, 0)    AS lowest_rating,
    COALESCE(lgs.last_game_date,  DATE('1970-01-01')) AS last_game_date,
    COALESCE(lgs.first_game_date, DATE('1970-01-01')) AS first_game_date,
    COALESCE(lgs.active_days, 0)      AS active_days,
    COALESCE(lgs.total_games, 0)      AS total_games,
    COALESCE(lgs.total_wins, 0)       AS total_wins,
    COALESCE(lgs.total_losses, 0)     AS total_losses,
    COALESCE(lgs.total_draws, 0)      AS total_draws,

    -- Win rate (avoid division by zero)
    CASE
        WHEN COALESCE(lgs.total_games, 0) = 0 THEN NULL
        ELSE ROUND(COALESCE(lgs.total_wins, 0) / lgs.total_games, 4)
    END AS win_rate,

    -- Time class breakdown
    COALESCE(tcs.blitz_games,  0) AS blitz_games,
    COALESCE(tcs.rapid_games,  0) AS rapid_games,
    COALESCE(tcs.bullet_games, 0) AS bullet_games,
    COALESCE(tcs.daily_games,  0) AS daily_games,

    CURRENT_TIMESTAMP() AS updated_at

FROM all_usernames au
LEFT JOIN latest_game_stats lgs ON au.username = lgs.username
LEFT JOIN time_class_stats tcs  ON au.username = tcs.username
