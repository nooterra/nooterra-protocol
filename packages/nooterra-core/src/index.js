import fetch from "node-fetch";
export class NooterraError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
export class NooterraClient {
    constructor(opts) {
        if (!opts.registryUrl || !opts.coordinatorUrl) {
            throw new Error("registryUrl and coordinatorUrl are required");
        }
        this.registryUrl = opts.registryUrl.replace(/\/+$/, "");
        this.coordinatorUrl = opts.coordinatorUrl.replace(/\/+$/, "");
        this.registryApiKey = opts.registryApiKey;
        this.coordinatorApiKey = opts.coordinatorApiKey;
    }
    headers(apiKey) {
        const h = { "Content-Type": "application/json" };
        if (apiKey)
            h["x-api-key"] = apiKey;
        return h;
    }
    async handle(resp) {
        if (!resp.ok) {
            const txt = await resp.text().catch(() => "");
            throw new NooterraError(txt || resp.statusText, resp.status);
        }
        try {
            return await resp.json();
        }
        catch {
            return null;
        }
    }
    async registerAgent(did, capabilities, name) {
        const body = { did, name, capabilities };
        const resp = await fetch(`${this.registryUrl}/v1/agent/register`, {
            method: "POST",
            headers: this.headers(this.registryApiKey),
            body: JSON.stringify(body),
        });
        return (await this.handle(resp));
    }
    async discovery(query, limit = 5) {
        const resp = await fetch(`${this.registryUrl}/v1/agent/discovery`, {
            method: "POST",
            headers: this.headers(this.registryApiKey),
            body: JSON.stringify({ query, limit }),
        });
        const json = await this.handle(resp);
        return json?.results;
    }
    async publishTask(opts) {
        const resp = await fetch(`${this.coordinatorUrl}/v1/tasks/publish`, {
            method: "POST",
            headers: this.headers(this.coordinatorApiKey),
            body: JSON.stringify(opts),
        });
        const json = await this.handle(resp);
        return json?.taskId;
    }
    async submitBid(taskId, opts) {
        const resp = await fetch(`${this.coordinatorUrl}/v1/tasks/${taskId}/bid`, {
            method: "POST",
            headers: this.headers(this.coordinatorApiKey),
            body: JSON.stringify(opts),
        });
        return this.handle(resp);
    }
    async settle(taskId, payouts) {
        const resp = await fetch(`${this.coordinatorUrl}/v1/tasks/${taskId}/settle`, {
            method: "POST",
            headers: this.headers(this.coordinatorApiKey),
            body: JSON.stringify(payouts ? { payouts } : {}),
        });
        return this.handle(resp);
    }
    async feedback(taskId, opts) {
        const resp = await fetch(`${this.coordinatorUrl}/v1/tasks/${taskId}/feedback`, {
            method: "POST",
            headers: this.headers(this.coordinatorApiKey),
            body: JSON.stringify(opts),
        });
        return this.handle(resp);
    }
    async getFeedback(taskId) {
        const resp = await fetch(`${this.coordinatorUrl}/v1/tasks/${taskId}/feedback`, {
            headers: this.headers(this.coordinatorApiKey),
        });
        return this.handle(resp);
    }
    async balances(agentDid) {
        const resp = await fetch(`${this.coordinatorUrl}/v1/balances/${agentDid}`, {
            headers: this.headers(this.coordinatorApiKey),
        });
        return this.handle(resp);
    }
    async ledger(agentDid, limit = 50) {
        const resp = await fetch(`${this.coordinatorUrl}/v1/ledger/${agentDid}/history?limit=${encodeURIComponent(limit)}`, {
            headers: this.headers(this.coordinatorApiKey),
        });
        return this.handle(resp);
    }
}
