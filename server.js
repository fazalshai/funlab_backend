require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const port = 5000;

app.use(cors());
app.use(bodyParser.json());

const client = new MongoClient(process.env.MONGO_URI);
let db, logsCollection, namesCollection, itemsCollection;

// ─── IST Helper (UTC+5:30) ──────────────────────────────────────────────────
function getISTDateTime() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);

  const year  = ist.getUTCFullYear();
  const month = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const day   = String(ist.getUTCDate()).padStart(2, "0");
  const hours = String(ist.getUTCHours()).padStart(2, "0");
  const mins  = String(ist.getUTCMinutes()).padStart(2, "0");
  const secs  = String(ist.getUTCSeconds()).padStart(2, "0");

  return {
    date: `${year}-${month}-${day}`,        // YYYY-MM-DD  (always IST)
    time: `${hours}:${mins}:${secs}`,       // HH:MM:SS    (always IST, leading zeros)
    istObj: ist,
  };
}

// Normalize time string to HH:MM:SS (add leading zeros if ESP32 skips them)
function normalizeTime(t) {
  if (!t) return null;
  const parts = t.split(":").map((p) => p.padStart(2, "0"));
  while (parts.length < 3) parts.push("00");
  return parts.join(":");
}

// ─── Connect to MongoDB ──────────────────────────────────────────────────────
async function connectDB() {
  try {
    await client.connect();
    db = client.db("funlab");
    logsCollection = db.collection("logs");
    namesCollection = db.collection("names");
    itemsCollection = db.collection("items");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
  }
}
connectDB();

// ─── Save / update user ──────────────────────────────────────────────────────
app.post("/save-user", async (req, res) => {
  const { id, name, regNo } = req.body;
  if (!id || !name) return res.status(400).json({ message: "Missing ID or name" });

  await namesCollection.updateOne(
    { id },
    { $set: { name, regNo } },
    { upsert: true }
  );
  await logsCollection.updateMany(
    { id, name: "Unknown" },
    { $set: { name, regNo: regNo || "-" } }
  );
  res.json({ message: "✅ User saved" });
});

// ─── Get all users ───────────────────────────────────────────────────────────
app.get("/users", async (req, res) => {
  try {
    const users = await namesCollection.find().toArray();
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users" });
  }
});

// ─── Receive fingerprint log ─────────────────────────────────────────────────
// IMPORTANT: We ALWAYS use the server's IST date so that entries logged at e.g.
// 8:30 IST (which is the previous UTC day) are stored correctly under today's
// IST date. The ESP32's `date` param is intentionally ignored.
app.get("/log.php", async (req, res) => {
  const { id, time: rawTime, dir } = req.query;

  if (!id || !dir)
    return res.status(400).json({ message: "Missing parameters: id or dir" });

  const ist = getISTDateTime();

  // Always use server IST date (ESP32 sends UTC date which is wrong for IST)
  const date = ist.date;

  // Use ESP32 time if provided (ESP32 is assumed to run IST NTP), else use server IST time
  // Either way normalise to HH:MM:SS with leading zeros
  const time = normalizeTime(rawTime) || ist.time;

  const user = await namesCollection.findOne({ id });

  const entry = {
    id,
    name:      user?.name  || "Unknown",
    regNo:     user?.regNo || "-",
    date,
    time,
    direction: dir,
  };

  await logsCollection.insertOne(entry);
  res.json({ message: "Log saved", entry });
});

// ─── Get logs (optionally filtered by date) ──────────────────────────────────
// Logs were historically stored WITHOUT leading zeros (e.g. "2026-3-18").
// After the IST fix, new logs use padded format ("2026-03-18").
// We query BOTH variants so nothing is missed.
function dateVariants(dateStr) {
  // dateStr comes from frontend as YYYY-MM-DD (padded)
  const parts = dateStr.split("-");
  if (parts.length !== 3) return [dateStr];
  const [y, m, d] = parts;
  const padded   = `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  const unpadded = `${parseInt(y)}-${parseInt(m)}-${parseInt(d)}`;
  return padded === unpadded ? [padded] : [padded, unpadded];
}

app.get("/logs", async (req, res) => {
  const { date } = req.query;
  const query = date ? { date: { $in: dateVariants(date) } } : {};
  const logs = await logsCollection.find(query).sort({ _id: -1 }).toArray();
  res.json(logs);
});

// ─── Borrow item ─────────────────────────────────────────────────────────────
app.post("/borrow-item", async (req, res) => {
  const { name, regNo, item, issuedDate } = req.body;
  if (!name || !regNo || !item || !issuedDate)
    return res.status(400).json({ message: "Missing fields" });
  await itemsCollection.insertOne({ name, regNo, item, issuedDate });
  res.json({ message: "Item added successfully" });
});

// ─── Get borrowed items ──────────────────────────────────────────────────────
app.get("/borrowed-items", async (req, res) => {
  const items = await itemsCollection.find().toArray();
  res.json(items);
});

// ─── Delete log ──────────────────────────────────────────────────────────────
app.delete("/logs/:id", async (req, res) => {
  try {
    await logsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: "Deleted" });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
});

// ─── Delete borrowed item ────────────────────────────────────────────────────
app.delete("/borrowed-items/:id", async (req, res) => {
  try {
    await itemsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: "Deleted" });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
});

// ─── Manual cleanup: delete all logs before current month (IST) ─────────────
// Uses regex on year-month prefix to match BOTH padded and unpadded date formats.
app.delete("/admin/cleanup-old-logs", async (req, res) => {
  try {
    const { istObj } = getISTDateTime();
    const year  = istObj.getUTCFullYear();
    const month = istObj.getUTCMonth() + 1; // 1-12, no padding

    // Build list of all year-month prefixes OLDER than current month
    // and delete any log whose date starts with one of those prefixes.
    // This handles both "2026-3-" and "2026-03-" formats.
    const deletePromises = [];

    // Delete all logs from previous years entirely
    for (let y = 2025; y < year; y++) {
      deletePromises.push(
        logsCollection.deleteMany({ date: { $regex: `^${y}-` } })
      );
    }
    // Delete logs from current year but previous months
    for (let m = 1; m < month; m++) {
      const padded   = String(m).padStart(2, "0");
      const unpadded = String(m);
      deletePromises.push(
        logsCollection.deleteMany({
          $or: [
            { date: { $regex: `^${year}-${padded}-` } },
            { date: { $regex: `^${year}-${unpadded}-` } },
          ]
        })
      );
    }

    const results = await Promise.all(deletePromises);
    const total   = results.reduce((sum, r) => sum + r.deletedCount, 0);

    console.log(`🧹 Manual cleanup: deleted ${total} old logs`);
    res.json({ message: `✅ Deleted ${total} old logs (before ${year}-${month})` });
  } catch (err) {
    console.error("Cleanup error:", err);
    res.status(500).json({ message: "Cleanup failed" });
  }
});

// ─── Remote Unlock ───────────────────────────────────────────────────────────
let unlockRequestActive    = false;
let unlockRequestTimestamp = 0;
const UNLOCK_TIMEOUT_MS    = 30000;

app.post("/admin/unlock", (req, res) => {
  unlockRequestActive    = true;
  unlockRequestTimestamp = Date.now();
  console.log("Remote unlock requested by Admin.");
  res.json({ success: true, message: "Unlock command sent. Waiting for door to poll..." });
});

app.get("/check-unlock", (req, res) => {
  if (unlockRequestActive && Date.now() - unlockRequestTimestamp < UNLOCK_TIMEOUT_MS) {
    unlockRequestActive = false;
    console.log("Door polled: Unlock command delivered.");
    res.json({ unlock: true });
  } else {
    res.json({ unlock: false });
  }
});

// ─── Start server & monthly cleanup ─────────────────────────────────────────
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);

  // Every minute, check if it's midnight on the 1st of the month (IST).
  // If so, delete all logs from the PREVIOUS month only.
  setInterval(async () => {
    const { istObj } = getISTDateTime();

    if (
      istObj.getUTCDate()    === 1  &&
      istObj.getUTCHours()   === 0  &&
      istObj.getUTCMinutes() === 0
    ) {
      // Build "YYYY-MM" prefix for previous month
      const prevYear  = istObj.getUTCMonth() === 0
        ? istObj.getUTCFullYear() - 1
        : istObj.getUTCFullYear();
      const prevMonth = istObj.getUTCMonth() === 0 ? 12 : istObj.getUTCMonth();
      const prefix    = `${prevYear}-${String(prevMonth).padStart(2, "0")}`;

      console.log(`🧹 Monthly cleanup: removing logs for ${prefix}...`);
      try {
        const result = await logsCollection.deleteMany({
          date: { $regex: `^${prefix}` },
        });
        console.log(`✅ Deleted ${result.deletedCount} logs from ${prefix}`);
      } catch (err) {
        console.error("❌ Cleanup failed:", err);
      }
    }
  }, 60000);
});
