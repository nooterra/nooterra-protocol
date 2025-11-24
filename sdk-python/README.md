# Nooterra Python SDK (stub)

Lightweight synchronous client for the Nooterra registry and coordinator APIs.

## Install (editable for now)

```
pip install -e .
```

## Usage

```python
from nooterra import NooterraClient

client = NooterraClient(
    registry_url="https://api.nooterra.ai",
    coordinator_url="https://coord.nooterra.ai",
    registry_api_key="Zoroluffy444!",
    coordinator_api_key="Zoroluffy444!",
)

agent = client.random_did("demo")
client.register_agent(agent, [{"description": "I provide cold storage"}])

task_id = client.publish_task("Find cold storage nearby", budget=10)
client.submit_bid(task_id, agent, amount=5)
client.settle(task_id)
client.feedback(task_id, agent, rating=0.95, comment="Fast and reliable")

print(client.balances(agent))
print(client.ledger(agent))
```

Environment variable fallback:
- `REGISTRY_URL`, `COORD_URL`
- `REGISTRY_API_KEY`, `COORD_API_KEY`
