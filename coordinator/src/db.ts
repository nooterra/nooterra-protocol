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
    create table if not exists ledger (
      id serial primary key,
      agent_did text not null,
      task_id uuid,
      delta numeric not null,
      meta jsonb,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists feedback (
      id serial primary key,
      task_id uuid,
      agent_did text not null,
      rating numeric check (rating >= 0 and rating <= 1),
      comment text,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`create index if not exists feedback_task_idx on feedback(task_id);`);

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

  await pool.query(`
    create table if not exists heartbeats (
      agent_did text primary key,
      last_seen timestamptz not null default now(),
      load numeric default 0,
      latency_ms int default 0,
      queue_depth int default 0,
      availability_score numeric default 1,
      updated_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists dlq (
      id serial primary key,
      task_id uuid,
      target_url text,
      event text,
      payload jsonb,
      attempts int,
      last_error text,
      created_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists dispatch_queue (
      id serial primary key,
      task_id uuid,
      event text not null,
      target_url text not null,
      payload jsonb,
      attempts int default 0,
      next_attempt timestamptz default now(),
      status text default 'pending',
      created_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists task_results (
      id serial primary key,
      task_id uuid references tasks(id) on delete cascade,
      result jsonb,
      error text,
      metrics jsonb,
      hash text,
      created_at timestamptz default now()
    );
  `);
}
