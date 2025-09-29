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

app.post("/players", requireAuth, async (req, res) => {
  try {
    const { id, name, alliance, army, race } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO players (id, name, alliance, army, race, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         alliance = EXCLUDED.alliance,
         army = EXCLUDED.army,
         race = EXCLUDED.race,
         updated_at = NOW()
       RETURNING *`,
      [id, name, alliance, army, race]
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
