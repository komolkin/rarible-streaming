# Deployment Guide - Vercel

## Why Vercel?

Vercel is the **best option** for Next.js projects because:
- ✅ Made by the creators of Next.js - perfect integration
- ✅ Zero-config deployment for Next.js
- ✅ Automatic HTTPS, CDN, and edge functions
- ✅ Free tier with generous limits
- ✅ Easy environment variable management
- ✅ Automatic deployments from Git
- ✅ Preview deployments for PRs

## Prerequisites

1. **GitHub/GitLab/Bitbucket account** (for connecting your repo)
2. **Vercel account** (free at [vercel.com](https://vercel.com))
3. **All your services set up:**
   - Supabase (database)
   - Livepeer (streaming)
   - Privy (authentication)
   - Pinata (IPFS storage)

## Step-by-Step Deployment

### 1. Push Your Code to GitHub

```bash
# If you haven't already, initialize git and push to GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

### 2. Create Vercel Account & Import Project

1. Go to [vercel.com](https://vercel.com) and sign up/login
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository
4. Vercel will auto-detect Next.js

### 3. Configure Environment Variables

In Vercel dashboard, go to **Settings** → **Environment Variables** and add:

#### Required Variables:

```bash
# Database (Supabase)
DATABASE_URL=postgresql://postgres:[password]@[host]:5432/postgres

# Privy Authentication
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret

# Livepeer Streaming
LIVEPEER_API_KEY=your_livepeer_api_key

# Pinata IPFS
PINATA_JWT=your_pinata_jwt_token

# Supabase (for storage and realtime)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

**Important:** 
- Add variables for **Production**, **Preview**, and **Development** environments
- Use `NEXT_PUBLIC_` prefix for variables needed in the browser

### 4. Configure Build Settings

Vercel should auto-detect, but verify:

- **Framework Preset:** Next.js
- **Build Command:** `npm run build` (default)
- **Output Directory:** `.next` (default)
- **Install Command:** `npm install` (default)

### 5. Deploy!

1. Click **"Deploy"**
2. Wait for build to complete (~2-5 minutes)
3. Your app will be live at `your-project.vercel.app`

### 6. Run Database Migrations

After first deployment, you need to run migrations:

**Option A: Using Vercel CLI (Recommended)**
```bash
npm i -g vercel
vercel login
vercel link  # Link to your project
vercel env pull .env.local  # Pull environment variables
npx tsx scripts/create-stream-likes-table.ts  # Run migrations locally with production DB
npx tsx scripts/add-like-count-migration.ts
```

**Option B: Using Supabase SQL Editor**
1. Go to Supabase Dashboard → SQL Editor
2. Run the SQL scripts from `scripts/` folder:
   - `add-stream-likes-table.sql`
   - `add-like-count-column.sql`
   - `add-preview-image-column.sql` (if needed)

**Option C: Create a Migration API Route**
Create `app/api/migrate/route.ts` (protected) to run migrations via API call.

### 7. Set Up Custom Domain (Optional)

1. Go to **Settings** → **Domains**
2. Add your custom domain
3. Follow DNS configuration instructions

## Post-Deployment Checklist

- [ ] Verify all environment variables are set
- [ ] Run database migrations
- [ ] Test authentication (Privy)
- [ ] Test streaming (Livepeer)
- [ ] Test file uploads (Pinata)
- [ ] Test database connections (Supabase)
- [ ] Check Supabase Realtime is enabled for `chat_messages` table
- [ ] Verify Supabase storage buckets exist (`avatars`, `covers`, `stream-covers`)

## Environment-Specific Configuration

### Production Environment Variables
Set these in Vercel dashboard for Production environment.

### Preview/Development
You can use different values for preview deployments (e.g., staging database).

## Troubleshooting

### Build Fails
- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify Node.js version (Vercel uses Node 18.x by default)

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Check Supabase connection pooling settings
- Ensure IP allowlist includes Vercel IPs (or use connection pooling)

### Environment Variables Not Working
- Ensure `NEXT_PUBLIC_` prefix for client-side variables
- Redeploy after adding new variables
- Check variable names match exactly

### API Routes Not Working
- Check serverless function logs in Vercel dashboard
- Verify database connections are using connection pooling
- Check timeout settings (default is 10s, can increase to 60s)

## Alternative Hosting Options

### 1. **Netlify** (Good alternative)
- Similar to Vercel
- Good Next.js support
- Free tier available
- [netlify.com](https://netlify.com)

### 2. **Railway** (Good for full-stack)
- Easy database hosting
- Good for monorepos
- [railway.app](https://railway.app)

### 3. **Render** (Simple deployment)
- Easy setup
- Free tier available
- [render.com](https://render.com)

### 4. **AWS/GCP/Azure** (Enterprise)
- More control
- More complex setup
- Better for large scale

## Recommended: Vercel + Supabase

For this project, **Vercel + Supabase** is the best combination:
- ✅ Vercel handles Next.js hosting perfectly
- ✅ Supabase handles PostgreSQL + Storage + Realtime
- ✅ Both have generous free tiers
- ✅ Easy to scale
- ✅ Great developer experience

## Next Steps After Deployment

1. **Set up monitoring:**
   - Vercel Analytics (built-in)
   - Error tracking (Sentry, LogRocket)

2. **Set up CI/CD:**
   - Already automatic with Vercel + GitHub
   - Preview deployments for every PR

3. **Optimize:**
   - Enable Vercel Edge Functions if needed
   - Configure caching headers
   - Optimize images

4. **Security:**
   - Review environment variables
   - Set up rate limiting
   - Configure CORS properly

