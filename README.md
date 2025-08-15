# KoC Roster API — Free Test Version

Minimal Node.js API to share Kings of Chaos roster data between friends.
Designed to be deployed on a free platform (e.g., Railway) for testing.

## Endpoints
- `GET /` — Health/info
- `POST /upload` — Upload `{ data: { [playerId]: record, ... } }`
- `GET /download` — Download `{ data: { ... } }`

> This demo keeps data **in memory**. It resets on redeploy. For persistence,
> connect a database later (Postgres, SQLite, etc.).

## Local Setup
```bash
npm install
npm start
# http://localhost:3000
```

## Deploy on Railway (free)
1. Create a new GitHub repo and push this project.
2. On [Railway](https://railway.app), create a new project → **Deploy from GitHub** → pick your repo.
3. Wait for build → open the public URL it gives you.
4. Test:
   - `GET {your-url}/` should return `{ ok: true, ... }`
   - `POST {your-url}/upload` with JSON body `{ "data": { "123": { "name":"Test", "tiv": 42 } } }`
   - `GET {your-url}/download` should now include that entry.

## CORS
By default this API allows:
- `https://www.kingsofchaos.com`
- `https://kingsofchaos.com`

If your browser console shows CORS errors, add the exact origin you’re using to the `allowedOrigins` list in `index.js`.

## License
MIT
