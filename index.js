import express from "express";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;
const app = express();

// --- Serve static files (optional) ---
app.use(express.static("public"));

// --- CORS: KoC + localhost only ---
const allowedOrigins = new Set([
  "https://www.kingsofchaos.com",
  "https://kingsofchaos.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
]);
const corsConfig = {
  origin(origin, cb) {
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    cb(new Error("CORS not allowed for origin: " + origin));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 86400
};
app.use(cors(corsConfig));
app.options("*", cors(corsConfig));

// --- Bearer token auth ---
const TOKEN = process.env.API_TOKEN || "";
app.use((req, res, next) => {
  if (!TOKEN) return next();
  const auth = req.get("Authorization") || "";
  if (auth === `Bearer ${TOKEN}`) return next();
  res.status(401).json({ error: "Unauthorized" });
});

// --- Body parsing ---
app.use(express.json({ limit: "5mb" }));

// --- Database connection ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
});

// --- Helper: convert snake_case → camelCase ---
function toCamelCase(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

// --- Health check ---
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "koc-roster-api", env: process.env.NODE_ENV || "dev" });
});

// --- Player routes ---
// Upsert player
app.post("/players", async (req, res) => {
  const { id, ...fields } = req.body || {};
  if (!id) return res.status(400).json({ error: "Missing player id" });
  try {
    // 1. Update latest snapshot
    await pool.query(
      `INSERT INTO players (id, name, alliance, race, army, rank, tiv, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (id) DO UPDATE
         SET name = COALESCE(EXCLUDED.name, players.name),
             alliance = COALESCE(EXCLUDED.alliance, players.alliance),
             race = COALESCE(EXCLUDED.race, players.race),
             army = COALESCE(EXCLUDED.army, players.army),
             rank = COALESCE(EXCLUDED.rank, players.rank),
             tiv = COALESCE(EXCLUDED.tiv, players.tiv),
             updated_at = NOW()`,
      [id, fields.name || null, fields.alliance || null, fields.race || null,
       fields.army || null, fields.rank || null, fields.tiv || null]
    );

    // 2. Save snapshot history
    await pool.query(
      "INSERT INTO player_snapshots (player_id, data) VALUES ($1, $2)",
      [id, fields]
    );

    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Get all players ---
app.get("/players", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.name, p.alliance, p.race, p.army, p.rank, p.tiv, p.updated_at,
             s.data AS snapshot
      FROM players p
      LEFT JOIN LATERAL (
        SELECT data
        FROM player_snapshots s
        WHERE s.player_id = p.id
        ORDER BY s.time DESC
        LIMIT 1
      ) s ON true
      ORDER BY p.updated_at DESC
    `);

    const players = result.rows.map(r => {
      const base = toCamelCase(r);
      const snapshot = r.snapshot ? toCamelCase(r.snapshot) : {};
      return { ...base, ...snapshot };
    });

    res.json(players);
  } catch (err) {
    console.error("❌ /players query failed", err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Get single player ---
app.get("/players/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players WHERE id=$1", [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(toCamelCase(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Get all snapshots for a player ---
app.get("/snapshots/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT time, data FROM player_snapshots WHERE player_id = $1 ORDER BY time ASC",
      [req.params.id]
    );
    res.json({
      playerId: req.params.id,
      snapshots: result.rows.map(r => ({ ...toCamelCase(r), ...toCamelCase(r.data) }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- TIV routes ---
app.post("/tiv", async (req, res) => {
  const { playerId, tiv } = req.body || {};
  if (!playerId || !tiv) return res.status(400).json({ error: "Missing fields" });
  try {
    await pool.query("INSERT INTO tiv_logs (player_id, tiv) VALUES ($1,$2)", [playerId, tiv]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

app.get("/tiv/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT tiv, time FROM tiv_logs WHERE player_id=$1 ORDER BY time DESC",
      [req.params.id]
    );
    res.json(result.rows.map(toCamelCase));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Plain Roster Page ---
app.get("/roster", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players ORDER BY updated_at DESC");

    const rows = result.rows.map(p => `
      <tr>
        ${Object.values(p).map(val => `<td>${val ?? ""}</td>`).join("")}
      </tr>
    `).join("");

    const headers = Object.keys(result.rows[0] || {}).map(h => `<th>${h}</th>`).join("");

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>KoC Roster</title>
        <style>
          body { font-family: Arial, sans-serif; background:#111; color:#eee; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #444; padding: 6px; text-align: left; }
          th { background: #222; }
          tr:nth-child(even) { background: #181818; }
        </style>
      </head>
      <body>
        <h1>KoC Roster (Raw)</h1>
        <table>
          <tr>${headers}</tr>
          ${rows}
        </table>
      </body>
      </html>
    `;
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading roster");
  }
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("API running on port", PORT);
});
