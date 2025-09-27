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
    await pool.query(
      `INSERT INTO players (id, name, alliance, race, army, rank, tiv, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (id) DO UPDATE
         SET name=$2, alliance=$3, race=$4, army=$5, rank=$6, tiv=$7, updated_at=NOW()`,
      [id, fields.name || null, fields.alliance || null, fields.race || null,
       fields.army || null, fields.rank || null, fields.tiv || null]
    );
    res.json({ ok: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// Get all players
app.get("/players", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players ORDER BY updated_at DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// Get single player
app.get("/players/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players WHERE id=$1", [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- TIV routes ---
// Add TIV log
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

// Get TIV history for player
app.get("/tiv/:id", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT tiv, time FROM tiv_logs WHERE player_id=$1 ORDER BY time DESC",
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("API running on port", PORT);
});
