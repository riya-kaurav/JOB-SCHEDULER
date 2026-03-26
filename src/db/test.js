import { query } from './index.js';
import dotenv from 'dotenv';

dotenv.config();
console.log('DATABASE_URL:', process.env.DATABASE_URL);
async function test() {
  const res = await query('SELECT NOW()');
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  console.log(res.rows[0]);
}

test();