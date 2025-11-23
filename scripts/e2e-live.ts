import 'dotenv/config';
import fetch from 'node-fetch';
import { randomUUID } from 'crypto';

const REGISTRY_URL = process.env.REGISTRY_URL || 'https://api.nooterra.ai';
const COORD_URL = process.env.COORD_URL || 'https://coord.nooterra.ai';
const REGISTRY_API_KEY = process.env.REGISTRY_API_KEY || '';
const COORD_API_KEY = process.env.COORD_API_KEY || '';

async function registerAgent(did: string, capability: string) {
  const res = await fetch(`${REGISTRY_URL}/v1/agent/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(REGISTRY_API_KEY ? { 'x-api-key': REGISTRY_API_KEY } : {}),
    },
    body: JSON.stringify({ did, name: did, capabilities: [{ description: capability }] }),
  });
  if (!res.ok) throw new Error(`register failed ${res.status}`);
}

async function search(query: string) {
  const res = await fetch(`${REGISTRY_URL}/v1/agent/discovery`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(REGISTRY_API_KEY ? { 'x-api-key': REGISTRY_API_KEY } : {}),
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`search failed ${res.status}`);
  return res.json();
}

async function publishTask(description: string, budget = 10) {
  const res = await fetch(`${COORD_URL}/v1/tasks/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(COORD_API_KEY ? { 'x-api-key': COORD_API_KEY } : {}),
    },
    body: JSON.stringify({ description, budget }),
  });
  if (!res.ok) throw new Error(`publish failed ${res.status}`);
  const json = await res.json();
  return json.taskId as string;
}

async function bid(taskId: string, agentDid: string, amount: number) {
  const res = await fetch(`${COORD_URL}/v1/tasks/${taskId}/bid`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(COORD_API_KEY ? { 'x-api-key': COORD_API_KEY } : {}),
    },
    body: JSON.stringify({ agentDid, amount, etaMs: 600000 }),
  });
  if (!res.ok) throw new Error(`bid failed ${res.status}`);
}

async function settle(taskId: string) {
  const res = await fetch(`${COORD_URL}/v1/settle/${taskId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(COORD_API_KEY ? { 'x-api-key': COORD_API_KEY } : {}),
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`settle failed ${res.status}`);
  return res.json();
}

async function main() {
  const agentA = `did:noot:A-${randomUUID()}`;
  const agentB = `did:noot:B-${randomUUID()}`;

  console.log('Registering agents...');
  await registerAgent(agentA, 'I need cold storage');
  await registerAgent(agentB, 'I provide cold storage');

  console.log('Searching...');
  const results = await search('cold storage');
  console.log('Search results count:', results?.results?.length);

  console.log('Publishing task...');
  const taskId = await publishTask('Find cold storage nearby', 10);
  console.log('Task ID:', taskId);

  console.log('AgentB bidding...');
  await bid(taskId, agentB, 5);

  console.log('Settling...');
  const settleRes = await settle(taskId);
  console.log('Settlement:', settleRes);

  console.log('E2E complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
