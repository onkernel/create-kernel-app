import asyncio
import json
from pathlib import Path
import sys

from dotenv import load_dotenv

# Ensure project root is on the import path when executing directly
project_root = Path(__file__).parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

# Load environment variables from .env.local if present
load_dotenv('.env.local')

from main import cu_task

class KernelContext:  # Minimal stub to satisfy the cu_task signature
    def __init__(self, invocation_id: str):
        self.invocation_id = invocation_id


async def _main() -> None:
    context: KernelContextProtocol = KernelContext(invocation_id="local-test")

    payload = {
        "query": "what is the weather in nyc today?"
    }

    try:
        result = await cu_task(context, payload)
        print("Result:", json.dumps(result, indent=2))
    except Exception as exc:
        print("Error:", str(exc))


if __name__ == "__main__":
    asyncio.run(_main()) 