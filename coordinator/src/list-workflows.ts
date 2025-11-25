import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || "postgres://postgres:postgres@localhost:5432/nooterra",
});

export async function listWorkflows(limit = 100) {
  const res = await pool.query(
    `select id, task_id, intent, status, created_at, updated_at from workflows order by created_at desc limit $1`,
    [limit]
  );
  return res.rows;
}
