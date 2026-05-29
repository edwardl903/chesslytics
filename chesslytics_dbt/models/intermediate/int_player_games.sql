{{
    config(materialized='table')
}}

/*
  Intermediate model: player-perspective game data.

  Design decision — UNION instead of var('username'):
    Using a runtime variable would require a separate dbt run per user,
    making the model unusable for multi-user dashboards. Instead we
    UNION ALL white and black rows so every game appears once from each
    player's perspective. Looker (or any BI tool) then filters by
    my_username. Grain: one row per (game_id, player).

  Responsibilities:
    - Player-perspective columns (my_*, opp_*)
    - Outcome classification (win / draw / lose)
    - ECO / opening extraction from PGN
    - Rating difference calculation
    - username_year label (used by Looker filter)
*/

WITH white_pov AS (

    SELECT
        game_id,
        game_url,
        game_end_timestamp,
        game_date,
        game_year,
        game_month,
        game_day,
        game_hour,
        game_day_of_week,
        game_weekday_name,
        time_class,
        raw_time_control,
        rules,
        rated,
        pgn,
        final_fen,
        initial_setup,
        uploaded_at,
        loaded_by_user,

        -- player perspective
        white_username     AS my_username,
        'white'            AS my_color,
        white_rating       AS my_rating,
        white_result       AS my_result,
        white_accuracy     AS my_accuracy,
        black_username     AS opp_username,
        black_rating       AS opp_rating,
        black_result       AS opp_result,
        black_accuracy     AS opp_accuracy

    FROM {{ ref('stg_raw_games') }}

),

black_pov AS (

    SELECT
        game_id,
        game_url,
        game_end_timestamp,
        game_date,
        game_year,
        game_month,
        game_day,
        game_hour,
        game_day_of_week,
        game_weekday_name,
        time_class,
        raw_time_control,
        rules,
        rated,
        pgn,
        final_fen,
        initial_setup,
        uploaded_at,
        loaded_by_user,

        -- player perspective
        black_username     AS my_username,
        'black'            AS my_color,
        black_rating       AS my_rating,
        black_result       AS my_result,
        black_accuracy     AS my_accuracy,
        white_username     AS opp_username,
        white_rating       AS opp_rating,
        white_result       AS opp_result,
        white_accuracy     AS opp_accuracy

    FROM {{ ref('stg_raw_games') }}

),

combined AS (

    SELECT * FROM white_pov
    UNION ALL
    SELECT * FROM black_pov

),

/*
  Draw result vocabulary from Chess.com API (matches Python DRAW_RESULTS set
  in src/data/processor.py so logic stays in sync).
*/
with_outcome AS (

    SELECT
        *,

        CASE
            WHEN my_result = 'win'
                THEN 'win'
            WHEN my_result IN (
                'draw', 'stalemate', 'repetition', 'insufficient',
                'timevsinsufficient', 'agreed', '50move'
            )
                THEN 'draw'
            ELSE 'lose'
        END AS outcome,

        (my_rating - opp_rating) AS rating_diff

    FROM combined

),

/*
  ECO / opening extraction from PGN.

  The PGN contains a tag like:
    [ECOUrl "https://www.chess.com/openings/Sicilian-Defense"]

  We extract the slug, then truncate at the first major keyword so
  "Sicilian-Defense-Najdorf-Variation" → "Sicilian-Defense".
  This mirrors the truncate_eco() + update_opening() logic in
  src/data/processor.py clean_dataframe().
*/
with_eco AS (

    SELECT
        *,

        -- 1. Extract the slug after /openings/
        COALESCE(
            REGEXP_EXTRACT(pgn, r'\[ECOUrl "https?://[^"]+/openings/([^"]+)"\]'),
            'No-Opening'
        ) AS eco_slug_raw,

        -- 2. Truncate at the first major opening keyword
        COALESCE(
            REGEXP_EXTRACT(
                REGEXP_EXTRACT(pgn, r'\[ECOUrl "https?://[^"]+/openings/([^"]+)"\]'),
                r'^(.+?(?:Defense|Gambit|Opening|Game|Attack|System))'
            ),
            REGEXP_EXTRACT(pgn, r'\[ECOUrl "https?://[^"]+/openings/([^"]+)"\]'),
            'No Opening'
        ) AS eco

    FROM with_outcome

),

with_opening AS (

    SELECT
        *,

        -- my_opening follows the white/black convention:
        --   white plays openings WITHOUT "Defense" in the name
        --   black plays openings WITH "Defense" in the name
        --   everything else → 'N/A'
        CASE
            WHEN eco IS NULL OR eco = 'No Opening'             THEN 'N/A'
            WHEN my_color = 'white'
                 AND NOT REGEXP_CONTAINS(eco, 'Defense')       THEN eco
            WHEN my_color = 'black'
                 AND REGEXP_CONTAINS(eco, 'Defense')           THEN eco
            ELSE 'N/A'
        END AS my_opening,

        -- username_year is the primary Looker filter key
        CONCAT(
            my_username,
            '_',
            CAST(game_year AS STRING)
        ) AS username_year

    FROM with_eco

)

SELECT
    -- ── Surrogate key (grain: game × player) ─────────────────────────
    {{ dbt_utils.generate_surrogate_key(['game_id', 'my_username']) }} AS player_game_key,

    -- ── Identifiers ──────────────────────────────────────────────────
    game_id,
    game_url,

    -- ── Time ─────────────────────────────────────────────────────────
    game_end_timestamp,
    game_date,
    game_year,
    game_month,
    game_day,
    game_hour,
    game_day_of_week,
    game_weekday_name,

    -- ── Game settings ────────────────────────────────────────────────
    time_class,
    raw_time_control,
    rules,
    rated,

    -- ── Player perspective ────────────────────────────────────────────
    my_username,
    my_color,
    my_rating,
    my_result,
    my_accuracy,
    my_opening,
    eco,

    -- ── Opponent ─────────────────────────────────────────────────────
    opp_username,
    opp_rating,
    opp_result,
    opp_accuracy,

    -- ── Metrics ──────────────────────────────────────────────────────
    outcome,
    rating_diff,

    -- ── Dashboard key ────────────────────────────────────────────────
    username_year,

    -- ── Metadata ─────────────────────────────────────────────────────
    uploaded_at,
    loaded_by_user

FROM with_opening

WHERE my_username IS NOT NULL
