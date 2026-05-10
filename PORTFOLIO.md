# Chesslytics — Portfolio Writeup

> A self-serve chess analytics web app. Enter your Chess.com username,
> get a personalized stats dashboard backed by BigQuery and embedded
> Looker Studio reporting.

**Live demo:** _(add your Heroku URL here)_
**Code:** _(add your GitHub URL here)_
**Stack:** Python · Flask · pandas · BigQuery · dbt · Looker Studio · matplotlib · Heroku

---

## TL;DR

I built a Flask web app that turns the Chess.com public API into a
personalized analytics dashboard. The interesting part isn't the chart
generation — that's just matplotlib — it's the **data architecture**:
the same fetch that feeds the live web UI also lands raw data in
BigQuery so I can layer dbt models, Looker Studio dashboards, and
incremental analytics on top.

The app is deployed on Heroku and runs against a real GCP project.

---

## What it does (user view)

1. User opens the page, types their Chess.com username and a year.
2. ~2 seconds later the page renders:
   - high-level stats (total games, W/D/L, time played, longest streak,
     biggest upset, favorite openings, etc.)
   - 10+ matplotlib charts (rating-over-time, openings tree map,
     time-of-day heatmap, opponent rating distribution, …)
   - an embedded Looker Studio dashboard pre-filtered to that user
     and year, backed by their now-uploaded BigQuery data.

---

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────┐
│  Browser    │────▶│  Flask app (app.py)              │
│  index.html │     │                                  │
└─────────────┘     │  ┌────────────────────────────┐  │
                    │  │  Chess.com fetch pipeline  │  │
                    │  │  src/data/processor.py     │  │
                    │  │   - /games/archives index  │  │
                    │  │   - 8-worker concurrent    │  │
                    │  │     monthly fetch          │  │
                    │  │   - SQLite HTTP cache      │  │
                    │  │     (requests-cache)       │  │
                    │  └─────────────┬──────────────┘  │
                    │                │                 │
                    │   ┌────────────┴────────────┐    │
                    │   ▼                         ▼    │
                    │ Pandas processing      ┌────────────┐
                    │ ├─ statistics JSON     │ BigQuery   │
                    │ ├─ matplotlib PNGs     │ raw_games  │
                    │ ├─ CSV / XLSX export   │ (append)   │
                    │ └─ frontend payload    └─────┬──────┘
                    └─────────────────┬────────────┘     │
                                      │                  │
                                      ▼                  ▼
                              public/index.html    Looker Studio
                              (renders results)    (embedded, filtered)
                                                          │
                                                          ▼
                                                 (planned) dbt models:
                                                  stg_* → int_* → fct_*
```

Two-pronged data flow on purpose:

- The **Python pipeline** powers the immediate page load — it has to
  finish fast, so it pre-computes JSON and PNGs the frontend can
  render without a round-trip to BigQuery.
- The **BigQuery upload** writes the *raw* Chess.com response (nested
  objects flattened, no transformations applied) into a single
  `raw_games` table. Anything analytical — including replays of past
  transformations — is built on top of this in dbt.

This separation is the key design decision. It means I can iterate on
analytics in SQL without touching the Python serving path, and I can
rebuild any historical metric from raw data instead of re-fetching from
the API.

---

## Engineering highlights

### 1. Made the Chess.com fetch ~5× faster cold and ~65× faster warm

The original fetch had three pessimistic choices:

- Walked every month from `joined` → today, even months with zero games
  (lots of wasted 404s).
- Capped concurrency at 2 workers based on a misread of Chess.com's docs.
- Created a fresh TLS connection per request and never cached anything.

The fixes (see `src/data/processor.py`):

- **Use the `/pub/player/{user}/games/archives` endpoint** to enumerate
  only months that actually have games.
- **8-worker `ThreadPoolExecutor`** with per-call exponential backoff on
  HTTP 429 (Chess.com tolerates this fine in practice).
- **Single `requests-cache.CachedSession` (SQLite backend) with smart
  per-call TTL:** `NEVER_EXPIRE` for completed months (immutable),
  300 s for the current month and the archive index. Connection pooling
  via `HTTPAdapter` and automatic retry on 5xx.

| Scenario | Before | After |
|---|---|---|
| Cold fetch (1376 games / 12 months) | ~9–12 s | **1.77 s** |
| Warm fetch (cache hit) | same | **0.03 s** |

### 2. Raw-first BigQuery loading

Instead of doing pandas transformations, then writing the result to
BigQuery (the typical pattern), I do the opposite: I write the **raw
Chess.com API response** to BigQuery (`raw_games` table, nested objects
flattened). All transformations — date parsing, ECO opening cleanup,
player-perspective calculations, win/loss categorization — are done
either in Python (for the immediate page render) or, on the analytics
side, in **dbt**.

Why: it makes the pipeline replayable. If I want to recompute a metric
historically, I don't have to re-fetch 5 years of API data — I just
re-run the dbt model. It also makes the data layer auditable: anything
in a mart can be traced back to a row in `raw_games`.

The schema flattens nested objects (`white`, `black`, `accuracies`)
to top-level columns so dbt can address them in plain SQL — see
`api/bigquery_dashboard.py::flatten_raw_game`.

### 3. Per-user Looker Studio dashboards via embed config

The single Looker Studio report is parameterized by `username_year`. The
Flask backend builds an embed configuration that pre-filters the report
to the requested user and year, then the frontend embeds it. One
dashboard, infinite users, no per-user dashboard provisioning.

### 4. Dual-credential GCP loading

To support both local development and Heroku without code changes, the
BigQuery client tries env-var-based credentials first
(`GOOGLE_APPLICATION_CREDENTIALS_JSON`, the JSON itself stored in a
Heroku config var) then falls back to the local `gcp/service_account.json`
file. See `api/bigquery_dashboard.py::_get_bigquery_client`.

### 5. Repo hygiene

Untracked all generated artifacts (per-user CSV/JSON/XLSX, matplotlib
PNGs, Python `__pycache__`), strict secrets policy via `.gitignore`
(GCP keys, `.env`, all `*.pem`/`*.key`), and a real `.env.example` so
anyone can stand the project up locally.

---

## Tech stack

| Layer | Tools |
|---|---|
| Backend | Python 3.13, Flask, Flask-Cors, gunicorn |
| Data | pandas, NumPy, scikit-learn (lightweight stats), python-chess |
| HTTP | requests, requests-cache (SQLite backend), urllib3 retry |
| Visualization | matplotlib, seaborn |
| Cloud | Google Cloud BigQuery (raw + transformed), Looker Studio (embedded) |
| Analytics (planned) | dbt (BigQuery adapter) — staging, intermediate, marts |
| Hosting | Heroku |
| Frontend | Vanilla HTML/CSS/JS (single-page) |

---

## Things I learned / decisions I'd defend

- **"Land raw data first" is the right default.** It cost me almost
  nothing to add a `raw_games` table and gave me unlimited replay-ability
  for transformations later. Every project that talks to a third-party
  API should do this.
- **Don't trust comments in old code.** The "max 2 simultaneous
  requests" comment in the fetch had been there forever; reading the
  actual Chess.com docs revealed it was wrong, and the trivial fix gave
  a 4× speedup on the API-bound path.
- **HTTP caching is the highest-ROI optimization for this kind of app.**
  A 9 MB SQLite file converts a "slow site" into an "instant site" for
  any returning user. `requests-cache` made it ~10 lines of code.
- **Two transformation systems is fine, briefly.** The Python pipeline
  and the (planned) dbt pipeline currently both produce stats. That's
  the right state during a migration — kill the Python side once dbt is
  serving the dashboard, not before.

---

## What's next

Honest roadmap (these are real, not aspirational):

1. **Write the dbt project** (`stg_raw_games` → `int_user_games` →
   `fct_games`, `dim_users`, `fct_user_statistics`). Models are
   sketched in [`DBT_PROJECT_STRUCTURE.md`](./DBT_PROJECT_STRUCTURE.md).
2. **Vectorize `clean_dataframe`.** Replace the `iterrows()` loop
   doing player-perspective calcs with `np.where`. ~50–100× speedup
   on processing for power users with 10k+ games.
3. **Incremental fetch.** Query `MAX(end_time)` from `raw_games` per
   user, only fetch months strictly after that. Currently the cache
   prevents re-downloads but a fresh server has no cache; a BigQuery
   high-water-mark query would solve that across deployments.
4. **Replace `subprocess.run` from `app.py`.** Import the pipeline
   directly to skip Python interpreter cold-start (~500 ms saved per
   request).
5. **Add a real test suite.** `tests/` is currently a CLI runner
   misnamed as `tests/`. Pytest coverage on `src/data` and `src/stats`
   is high-leverage before the dbt cutover.

---

## How to run it (so you can demo it)

```bash
git clone <repo>
cd chesslyzer-experimental
python3.13 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Either drop your GCP service account JSON at gcp/service_account.json,
# or copy .env.example to .env and fill in GOOGLE_APPLICATION_CREDENTIALS_JSON.

python app.py
# → http://localhost:5001
```

Heroku deployment walkthrough: [`HEROKU_DEPLOYMENT.md`](./HEROKU_DEPLOYMENT.md).
