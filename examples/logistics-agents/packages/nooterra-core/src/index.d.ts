export interface NooterraClientOptions {
    registryUrl: string;
    coordinatorUrl: string;
    registryApiKey?: string;
    coordinatorApiKey?: string;
}
export interface CapabilityInput {
    description: string;
    capabilityId?: string;
    tags?: string[];
}
export interface RegisterResponse {
    ok: boolean;
    registered: number;
}
export interface DiscoveryResult {
    score?: number;
    vectorScore?: number;
    reputationScore?: number;
    agentDid?: string;
    capabilityId?: string;
    description?: string;
    tags?: string[];
    reputation?: number | null;
    agent?: {
        did: string;
        name: string | null;
        endpoint: string | null;
        reputation: number | null;
    } | null;
}
export interface PublishOptions {
    description: string;
    budget?: number;
    webhookUrl?: string;
    requirements?: Record<string, unknown>;
    deadline?: string;
}
export interface BidOptions {
    agentDid: string;
    amount?: number;
    etaMs?: number;
}
export interface FeedbackOptions {
    agentDid: string;
    rating: number;
    comment?: string;
}
export declare class NooterraError extends Error {
    status?: number;
    constructor(message: string, status?: number);
}
export declare class NooterraClient {
    private registryUrl;
    private coordinatorUrl;
    private registryApiKey?;
    private coordinatorApiKey?;
    constructor(opts: NooterraClientOptions);
    private headers;
    private handle;
    registerAgent(did: string, capabilities: CapabilityInput[], name?: string): Promise<RegisterResponse>;
    discovery(query: string, limit?: number): Promise<DiscoveryResult[]>;
    publishTask(opts: PublishOptions): Promise<string>;
    submitBid(taskId: string, opts: BidOptions): Promise<unknown>;
    settle(taskId: string, payouts?: {
        agentDid: string;
        amount: number;
    }[]): Promise<unknown>;
    feedback(taskId: string, opts: FeedbackOptions): Promise<unknown>;
    getFeedback(taskId: string): Promise<unknown>;
    balances(agentDid: string): Promise<unknown>;
    ledger(agentDid: string, limit?: number): Promise<unknown>;
}
