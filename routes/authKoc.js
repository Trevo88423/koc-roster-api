// routes/authKoc.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import { db } from "../index.js";   // import db export from index.js

const router = Router();

// POST /auth/koc
router.post("/", async (req, res) => {
  try {
    const { id, name } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: "Missing id or name" });
    }

    // Check player record in DB
    const { rows } = await db.query(
      "SELECT id, name, alliance FROM players WHERE id = $1 LIMIT 1",
      [id]
    );

    const player = rows[0];
    if (!player) {
      return res.status(403).json({ error: "Unknown player" });
    }

    if (player.alliance !== "Sweet Revenge") {
      return res.status(403).json({ error: "Not in Sweet Revenge" });
    }

    // ✅ Create token (12h expiry)
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

    res.json({ token });
  } catch (err) {
    console.error("❌ Auth error:", err);
    res.status(500).json({ error: "Auth server error" });
  }
});

export default router;
