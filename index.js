// index.js
import express from "express";
import cors from "cors";
import pkg from "pg";
import jwt from "jsonwebtoken";

import authKocRouter from "./routes/authKoc.js";

const { Pool } = pkg;
const app = express();

// --- CORS setup ---
const allowedOrigins = [
  "https://www.kingsofchaos.com",
  "http://localhost:3000"
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn("Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS: " + origin));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

// --- Database setup ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

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
    next();
  } catch (err) {
    console.error("JWT verification failed:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// --- Public route: Auth ---
app.use("/auth/koc", authKocRouter);

// --- Helper: convert snake_case to camelCase ---
function camelize(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camelKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camelKey] = v;
  }
  return out;
}

// --- Helper: coerce bigint/text stats into real numbers ---
function normalizeRow(row) {
  const c = camelize(row);
  const numFields = [
    "tiv","strikeAction","defensiveAction","spyRating","sentryRating",
    "poisonRating","antidoteRating","theftRating","vigilanceRating",
    "economy","xpPerTurn","turnsAvailable","treasury","projectedIncome"
  ];
  numFields.forEach(f => {
    if (c[f] !== null && c[f] !== undefined) {
      const n = Number(c[f]);
      c[f] = isNaN(n) ? null : n;
    }
  });
  return c;
}

// --- Protected routes ---
app.get("/players", requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM players ORDER BY updated_at DESC");
    res.json(rows.map(normalizeRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Get single player by ID ---
app.get("/players/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(normalizeRow(rows[0]));
  } catch (err) {
    console.error("/players/:id DB error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Helper: clean numbers into BIGINT/null ---
function toBigInt(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") {
    const clean = val.replace(/,/g, "").replace(/[^\d]/g, "");
    if (clean === "" || val === "???") return null;
    return BigInt(clean);
  }
  if (typeof val === "number") return BigInt(val);
  try {
    return BigInt(val);
  } catch {
    return null;
  }
}

// --- Upsert player with full stats + per-stat timestamps ---
app.post("/players", requireAuth, async (req, res) => {
  try {
    const {
      id, name, alliance, army, race, rank, tiv,
      strikeAction, strikeActionTime,
      defensiveAction, defensiveActionTime,
      spyRating, spyRatingTime,
      sentryRating, sentryRatingTime,
      poisonRating, poisonRatingTime,
      antidoteRating, antidoteRatingTime,
      theftRating, theftRatingTime,
      vigilanceRating, vigilanceRatingTime,
      economy, xpPerTurn, turnsAvailable, treasury, projectedIncome
    } = req.body;

    const { rows } = await pool.query(`
      INSERT INTO players (
        id, name, alliance, army, race, rank, tiv,
        strike_action, strike_action_time,
        defensive_action, defensive_action_time,
        spy_rating, spy_rating_time,
        sentry_rating, sentry_rating_time,
        poison_rating, poison_rating_time,
        antidote_rating, antidote_rating_time,
        theft_rating, theft_rating_time,
        vigilance_rating, vigilance_rating_time,
        economy, xp_per_turn, turns_available, treasury, projected_income,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9, $10,$11,
        $12,$13, $14,$15,
        $16,$17, $18,$19,
        $20,$21, $22,$23,
        $24,$25,$26,$27,$28,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = CASE 
          WHEN EXCLUDED.name IS NOT NULL 
            AND EXCLUDED.name != '' 
            AND EXCLUDED.name != '???' 
          THEN EXCLUDED.name 
          ELSE players.name 
        END,
        
        alliance = CASE 
          WHEN EXCLUDED.alliance IS NOT NULL 
            AND EXCLUDED.alliance != '' 
            AND EXCLUDED.alliance != '???' 
          THEN EXCLUDED.alliance 
          ELSE players.alliance 
        END,
        
        army = CASE 
          WHEN EXCLUDED.army IS NOT NULL 
            AND EXCLUDED.army != '' 
            AND EXCLUDED.army != '???' 
          THEN EXCLUDED.army 
          ELSE players.army 
        END,
        
        race = CASE 
          WHEN EXCLUDED.race IS NOT NULL 
            AND EXCLUDED.race != '' 
            AND EXCLUDED.race != '???' 
          THEN EXCLUDED.race 
          ELSE players.race 
        END,
        
        rank = CASE 
          WHEN EXCLUDED.rank IS NOT NULL 
            AND EXCLUDED.rank != '' 
            AND EXCLUDED.rank != '???' 
          THEN EXCLUDED.rank 
          ELSE players.rank 
        END,
        
        tiv = COALESCE(EXCLUDED.tiv, players.tiv),

        strike_action      = COALESCE(EXCLUDED.strike_action, players.strike_action),
        strike_action_time = COALESCE(EXCLUDED.strike_action_time, players.strike_action_time),

        defensive_action      = COALESCE(EXCLUDED.defensive_action, players.defensive_action),
        defensive_action_time = COALESCE(EXCLUDED.defensive_action_time, players.defensive_action_time),

        spy_rating      = COALESCE(EXCLUDED.spy_rating, players.spy_rating),
        spy_rating_time = COALESCE(EXCLUDED.spy_rating_time, players.spy_rating_time),

        sentry_rating      = COALESCE(EXCLUDED.sentry_rating, players.sentry_rating),
        sentry_rating_time = COALESCE(EXCLUDED.sentry_rating_time, players.sentry_rating_time),

        poison_rating      = COALESCE(EXCLUDED.poison_rating, players.poison_rating),
        poison_rating_time = COALESCE(EXCLUDED.poison_rating_time, players.poison_rating_time),

        antidote_rating      = COALESCE(EXCLUDED.antidote_rating, players.antidote_rating),
        antidote_rating_time = COALESCE(EXCLUDED.antidote_rating_time, players.antidote_rating_time),

        theft_rating      = COALESCE(EXCLUDED.theft_rating, players.theft_rating),
        theft_rating_time = COALESCE(EXCLUDED.theft_rating_time, players.theft_rating_time),

        vigilance_rating      = COALESCE(EXCLUDED.vigilance_rating, players.vigilance_rating),
        vigilance_rating_time = COALESCE(EXCLUDED.vigilance_rating_time, players.vigilance_rating_time),

        economy         = COALESCE(EXCLUDED.economy, players.economy),
        xp_per_turn     = COALESCE(EXCLUDED.xp_per_turn, players.xp_per_turn),
        turns_available = COALESCE(EXCLUDED.turns_available, players.turns_available),
        treasury        = COALESCE(EXCLUDED.treasury, players.treasury),
        projected_income = COALESCE(EXCLUDED.projected_income, players.projected_income),
        updated_at = NOW()
      RETURNING *`,
      [
        id, name, alliance, army, race, rank, toBigInt(tiv),

        toBigInt(strikeAction), strikeActionTime,
        toBigInt(defensiveAction), defensiveActionTime,
        toBigInt(spyRating), spyRatingTime,
        toBigInt(sentryRating), sentryRatingTime,
        toBigInt(poisonRating), poisonRatingTime,
        toBigInt(antidoteRating), antidoteRatingTime,
        toBigInt(theftRating), theftRatingTime,
        toBigInt(vigilanceRating), vigilanceRatingTime,

        toBigInt(economy), toBigInt(xpPerTurn),
        toBigInt(turnsAvailable), toBigInt(treasury),
        toBigInt(projectedIncome)
      ]
    );

    res.json(normalizeRow(rows[0]));

  } catch (err) {
    console.error("/players DB error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/tiv", requireAuth, async (req, res) => {
  try {
    const { playerId, tiv } = req.body;

    await pool.query(
      `UPDATE players
       SET tiv = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [playerId, toBigInt(tiv)]
    );

    await pool.query(
      `INSERT INTO tiv_logs (player_id, tiv, time)
       VALUES ($1, $2, NOW())`,
      [playerId, toBigInt(tiv)]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("/tiv DB error:", err);
    res.status(500).json({ error: "DB error" });
  }
});

// --- Plain roster page ---
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
  console.log("API running on port", PORT);
});