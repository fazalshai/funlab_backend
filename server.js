require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const port = 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

const client = new MongoClient(process.env.MONGO_URI);
let db, logsCollection, namesCollection, itemsCollection;

// === Connect to MongoDB ===
async function connectDB() {
  try {
    await client.connect();
    db = client.db("funlab"); // database name
    logsCollection = db.collection("logs");
    namesCollection = db.collection("names");
    itemsCollection = db.collection("items");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err);
  }
}

connectDB();

// === Save new user ===
app.post("/save-user", async (req, res) => {
  const { id, name, regNo } = req.body;
  if (!id || !name) return res.status(400).json({ message: "Missing ID or name" });

  await namesCollection.updateOne(
    { id },
    { $set: { name, regNo } },
    { upsert: true }
  );

  // Update previous unknown logs
  await logsCollection.updateMany(
    { id, name: "Unknown" },
    { $set: { name, regNo: regNo || "-" } }
  );

  res.json({ message: "✅ User saved" });
});

// === Receive fingerprint log ===
app.get("/log.php", async (req, res) => {
  const { id, date, time, dir } = req.query;
  if (!id || !date || !time || !dir)
    return res.status(400).json({ message: "Missing parameters" });

  const user = await namesCollection.findOne({ id });

  const entry = {
    id,
    name: user?.name || "Unknown",
    regNo: user?.regNo || "-",
    date,
    time,
    direction: dir,
  };

  await logsCollection.insertOne(entry);

  res.json({ message: "Log saved", entry });
});

// === Get logs (optionally filtered by date) ===
app.get("/logs", async (req, res) => {
  const { date } = req.query;
  const query = date ? { date } : {};
  const logs = await logsCollection.find(query).toArray();
  res.json(logs);
});

// === Borrow item ===
app.post("/borrow-item", async (req, res) => {
  const { name, regNo, item, issuedDate } = req.body;
  if (!name || !regNo || !item || !issuedDate)
    return res.status(400).json({ message: "Missing fields" });

  await itemsCollection.insertOne({ name, regNo, item, issuedDate });

  res.json({ message: "Item added successfully" });
});

// === Get borrowed items ===
app.get("/borrowed-items", async (req, res) => {
  const items = await itemsCollection.find().toArray();
  res.json(items);
});

// === Delete log ===
app.delete("/logs/:id", async (req, res) => {
  try {
    await logsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: "Deleted" });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
});

// === Delete item ===
app.delete("/borrowed-items/:id", async (req, res) => {
  try {
    await itemsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: "Deleted" });
  } catch {
    res.status(500).json({ message: "Delete failed" });
  }
});

// === Start server ===
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
