import os
import uuid
from typing import Any, Dict, List, Optional

import requests


class NooterraError(Exception):
    pass


class NooterraClient:
    """
    Usage:
        client = NooterraClient(
            registry_url="https://api.nooterra.ai",
            coordinator_url="https://coord.nooterra.ai",
            registry_api_key="...",
            coordinator_api_key="...",
        )
        client.register_agent("did:noot:demo", [{"description": "I provide weather"}])
        task_id = client.publish_task("Need weather report", budget=5)
        client.submit_bid(task_id, "did:noot:demo", amount=3)
        client.settle(task_id)
    """

    def __init__(
        self,
        registry_url: Optional[str] = None,
        coordinator_url: Optional[str] = None,
        registry_api_key: Optional[str] = None,
        coordinator_api_key: Optional[str] = None,
    ):
        self.registry_url = registry_url or os.environ.get("REGISTRY_URL", "").rstrip("/")
        self.coordinator_url = coordinator_url or os.environ.get("COORD_URL", "").rstrip("/")
        self.registry_api_key = registry_api_key or os.environ.get("REGISTRY_API_KEY", "")
        self.coordinator_api_key = coordinator_api_key or os.environ.get("COORD_API_KEY", "")
        if not self.registry_url or not self.coordinator_url:
            raise ValueError("registry_url and coordinator_url are required")

    def _headers(self, api_key: Optional[str]) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["x-api-key"] = api_key
        return headers

    def register_agent(self, did: str, capabilities: List[Dict[str, Any]], name: Optional[str] = None):
        body = {"did": did, "name": name, "capabilities": capabilities}
        resp = requests.post(
            f"{self.registry_url}/v1/agent/register",
            json=body,
            headers=self._headers(self.registry_api_key),
            timeout=15,
        )
        if not resp.ok:
            raise NooterraError(f"register failed: {resp.status_code} {resp.text}")
        return resp.json()

    def discovery(self, query: str, limit: int = 5):
        resp = requests.post(
            f"{self.registry_url}/v1/agent/discovery",
            json={"query": query, "limit": limit},
            headers=self._headers(self.registry_api_key),
            timeout=15,
        )
        if not resp.ok:
            raise NooterraError(f"discovery failed: {resp.status_code} {resp.text}")
        return resp.json()

    def publish_task(self, description: str, budget: Optional[float] = None, webhook_url: Optional[str] = None):
        body = {"description": description}
        if budget is not None:
            body["budget"] = budget
        if webhook_url:
            body["webhookUrl"] = webhook_url
        resp = requests.post(
            f"{self.coordinator_url}/v1/tasks/publish",
            json=body,
            headers=self._headers(self.coordinator_api_key),
            timeout=15,
        )
        if not resp.ok:
            raise NooterraError(f"publish failed: {resp.status_code} {resp.text}")
        return resp.json().get("taskId")

    def submit_bid(self, task_id: str, agent_did: str, amount: Optional[float] = None, eta_ms: Optional[int] = None):
        body = {"agentDid": agent_did}
        if amount is not None:
            body["amount"] = amount
        if eta_ms is not None:
            body["etaMs"] = eta_ms
        resp = requests.post(
            f"{self.coordinator_url}/v1/tasks/{task_id}/bid",
            json=body,
            headers=self._headers(self.coordinator_api_key),
            timeout=15,
        )
        if not resp.ok:
            raise NooterraError(f"bid failed: {resp.status_code} {resp.text}")
        return resp.json()

    def settle(self, task_id: str, payouts: Optional[List[Dict[str, Any]]] = None):
        body = {}
        if payouts is not None:
            body["payouts"] = payouts
        resp = requests.post(
            f"{self.coordinator_url}/v1/tasks/{task_id}/settle",
            json=body,
            headers=self._headers(self.coordinator_api_key),
            timeout=15,
        )
        if not resp.ok:
            raise NooterraError(f"settle failed: {resp.status_code} {resp.text}")
        return resp.json()

    def feedback(self, task_id: str, agent_did: str, rating: float, comment: Optional[str] = None):
        body = {"agentDid": agent_did, "rating": rating}
        if comment:
            body["comment"] = comment
        resp = requests.post(
            f"{self.coordinator_url}/v1/tasks/{task_id}/feedback",
            json=body,
            headers=self._headers(self.coordinator_api_key),
            timeout=15,
        )
        if not resp.ok:
            raise NooterraError(f"feedback failed: {resp.status_code} {resp.text}")
        return resp.json()

    def balances(self, agent_did: str):
        resp = requests.get(
            f"{self.coordinator_url}/v1/balances/{agent_did}",
            headers=self._headers(self.coordinator_api_key),
            timeout=15,
        )
        if not resp.ok:
            raise NooterraError(f"balances failed: {resp.status_code} {resp.text}")
        return resp.json()

    def ledger(self, agent_did: str, limit: int = 50):
        resp = requests.get(
            f"{self.coordinator_url}/v1/ledger/{agent_did}/history",
            params={"limit": limit},
            headers=self._headers(self.coordinator_api_key),
            timeout=15,
        )
        if not resp.ok:
            raise NooterraError(f"ledger failed: {resp.status_code} {resp.text}")
        return resp.json()

    @staticmethod
    def random_did(prefix: str = "agent") -> str:
        return f"did:noot:{prefix}-{uuid.uuid4()}"
