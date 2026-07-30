import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./web/database/drizzle",
  schema: "./web/database/db/schema.ts",
  dialect: "sqlite",
});
