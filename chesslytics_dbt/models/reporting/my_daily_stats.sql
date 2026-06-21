{{
    config(materialized='table')
}}

/*
  Portfolio summary model: pre-aggregated daily stats for EdwardL903.
  Rebuilt completely on each dbt run — small enough (~1-2k rows) that
  incremental is not worth the complexity.

  Designed for direct portfolio API reads. Each section is a separate
  CTE clearly named for what the portfolio chart needs.
*/

-- ── 1. Daily stats per time class ────────────────────────────────────────────
WITH daily AS (

    SELECT
        game_date,
        game_year,
        game_month,
        time_class,
        COUNT(*)                                        AS games_played,
        COUNTIF(outcome = 'win')                        AS wins,
        COUNTIF(outcome = 'lose')                       AS losses,
        COUNTIF(outcome = 'draw')                       AS draws,
        {{ win_rate('COUNTIF(outcome = \'win\')', 'COUNT(*)') }} AS win_rate,
        MAX_BY(my_rating, game_end_timestamp)           AS closing_rating,
        MAX(my_rating)                                  AS day_peak_rating,
        MIN(my_rating)                                  AS day_low_rating,
        AVG(my_accuracy)                                AS avg_accuracy,
        MAX(game_end_timestamp)                         AS last_game_at

    FROM {{ ref('fct_my_games') }}
    GROUP BY game_date, game_year, game_month, time_class

),

-- ── 2. Running totals (cumulative) ────────────────────────────────────────────
cumulative AS (

    SELECT
        *,

        SUM(games_played) OVER (
            PARTITION BY time_class
            ORDER BY game_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS total_games,

        SUM(wins) OVER (
            PARTITION BY time_class
            ORDER BY game_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS total_wins,

        MAX(day_peak_rating) OVER (
            PARTITION BY time_class
            ORDER BY game_date
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS peak_rating_ever

    FROM daily

),

-- ── 3. Win/loss streaks ───────────────────────────────────────────────────────
-- Step 1: detect when outcome changes vs previous game
game_outcomes AS (

    SELECT
        game_date,
        time_class,
        outcome,
        game_end_timestamp,
        CASE
            WHEN outcome != LAG(outcome) OVER (
                PARTITION BY time_class ORDER BY game_end_timestamp
            ) THEN 1
            ELSE 0
        END AS outcome_changed

    FROM {{ ref('fct_my_games') }}

),

-- Step 2: cumulative sum of changes = streak group id
game_streaks AS (

    SELECT
        game_date,
        time_class,
        outcome,
        game_end_timestamp,
        SUM(outcome_changed) OVER (
            PARTITION BY time_class ORDER BY game_end_timestamp
        ) AS streak_group

    FROM game_outcomes

),

streak_lengths AS (

    SELECT
        time_class,
        outcome,
        streak_group,
        COUNT(*) AS streak_length,
        MIN(game_date) AS streak_start,
        MAX(game_date) AS streak_end

    FROM game_streaks
    GROUP BY time_class, outcome, streak_group

),

best_streaks AS (

    SELECT
        time_class,
        MAX(CASE WHEN outcome = 'win'  THEN streak_length END) AS longest_win_streak,
        MAX(CASE WHEN outcome = 'lose' THEN streak_length END) AS longest_loss_streak

    FROM streak_lengths
    GROUP BY time_class

),

-- Current streak: last unbroken run of same outcome
current_streak_base AS (

    SELECT
        time_class,
        outcome,
        streak_group,
        streak_length,
        streak_end

    FROM streak_lengths

    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY time_class
        ORDER BY streak_end DESC
    ) = 1

),

-- ── 4. Top openings by win rate ────────────────────────────────────────────────
top_openings AS (

    SELECT
        time_class,
        my_opening,
        COUNT(*)                                        AS games_played,
        COUNTIF(outcome = 'win')                        AS wins,
        {{ win_rate('COUNTIF(outcome = \'win\')', 'COUNT(*)') }} AS win_rate,
        ROW_NUMBER() OVER (
            PARTITION BY time_class
            ORDER BY COUNTIF(outcome = 'win') / COUNT(*) DESC, COUNT(*) DESC
        ) AS rn

    FROM {{ ref('fct_my_games') }}
    WHERE my_opening != 'N/A' AND my_opening IS NOT NULL
    GROUP BY time_class, my_opening
    HAVING COUNT(*) >= 5

),

-- ── 5. Recent games (last 10 per time class) ──────────────────────────────────
recent_games AS (

    SELECT
        time_class,
        game_date,
        game_end_timestamp,
        outcome,
        my_result,
        my_rating,
        opp_username,
        opp_rating,
        rating_diff,
        my_opening,
        my_accuracy,
        ROW_NUMBER() OVER (
            PARTITION BY time_class
            ORDER BY game_end_timestamp DESC
        ) AS rn

    FROM {{ ref('fct_my_games') }}

)

-- ── Final output: one row per (date × time_class) with all enrichments ─────────
SELECT
    c.game_date,
    c.game_year,
    c.game_month,
    c.time_class,

    -- Daily counts
    c.games_played,
    c.wins,
    c.losses,
    c.draws,
    c.win_rate,

    -- Rating
    c.closing_rating,
    c.day_peak_rating,
    c.day_low_rating,
    c.avg_accuracy,
    c.peak_rating_ever,

    -- Cumulative
    c.total_games,
    c.total_wins,

    -- Streaks
    bs.longest_win_streak,
    bs.longest_loss_streak,
    cs.outcome          AS current_streak_outcome,
    cs.streak_length    AS current_streak_length,

    c.last_game_at,
    CURRENT_TIMESTAMP() AS updated_at

FROM cumulative c
LEFT JOIN best_streaks bs
    ON c.time_class = bs.time_class
LEFT JOIN current_streak_base cs
    ON c.time_class = cs.time_class
