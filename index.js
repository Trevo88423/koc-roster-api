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
    // 1. Update latest snapshot
    await pool.query(
  `INSERT INTO players (
     id, name, alliance, race, army, rank, tiv,
     strike_action, defensive_action, spy_rating, sentry_rating,
     poison_rating, antidote_rating, theft_rating, vigilance_rating,
     economy, xp_per_turn, turns_available, treasury, projected_income,
     updated_at
   )
   VALUES (
     $1,$2,$3,$4,$5,$6,$7,
     $8,$9,$10,$11,
     $12,$13,$14,$15,
     $16,$17,$18,$19,$20,
     NOW()
   )
   ON CONFLICT (id) DO UPDATE SET
     name              = COALESCE(EXCLUDED.name, players.name),
     alliance          = COALESCE(EXCLUDED.alliance, players.alliance),
     race              = COALESCE(EXCLUDED.race, players.race),
     army              = COALESCE(EXCLUDED.army, players.army),
     rank              = COALESCE(EXCLUDED.rank, players.rank),
     tiv               = COALESCE(EXCLUDED.tiv, players.tiv),
     strike_action     = COALESCE(EXCLUDED.strike_action, players.strike_action),
     defensive_action  = COALESCE(EXCLUDED.defensive_action, players.defensive_action),
     spy_rating        = COALESCE(EXCLUDED.spy_rating, players.spy_rating),
     sentry_rating     = COALESCE(EXCLUDED.sentry_rating, players.sentry_rating),
     poison_rating     = COALESCE(EXCLUDED.poison_rating, players.poison_rating),
     antidote_rating   = COALESCE(EXCLUDED.antidote_rating, players.antidote_rating),
     theft_rating      = COALESCE(EXCLUDED.theft_rating, players.theft_rating),
     vigilance_rating  = COALESCE(EXCLUDED.vigilance_rating, players.vigilance_rating),
     economy           = COALESCE(EXCLUDED.economy, players.economy),
     xp_per_turn       = COALESCE(EXCLUDED.xp_per_turn, players.xp_per_turn),
     turns_available   = COALESCE(EXCLUDED.turns_available, players.turns_available),
     treasury          = COALESCE(EXCLUDED.treasury, players.treasury),
     projected_income  = COALESCE(EXCLUDED.projected_income, players.projected_income),
     updated_at        = NOW()`,
  [
    id,
    fields.name || null,
    fields.alliance || null,
    fields.race || null,
    fields.army || null,
    fields.rank || null,
    fields.tiv || null,
    fields.strikeAction || null,
    fields.defensiveAction || null,
    fields.spyRating || null,
    fields.sentryRating || null,
    fields.poisonRating || null,
    fields.antidoteRating || null,
    fields.theftRating || null,
    fields.vigilanceRating || null,
    fields.economy || null,
    fields.xpPerTurn || null,
    fields.turnsAvailable || null,
    fields.treasury || null,
    fields.projectedIncome || null
  ]
);


    // 2. Save snapshot history
    await pool.query(
      "INSERT INTO player_snapshots (player_id, data) VALUES ($1, $2)",
      [id, fields]
    );

    res.json({ ok: true, id });
  } catch (err) {
    console.error("❌ /players insert failed", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Get all players (latest data merged with snapshot) ---
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

    // helper: remap DB snake_case → client camelCase
    function toCamel(r) {
      return {
        id: r.id,
        name: r.name,
        alliance: r.alliance,
        race: r.race,
        army: r.army,
        rank: r.rank,
        tiv: r.tiv,
        updatedAt: r.updated_at,

        // remap known stats
        strikeAction: r.strike_action,
        defensiveAction: r.defensive_action,
        spyRating: r.spy_rating,
        sentryRating: r.sentry_rating,
        poisonRating: r.poison_rating,
        antidoteRating: r.antidote_rating,
        theftRating: r.theft_rating,
        vigilanceRating: r.vigilance_rating,
        economy: r.economy,
        xpPerTurn: r.xp_per_turn,
        turnsAvailable: r.turns_available,
        treasury: r.treasury,
        projectedIncome: r.projected_income,

        // include anything extra from snapshot JSON
        ...(r.snapshot || {})
      };
    }

    const players = result.rows.map(toCamel);
    res.json(players);
  } catch (err) {
    console.error("❌ /players query failed", err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Get single player (merged with latest snapshot) ---
app.get("/players/:id", async (req, res) => {
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
      WHERE p.id = $1
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: "Not found" });

    const r = result.rows[0];
    res.json({
      id: r.id,
      name: r.name,
      alliance: r.alliance,
      race: r.race,
      army: r.army,
      rank: r.rank,
      tiv: r.tiv,
      updated_at: r.updated_at,
      ...(r.snapshot || {})
    });
  } catch (err) {
    console.error("❌ /players/:id query failed", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Get all snapshots for a player ---
app.get("/snapshots/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT time, data FROM player_snapshots WHERE player_id = $1 ORDER BY time ASC",
      [id]
    );
    res.json({ player_id: id, snapshots: result.rows });
  } catch (err) {
    console.error("❌ /snapshots query failed", err.message);
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
    console.error("❌ /tiv insert failed", err.message);
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
    console.error("❌ /tiv query failed", err.message);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Plain Roster Page (debug) ---
app.get("/roster", async (_req, res) => {
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
    console.error("❌ /roster query failed", err.message);
    res.status(500).send("Error loading roster");
  }
});

// --- Start server ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("API running on port", PORT);
});
