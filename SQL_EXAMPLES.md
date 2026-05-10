# SQL Examples for Chess Analytics

This document shows how your current pandas operations translate to BigQuery SQL for use with dbt.

## 1. Basic Aggregations

**Pandas:**
```python
total_games = len(cleaned_df)
total_moves = cleaned_df['my_num_moves'].sum()
total_time_spent = cleaned_df['time_spent'].sum()
```

**SQL (dbt model):**
```sql
-- models/staging/stg_user_statistics.sql
SELECT
    username,
    COUNT(*) as total_games,
    SUM(my_num_moves) as total_moves,
    SUM(time_spent) as total_time_spent
FROM {{ ref('stg_games') }}
WHERE username = '{{ var("username") }}'
GROUP BY username
```

## 2. Value Counts / Group By

**Pandas:**
```python
castling_counts = cleaned_df['my_castling'].value_counts()
timeclass_counts = cleaned_df['time_class'].value_counts()
```

**SQL:**
```sql
-- Castling counts
SELECT
    my_castling,
    COUNT(*) as count
FROM {{ ref('stg_games') }}
WHERE username = '{{ var("username") }}'
GROUP BY my_castling

-- Time class counts
SELECT
    time_class,
    COUNT(*) as count
FROM {{ ref('stg_games') }}
WHERE username = '{{ var("username") }}'
GROUP BY time_class
```

## 3. Daily Aggregations

**Pandas:**
```python
daily_time_spent = cleaned_df.groupby('date')['time_spent'].sum()
most_time_spent_day = daily_time_spent.idxmax()
most_time_spent = daily_time_spent.max()
```

**SQL:**
```sql
-- models/marts/daily_statistics.sql
WITH daily_stats AS (
    SELECT
        date,
        SUM(time_spent) as daily_time_spent
    FROM {{ ref('stg_games') }}
    WHERE username = '{{ var("username") }}'
    GROUP BY date
)
SELECT
    date as most_time_spent_day,
    daily_time_spent as most_time_spent
FROM daily_stats
ORDER BY daily_time_spent DESC
LIMIT 1
```

## 4. Finding Max with Row Details

**Pandas:**
```python
highest_rating_row = cleaned_df.loc[cleaned_df['my_rating'].idxmax()]
highest_rating = highest_rating_row['my_rating']
highest_rating_time_class = highest_rating_row['time_class']
```

**SQL:**
```sql
SELECT
    my_rating as highest_rating,
    time_class as highest_rating_time_class,
    date as highest_rating_date
FROM {{ ref('stg_games') }}
WHERE username = '{{ var("username") }}'
ORDER BY my_rating DESC
LIMIT 1
```

## 5. Most Played Opponent

**Pandas:**
```python
most_played_opps = cleaned_df.groupby('opp_username').size().reset_index(name='Games_Played')
most_played_opps = most_played_opps.sort_values('Games_Played', ascending=False).head()
```

**SQL:**
```sql
SELECT
    opp_username as opponent,
    COUNT(*) as games_played
FROM {{ ref('stg_games') }}
WHERE username = '{{ var("username") }}'
GROUP BY opp_username
ORDER BY games_played DESC
LIMIT 5
```

## 6. Win/Loss/Draw Percentages

**Pandas:**
```python
win_or_lose_counts = cleaned_df['my_win_or_lose'].value_counts()
total_win = result_counts.get('win', 0)
total_loss = result_counts.get('lose', 0)
total_draw = ...
```

**SQL:**
```sql
SELECT
    COUNTIF(my_win_or_lose = 'win') as total_wins,
    COUNTIF(my_win_or_lose = 'lose') as total_losses,
    COUNTIF(my_win_or_lose = 'draw') as total_draws,
    COUNT(*) as total_games,
    SAFE_DIVIDE(COUNTIF(my_win_or_lose = 'win'), COUNT(*)) * 100 as win_percentage
FROM {{ ref('stg_games') }}
WHERE username = '{{ var("username") }}'
```

## 7. Window Functions for Streaks

**Pandas:**
```python
winning_streak = longest_streak(cleaned_df['my_win_or_lose'], 'win')
```

**SQL (using window functions):**
```sql
WITH streak_groups AS (
    SELECT
        date,
        my_win_or_lose,
        ROW_NUMBER() OVER (ORDER BY date) 
        - ROW_NUMBER() OVER (PARTITION BY my_win_or_lose ORDER BY date) as streak_group
    FROM {{ ref('stg_games') }}
    WHERE username = '{{ var("username") }}'
),
streak_lengths AS (
    SELECT
        my_win_or_lose,
        streak_group,
        COUNT(*) as streak_length
    FROM streak_groups
    WHERE my_win_or_lose = 'win'
    GROUP BY my_win_or_lose, streak_group
)
SELECT MAX(streak_length) as longest_winning_streak
FROM streak_lengths
```

## 8. Most Played Openings

**Pandas:**
```python
my_openings = cleaned_df['my_opening'].value_counts()
```

**SQL:**
```sql
SELECT
    my_opening,
    COUNT(*) as games_played,
    COUNTIF(my_win_or_lose = 'win') as wins,
    SAFE_DIVIDE(COUNTIF(my_win_or_lose = 'win'), COUNT(*)) * 100 as win_rate
FROM {{ ref('stg_games') }}
WHERE username = '{{ var("username") }}'
    AND my_opening IS NOT NULL
GROUP BY my_opening
ORDER BY games_played DESC
```

## 9. Top Games by Criteria

**Pandas:**
```python
biggest_victory = cleaned_df.nlargest(1, 'rating_diff')
```

**SQL:**
```sql
SELECT
    opp_username,
    opp_rating,
    my_rating,
    rating_diff,
    time_class,
    date,
    link
FROM {{ ref('stg_games') }}
WHERE username = '{{ var("username") }}'
ORDER BY rating_diff DESC
LIMIT 1
```

## Recommended dbt Project Structure

```
chesslytics/
├── dbt_project.yml
├── models/
│   ├── staging/
│   │   ├── stg_games.sql          # Clean raw games data
│   │   └── schema.yml
│   ├── intermediate/
│   │   ├── int_user_daily_stats.sql
│   │   └── int_opening_stats.sql
│   └── marts/
│       ├── user_statistics.sql    # Main statistics table
│       ├── opening_performance.sql
│       └── schema.yml
└── macros/
    └── streak_calculation.sql
```
