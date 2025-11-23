import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL || "postgres://postgres:postgres@localhost:5432/nooterra",
});

export async function migrate() {
  await pool.query(`
    create table if not exists tasks (
      id uuid primary key,
      requester_did text,
      description text not null,
      requirements jsonb,
      budget numeric,
      deadline timestamptz,
      status text default 'open',
      winner_did text,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists bids (
      id serial primary key,
      task_id uuid references tasks(id) on delete cascade,
      agent_did text not null,
      amount numeric,
      eta_ms int,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists balances (
      agent_did text primary key,
      credits numeric default 0,
      updated_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists webhooks (
      id serial primary key,
      task_id uuid,
      target_url text not null,
      event text not null,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`
    create index if not exists bids_task_idx on bids(task_id);
  `);
}
