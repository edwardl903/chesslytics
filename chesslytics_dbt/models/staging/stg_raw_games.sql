{{
    config(materialized='view')
}}

/*
  Staging model for raw Chess.com game data.

  Responsibilities:
    - Rename/alias columns to consistent snake_case names
    - Parse Unix end_time to timestamp, date, and calendar fields
    - Light validation (filter out rows with null primary keys)
    - NO player-perspective logic (white/black → my_* happens in int_)
    - NO business logic or derived metrics

  Source: crucial-decoder-462021-m4.test1.raw_games
*/

WITH source AS (

    SELECT * FROM {{ source('chess_com', 'raw_games') }}

),

/*
  Deduplicate at the source: raw_games is an append-only table and can
  accumulate multiple rows for the same UUID from repeated uploads.
  Keep the most recently uploaded version of each game.
  QUALIFY is BigQuery-native and more readable than a subquery.
*/
deduped AS (

    SELECT *
    FROM source
    WHERE
        uuid           IS NOT NULL
        AND end_time   IS NOT NULL
        AND white_username IS NOT NULL
        AND black_username IS NOT NULL
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY uuid
        ORDER BY uploaded_at DESC
    ) = 1

),

cleaned AS (

    SELECT
        -- ── Identifiers ──────────────────────────────────────────────
        uuid                                            AS game_id,
        url                                             AS game_url,
        tcn,

        -- ── Timestamps & dates ───────────────────────────────────────
        TIMESTAMP_SECONDS(end_time)                     AS game_end_timestamp,
        DATE(TIMESTAMP_SECONDS(end_time))               AS game_date,
        EXTRACT(YEAR  FROM DATE(TIMESTAMP_SECONDS(end_time))) AS game_year,
        EXTRACT(MONTH FROM DATE(TIMESTAMP_SECONDS(end_time))) AS game_month,
        EXTRACT(DAY   FROM DATE(TIMESTAMP_SECONDS(end_time))) AS game_day,
        EXTRACT(HOUR  FROM TIMESTAMP_SECONDS(end_time)) AS game_hour,
        -- 1=Sun … 7=Sat (BigQuery DAYOFWEEK convention)
        EXTRACT(DAYOFWEEK FROM TIMESTAMP_SECONDS(end_time)) AS game_day_of_week,
        FORMAT_TIMESTAMP('%A', TIMESTAMP_SECONDS(end_time)) AS game_weekday_name,

        -- ── Game settings ────────────────────────────────────────────
        time_control                                    AS raw_time_control,
        time_class,
        rules,
        rated,
        fen                                             AS final_fen,
        initial_setup,

        -- ── PGN (kept raw; parsed in intermediate) ───────────────────
        pgn,

        -- ── White player ─────────────────────────────────────────────
        white_username,
        white_rating,
        white_result,
        white_uuid,
        white_accuracy,

        -- ── Black player ─────────────────────────────────────────────
        black_username,
        black_rating,
        black_result,
        black_uuid,
        black_accuracy,

        -- ── Load metadata ─────────────────────────────────────────────
        uploaded_at,
        loaded_by_user

    FROM deduped

)

SELECT * FROM cleaned
