# dbt Quick Start Guide

## Overview

This structure follows **dimensional modeling** (star schema) best practices:

- **`raw_games`**: Source table (raw Chess.com API response - flattened nested objects)
- **`dim_users`**: Dimension table (one row per user) - Normalized
- **`fct_games`**: Fact table (one row per game per user) - Denormalized
- **`fct_user_statistics`**: Fact table (one row per user per day) - Denormalized

## Raw Data Structure

The `raw_games` table contains the **raw Chess.com API response**:
- Fields: `uuid`, `url`, `pgn`, `time_control`, `end_time`, `white_username`, `black_username`, etc.
- **No processing** - Data stored exactly as received
- **No player perspective** - Both white and black data stored
- **Unix timestamps** - Dates need to be parsed in dbt

See `RAW_API_SCHEMA.md` for complete schema documentation.

## Table Relationships

```
dim_users (Dimension)
    │
    │ user_key
    │
    ├─────────────────────────────────────┐
    │                                     │
    ▼                                     ▼
fct_games                          fct_user_statistics
(Fact Table)                       (Fact Table)
    │                                     │
    └─ One row per game                  └─ One row per user per day
    └─ Contains all game details         └─ Contains aggregated stats
```

## Why This Structure?

### ✅ Benefits:

1. **Normalized Dimensions**: `dim_users` eliminates redundancy (user info stored once)
2. **Denormalized Facts**: `fct_games` contains all context for fast queries (no joins needed for most queries)
3. **Incremental Performance**: Only process new data after initial load
4. **Clear Separation**: Each layer has a purpose
5. **Joinable**: All tables can be joined via `user_key` surrogate key
6. **Scalable**: Easy to add dimensions (dim_openings, dim_opponents, dim_time_classes)

### 📊 Example Queries:

**Get all games for a user:**
```sql
SELECT * 
FROM fct_games 
WHERE user_key = (SELECT user_key FROM dim_users WHERE username = 'EdwardL903')
```

**Get user statistics:**
```sql
SELECT * 
FROM fct_user_statistics fus
JOIN dim_users du ON fus.user_key = du.user_key
WHERE du.username = 'EdwardL903'
ORDER BY stat_date DESC
```

**Get games with user info:**
```sql
SELECT 
    fg.*,
    du.username,
    du.current_rating
FROM fct_games fg
JOIN dim_users du ON fg.user_key = du.user_key
WHERE du.username = 'EdwardL903'
```

## Incremental Strategy

Both fact tables use incremental materialization:

- **`fct_games`**: Merges new games, updates changed games
- **`fct_user_statistics`**: Only processes new dates

This means:
- First run: Processes all historical data
- Subsequent runs: Only processes new/updated data (much faster!)

## Setup Steps

1. **Install dbt:**
   ```bash
   pip install dbt-bigquery
   ```

2. **Initialize project:**
   ```bash
   dbt init chesslytics-dbt
   cd chesslytics-dbt
   ```

3. **Configure profiles.yml:**
   ```yaml
   chesslytics:
     outputs:
       dev:
         type: bigquery
         method: service-account
         project: crucial-decoder-462021-m4
         dataset: test1
         keyfile: /path/to/service_account.json
     target: dev
   ```

4. **Build models:**
   ```bash
   dbt run --select stg_*           # Build staging
   dbt run --select int_*           # Build intermediate
   dbt run --select dim_* fct_*     # Build marts
   dbt test                         # Run tests
   ```

5. **Incremental builds (production):**
   ```bash
   dbt run --select fct_*           # Only rebuilds incremental tables
   ```
