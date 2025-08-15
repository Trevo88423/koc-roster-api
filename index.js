// Simple KoC roster sharing API (free-test version)
import express from "express";
import cors from "cors";

const app = express();

// Adjust the allowed origin if KoC uses a different domain variant
const allowedOrigins = [
  "https://www.kingsofchaos.com",
  "https://kingsofchaos.com"
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like direct curl) or listed origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "5mb" }));

// In-memory store for demo purposes (resets on redeploy)
let sharedRoster = {};
let lastUpdated = Date.now();

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "koc-roster-api", lastUpdated });
});

app.post("/upload", (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "No data" });
  }
  // Merge incoming data into sharedRoster (shallow merge by player id keys)
  let added = 0, updated = 0;
  for (const [id, record] of Object.entries(data)) {
    if (!sharedRoster[id]) {
      sharedRoster[id] = record;
      added++;
    } else {
      // Naive merge: prefer incoming values, keep existing if undefined
      sharedRoster[id] = { ...sharedRoster[id], ...record };
      updated++;
    }
  }
  lastUpdated = Date.now();
  res.json({ message: "Roster updated", added, updated, total: Object.keys(sharedRoster).length });
});

app.get("/download", (_req, res) => {
  res.json({ data: sharedRoster, lastUpdated });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
