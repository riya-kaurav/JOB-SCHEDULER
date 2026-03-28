import pg from 'pg';
// import dotenv from 'dotenv';

// dotenv.config();

const { Pool } = pg;

// const pool = new Pool({
//     connectionString: process.env.DATABASE_URL,
// });

const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'jobscheduler',
    user: 'postgres',
    password: 'db1234',
});

pool.on('connect' , () => {
    console.log('Connected to the database');
});
export const query = (text, params) => pool.query(text, params);


export default pool;
// use connectinn string later
