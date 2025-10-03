KoC Data Centre v1.6.7

Sweet Revenge Alliance Tool for Kings of Chaos

Tracks stats, syncs to API, adds dashboards, XP→Turn calculator, and a mini Top Stats panel.

✨ Features

Authentication (SR only)

Secure login via /auth/koc endpoint.

Tokens valid for 12 hours with automatic silent refresh.

Access restricted to Sweet Revenge alliance players.

Data Collection

Battlefield Collector: Captures player ID, name, alliance, army size, race, treasury, rank, and recon time.

Attack Page Collector: Saves TIV (Total Invested Value) from attack results.

Armory Collector: Logs your own TIV and full military stats.

Recon Collector: Captures all intel stats, treasury, and income. Falls back to cached values when recons return ???.

Base Page Collector: Captures your own projected income, economy, XP/turn, and military stats.

XP → Turn Calculator

Sidebar widget shows attacks left, XP trade potential, average gold/attack, and total potential gold.

Popup calculator with manual inputs for XP, turns, and average gold.

Banking efficiency % shown as a color-coded pill (red → amber → gold → green).

SR logo shortcut added below calculator.

Attack Log Enhancements

Displays average gold per attack in headers.

Tracks gold lost on defense for banking efficiency stats.

Recon Enhancements

Shows Max Attacks a target can make (XP + Turns).

Auto-fills ??? stats with cached/API values, with time-ago tooltips.

Pulls latest data from API if available, otherwise uses local cache.

UI Panels

Sweet Revenge Mini Stats Panel (on base.php):
RB-style mini leaderboard for TIV, Strike, Defense, Spy, Sentry, Poison, Antidote, Theft, Vigilance, Rank.
Toggle visibility remembered per player.

Data Centre Roster Page (stats.php?id=datacentre):

📜 Roster View: All players with sortable columns.

🏆 Top TIV View: Top players ranked by TIV.

📈 All Stats View: Leaderboards for every stat with alliance filter + top N filter.

Italic formatting for stale (>24h old) stats.

API Integration

/players → upserts stats, with per-stat timestamps.

/tiv → logs TIV history for growth tracking.

JWT-protected endpoints (requires SR login).

🚀 Installation

Install Tampermonkey
 or similar userscript manager.

Install the script from GitHub:
KoC-DataCentre.user.js

Navigate to base.php in KoC and click Login to SR when prompted.

🔐 Authentication

The script automatically detects your KoC ID and Name.

On login, it requests a JWT token from the API:

Only members of Sweet Revenge are granted access.

Token info can be inspected via the Show Token button on login prompt.

Without a valid token:

Most features are disabled.

Only the login prompt shows on base.php.

📊 Backend (API)

Tech stack: Node.js + Express + PostgreSQL (hosted on Railway).

Routes:

POST /auth/koc → login, returns JWT (12h expiry).

GET /players → returns latest player data (JWT required).

POST /players → upserts player stats + timestamps.

POST /tiv → logs TIV snapshots over time.

GET /roster → simple HTML table view of raw DB (debug).

🆕 Changes in 1.6.7

✅ Added SR mini Top Stats panel under base.php (RB-style).

✅ Improved login detection (multiple fallbacks for ID/Name).

✅ Added Show Token button for debugging auth.

✅ Updated banking efficiency display → color-coded pill style.

✅ SR logo now shows under the sidebar XP/Turn calculator.

✅ Recon UI now queries API first before falling back to cache.

✅ Roster page updated to run under stats.php?id=datacentre for compliance.

✅ All stats view now remembers filter selections (alliance, top N).

✅ Multiple bug fixes in caching, stale recon display, and API fallback logic.

⚠️ Notes

Custom pages must use the format stats.php?id=datacentre (per KoC script rules).

Gold values cannot be displayed on custom pages.

Data is shared alliance-wide via the API.