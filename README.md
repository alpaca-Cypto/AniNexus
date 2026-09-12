# AniNexus

AniNexus is currently split into a Next.js frontend and an emerging Python
backend.

- Frontend documentation: [`frontend/README.md`](frontend/README.md)
- Backend database and legacy catalog import: [`backend/README.md`](backend/README.md)
- Local MySQL and backend API: `docker compose up -d mysql backend`

The `search_manga` MySQL database is optional. Its anime and manga catalog can
be imported through the documented SQLAlchemy command, while a fresh AniNexus
installation can start with an empty application database.
