/**
 * scripts/init-db.js
 * Reads schema.sql and executes it against your MySQL instance.
 * Run: npm run db:init
 */

const mysql = require("mysql2/promise");
const fs    = require("fs");
const path  = require("path");

async function init() {
  const connection = await mysql.createConnection({
    host    : process.env.MYSQL_HOST     || "localhost",
    port    : parseInt(process.env.MYSQL_PORT || "3306", 10),
    user    : process.env.MYSQL_USER     || "root",
    password: process.env.MYSQL_PASSWORD || "",
    // Do NOT specify database here — schema.sql creates it
    multipleStatements: true,
  });

  console.log("🔗 Connected to MySQL.");

  const sql = fs.readFileSync(path.join(__dirname, "../schema.sql"), "utf8");

  try {
    await connection.query(sql);
    console.log("✅ Schema initialised — database and all tables are ready.");
  } catch (err) {
    console.error("❌ Schema error:", err.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

init();
