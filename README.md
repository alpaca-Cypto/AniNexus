# AniNexus

AniNexus is currently split into a Next.js frontend and an emerging Python
backend.

- Frontend documentation: [`frontend/README.md`](frontend/README.md)
- Backend database and legacy catalog import: [`backend/README.md`](backend/README.md)
- Local MySQL and backend API: `docker compose up -d mysql backend`

## One-click production preview (Windows)

Double-click `start.cmd` (or `start-docker.cmd`) in the repository root to
start the isolated production preview from `compose.production.yaml` and
`compose.production.local-secrets.yaml`. Both launchers use
`.env.production.local` for the secret-file paths and owner ID.
After the services are ready, the launcher opens `http://localhost:3000` in
Google Chrome. The old standalone `mysql` container and `backend/.env` are not
used by these launchers.

Set up the password files and `.env.production.local` as described in
[`docs/production-deployment.md`](docs/production-deployment.md) before starting.
The preview uses a separate MySQL 8.4 volume. Database migrations run when the
backend starts; back up an existing preview database before upgrading.
The launcher copies the passwords into Docker-managed volumes because Docker
Desktop can expose files under a restrictive Windows directory ACL as
directories. The MySQL container sees both passwords; the backend and migration
containers see only the application password. These mounts are read-only, and
the host password files and database volume are left intact. The password
volumes persist after the containers stop and can be repopulated by rerunning
the launcher.

PowerShell options for the production preview:

```powershell
.\scripts\start-docker.ps1 -NoBrowser
.\scripts\start-docker.ps1 -CheckOnly
```

For the original local development setup with hot reload and the old MySQL
container, run `scripts/start.ps1` explicitly. It still reads `backend/.env`.

The `search_manga` MySQL database is optional. Its anime and manga catalog can
be imported through the documented SQLAlchemy command, while a fresh AniNexus
installation can start with an empty application database.
