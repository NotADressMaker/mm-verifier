# Security Policy

## Supported Versions

Security fixes are applied to the `main` branch and the most recent release series.

## Reporting a Vulnerability

Please **do not** open public GitHub issues for suspected vulnerabilities. Instead:

1. Email the maintainers at `security@mm-verifier.org` with:
   - A detailed description of the issue
   - Steps to reproduce
   - Potential impact and exploitability
   - Any proof-of-concept or screenshots (redacted if needed)
2. You will receive an acknowledgment within 72 hours.
3. We will coordinate a fix and disclosure timeline with you.

## Handling Sensitive Data

- Never commit secrets or API keys to the repository.
- Use `.env` files locally and keep them out of version control.
- For test data, use synthetic or redacted examples.
- If you believe a secret has been exposed, rotate it immediately and notify the maintainers.

## Security Best Practices

- Validate untrusted inputs at API boundaries.
- Keep dependencies up to date and review automated scan results.
- Prefer least-privilege credentials for infrastructure services.
