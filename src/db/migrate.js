import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const migrationsDir = path.join(__dirname, 'migrations');

const files = fs.readdirSync(migrationsDir).sort();

for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  console.log(`Running migration: ${file}`);
  await pool.query(sql);
}

console.log('All migrations complete');
await pool.end();
