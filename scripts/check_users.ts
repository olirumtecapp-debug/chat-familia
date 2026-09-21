import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("No DATABASE_URL");
  const conn = await mysql.createConnection(url);
  const [rows] = await conn.query("SELECT id, openId, name, email, createdAt FROM users");
  console.log("Users in DB:", JSON.stringify(rows, null, 2));
  await conn.end();
}

main().catch(console.error);
