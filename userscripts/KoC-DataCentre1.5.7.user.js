// ==UserScript==
// @name         KoC Data Centre
// @namespace    trevo88423
// @version      1.5.7
// @description  Tracks TIV + recon stats, syncs to API, provides dashboards & XP→Turn tools.
// @author       Trevor & ChatGPT
// @match        https://www.kingsofchaos.com/*
// @icon         https://www.kingsofchaos.com/favicon.ico
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Trevo88423/koc-roster-api/main/userscripts/KoC-DataCentre.user.js
// @downloadURL  https://raw.githubusercontent.com/Trevo88423/koc-roster-api/main/userscripts/KoC-DataCentre.user.js
// ==/UserScript==

(function() {
  'use strict';

  const ver = (typeof GM_info !== "undefined" && GM_info.script && GM_info.script.version)
              ? GM_info.script.version : "dev";
  console.log(`✅ DataCentre+XPTool v${ver} loaded on`, location.pathname);

  const API_URL  = "https://koc-roster-api-production.up.railway.app";
  const TOKEN_KEY = "KoC_SRAUTH"; // unified storage
  const TIV_KEY  = "KoC_DataCentre"; // local TIV logs
  const MAP_KEY  = "KoC_NameMap";    // cached player snapshots

  // ========================
  // === Auth Management  ===
  // ========================

  function getStoredAuth() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); }
    catch { return null; }
  }

  function saveAuth(token, id, name) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      token, id, name,
      expiry: Date.now() + 12 * 60 * 60 * 1000 // 12h
    }));
  }

  async function getValidToken() {
    const auth = getStoredAuth();
    if (!auth) return null;

    if (Date.now() < auth.expiry) {
      return auth.token; // ✅ still valid
    }

    // 🔄 refresh silently
    try {
      const resp = await fetch(`${API_URL}/auth/koc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: auth.id, name: auth.name })
      });
      if (!resp.ok) throw new Error("Refresh failed " + resp.status);
      const data = await resp.json();
      saveAuth(data.token || data.accessToken, auth.id, auth.name);
      console.log("🔄 Token refreshed automatically");
      return data.token || data.accessToken;
    } catch (err) {
      console.warn("⚠️ Auto refresh failed:", err);
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
  }

 async function loginSR() {
  try {
    // ✅ Look specifically in the User Info table → Name row
    const nameRow = [...document.querySelectorAll("table tr")]
      .find(tr => tr.textContent.includes("Name"));
    const link = nameRow ? nameRow.querySelector("a[href*='stats.php?id=']") : null;

    if (!link) {
      throw new Error("Go to your own Stats page (Profile) first");
    }

    const id = link.href.match(/id=(\d+)/)[1];
    const name = link.textContent.trim();

    // 🪵 Debug helper
    console.log("🔍 Detected login info →", { id, name });

    // 🔑 Request token from API
    const resp = await fetch(`${API_URL}/auth/koc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name })
    });

    if (!resp.ok) throw new Error("Auth failed " + resp.status);
    const data = await resp.json();

    // ✅ Store the token with expiry
    saveAuth(data.token || data.accessToken, id, name);

    alert("✅ SR Login successful! Refreshing…");
    location.reload();
  } catch (err) {
    console.error("Login failed", err);
    alert("❌ Login failed: " + err.message);
  }
}


  function logoutSR() {
    localStorage.removeItem(TOKEN_KEY);
    alert("Logged out.");
    location.reload();
  }

  // Gatekeeper
  (async () => {
    const token = await getValidToken();
    if (!token) {
      if (location.pathname.includes("base.php")) {
        const box = document.createElement("div");
        box.style = "padding:12px;background:#111;color:#fff;border:1px solid #555;margin:12px;font-family:Arial;";
        box.innerHTML = `
          <h2>🔒 KoC Data Centre Login</h2>
          <p>You must log in with SR to enable the script.</p>
          <button id="srLoginBtn" style="padding:6px 12px;cursor:pointer;">Login to SR</button>
        `;
        document.body.prepend(box);
        document.getElementById("srLoginBtn").addEventListener("click", loginSR);
      } else {
        console.warn("🔒 Data Centre disabled — not logged in.");
      }
      return;
    }
    console.log("✅ Authenticated with SR, continuing…");
  })();

  // =========================
  // === Storage Helpers   ===
  // =========================

  function getTivLog() {
    try { return JSON.parse(localStorage.getItem(TIV_KEY) || "[]"); }
    catch { return []; }
  }
  function saveTivLog(arr) { localStorage.setItem(TIV_KEY, JSON.stringify(arr)); }

  function getNameMap() {
    try { return JSON.parse(localStorage.getItem(MAP_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveNameMap(map) { localStorage.setItem(MAP_KEY, JSON.stringify(map)); }

  // =========================
  // === API Communication ===
  // =========================

  async function sendToAPI(endpoint, data) {
    const auth = getStoredAuth();
    if (!auth || Date.now() > auth.expiry) {
      console.warn("⚠️ Skipping API send, no valid token");
      return;
    }

    console.log(`🌐 Preparing API call → ${endpoint}`, data);

    try {
      const resp = await fetch(`${API_URL}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + auth.token
        },
        body: JSON.stringify(data)
      });
      const json = await resp.json().catch(() => ({ error: "Invalid JSON" }));
      console.log(`🌐 API response from ${endpoint}:`, json);
      return json;
    } catch (err) {
      console.error(`❌ API call failed → ${endpoint}`, err);
    }
  }

  // =========================
  // === Player Updates    ===
  // =========================

  function updatePlayerInfo(id, patch) {
    if (!id) return;
    const map = getNameMap();
    const prev = map[id] || {};

    // Clean patch
    const cleanPatch = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== "Unknown" && v !== "" && v != null) {
        cleanPatch[k] = v;
      }
    }

    // Merge + save
    const updated = { ...prev, ...cleanPatch, lastSeen: new Date().toISOString() };
    map[id] = updated;
    saveNameMap(map);

    // Send if changed
    if (JSON.stringify(prev) !== JSON.stringify(updated)) {
      const apiPayload = {};
      for (const [k, v] of Object.entries(updated)) {
        if (v !== "Unknown" && v !== "" && v != null) {
          apiPayload[k] = v;
        }
      }
      sendToAPI("players", { id, ...apiPayload });
    }
  }

  // =========================
  // === Alliance Restrict ===
  // =========================
  const myId = getStoredAuth()?.id;
  const me = getNameMap()[myId];
  if (me && me.alliance !== "Sweet Revenge") {
    alert("❌ This script is restricted to the Sweet Revenge alliance.");
    throw new Error("Unauthorized alliance");
  }



// ==============================
// === XP → Attacks Calculator ===
// ==============================
// Converts XP + Turns into maximum possible attacks
// Used by Sidebar, Popup, Recon pages, etc.
function calculateXPTradeAttacks(xp, turns) {
  const XP_PER_TRADE = 1425;
  const TURNS_PER_TRADE = 500;
  const TURNS_PER_ATTACK = 120;
  const XP_REFUND_PER_ATTACK = 120;

  let attacks = 0;

  // Spend current turns first
  while (turns >= TURNS_PER_ATTACK) {
    turns -= TURNS_PER_ATTACK;
    attacks++;
    xp += XP_REFUND_PER_ATTACK;
  }

  // Trade XP into turns, loop until exhausted
  let traded = true;
  while (traded) {
    traded = false;

    while (xp >= XP_PER_TRADE) {
      xp -= XP_PER_TRADE;
      turns += TURNS_PER_TRADE;
      traded = true;
    }

    while (turns >= TURNS_PER_ATTACK) {
      turns -= TURNS_PER_ATTACK;
      attacks++;
      xp += XP_REFUND_PER_ATTACK;
      if (xp >= XP_PER_TRADE) traded = true;
    }
  }

  return attacks;
}
// ===================================
// === Sidebar Turn Trading Calculator ===
// ===================================
// Injects a mini calculator under the sidebar Gold/XP panel
function initSidebarCalculator() {
  console.log("[XPTool] initSidebarCalculator called");
  const BOX_ID = "koc-xp-box";
  if (document.getElementById(BOX_ID)) return; // prevent duplicates

  const xpBox = document.createElement("table");
  xpBox.id = BOX_ID;
  xpBox.className = "table_lines";
  xpBox.style.marginTop = "5px";
  xpBox.innerHTML = `
    <tbody>
      <tr><th align="center">⚔️ Turn Trading Calculator</th></tr>
      <tr><td align="center" style="color:black;">Attacks Left <span id="xp-attacks">0</span></td></tr>
      <tr><td align="center" style="color:black;">XP Trade Attacks <span id="xp-trade">0</span></td></tr>
      <tr><td align="center" style="color:black;">Avg Gold/Atk <a href="attacklog.php" id="xp-gold-link" style="color:black;"><span id="xp-gold">0</span></a></td></tr>
      <tr><td align="center" style="color:black;">Total Potential Gold <span id="xp-total">0</span></td></tr>
      <tr><td align="center" style="color:black;">Banked <span id="xp-banked">—</span></td></tr>
    </tbody>
  `;

  // Find sidebar gold/XP panel and insert after it
  const sidebarTables = document.querySelectorAll("table");
  let goldTable = null;
  sidebarTables.forEach(tbl => {
    if (tbl.innerText.includes("Gold:") && tbl.innerText.includes("Experience:")) {
      goldTable = tbl;
    }
  });

  if (goldTable && goldTable.parentNode) {
    goldTable.parentNode.insertBefore(xpBox, goldTable.nextSibling);
  } else {
    // fallback: inject into sidebar cell
    const firstSidebar = document.querySelector("td.menu_cell");
    if (firstSidebar) firstSidebar.appendChild(xpBox);
  }

  // --- helpers ---
  function formatGold(num) {
    if (!num) return "0";
    if (num >= 1e9) return (num / 1e9).toFixed(1) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(1) + "M";
    return num.toLocaleString();
  }

  function getSidebarValue(label) {
    const el = [...document.querySelectorAll("td")].find(td =>
      td.innerText.trim().startsWith(label)
    );
    if (!el) return 0;
    const parts = el.innerText.split(":");
    if (parts.length < 2) return 0;
    return parseInt(parts[1].replace(/[(),]/g, ""), 10) || 0;
  }

  function updateXPBox() {
    const xpVal = getSidebarValue("Experience");
    const turnsVal = getSidebarValue("Turns");

    const attacksLeft = Math.floor(turnsVal / 120);
    const xpTradeAttacks = calculateXPTradeAttacks(xpVal, turnsVal);

    const avgGold = parseFloat(localStorage.getItem("xpTool_avgGold")) || 0;
    const totalPotential = xpTradeAttacks * avgGold;

    document.getElementById("xp-attacks").innerText = attacksLeft;
    document.getElementById("xp-trade").innerText = xpTradeAttacks;
    document.getElementById("xp-gold").innerText = formatGold(avgGold);
    document.getElementById("xp-total").innerText = formatGold(totalPotential);

    // --- Banking Efficiency ---
    const goldLost = parseInt(localStorage.getItem("KoC_GoldLost24h") || "0", 10);
    const myId = localStorage.getItem("KoC_MyId");
    const mapRaw = localStorage.getItem("KoC_NameMap") || "{}";
    const map = JSON.parse(mapRaw);
    let projectedIncome = 0;
if (map[myId]?.projectedIncome !== undefined) {
  projectedIncome = Number(map[myId].projectedIncome) || 0;
}


    const dailyTbg = projectedIncome * 1440;
    let bankedPctText = "—";

    if (dailyTbg > 0) {
      const bankedGold = Math.max(0, dailyTbg - goldLost);
      const pct = (bankedGold / dailyTbg * 100).toFixed(1);

      let color = "limegreen";
      if (pct < 25) color = "red";
      else if (pct < 50) color = "orange";
      else if (pct < 75) color = "gold";

      bankedPctText = `<span style="color:${color};font-weight:bold;">${pct}% today</span>`;
    }

    document.getElementById("xp-banked").innerHTML = bankedPctText;
  }

  updateXPBox();
  console.log("[XPTool] Sidebar box inserted into page");
}

// ==================================
// === Popup Turn Trading Calculator ===
// ==================================
// Opens a popup with manual inputs for XP, Turns, Avg Gold
function createAttackPopup() {
  const overlay = document.createElement('div');
  overlay.id = 'koc-popup-overlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    top: '0', left: '0', width: '100%', height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: '9999'
  });

  const popup = document.createElement('div');
  Object.assign(popup.style, {
    background: '#222',
    color: '#fff',
    padding: '15px',
    border: '2px solid #666',
    borderRadius: '8px',
    width: '300px',
    position: 'relative'
  });

  const closeBtn = document.createElement('span');
  closeBtn.textContent = '×';
  Object.assign(closeBtn.style, {
    position: 'absolute',
    top: '5px', right: '10px',
    cursor: 'pointer', fontSize: '20px'
  });
  closeBtn.onclick = () => overlay.remove();

  const title = document.createElement('h3');
  title.textContent = '⚔️ Turn Trading Calculator';
  title.style.marginTop = '0';
  title.style.textAlign = 'center';

  // Input fields
  const turnsInput = document.createElement('input');
  turnsInput.type = 'number';
  turnsInput.placeholder = 'Turns';
  turnsInput.style.width = '100%';
  turnsInput.style.marginBottom = '5px';

  const expInput = document.createElement('input');
  expInput.type = 'number';
  expInput.placeholder = 'Experience';
  expInput.style.width = '100%';
  expInput.style.marginBottom = '5px';

  const avgInput = document.createElement('input');
  avgInput.type = 'number';
  avgInput.placeholder = 'Avg Gold/Atk';
  avgInput.style.width = '100%';
  avgInput.style.marginBottom = '10px';

  const calcBtn = document.createElement('button');
  calcBtn.textContent = 'Calculate';
  calcBtn.style.width = '100%';
  calcBtn.style.marginBottom = '10px';

  const results = document.createElement('div');
  results.innerHTML = `
    <p>Max Attacks: <span id="koc-max-attacks">0</span></p>
    <p>Potential Gold: <span id="koc-pot-gold">0</span></p>
  `;

  calcBtn.onclick = () => {
    const turns = parseInt(turnsInput.value) || 0;
    const exp = parseInt(expInput.value) || 0;
    const avgGold = parseFloat(avgInput.value) || 0;

    const maxAttacks = calculateXPTradeAttacks(exp, turns);
    const potGold = maxAttacks * avgGold;

    results.querySelector('#koc-max-attacks').textContent = maxAttacks.toLocaleString();
    results.querySelector('#koc-pot-gold').textContent = potGold.toLocaleString();
  };

  // Assemble popup
  popup.appendChild(closeBtn);
  popup.appendChild(title);
  popup.appendChild(turnsInput);
  popup.appendChild(expInput);
  popup.appendChild(avgInput);
  popup.appendChild(calcBtn);
  popup.appendChild(results);

  overlay.appendChild(popup);
  document.body.appendChild(overlay);
}

// Hook: clicking the sidebar box header opens popup
function hookSidebarPopup() {
  const th = [...document.querySelectorAll("th")]
    .find(el => el.innerText.includes("Turn Trading Calculator"));
  if (th) {
    th.style.cursor = 'pointer';
    th.title = 'Click to open Turn Trading Calculator';
    th.onclick = createAttackPopup;
  }
}
// ===============================
// === Attack Log Enhancer (Avg Gold/Atk + Banking) ===
// ===============================
// Reads your attack log, calculates average gold/attack,
// captures Gold Lost (24h) for Banking Efficiency,
// updates sidebar + popup automatically
function enhanceAttackLog() {
  console.log("[XPTool] enhanceAttackLog called");

  const tables = document.querySelectorAll('table');
  for (let i = 0; i < tables.length; i++) {
    const tbl = tables[i];
    const txt = tbl.innerText.trim();

    // Look for the summary headers (allow AV suffix)
    if (txt.startsWith('Total By You Last 24 Hours') || txt.startsWith('Total On You Last 24 Hours')) {
      const dataTable = tables[i + 1];
      if (dataTable) {
        const rows = dataTable.querySelectorAll('tr');
        rows.forEach(r => {
          const cells = r.querySelectorAll('td');
          if (cells.length >= 3) {
            const label = cells[0].innerText.trim().toLowerCase();

            // === Average Gold per Attack (By You) ===
            if (label.startsWith('attacks')) {
              const numAttacks = parseInt(cells[1].innerText.replace(/,/g, ''), 10);
              const gold = parseInt(cells[2].innerText.replace(/,/g, ''), 10);

              if (numAttacks > 0) {
                const avg = gold / numAttacks;
                const labelTxt = (avg >= 1e9) ? (avg / 1e9).toFixed(1) + 'B AV'
                                              : (avg / 1e6).toFixed(1) + 'M AV';

                const th = tbl.querySelector('th');
                if (th && !th.innerHTML.includes('AV')) {
                  th.innerHTML = `<div style="text-align:center;">${th.innerText} (${labelTxt})</div>`;
                }

                // Save avg gold to localStorage for Sidebar + Popup
                if (txt.startsWith('Total By You Last 24 Hours')) {
                  localStorage.setItem('xpTool_avgGold', String(avg));
                  localStorage.setItem('xpTool_avgGold_time', String(Date.now()));
                  console.log("[XPTool] Avg Gold/Atk saved:", avg);
                }
              }
            }

            // === Gold Lost (On You) for Banking Efficiency ===
            if (txt.startsWith('Total On You Last 24 Hours') && label === 'total') {
              const goldLost = parseInt(cells[2].innerText.replace(/,/g, ''), 10) || 0;
              localStorage.setItem("KoC_GoldLost24h", String(goldLost));
              localStorage.setItem("KoC_GoldLost24h_time", new Date().toISOString());
              console.log("📊 Banking: Gold lost (24h) saved:", goldLost);
            }
          }
        });
      }
    }
  }
}

// ===============================
// === Recon Page: Add Max Attacks ===
// ===============================
// Shows how many attacks the target can make (XP+Turns)
function addMaxAttacksRecon() {
  const ROW_ID = "koc-max-attacks-row";
  if (document.getElementById(ROW_ID)) return; // avoid duplicates

  const tables = document.querySelectorAll('table');
  let usableResourcesTable = null;

  // Find the "Usable Resources" table
  tables.forEach(tbl => {
    const headers = tbl.querySelectorAll('th');
    headers.forEach(h => {
      if (h.innerText.includes('Usable Resources')) {
        usableResourcesTable = tbl;
      }
    });
  });

  if (!usableResourcesTable) return;

  // Extract Turns + Experience
  const rows = usableResourcesTable.querySelectorAll('tr');
  let turns = 0, exp = 0;

  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length >= 2) {
      if (cells[0].innerText.includes('Attack Turns')) {
        turns = parseInt(cells[1].innerText.replace(/,/g, ''), 10);
      }
      if (cells[0].innerText.includes('Experience')) {
        exp = parseInt(cells[1].innerText.replace(/,/g, ''), 10);
      }
    }
  });

  if (!turns && !exp) return;

  // Calculate Max Attacks
  const maxAttacks = calculateXPTradeAttacks(exp, turns);

  // Insert new row
  const newRow = document.createElement('tr');
  newRow.id = ROW_ID;
  const labelCell = document.createElement('td');
  labelCell.textContent = "Max Attacks:";
  const valueCell = document.createElement('td');
  valueCell.setAttribute("align", "right");
  valueCell.textContent = maxAttacks.toLocaleString();
  newRow.appendChild(labelCell);
  newRow.appendChild(valueCell);

  usableResourcesTable.appendChild(newRow);

  console.log("[XPTool] Recon Max Attacks row added:", maxAttacks);
}


// =========================
// === Battlefield Collector
// =========================
function collectFromBattlefield() {
  const rows = document.querySelectorAll("tr[user_id]");
  const players = [...rows].map(row => {
    const id = row.getAttribute("user_id");
    const cells = row.querySelectorAll("td");
    return {
      id,
      name:     cells[2]?.innerText.trim() || "Unknown",
      alliance: cells[1]?.innerText.trim() || "",
      army:     cells[3]?.innerText.trim() || "",
      race:     cells[4]?.innerText.trim() || "",
      treasury: cells[5]?.innerText.trim() || "",
      recon:    cells[6]?.innerText.trim() || "",
      rank:     cells[7]?.innerText.trim() || ""
    };
  });

  if (players.length) {
    players.forEach(p => updatePlayerInfo(p.id, p));
    console.log(`[DataCentre] Captured ${players.length} players`);
  }
}

if (location.pathname.includes("battlefield.php")) {
  collectFromBattlefield();
  const table = document.querySelector("table.battlefield") || document.querySelector("table.table_lines");
  if (table) {
    const observer = new MutationObserver(() => collectFromBattlefield());
    observer.observe(table, { childList: true, subtree: true });
    console.log("[DataCentre] Battlefield observer active");
  }
}


  // =========================
// === Attack TIV Collector
// =========================
function collectTIVFromAttackPage() {
  const idMatch  = location.search.match(/id=(\d+)/);
  const tivMatch = document.body.textContent.match(/Total Invested Value:\s*\(([\d,]+)\)/i);
  if (!idMatch || !tivMatch) return;

  const id  = idMatch[1];
  const tiv = parseInt(tivMatch[1].replace(/,/g, ""), 10);
  const now = new Date().toISOString();

  // === Save locally ===
  const log = getTivLog();
  log.push({ id, tiv, time: now });
  saveTivLog(log);

  updatePlayerInfo(id, { tiv, lastTivTime: now });

  console.log("📊 Attack TIV saved", { id, tiv });

  // === Push to API ===
  sendToAPI("tiv", { playerId: id, tiv });
}

if (location.pathname.includes("attack.php")) {
  collectTIVFromAttackPage();
}
// --- Helper: Military Stats Parser (RB-style) ---
function collectMilitaryStats() {
  const header = document.evaluate(
    `.//th[contains(., "Military Effectiveness")]`,
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
  ).singleNodeValue;
  if (!header) return {};

  const table = header.closest("table");
  const stats = {};
  table.querySelectorAll("tr").forEach(row => {
    const cells = row.querySelectorAll("td");
    if (cells.length < 2) return;

    const label = cells[0].innerText.trim().toLowerCase();
    const value = cells[1].innerText.trim();

    if (label.startsWith("strike"))    stats.strikeAction    = value;
    if (label.startsWith("defense"))   stats.defensiveAction = value;
    if (label.startsWith("spy"))       stats.spyRating       = value;
    if (label.startsWith("sentry"))    stats.sentryRating    = value;
    if (label.startsWith("poison"))    stats.poisonRating    = value;
    if (label.startsWith("antidote"))  stats.antidoteRating  = value;
    if (label.startsWith("theft"))     stats.theftRating     = value;
    if (label.startsWith("vigilance")) stats.vigilanceRating = value;
  });
  return stats;
}

// =========================
// === Base Page Collector (Self ID + Economy + Military Stats) ===
// =========================
function collectFromBasePage() {
  let myId = localStorage.getItem("KoC_MyId");
  let myName = localStorage.getItem("KoC_MyName");

  // --- Capture my ID/Name if missing ---
  const myLink = document.querySelector("a[href*='stats.php?id=']");
  if (myLink) {
    myId = myLink.href.match(/id=(\d+)/)?.[1] || myId || "self";
    myName = myLink.textContent.trim() || myName || "Me";
    localStorage.setItem("KoC_MyId", myId);
    localStorage.setItem("KoC_MyName", myName);
    console.log("📊 Stored my KoC ID/Name:", myId, myName);
  }

  let projectedIncome, treasury, economy, xpPerTurn, turnsAvailable;

  // --- Economy / Treasury block ---
  const rows = [...document.querySelectorAll("tr")];
  rows.forEach(tr => {
    const txt = tr.innerText.trim();

    if (txt.includes("Projected Income")) {
      const match = txt.match(/([\d,]+)\s+Gold/);
      if (match) projectedIncome = parseInt(match[1].replace(/,/g, ""), 10);
    }

    if (txt.startsWith("Economy")) {
      const match = txt.match(/([\d,]+)/);
      if (match) economy = parseInt(match[1].replace(/,/g, ""), 10);
    }
    if (txt.includes("Experience Per Turn")) {
      const match = txt.match(/([\d,]+)/);
      if (match) xpPerTurn = parseInt(match[1].replace(/,/g, ""), 10);
    }
  });

  // --- Military Effectiveness block (RB-style parser) ---
  const stats = {};
  const header = document.evaluate(
    `.//th[contains(., "Military Effectiveness")]`,
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
  ).singleNodeValue;

  if (header) {
    const table = header.closest("table");
    table.querySelectorAll("tr").forEach(row => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 2) return;

      const label = cells[0].innerText.trim().toLowerCase();
      const value = cells[1].innerText.trim();

      if (label.startsWith("strike"))    stats.strikeAction    = value;
      if (label.startsWith("defense"))   stats.defensiveAction = value;
      if (label.startsWith("spy"))       stats.spyRating       = value;
      if (label.startsWith("sentry"))    stats.sentryRating    = value;
      if (label.startsWith("poison"))    stats.poisonRating    = value;
      if (label.startsWith("antidote"))  stats.antidoteRating  = value;
      if (label.startsWith("theft"))     stats.theftRating     = value;
      if (label.startsWith("vigilance")) stats.vigilanceRating = value;
    });
  }

  const payload = {
    name: myName,
    projectedIncome,
    treasury,
    economy,
    xpPerTurn,
    turnsAvailable,
    ...stats,
    lastSeen: new Date().toISOString()
  };

  // === Save locally ===
  updatePlayerInfo(myId, payload);
  console.log("📊 Base.php self stats captured", payload);

  // === Push to API ===
  sendToAPI("players", { id: myId, ...payload });
}

if (location.pathname.includes("base.php")) {
  collectFromBasePage();
}


// =========================
// === Armory Self Collector (TIV + Military Stats) ===
// =========================
function collectTIVAndStatsFromArmory() {
  const myId = localStorage.getItem("KoC_MyId") || "self";
  const myName = localStorage.getItem("KoC_MyName") || "Me";

  // --- TIV ---
  const header = [...document.querySelectorAll("th.subh")]
    .find(th => th.textContent.includes("Total Invested Value"));
  const tivCell = header?.closest("tr").nextElementSibling?.querySelector("td b");
  const tiv = tivCell ? parseInt(tivCell.textContent.replace(/,/g, "").trim(), 10) : 0;

  // --- Military Stats table ---
  const msTable = document.evaluate(
    `.//th[contains(., "Military Effectiveness")]`,
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
  ).singleNodeValue?.closest("table");
  const msRows = msTable?.querySelectorAll("tr");

  const stats = {
    strikeAction:    msRows?.[2]?.cells[1]?.innerText.trim() || "—",
    defensiveAction: msRows?.[3]?.cells[1]?.innerText.trim() || "—",
    spyRating:       msRows?.[4]?.cells[1]?.innerText.trim() || "—",
    sentryRating:    msRows?.[5]?.cells[1]?.innerText.trim() || "—",
    poisonRating:    msRows?.[6]?.cells[1]?.innerText.trim() || "—",
    antidoteRating:  msRows?.[7]?.cells[1]?.innerText.trim() || "—",
    theftRating:     msRows?.[8]?.cells[1]?.innerText.trim() || "—",
    vigilanceRating: msRows?.[9]?.cells[1]?.innerText.trim() || "—"
  };

  const now = new Date().toISOString();

  // Save to TIV log
  if (tiv) {
    const log = getTivLog();
    log.push({ id: myId, tiv, time: now });
    saveTivLog(log);

    // 🔥 Send TIV to API
    sendToAPI("tiv", { playerId: myId, tiv });
  }

  // Merge into NameMap + API push
  const payload = {
    name: myName,
    tiv,
    ...stats,
    lastTivTime: now,
    lastRecon: now
  };

  updatePlayerInfo(myId, payload);

  // 🔥 Send self stats to API
  sendToAPI("players", { id: myId, ...payload });

  console.log("📊 Armory self stats captured", { id: myId, name: myName, tiv, ...stats });
}

if (location.pathname.includes("armory.php")) {
  collectTIVAndStatsFromArmory();
}

// =========================
// === Recon Data Collector
// =========================
function getTableByHeader(text) {
  return document.evaluate(`.//th[contains(., "${text}")]`,
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
  ).singleNodeValue?.closest("table") || null;
}

// Return value + optional timestamp if fresh
function grabStat(id, key, cell) {
  const val = cell?.innerText.trim();
  const prev = getNameMap()[id] || {};
  if (val && val !== "???") {
    return { value: val, time: new Date().toISOString() };
  } else {
    return { value: prev[key] || "???", time: prev[key + "Time"] };
  }
}

function collectFromReconPage() {
  console.log("📊 Recon collector triggered");

  const link = document.querySelector('a[href*="stats.php?id="]');
  const id = link ? link.href.match(/id=(\d+)/)[1] : null;
  if (!id) {
    console.log("⚠️ Recon: Could not find player ID");
    return;
  }
  console.log("ℹ️ Recon target ID:", id);

  const ms = getTableByHeader("Military Stats")?.querySelectorAll("tr");
  const treasury = getTableByHeader("Treasury")?.querySelectorAll("tr");

  const stats = {};
  function set(key, row) {
    const { value, time } = grabStat(id, key, row?.cells[1]);
    stats[key] = value;
    if (time) stats[key + "Time"] = time;
  }

  set("strikeAction",       ms?.[1]);
  set("defensiveAction",    ms?.[2]);
  set("spyRating",          ms?.[3]);
  set("sentryRating",       ms?.[4]);
  set("poisonRating",       ms?.[5]);
  set("antidoteRating",     ms?.[6]);
  set("theftRating",        ms?.[7]);
  set("vigilanceRating",    ms?.[8]);
  set("covertSkill",        ms?.[10]);
  set("sentrySkill",        ms?.[11]);
  set("siegeTechnology",    ms?.[12]);
  set("toxicInfusionLevel", ms?.[13]);
  set("viperbaneLevel",     ms?.[14]);
  set("shadowmeldLevel",    ms?.[15]);
  set("sentinelVigilLevel", ms?.[16]);
  set("economy",            ms?.[17]);
  set("technology",         ms?.[18]);
  set("experiencePerTurn",  ms?.[19]);
  set("soldiersPerTurn",    ms?.[20]);
  set("attackTurns",        ms?.[22]);
  set("experience",         ms?.[23]);

  // Treasury values
  stats.treasury = treasury?.[1]?.cells[0]?.innerText.split(" ")[0];
  stats.projectedIncome = treasury?.[3]?.innerText.split(" Gold")[0];

  // === Save locally ===
  updatePlayerInfo(id, stats);
  console.log("📊 Recon data saved", stats);

  // === Push to API (logging happens inside sendToAPI) ===
  sendToAPI("players", { id, ...stats });
  if (stats.tiv) {
    sendToAPI("tiv", { playerId: id, tiv: stats.tiv });
  }

  enhanceReconUI(id);
}




// =========================
// === Recon UI Enhancer ===
// =========================
function reconTimeAgo(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (!d || isNaN(d)) return "";
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 0) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function fillMissingReconValue(cell, cachedValue, cachedTime) {
  if (!cell) return;
  if (cell.textContent.trim() === "???" && cachedValue && cachedValue !== "???") {
    const rel = cachedTime ? reconTimeAgo(cachedTime) : "";
    const abs = cachedTime ? new Date(cachedTime).toLocaleString() : "";
    cell.innerHTML = `
      <div style="float:left;color:#FBC;font-size:0.8em;" title="${abs} • from cache">
        ${rel}
      </div>
      <div title="${abs} • from cache">${cachedValue}</div>
    `;
  }
}

function enhanceReconUI(id) {
  const map = getNameMap();
  const prev = map[id] || {};
  const ms = getTableByHeader("Military Stats")?.querySelectorAll("tr");
  if (!ms) return;

  fillMissingReconValue(ms?.[1]?.cells[1],  prev.strikeAction,       prev.strikeActionTime);
  fillMissingReconValue(ms?.[2]?.cells[1],  prev.defensiveAction,    prev.defensiveActionTime);
  fillMissingReconValue(ms?.[3]?.cells[1],  prev.spyRating,          prev.spyRatingTime);
  fillMissingReconValue(ms?.[4]?.cells[1],  prev.sentryRating,       prev.sentryRatingTime);
  fillMissingReconValue(ms?.[5]?.cells[1],  prev.poisonRating,       prev.poisonRatingTime);
  fillMissingReconValue(ms?.[6]?.cells[1],  prev.antidoteRating,     prev.antidoteRatingTime);
  fillMissingReconValue(ms?.[7]?.cells[1],  prev.theftRating,        prev.theftRatingTime);
  fillMissingReconValue(ms?.[8]?.cells[1],  prev.vigilanceRating,    prev.vigilanceRatingTime);
  fillMissingReconValue(ms?.[10]?.cells[1], prev.covertSkill,        prev.covertSkillTime);
  fillMissingReconValue(ms?.[11]?.cells[1], prev.sentrySkill,        prev.sentrySkillTime);
  fillMissingReconValue(ms?.[12]?.cells[1], prev.siegeTechnology,    prev.siegeTechnologyTime);
  fillMissingReconValue(ms?.[13]?.cells[1], prev.toxicInfusionLevel, prev.toxicInfusionLevelTime);
  fillMissingReconValue(ms?.[14]?.cells[1], prev.viperbaneLevel,     prev.viperbaneLevelTime);
  fillMissingReconValue(ms?.[15]?.cells[1], prev.shadowmeldLevel,    prev.shadowmeldLevelTime);
  fillMissingReconValue(ms?.[16]?.cells[1], prev.sentinelVigilLevel, prev.sentinelVigilLevelTime);
  fillMissingReconValue(ms?.[17]?.cells[1], prev.economy,            prev.economyTime);
  fillMissingReconValue(ms?.[18]?.cells[1], prev.technology,         prev.technologyTime);
  fillMissingReconValue(ms?.[19]?.cells[1], prev.experiencePerTurn,  prev.experiencePerTurnTime);
  fillMissingReconValue(ms?.[20]?.cells[1], prev.soldiersPerTurn,    prev.soldiersPerTurnTime);
  fillMissingReconValue(ms?.[22]?.cells[1], prev.attackTurns,        prev.attackTurnsTime);
  fillMissingReconValue(ms?.[23]?.cells[1], prev.experience,         prev.experienceTime);
}

if (location.pathname.includes("inteldetail.php")) {
  collectFromReconPage();
}


// ==============================
// === Data Centre Roster Page ===
// ==============================
if (location.pathname.includes("datacentre")) {
  document.title = "KoC Data Centre";
  console.log("[DataCentre] Roster UI loaded");

  // Base UI skeleton
  document.body.innerHTML = `
    <div style="padding:20px;color:#fff;font-family:Arial,sans-serif;">
      <h1 style="margin-bottom:15px;">📊 KoC Data Centre</h1>

      <!-- Tab Bar -->
      <div id="tabBar" style="margin-bottom:15px;">
        <button data-tab="roster">📜 Roster</button>
        <button data-tab="topTiv">🏆 Top TIV</button>
        <button data-tab="allStats">📈 All Stats Leaderboard</button>
      </div>

      <!-- View Containers -->
      <div id="viewRoster"></div>
      <div id="viewTopTiv" style="display:none;"></div>
      <div id="viewAllStats" style="display:none;"></div>
    </div>
  `;

// ======================================
// === Data Access (API + local fallback) ===
// ======================================
const API_URL = "https://koc-roster-api-production.up.railway.app";

// Reuse getAuthToken() helper from above

async function loadPlayers() {
  try {
    const token = await getAuthToken();
    if (!token) throw new Error("No token");
    const resp = await fetch(`${API_URL}/players`, {
      headers: { "Authorization": "Bearer " + token }
    });
    if (!resp.ok) throw new Error("API error " + resp.status);
    const players = await resp.json();
    console.log("🌐 Loaded players from API:", players);
    return players;
  } catch (err) {
    console.error("❌ API fetch failed, falling back to localStorage", err);
    const nameMap = JSON.parse(localStorage.getItem("KoC_NameMap") || "{}");
    return Object.values(nameMap);
  }
}

let rosterCache = []; // holds API or fallback data

async function initRosterData() {
  rosterCache = await loadPlayers();
}

// TIV log stays local-only for now
const tivLog  = JSON.parse(localStorage.getItem("KoC_DataCentre") || "[]");
const lastTiv = {};
tivLog.forEach(r => { lastTiv[r.id] = r; });

  // ==========================
  // === Utility Functions  ===
  // ==========================
  function timeAgo(date) {
    if (!date) return "—";
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  }
  function toNum(str) {
    return parseInt(String(str ?? "").replace(/[^\d]/g, "")) || 0;
  }

 // Generic table renderer with click-to-sort
function renderTable(containerId, columns, rows, defaultSortKey = null, defaultSortDesc = true) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let currentSortKey = defaultSortKey;
  let currentSortDesc = defaultSortDesc;

  function drawTable() {
    const rowsCopy = rows.slice();
    if (currentSortKey) {
      rowsCopy.sort((a, b) => {
        const av = a[currentSortKey] ?? "";
        const bv = b[currentSortKey] ?? "";

        // Try numeric first
        const na = parseFloat(String(av).replace(/[^\d.-]/g, ""));
        const nb = parseFloat(String(bv).replace(/[^\d.-]/g, ""));
        const bothNumeric = !isNaN(na) && !isNaN(nb);

        if (bothNumeric) {
          return currentSortDesc ? (nb - na) : (na - nb);
        } else {
          return currentSortDesc
            ? String(bv).localeCompare(String(av))
            : String(av).localeCompare(String(bv));
        }
      });
    }

    const html = `
      <table border="1" cellpadding="6" cellspacing="0"
             style="border-collapse:collapse;width:100%;background:#222;">
        <thead style="background:#333;color:gold;">
          <tr>
            ${columns.map(c => {
              if (c.nosort) {
                return `<th style="white-space:nowrap;">${c.label}</th>`;
              } else {
                return `<th data-key="${c.key}" style="cursor:pointer;white-space:nowrap;">
                          ${c.label}${currentSortKey===c.key ? (currentSortDesc ? " ▼" : " ▲") : ""}
                        </th>`;
              }
            }).join("")}
          </tr>
        </thead>
        <tbody>
          ${rowsCopy.length ? rowsCopy.map(r => `
            <tr>
              ${columns.map(c => `<td>${r[c.key] ?? "—"}</td>`).join("")}
            </tr>
          `).join("") : `<tr><td colspan="${columns.length}">No data yet.</td></tr>`}
        </tbody>
      </table>
    `;
    container.innerHTML = html;

    // Attach click-to-sort only for sortable headers
    container.querySelectorAll("th[data-key]").forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (!key) return;
        if (currentSortKey === key) {
          currentSortDesc = !currentSortDesc; // toggle asc/desc
        } else {
          currentSortKey = key;
          currentSortDesc = true; // new column sorts desc by default
        }
        drawTable();
      });
    });
  }
  drawTable();
}

  // ===============================
  // === Prepare Data for Tables ===
  // ===============================

  function getLatestReconTime(info) {
    const keys = [
      "strikeActionTime","defensiveActionTime","spyRatingTime","sentryRatingTime",
      "poisonRatingTime","antidoteRatingTime","theftRatingTime","vigilanceRatingTime",
      "economyTime","technologyTime","experiencePerTurnTime","soldiersPerTurnTime",
      "attackTurnsTime","experienceTime"
    ];
    const times = keys
      .map(k => info[k])
      .filter(Boolean)
      .map(t => new Date(t).getTime());
    if (!times.length) return null;
    return new Date(Math.max(...times));
  }

 function prepareRosterRows() {
  let rows = rosterCache
    .filter(info => info.id !== "self" && info.name !== "Me")
    .map(info => {
      const id = info.id;
      const tivRec = lastTiv[id] || {};
      const tivNum = typeof info.tiv === "number" ? info.tiv : (tivRec.tiv || 0);

      const isStale = t => t && (Date.now() - new Date(t).getTime()) > 86400000;
      const fmt = (val, time) => {
        if (!val || val === "—" || val == null) return "—";
        return isStale(time) ? `<i>${val}</i>` : val;
      };

      return {
        rank: info.rank || "",
        name: `<a href="https://www.kingsofchaos.com/attack.php?id=${id}" target="_blank">${info.name || "Unknown"}</a>`,
        alliance: info.alliance || "",
        army: info.army || "",
        race: info.race || "",
        tiv: fmt(tivNum.toLocaleString(), info.lastTivTime || tivRec.time),
        strike: fmt(info.strikeAction ?? tivRec.strikeAction, info.strikeActionTime || tivRec.time),
        defense: fmt(info.defensiveAction ?? tivRec.defensiveAction, info.defensiveActionTime || tivRec.time),
        spy: fmt(info.spyRating ?? tivRec.spyRating, info.spyRatingTime || tivRec.time),
        sentry: fmt(info.sentryRating ?? tivRec.sentryRating, info.sentryRatingTime || tivRec.time),
        poison: fmt(info.poisonRating ?? tivRec.poisonRating, info.poisonRatingTime || tivRec.time),
        antidote: fmt(info.antidoteRating ?? tivRec.antidoteRating, info.antidoteRatingTime || tivRec.time),
        theft: fmt(info.theftRating ?? tivRec.theftRating, info.theftRatingTime || tivRec.time),
        vigilance: fmt(info.vigilanceRating ?? tivRec.vigilanceRating, info.vigilanceRatingTime || tivRec.time),
        lastSeen: timeAgo(info.updatedAt)
      };
    });

  rows.sort((a, b) => toNum(a.rank) - toNum(b.rank));
  return rows;
}

  function prepareTopTivRows(limit = 20) {
  let rows = rosterCache
    .filter(info => info.id !== "self" && info.name !== "Me")
    .map(info => {
      const id = info.id;
      const tivRec = lastTiv[id];
      const tivNum = (typeof info.tiv === "number" ? info.tiv : (tivRec?.tiv || 0));
      return {
        name: `<a href="https://www.kingsofchaos.com/attack.php?id=${id}" target="_blank">${info.name || "Unknown"}</a>`,
        tiv: tivNum.toLocaleString(),
        updated: timeAgo(info.updatedAt)
      };
    });
  rows.sort((a, b) => toNum(b.tiv) - toNum(a.tiv));
  if (limit > 0) rows = rows.slice(0, limit);
  return rows;
}


function prepareAllStatsRows(limit = 10) {
  let rows = rosterCache
    .filter(info => !!info.strikeAction) // only players we’ve got recon/armory stats for
    .map(info => {
      const id = info.id;
      const tivNum = (typeof info.tiv === "number" ? info.tiv : 0);

      return {
        name: `<a href="https://www.kingsofchaos.com/attack.php?id=${id}" target="_blank">${info.name || "Unknown"}</a>`,
        tiv: tivNum.toLocaleString(),
        strike: info.strikeAction || "—",
        defense: info.defensiveAction || "—",
        spy: info.spyRating || "—",
        sentry: info.sentryRating || "—",
        poison: info.poisonRating || "—",
        antidote: info.antidoteRating || "—",
        theft: info.theftRating || "—",
        vigilance: info.vigilanceRating || "—",
        // ✅ Use API's updatedAt for consistency across all clients
        lastRecon: timeAgo(info.updatedAt || getLatestReconTime(info))
      };
    });

  rows.sort((a, b) => toNum(b.tiv) - toNum(a.tiv));
  if (limit > 0) rows = rows.slice(0, limit);
  return rows;
}

  // ============================
  // === Render Each Tab View ===
  // ============================
  function renderRoster() {
    renderTable("viewRoster", [
      {key:"rank", label:"Rank"},
      {key:"name", label:"Name"},
      {key:"alliance", label:"Alliance"},
      {key:"army", label:"Army", nosort:true},
      {key:"race", label:"Race"},
      {key:"tiv", label:"TIV"},
      {key:"strike", label:"Strike"},
      {key:"defense", label:"Defense"},
      {key:"spy", label:"Spy"},
      {key:"sentry", label:"Sentry"},
      {key:"poison", label:"Poison"},
      {key:"antidote", label:"Antidote"},
      {key:"theft", label:"Theft"},
      {key:"vigilance", label:"Vigilance"},
      {key:"lastSeen", label:"Last Seen"}
    ], prepareRosterRows(), "rank", false);
  }

  function renderTopTiv() {
    renderTable("viewTopTiv", [
      {key:"name", label:"Name"},
      {key:"tiv", label:"TIV"},
      {key:"updated", label:"Last Updated"}
    ], prepareTopTivRows(20), "tiv", true);
  }

function renderAllStats(limit = 10) {
  const container = document.getElementById("viewAllStats");
  if (!container) return;

  // === Stat definitions (Rank included) ===
  const statDefs = [
    {key:"tiv", label:"TIV"},
    {key:"strike", label:"Strike"},
    {key:"defense", label:"Defense"},
    {key:"spy", label:"Spy"},
    {key:"sentry", label:"Sentry"},
    {key:"poison", label:"Poison"},
    {key:"antidote", label:"Antidote"},
    {key:"theft", label:"Theft"},
    {key:"vigilance", label:"Vigilance"},
    {key:"rank", label:"Rank"}
  ];

  // === Remember previous selection (if exists) ===
  const prevAlliance = document.getElementById("allStatsAlliance")?.value || "";
  const prevLimit = document.getElementById("allStatsLimit")?.value || limit;

  // === Build unique alliance list from rosterCache ===
  const alliances = [...new Set(rosterCache
    .map(info => info.alliance)
    .filter(a => a && a.trim() !== ""))]
    .sort();

  // === Rebuild container HTML ===
  container.innerHTML = `
    <div style="margin-bottom:12px;">
      Show:
      <select id="allStatsLimit">
        <option value="10">Top 10</option>
        <option value="20">Top 20</option>
        <option value="50">Top 50</option>
        <option value="0">All</option>
      </select>
      &nbsp;&nbsp;Alliance:
      <select id="allStatsAlliance">
        <option value="">All</option>
        ${alliances.map(a => `<option value="${a}">${a}</option>`).join("")}
      </select>
    </div>
    <div id="allStatsTables"></div>
  `;

  // === Restore dropdown selections ===
  document.getElementById("allStatsLimit").value = prevLimit;
  document.getElementById("allStatsAlliance").value = prevAlliance;

  const allianceFilter = document.getElementById("allStatsAlliance")?.value || "";
  const tablesDiv = document.getElementById("allStatsTables");

  // === Loop through statDefs and build tables ===
  statDefs.forEach(stat => {
    let rows = rosterCache
      .filter(info => (stat.key==="tiv" || stat.key==="rank") || !!info.strikeAction)
      .map(info => {
        const id = info.id;
        const tivRec = lastTiv[id];
        const tivNum = (typeof info.tiv === "number" ? info.tiv : (tivRec?.tiv || 0));

        let value;
        if (stat.key === "tiv") {
          value = tivNum;
        } else if (stat.key === "defense") {
          value = info.defensiveAction || 0;
        } else if (stat.key === "rank") {
          value = parseInt(info.rank?.replace(/[^\d]/g,"") || "0",10);
        } else {
          value = info[`${stat.key}Action`] || info[`${stat.key}Rating`] || info[stat.key] || 0;
        }

        return {
          id,
          name: info.name || "Unknown",
          link: `<a href="https://www.kingsofchaos.com/attack.php?id=${id}" target="_blank">${info.name || "Unknown"}</a>`,
          value,
          alliance: info.alliance || "",
          lastRecon: (stat.key==="tiv" || stat.key==="rank"
                        ? (info.lastSeen || tivRec?.time)
                        : getLatestReconTime(info))
        };
      });

    // === Apply alliance filter ===
    if (allianceFilter) {
      rows = rows.filter(r => r.alliance === allianceFilter);
    }

    // === Sort by stat ===
    if (stat.key === "rank") {
      rows.sort((a,b) => toNum(a.value) - toNum(b.value)); // lower rank = better
    } else {
      rows.sort((a,b) => toNum(b.value) - toNum(a.value)); // higher = better
    }

    const nLimit = parseInt(prevLimit, 10) || limit;
    if (nLimit > 0) rows = rows.slice(0, nLimit);

    const topName = rows.length ? rows[0].name : "—";

    const html = `
      <h3 style="margin:15px 0 5px;">
        Top ${nLimit>0?nLimit:"All"} ${stat.label} — 🥇 #1: ${topName}
      </h3>
      <table border="1" cellpadding="6" cellspacing="0"
             style="border-collapse:collapse;width:100%;background:#222;margin-bottom:20px;">
        <thead style="background:#333;color:gold;">
          <tr>
            <th>Rank</th>
            <th>Name</th>
            <th>Alliance</th>
            <th>${stat.label}</th>
            <th>Last Recon</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r,i) => `
            <tr style="${i===0 ? 'background:#444;color:gold;font-weight:bold;' : ''}">
              <td>#${i+1}</td>
              <td>${r.link}</td>
              <td>${r.alliance || "—"}</td>
              <td>${r.value.toLocaleString ? r.value.toLocaleString() : r.value}</td>
              <td>${r.lastRecon ? timeAgo(r.lastRecon) : "—"}</td>
            </tr>
          `).join("") || `<tr><td colspan="5">No data yet.</td></tr>`}
        </tbody>
      </table>
    `;
    tablesDiv.innerHTML += html;
  });

  // === Re-bind dropdowns ===
  document.getElementById("allStatsLimit").addEventListener("change", e => {
    renderAllStats(parseInt(e.target.value, 10));
  });
  document.getElementById("allStatsAlliance").addEventListener("change", () => {
    renderAllStats(limit);
  });
}

// ============================
// === Load + Render Default ===
// ============================
initRosterData().then(() => {
  renderRoster();
});


// ============================
// === Tab Switching Logic  ===
// ============================
document.querySelectorAll("#tabBar button").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    document.getElementById("viewRoster").style.display   = (target==="roster")   ? "" : "none";
    document.getElementById("viewTopTiv").style.display   = (target==="topTiv")   ? "" : "none";
    document.getElementById("viewAllStats").style.display = (target==="allStats") ? "" : "none";

    if (target==="roster") renderRoster();
    if (target==="topTiv") renderTopTiv();
    if (target==="allStats") renderAllStats(10);
  });
});
}


  // =========================
// === Button Injection ===
// =========================
function addButtons() {
  // Only inject if logged in (logout link present)
  if (!document.querySelector("a[href='logout.php']")) return;

  const infoRow = document.querySelector("a[href='info.php']")?.closest("tr");
  if (!infoRow) {
    setTimeout(addButtons, 500);
    return;
  }

  infoRow.innerHTML = `
    <td align="center">
      <a href="info.php" class="koc-button">
        <img alt="KoC Info" src="/images/bon/KOC_Info_2024.png" width="250">
      </a>
    </td>
    <td align="center">
      <a id="koc-data-centre-btn" href="datacentre" class="koc-button">
        <img alt="Data Centre" src="https://raw.githubusercontent.com/Trevo88423/koc-roster-api/main/public/KoC_DataCentre.png" width="250">
      </a>
    </td>
  `;
}

// Command Center (base.php) → add buttons + sidebar calc
if (location.pathname.includes("base.php") && document.querySelector("a[href='logout.php']")) {
  addButtons();
  initSidebarCalculator();
}

// Any page with sidebar (menu_cell) → show sidebar calc (only if logged in)
if (document.querySelector("td.menu_cell") && document.querySelector("a[href='logout.php']")) {
  initSidebarCalculator();
  hookSidebarPopup();
}

// Attack log → enhance (only if logged in)
if (location.pathname.includes("attacklog.php") && document.querySelector("a[href='logout.php']")) {
  enhanceAttackLog();
}

// Recon detail → add max attacks (only if logged in)
if (location.pathname.includes("inteldetail.php") && document.querySelector("a[href='logout.php']")) {
  addMaxAttacksRecon();
}


  // =========================
  // === Styling (Hover Effect)
  // =========================
  const style = document.createElement("style");
  style.textContent = `
    a.koc-button img {
      transition: transform 0.2s ease, filter 0.2s ease;
    }
    a.koc-button img:hover {
      transform: scale(1.05);
      filter: drop-shadow(0 0 6px gold);
    }
  `;
  document.head.appendChild(style);
// =========================
// === Debug Helpers     ===
// =========================

// View a player (or all players if no id is passed)
window.showPlayer = function(id) {
  console.log("🔍 showPlayer() called with id:", id);
  const raw = localStorage.getItem("KoC_NameMap") || "{}";
  const map = JSON.parse(raw);
  if (!id) {
    console.log("📊 Full NameMap:", map);
    return map;
  }
  console.log("📊 Player record:", map[id]);
  return map[id] || null;
};

// View the full TIV history (attack + armory logs)
window.showTivLog = function() {
  console.log("📊 Full TIV log requested");
  const raw = localStorage.getItem("KoC_DataCentre") || "[]";
  const log = JSON.parse(raw);
  console.log("📊 Log:", log);
  return log;
};





})();