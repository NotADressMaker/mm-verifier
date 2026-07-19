# Contributing to MAMV

Thank you for helping improve MAMV. This guide explains the contribution path, local quality bar, and expectations for changes.

## Before you start

- Read the [security policy](SECURITY.md). Do not report vulnerabilities in public issues.
- Search existing issues before starting substantial work. For a feature or broad change, open an issue first so maintainers can align on the approach.
- Use the issue and pull-request templates; they provide the information reviewers need.
- The default branch is `main`. Do not commit directly to it; submit a pull request from a focused branch.

## Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please be respectful and professional in all interactions.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/michaelmannen3-oss/MAMV/issues)
2. If not, create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)
   - Logs or screenshots if applicable

### Suggesting Features

1. Check [Issues](https://github.com/michaelmannen3-oss/MAMV/issues) for existing feature requests
2. Create a new issue with:
   - Clear description of the feature
   - Use cases and benefits
   - Potential implementation approach

### Pull Requests

1. **Fork the repository** and create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name main
   ```

2. **Make your changes** following our coding standards:
   - Write clear, commented code
   - Follow existing code style (use Prettier and ESLint)
   - Add tests for new functionality
   - Update documentation as needed

3. **Test your changes**:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```

4. **Commit your changes**:
   - Use clear, descriptive commit messages
   - Follow conventional-commit prefixes:
     - `feat:` for new features
     - `fix:` for bug fixes
     - `docs:` for documentation
     - `test:` for tests
     - `refactor:` for code refactoring
   - Example: `feat: add support for new LLM provider`

5. **Push to your fork** and create a pull request:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **In your PR description**, include:
   - What changes you made and why
   - How to test the changes
   - Screenshots or examples if applicable
   - Reference any related issues (for example, `Fixes #123`)
   - Confirm that no secrets, credentials, or private receipt data are included

7. **Keep the pull request reviewable**:
   - Rebase or merge `main` when requested so required checks run against the current base.
   - Address review comments and resolve conversations.
   - Use one purpose per pull request; split unrelated changes.

Maintainers require a passing CI suite and one approving review before merging. See [the release guide](docs/RELEASING.md) for the protected-branch and release policy.

## Development Setup

### Prerequisites

- Node.js 18+
- Docker and Docker Compose (optional but recommended)
- Foundry or Hardhat for smart contract development
- API keys for LLM providers (OpenAI, Anthropic, Google)
- Arbitrum Sepolia testnet ETH

### Setup Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/michaelmannen3-oss/MAMV.git
   cd MAMV
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.runtime
   # Edit .env.runtime with your configuration
   ```

4. Start local services (Redis, PostgreSQL, IPFS):
   ```bash
   docker-compose --env-file .env.runtime up -d redis postgres ipfs
   ```

5. Deploy contracts to Arbitrum Sepolia:
   ```bash
   cd contracts
   npx hardhat run scripts/deploy.ts --network arbitrum-sepolia
   ```

6. Start API server:
   ```bash
   cd api
   npm run dev
   ```

7. Start verifier node:
   ```bash
   cd verifier-node
   npm run dev
   ```

## Project Structure

```
MAMV/
├── contracts/          # Solidity smart contracts
│   ├── contracts/     # Contract source files
│   ├── scripts/       # Deployment scripts
│   └── test/          # Contract tests
├── api/               # REST API server
│   ├── src/
│   │   ├── routes/    # API endpoints
│   │   ├── services/  # Business logic
│   │   └── utils/     # Utilities
├── verifier-node/     # Verification service
│   ├── src/
│   │   ├── llm-providers/  # LLM integrations
│   │   ├── scoring/        # Scoring logic
│   │   └── evidence/       # Evidence handling
└── shared/            # Shared types and utilities
```

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Prefer interfaces over types
- Use async/await over promises
- Add JSDoc comments for public functions

### Solidity

- Follow Solidity style guide
- Use NatSpec comments
- Optimize for gas efficiency
- Write comprehensive tests

### Testing

- Write unit tests for all new features
- Maintain >80% code coverage
- Test edge cases and error conditions
- Use descriptive test names

### Documentation

- Update README.md for user-facing changes
- Add inline comments for complex logic
- Update API documentation
- Include examples where helpful

## Smart Contract Development

### Testing Contracts

```bash
cd contracts
npx hardhat test
npx hardhat coverage
```

### Deploying to Testnet

```bash
npx hardhat run scripts/deploy.ts --network arbitrum-sepolia
```

### Verifying Contracts

```bash
npx hardhat verify --network arbitrum-sepolia DEPLOYED_ADDRESS
```

## API Development

### Running Tests

```bash
cd api
npm test
npm run test:watch
```

### Linting

```bash
npm run lint
npm run format
```

## Verifier Node Development

### Testing LLM Integrations

- Use mock responses for tests
- Don't commit API keys
- Test error handling

### Adding New LLM Providers

1. Create provider file in `llm-providers/`
2. Implement query function
3. Add to model router
4. Update documentation

## Security

- Never commit secrets or API keys
- Use environment variables for configuration
- Follow security best practices
- Report security issues privately to the maintainers
- See [SECURITY.md](./SECURITY.md) for the vulnerability disclosure process

## Questions?

If you have questions:
- Check the [README](./README.md)
- Search [existing issues](https://github.com/michaelmannen3-oss/MAMV/issues)
- Ask in a new issue or discussion

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
