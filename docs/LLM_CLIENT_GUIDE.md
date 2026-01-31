# LLM Client Guide

This guide makes MMV easy to call from LLM tool/function frameworks by providing
copy/paste-ready schemas, prompts, and response handling patterns.

## 1) Minimal LLM Tool Definition (OpenAI-style)

Use this tool definition so an LLM can call the `/api/verify` endpoint with structured arguments.

```json
{
  "type": "function",
  "function": {
    "name": "mm_verifier_submit",
    "description": "Submit a prompt for multi-LLM verification and receive a taskId (uint256).",
    "parameters": {
      "type": "object",
      "properties": {
        "prompt": {
          "type": "string",
          "description": "The user prompt to verify."
        },
        "models": {
          "type": "array",
          "items": { "type": "string" },
          "description": "List of model IDs to cross-check."
        },
        "taskType": {
          "type": "string",
          "enum": [
            "factual-qa",
            "math-proof",
            "policy-compliance",
            "citation-check",
            "general"
          ],
          "description": "Task classification to guide scoring."
        },
        "deadline": {
          "type": "integer",
          "description": "Unix timestamp deadline (optional)."
        },
        "rewardPool": {
          "type": "number",
          "description": "Reward pool in ETH (optional)."
        }
      },
      "required": ["prompt", "models", "taskType"]
    }
  }
}
```

### Example tool call arguments

```json
{
  "prompt": "What is the capital of France?",
  "models": ["gpt-4", "claude-3-opus", "gemini-pro"],
  "taskType": "factual-qa"
}
```

## 2) REST Request/Response Shape

### POST `/api/verify`

```bash
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is the capital of France?",
    "models": ["gpt-4", "claude-3-opus", "gemini-pro"],
    "taskType": "factual-qa"
  }'
```

Response (truncated):

```json
{
  "jobId": "123",
  "status": "pending",
  "promptHash": "0x...",
  "models": ["gpt-4", "claude-3-opus", "gemini-pro"],
  "taskType": "factual-qa",
  "deadline": "2026-01-10T12:00:00Z",
  "estimatedCompletion": "2026-01-10T11:00:00Z"
}
```

### GET `/api/verify/:jobId`

```bash
curl http://localhost:3000/api/verify/123
```

Response (completed):

```json
{
  "jobId": "123",
  "status": "completed",
  "promptHash": "0x...",
  "models": ["gpt-4", "claude-3-opus", "gemini-pro"],
  "taskType": 0,
  "rewardPool": "10000000000000000",
  "deadline": "2026-01-10T12:00:00Z",
  "result": {
    "score": 95,
    "verdict": "reliable",
    "confidence": 0.98,
    "verifiers": ["0xabc..."],
    "evaluations": [
      {
        "verifier": "0xabc...",
        "score": 95,
        "verdict": "reliable",
        "evidenceHash": "ipfs://Qm..."
      }
    ]
  }
}
```

## 3) LLM-Friendly System Prompt Template

Use this system prompt to help an LLM decide when to call MMV and how to summarize results.

```
You are an assistant that can verify answers using the MMV API.
When the user asks a factual, mathematical, policy, or citation-sensitive question,
call mm_verifier_submit with a concise prompt, a model list, and an appropriate taskType.
After receiving the taskId (returned as jobId), poll GET /api/verify/:jobId until status is completed.
Then summarize the verdict, score, and any evidence hashes.
If status is not completed, tell the user verification is pending.
```

## 4) Output Formatting for End Users

Suggested template to keep responses concise and verifiable:

```
Answer: <best-effort response>
Verification: <reliable|mixed|unreliable> (score: <0-100>, confidence: <0-1>)
Evidence: <evidenceHash or "pending">
Notes: <short explanation of any disagreements>
```

## 5) Common LLM Integration Pitfalls

- **Use taskType consistently** so scoring and evidence checks align with the query.
- **Keep the prompt short** (the prompt is hashed on-chain). If a long prompt is needed,
  summarize the user question for verification.
- **Surface pending status** rather than guessing at final verification results.
