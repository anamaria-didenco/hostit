import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Every table and column the application queries must be created by a
 * migration — not merely declared in `drizzle/schema.ts`.
 *
 * This is a purely static check: it reads the schema and the migration SQL and
 * needs no database, so it runs anywhere.
 *
 * It exists because two objects drifted apart in exactly this way and nobody
 * noticed. `leads."spaceName"` and the whole `api_tokens` table were in
 * schema.ts and in live queries, but no migration created them. Production had
 * them from an out-of-band `drizzle-kit push`, so it worked — while any
 * database built from the migration files alone (a new environment, a restore,
 * a second venue) returned HTTP 500 from `leads.list`, which is on the critical
 * path for every authenticated page.
 *
 * A drift like that is invisible until the day you actually need to rebuild.
 */

const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "drizzle");

/** Table name → column names, as declared in drizzle/schema.ts. */
function parseSchema(): Record<string, string[]> {
  const src = fs.readFileSync(path.join(MIGRATIONS_DIR, "schema.ts"), "utf8");
  const tables: Record<string, string[]> = {};
  const tableRe = /export const \w+ = pgTable\(\s*"([^"]+)"\s*,\s*\{([\s\S]*?)\n\}\s*(?:,|\))/g;
  let m: RegExpExecArray | null;
  while ((m = tableRe.exec(src))) {
    const [, tableName, body] = m;
    const cols: string[] = [];
    // Matches `someProp: varchar("column_name", ...)` — the quoted argument is
    // the real database column, which often differs from the JS property.
    const colRe = /^\s*\w+\s*:\s*\w+\(\s*"([^"]+)"/gm;
    let c: RegExpExecArray | null;
    while ((c = colRe.exec(body))) cols.push(c[1]);
    tables[tableName] = cols;
  }
  return tables;
}

/** Table name → column names, as actually created by the migration SQL. */
function parseMigrations(): Record<string, Set<string>> {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();
  const created: Record<string, Set<string>> = {};
  const add = (table: string, col: string) => {
    (created[table] ??= new Set()).add(col);
  };

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");

    // CREATE TABLE "x" ( "col" type, ... );
    const createRe = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"([^"]+)"\s*\(([\s\S]*?)\n\);/g;
    let t: RegExpExecArray | null;
    while ((t = createRe.exec(sql))) {
      const [, table, body] = t;
      created[table] ??= new Set();
      for (const line of body.split("\n")) {
        const col = line.match(/^\s*"([^"]+)"\s+\S/);
        if (col) add(table, col[1]);
      }
    }

    // ALTER TABLE "x" ADD COLUMN [IF NOT EXISTS] "col" ...
    const alterRe =
      /ALTER TABLE\s+"([^"]+)"\s+ADD COLUMN(?:\s+IF NOT EXISTS)?\s+"([^"]+)"/g;
    let a: RegExpExecArray | null;
    while ((a = alterRe.exec(sql))) add(a[1], a[2]);
  }
  return created;
}

describe("schema / migration parity", () => {
  const schema = parseSchema();
  const migrated = parseMigrations();

  it("parses a meaningful number of tables from both sides", () => {
    // Guards the regexes themselves: if a refactor changes the file's shape and
    // these stop matching, the parity test below would vacuously pass.
    expect(Object.keys(schema).length).toBeGreaterThan(20);
    expect(Object.keys(migrated).length).toBeGreaterThan(20);
  });

  it("creates every table declared in schema.ts", () => {
    const missing = Object.keys(schema).filter(t => !migrated[t]);
    expect(missing, `tables in schema.ts with no CREATE TABLE: ${missing.join(", ")}`).toEqual([]);
  });

  it("creates every column declared in schema.ts", () => {
    const problems: string[] = [];
    for (const [table, cols] of Object.entries(schema)) {
      const have = migrated[table];
      if (!have) continue; // reported by the table test above
      for (const col of cols) {
        if (!have.has(col)) problems.push(`${table}.${col}`);
      }
    }
    expect(problems, `columns in schema.ts that no migration creates: ${problems.join(", ")}`).toEqual([]);
  });

  it("has a journal entry for every migration file, and a file for every entry", () => {
    const journal = JSON.parse(
      fs.readFileSync(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
    ) as { entries: Array<{ tag: string }> };
    const tags = new Set(journal.entries.map(e => e.tag));
    const files = new Set(
      fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).map(f => f.replace(/\.sql$/, "")),
    );

    // A file with no journal entry never runs on boot — the silent version of
    // the same bug this suite exists to catch.
    const unlisted = [...files].filter(f => !tags.has(f));
    expect(unlisted, `migration files missing from _journal.json: ${unlisted.join(", ")}`).toEqual([]);

    const orphaned = [...tags].filter(t => !files.has(t));
    expect(orphaned, `journal entries with no .sql file: ${orphaned.join(", ")}`).toEqual([]);
  });
});
