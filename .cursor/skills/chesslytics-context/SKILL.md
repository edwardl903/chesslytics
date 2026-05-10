---
name: chesslytics-context
description: >-
  Project context, conventions, gotchas, and decision log for the Chesslytics
  (chesslyzer-experimental) repo: a Flask + BigQuery + dbt chess analytics app
  with a React (Vite + TypeScript) frontend. Use when working anywhere in this
  repo — Python data pipeline, Flask endpoints, BigQuery upload, dbt migration,
  React frontend in frontend/, or Heroku deployment. Read this first before
  making changes; update it when adding non-obvious knowledge.
---

# Chesslytics — Project Context

## What this app is

Flask web app that takes a Chess.com username + year, fetches the player's
games from the public Chess.com API, computes statistics, generates
matplotlib visualizations, uploads raw games to BigQuery, and renders an
embedded Looker Studio dashboard.

The active migration is: **stop doing transformations in pandas, do them
in dbt on top of `raw_games` in BigQuery.** The Python pipeline still
runs because it powers the live visualizations and CSV exports, but new
analytics work should land in dbt.

## Repo map (only the parts that matter)

```
app.py                          # Flask entrypoint (port 5001) + SPA fallback
src/data/processor.py           # Chess.com fetch + pandas processing
src/data/uploader.py            # Generic BigQuery upload helpers
src/stats/analysis.py           # Aggregate statistics
src/visualizations/plots.py     # matplotlib/seaborn charts
api/bigquery_dashboard.py       # Raw upload + Looker Studio embed config
tests/testing.py                # CLI runner: `python tests/testing.py <user> <year>`
frontend/                       # React + Vite + TypeScript SPA (the only UI)
  src/App.tsx                   # Router
  src/pages/HomePage.tsx        # Year-in-Review (the real page)
  src/components/ResultsView.tsx# Stats grid + dashboard embed
  src/lib/api.ts                # POST /generate client
  src/types/stats.ts            # TS types matching the /generate response
  src/styles/global.css         # Single global stylesheet (was static/styles.css)
package.json                    # Root: Heroku heroku-postbuild orchestrator
gcp/service_account.json        # GCP creds (gitignored)
```

`tests/` is misnamed — it's the CLI runner, **not** a pytest suite.
There is no test suite yet.

## Hard rules (don't break these)

1. **Never commit `gcp/service_account.json`, `.env`, or anything in `data/`,
   `static/images/`, `.cache/`, `venv/`.** All gitignored — keep it that way.
2. **Use Python 3.13** (`.python-version`). On this Mac, `python3` resolves
   to 3.14 after a recent brew upgrade and the pinned numpy/scipy/pandas
   don't have 3.14 wheels yet. Always create venvs with
   `python3.13 -m venv venv`.
3. **Don't reintroduce per-request `requests.get`** — the project uses a
   single module-level `CachedSession` in `src/data/processor.py`. Adding
   a new endpoint? Use `_session.get(...)` so it shares the connection
   pool and on-disk cache.
4. **Cache TTL convention:** completed monthly archives = `NEVER_EXPIRE`,
   anything that can change today = 300 s. See `_is_completed_month` in
   `processor.py`.

## Conventions

- **Heroku is the prod target.** `Procfile` uses `gunicorn app:app`. The
  Flask app reads `PORT` from env (defaults to 5001 locally).
- **GCP creds:** Two env vars, same JSON value:
  `GOOGLE_APPLICATION_CREDENTIALS_JSON` (read by `api/bigquery_dashboard.py`)
  and `GOOGLE_CREDENTIALS` (read by `src/data/uploader.py`). This split
  is on the roadmap to unify — set both for now. Local dev falls back to
  `gcp/service_account.json`.
- **Hard-coded BigQuery target** in `api/bigquery_dashboard.py`:
  `project_id="crucial-decoder-462021-m4"`, `dataset_id="test1"`,
  raw table = `raw_games`. Don't change without coordinating with the
  Looker Studio dashboard.

## Decision log (newest first)

### 2026-05-09 — Frontend UX pass (nav, form, dashboard, a11y)
- **Year dropdown:** `buildChessWrappedYearOptions()` — calendar years from current year
  down to 2015 with **value === label** so the UI matches what `/generate` sends to
  `tests/testing.py` (Chess.com `/games/{year}/{month}`).
- **Mobile nav:** hamburger + slide-in drawer & backdrop below 900px; desktop
  unchanged. **Soon** badges on Opening / Progress / Game analyzer routes.
- **Form:** removed `alert()`; inline `role="alert"` errors; loading copy uses
  high-contrast text + honest hint that the bar is **not** exact progress;
  `LoadingBar` lives inside the CTA card; submit passes `(trimmedUsername, year)`
  to avoid stale state.
- **Layout:** `.app-shell` flex column + `.app-main` flex 1; footer padding
  reduced and links underlined for clarity.
- **Results:** export caption + `DownloadShareButtons` moved above capture;
  **`stats-capture-target`** wraps only profile + stat grid + highlights so PNG
  excludes dashboard iframe and export chrome.
- **Dashboard:** lazy-load gate kept but placeholder is **compact**; iframe
  `height: min(85vh, 920px)`; shorter headings (fewer emoji); toolbar wraps on
  small screens.
- **Motion:** `CursorEffects` no-ops when `prefers-reduced-motion: reduce`;
  global CSS disables trail animations and resets cursor to `auto` in that mode;
  `background-attachment: scroll` on narrow viewports.
- **Share/download:** replaced blocking `alert()` with inline status/error lines.

### 2026-05-09 — Removed broken legacy BigQuery upload path
- `app.py` was calling **two upload methods that were both broken**, in
  addition to the correct upload that already happens inside the
  `tests/testing.py` subprocess:
  - `upload_user_games(username, games_data)` — accepted the
    already-flattened CSV (`pd.read_csv('data/csv/...').to_dict('records')`)
    and routed it into `upload_raw_games`, whose `flatten_raw_game`
    helper expects **nested Chess.com API responses** with `game["white"]`
    / `game["black"]` / `game["accuracies"]` objects. CSV rows have no
    such nesting, so every "successful upload" wrote 500+ rows where
    every player/accuracy column was `None`. Logged as success, real
    behavior was data corruption.
  - `upload_user_statistics(username, statistics)` — read fields like
    `wins`, `losses`, `current_rating`, `lowest_rating`,
    `total_time_spent.total_minutes`, `biggest_win`, `biggest_loss` from
    the stats JSON. **None of those keys exist** in what
    `total_statistics()` produces. The fields that DO exist
    (`highest_rating`, `total_time_spent`) are dicts, not the scalars
    this code expected — which is what blew up: `Could not convert
    {'rating': 1924, 'time_control': 'bullet', 'date': '...'} with type
    dict: tried to convert to int64`.
- The destination table for the second one (`user_statistics`) was read
  by exactly one method (`get_user_data_from_bigquery`) which had **zero
  callers** anywhere in the codebase. Pure write-only dead path.
- **Fix:** stripped both calls from `app.py`. The remaining BigQuery
  block in the request handler now only does what it actually needs to:
  build the embed config and the personalized dashboard URL. Raw uploads
  continue to flow correctly through `tests/testing.py:168 →
  upload_raw_games` (the only correct path; it has the actual nested
  API response).
- **Cleanup in `api/bigquery_dashboard.py`:** removed
  `upload_user_games`, `upload_user_statistics`, `_ensure_tables_exist`
  (only called by `upload_user_statistics`), `get_user_data_from_bigquery`
  (zero callers), and `self.stats_table` (only read by the deleted
  methods). Kept `self.games_table` because it's still read by
  dashboard query helpers further down the file. Left a breadcrumb
  comment where the methods used to live so the next person doesn't
  re-add them.
- **Also:** added `pandas-gbq==0.27.0` (+ transitive
  `pydata-google-auth==1.9.1`) to `requirements.txt`. Without it,
  every `client.load_table_from_dataframe(...)` logged a noisy
  `FutureWarning` about a future hard dependency. Verified on the live
  module: zero `pandas-gbq` FutureWarnings on the BigQuery import path.
- **Lesson:** the "log warning + catch + print Continuing without
  BigQuery integration..." pattern in `app.py` was hiding a real bug for
  a long time. When you see a `try/except` that swallows everything and
  just prints, treat it as a code smell — at minimum log at `error`
  level so it shows up in production logs.

### 2026-05-09 — Frontend ported to React (Vite + TypeScript)
- **Stack chosen:** Vite + React 18 + TypeScript. Vite for SPA-only
  workload (no SSR needed); TS because that's the 2026 default and gives
  us actual type safety on the `/generate` response.
- **Layout:** new `frontend/` directory, fully self-contained (own
  `package.json`, `tsconfig*.json`, `vite.config.ts`). Root `package.json`
  exists only to give Heroku an `engines.node` and a `heroku-postbuild`
  hook that recurses into `frontend/`.
- **What was ported:** the entire 1507-line `public/index.html` + 857-line
  `static/styles.css`. Faithful 1:1 — same UX, same backend contract,
  same DOM class names so the global stylesheet keeps working. Includes
  navigation, home form, animated chess quotes, fake loading bar, full
  results grid (profile + 3 rows + 8 "biggest games" cards), Looker
  iframe with Load Dashboard gate, html2canvas download/share buttons,
  cursor trail / click ripple flourishes.
- **Routing:** `react-router-dom` with real URLs (`/`, `/about`,
  `/opening-analyzer`, `/progress-tracker`, `/game-analyzer`). The 4
  non-home routes are still "Coming Soon" stubs (extracted into a single
  shared `ComingSoonPage` component). Direct navigation to those URLs
  works because Flask has a SPA fallback (any unmatched GET returns
  `frontend/dist/index.html`).
- **Dev workflow:** two processes. `python app.py` on :5001 and
  `cd frontend && npm run dev` on :5173. Vite proxies `/generate`,
  `/api/*`, `/static/*` to Flask so there's no CORS dance and the
  contract is identical to prod.
- **Prod workflow:** `npm run build` produces `frontend/dist/`. Flask
  serves `dist/index.html` from `/`, hashed bundles from `/assets/*`,
  and the existing image assets from `/static/*` (Flask's default
  static handler).
- **Heroku:** add the Node buildpack BEFORE Python:
  `heroku buildpacks:set heroku/nodejs && heroku buildpacks:add heroku/python`.
  The Node buildpack runs `heroku-postbuild` (root `package.json`),
  which builds the React app; the Python buildpack then installs Flask
  which serves the result. `.nvmrc` pins Node 20.
- **Cleanup:** deleted `public/index.html`, removed the now-empty
  `public/` directory, deleted `static/styles.css` (the single source of
  truth is `frontend/src/styles/global.css`). `static/` still holds
  `background.jpg`, `gift2.png`, etc. — those are referenced by URL
  (`/static/...`) from the bundled CSS and from React components, and
  Flask's default static handler still serves them.
- **Known new debt:**
  - Global CSS grew with the UX pass (~30 KB) — still one file; CSS Modules
    per component remains on the roadmap.
  - No frontend test suite yet (Vitest + React Testing Library is the
    obvious add).
- **Verification:** `tsc -b --noEmit` clean, `vite build` produces
  401 KB JS / 22.6 KB CSS (~111 KB gzipped JS), `vite dev` boots in
  ~140 ms, `python -c "import app"` still imports cleanly.

### 2026-05-09 — Fix JSON regression from vectorization
- Vectorizing `clean_dataframe` made the `my_rating` / `opp_rating` /
  `rating_diff` columns `numpy.int64` instead of plain Python ints
  (the old `iterrows + cleaned_df.at[]` path implicitly converted to
  Python types). Stdlib `json.dump` doesn't know how to serialize
  numpy scalars, so the live pipeline crashed at
  `tests/testing.py:79` with `TypeError: Object of type int64 is not
  JSON serializable`.
- Added a `_json_default(obj)` helper in `tests/testing.py` covering
  numpy scalars/arrays, `pd.Timestamp`, `datetime`/`date`, and
  `pd.Timedelta`. Wired it into the one `json.dump` call.
- Lesson for future work: any time we replace a per-row Python loop
  with a vectorized op, double-check the dtype of any column that
  flows into `json.dump`. The standard fix is to add a `default=`
  helper at the serialization boundary, not to fight pandas dtypes.

### 2026-05-09 — Vectorized clean_dataframe + incremental BigQuery fetch
- **Vectorized `clean_dataframe`** in `src/data/processor.py`:
  - Killed the `df.iterrows()` loop that assigned
    `my_username`/`my_rating`/`my_color`/`my_win_or_lose` etc. — replaced
    with `np.where` over boolean masks.
  - `update_opening` (was `df.apply(axis=1)`) and `rating_diff` (was a
    per-row lambda) are now vectorized.
  - `safe_time_left_ratio` precomputes seconds per UNIQUE `time_control`
    once and `.map()`s it back, instead of re-parsing the same string
    per row.
  - Behavior change: rows where username matches NEITHER white nor black
    are now dropped (with a warning). Old code left the row in place
    with `None` values everywhere, which was a latent bug.
  - Smoke test: 1216 cleaned rows in **0.13 s** (was multi-second).
- **Incremental BigQuery fetch**:
  - New `bigquery_dashboard.get_max_end_time(username)` — Unix high-water
    mark for the user across white_username/black_username (case-insensitive).
  - New `bigquery_dashboard.get_existing_uuids(username, since_end_time=...)`
    — set of UUIDs already loaded; the `since_end_time` window keeps the
    scan cheap.
  - `upload_raw_games` now dedupes against existing UUIDs (scoped to the
    upload window via `min(end_time)`) before APPEND. Re-uploading the
    same games is a no-op.
  - `fetch_all_games` and `fetch_all_games_for_selected_year` accept an
    optional `since_month=(year, month)` kwarg. The high-water month is
    re-fetched (it may have new games), everything strictly before is
    skipped.
  - `tests/testing.py` wires it together: query high-water → derive
    `since_month` → fetch only those months → upload with dedup.
  - End-to-end smoke test against real BigQuery: 4/4 scenarios pass
    (fresh upload, hwm query, re-upload no-op, mixed new+dupe).

### 2026-05-09 — Chess.com fetch performance pass
- Added module-level `CachedSession` (SQLite at `.cache/chesscom.sqlite`)
  with smart per-call TTL (`NEVER_EXPIRE` for past months, 300 s for
  current month / `/archives` index).
- Replaced "walk every month from `joined`" with the
  `/pub/player/{user}/games/archives` endpoint (`fetch_archive_urls`).
  Eliminates wasted 404s on inactive months.
- Bumped `ThreadPoolExecutor` from `max_workers=2` → `8`. The previous
  comment claiming "Chess.com API limits: max 2 simultaneous requests"
  was wrong — there is no documented hard concurrency limit; we keep
  per-call 429 backoff.
- Connection pooling via `HTTPAdapter` + auto-retry on 5xx (not 429 —
  that's handled per-call so we can do exponential backoff).
- Result: cold fetch (1376 games / 12 months) went from "many seconds"
  to **1.77 s**. Warm fetch is **0.03 s** (65× speedup).
- Added `requests-cache==1.3.1` to requirements; added `.cache/` to
  `.gitignore`.

### 2026-05-04 — Repo hygiene pass
- Untracked 51 files: `__pycache__/*.pyc`, `data/csv/*`, `data/json/*`,
  `data/*.xlsx`, `static/images/*.png`. They're regenerated.
- Deleted `api/generate.py` (legacy duplicate of `app.py`).
- Deleted `gcp/requirements.in` (stale, never matched `requirements.txt`).
- Rewrote `README.md` with architecture diagram, real run instructions,
  env var table.
- Added `.env.example`.
- `.python-version` bumped from `3.11` → `3.13` (matched the actual
  installed venv, and `3.11` was wrong).

## Known issues / debt

- **`process_game` runs in a `ThreadPoolExecutor`** but it's pure-Python
  CPU-bound (regex parsing) — threads can't help due to the GIL.
  Switch to `ProcessPoolExecutor`, or (better) move PGN parsing into dbt.
- **Pre-existing `SyntaxWarning: invalid escape sequence '\d'`** at
  `src/data/processor.py:352`. It's inside a triple-single-quoted comment
  block (lines 350–354) — those aren't raw strings, so `\d` warns.
  Fix: convert the dead-code block to a real `#` comment, or delete it.
- **Two GCP env vars do the same thing** (`GOOGLE_APPLICATION_CREDENTIALS_JSON`
  vs `GOOGLE_CREDENTIALS`). Pick one, refactor.
- **`app.py` shells out to `tests/testing.py` via `subprocess`.** Should
  import `main()` directly — saves Python interpreter startup, easier to
  debug, lets you stream logs.
- **No test suite.** Adding pytest for `src/data` and `src/stats` (and
  Vitest + React Testing Library for `frontend/src`) is high ROI before
  the dbt migration. The smoke tests we run by hand should become real
  tests.
- **No dbt project yet.** `raw_games` is loaded but transformations still
  run in pandas. The plan is documented in `DBT_PROJECT_STRUCTURE.md`
  and friends; needs to be initialized (`dbt init` + write `stg_*`,
  `int_*`, `fct_*`/`dim_*` models). Until that's live, the "stop
  processing in Python" item from the perf roadmap is blocked.
- **Year selector value/label mismatch** — **resolved May 2026:** options now
  come from `frontend/src/lib/yearOptions.ts` with matching value/label
  calendar years (same string sent to `/generate` as shown in the UI).
- **Global stylesheet is still monolithic** (~30 KB at
  `frontend/src/styles/global.css`). Best practice would be to split per
  component into CSS Modules — gradual migration, not a blocker.

## When making changes

- Network-touching code in `src/data/processor.py`? Use `_session.get`,
  not `requests.get`. Choose a TTL via `expire_after=` if it's not the
  default 5 min.
- Adding a Python dependency? Pin it (`pkg==X.Y.Z`) in `requirements.txt`.
  We don't have `requirements.in` / pip-tools — `requirements.txt` is
  the source of truth.
- Adding a frontend dependency? `cd frontend && npm install <pkg>`.
  Caret ranges in `frontend/package.json` are fine — there's a lockfile.
- Touching the React app? Run `npm run typecheck` in `frontend/` before
  committing. CI will eventually do it for you, but right now there is
  no CI.
- New `/generate` response field? Update `frontend/src/types/stats.ts`
  in the same change so the TypeScript stays accurate. Adding it to the
  Python `response_data` dict in `app.py` without a type update is a
  silent drift.
- Touching the dbt-related side? Read the docs in repo root first:
  `DBT_QUICK_START.md`, `DBT_PROJECT_STRUCTURE.md`, `DBT_MIGRATION_NOTES.md`,
  `RAW_API_SCHEMA.md`, `RAW_DATA_UPLOAD.md`, `TRANSFORMATION_ANALYSIS.md`,
  `SQL_EXAMPLES.md`. There's a lot of context there.

## How to update this skill

Append to the **Decision log** with date + 2–6 bullets summarizing
what changed and why, every time a meaningful change lands. If a known
issue gets fixed, move it from "Known issues" to a new line in the
decision log.
