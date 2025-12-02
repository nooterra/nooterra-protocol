/**
 * Platform API endpoints for the Nooterra frontend
 * - Chat completions (routes queries through the network)
 * - Conversation history
 * - Team management
 * - Payments (Stripe integration)
 * - HuggingFace integration
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { pool } from "./db.js";

// Types
type AuthenticatedUser = { 
  id: number; 
  email: string; 
  role?: string;
  address?: string; // Wallet address for Web3 users
};

// Helper to get user from JWT (supports both email and wallet-based auth)
async function getUserFromRequest(request: any, reply: any): Promise<AuthenticatedUser | null> {
  const header = (request.headers["authorization"] as string | undefined) || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) {
    await reply.status(401).send({ error: "Unauthorized" });
    return null;
  }
  try {
    const jwt = await import("jsonwebtoken");
    const JWT_SECRET = process.env.JWT_SECRET || "nooterra-dev-secret";
    const decoded = jwt.default.verify(token, JWT_SECRET) as { 
      userId: number; 
      email?: string; 
      address?: string;
      chainId?: number;
    };
    if (!decoded?.userId) {
      await reply.status(401).send({ error: "Unauthorized" });
      return null;
    }
    const res = await pool.query<{ id: number; email: string | null; wallet_address: string | null; role: string }>(
      `select id, email, wallet_address, role from users where id = $1`,
      [decoded.userId]
    );
    if (!res.rowCount) {
      await reply.status(401).send({ error: "Unauthorized" });
      return null;
    }
    return { 
      id: res.rows[0].id, 
      email: res.rows[0].email || res.rows[0].wallet_address || '', 
      role: res.rows[0].role,
      address: res.rows[0].wallet_address || undefined,
    };
  } catch (err) {
    await reply.status(401).send({ error: "Unauthorized" });
    return null;
  }
}

// Schemas
const chatCompletionSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  })),
  conversationId: z.string().uuid().optional(),
  maxCredits: z.number().int().positive().optional(),
});

const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
});

const createTeamSchema = z.object({
  name: z.string().min(2).max(100),
});

const inviteTeamMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).optional(),
});

const saveWorkflowSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  nodes: z.record(z.object({
    capabilityId: z.string(),
    dependsOn: z.array(z.string()).optional(),
    payload: z.record(z.any()).optional(),
  })),
  triggerType: z.enum(["manual", "webhook", "schedule"]).optional(),
  triggerConfig: z.record(z.any()).optional(),
});

const purchaseCreditsSchema = z.object({
  amount: z.number().int().min(100).max(1000000), // 100 to 1M credits
});

const connectHuggingFaceSchema = z.object({
  token: z.string(),
});

const deployHFModelSchema = z.object({
  modelId: z.string(),
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  pricePerCall: z.number().int().min(1).max(10000).optional(),
  capabilities: z.array(z.string()).optional(),
});

export function registerPlatformRoutes(app: FastifyInstance<any, any, any, any, any>) {
  // ========== CHAT COMPLETIONS ==========
  app.post("/v1/chat/completions", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const parsed = chatCompletionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { messages, conversationId, maxCredits } = parsed.data;
    const userMessage = messages.filter(m => m.role === "user").pop();
    
    if (!userMessage) {
      return reply.status(400).send({ error: "No user message provided" });
    }

    try {
      // Create or update conversation
      let convId = conversationId;
      if (!convId) {
        const convRes = await pool.query(
          `INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
          [user.id, userMessage.content.slice(0, 50)]
        );
        convId = convRes.rows[0].id;
      }

      // Save user message
      await pool.query(
        `INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)`,
        [convId, userMessage.content]
      );

      // Find relevant agents for this query
      const REGISTRY_URL = process.env.REGISTRY_URL || "";
      let agents: any[] = [];
      
      if (REGISTRY_URL) {
        try {
          const discoverRes = await fetch(`${REGISTRY_URL}/v1/agent/discovery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: userMessage.content, limit: 5 }),
          });
          if (discoverRes.ok) {
            const data = await discoverRes.json() as any;
            agents = data.results || [];
          }
        } catch (err) {
          app.log.warn({ err }, "Agent discovery failed");
        }
      }

      // For now, return a demo response (real implementation would route through agents)
      const agentsDids = agents.slice(0, 3).map((a: any) => a.agentDid || "network-orchestrator");
      
      const assistantContent = agents.length > 0
        ? `I found ${agents.length} relevant agents in the network for your query. Here's what they can help with:\n\n${agents.slice(0, 3).map((a: any) => `• **${a.capabilityId}**: ${a.description}`).join("\n")}\n\n*This is a demo response. In production, I would orchestrate these agents to fulfill your request.*`
        : `I processed your request through the Nooterra network. Your query "${userMessage.content.slice(0, 50)}..." was analyzed.\n\n*Connect more agents to the network for richer responses.*`;

      // Save assistant message
      await pool.query(
        `INSERT INTO messages (conversation_id, role, content, agents_used) VALUES ($1, 'assistant', $2, $3)`,
        [convId, assistantContent, agentsDids]
      );

      // Log usage
      await pool.query(
        `INSERT INTO usage_logs (user_id, conversation_id, agents_used, credits_used) VALUES ($1, $2, $3, $4)`,
        [user.id, convId, agentsDids, 10]
      );

      return reply.send({
        conversationId: convId,
        choices: [{
          message: {
            role: "assistant",
            content: assistantContent,
          },
        }],
        agents_used: agentsDids,
        credits_used: 10,
      });
    } catch (err: any) {
      app.log.error({ err }, "Chat completion failed");
      return reply.status(500).send({ error: "chat_failed" });
    }
  });

  // ========== CONVERSATIONS ==========
  app.get("/v1/conversations", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const limit = Math.min(100, Math.max(1, Number((request.query as any)?.limit || 50)));
    
    const res = await pool.query(
      `SELECT c.id, c.title, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count
       FROM conversations c
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC
       LIMIT $2`,
      [user.id, limit]
    );

    return reply.send({ conversations: res.rows });
  });

  app.get("/v1/conversations/:id", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const convId = (request.params as any).id;
    
    const conv = await pool.query(
      `SELECT * FROM conversations WHERE id = $1 AND user_id = $2`,
      [convId, user.id]
    );
    
    if (!conv.rowCount) {
      return reply.status(404).send({ error: "Conversation not found" });
    }

    const messages = await pool.query(
      `SELECT id, role, content, agents_used, created_at 
       FROM messages 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC`,
      [convId]
    );

    return reply.send({
      conversation: conv.rows[0],
      messages: messages.rows,
    });
  });

  app.delete("/v1/conversations/:id", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const convId = (request.params as any).id;
    
    await pool.query(
      `DELETE FROM conversations WHERE id = $1 AND user_id = $2`,
      [convId, user.id]
    );

    return reply.send({ ok: true });
  });

  // ========== USAGE ANALYTICS ==========
  app.get("/v1/usage", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const days = Math.min(365, Math.max(1, Number((request.query as any)?.days || 30)));
    
    const statsRes = await pool.query(
      `SELECT 
        COUNT(DISTINCT conversation_id) as total_conversations,
        SUM(credits_used) as total_credits,
        COUNT(*) as total_queries
       FROM usage_logs
       WHERE user_id = $1 AND created_at > now() - ($2 || ' days')::interval`,
      [user.id, days]
    );

    const agentsRes = await pool.query(
      `SELECT agent, COUNT(*) as count
       FROM usage_logs, unnest(agents_used) as agent
       WHERE user_id = $1 AND created_at > now() - ($2 || ' days')::interval
       GROUP BY agent
       ORDER BY count DESC
       LIMIT 10`,
      [user.id, days]
    );

    const dailyRes = await pool.query(
      `SELECT DATE(created_at) as date, SUM(credits_used) as credits, COUNT(*) as queries
       FROM usage_logs
       WHERE user_id = $1 AND created_at > now() - ($2 || ' days')::interval
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [user.id, days]
    );

    return reply.send({
      period: `${days} days`,
      stats: statsRes.rows[0],
      topAgents: agentsRes.rows,
      daily: dailyRes.rows,
    });
  });

  // ========== TEAMS ==========
  app.post("/v1/teams", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const parsed = createTeamSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { name } = parsed.data;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      const teamRes = await client.query(
        `INSERT INTO teams (name, owner_user_id, slug) VALUES ($1, $2, $3) RETURNING id`,
        [name, user.id, slug + "-" + Date.now()]
      );
      const teamId = teamRes.rows[0].id;

      await client.query(
        `INSERT INTO team_members (team_id, user_id, role, accepted_at) VALUES ($1, $2, 'owner', now())`,
        [teamId, user.id]
      );

      await client.query("COMMIT");
      
      return reply.send({ ok: true, teamId, slug });
    } catch (err: any) {
      await client.query("ROLLBACK");
      app.log.error({ err }, "Create team failed");
      return reply.status(500).send({ error: "create_team_failed" });
    } finally {
      client.release();
    }
  });

  app.get("/v1/teams", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const res = await pool.query(
      `SELECT t.id, t.name, t.slug, tm.role, t.created_at,
              (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
       WHERE tm.user_id = $1 AND tm.accepted_at IS NOT NULL`,
      [user.id]
    );

    return reply.send({ teams: res.rows });
  });

  app.get("/v1/teams/:id", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const teamId = Number((request.params as any).id);
    
    // Verify user is a member
    const memberCheck = await pool.query(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, user.id]
    );
    if (!memberCheck.rowCount) {
      return reply.status(403).send({ error: "Not a team member" });
    }

    const team = await pool.query(`SELECT * FROM teams WHERE id = $1`, [teamId]);
    if (!team.rowCount) {
      return reply.status(404).send({ error: "Team not found" });
    }

    const members = await pool.query(
      `SELECT tm.id, tm.role, tm.accepted_at, u.id as user_id, u.email, u.name
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1`,
      [teamId]
    );

    return reply.send({
      team: team.rows[0],
      members: members.rows,
      currentUserRole: memberCheck.rows[0].role,
    });
  });

  app.post("/v1/teams/:id/invite", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const teamId = Number((request.params as any).id);
    
    // Check if user is admin/owner
    const roleCheck = await pool.query(
      `SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2`,
      [teamId, user.id]
    );
    if (!roleCheck.rowCount || !["owner", "admin"].includes(roleCheck.rows[0].role)) {
      return reply.status(403).send({ error: "Not authorized" });
    }

    const parsed = inviteTeamMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { email, role } = parsed.data;
    
    await pool.query(
      `INSERT INTO team_invites (team_id, email, role, invited_by) VALUES ($1, $2, $3, $4)`,
      [teamId, email.toLowerCase(), role || "member", user.id]
    );

    // TODO: Send invite email
    
    return reply.send({ ok: true, message: `Invite sent to ${email}` });
  });

  // ========== SAVED WORKFLOWS ==========
  app.post("/v1/saved-workflows", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const parsed = saveWorkflowSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { name, description, nodes, triggerType, triggerConfig } = parsed.data;
    const teamId = (request.query as any)?.teamId ? Number((request.query as any).teamId) : null;

    const res = await pool.query(
      `INSERT INTO saved_workflows (team_id, user_id, name, description, nodes, trigger_type, trigger_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [teamId, user.id, name, description || null, nodes, triggerType || "manual", triggerConfig || null]
    );

    return reply.send({ ok: true, workflowId: res.rows[0].id });
  });

  app.get("/v1/saved-workflows", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const teamId = (request.query as any)?.teamId ? Number((request.query as any).teamId) : null;
    
    let query: string;
    let params: any[];

    if (teamId) {
      // Verify team membership
      const memberCheck = await pool.query(
        `SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`,
        [teamId, user.id]
      );
      if (!memberCheck.rowCount) {
        return reply.status(403).send({ error: "Not a team member" });
      }
      query = `SELECT * FROM saved_workflows WHERE team_id = $1 ORDER BY updated_at DESC`;
      params = [teamId];
    } else {
      query = `SELECT * FROM saved_workflows WHERE user_id = $1 AND team_id IS NULL ORDER BY updated_at DESC`;
      params = [user.id];
    }

    const res = await pool.query(query, params);
    return reply.send({ workflows: res.rows });
  });

  app.put("/v1/saved-workflows/:id", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const workflowId = (request.params as any).id;
    const parsed = saveWorkflowSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { name, description, nodes, triggerType, triggerConfig } = parsed.data;

    await pool.query(
      `UPDATE saved_workflows 
       SET name = $1, description = $2, nodes = $3, trigger_type = $4, trigger_config = $5, updated_at = now()
       WHERE id = $6 AND (user_id = $7 OR team_id IN (SELECT team_id FROM team_members WHERE user_id = $7))`,
      [name, description || null, nodes, triggerType || "manual", triggerConfig || null, workflowId, user.id]
    );

    return reply.send({ ok: true });
  });

  // ========== PAYMENTS ==========
  app.post("/v1/payments/create-intent", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const parsed = purchaseCreditsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { amount } = parsed.data;
    const amountCents = Math.ceil(amount * 0.01 * 100); // 1 NCR = $0.01

    // In production, use Stripe
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    
    if (STRIPE_SECRET_KEY) {
      try {
        // Dynamic import of stripe - will fail gracefully if not installed
        let stripeClient: any;
        try {
          const stripeModule = await (Function('return import("stripe")')() as Promise<any>);
          stripeClient = new stripeModule.default(STRIPE_SECRET_KEY);
        } catch {
          app.log.warn("Stripe module not installed, falling back to demo mode");
          stripeClient = null;
        }

        if (stripeClient) {
          const paymentIntent = await stripeClient.paymentIntents.create({
            amount: amountCents,
            currency: "usd",
            metadata: {
              userId: user.id.toString(),
              credits: amount.toString(),
            },
          });

          await pool.query(
            `INSERT INTO payment_transactions (user_id, stripe_payment_intent_id, amount_cents, credits_purchased)
             VALUES ($1, $2, $3, $4)`,
            [user.id, paymentIntent.id, amountCents, amount]
          );

          return reply.send({
            clientSecret: paymentIntent.client_secret,
            amount: amountCents,
            credits: amount,
          });
        }
      } catch (err: any) {
        app.log.error({ err }, "Stripe payment intent failed");
        return reply.status(500).send({ error: "payment_failed" });
      }
    }

    // Demo mode: simulate payment
    const demoIntentId = `demo_${uuidv4()}`;
    await pool.query(
      `INSERT INTO payment_transactions (user_id, stripe_payment_intent_id, amount_cents, credits_purchased, status, completed_at)
       VALUES ($1, $2, $3, $4, 'completed', now())`,
      [user.id, demoIntentId, amountCents, amount]
    );

    // Add credits to user's account
    const userDid = `did:noot:user:${user.id}`;
    await pool.query(
      `INSERT INTO ledger_accounts (owner_did, balance) VALUES ($1, $2)
       ON CONFLICT (owner_did) DO UPDATE SET balance = ledger_accounts.balance + $2`,
      [userDid, amount]
    );

    return reply.send({
      id: demoIntentId,
      amount: amountCents,
      credits: amount,
      status: "completed",
      demo: true,
    });
  });

  app.get("/v1/payments/balance", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const userDid = `did:noot:user:${user.id}`;
    const res = await pool.query(
      `SELECT balance FROM ledger_accounts WHERE owner_did = $1`,
      [userDid]
    );

    const balance = res.rowCount ? Number(res.rows[0].balance) : 0;
    
    return reply.send({ balance, currency: "NCR" });
  });

  app.get("/v1/payments/history", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const res = await pool.query(
      `SELECT * FROM payment_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [user.id]
    );

    return reply.send({ transactions: res.rows });
  });

  // ========== CRYPTO PAYMENTS (USDC) ==========
  
  // Get payment info (supported chains, contract addresses, etc.)
  app.get("/v1/payments/crypto/info", async (_request, reply) => {
    return reply.send({
      supportedChains: [
        { chainId: 137, name: "Polygon", usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
        { chainId: 8453, name: "Base", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
        { chainId: 42161, name: "Arbitrum", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
      ],
      treasuryAddress: process.env.TREASURY_ADDRESS || "0x0000000000000000000000000000000000000000",
      exchangeRate: 100, // 1 USDC = 100 NCR credits
      minDeposit: 1_000_000, // 1 USDC (6 decimals)
    });
  });

  // Record a crypto payment (called after on-chain transfer is confirmed)
  app.post("/v1/payments/crypto/record", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const schema = z.object({
      txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
      chainId: z.number().int().positive(),
      amount: z.string(), // Amount in USDC (with decimals as string to preserve precision)
      fromAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { txHash, chainId, amount, fromAddress } = parsed.data;

    // Verify the transaction on-chain (in production)
    // For now, we'll trust the client but mark it for verification
    
    // Check for duplicate
    const existingTx = await pool.query(
      `SELECT id FROM payment_transactions WHERE tx_hash = $1`,
      [txHash]
    );
    if (existingTx.rowCount) {
      return reply.status(409).send({ error: "Transaction already recorded" });
    }

    // Calculate credits (1 USDC = 100 NCR)
    const usdcAmount = parseFloat(amount) / 1_000_000; // Convert from 6 decimals
    const credits = Math.floor(usdcAmount * 100);

    if (credits < 1) {
      return reply.status(400).send({ error: "Amount too small" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Record transaction
      await client.query(
        `INSERT INTO payment_transactions 
         (user_id, tx_hash, chain_id, amount_cents, credits_purchased, status, from_address, payment_method, completed_at)
         VALUES ($1, $2, $3, $4, $5, 'pending_verification', $6, 'crypto', now())`,
        [user.id, txHash, chainId, Math.floor(usdcAmount * 100), credits, fromAddress.toLowerCase()]
      );

      // Add credits (optimistic - will be reverted if verification fails)
      const payerDid = user.address 
        ? `did:noot:wallet:${user.address}` 
        : `did:noot:user:${user.id}`;
      
      await client.query(
        `INSERT INTO ledger_accounts (owner_did, balance) VALUES ($1, $2)
         ON CONFLICT (owner_did) DO UPDATE SET balance = ledger_accounts.balance + $2`,
        [payerDid, credits]
      );

      // Record ledger event
      await client.query(
        `INSERT INTO ledger_events (account_id, delta, reason, meta)
         SELECT id, $2, 'crypto_deposit', $3
         FROM ledger_accounts WHERE owner_did = $1`,
        [payerDid, credits, { txHash, chainId, amount, usdcAmount }]
      );

      await client.query("COMMIT");

      return reply.send({
        ok: true,
        credits,
        txHash,
        status: "pending_verification",
        message: "Credits added. Transaction will be verified on-chain.",
      });
    } catch (err: any) {
      await client.query("ROLLBACK");
      app.log.error({ err }, "Crypto payment recording failed");
      return reply.status(500).send({ error: "payment_failed" });
    } finally {
      client.release();
    }
  });

  // Verify pending crypto transactions (background job endpoint)
  app.post("/v1/payments/crypto/verify", async (request, reply) => {
    // This would be called by a background job to verify pending transactions
    // by checking the actual on-chain state
    
    const apiKey = request.headers["x-api-key"];
    if (apiKey !== process.env.COORDINATOR_API_KEY) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const pendingTxs = await pool.query(
      `SELECT * FROM payment_transactions 
       WHERE status = 'pending_verification' AND payment_method = 'crypto'
       LIMIT 100`
    );

    const verified: string[] = [];
    const failed: string[] = [];

    for (const tx of pendingTxs.rows) {
      try {
        // In production, verify on-chain:
        // 1. Check tx exists and is confirmed
        // 2. Verify recipient is treasury
        // 3. Verify amount matches
        // 4. Mark as completed or failed
        
        // For now, auto-verify after 1 minute
        const txAge = Date.now() - new Date(tx.completed_at).getTime();
        if (txAge > 60_000) {
          await pool.query(
            `UPDATE payment_transactions SET status = 'completed' WHERE id = $1`,
            [tx.id]
          );
          verified.push(tx.tx_hash);
        }
      } catch (err) {
        app.log.error({ err, txHash: tx.tx_hash }, "Tx verification failed");
        failed.push(tx.tx_hash);
      }
    }

    return reply.send({ verified, failed });
  });

  // Generate payment request (QR code data for receiving USDC)
  app.post("/v1/payments/crypto/request", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const schema = z.object({
      amount: z.number().min(1).max(1000000), // Credits to purchase
      chainId: z.number().int().positive().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { amount, chainId } = parsed.data;
    const usdcAmount = amount / 100; // Convert credits to USDC
    const usdcAmountWei = BigInt(Math.floor(usdcAmount * 1_000_000)); // 6 decimals

    const treasuryAddress = process.env.TREASURY_ADDRESS || "0x0000000000000000000000000000000000000000";

    // Create a unique payment reference
    const reference = crypto.randomBytes(8).toString('hex');

    return reply.send({
      reference,
      credits: amount,
      usdcAmount,
      usdcAmountWei: usdcAmountWei.toString(),
      treasuryAddress,
      chainId: chainId || 137, // Default to Polygon
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      // ERC20 transfer data for convenience
      transferData: {
        to: treasuryAddress,
        value: "0",
        data: `0xa9059cbb${treasuryAddress.slice(2).padStart(64, '0')}${usdcAmountWei.toString(16).padStart(64, '0')}`,
      },
    });
  });

  // ========== HUGGING FACE INTEGRATION ==========
  app.post("/v1/integrations/huggingface/connect", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const parsed = connectHuggingFaceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { token } = parsed.data;

    // Validate token with HuggingFace
    try {
      const res = await fetch("https://huggingface.co/api/whoami-v2", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        return reply.status(400).send({ error: "Invalid HuggingFace token" });
      }

      const hfUser = await res.json() as any;

      // Encrypt and store token
      const encryptedToken = crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
      // In production, use proper encryption

      await pool.query(
        `UPDATE users SET hf_token = $1 WHERE id = $2`,
        [token, user.id] // Store plain for demo; encrypt in production
      );

      return reply.send({
        ok: true,
        hfUsername: hfUser.name,
        hfFullName: hfUser.fullname,
      });
    } catch (err: any) {
      app.log.error({ err }, "HuggingFace connect failed");
      return reply.status(500).send({ error: "hf_connect_failed" });
    }
  });

  app.delete("/v1/integrations/huggingface", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    await pool.query(`UPDATE users SET hf_token = NULL WHERE id = $1`, [user.id]);
    
    return reply.send({ ok: true });
  });

  app.post("/v1/agents/deploy-hf", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const parsed = deployHFModelSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { modelId, name, description, pricePerCall, capabilities } = parsed.data;

    // Get user's HF token
    const userRes = await pool.query(
      `SELECT hf_token FROM users WHERE id = $1`,
      [user.id]
    );

    if (!userRes.rowCount || !userRes.rows[0].hf_token) {
      return reply.status(400).send({ error: "HuggingFace not connected" });
    }

    const agentDid = `did:noot:hf:${user.id}:${modelId.replace(/\//g, "-")}`;
    
    // Create deployment record
    const deployRes = await pool.query(
      `INSERT INTO hf_deployments (user_id, hf_model_id, agent_did, name, description, price_cents, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'deploying')
       RETURNING id`,
      [user.id, modelId, agentDid, name, description || null, pricePerCall || 10]
    );

    // In production, this would:
    // 1. Create a serverless function or container to host the model
    // 2. Register the agent with the registry
    // 3. Update status to 'active'

    // For demo, mark as active immediately
    await pool.query(
      `UPDATE hf_deployments SET status = 'active', endpoint_url = $1 WHERE id = $2`,
      [`https://agents.nooterra.ai/${agentDid}`, deployRes.rows[0].id]
    );

    // Register with registry (if available)
    const REGISTRY_URL = process.env.REGISTRY_URL;
    const REGISTRY_API_KEY = process.env.REGISTRY_API_KEY;

    if (REGISTRY_URL && REGISTRY_API_KEY) {
      try {
        await fetch(`${REGISTRY_URL}/v1/agent/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": REGISTRY_API_KEY,
          },
          body: JSON.stringify({
            did: agentDid,
            name,
            endpoint: `https://agents.nooterra.ai/${agentDid}`,
            capabilities: [{
              capabilityId: `cap.hf.${modelId.replace(/\//g, ".").toLowerCase()}.v1`,
              description: description || `HuggingFace model: ${modelId}`,
              tags: capabilities || ["inference", "huggingface"],
            }],
          }),
        });
      } catch (err) {
        app.log.warn({ err }, "Failed to register HF agent with registry");
      }
    }

    return reply.send({
      ok: true,
      agentDid,
      deploymentId: deployRes.rows[0].id,
      status: "active",
    });
  });

  app.get("/v1/agents/hf-deployments", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const res = await pool.query(
      `SELECT * FROM hf_deployments WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id]
    );

    return reply.send({ deployments: res.rows });
  });

  // ========== WEB3 AUTH (SIWE) ==========
  
  // In-memory nonce store (use Redis in production)
  const nonceStore = new Map<string, { nonce: string; expiresAt: number }>();
  
  // Generate nonce for SIWE
  app.post("/v1/auth/nonce", async (request, reply) => {
    const schema = z.object({
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { address } = parsed.data;
    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    
    nonceStore.set(address.toLowerCase(), { nonce, expiresAt });
    
    // Clean up expired nonces
    for (const [key, value] of nonceStore) {
      if (value.expiresAt < Date.now()) {
        nonceStore.delete(key);
      }
    }
    
    return reply.send({ nonce });
  });

  // Verify SIWE signature
  app.post("/v1/auth/verify", async (request, reply) => {
    const schema = z.object({
      message: z.string(),
      signature: z.string(),
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { message, signature, address } = parsed.data;
    const addressLower = address.toLowerCase();

    try {
      // Verify nonce
      const storedNonce = nonceStore.get(addressLower);
      if (!storedNonce || storedNonce.expiresAt < Date.now()) {
        return reply.status(400).send({ error: "Nonce expired or invalid" });
      }
      
      // Extract nonce from message
      const nonceMatch = message.match(/Nonce: ([a-f0-9]+)/);
      if (!nonceMatch || nonceMatch[1] !== storedNonce.nonce) {
        return reply.status(400).send({ error: "Invalid nonce" });
      }
      
      // Verify signature using ethers
      let recoveredAddress: string;
      try {
        // Dynamic import to handle optional dependency
        const { verifyMessage } = await import('ethers');
        recoveredAddress = verifyMessage(message, signature).toLowerCase();
      } catch {
        // Fallback: basic signature verification with Web Crypto
        // This is a simplified check - in production use ethers or viem
        app.log.warn("ethers not available, using basic verification");
        recoveredAddress = addressLower; // Trust the address in dev mode
      }
      
      if (recoveredAddress !== addressLower) {
        return reply.status(401).send({ error: "Invalid signature" });
      }
      
      // Clear used nonce
      nonceStore.delete(addressLower);
      
      // Extract chainId from message
      const chainIdMatch = message.match(/Chain ID: (\d+)/);
      const chainId = chainIdMatch ? parseInt(chainIdMatch[1]) : 1;
      
      // Find or create user by wallet address
      const jwt = await import("jsonwebtoken");
      const JWT_SECRET = process.env.JWT_SECRET || "nooterra-dev-secret";
      
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        
        // Check if user exists
        let userRes = await client.query<{ id: number; wallet_address: string; name: string; role: string }>(
          `SELECT id, wallet_address, name, role FROM users WHERE wallet_address = $1`,
          [addressLower]
        );
        
        let userId: number;
        let role = "user";
        let name: string | null = null;
        
        if (!userRes.rowCount) {
          // Create new user
          const newUserRes = await client.query<{ id: number }>(
            `INSERT INTO users (wallet_address, role) VALUES ($1, 'user') RETURNING id`,
            [addressLower]
          );
          userId = newUserRes.rows[0].id;
          
          // Create default project
          const payerDid = `did:noot:wallet:${addressLower}`;
          await client.query(
            `INSERT INTO projects (owner_user_id, name, payer_did) VALUES ($1, $2, $3)`,
            [userId, "Default", payerDid]
          );
          
          // Create ledger account with 100 free credits for new users
          await client.query(
            `INSERT INTO ledger_accounts (owner_did, balance) VALUES ($1, 100)
             ON CONFLICT (owner_did) DO NOTHING`,
            [payerDid]
          );
        } else {
          userId = userRes.rows[0].id;
          role = userRes.rows[0].role || "user";
          name = userRes.rows[0].name;
        }
        
        await client.query("COMMIT");
        
        // Get balance
        const balanceRes = await pool.query(
          `SELECT balance FROM ledger_accounts WHERE owner_did = $1`,
          [`did:noot:wallet:${addressLower}`]
        );
        const balance = balanceRes.rowCount ? Number(balanceRes.rows[0].balance) : 0;
        
        // Generate JWT
        const token = jwt.default.sign(
          { userId, address: addressLower, chainId },
          JWT_SECRET,
          { expiresIn: "7d" }
        );
        
        return reply.send({
          token,
          user: {
            id: userId,
            address: addressLower,
            chainId,
            name,
            role,
            balance,
          },
        });
      } catch (err: any) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      app.log.error({ err }, "SIWE verification failed");
      return reply.status(500).send({ error: "verification_failed" });
    }
  });

  // Update user role
  app.put("/v1/auth/role", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const schema = z.object({
      role: z.enum(["user", "developer", "organization"]),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { role } = parsed.data;

    await pool.query(
      `UPDATE users SET role = $1 WHERE id = $2`,
      [role, user.id]
    );

    return reply.send({ ok: true, role });
  });

  // ========== LEGACY EMAIL AUTH (keeping for backwards compatibility) ==========
  app.post("/v1/auth/signup", async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(2).max(100).optional(),
      role: z.enum(["user", "developer", "organization"]).optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { email, password, name, role } = parsed.data;

    try {
      const bcrypt = await import("bcryptjs");
      const jwt = await import("jsonwebtoken");
      const JWT_SECRET = process.env.JWT_SECRET || "nooterra-dev-secret";

      const hash = await bcrypt.default.hash(password, 10);
      
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        
        const userRes = await client.query<{ id: number }>(
          `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id`,
          [email.toLowerCase(), hash, name || null, role || "user"]
        );
        const userId = userRes.rows[0].id;

        // Create default project
        const payerDid = `did:noot:project:${uuidv4()}`;
        await client.query(
          `INSERT INTO projects (owner_user_id, name, payer_did) VALUES ($1, $2, $3)`,
          [userId, "Default", payerDid]
        );

        // Create ledger account
        await client.query(
          `INSERT INTO ledger_accounts (owner_did, balance) VALUES ($1, 500)`, // 500 free credits
          [payerDid]
        );

        // Also create user ledger account
        await client.query(
          `INSERT INTO ledger_accounts (owner_did, balance) VALUES ($1, 500)`,
          [`did:noot:user:${userId}`]
        );

        await client.query("COMMIT");

        const token = jwt.default.sign({ userId, email: email.toLowerCase() }, JWT_SECRET, { expiresIn: "7d" });

        return reply.send({
          token,
          user: {
            id: userId,
            email: email.toLowerCase(),
            name: name || email.split("@")[0],
            role: role || "user",
          },
        });
      } catch (err: any) {
        await client.query("ROLLBACK");
        if (err.code === "23505") {
          return reply.status(409).send({ error: "Email already registered" });
        }
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      app.log.error({ err }, "Signup failed");
      return reply.status(500).send({ error: "signup_failed" });
    }
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { email, password } = parsed.data;

    try {
      const bcrypt = await import("bcryptjs");
      const jwt = await import("jsonwebtoken");
      const JWT_SECRET = process.env.JWT_SECRET || "nooterra-dev-secret";

      const res = await pool.query<{ id: number; email: string; name: string; role: string; password_hash: string }>(
        `SELECT id, email, name, role, password_hash FROM users WHERE email = $1`,
        [email.toLowerCase()]
      );

      if (!res.rowCount) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const user = res.rows[0];
      const ok = await bcrypt.default.compare(password, user.password_hash);

      if (!ok) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const token = jwt.default.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || user.email.split("@")[0],
          role: user.role || "user",
        },
      });
    } catch (err: any) {
      app.log.error({ err }, "Login failed");
      return reply.status(500).send({ error: "login_failed" });
    }
  });

  app.get("/v1/auth/me", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const res = await pool.query(
      `SELECT id, email, name, role, hf_token IS NOT NULL as hf_connected, created_at
       FROM users WHERE id = $1`,
      [user.id]
    );

    if (!res.rowCount) {
      return reply.status(404).send({ error: "User not found" });
    }

    const balance = await pool.query(
      `SELECT balance FROM ledger_accounts WHERE owner_did = $1`,
      [`did:noot:user:${user.id}`]
    );

    return reply.send({
      ...res.rows[0],
      balance: balance.rowCount ? Number(balance.rows[0].balance) : 0,
    });
  });

  // ==================
  // WEBHOOK NOTIFICATIONS
  // ==================

  const webhookSchema = z.object({
    url: z.string().url(),
    events: z.array(z.enum(["workflow.completed", "workflow.failed", "credits.low", "agent.error"])),
    secret: z.string().optional(),
  });

  // Register a webhook
  app.post("/v1/webhooks", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const parsed = webhookSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { url, events, secret } = parsed.data;
    const webhookId = uuidv4();
    const webhookSecret = secret || crypto.randomBytes(32).toString("hex");

    await pool.query(
      `INSERT INTO user_webhooks (id, user_id, url, events, secret, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [webhookId, user.id, url, JSON.stringify(events), webhookSecret]
    );

    return reply.send({
      id: webhookId,
      url,
      events,
      secret: webhookSecret,
      message: "Webhook registered successfully",
    });
  });

  // List webhooks
  app.get("/v1/webhooks", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const res = await pool.query(
      `SELECT id, url, events, created_at, last_triggered_at, last_status 
       FROM user_webhooks WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id]
    );

    return reply.send({ webhooks: res.rows });
  });

  // Delete a webhook
  app.delete("/v1/webhooks/:id", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const { id } = request.params as { id: string };

    const res = await pool.query(
      `DELETE FROM user_webhooks WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user.id]
    );

    if (!res.rowCount) {
      return reply.status(404).send({ error: "Webhook not found" });
    }

    return reply.send({ message: "Webhook deleted" });
  });

  // Test a webhook
  app.post("/v1/webhooks/:id/test", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const { id } = request.params as { id: string };

    const res = await pool.query(
      `SELECT url, secret FROM user_webhooks WHERE id = $1 AND user_id = $2`,
      [id, user.id]
    );

    if (!res.rowCount) {
      return reply.status(404).send({ error: "Webhook not found" });
    }

    const { url, secret } = res.rows[0];

    try {
      const payload = {
        event: "test",
        timestamp: new Date().toISOString(),
        data: { message: "This is a test webhook from Nooterra" },
      };

      const signature = crypto
        .createHmac("sha256", secret)
        .update(JSON.stringify(payload))
        .digest("hex");

      const fetch = (await import("node-fetch")).default;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Nooterra-Signature": signature,
          "X-Nooterra-Event": "test",
        },
        body: JSON.stringify(payload),
      });

      await pool.query(
        `UPDATE user_webhooks SET last_triggered_at = NOW(), last_status = $2 WHERE id = $1`,
        [id, response.status]
      );

      return reply.send({
        success: response.ok,
        status: response.status,
        message: response.ok ? "Webhook test successful" : "Webhook returned error",
      });
    } catch (err: any) {
      await pool.query(
        `UPDATE user_webhooks SET last_triggered_at = NOW(), last_status = 0 WHERE id = $1`,
        [id]
      );
      return reply.send({
        success: false,
        status: 0,
        message: `Failed to reach webhook: ${err.message}`,
      });
    }
  });

  // ==================
  // NOTIFICATION PREFERENCES
  // ==================

  const notificationPrefsSchema = z.object({
    emailNotifications: z.boolean().optional(),
    discordWebhook: z.string().url().optional().nullable(),
    notifyOnWorkflowComplete: z.boolean().optional(),
    notifyOnLowCredits: z.boolean().optional(),
    lowCreditsThreshold: z.number().optional(),
  });

  app.get("/v1/users/notifications", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const res = await pool.query(
      `SELECT email_notifications, discord_webhook, notify_on_workflow_complete, 
              notify_on_low_credits, low_credits_threshold
       FROM user_notification_prefs WHERE user_id = $1`,
      [user.id]
    );

    if (!res.rowCount) {
      // Return defaults
      return reply.send({
        emailNotifications: true,
        discordWebhook: null,
        notifyOnWorkflowComplete: true,
        notifyOnLowCredits: true,
        lowCreditsThreshold: 100,
      });
    }

    const row = res.rows[0];
    return reply.send({
      emailNotifications: row.email_notifications,
      discordWebhook: row.discord_webhook,
      notifyOnWorkflowComplete: row.notify_on_workflow_complete,
      notifyOnLowCredits: row.notify_on_low_credits,
      lowCreditsThreshold: row.low_credits_threshold,
    });
  });

  app.put("/v1/users/notifications", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const parsed = notificationPrefsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const {
      emailNotifications,
      discordWebhook,
      notifyOnWorkflowComplete,
      notifyOnLowCredits,
      lowCreditsThreshold,
    } = parsed.data;

    await pool.query(
      `INSERT INTO user_notification_prefs 
       (user_id, email_notifications, discord_webhook, notify_on_workflow_complete, 
        notify_on_low_credits, low_credits_threshold)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         email_notifications = COALESCE($2, user_notification_prefs.email_notifications),
         discord_webhook = COALESCE($3, user_notification_prefs.discord_webhook),
         notify_on_workflow_complete = COALESCE($4, user_notification_prefs.notify_on_workflow_complete),
         notify_on_low_credits = COALESCE($5, user_notification_prefs.notify_on_low_credits),
         low_credits_threshold = COALESCE($6, user_notification_prefs.low_credits_threshold),
         updated_at = NOW()`,
      [user.id, emailNotifications, discordWebhook, notifyOnWorkflowComplete, notifyOnLowCredits, lowCreditsThreshold]
    );

    return reply.send({ message: "Notification preferences updated" });
  });

  // ==================
  // NETWORK STATUS
  // ==================

  app.get("/v1/status", async (request, reply) => {
    const start = Date.now();
    
    // Check database
    let dbOk = false;
    try {
      await pool.query("SELECT 1");
      dbOk = true;
    } catch {}

    // Get network stats
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM workflows WHERE created_at > NOW() - INTERVAL '24 hours') as workflows_24h,
        (SELECT COUNT(*) FROM workflows WHERE status = 'running') as active_workflows,
        (SELECT COUNT(DISTINCT owner_did) FROM ledger_accounts) as active_users,
        (SELECT COUNT(DISTINCT did) FROM capabilities WHERE last_seen > NOW() - INTERVAL '1 hour') as active_agents
    `);

    return reply.send({
      status: dbOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - start,
      services: {
        database: dbOk ? "healthy" : "unhealthy",
        coordinator: "healthy",
      },
      stats: stats.rows[0] || {},
    });
  });

  // ==================
  // TREASURY INFO
  // ==================
  
  const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS || "0xb35b717e9aef9f9527ed0f8c19146a8aa5198000";
  
  app.get("/v1/treasury", async (request, reply) => {
    return reply.send({
      address: TREASURY_ADDRESS,
      networks: [
        { chain: "polygon", chainId: 137, usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
        { chain: "base", chainId: 8453, usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
        { chain: "arbitrum", chainId: 42161, usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
      ],
      recommended: "polygon",
    });
  });

  // ==================
  // PLATFORM INTEGRATIONS (n8n, HuggingFace, LangChain, etc.)
  // ==================

  const integrationSchema = z.object({
    platform: z.enum(["n8n", "huggingface", "langchain", "crewai", "autogpt", "webhook"]),
    config: z.record(z.any()),
  });

  // List integrations
  app.get("/v1/integrations", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const res = await pool.query(
      `SELECT id, platform, name, status, agents_imported, last_sync_at as "lastSync", config
       FROM user_integrations WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.id]
    );

    return reply.send({ 
      integrations: res.rows.map(row => ({
        ...row,
        agentsImported: row.agents_imported,
      }))
    });
  });

  // Connect integration
  app.post("/v1/integrations/connect", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const parsed = integrationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { platform, config } = parsed.data;
    const integrationId = uuidv4();
    let name = platform;
    let agentsImported = 0;

    // Platform-specific setup
    try {
      const fetch = (await import("node-fetch")).default;

      if (platform === "n8n" && config.webhookUrl) {
        // Verify n8n webhook exists
        name = `n8n Workflow`;
        agentsImported = 1;
        
        // Register as agent in the registry
        const REGISTRY_URL = process.env.REGISTRY_URL || "https://registry.nooterra.ai";
        await fetch(`${REGISTRY_URL}/v1/agent/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            did: `did:noot:integration:n8n:${integrationId}`,
            name: `n8n Agent (${user.address || user.id})`,
            endpoint: config.webhookUrl,
            walletAddress: user.address,
            capabilities: [{
              capabilityId: `cap.n8n.workflow.${integrationId.slice(0, 8)}`,
              description: "n8n workflow integration",
              tags: ["n8n", "workflow", "automation"],
              price_cents: 10,
            }],
          }),
        });
      }

      if (platform === "huggingface" && config.token) {
        // Verify HF token and get models
        const hfRes = await fetch("https://huggingface.co/api/whoami-v2", {
          headers: { Authorization: `Bearer ${config.token}` },
        });
        
        if (hfRes.ok) {
          const hfData = await hfRes.json() as any;
          name = `Hugging Face (${hfData.name || 'User'})`;
          
          // If specific model provided, import it
          if (config.modelId) {
            agentsImported = 1;
            const REGISTRY_URL = process.env.REGISTRY_URL || "https://registry.nooterra.ai";
            
            // Determine endpoint
            const endpoint = config.modelId.startsWith("http") 
              ? config.modelId 
              : `https://api-inference.huggingface.co/models/${config.modelId}`;
            
            await fetch(`${REGISTRY_URL}/v1/agent/register`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                did: `did:noot:integration:hf:${integrationId}`,
                name: `HF: ${config.modelId.split('/').pop()}`,
                endpoint,
                walletAddress: user.address,
                capabilities: [{
                  capabilityId: `cap.hf.model.${config.modelId.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`,
                  description: `Hugging Face model: ${config.modelId}`,
                  tags: ["huggingface", "ml", "inference"],
                  price_cents: 15,
                }],
              }),
            });
          }
        }
      }

      if (platform === "langchain" && config.endpoint) {
        name = "LangChain Agent";
        agentsImported = 1;
        
        const REGISTRY_URL = process.env.REGISTRY_URL || "https://registry.nooterra.ai";
        await fetch(`${REGISTRY_URL}/v1/agent/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            did: `did:noot:integration:langchain:${integrationId}`,
            name: `LangChain (${config.endpoint.split('/').pop()})`,
            endpoint: config.endpoint,
            walletAddress: user.address,
            capabilities: [{
              capabilityId: `cap.langchain.chain.${integrationId.slice(0, 8)}`,
              description: "LangChain agent/chain",
              tags: ["langchain", "agent", "llm"],
              price_cents: 20,
            }],
          }),
        });
      }

      if (platform === "webhook" && config.url) {
        name = config.name || "Custom Webhook";
        agentsImported = 1;
        
        const REGISTRY_URL = process.env.REGISTRY_URL || "https://registry.nooterra.ai";
        await fetch(`${REGISTRY_URL}/v1/agent/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            did: `did:noot:integration:webhook:${integrationId}`,
            name: config.name || "Custom Agent",
            endpoint: config.url,
            walletAddress: user.address,
            capabilities: [{
              capabilityId: config.capabilityId || `cap.custom.webhook.${integrationId.slice(0, 8)}`,
              description: config.name || "Custom webhook agent",
              tags: ["webhook", "custom"],
              price_cents: 10,
            }],
          }),
        });
      }

    } catch (err: any) {
      app.log.error({ err }, "Integration setup failed");
    }

    // Save integration
    await pool.query(
      `INSERT INTO user_integrations (id, user_id, platform, name, status, agents_imported, config, last_sync_at)
       VALUES ($1, $2, $3, $4, 'connected', $5, $6, NOW())`,
      [integrationId, user.id, platform, name, agentsImported, JSON.stringify(config)]
    );

    return reply.send({
      integration: {
        id: integrationId,
        platform,
        name,
        status: "connected",
        agentsImported,
        lastSync: new Date().toISOString(),
        config,
      },
    });
  });

  // Delete integration
  app.delete("/v1/integrations/:id", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const { id } = request.params as { id: string };

    const res = await pool.query(
      `DELETE FROM user_integrations WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, user.id]
    );

    if (!res.rowCount) {
      return reply.status(404).send({ error: "Integration not found" });
    }

    return reply.send({ message: "Integration deleted" });
  });

  // Sync integration (re-import agents)
  app.post("/v1/integrations/:id/sync", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const { id } = request.params as { id: string };

    // Update sync time
    await pool.query(
      `UPDATE user_integrations SET last_sync_at = NOW() WHERE id = $1 AND user_id = $2`,
      [id, user.id]
    );

    return reply.send({ message: "Sync completed" });
  });

  // Incoming webhook from external platforms (n8n, etc.)
  app.post("/v1/integrations/webhook/:walletAddress", async (request, reply) => {
    const { walletAddress } = request.params as { walletAddress: string };
    
    // Log incoming webhook for the user
    app.log.info({ walletAddress, body: request.body }, "Received external webhook");
    
    // This endpoint receives results from external integrations
    // and can trigger Nooterra workflows or update agent state
    
    return reply.send({ received: true });
  });

  // ==================
  // GITHUB IMPORT (Bulk import agents from GitHub repos)
  // ==================

  const githubImportSchema = z.object({
    repoUrl: z.string().url(),
    name: z.string(),
    description: z.string().optional(),
    capabilities: z.array(z.string()),
    language: z.string().optional(),
  });

  app.post("/v1/integrations/github/import", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const parsed = githubImportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { repoUrl, name, description, capabilities, language } = parsed.data;
    const agentId = uuidv4();
    const did = `did:noot:github:${agentId.slice(0, 12)}`;

    // Register as agent in the registry
    try {
      const fetch = (await import("node-fetch")).default;
      const REGISTRY_URL = process.env.REGISTRY_URL || "https://registry.nooterra.ai";
      
      await fetch(`${REGISTRY_URL}/v1/agent/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          did,
          name,
          endpoint: repoUrl, // GitHub URL as endpoint (will need wrapper)
          walletAddress: user.address,
          capabilities: capabilities.map((capId, i) => ({
            capabilityId: capId,
            description: description || `Capability from ${name}`,
            tags: ["github", language?.toLowerCase() || "unknown"].filter(Boolean),
            price_cents: 10,
          })),
        }),
      });
    } catch (err: any) {
      app.log.error({ err }, "Failed to register GitHub agent");
    }

    // Save to database
    await pool.query(
      `INSERT INTO github_imports (id, user_id, did, repo_url, name, description, language, capabilities, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [agentId, user.id, did, repoUrl, name, description, language, JSON.stringify(capabilities)]
    );

    return reply.send({
      success: true,
      agent: {
        did,
        name,
        repoUrl,
        capabilities,
      },
    });
  });

  // ==================
  // HUGGINGFACE BULK IMPORT
  // ==================

  app.post("/v1/integrations/huggingface/import-models", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const schema = z.object({
      task: z.string().optional(), // e.g., "text-generation", "summarization"
      limit: z.number().int().min(1).max(200).default(50),
      minDownloads: z.number().int().default(1000),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { task, limit, minDownloads } = parsed.data;
    const imported: string[] = [];

    try {
      const fetch = (await import("node-fetch")).default;
      
      // Fetch models from HuggingFace Hub
      let url = `https://huggingface.co/api/models?sort=downloads&direction=-1&limit=${limit}`;
      if (task) {
        url += `&pipeline_tag=${encodeURIComponent(task)}`;
      }

      const hfRes = await fetch(url);
      if (!hfRes.ok) {
        return reply.status(500).send({ error: "HuggingFace API error" });
      }

      const models = await hfRes.json() as any[];
      const REGISTRY_URL = process.env.REGISTRY_URL || "https://registry.nooterra.ai";

      // Task to capability mapping
      const taskToCapability: Record<string, string> = {
        "text-generation": "cap.llm.generate",
        "text2text-generation": "cap.llm.transform",
        "summarization": "cap.text.summarize",
        "translation": "cap.text.translate",
        "question-answering": "cap.qa.answer",
        "conversational": "cap.chat.conversation",
        "text-classification": "cap.text.classify",
        "sentiment-analysis": "cap.text.sentiment",
        "image-classification": "cap.image.classify",
        "object-detection": "cap.image.detect",
        "image-to-text": "cap.image.caption",
        "text-to-image": "cap.image.generate",
        "automatic-speech-recognition": "cap.audio.transcribe",
        "text-to-speech": "cap.audio.speak",
        "feature-extraction": "cap.embedding.extract",
      };

      for (const model of models) {
        if (model.downloads < minDownloads) continue;

        const modelSlug = model.id.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const did = `did:noot:hf:${modelSlug.slice(0, 40)}`;
        const pipelineTask = model.pipeline_tag || "text-generation";
        const capBase = taskToCapability[pipelineTask] || `cap.hf.${pipelineTask.replace(/-/g, "_")}`;
        const capabilityId = `${capBase}.${modelSlug.slice(0, 20)}.v1`;

        // Calculate price based on model popularity
        let price = 5;
        if (model.downloads > 1000000) price = 25;
        else if (model.downloads > 100000) price = 15;
        else if (model.downloads > 10000) price = 10;

        try {
          await fetch(`${REGISTRY_URL}/v1/agent/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              did,
              name: model.id.split("/").pop() || model.id,
              endpoint: `https://api-inference.huggingface.co/models/${model.id}`,
              walletAddress: user.address,
              capabilities: [{
                capabilityId,
                description: `HuggingFace: ${model.id} (${pipelineTask})`,
                tags: ["huggingface", pipelineTask, model.library_name || "transformers"],
                price_cents: price,
              }],
            }),
          });

          imported.push(model.id);
        } catch {}
      }

    } catch (err: any) {
      app.log.error({ err }, "HF bulk import failed");
      return reply.status(500).send({ error: "HuggingFace import failed" });
    }

    return reply.send({
      success: true,
      imported: imported.length,
      models: imported,
    });
  });

  // Get available HuggingFace tasks
  app.get("/v1/integrations/huggingface/tasks", async (request, reply) => {
    return reply.send({
      tasks: [
        { id: "text-generation", name: "Text Generation", description: "Generate text from prompts" },
        { id: "text2text-generation", name: "Text-to-Text", description: "Transform text to text" },
        { id: "summarization", name: "Summarization", description: "Summarize long texts" },
        { id: "translation", name: "Translation", description: "Translate between languages" },
        { id: "question-answering", name: "Question Answering", description: "Answer questions from context" },
        { id: "conversational", name: "Conversational", description: "Chat/dialogue models" },
        { id: "text-classification", name: "Text Classification", description: "Classify text into categories" },
        { id: "sentiment-analysis", name: "Sentiment Analysis", description: "Detect sentiment in text" },
        { id: "image-classification", name: "Image Classification", description: "Classify images" },
        { id: "object-detection", name: "Object Detection", description: "Detect objects in images" },
        { id: "image-to-text", name: "Image Captioning", description: "Generate captions for images" },
        { id: "text-to-image", name: "Text to Image", description: "Generate images from text" },
        { id: "automatic-speech-recognition", name: "Speech to Text", description: "Transcribe audio" },
        { id: "text-to-speech", name: "Text to Speech", description: "Convert text to audio" },
        { id: "feature-extraction", name: "Embeddings", description: "Extract text embeddings" },
      ],
    });
  });

  // Bulk import from GitHub topic
  app.post("/v1/integrations/github/bulk-import", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const schema = z.object({
      topic: z.string(),
      limit: z.number().int().min(1).max(100).default(20),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { topic, limit } = parsed.data;
    const imported: string[] = [];

    try {
      const fetch = (await import("node-fetch")).default;
      
      // Search GitHub for repos with this topic
      const searchRes = await fetch(
        `https://api.github.com/search/repositories?q=topic:${encodeURIComponent(topic)}&sort=stars&per_page=${limit}`,
        {
          headers: {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Nooterra-Agent-Importer",
          },
        }
      );

      if (!searchRes.ok) {
        return reply.status(500).send({ error: "GitHub API error" });
      }

      const searchData = await searchRes.json() as any;
      const repos = searchData.items || [];

      const REGISTRY_URL = process.env.REGISTRY_URL || "https://registry.nooterra.ai";

      for (const repo of repos) {
        const agentId = uuidv4();
        const did = `did:noot:github:${agentId.slice(0, 12)}`;
        
        // Auto-detect capabilities
        const capabilities: string[] = [];
        const topics = repo.topics || [];
        
        if (topics.includes("llm") || topics.includes("language-model")) {
          capabilities.push("cap.llm.inference.v1");
        }
        if (topics.includes("chatbot") || topics.includes("conversational-ai")) {
          capabilities.push("cap.chat.conversation.v1");
        }
        if (topics.includes("agent") || topics.includes("ai-agent")) {
          capabilities.push("cap.agent.autonomous.v1");
        }
        if (capabilities.length === 0) {
          capabilities.push(`cap.github.${repo.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.v1`);
        }

        try {
          await fetch(`${REGISTRY_URL}/v1/agent/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              did,
              name: repo.name,
              endpoint: repo.html_url,
              walletAddress: user.address,
              capabilities: capabilities.map(capId => ({
                capabilityId: capId,
                description: repo.description || `Agent from ${repo.full_name}`,
                tags: ["github", repo.language?.toLowerCase() || "unknown", ...topics.slice(0, 3)],
                price_cents: 10,
              })),
            }),
          });

          imported.push(repo.full_name);
        } catch {}
      }

    } catch (err: any) {
      app.log.error({ err }, "Bulk import failed");
      return reply.status(500).send({ error: "Bulk import failed" });
    }

    return reply.send({
      success: true,
      imported: imported.length,
      repos: imported,
    });
  });

  // ==================
  // AGENT DEPLOYMENT (Vercel-style hosting)
  // ==================

  app.post("/v1/agents/deploy", async (request, reply) => {
    const user = await getUserFromRequest(request, reply);
    if (!user) return;

    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      template: z.string().optional(),
      source: z.string().optional(),
      pricePerCall: z.number().int().min(1).max(1000).default(10),
      envVars: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { name, description, template, source, pricePerCall, envVars } = parsed.data;
    
    // Generate unique identifiers
    const agentId = uuidv4();
    const did = `did:noot:agent:${agentId.slice(0, 8)}`;
    
    // For now, create a placeholder endpoint
    // In production, this would provision actual infrastructure
    const endpoint = `https://agents.nooterra.ai/${agentId.slice(0, 8)}`;

    // Register with registry
    try {
      const fetch = (await import("node-fetch")).default;
      const REGISTRY_URL = process.env.REGISTRY_URL || "https://registry.nooterra.ai";
      
      await fetch(`${REGISTRY_URL}/v1/agent/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          did,
          name,
          endpoint,
          walletAddress: user.address,
          capabilities: [{
            capabilityId: `cap.agent.${agentId.slice(0, 8)}`,
            description: description || name,
            tags: template ? [template] : ["custom"],
            price_cents: pricePerCall,
          }],
        }),
      });
    } catch (err: any) {
      app.log.error({ err }, "Failed to register deployed agent");
    }

    // Save deployment record
    await pool.query(
      `INSERT INTO agent_deployments (id, user_id, did, name, description, template, endpoint, price_per_call, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW())`,
      [agentId, user.id, did, name, description, template, endpoint, pricePerCall]
    );

    return reply.send({
      did,
      name,
      endpoint,
      status: "active",
    });
  });

  app.log.info("Platform routes registered");
}

