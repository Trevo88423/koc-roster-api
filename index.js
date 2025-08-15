import express from "express";
import cors from "cors";

const app = express(); // <<< must be before any app.use calls

// Allow all origins for now (can lock down later)
app.use(cors({ origin: true }));
app.options("*", cors({ origin: true }));

// Parse JSON bodies
app.use(express.json({ limit: "5mb" }));

// In-memory data store
let sharedRoster = {};
let lastUpdated = Date.now();

// Health check
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "koc-roster-api", env: process.env.NODE_ENV || "dev" });
});

// Upload data
app.post("/upload", (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "No data" });
  }
  let added = 0, updated = 0;
  for (const [id, record] of Object.entries(data)) {
    if (!sharedRoster[id]) {
      sharedRoster[id] = record;
      added++;
    } else {
      sharedRoster[id] = { ...sharedRoster[id], ...record };
      updated++;
    }
  }
  lastUpdated = Date.now();
  res.json({ message: "Roster updated", added, updated, total: Object.keys(sharedRoster).length });
});

// Download data
app.get("/download", (_req, res) => {
  res.json({ data: sharedRoster, lastUpdated });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
