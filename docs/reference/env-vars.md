# Environment Variables Reference

## Public receipt verification and anchoring

MAMV checks AI outputs offchain and anchors receipt hashes onchain so anyone can verify the receipt is authentic, unchanged, and timestamped.

Onchain anchoring makes receipts tamper-evident. It does not guarantee that the AI output is correct.

Common deployment variables:

- `ARBITRUM_SEPOLIA_RPC_URL`: RPC endpoint used for testnet onchain receipt anchoring.
- `ARBITRUM_ONE_RPC_URL`: RPC endpoint used for production anchoring.
- `PRIVATE_KEY`: authorized verifier or deployment key; do not expose it to clients.
- `ETHERSCAN_API_KEY`: contract verification API key.
- `MAMV_ANCHOR_CONTRACT_ADDRESS`: deployed `MAMVAnchor` address used by APIs, CLIs, or dashboards.
- `MAMV_ANCHOR_CHAIN_ID`: chain ID for public receipt verification.

Never place API keys, emails, user IDs, PII/secrets, raw prompts, raw AI outputs, or private evidence in receipt anchor metadata.
