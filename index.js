// index.js
import express from "express";
import cors from "cors";
import pkg from "pg";
import jwt from "jsonwebtoken";

import authKocRouter from "./routes/authKoc.js";

const { Pool } = pkg;
const app = express();

app.use(cors());
app.use(express.json());

// --- Database setup ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Export db for routes like authKoc.js
export const db = pool;

// --- JWT Middleware ---
function requireAuth(req, res, next) {
  const auth = req.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next(); // ✅ allow request
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// --- Public route: Auth ---
app.use("/auth/koc", authKocRouter);

// --- Protected routes ---
app.get("/players", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM players ORDER BY updated_at DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Upsert player with full stats, skipping blanks ---
app.post("/players", requireAuth, async (req, res) => {
  try {
    const {
      id, name, alliance, army, race, rank, tiv,
      strikeAction, defensiveAction, spyRating, sentryRating,
      poisonRating, antidoteRating, theftRating, vigilanceRating,
      economy, xpPerTurn, turnsAvailable, treasury, projectedIncome
    } = req.body;

    const { rows } = await pool.query(`
      INSERT INTO players (
        id, name, alliance, army, race, rank, tiv,
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
        name = COALESCE(EXCLUDED.name, players.name),
        alliance = COALESCE(EXCLUDED.alliance, players.alliance),
        army = COALESCE(EXCLUDED.army, players.army),
        race = COALESCE(EXCLUDED.race, players.race),
        rank = COALESCE(EXCLUDED.rank, players.rank),
        tiv = COALESCE(EXCLUDED.tiv, players.tiv),
        strike_action = COALESCE(EXCLUDED.strike_action, players.strike_action),
        defensive_action = COALESCE(EXCLUDED.defensive_action, players.defensive_action),
        spy_rating = COALESCE(EXCLUDED.spy_rating, players.spy_rating),
        sentry_rating = COALESCE(EXCLUDED.sentry_rating, players.sentry_rating),
        poison_rating = COALESCE(EXCLUDED.poison_rating, players.poison_rating),
        antidote_rating = COALESCE(EXCLUDED.antidote_rating, players.antidote_rating),
        theft_rating = COALESCE(EXCLUDED.theft_rating, players.theft_rating),
        vigilance_rating = COALESCE(EXCLUDED.vigilance_rating, players.vigilance_rating),
        economy = COALESCE(EXCLUDED.economy, players.economy),
        xp_per_turn = COALESCE(EXCLUDED.xp_per_turn, players.xp_per_turn),
        turns_available = COALESCE(EXCLUDED.turns_available, players.turns_available),
        treasury = COALESCE(EXCLUDED.treasury, players.treasury),
        projected_income = COALESCE(EXCLUDED.projected_income, players.projected_income),
        updated_at = NOW()
      RETURNING *`,
      [
        id, name, alliance, army, race, rank, tiv,
        strikeAction, defensiveAction, spyRating, sentryRating,
        poisonRating, antidoteRating, theftRating, vigilanceRating,
        economy, xpPerTurn, turnsAvailable, treasury, projectedIncome
      ]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});
app.post("/tiv", requireAuth, async (req, res) => {
  try {
    const { playerId, tiv } = req.body;
    await pool.query(
      "INSERT INTO tiv_logs (player_id, tiv, time) VALUES ($1, $2, NOW())",
      [playerId, tiv]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Plain roster page (for quick debug) ---
app.get("/roster", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM players ORDER BY updated_at DESC");

    const rows = result.rows.map(
      (p) =>
        `<tr>${Object.values(p)
          .map((val) => `<td>${val ?? ""}</td>`)
          .join("")}</tr>`
    );

    const headers = Object.keys(result.rows[0] || {})
      .map((h) => `<th>${h}</th>`)
      .join("");

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
          ${rows.join("")}
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
  console.log("✅ API running on port", PORT);
});
