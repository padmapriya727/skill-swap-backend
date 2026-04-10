// ============================================================
//  Skill Swap Hub — Backend Server (Render-ready)
//  Uses: Node.js + Express + neo4j-driver
//
//  On Render, secrets come from Environment Variables.
//  Locally, they come from a .env file (see .env.example).
// ============================================================

require("dotenv").config();   // Load .env file when running locally

const express  = require("express");
const cors     = require("cors");
const neo4j    = require("neo4j-driver");

const app = express();
app.use(cors());
app.use(express.json());

// ──────────────────────────────────────────────
//  Neo4j connection using Environment Variables
//  (never hardcode passwords in your code!)
// ──────────────────────────────────────────────
const NEO4J_URI      = process.env.NEO4J_URI;       // e.g. neo4j+s://xxxx.databases.neo4j.io
const NEO4J_USER     = process.env.NEO4J_USER;      // e.g. neo4j
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;  // your database password

if (!NEO4J_URI || !NEO4J_USER || !NEO4J_PASSWORD) {
  console.error("❌ Missing Neo4j environment variables!");
  console.error("   Set NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD");
  process.exit(1);
}

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
);

// Test the connection when server starts
async function testConnection() {
  const session = driver.session();
  try {
    await session.run("RETURN 1");
    console.log("✅ Connected to Neo4j successfully!");
  } catch (err) {
    console.error("❌ Neo4j connection failed:", err.message);
    process.exit(1);
  } finally {
    await session.close();
  }
}
testConnection();


// ──────────────────────────────────────────────
//  Health check — Render pings this to confirm
//  the server is alive
// ──────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "Skill Swap Hub backend is running ✅" });
});


// ──────────────────────────────────────────────
//  POST /addUser
//  Body: { name, teach, learn }
// ──────────────────────────────────────────────
app.post("/addUser", async (req, res) => {
  const { name, teach, learn } = req.body;

  if (!name || !teach || !learn) {
    return res.status(400).json({ error: "name, teach, and learn are all required" });
  }

  const session = driver.session();
  try {
    await session.run(
      `
      MERGE (u:User {name: $name})
      MERGE (s1:Skill {name: $teach})
      MERGE (s2:Skill {name: $learn})
      MERGE (u)-[:TEACHES]->(s1)
      MERGE (u)-[:WANTS_TO_LEARN]->(s2)
      `,
      { name, teach, learn }
    );

    console.log(`✅ User added: ${name}`);
    res.json({ message: "User saved successfully!", name, teach, learn });

  } catch (err) {
    console.error("Error adding user:", err.message);
    res.status(500).json({ error: "Failed to save user" });
  } finally {
    await session.close();
  }
});


// ──────────────────────────────────────────────
//  GET /getUsers
// ──────────────────────────────────────────────
app.get("/getUsers", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `
      MATCH (u:User)-[:TEACHES]->(teach:Skill)
      MATCH (u)-[:WANTS_TO_LEARN]->(learn:Skill)
      RETURN u.name AS name, teach.name AS teach, learn.name AS learn
      ORDER BY u.name
      `
    );

    const users = result.records.map(record => ({
      name:  record.get("name"),
      teach: record.get("teach"),
      learn: record.get("learn"),
    }));

    res.json(users);

  } catch (err) {
    console.error("Error fetching users:", err.message);
    res.status(500).json({ error: "Failed to fetch users" });
  } finally {
    await session.close();
  }
});


// ──────────────────────────────────────────────
//  GET /matchUsers
// ──────────────────────────────────────────────
app.get("/matchUsers", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(
      `
      MATCH (a:User)-[:TEACHES]->(s1:Skill)<-[:WANTS_TO_LEARN]-(b:User),
            (b)-[:TEACHES]->(s2:Skill)<-[:WANTS_TO_LEARN]-(a)
      WHERE a.name <> b.name
      RETURN a.name AS user1, b.name AS user2, s1.name AS skill1, s2.name AS skill2
      `
    );

    const matches = result.records.map(record =>
      `${record.get("user1")} ↔ ${record.get("user2")} (${record.get("skill1")} / ${record.get("skill2")})`
    );

    res.json(matches);

  } catch (err) {
    console.error("Error finding matches:", err.message);
    res.status(500).json({ error: "Failed to find matches" });
  } finally {
    await session.close();
  }
});


// ──────────────────────────────────────────────
//  DELETE /deleteUser/:name
// ──────────────────────────────────────────────
app.delete("/deleteUser/:name", async (req, res) => {
  const { name } = req.params;
  const session = driver.session();
  try {
    await session.run(
      `MATCH (u:User {name: $name}) DETACH DELETE u`,
      { name }
    );
    res.json({ message: `User "${name}" deleted.` });
  } catch (err) {
    console.error("Error deleting user:", err.message);
    res.status(500).json({ error: "Failed to delete user" });
  } finally {
    await session.close();
  }
});


// ──────────────────────────────────────────────
//  Render sets process.env.PORT automatically.
//  We fall back to 8080 for local development.
// ──────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
