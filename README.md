# EE Control Panel

Internal web control panel that manages WordPress sites via **EasyEngine** and
automates SEO content publishing. Built with Node.js + Express in a clean
multi-layer MVC architecture (vertical slice modules + a thin services layer).

The panel runs locally on Windows for development and as a Docker container on
Ubuntu (alongside an existing EasyEngine installation) for production.

---

## 1. Features

- Authentication with bcrypt-hashed passwords and role-based access control
  (`SUPER_ADMIN`, `ADMIN`).
- A default `SUPER_ADMIN` is seeded automatically on first run from `.env`.
- `SUPER_ADMIN`s can list, create, activate and deactivate `ADMIN` accounts.
- Site management:
  - List sites (`ee site list`)
  - View site info (`ee site info <domain>`)
  - Create site end-to-end (EE create + WP-CLI configuration: theme,
    plugins, pages, menu, cache flush)
  - Delete site (`ee site delete <domain> --yes`)
- Full SEO content automation pipeline:
  - Generate keywords from a topic
  - Per-keyword config (tone, # outlines, category, publish status)
  - Generate outline → article → fetch images → publish via WP REST API
  - Optional dispatch to an n8n workflow (`N8N_WEBHOOK_URL`) that mirrors the
    structure of the supplied `auto_post_website.json`
- Logs viewer with level + category filters; every command and event lands here.
- i18n: Vietnamese (default) and English, switchable from any page.
- Editorial SaaS dashboard styling — Linear-clean nav, Substack typography,
  Stripe-style pastel tags, all in a single hand-written CSS file.

## 2. Architecture

```
src/
  app.js                       — entry point
  config.js                    — env-driven config
  modules/                     — vertical slices (controllers/services/repos/routes)
    auth/                      — login, sessions, language switch
    users/                     — admin CRUD + activation
    sites/                     — EE site list/create/delete + local cache
    content/                   — SEO job + per-keyword pipeline
    logs/                      — read-only log viewer
    dashboard/                 — landing page
  services/                    — cross-cutting domain services
    commandRunner.js           — hardened spawn() with allow-listed binaries
    easyengineService.js       — wraps `ee site …`
    wordpressService.js        — wraps WP-CLI through `ee shell`
    contentService.js          — keyword/outline/article/image/publish
  infrastructure/db/           — better-sqlite3 connection, migrate, seed
  middleware/                  — auth, RBAC, locals, errors
  i18n/                        — locales (vi.json, en.json)
  views/                       — EJS templates + EJS layouts
  public/css/                  — single CSS file, no build step
```

Design principles:
- **MVC + Service Layer:** controllers stay thin; services own domain logic;
  repositories own SQL.
- **Single responsibility:** every file has one job (e.g., the runner only
  spawns processes, never reads HTTP).
- **No shell strings.** All EasyEngine / WP-CLI calls go through
  `services/commandRunner.js` which:
  - only allows `ee`, `wp`, `docker`
  - takes argv as an **array**
  - validates each argument against a strict regex
  - runs `child_process.spawn` with `shell: false`
  - enforces a timeout

## 3. Quick start (local dev on Windows / macOS / Linux)

```bash
# 1. install deps
npm install

# 2. configure
cp .env.example .env
#   → edit SESSION_SECRET, SUPER_ADMIN_PASSWORD at minimum

# 3. run
npm run dev          # nodemon
# or
npm start            # plain node
```

Then open <http://localhost:3000> and sign in with the credentials from `.env`
(`SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD`).

> EasyEngine is not installed on Windows, so site list/create will fail
> there — but the rest of the panel (auth, users, content automation,
> logs viewer, i18n) runs fine and the sites page will surface a
> friendly "EE refresh failed" notice and fall back to the local cache.

## 4. Deploy on Ubuntu (with EasyEngine installed)

```bash
git clone <this-repo> ee-control-panel
cd ee-control-panel
cp .env.example .env             # edit secrets
docker compose up -d --build
```

`docker-compose.yml` bind-mounts the host `ee` binary, the docker socket and
`/opt/easyengine` into the container so the panel can run real `ee site …`
commands on the host:

```yaml
volumes:
  - ./data:/app/data
  - ./logs:/app/logs
  - /usr/local/bin/ee:/usr/local/bin/ee:ro
  - /var/run/docker.sock:/var/run/docker.sock
  - /opt/easyengine:/opt/easyengine
```

The container ships the docker CLI so `ee` (which talks to docker) keeps
working. Open `http://<server>:3000`.

## 5. Default credentials

On first run the app seeds a single `SUPER_ADMIN`:

```
username : ${SUPER_ADMIN_USERNAME}    (default: superadmin)
password : ${SUPER_ADMIN_PASSWORD}    (default: ChangeMe@123)
```

Sign in, change the password (by creating a fresh super-admin and rotating —
or via direct DB edit), and create `ADMIN` accounts from
`Admins → Create admin`.

## 6. Test flow

After signing in:

1. **Sites → New site** — enter `test.local`, click **Create site**. On a
   real EE host this runs `ee site create test.local --type=wp` and then the
   full WP-CLI configuration pipeline (NewSpare theme + 4 plugins + category
   + 5 pages + primary menu + cache + rewrite flush). Watch progress in
   **Logs**.
2. **Sites → test.local** — view raw EE info, delete with the red button.
3. **Content → New job** — topic = "coffee brewing", keywords = 5, optionally
   pick a site. The keyword list is generated and persisted; configure tone /
   outlines / category per row.
4. **Run all keywords** — provide WP credentials (or an
   application-password). The pipeline generates outline → article → images →
   publishes via `wp-json/wp/v2/posts`. The per-row status pill walks
   `PENDING → OUTLINE → ARTICLE → IMAGES → PUBLISHING → PUBLISHED`.
5. **Send to n8n** — set `N8N_WEBHOOK_URL` in `.env` and the same job is
   POSTed to the workflow as a single JSON payload. The workflow you provided
   in `auto_post_website.json` is the canonical receiver shape.

## 7. Security model

- Every route requires authentication. Admin user management additionally
  requires `SUPER_ADMIN`.
- Passwords are bcrypt-hashed (cost 10).
- All command execution goes through the allow-listed runner. Domain inputs
  are validated against an RFC-1123 regex before they ever reach
  `child_process`. Single-quoted argv is built for the WP-CLI bridge so even
  the inner shell EE spawns can't be tricked.
- Sessions use `httpOnly` cookies; set `secure: true` and trust a reverse
  proxy when serving over HTTPS.

## 8. Extending

- Real AI provider — implement the OpenAI-style branch in
  `services/contentService.js::generateKeywords` (and add equivalents for
  `generateOutline` / `generateArticle`).
- Real image search — replace `fetchImages` with a SerpAPI/Google CSE call
  using the keys already wired into `config.images`.
- New WP-CLI helpers — add to `services/wordpressService.js`; never call
  `commandRunner.run('ee', …)` from a controller directly.
- New roles — extend the `users.role` CHECK constraint in
  `infrastructure/db/migrate.js` and the `requireRole(...)` middleware list.

## 9. Scripts

```
npm start         # production
npm run dev       # nodemon
npm run migrate   # migrations only
npm run seed      # seed super admin only
```

## 10. License

MIT
