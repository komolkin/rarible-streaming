# Database Migration Guide for Vercel

## Option 1: Supabase Migrations (Easiest - Recommended)

Since you're using Supabase, the easiest way is to use Supabase's built-in migration system:

### Setup:
1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Link your project:
```bash
supabase link --project-ref your-project-ref
```

3. Create migrations:
```bash
supabase migration new migration_name
```

4. Push migrations to Supabase:
```bash
supabase db push
```

**Pros:**
- ✅ Automatic migrations on deploy
- ✅ Version controlled
- ✅ Rollback support
- ✅ Works seamlessly with Supabase

**Cons:**
- Requires Supabase CLI setup

---

## Option 2: Run Migrations in Vercel Build (Quick Setup)

Add migrations to your build process:

### Update `package.json`:
```json
{
  "scripts": {
    "build": "npm run db:migrate && next build",
    "db:migrate": "drizzle-kit push:pg"
  }
}
```

**Pros:**
- ✅ Simple setup
- ✅ Runs automatically on every build

**Cons:**
- ⚠️ Slows down builds
- ⚠️ No rollback if migration fails
- ⚠️ May run migrations multiple times

---

## Option 3: Migration API Route (Most Flexible)

Create a protected API route to run migrations on-demand:

### Create `app/api/migrate/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

export async function POST(request: NextRequest) {
  // Add authentication check here
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.MIGRATION_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 })
    }

    const client = postgres(connectionString, { max: 1 })
    const db = drizzle(client)

    await migrate(db, { migrationsFolder: "./drizzle" })

    await client.end()

    return NextResponse.json({ success: true, message: "Migrations completed" })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
```

Then call it after deployment:
```bash
curl -X POST https://your-app.vercel.app/api/migrate \
  -H "Authorization: Bearer YOUR_MIGRATION_SECRET"
```

**Pros:**
- ✅ Full control
- ✅ Can run on-demand
- ✅ Protected with secret

**Cons:**
- Requires manual trigger
- Need to remember to run after deploy

---

## Option 4: GitHub Actions (Best for CI/CD)

Automate migrations with GitHub Actions:

### Create `.github/workflows/migrate.yml`:
```yaml
name: Run Database Migrations

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run migrations
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: npm run db:migrate
```

**Pros:**
- ✅ Automated
- ✅ Runs before deployment
- ✅ Version controlled

**Cons:**
- Requires GitHub Actions setup
- Need to configure secrets

---

## Recommended Approach

**For your setup, I recommend Option 1 (Supabase Migrations)** because:
1. You're already using Supabase
2. It's the most reliable and integrated solution
3. Supabase handles migration tracking automatically
4. Easy rollback if something goes wrong

### Quick Start with Supabase:

1. **Install Supabase CLI:**
```bash
npm install -g supabase
```

2. **Login:**
```bash
supabase login
```

3. **Link your project:**
```bash
supabase link --project-ref your-project-ref
```
(Find your project ref in Supabase Dashboard → Settings → General)

4. **Create your first migration:**
```bash
supabase migration new initial_schema
```

5. **Copy your schema SQL** (I've created `supabase/migrations/20240101000000_initial_schema.sql` for you)

6. **Push to Supabase:**
```bash
supabase db push
```

From now on, migrations will be tracked and can be run automatically!

