# Raw Data Upload to BigQuery - Architecture Update

## Overview

The code has been updated to upload **RAW Chess.com API response** to BigQuery before any transformations. The raw data structure matches the Chess.com API exactly (with nested objects flattened). Transformations will be handled by dbt intermediate models.

## Data Flow

```
┌─────────────────────────────────┐
│  Chess.com API                  │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  fetch_and_process_game_data()  │  ← Fetches from API, basic PGN parsing
│  (process_game function)        │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  upload_raw_games()             │  ← NEW: Uploads RAW data to BigQuery
│  (BigQuery source table)        │
└────────────┬────────────────────┘
             │
             ├──────────────────────────────────┐
             │                                  │
             ▼                                  ▼
┌─────────────────────────┐     ┌──────────────────────────────┐
│  BigQuery               │     │  Local Processing            │
│  raw_games table        │     │  (clean_dataframe)           │
│  (SOURCE LAYER)         │     │  - For visualizations        │
└────────┬────────────────┘     │  - For CSV exports           │
         │                      │  - For statistics            │
         │                      └──────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  dbt Intermediate Models        │  ← Transformations in SQL
│  (stg_*.sql, int_*.sql)        │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  dbt Mart Models                │
│  (fct_games, dim_users, etc.)  │
└─────────────────────────────────┘
```

## Changes Made

### 1. New BigQuery Schema (`api/bigquery_dashboard.py`)

**`_ensure_raw_games_table_exists()`** - Creates table for RAW data:

- Schema matches **raw Chess.com API response** structure
- Includes raw fields: `uuid`, `url`, `pgn`, `time_control`, `end_time` (Unix timestamp)
- **Nested objects flattened**: `white` → `white_username`, `white_rating`, etc.
- **No transformations** - raw data only
- Full PGN stored as-is (not parsed) - dbt will parse it
- Unix timestamps stored as-is - dbt will parse them

### 2. New Upload Method (`api/bigquery_dashboard.py`)

**`upload_raw_games()`** - Uploads raw API response before transformations:

```python
# Fetch raw games from API (before process_game() processing)
raw_games_from_api = fetch_all_games_for_selected_year(username, year)
# or
raw_games_from_api = fetch_all_games(username)

# Upload raw API response to BigQuery
bigquery_dashboard.upload_raw_games(username, raw_games_from_api)
```

**Key features:**
- Accepts raw Chess.com API response format (from `fetch_all_games()`)
- Flattens nested objects (`white`, `black`, `accuracies`) via `flatten_raw_game()`
- Adds metadata: `uploaded_at`, `loaded_by_user`
- Uses APPEND strategy for new data
- No transformations applied - stores exactly as received from API

### 3. Updated Testing Script (`tests/testing.py`)

**Upload flow updated:**

1. **Fetch raw API response**: `raw_games_from_api = fetch_all_games_for_selected_year(username, year)`
2. **Upload RAW to BigQuery**: `bigquery_dashboard.upload_raw_games(username, raw_games_from_api)`
3. **Then process for local use**: `df = fetch_and_process_game_data(username, year)` → `clean_dataframe(df, username)`

This separates:
- **BigQuery data**: Raw API response, unprocessed (for dbt transformations)
- **Local processing**: Transformed data (for visualizations, CSV, etc.)

## Raw Data Structure

The `raw_games` table contains the **raw Chess.com API response** structure:

```python
{
    # Root level fields (from API)
    'uuid': '...',              # Unique game ID
    'url': '...',               # Game URL
    'pgn': '...',               # Full PGN string (not parsed)
    'time_control': '600',      # Raw format (not formatted)
    'end_time': 1704067200,     # Unix timestamp (not parsed)
    'rated': True,
    'time_class': 'rapid',
    'rules': 'chess',
    'fen': '...',
    'initial_setup': '...',
    
    # Flattened from "white" object
    'white_username': '...',
    'white_rating': 1500,
    'white_result': 'win',
    'white_uuid': '...',
    
    # Flattened from "black" object
    'black_username': '...',
    'black_rating': 1600,
    'black_result': 'lose',
    'black_uuid': '...',
    
    # Flattened from "accuracies" object (optional)
    'white_accuracy': 87.2,
    'black_accuracy': 79.4,
    
    # Load metadata
    'uploaded_at': datetime(...),
    'loaded_by_user': 'EdwardL903'
}
```

**Key differences from old structure:**
- ❌ No `my_username`, `my_rating`, `my_opening` - those are calculated in dbt!
- ❌ No parsed dates - Unix timestamp (`end_time`) needs parsing in dbt
- ❌ No formatted time controls - Raw format (e.g., "600") needs formatting in dbt
- ❌ No PGN parsing - Full PGN string stored, needs parsing in dbt
- ✅ Raw API structure preserved for maximum flexibility

See `RAW_API_SCHEMA.md` for complete schema documentation.

## Next Steps: dbt Transformations

Now that raw data is in BigQuery, create dbt models:

1. **Staging models** (`stg_raw_games.sql`):
   - Parse dates
   - Clean ECO URLs
   - Standardize formats

2. **Intermediate models** (`int_games.sql`):
   - Calculate `my_username`, `my_rating` based on which player is being analyzed
   - Calculate `my_opening` (white vs black logic)
   - Calculate `rating_diff`, `my_win_or_lose`, etc.

3. **Mart models** (`fct_games.sql`):
   - Final fact table with all calculated fields
   - Join with `dim_users`

## Benefits

1. **Separation of concerns**: Raw data vs transformations
2. **Single source of truth**: All raw data in BigQuery
3. **Replayable transformations**: dbt can rebuild all calculations
4. **Version control**: dbt models are versioned
5. **Testable**: Each transformation layer can be tested
6. **Incremental**: Only process new data after initial load

## Migration Notes

- Old `upload_user_games()` method is deprecated but still works (backward compatibility)
- Old table schema still exists but new `raw_games` table should be used
- Local processing (visualizations, CSV) continues to work as before
- BigQuery now contains raw data + transformed data (during transition)
