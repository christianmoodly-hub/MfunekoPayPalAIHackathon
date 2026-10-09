import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

let sql: Sql | undefined;
let database: Database | undefined;

export function getDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (!database || !sql) {
    sql = postgres(url, { max: 1 });
    database = drizzle(sql, { schema });
  }

  return database;
}

export async function closeDb(): Promise<void> {
  if (!sql) {
    return;
  }

  await sql.end();
  sql = undefined;
  database = undefined;
}
