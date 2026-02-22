/**
 * lib/db.ts
 * Singleton MySQL connection pool shared across all API routes.
 * Uses mysql2/promise for async/await support.
 */

import mysql from "mysql2/promise";

declare global {
  // Prevent duplicate pools in Next.js hot-reload dev mode
  var _mysqlPool: mysql.Pool | undefined;
}

function createPool(): mysql.Pool {
  const required = ["MYSQL_HOST", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing env var: ${key}`);
  }

  return mysql.createPool({
    host              : process.env.MYSQL_HOST!,
    port              : parseInt(process.env.MYSQL_PORT ?? "3306", 10),
    user              : process.env.MYSQL_USER!,
    password          : process.env.MYSQL_PASSWORD!,
    database          : process.env.MYSQL_DATABASE!,
    waitForConnections: true,
    connectionLimit   : 10,
    queueLimit        : 0,
    timezone          : "Z",          // Store all datetimes as UTC
    charset           : "utf8mb4",
  });
}

const db: mysql.Pool = global._mysqlPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  global._mysqlPool = db;
}

export default db;
