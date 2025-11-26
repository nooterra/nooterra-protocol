export class MissingWebhookSecretError extends Error {
  constructor() {
    super("AgentConfig.webhookSecret is required");
    this.name = "MissingWebhookSecretError";
  }
}

export class InvalidEndpointError extends Error {
  constructor(endpoint: string) {
    super(`Invalid endpoint: ${endpoint}`);
    this.name = "InvalidEndpointError";
  }
}

export class RegistrationFailedError extends Error {
  constructor(status: number, body: string) {
    super(`Failed to register agent: ${status} ${body}`);
    this.name = "RegistrationFailedError";
  }
}

export class DispatchSignatureError extends Error {
  constructor() {
    super("Invalid signature on dispatch");
    this.name = "DispatchSignatureError";
  }
}

export class WorkflowPublishError extends Error {
  constructor(status: number, body: string) {
    super(`Failed to publish workflow: ${status} ${body}`);
    this.name = "WorkflowPublishError";
  }
}
