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

// --- Health ---
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "koc-roster-api", env: process.env.NODE_ENV || "dev" });
});

// --- Temporary route to initialize DB ---
app.get("/initdb", async (_req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT,
        alliance TEXT,
        race TEXT,
        army TEXT,
        rank TEXT,
        tiv BIGINT,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS tiv_logs (
        id SERIAL PRIMARY KEY,
        player_id TEXT REFERENCES players(id),
        tiv BIGINT,
        time TIMESTAMP DEFAULT NOW()
      );
    `);

    res.json({ ok: true, message: "Tables created/verified" });
  } catch (err) {
    console.error("DB init failed", err);
    res.status(500).json({ error: err.message });
  }
});

// --- Player routes ---
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

app.get("/players", async (_req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players ORDER BY updated_at DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

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
app.post("/tiv", async (req, res) => {
  const { playerId, tiv } = req.body || {};
  if (!playerId || !tiv) return res.status(400)
