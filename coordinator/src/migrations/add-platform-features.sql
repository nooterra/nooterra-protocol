-- Platform features migration
-- Role-based users, conversations, teams, payments

-- Add role to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hf_token text; -- Encrypted HuggingFace token
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Conversations table for chat history
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id int REFERENCES users(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Messages within conversations
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  role text NOT NULL, -- 'user' or 'assistant'
  content text NOT NULL,
  agents_used text[], -- DIDs of agents that contributed
  workflow_id uuid, -- Optional link to workflow
  tokens_used int DEFAULT 0,
  credits_spent int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id);

-- Teams/Organizations
CREATE TABLE IF NOT EXISTS teams (
  id serial PRIMARY KEY,
  name text NOT NULL,
  owner_user_id int REFERENCES users(id) ON DELETE SET NULL,
  slug text UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id serial PRIMARY KEY,
  team_id int REFERENCES teams(id) ON DELETE CASCADE,
  user_id int REFERENCES users(id) ON DELETE CASCADE,
  role text DEFAULT 'member', -- 'owner', 'admin', 'member'
  invited_at timestamptz DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id int REFERENCES teams(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text DEFAULT 'member',
  invited_by int REFERENCES users(id),
  expires_at timestamptz DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Saved workflows (for org workflow builder)
CREATE TABLE IF NOT EXISTS saved_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id int REFERENCES teams(id) ON DELETE CASCADE,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  nodes jsonb NOT NULL,
  status text DEFAULT 'draft', -- 'draft', 'active', 'paused'
  trigger_type text, -- 'manual', 'webhook', 'schedule'
  trigger_config jsonb,
  run_count int DEFAULT 0,
  last_run_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Payment transactions (Stripe)
CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  stripe_payment_intent_id text,
  stripe_session_id text,
  amount_cents int NOT NULL,
  currency text DEFAULT 'usd',
  credits_purchased int NOT NULL,
  status text DEFAULT 'pending', -- 'pending', 'completed', 'failed'
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id serial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  stripe_subscription_id text,
  plan text DEFAULT 'free', -- 'free', 'pro', 'team'
  credits_per_month int DEFAULT 500,
  current_period_start timestamptz,
  current_period_end timestamptz,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- HuggingFace model deployments
CREATE TABLE IF NOT EXISTS hf_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  hf_model_id text NOT NULL,
  agent_did text,
  name text,
  description text,
  price_cents int DEFAULT 10,
  status text DEFAULT 'deploying', -- 'deploying', 'active', 'failed', 'stopped'
  endpoint_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Usage tracking
CREATE TABLE IF NOT EXISTS usage_logs (
  id serial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  conversation_id uuid,
  workflow_id uuid,
  agents_used text[],
  credits_used int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_logs_user_idx ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS usage_logs_created_idx ON usage_logs(created_at);

-- Webhook notifications
CREATE TABLE IF NOT EXISTS user_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id int REFERENCES users(id) ON DELETE CASCADE,
  url text NOT NULL,
  events jsonb NOT NULL, -- Array of event types
  secret text NOT NULL,
  is_active boolean DEFAULT true,
  last_triggered_at timestamptz,
  last_status int,
  fail_count int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_webhooks_user_idx ON user_webhooks(user_id);

-- Notification preferences
CREATE TABLE IF NOT EXISTS user_notification_prefs (
  user_id int PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_notifications boolean DEFAULT true,
  discord_webhook text,
  notify_on_workflow_complete boolean DEFAULT true,
  notify_on_low_credits boolean DEFAULT true,
  low_credits_threshold int DEFAULT 100,
  updated_at timestamptz DEFAULT now()
);

-- Crypto payments (Web3)
CREATE TABLE IF NOT EXISTS crypto_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  tx_hash text UNIQUE NOT NULL,
  chain_id int NOT NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  amount_raw text NOT NULL, -- Raw amount in smallest unit (e.g., wei for ETH, 6 decimals for USDC)
  token_symbol text DEFAULT 'USDC',
  amount_usd numeric(20, 6),
  credits_granted int,
  status text DEFAULT 'pending', -- 'pending', 'verified', 'credited', 'failed'
  verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crypto_payments_user_idx ON crypto_payments(user_id);
CREATE INDEX IF NOT EXISTS crypto_payments_tx_idx ON crypto_payments(tx_hash);

-- Agent payout requests (for developers)
CREATE TABLE IF NOT EXISTS payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  wallet_address text NOT NULL,
  amount_ncr int NOT NULL, -- NCR amount requested
  amount_usd numeric(20, 6), -- USD equivalent
  chain_id int DEFAULT 137, -- Default to Polygon
  status text DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'rejected'
  tx_hash text,
  admin_notes text,
  requested_at timestamptz DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS payout_requests_user_idx ON payout_requests(user_id);
CREATE INDEX IF NOT EXISTS payout_requests_status_idx ON payout_requests(status);

-- Platform integrations (n8n, HuggingFace, LangChain, etc.)
CREATE TABLE IF NOT EXISTS user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id int REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL, -- 'n8n', 'huggingface', 'langchain', 'crewai', 'autogpt', 'webhook'
  name text NOT NULL,
  status text DEFAULT 'connected', -- 'connected', 'pending', 'error', 'disabled'
  agents_imported int DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}',
  last_sync_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_integrations_user_idx ON user_integrations(user_id);
CREATE INDEX IF NOT EXISTS user_integrations_platform_idx ON user_integrations(platform);

-- Agent deployments (Vercel-style hosting)
CREATE TABLE IF NOT EXISTS agent_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  did text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  template text, -- 'gpt4-reasoning', 'code-reviewer', etc.
  source_type text, -- 'template', 'github', 'docker', 'upload'
  source_url text,
  endpoint text NOT NULL,
  price_per_call int DEFAULT 10,
  status text DEFAULT 'deploying', -- 'deploying', 'active', 'stopped', 'failed'
  env_vars jsonb DEFAULT '{}',
  build_logs text,
  total_calls int DEFAULT 0,
  total_revenue int DEFAULT 0,
  last_called_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_deployments_user_idx ON agent_deployments(user_id);
CREATE INDEX IF NOT EXISTS agent_deployments_did_idx ON agent_deployments(did);
CREATE INDEX IF NOT EXISTS agent_deployments_status_idx ON agent_deployments(status);

