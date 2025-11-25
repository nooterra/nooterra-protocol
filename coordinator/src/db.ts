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
    create table if not exists workflows (
      id uuid primary key,
      task_id uuid references tasks(id) on delete cascade,
      intent text,
      status text default 'pending',
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);

  await pool.query(`
    create table if not exists task_nodes (
      id uuid primary key,
      workflow_id uuid references workflows(id) on delete cascade,
      name text not null,
      capability_id text not null,
      agent_did text,
      status text default 'pending',
      depends_on text[] default '{}',
      payload jsonb,
      result_hash text,
      result_payload jsonb,
      attempts int default 0,
      max_attempts int default 3,
      started_at timestamptz,
      finished_at timestamptz,
      requires_verification boolean default false,
      verification_status text,
      verified_by text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
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
      agent_did text,
      from_did text,
      to_did text,
      workflow_id uuid,
      node_name text,
      rating numeric check (rating >= 0 and rating <= 1),
      quality numeric,
      latency numeric,
      reliability numeric,
      comment text,
      created_at timestamptz default now()
    );
  `);
  await pool.query(`alter table feedback add column if not exists from_did text;`);
  await pool.query(`alter table feedback add column if not exists to_did text;`);
  await pool.query(`alter table feedback add column if not exists workflow_id uuid;`);
  await pool.query(`alter table feedback add column if not exists node_name text;`);
  await pool.query(`alter table feedback add column if not exists quality numeric;`);
  await pool.query(`alter table feedback add column if not exists latency numeric;`);
  await pool.query(`alter table feedback add column if not exists reliability numeric;`);

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
      workflow_id uuid,
      node_id text,
      event text not null,
      target_url text not null,
      payload jsonb,
      attempts int default 0,
      next_attempt timestamptz default now(),
      status text default 'pending',
      created_at timestamptz default now()
    );
  `);

  await pool.query(`alter table dispatch_queue add column if not exists last_error text;`);

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

  await pool.query(`
    create table if not exists agent_stats (
      agent_did text primary key,
      tasks_success int not null default 0,
      tasks_failed int not null default 0,
      avg_latency_ms double precision not null default 0,
      last_updated_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    create table if not exists agent_reputation (
      agent_did text primary key,
      reputation double precision not null default 0,
      last_updated_at timestamptz not null default now()
    );
  `);

  // agents table lives in the same DB (populated by registry); add reputation column if missing
  await pool.query(`alter table if exists agents add column if not exists reputation double precision default 0;`);
}
