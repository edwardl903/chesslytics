# Heroku Deployment Guide for ChessLytics

ChessLytics is a Flask + React (Vite + TypeScript) app, so the slug needs
**two buildpacks** in a specific order: Node first (to build the React
bundle in `frontend/dist/`), then Python (to install Flask and run
gunicorn). Missing either piece is the most common cause of failed
deploys.

This guide is the long-form companion to the [Deployment section of the
README](./README.md#deployment). Follow it the first time you deploy or
when reconnecting a fresh clone to an existing Heroku app.

---

## Prerequisites

1. A Heroku account ([heroku.com](https://heroku.com)) with a verified
   payment method (Heroku no longer has a free tier).
2. The Heroku CLI:
   ```bash
   # macOS
   brew tap heroku/brew && brew install heroku

   # Linux
   curl https://cli-assets.heroku.com/install.sh | sh
   ```
   Windows: download the installer from
   [devcenter.heroku.com/articles/heroku-cli](https://devcenter.heroku.com/articles/heroku-cli).
3. Git, and a clone of this repo.
4. A Google Cloud service account JSON with BigQuery `Data Editor` +
   `Job User` roles (used by `api/bigquery_dashboard.py` and
   `src/data/uploader.py`).

---

## What's already in this repo for Heroku

You don't need to add any of this — it's here for context.

- `Procfile` → `web: gunicorn app:app`
- `requirements.txt` (Python deps; pinned, no `requirements.in`)
- `package.json` (root) with `heroku-postbuild` that recurses into
  `frontend/` and runs `npm install && npm run build`
- `.nvmrc` pinning Node 20, plus `engines.node: "20.x"` in both
  `package.json` files
- `frontend/package.json` build scripts (`tsc -b && vite build`)
- `app.py` serves `frontend/dist/index.html` at `/`, hashed bundles at
  `/assets/*`, and SPA fallback for any unmatched GET so React Router
  works on direct navigation.

---

## Step 1 — Log in

```bash
heroku login
```

## Step 2 — Connect your repo to a Heroku app

Pick one:

```bash
# Create a brand new app
heroku create your-chesslytics-app

# OR: you already have a deployed Chesslytics app and want to point
# this clone at it
heroku git:remote -a your-chesslytics-app
```

Confirm the remote is set:

```bash
git remote -v
# heroku  https://git.heroku.com/your-chesslytics-app.git (fetch)
# heroku  https://git.heroku.com/your-chesslytics-app.git (push)
```

## Step 3 — Set buildpacks (Node BEFORE Python)

Order matters. Without the Node buildpack first, `heroku-postbuild`
never runs and the slug ships with no `frontend/dist/` — every request
then returns a 503 "Frontend not built" page from `app.py`.

```bash
heroku buildpacks:clear
heroku buildpacks:set heroku/nodejs
heroku buildpacks:add heroku/python

heroku buildpacks
# Expected:
#   1. heroku/nodejs
#   2. heroku/python
```

## Step 4 — Allow the build to install dev dependencies

The Node buildpack sets `NODE_ENV=production`. `npm install` then skips
`devDependencies`, where this project keeps `typescript`, `vite`, and
`@vitejs/plugin-react`. Without these, the build fails with
`sh: 1: tsc: not found`.

```bash
heroku config:set NPM_CONFIG_PRODUCTION=false
```

## Step 5 — Set application config vars

```bash
# Two env vars, same JSON. api/bigquery_dashboard.py reads the first,
# src/data/uploader.py reads the second. Roadmap: unify these.
heroku config:set GOOGLE_APPLICATION_CREDENTIALS_JSON="$(cat gcp/service_account.json)"
heroku config:set GOOGLE_CREDENTIALS="$(cat gcp/service_account.json)"

heroku config:set FLASK_ENV=production
```

You can confirm with `heroku config`. Never commit
`gcp/service_account.json` — it is `.gitignored`.

## Step 6 — Deploy

```bash
git add .
git commit -m "Deploy to Heroku"
git push heroku main          # or master if that's your default branch
```

If the push prints `Everything up-to-date`, your tree already matches
Heroku's `main` and no new build will run. Force a rebuild with an empty
commit:

```bash
git commit --allow-empty -m "trigger rebuild"
git push heroku main
```

If the push is rejected with `[rejected] main -> main (fetch first)`,
Heroku's branch has unrelated history (e.g. from a previous repo
deployed to the same app). To make this repo the new source of truth,
force-push:

```bash
git push heroku main --force
```

This rewrites only Heroku's Git remote, not GitHub.

## Step 7 — Verify

```bash
heroku open
heroku logs --tail
```

A healthy build log looks like:

```
-----> Using buildpacks:
       1. heroku/nodejs
       2. heroku/python
-----> Node.js app detected
       Resolving node version 20.x...
       Downloading and installing node 20.x.x...
-----> Build
       Running heroku-postbuild
       > cd frontend && npm install && npm run build
       vite v5.x.x building for production...
       dist/index.html ...
       dist/assets/index-<hash>.js ...
-----> Python app detected
       Installing requirements with pip
-----> Discovering process types
       Procfile declares types -> web
-----> Launching...
       Released v__
       https://your-chesslytics-app.herokuapp.com/ deployed to Heroku
```

A healthy boot log looks like:

```
Starting process with command `gunicorn app:app`
[INFO] Starting gunicorn ...
[INFO] Listening at: http://0.0.0.0:<port>
[INFO] Booting worker with pid: ...
BigQuery Dashboard Manager initialized
BigQuery dashboard system enabled
```

Then `GET /` should return HTTP 200 with the React app HTML, not the
503 placeholder.

---

## Troubleshooting

| Symptom                                                | Cause                                                                                | Fix                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Browser shows `503 Frontend not built`                 | `frontend/dist/` missing from the slug; Node buildpack never ran                     | Re-run Step 3, then push again                                                 |
| Build fails with `sh: 1: tsc: not found`               | `NODE_ENV=production` made npm skip `devDependencies`                                | Re-run Step 4 (`NPM_CONFIG_PRODUCTION=false`), then push again                 |
| Build warning "wide range in `engines.node`"           | `engines.node` was previously `>=20`                                                 | Already fixed in this repo (`"node": "20.x"`); rebase if you still see it      |
| Push prints `Everything up-to-date`                    | Local `main` and Heroku `main` match; no new build triggered                         | `git commit --allow-empty -m "rebuild" && git push heroku main`                |
| Push rejected: `[rejected] main -> main (fetch first)` | Heroku's `main` has different history (e.g. an older repo was last deployed to this app) | `git push heroku main --force` (overwrites only Heroku's remote)              |
| Boot log: `Failed to initialize BigQuery client`       | Config vars not set                                                                  | Re-run Step 5 (both `GOOGLE_APPLICATION_CREDENTIALS_JSON` and `GOOGLE_CREDENTIALS`) |
| `/generate` returns 500                                | The data pipeline subprocess failed; check `heroku logs --tail`                      | Look for the Python traceback printed under `tests/testing.py`                 |

---

## Useful commands

```bash
heroku config                    # list config vars
heroku config:get GOOGLE_CREDENTIALS    # check a single var
heroku logs --tail               # stream logs
heroku ps                        # show dyno state
heroku ps:scale web=1            # scale web dyno
heroku restart                   # restart all dynos
heroku run bash                  # open a one-off shell on a dyno
heroku releases                  # list releases / rollback target
heroku rollback v42              # roll back to a previous release
```

---

## Updating

Subsequent deploys are just:

```bash
git add .
git commit -m "Update description"
git push heroku main
```

Buildpacks, env vars, and pinned Node version persist on the app, so
the only step that runs is the build + release.

---

## Security notes

1. `gcp/service_account.json` and `.env` are `.gitignored`; never commit
   them.
2. Heroku gives every app HTTPS automatically.
3. Rotate the BigQuery service account key periodically and re-run Step
   5 when you do.

---

## References

- [Heroku Dev Center](https://devcenter.heroku.com/)
- [Heroku Node.js buildpack](https://devcenter.heroku.com/articles/nodejs-support)
- [Heroku Python buildpack](https://devcenter.heroku.com/articles/python-support)
- [Multiple buildpacks](https://devcenter.heroku.com/articles/using-multiple-buildpacks-for-an-app)
