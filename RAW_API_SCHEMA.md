# Raw Chess.com API Response → BigQuery Schema

## Chess.com API Response Structure

The Chess.com API returns data in this format:

```json
{
  "games": [
    {
      "url": "https://www.chess.com/game/live/123456789",
      "pgn": "[Event \"Live Chess\"]\n[Site \"Chess.com\"]\n...",
      "time_control": "600",
      "end_time": 1704067200,
      "rated": true,
      "tcn": "encoded-move-string",
      "uuid": "550e8400-e29b-41d4-a716-446655440000",
      "initial_setup": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "fen": "final-position-fen",
      "time_class": "rapid",
      "rules": "chess",
      "white": {
        "username": "playerA",
        "rating": 1523,
        "result": "win",
        "uuid": "white-player-uuid"
      },
      "black": {
        "username": "playerB",
        "rating": 1488,
        "result": "resigned",
        "uuid": "black-player-uuid"
      },
      "accuracies": {
        "white": 87.2,
        "black": 79.4
      }
    }
  ]
}
```

## BigQuery Schema (Flattened)

The raw data is stored in BigQuery with nested objects flattened:

```sql
-- Table: raw_games
CREATE TABLE raw_games (
  -- Root level fields
  uuid STRING REQUIRED,           -- Primary key
  url STRING,
  tcn STRING,
  pgn STRING,                      -- Full PGN from API
  time_control STRING,             -- Raw format (e.g., "600")
  end_time INTEGER,                -- Unix timestamp
  rated BOOLEAN,
  time_class STRING,               -- blitz/rapid/bullet/daily
  rules STRING,
  fen STRING,                      -- Final position FEN
  initial_setup STRING,            -- Initial board setup FEN
  
  -- Flattened from "white" object
  white_username STRING,
  white_rating INTEGER,
  white_result STRING,
  white_uuid STRING,
  
  -- Flattened from "black" object
  black_username STRING,
  black_rating INTEGER,
  black_result STRING,
  black_uuid STRING,
  
  -- Flattened from "accuracies" object (optional)
  white_accuracy FLOAT,
  black_accuracy FLOAT,
  
  -- Load metadata
  uploaded_at TIMESTAMP REQUIRED,
  loaded_by_user STRING
);
```

## Flattening Logic

The `flatten_raw_game()` function flattens nested objects:

```python
def flatten_raw_game(game):
    return {
        # Root level
        "uuid": game.get("uuid"),
        "url": game.get("url"),
        # ...
        
        # Flatten white object
        "white_username": game.get("white", {}).get("username"),
        "white_rating": game.get("white", {}).get("rating"),
        # ...
        
        # Flatten black object
        "black_username": game.get("black", {}).get("username"),
        "black_rating": game.get("black", {}).get("rating"),
        # ...
        
        # Flatten accuracies object
        "white_accuracy": game.get("accuracies", {}).get("white"),
        "black_accuracy": game.get("accuracies", {}).get("black"),
    }
```

## What's NOT Processed

**Raw data storage means:**
- ✅ No PGN parsing - Full PGN string stored as-is
- ✅ No move extraction - dbt will parse PGN later
- ✅ No date parsing - `end_time` stored as Unix timestamp
- ✅ No time control formatting - Stored as raw string (e.g., "600")
- ✅ No player perspective - Both white and black data stored
- ✅ No transformations - All calculations done in dbt

## What dbt Will Do

dbt intermediate models will:
1. Parse PGN to extract moves, dates, metadata
2. Parse dates from Unix timestamp
3. Format time controls
4. Calculate player perspective (my_username, my_rating, etc.)
5. Calculate derived fields (rating_diff, my_opening, etc.)

## Benefits

1. **Single source of truth**: Raw API data stored exactly as received
2. **Replayable**: Can rebuild all transformations from raw data
3. **Transparent**: Easy to see what came from the API
4. **No data loss**: All fields preserved, even if not used yet
5. **Version control**: Transformations versioned in dbt, not Python
