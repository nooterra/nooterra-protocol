export interface HandlerContext {
  workflowId: string;
  taskId: string;
  nodeId: string;
  capabilityId: string;
  inputs: any;
  parents: Record<string, any>;
  meta: { [k: string]: any };
}

export interface HandlerResult {
  result: any;
  metrics?: { latency_ms?: number; [k: string]: any };
}

export interface AgentHooks {
  onDispatch?: (event: {
    workflowId: string;
    nodeId: string;
    capabilityId: string;
    payload: any;
  }) => void;
  onResult?: (event: {
    workflowId: string;
    nodeId: string;
    capabilityId: string;
    payload: any;
    result: any;
    metrics?: any;
  }) => void;
  onError?: (event: {
    workflowId?: string;
    nodeId?: string;
    capabilityId?: string;
    payload?: any;
    error: unknown;
  }) => void;
  onHeartbeat?: (event: { ok: boolean; error?: any }) => void;
}

export interface CapabilityConfig {
  id: string;
  description: string;
  inputSchema?: any;
  outputSchema?: any;
  priceCredits?: number;
  handler: (ctx: HandlerContext) => Promise<HandlerResult>;
}

export interface AgentConfig {
  did: string;
  registryUrl: string;
  coordinatorUrl: string;
  webhookSecret: string;
  publicKey?: string; // base58 ed25519 (optional for ACARD signing)
  privateKey?: string; // base58 ed25519 (optional for ACARD signing)
  capabilities: CapabilityConfig[];
  endpoint: string; // public base URL, must include scheme and host (no trailing slash)
  port?: number;
  hooks?: AgentHooks;
}

export interface WorkflowNodeDef {
  capabilityId: string;
  dependsOn?: string[];
  payload?: any;
}

export interface WorkflowDef {
  intent?: string;
  nodes: Record<string, WorkflowNodeDef>;
}
