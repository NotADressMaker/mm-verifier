# About MAMV

## Every AI answer comes with a trust receipt.

People do not need “AI verification” for its own sake. They need to know whether they can trust an AI answer, safely publish it, convince a colleague, or prove they did their due diligence. AI answers can be wrong, unsupported, or hard to audit after they are copied into products, reports, workflows, or decisions.

MAMV is an open-source trust-receipt system for AI answers. A user submits an AI output or claim, MAMV runs configured verification checks, and MAMV returns a portable trust receipt. The receipt records what was reviewed, what the system concluded, what evidence or votes supported the result, and how someone can inspect it later.

MAMV does not prove truth. It produces an audit trail for a verification process. For higher-stakes cases, receipt hashes can optionally be anchored onchain to make the receipt tamper-evident. Onchain anchoring proves the record has not changed since anchoring; it does not prove the AI answer is correct.

Longer term, MAMV is designed to support a decentralized verifier marketplace with provider reputation and dispute mechanisms. That marketplace is roadmap work, not required for the MVP.
