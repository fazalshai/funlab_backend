// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
const port = 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

let users = {}; // ID -> { name, regNo }
let fingerprintLogs = []; // Array of { id, name, regNo, date, time, direction }
let borrowedItems = [];   // Array of { name, regNo, item, issuedDate }

app.post("/save-user", (req, res) => {
  const { id, name, regNo } = req.body;
  if (!id || !name || !regNo) {
    return res.status(400).json({ message: "Missing fields" });
  }
  users[id] = { name, regNo };
  return res.json({ message: "User saved", user: users[id] });
});

app.get("/log.php", (req, res) => {
  const { id, date, time, dir } = req.query;
  if (!id || !date || !time || !dir) {
    return res.status(400).json({ message: "Missing log parameters" });
  }

  const user = users[id] || { name: "Unknown", regNo: "-" };
  fingerprintLogs.push({
    id,
    name: user.name,
    regNo: user.regNo,
    date,
    time,
    direction: dir
  });

  return res.status(200).json({ message: "Log received" });
});

app.get("/users", (req, res) => {
  return res.json(users);
});

app.get("/logs", (req, res) => {
  return res.json(fingerprintLogs);
});

app.post("/borrow-item", (req, res) => {
  const { name, regNo, item, issuedDate } = req.body;
  if (!name || !regNo || !item || !issuedDate) {
    return res.status(400).json({ message: "Missing fields" });
  }
  borrowedItems.push({ name, regNo, item, issuedDate });
  return res.json({ message: "Item borrowed" });
});

app.get("/borrowed-items", (req, res) => {
  return res.json(borrowedItems);
});

app.delete("/logs/:index", (req, res) => {
  const i = parseInt(req.params.index);
  if (i >= 0 && i < fingerprintLogs.length) {
    fingerprintLogs.splice(i, 1);
    return res.json({ message: "Deleted" });
  }
  res.status(404).json({ message: "Not found" });
});

app.delete("/borrowed-items/:index", (req, res) => {
  const i = parseInt(req.params.index);
  if (i >= 0 && i < borrowedItems.length) {
    borrowedItems.splice(i, 1);
    return res.json({ message: "Deleted" });
  }
  res.status(404).json({ message: "Not found" });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
