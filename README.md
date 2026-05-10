# Chesslytics

A personal chess analytics platform. Enter a Chess.com username and get a
generated stats page plus an embedded Looker Studio dashboard backed by
BigQuery.

> This repo is the **experimental** branch of the project — it adds a
> BigQuery + dbt pipeline on top of the original Flask app.

---

## What this app does

```
                                  ┌──────────────────────────────┐
                                  │  React SPA (frontend/, Vite) │
                                  └──────────────┬───────────────┘
                                                 │  POST /generate
                                                 ▼
Chess.com API ──▶ Flask app (app.py) ──▶ BigQuery (raw_games)
                       │                       │
                       ├─▶ Pandas processing   └─▶ dbt models (planned)
                       │     ├─ statistics JSON          │
                       │     ├─ matplotlib PNGs          ▼
                       │     └─ CSV / XLSX export   Looker Studio dashboard
                       │                            (iframed in the React app)
                       └─▶ Serves built React bundle from frontend/dist
```

1. The React app POSTs `{username, year}` to `/generate`.
2. `app.py` shells out to `tests/testing.py` which:
   - fetches all monthly game archives for the user from the Chess.com
     public API (`src/data/processor.py`)
   - cleans and enriches the data into a pandas DataFrame
   - computes statistics (`src/stats/analysis.py`)
   - generates matplotlib/seaborn charts as PNGs in `static/images/`
   - writes per-user CSV / JSON / XLSX into `data/`
   - uploads the **raw, unflattened** Chess.com response into the
     `raw_games` table in BigQuery (`api/bigquery_dashboard.py`)
3. `app.py` returns the stats JSON and the embed config for a personalized
   Looker Studio dashboard.
4. The React app (`frontend/`, Vite + TypeScript) renders the stats grid,
   special game highlights, and the embedded dashboard.

The intent is to migrate transformations out of pandas and into **dbt**
running on top of `raw_games`. See the dbt docs in this repo:

- [`DBT_QUICK_START.md`](./DBT_QUICK_START.md)
- [`DBT_PROJECT_STRUCTURE.md`](./DBT_PROJECT_STRUCTURE.md)
- [`DBT_MIGRATION_NOTES.md`](./DBT_MIGRATION_NOTES.md)
- [`RAW_API_SCHEMA.md`](./RAW_API_SCHEMA.md)
- [`RAW_DATA_UPLOAD.md`](./RAW_DATA_UPLOAD.md)
- [`TRANSFORMATION_ANALYSIS.md`](./TRANSFORMATION_ANALYSIS.md)
- [`SQL_EXAMPLES.md`](./SQL_EXAMPLES.md)

---

## Repository layout

```
chesslyzer-experimental/
├── app.py                       # Flask entrypoint (production)
├── Procfile                     # Heroku: `web: gunicorn app:app`
├── package.json                 # Root build orchestrator (heroku-postbuild)
├── .nvmrc                       # Node version pin (20)
├── requirements.txt             # Python dependencies
├── .python-version              # Target Python version (3.13)
├── .env.example                 # Template for local env vars
│
├── frontend/                    # React + Vite + TypeScript SPA
│   ├── package.json
│   ├── vite.config.ts           # Dev proxies /generate, /api, /static -> Flask
│   ├── tsconfig*.json
│   ├── index.html               # Vite entry
│   ├── src/
│   │   ├── main.tsx             # React root
│   │   ├── App.tsx              # Router + ErrorBoundary
│   │   ├── pages/               # HomePage + Coming Soon stubs + About
│   │   ├── components/          # Layout, Navigation, ChessForm, ResultsView, …
│   │   ├── lib/                 # api client + chess quotes data
│   │   ├── types/               # TypeScript types for /generate response
│   │   └── styles/global.css    # Single global stylesheet (was static/styles.css)
│   └── dist/                    # Built bundle (gitignored, served by Flask in prod)
│
├── static/
│   ├── background.jpg, gift2.png, …  # Image assets, served by Flask at /static/*
│   └── images/                       # Generated chart PNGs (gitignored)
│
├── src/                         # Core Python package
│   ├── data/
│   │   ├── processor.py         # Chess.com fetch + DataFrame cleaning
│   │   └── uploader.py          # Generic BigQuery upload helpers
│   ├── stats/
│   │   └── analysis.py          # Aggregate statistics
│   └── visualizations/
│       └── plots.py             # matplotlib / seaborn charts
│
├── api/
│   ├── __init__.py
│   └── bigquery_dashboard.py    # Raw upload + Looker Studio embed config
│
├── tests/
│   └── testing.py               # CLI runner: `python tests/testing.py <user> <year>`
│
├── data/                        # Per-user CSV / JSON / XLSX (gitignored)
├── gcp/
│   └── service_account.json     # GCP credentials (gitignored)
│
└── docs:
    ├── DBT_QUICK_START.md
    ├── DBT_PROJECT_STRUCTURE.md
    ├── DBT_MIGRATION_NOTES.md
    ├── RAW_API_SCHEMA.md
    ├── RAW_DATA_UPLOAD.md
    ├── TRANSFORMATION_ANALYSIS.md
    ├── SQL_EXAMPLES.md
    └── HEROKU_DEPLOYMENT.md
```

> Note: the directory is named `tests/` for historical reasons but the
> file inside is the CLI runner, not pytest tests. There is no test suite
> yet — adding one is on the roadmap.

---

## Prerequisites

- Python **3.13** (see `.python-version`)
- Node **20+** (see `.nvmrc`)
- A Google Cloud project with BigQuery enabled and a **service account
  key** (JSON) with `BigQuery Data Editor` + `BigQuery Job User` roles
- (Optional) A Chess.com account / username to test against (the API is
  public and doesn't require auth)
- (Optional) [Stockfish](https://stockfishchess.org/) if you extend this
  with engine evaluation: `brew install stockfish`

---

## Local setup

> **⚠️ Use Python 3.13 explicitly.** Several pinned packages (`numpy`,
> `scipy`, `pandas`, `pyarrow`) don't yet ship wheels for Python 3.14, so
> `python3 -m venv` will fail at install time on machines where
> `python3` resolves to 3.14 (e.g. fresh Homebrew). Use `python3.13`.

```bash
# 1. Clone and enter the repo
git clone <this-repo>
cd chesslyzer-experimental

# 2. Backend: create a virtual environment with Python 3.13 specifically
python3.13 -m venv venv            # NOT plain `python3 -m venv`
source venv/bin/activate           # Windows: venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt

# 3. Frontend: install Node deps
cd frontend && npm install && cd ..

# 4. Configure environment
cp .env.example .env
#   → Either drop your service account JSON at gcp/service_account.json
#     OR fill GOOGLE_APPLICATION_CREDENTIALS_JSON / GOOGLE_CREDENTIALS in .env
```

### Running it

There are two modes:

**Development (recommended while iterating on UI):** two processes,
hot-reload everything.

```bash
# Terminal 1 — Flask backend on :5001
python app.py

# Terminal 2 — Vite dev server on :5173 (proxies /generate, /api, /static -> Flask)
cd frontend && npm run dev
```

Open `http://localhost:5173`. Edits to `frontend/src/**` hot-reload
instantly; backend changes require a Flask restart.

**Production-mode (single port, like Heroku):** build the React bundle
once, then let Flask serve it directly.

```bash
cd frontend && npm run build && cd ..
python app.py
# → http://localhost:5001  (serves frontend/dist/index.html + assets)
```

Either way, enter a Chess.com username and a year, and the page will fill
in with stats, charts and the embedded dashboard.

### Running just the data pipeline (no Flask)

Useful while iterating on the processing or BigQuery logic:

```bash
python tests/testing.py <chesscom_username> <year>
# year = 4-digit year, or "0000" for ALL years
python tests/testing.py EdwardL903 2024
python tests/testing.py EdwardL903 0000
```

Outputs land in:

- `data/csv/<username>.csv`
- `data/json/<username>.df.json`
- `data/json/<username>_statistics.json`
- `data/<username>.xlsx`
- `static/images/image_*.png`
- BigQuery: `crucial-decoder-462021-m4.test1.raw_games` (append)

---

## Configuration

All configuration is via environment variables. Copy `.env.example` to
`.env` and edit it. The Flask app does **not** auto-load `.env` today,
so when running locally, source it first:

```bash
set -a && source .env && set +a
python app.py
```

Variables:

| Variable                              | Used by                          | Notes                                               |
| ------------------------------------- | -------------------------------- | --------------------------------------------------- |
| `PORT`                                | `app.py`                         | Defaults to `5001`. Heroku sets it automatically.   |
| `FLASK_ENV`                           | Flask                            | `development` locally, `production` on Heroku.      |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | `api/bigquery_dashboard.py`      | Full service-account JSON, on one line.             |
| `GOOGLE_CREDENTIALS`                  | `src/data/uploader.py`           | Same JSON. Set both — the two modules read different vars (TODO: unify). |

For local dev you can skip the env vars entirely and just put the file at
`gcp/service_account.json` — both modules fall back to it.

The BigQuery project / dataset / table names are currently hard-coded in
`api/bigquery_dashboard.py`:

```python
self.project_id  = "crucial-decoder-462021-m4"
self.dataset_id  = "test1"
self.games_table = "megachessdataset"
```

Update those if you're pointing at a different project.

---

## Deployment

This app is deployed to **Heroku**. Full walkthrough:
[`HEROKU_DEPLOYMENT.md`](./HEROKU_DEPLOYMENT.md). Short version:

```bash
heroku login
heroku create your-chesslytics-app

# Two buildpacks: Node first (builds React), then Python (installs Flask).
# Order matters — Heroku runs `heroku-postbuild` (which runs `npm run build`
# in frontend/) during the Node phase, then Flask serves the resulting
# frontend/dist/ in production.
heroku buildpacks:set heroku/nodejs
heroku buildpacks:add heroku/python

# Push GCP credentials as env vars (the file itself is gitignored)
heroku config:set GOOGLE_APPLICATION_CREDENTIALS_JSON="$(cat gcp/service_account.json)"
heroku config:set GOOGLE_CREDENTIALS="$(cat gcp/service_account.json)"
heroku config:set FLASK_ENV=production

git push heroku main
heroku open
```

There's also a helper script: `./deploy_to_heroku.sh`.

---

## dbt (planned / in-progress)

The Python pipeline currently writes both raw and transformed data to
BigQuery. The migration plan is:

1. Keep `raw_games` as the only Python-written table (already done).
2. Move all transformations into a sibling dbt project (`stg_*`,
   `int_*`, `fct_*`, `dim_*`).
3. Point Looker Studio at the dbt mart tables instead of the
   pandas-generated ones.

To start the dbt project:

```bash
pip install dbt-bigquery
dbt init chesslytics-dbt
```

See [`DBT_QUICK_START.md`](./DBT_QUICK_START.md) for the recommended
profile and model layout.

---

## Development conventions

- Generated artifacts (`data/csv/`, `data/json/`, `data/*.xlsx`,
  `static/images/`, `frontend/dist/`, `frontend/node_modules/`,
  `__pycache__/`) are **not** tracked. They're regenerated on every run.
  See `.gitignore`.
- Secrets (`gcp/service_account.json`, `.env`, anything `*.pem`/`*.key`)
  are **never** committed.
- The Flask app currently launches the data pipeline via `subprocess`.
  For a refactor, importing `tests.testing.main` directly would be
  cleaner — there's a TODO for this.
- The React app is the **only** UI. The legacy `public/index.html` and
  `static/styles.css` were removed when the frontend was ported; the
  global stylesheet now lives at `frontend/src/styles/global.css`.
- There is no test suite yet (`tests/testing.py` is just a CLI runner).
  Adding pytest coverage to `src/` and Vitest coverage to `frontend/src/`
  is high value.

---

## Roadmap

- [ ] Add a real `tests/` suite (pytest) for `src/data`, `src/stats` and
      Vitest + React Testing Library for `frontend/src`.
- [ ] Unify the two BigQuery credential env vars
      (`GOOGLE_CREDENTIALS` vs `GOOGLE_APPLICATION_CREDENTIALS_JSON`).
- [ ] Move `clean_dataframe` transformations into dbt (see
      `TRANSFORMATION_ANALYSIS.md`).
- [ ] Replace `subprocess.run` from `app.py` with a direct import of the
      pipeline.
- [ ] Mobile polish: further tighten `frontend/src/styles/global.css` or
      migrate hot paths to CSS Modules (sheet is ~30 KB after UX pass).
- [ ] Add filter buttons for live/Blitz/Rapid/Bullet/Daily.
- [ ] Configurable BigQuery project / dataset (currently hard-coded).
