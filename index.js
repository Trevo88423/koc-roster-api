import express from "express";
import cors from "cors";

const app = express(); // <-- must come before any app.use

// --- Locked CORS: KoC only (plus localhost for testing) ---
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
app.options("*", cors(corsConfig)); // preflight

// --- Body parsing ---
app.use(express.json({ limit: "5mb" }));

// --- Health ---
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "koc-roster-api", env: process.env.NODE_ENV || "dev" });
});

// --- In-memory store (resets on redeploy) ---
let sharedRoster = {};
let lastUpdated = Date.now();

// --- Routes ---
app.post("/upload", (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "No data" });
  }
  let added = 0, updated = 0;
  for (const [id, record] of Object.entries(data)) {
    if (!sharedRoster[id]) { sharedRoster[id] = record; added++; }
    else { sharedRoster[id] = { ...sharedRoster[id], ...record }; updated++; }
  }
  lastUpdated = Date.now();
  res.json({ message: "Roster updated", added, updated, total: Object.keys(sharedRoster).length });
});

app.get("/download", (_req, res) => {
  res.json({ data: sharedRoster, lastUpdated });
});

// --- Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("API running on port", PORT);
});

