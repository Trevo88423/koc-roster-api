import cors from "cors";

const allowedOrigins = new Set([
  "https://www.kingsofchaos.com",
  "https://kingsofchaos.com"
]);

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    cb(new Error("CORS not allowed"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());

// Health
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "koc-roster-api", env: process.env.NODE_ENV || "dev" });
});

// Simple in-memory store (resets on deploy)
let sharedRoster = {};
let lastUpdated = Date.now();

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("API running on port", PORT);
});
