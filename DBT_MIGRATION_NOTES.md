# dbt Migration Notes

## What Changed

### Raw Data Structure

The `raw_games` table now stores the **raw Chess.com API response** structure:

**Before (old structure):**
- Pre-processed data with `my_username`, `my_rating`, `my_opening`
- Parsed dates, formatted time controls
- Player perspective already applied

**After (new structure):**
- Raw API response (with nested objects flattened)
- Fields: `white_username`, `black_username`, `white_rating`, `black_rating`
- Unix timestamps (`end_time`)
- Full PGN string (not parsed)
- No player perspective logic

### Schema Changes

**Key differences:**
1. **Player data**: Now `white_username`/`black_username` instead of `my_username`/`opp_username`
2. **Dates**: Unix timestamp (`end_time`) instead of parsed date string
3. **Time control**: Raw format (e.g., "600") instead of formatted string
4. **PGN**: Full PGN stored, not parsed
5. **Metadata**: Added `uploaded_at`, `loaded_by_user` fields

### dbt Model Updates

**Staging models** now need to:
- Parse Unix timestamps: `TIMESTAMP_SECONDS(end_time)`
- Extract dates: `DATE(TIMESTAMP_SECONDS(end_time))`
- Keep raw PGN for later parsing

**Intermediate models** now need to:
- Add player perspective logic (determine `my_username`, `my_rating` based on which player)
- Parse PGN to extract moves, metadata
- Format time controls
- Extract openings from PGN

**Mart models** reference intermediate models instead of staging models

## Migration Checklist

- [x] Update `raw_games` table schema in BigQuery
- [x] Update `upload_raw_games()` to handle raw API structure
- [x] Update source definitions in `sources.yml`
- [ ] Update staging models (`stg_raw_games.sql`)
- [ ] Create intermediate models (`int_user_games.sql`)
- [ ] Update mart models to reference intermediate models
- [ ] Test dbt models with sample data
- [ ] Update documentation

## Next Steps

1. **Create staging model** (`stg_raw_games.sql`):
   - Parse Unix timestamps
   - Basic validation
   - No business logic

2. **Create intermediate model** (`int_user_games.sql`):
   - Player perspective logic
   - PGN parsing (if needed)
   - Calculated fields

3. **Update mart models**:
   - Reference `int_user_games` instead of `stg_raw_games`
   - Use correct field names

4. **Test and iterate**:
   - Test with sample data
   - Verify transformations
   - Update as needed
