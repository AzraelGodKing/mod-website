// A small stand-in for a D1 database, backed by Node's built-in SQLite, so tests run
// the real SQL. Covers what the site uses: prepare().bind().run()/all()/first() and batch().
import { DatabaseSync } from "node:sqlite";

export function sqliteD1() {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    async run() {
      const result = sqlite.prepare(sql).run(...args);
      return { success: true, meta: { changes: Number(result.changes) } };
    },
    async all() {
      return { results: sqlite.prepare(sql).all(...args).map((row) => ({ ...row })) };
    },
    async first() {
      const row = sqlite.prepare(sql).get(...args);
      return row ? { ...row } : null;
    },
  });
  return {
    prepare: (sql) => statement(sql),
    async batch(statements) {
      const out = [];
      for (const item of statements) out.push(await item.run());
      return out;
    },
  };
}
