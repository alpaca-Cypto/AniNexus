# AniNexus

AniNexus is currently split into a Next.js frontend and an emerging Python
backend.

- Frontend documentation: [`frontend/README.md`](../frontend/README.md)
- Backend database and legacy catalog import: [`backend/README.md`](../backend/README.md)
- Stage review and scope reduction: [`阶段开发评审与范围收敛建议.md`](阶段开发评审与范围收敛建议.md)
- Known issues and resolutions: [`项目问题与处理记录.md`](项目问题与处理记录.md)
- Local MySQL and backend API: `docker compose up -d mysql backend`

## One-click development startup (Windows)

Double-click `start.cmd` in the repository root for daily development. The
script starts Docker Desktop and the MySQL container, then opens separate local
development terminals for FastAPI (`uvicorn --reload`) and Next.js (`pnpm dev`).
After both services are ready, it opens `http://localhost:3000` in Google
Chrome.

This development mode requires Docker Desktop, Python 3.12+, and Node.js LTS.
A global pnpm installation is optional because the script can use Corepack or
npx. The project virtual environment and dependencies are created automatically
when missing.

The development script reuses the existing Docker container named `mysql` and
the database connection in `backend/.env`; it does not create or initialize a
new database. If the container has another name, set `MYSQL_CONTAINER_NAME`
before running the script.

PowerShell options are also available:

```powershell
.\scripts\start.ps1 -NoBrowser
.\scripts\start.ps1 -CheckOnly
```

For a reproducibility check with all three services running in containers,
double-click `start-docker.cmd`. It accepts `-NoBrowser`, `-SkipBuild`, and
`-CheckOnly`.

The `search_manga` MySQL database is optional. Its anime and manga catalog can
be imported through the documented SQLAlchemy command, while a fresh AniNexus
installation can start with an empty application database.
