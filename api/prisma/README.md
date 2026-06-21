# Database Migrations with Prisma

This directory contains the Prisma schema and database migrations for the MAMV API.

## Table of Contents

- [Overview](#overview)
- [Schema Structure](#schema-structure)
- [Development Workflow](#development-workflow)
- [Production Deployment](#production-deployment)
- [Common Operations](#common-operations)
- [Troubleshooting](#troubleshooting)

---

## Overview

MAMV uses **Prisma** as its database ORM and migration tool. Prisma provides:

- **Type-safe database client** for TypeScript/JavaScript
- **Declarative schema** in `schema.prisma`
- **Version-controlled migrations** for production safety
- **Seeding** for development and testing

### Key Files

- `schema.prisma` - Database schema definition
- `seed.ts` - Seed script for initial data
- `migrations/` - Generated SQL migrations (auto-created)

---

## Schema Structure

The database schema includes the following main models:

### Verification Tasks
- `VerificationTask` - Core verification jobs
- `Evaluation` - Verifier evaluations (commit-reveal)
- `Dispute` - Dispute records

### Webhooks
- `WebhookSubscription` - Webhook endpoints
- `WebhookDelivery` - Delivery history and retries

### Performance Tracking
- `VerifierStats` - Verifier performance metrics
- `BenchmarkResult` - Benchmark run results
- `CalibrationModel` - Calibration model versions

### Access Control
- `ApiKey` - API key management
- `AuditLog` - Audit trail for all actions

---

## Development Workflow

### 1. Install Dependencies

```bash
cd api
npm install
```

### 2. Set Environment Variables

Create a `.env` file in the `api/` directory:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/mamverifier"
```

### 3. Generate Prisma Client

Generate the TypeScript client from the schema:

```bash
npm run prisma:generate
```

This creates `node_modules/.prisma/client` with type-safe database access.

### 4. Run Migrations

Apply migrations to your local database:

```bash
npm run prisma:migrate
```

This will:
- Create the database if it doesn't exist
- Apply all pending migrations
- Regenerate the Prisma Client

**Note:** On first run, you'll be prompted to name the migration. Use a descriptive name like `initial_schema`.

### 5. Seed the Database

Populate with sample data for development:

```bash
npm run prisma:seed
```

This creates:
- 4 sample verification tasks
- 2 evaluations
- 1 dispute
- 2 webhook subscriptions
- Benchmark results
- Calibration model

### 6. Explore Data (Optional)

Launch Prisma Studio to browse/edit data:

```bash
npm run prisma:studio
```

Opens a web UI at `http://localhost:5555`.

---

## Production Deployment

### 1. Set Production DATABASE_URL

```bash
export DATABASE_URL="postgresql://prod_user:prod_pass@prod-db.example.com:5432/mamverifier"
```

### 2. Deploy Migrations

Use `prisma:migrate:deploy` (does NOT prompt for migration names):

```bash
npm run prisma:migrate:deploy
```

This command:
- ✅ Applies pending migrations
- ✅ Safe for CI/CD pipelines
- ❌ Does NOT create new migrations
- ❌ Does NOT reset the database

**Important:** Always run this in production, NOT `prisma:migrate`.

### 3. Verify Deployment

Check migration status:

```bash
npx prisma migrate status
```

Expected output:
```
Database schema is up to date!
```

---

## Common Operations

### Creating a New Migration

When you modify `schema.prisma`:

1. **Update the schema** (e.g., add a new model or field)

```prisma
model NewFeature {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now())
  name      String
}
```

2. **Create and apply migration**

```bash
npm run prisma:migrate
```

3. **Name the migration** when prompted (e.g., `add_new_feature`)

4. **Commit the migration**

```bash
git add prisma/migrations/
git commit -m "feat: Add NewFeature model"
```

### Resetting the Database (Development Only)

⚠️ **Warning:** This deletes ALL data!

```bash
npx prisma migrate reset
```

This will:
1. Drop the database
2. Create a new database
3. Apply all migrations
4. Run the seed script

### Viewing Migration History

```bash
npx prisma migrate status
```

Shows:
- ✅ Applied migrations
- ⏳ Pending migrations
- ❌ Failed migrations

### Introspecting an Existing Database

If you have an existing database and want to generate a Prisma schema:

```bash
npx prisma db pull
```

This creates a `schema.prisma` from the current database structure.

---

## Troubleshooting

### Error: "Database does not exist"

**Solution:** Create the database manually:

```sql
CREATE DATABASE mamverifier;
```

Or let Prisma create it:

```bash
npx prisma db push
```

### Error: "Migration failed"

**Check:**
1. Database credentials in `DATABASE_URL`
2. Network connectivity to database
3. Sufficient permissions (CREATE, ALTER, DROP)

**Fix:**
```bash
# View detailed error
npx prisma migrate resolve --applied <migration_name>

# Mark migration as applied (if manually fixed)
npx prisma migrate resolve --applied 20231201_migration_name

# Mark migration as rolled back
npx prisma migrate resolve --rolled-back 20231201_migration_name
```

### Error: "Prisma Client out of sync"

**Solution:** Regenerate the client:

```bash
npm run prisma:generate
```

### Slow Queries

**Check indexes** in `schema.prisma`:

```prisma
model VerificationTask {
  id        String   @id
  requester String
  createdAt DateTime @default(now())

  @@index([requester])  // Add index for frequent lookups
  @@index([createdAt])  // Add index for time-based queries
}
```

**Apply changes:**
```bash
npm run prisma:migrate
```

### Connection Pool Exhaustion

**Increase pool size** in Prisma Client:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?connection_limit=20',
    },
  },
});
```

---

## Environment-Specific Configurations

### Development

```.env.development
DATABASE_URL="postgresql://dev:dev@localhost:5432/mamverifier_dev"
```

### Testing

```.env.test
DATABASE_URL="postgresql://test:test@localhost:5432/mamverifier_test"
```

### Production

```.env.production
DATABASE_URL="postgresql://prod_user:prod_pass@prod-db:5432/mamverifier"
```

---

## Backup and Restore

### Backup

```bash
pg_dump -h localhost -U user mamverifier > backup.sql
```

### Restore

```bash
psql -h localhost -U user mamverifier < backup.sql
```

---

## Best Practices

1. ✅ **Always commit migrations** to version control
2. ✅ **Test migrations** on staging before production
3. ✅ **Use `prisma:migrate:deploy`** in CI/CD
4. ✅ **Add indexes** for frequently queried fields
5. ✅ **Use transactions** for multi-step operations
6. ❌ **Never edit generated migrations** manually
7. ❌ **Never run `prisma migrate reset`** in production
8. ❌ **Never skip migrations** in the sequence

---

## Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs/)
- [Prisma Migrate Guide](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm run prisma:generate` | Generate Prisma Client from schema |
| `npm run prisma:migrate` | Create and apply new migration (dev) |
| `npm run prisma:migrate:deploy` | Apply migrations (production) |
| `npm run prisma:seed` | Run seed script |
| `npm run prisma:studio` | Open Prisma Studio GUI |
| `npx prisma migrate status` | Check migration status |
| `npx prisma migrate reset` | Reset database (dev only) |
| `npx prisma db push` | Push schema without creating migration |
| `npx prisma db pull` | Generate schema from existing database |

---

**Need Help?** Check the [Prisma Discord](https://discord.gg/prisma) or [GitHub Issues](https://github.com/prisma/prisma/issues).
