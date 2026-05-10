# dbt Project Structure - Chesslytics Data Model

This document outlines the recommended dbt project structure with proper normalization, incremental models, and best practices.

## Architecture Overview

```
┌─────────────────┐
│  Python API     │  Fetches from Chess.com API
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Raw Layer      │  Raw data from API (BigQuery tables)
│  (BigQuery)     │  
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Source Models  │  Define source tables (sources.yml)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Staging Layer  │  Clean & standardize (stg_*.sql)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Intermediate   │  Transformations & calculations (int_*.sql)
│  Layer          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Mart/Reporting │  Final tables for dashboards
│  Layer          │  - dim_users (dimension)
│  (Star Schema)  │  - fct_games (fact - grain: 1 row per game per user)
│                 │  - fct_user_statistics (fact - grain: 1 row per user per day)
└─────────────────┘
```

## Directory Structure

```
chesslytics-dbt/
├── dbt_project.yml
├── profiles.yml
├── models/
│   ├── sources/
│   │   ├── schema.yml                    # Source definitions
│   │   └── sources.yml
│   │
│   ├── staging/
│   │   ├── schema.yml
│   │   ├── stg_raw_games.sql            # Clean raw game data
│   │   └── stg_users.sql                # Clean user data (if needed)
│   │
│   ├── intermediate/
│   │   ├── schema.yml
│   │   ├── int_games_daily_aggregated.sql  # Daily game aggregations
│   │   ├── int_user_openings.sql          # Opening statistics
│   │   └── int_game_calculations.sql      # Calculated fields
│   │
│   └── marts/
│       ├── schema.yml
│       ├── dim_users.sql                 # User dimension table
│       ├── fct_games.sql                 # Games fact table (INCREMENTAL)
│       └── fct_user_statistics.sql       # User statistics fact (INCREMENTAL)
│
├── macros/
│   ├── generate_surrogate_key.sql
│   └── incremental_strategy.sql
│
└── tests/
    └── assertions/
        └── unique_game_id.sql
```

## Layer 1: Sources (sources.yml)

Define your raw BigQuery tables as sources. The `raw_games` table contains the raw Chess.com API response structure:

```yaml
# models/sources/schema.yml
version: 2

sources:
  - name: chess_com
    description: "Raw data from Chess.com API - stored exactly as returned from the API"
    database: crucial-decoder-462021-m4
    schema: test1  # Your BigQuery dataset
    
    tables:
      - name: raw_games
        description: "Raw game data from Chess.com API - nested objects (white, black, accuracies) are flattened to top-level fields"
        columns:
          # Game identifiers
          - name: uuid
            description: "Unique game identifier (primary key)"
            tests:
              - not_null
              - unique
          - name: url
            description: "Game URL on Chess.com"
          - name: tcn
            description: "Tactical Chess Notation encoded move string"
          
          # Game metadata (raw from API)
          - name: pgn
            description: "Full PGN string - needs to be parsed in dbt"
          - name: time_control
            description: "Raw time control string from API (e.g., '600' for 10 minutes)"
          - name: end_time
            description: "Unix timestamp when game ended"
          - name: rated
            description: "Whether the game was rated"
          - name: time_class
            description: "Time control class (blitz/rapid/bullet/daily)"
          - name: rules
            description: "Game rules (e.g., 'chess')"
          - name: fen
            description: "Final position FEN string"
          - name: initial_setup
            description: "Initial board setup FEN string"
          
          # White player (flattened from nested "white" object)
          - name: white_username
            description: "White player's username"
          - name: white_rating
            description: "White player's rating"
          - name: white_result
            description: "White player's result (win/lose/draw/resigned/etc.)"
          - name: white_uuid
            description: "White player's UUID"
          
          # Black player (flattened from nested "black" object)
          - name: black_username
            description: "Black player's username"
          - name: black_rating
            description: "Black player's rating"
          - name: black_result
            description: "Black player's result (win/lose/draw/resigned/etc.)"
          - name: black_uuid
            description: "Black player's UUID"
          
          # Accuracies (flattened from nested "accuracies" object - optional)
          - name: white_accuracy
            description: "White player's accuracy percentage (optional field)"
          - name: black_accuracy
            description: "Black player's accuracy percentage (optional field)"
          
          # Load metadata
          - name: uploaded_at
            description: "Timestamp when data was loaded to BigQuery"
          - name: loaded_by_user
            description: "Username who triggered the data load"
```

## Layer 2: Staging Models

Clean and standardize the raw data. Parse PGN, extract dates from Unix timestamps, and prepare for transformations:

```sql
-- models/staging/stg_raw_games.sql
{{
    config(
        materialized='view'  # Views are cheap, recompute on query
    )
}}

WITH parsed_games AS (
    SELECT
        -- Game identifiers
        uuid as game_id,
        url as game_url,
        tcn,
        
        -- Game metadata
        pgn,
        time_control as raw_time_control,  -- Raw format (e.g., "600")
        TIMESTAMP_SECONDS(end_time) as game_end_timestamp,
        DATE(TIMESTAMP_SECONDS(end_time)) as game_date,  -- Extract date from Unix timestamp
        EXTRACT(YEAR FROM DATE(TIMESTAMP_SECONDS(end_time))) as game_year,
        EXTRACT(MONTH FROM DATE(TIMESTAMP_SECONDS(end_time))) as game_month,
        EXTRACT(DAY FROM DATE(TIMESTAMP_SECONDS(end_time))) as game_day,
        
        -- Game settings
        rated,
        time_class,
        rules,
        fen as final_fen,
        initial_setup,
        
        -- White player data
        white_username,
        white_rating,
        white_result,
        white_uuid,
        white_accuracy,
        
        -- Black player data
        black_username,
        black_rating,
        black_result,
        black_uuid,
        black_accuracy,
        
        -- Load metadata
        uploaded_at,
        loaded_by_user
        
    FROM {{ source('chess_com', 'raw_games') }}
    
    WHERE uuid IS NOT NULL
        AND end_time IS NOT NULL
        AND white_username IS NOT NULL
        AND black_username IS NOT NULL
)

SELECT * FROM parsed_games
```

**Note:** This staging model:
- Parses Unix timestamp (`end_time`) to date
- Keeps raw PGN for later parsing in intermediate models
- Keeps raw time_control format for later formatting
- Validates required fields
- No player perspective logic yet (that's in intermediate models)

## Layer 3: Intermediate Models

Build reusable transformations. This is where player perspective logic, PGN parsing, and calculations happen:

```sql
-- models/intermediate/int_user_games.sql
{{
    config(
        materialized='table'
    )
}}

-- This model adds player perspective logic (my_username, my_rating, etc.)
-- based on which player we're analyzing (passed via dbt variable)
WITH user_games AS (
    SELECT
        game_id,
        game_url,
        game_date,
        game_year,
        game_month,
        game_end_timestamp,
        
        -- Player perspective: determine which player we're analyzing
        -- Use dbt variable {{ var('username') }} for the player to analyze
        CASE 
            WHEN LOWER(white_username) = LOWER('{{ var("username") }}') THEN white_username
            WHEN LOWER(black_username) = LOWER('{{ var("username") }}') THEN black_username
        END as my_username,
        
        CASE 
            WHEN LOWER(white_username) = LOWER('{{ var("username") }}') THEN white_rating
            WHEN LOWER(black_username) = LOWER('{{ var("username") }}') THEN black_rating
        END as my_rating,
        
        CASE 
            WHEN LOWER(white_username) = LOWER('{{ var("username") }}') THEN white_result
            WHEN LOWER(black_username) = LOWER('{{ var("username") }}') THEN black_result
        END as my_result,
        
        CASE 
            WHEN LOWER(white_username) = LOWER('{{ var("username") }}') THEN 'white'
            WHEN LOWER(black_username) = LOWER('{{ var("username") }}') THEN 'black'
        END as my_color,
        
        -- Opponent data
        CASE 
            WHEN LOWER(white_username) = LOWER('{{ var("username") }}') THEN black_username
            WHEN LOWER(black_username) = LOWER('{{ var("username") }}') THEN white_username
        END as opp_username,
        
        CASE 
            WHEN LOWER(white_username) = LOWER('{{ var("username") }}') THEN black_rating
            WHEN LOWER(black_username) = LOWER('{{ var("username") }}') THEN white_rating
        END as opp_rating,
        
        CASE 
            WHEN LOWER(white_username) = LOWER('{{ var("username") }}') THEN black_result
            WHEN LOWER(black_username) = LOWER('{{ var("username") }}') THEN white_result
        END as opp_result,
        
        -- Game details
        time_class,
        rules,
        rated,
        raw_time_control,
        pgn,
        final_fen,
        initial_setup,
        
        -- Accuracies (if available)
        CASE 
            WHEN LOWER(white_username) = LOWER('{{ var("username") }}') THEN white_accuracy
            WHEN LOWER(black_username) = LOWER('{{ var("username") }}') THEN black_accuracy
        END as my_accuracy,
        
        -- Calculated fields
        CASE 
            WHEN LOWER(white_username) = LOWER('{{ var("username") }}') THEN white_rating - black_rating
            WHEN LOWER(black_username) = LOWER('{{ var("username") }}') THEN black_rating - white_rating
        END as rating_difference,
        
        -- Outcome categorization
        CASE 
            WHEN LOWER(white_username) = LOWER('{{ var("username") }}') AND white_result = 'win' THEN 'win'
            WHEN LOWER(black_username) = LOWER('{{ var("username") }}') AND black_result = 'win' THEN 'win'
            WHEN LOWER(white_username) = LOWER('{{ var("username") }}') AND white_result IN ('draw', 'stalemate', 'repetition', 'insufficient', 'timevsinsufficient', 'agreed', '50move') THEN 'draw'
            WHEN LOWER(black_username) = LOWER('{{ var("username") }}') AND black_result IN ('draw', 'stalemate', 'repetition', 'insufficient', 'timevsinsufficient', 'agreed', '50move') THEN 'draw'
            ELSE 'lose'
        END as outcome,  -- win/lose/draw
        
        uploaded_at,
        loaded_by_user
        
    FROM {{ ref('stg_raw_games') }}
    
    WHERE (LOWER(white_username) = LOWER('{{ var("username") }}') 
           OR LOWER(black_username) = LOWER('{{ var("username") }}'))
)

SELECT * FROM user_games
WHERE my_username IS NOT NULL  -- Filter out games where username doesn't match
```

**Note:** This intermediate model:
- Adds player perspective logic (`my_username`, `my_rating`, `my_color`)
- Calculates `rating_difference`, `outcome`
- Uses dbt variable `{{ var('username') }}` to filter games for a specific player
- PGN parsing and opening extraction can be added in separate intermediate models

## Layer 4: Mart Models (Dimensional Model)

### Dimension Table: Users

```sql
-- models/marts/dim_users.sql
{{
    config(
        materialized='table',
        unique_key='user_key'
    )
}}

WITH all_users AS (
    -- Get all unique usernames from both white and black players
    SELECT DISTINCT white_username as username FROM {{ ref('stg_raw_games') }}
    UNION DISTINCT
    SELECT DISTINCT black_username as username FROM {{ ref('stg_raw_games') }}
    WHERE username IS NOT NULL
),

user_base AS (
    SELECT username FROM all_users
),

latest_stats AS (
    -- Calculate stats from intermediate model (which has player perspective)
    SELECT
        my_username as username,
        MAX(my_rating) as current_rating,
        MAX(game_date) as last_game_date,
        COUNT(DISTINCT game_date) as active_days
    FROM {{ ref('int_user_games') }}
    WHERE my_username IS NOT NULL
    GROUP BY my_username
)

SELECT
    {{ dbt_utils.generate_surrogate_key(['ub.username']) }} as user_key,
    ub.username,
    COALESCE(ls.current_rating, 0) as current_rating,
    COALESCE(ls.last_game_date, CURRENT_DATE()) as last_game_date,
    COALESCE(ls.active_days, 0) as total_active_days,
    CURRENT_TIMESTAMP() as updated_at
    
FROM user_base ub
LEFT JOIN latest_stats ls
    ON ub.username = ls.username
```

### Fact Table: Games (INCREMENTAL)

```sql
-- models/marts/fct_games.sql
{{
    config(
        materialized='incremental',
        unique_key='game_key',
        incremental_strategy='merge',
        merge_update_columns=['result', 'outcome', 'user_rating', 'duration_seconds']
    )
}}

WITH games AS (
    SELECT
        {{ dbt_utils.generate_surrogate_key(['int.game_id', 'int.my_username']) }} as game_key,
        du.user_key,
        int.game_id,
        int.my_username as username,
        int.game_date,
        int.game_year,
        int.game_month,
        int.my_rating as user_rating,
        int.opp_rating as opponent_rating,
        int.rating_difference,
        int.my_result as result,
        int.outcome,  -- win/lose/draw
        int.time_class,
        int.my_color as color_played,
        int.opp_username as opponent_username,
        int.game_url,
        int.game_end_timestamp,
        int.rated,
        int.rules,
        int.my_accuracy,
        int.uploaded_at as loaded_at,
        CURRENT_TIMESTAMP() as fact_updated_at
        
    FROM {{ ref('int_user_games') }} int
    LEFT JOIN {{ ref('dim_users') }} du
        ON int.my_username = du.username
    
    {% if is_incremental() %}
        -- Only process new/updated games
        WHERE int.uploaded_at > (SELECT MAX(loaded_at) FROM {{ this }})
    {% endif %}
)

SELECT * FROM games
```

### Fact Table: User Statistics (INCREMENTAL)

```sql
-- models/marts/fct_user_statistics.sql
{{
    config(
        materialized='incremental',
        unique_key='stat_key',
        incremental_strategy='merge',
        merge_update_columns=['wins', 'losses', 'draws', 'total_games', 'current_rating']
    )
}}

WITH daily_stats AS (
    SELECT
        my_username as username,
        game_date as stat_date,
        COUNT(*) as games_played,
        COUNTIF(outcome = 'win') as wins,
        COUNTIF(outcome = 'lose') as losses,
        COUNTIF(outcome = 'draw') as draws,
        AVG(my_rating) as avg_rating,
        MAX(my_rating) as max_rating,
        MIN(my_rating) as min_rating
    FROM {{ ref('int_user_games') }}
    
    WHERE my_username IS NOT NULL
    
    {% if is_incremental() %}
        AND game_date > (SELECT MAX(stat_date) FROM {{ this }})
    {% endif %}
    
    GROUP BY my_username, game_date
),

cumulative_stats AS (
    SELECT
        ds.username,
        ds.stat_date,
        ds.games_played,
        ds.wins,
        ds.losses,
        ds.draws,
        ds.avg_rating,
        ds.max_rating,
        ds.min_rating,
        
        -- Cumulative totals
        SUM(ds.games_played) OVER (
            PARTITION BY ds.username 
            ORDER BY ds.stat_date 
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as cumulative_games,
        
        SUM(ds.wins) OVER (
            PARTITION BY ds.username 
            ORDER BY ds.stat_date 
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as cumulative_wins,
        
        -- Current rating (latest for the day)
        ds.max_rating as current_rating,
        
        -- Highest rating ever
        MAX(ds.max_rating) OVER (
            PARTITION BY ds.username 
            ORDER BY ds.stat_date 
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as highest_rating_ever,
        
        CURRENT_TIMESTAMP() as fact_updated_at
        
    FROM daily_stats ds
)

SELECT
    {{ dbt_utils.generate_surrogate_key(['username', 'stat_date']) }} as stat_key,
    du.user_key,
    cs.username,
    cs.stat_date,
    cs.games_played,
    cs.wins,
    cs.losses,
    cs.draws,
    cs.cumulative_games as total_games,
    cs.cumulative_wins as total_wins,
    cs.current_rating,
    cs.highest_rating_ever,
    cs.avg_rating,
    cs.max_rating,
    cs.min_rating,
    cs.fact_updated_at
    
FROM cumulative_stats cs
LEFT JOIN {{ ref('dim_users') }} du
    ON cs.username = du.username
```

## Joining Tables for Dashboards

### Example: Games with User Info

```sql
SELECT
    fg.*,
    du.username,
    du.current_rating as user_current_rating,
    du.last_game_date
FROM {{ ref('fct_games') }} fg
JOIN {{ ref('dim_users') }} du
    ON fg.user_key = du.user_key
WHERE du.username = '{{ var("username") }}'
    AND fg.game_year = {{ var("year") }}
ORDER BY fg.game_date DESC
```

### Example: User Statistics with Details

```sql
SELECT
    fus.*,
    du.username,
    du.current_rating,
    du.total_active_days
FROM {{ ref('fct_user_statistics') }} fus
JOIN {{ ref('dim_users') }} du
    ON fus.user_key = du.user_key
WHERE du.username = '{{ var("username") }}'
    AND fus.stat_date >= DATE('{{ var("start_date") }}')
ORDER BY fus.stat_date DESC
```

## Important Notes

### Raw Data Structure

The `raw_games` table contains the **raw Chess.com API response** with nested objects flattened:
- **No processing** - Data stored exactly as received from API
- **No player perspective** - Both white and black data stored
- **No PGN parsing** - Full PGN string stored as-is
- **Unix timestamps** - Dates stored as Unix timestamps, not parsed

### Transformation Philosophy

1. **Staging models** (`stg_*`): 
   - Parse Unix timestamps to dates
   - Basic validation
   - No business logic

2. **Intermediate models** (`int_*`):
   - Player perspective logic (my_username, my_rating, etc.)
   - PGN parsing (extract moves, dates, metadata)
   - Opening extraction
   - Calculated fields (rating_diff, outcome, etc.)

3. **Mart models** (`fct_*`, `dim_*`):
   - Final fact and dimension tables
   - Incremental materialization
   - Ready for dashboards

### Using dbt Variables

Many models use `{{ var('username') }}` to filter for a specific player:

```yaml
# dbt_project.yml
vars:
  username: "EdwardL903"  # Default username
```

Run with specific username:
```bash
dbt run --vars '{"username": "EdwardL903"}'
```

## Incremental Strategy Configuration

For BigQuery, use `merge` strategy:

```sql
{{
    config(
        materialized='incremental',
        unique_key='game_key',
        incremental_strategy='merge',
        merge_update_columns=['result', 'outcome', 'user_rating'],
        partition_by={'field': 'game_date', 'data_type': 'date'},
        cluster_by=['username']
    )
}}
```

## Benefits of This Structure

1. **Normalized Dimensions**: `dim_users` table eliminates redundancy
2. **Denormalized Facts**: `fct_games` contains all context for fast queries
3. **Incremental Performance**: Only process new data
4. **Clear Separation**: Source → Staging → Intermediate → Mart
5. **Joinable**: All tables can be joined via surrogate keys
6. **Testable**: Each layer can be tested independently
7. **Scalable**: Easy to add new dimensions (dim_openings, dim_opponents, etc.)

## Next Steps

1. Set up dbt project: `dbt init chesslytics-dbt`
2. Create source definitions in `sources/schema.yml`
3. Build staging models first
4. Build intermediate models
5. Build mart models with incremental config
6. Add tests and documentation
7. Schedule runs (dbt Cloud or Airflow)
