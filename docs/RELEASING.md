# Releasing MAMV

MAMV releases are cut from the protected `main` branch. Releases use Semantic Versioning and record user-facing changes in [CHANGELOG.md](../CHANGELOG.md).

## Maintainer checklist

1. Confirm that the pull request is merged to `main` and all required checks are green: **Lint + Typecheck**, **Unit tests**, **Contract tests**, **Dashboard build**, and **E2E**.
2. Update the `Unreleased` section in `CHANGELOG.md`, add a version heading with the release date, and update its comparison links.
3. Update package versions when publishing packages is part of the release.
4. On an up-to-date local `main`, run:

   ```bash
   npm ci
   npm run lint
   npm run typecheck
   npm test
   git status --short
   ```

5. Commit the release notes, merge them through a pull request, then create an annotated tag from the resulting `main` commit:

   ```bash
   git checkout main
   git pull --ff-only
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```

6. The **Release** GitHub Actions workflow validates the tag and changelog, then creates the GitHub release. Review the generated release and publish any intended npm packages using scoped, least-privilege credentials.

## Branch-protection setup

The intended policy is versioned in [`.github/branch-protection.json`](../.github/branch-protection.json). A repository administrator must apply it once after the `main` branch has been pushed. The command also makes `main` the repository default branch:

```bash
gh auth login
.github/scripts/configure-branch-protection.sh michaelmannen3-oss/MAMV
```

The policy requires one approving review, up-to-date branches, conversation resolution, linear history, and the CI checks above. It also blocks force pushes and branch deletion, including for administrators.

GitHub branch protection is repository-hosted state, so it cannot be enabled by a commit alone; the script makes the applied policy reproducible and reviewable.
