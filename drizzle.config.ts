import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const connectionString = process.env.DATABASE_URL || "mysql://placeholder:placeholder@localhost:3306/placeholder";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
