# Onchain anchoring

Onchain anchoring is optional. MAMV checks AI outputs offchain and creates receipts. Anchoring writes or references a receipt hash onchain so later readers can detect if the receipt changed after anchoring.

Anchoring fields include `chain_id`, `contract_address`, `tx_hash`, `block_number`, and `anchor_status`.

Do not describe anchoring as proving truth. It makes the receipt record tamper-evident and timestamped for higher-stakes accountability.
