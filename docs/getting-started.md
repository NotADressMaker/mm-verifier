# Getting Started

This is a “local-first” setup path to run MMV end-to-end: contracts (dev chain), API, and verifier node.

## Prerequisites

- Node.js 18+
- A local Ethereum dev environment (Hardhat/Foundry, depending on repo scripts)
- Redis (used for the verification job queue)
- API keys for any LLM providers you plan to use (OpenAI/Anthropic/Google), or run in mock mode where available

## Quickstart: SDK in an app

Install the SDK:

```bash
npm install @mmv/sdk
```
