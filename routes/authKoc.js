// routes/authKoc.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import { db } from "../index.js";   // import db export from index.js
const r = Router();

// POST /auth/koc
r.post("/", async (req, res) => {
  const { id, name } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: "Missing id or name" });
  }

  // Check player record
  const { rows } = await db.query(
    "SELECT id, name, alliance FROM players WHERE id = $1 LIMIT 1",
    [id]
  );import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { id, name } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: "Missing id or name" });
    }

    // 🔑 Only allow SR members (adjust this check if needed)
    // For now, we assume SR is validated elsewhere or by DB
    // Example: if you had a DB call, you’d check alliance === "Sweet Revenge"

    // ✅ Generate JWT with 12h expiry
    const token = jwt.sign(
      { id, name },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    // ✅ Return token in correct format
    res.json({ token });
  } catch (err) {
    console.error("Auth error", err);
    res.status(500).json({ error: "Auth server error" });
  }
});

export default router;


  const player = rows[0];
  if (!player) {
    return res.status(403).json({ error: "Unknown player" });
  }

  if (player.alliance !== "Sweet Revenge") {
    return res.status(403).json({ error: "Not in Sweet Revenge" });
  }

  // ✅ Create token
  const token = jwt.sign(
    {
      uid: player.id,
      name: player.name,
      alliance: player.alliance,
      role: "member"
    },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.json({ accessToken: token });
});

export default r;
