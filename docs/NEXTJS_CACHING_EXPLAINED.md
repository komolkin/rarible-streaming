# Next.js Caching Explained

## What is Next.js Caching?

Next.js caching is a built-in feature that stores the results of API routes and page renders to avoid re-executing expensive operations (like database queries) on every request.

## Types of Next.js Caching

### 1. **Route Segment Config** (`revalidate`)

Controls how long Next.js caches the response from an API route or page.

```typescript
// app/api/streams/route.ts
export const revalidate = 30 // Cache for 30 seconds
```

**How it works:**
- First request: Executes the function, caches the result
- Next requests (within 30s): Returns cached result instantly
- After 30s: Next request triggers revalidation in background, returns stale cache, then updates cache

**Example:**
```typescript
export const revalidate = 30

export async function GET() {
  // This expensive database query runs once every 30 seconds max
  const streams = await db.select().from(streams)
  return NextResponse.json(streams)
}
```

**Benefits:**
- ✅ Reduces database load by 90%+
- ✅ Faster API responses (cached = instant)
- ✅ Lower costs (fewer database queries)

**Drawbacks:**
- ⚠️ Data can be up to `revalidate` seconds old
- ⚠️ Not suitable for real-time data that changes frequently

---

### 2. **Cache-Control Headers**

HTTP headers that tell browsers and CDNs how long to cache responses.

```typescript
return NextResponse.json(data, {
  headers: {
    'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
  }
})
```

**What each part means:**
- `public`: Can be cached by browsers and CDNs
- `s-maxage=30`: Cache for 30 seconds (CDN cache)
- `stale-while-revalidate=60`: If cache is stale, serve it while fetching fresh data in background (up to 60s)

**Example:**
```typescript
// Without caching
return NextResponse.json(streams) // Every request hits database

// With caching
return NextResponse.json(streams, {
  headers: {
    'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
  }
}) // Database hit max once per 30 seconds
```

---

### 3. **Dynamic vs Static**

```typescript
// Force dynamic (no caching)
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Allow caching (default)
export const revalidate = 30
```

**`force-dynamic`:**
- Every request executes the function
- No caching at all
- Use for: Real-time data, user-specific data, frequently changing data

**Default (with `revalidate`):**
- Caching enabled
- Use for: Data that doesn't change frequently, public data

---

## Real-World Example: Your Streaming App

### Current Setup (No Caching)

```typescript
// app/api/streams/route.ts
export async function GET() {
  // This runs EVERY time someone visits the homepage
  const streams = await db.select().from(streams) // Database query
  const categories = await db.select().from(categories) // Another query
  
  // Generate thumbnails for each stream
  for (const stream of streams) {
    await generateThumbnail(stream) // Expensive operation
  }
  
  return NextResponse.json(streams)
}
```

**Problem:**
- 1000 visitors/hour = 1000 database queries/hour
- Each request takes 1-3 seconds
- High database load
- Slow user experience

---

### With Caching

```typescript
// app/api/streams/route.ts
export const revalidate = 30 // Cache for 30 seconds

export async function GET() {
  // This runs MAX once every 30 seconds
  const streams = await db.select().from(streams)
  // ... rest of code
  return NextResponse.json(streams, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
    }
  })
}
```

**Result:**
- 1000 visitors/hour = ~120 database queries/hour (30s cache = 120 requests/hour max)
- Cached requests return in <50ms (vs 1-3 seconds)
- 90% reduction in database load
- Much faster user experience

---

## When to Use Caching

### ✅ Good for Caching:

1. **Categories** (rarely change)
   ```typescript
   export const revalidate = 3600 // 1 hour
   ```

2. **Ended Streams** (don't change after ending)
   ```typescript
   export const revalidate = 3600 // 1 hour
   ```

3. **Stream List** (acceptable to be 10-30s old)
   ```typescript
   export const revalidate = 30 // 30 seconds
   ```

4. **User Profiles** (change infrequently)
   ```typescript
   export const revalidate = 300 // 5 minutes
   ```

### ❌ Bad for Caching:

1. **Live Stream Status** (needs to be real-time)
   ```typescript
   export const dynamic = 'force-dynamic' // No cache
   ```

2. **Viewer Counts** (changes constantly)
   ```typescript
   export const dynamic = 'force-dynamic' // No cache
   ```

3. **Chat Messages** (real-time)
   ```typescript
   export const dynamic = 'force-dynamic' // No cache
   ```

4. **User-Specific Data** (different per user)
   ```typescript
   export const dynamic = 'force-dynamic' // No cache
   ```

---

## How Caching Works in Your App

### Your Current Routes:

1. **`/api/streams`** - Stream list
   - **Current**: No cache (every request hits DB)
   - **Could cache**: Yes (30s cache acceptable)
   - **Impact**: 90% reduction in queries

2. **`/api/streams/[id]`** - Stream details
   - **Current**: No cache (`force-dynamic`)
   - **Could cache**: Partially (10s for live, 60s for ended)
   - **Impact**: 80% reduction in queries

3. **`/api/categories`** - Categories
   - **Current**: No cache
   - **Could cache**: Yes (1 hour - they rarely change)
   - **Impact**: 99% reduction in queries

4. **`/api/streams/[id]/viewers`** - Viewer count
   - **Current**: No cache (`force-dynamic`)
   - **Should cache**: No (real-time data)
   - **Impact**: Keep as-is

---

## Stale-While-Revalidate Explained

This is the magic that makes caching safe:

```typescript
'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60'
```

**Scenario:**
1. User requests data at 0:00 (cache valid)
2. User requests data at 0:35 (cache expired, but within 60s stale window)
3. Next.js immediately returns stale cache (fast!)
4. Next.js fetches fresh data in background
5. Next request gets fresh data

**Benefits:**
- ✅ Users always get instant responses
- ✅ Data stays relatively fresh
- ✅ No "loading" states from cache misses

---

## Performance Impact

### Without Caching:
```
Request 1: Database query (500ms) → Return data
Request 2: Database query (500ms) → Return data
Request 3: Database query (500ms) → Return data
...
1000 requests = 1000 database queries = 500 seconds total
```

### With 30s Cache:
```
Request 1: Database query (500ms) → Cache result → Return data
Request 2: Return cached (5ms) ✅
Request 3: Return cached (5ms) ✅
...
Request 100: Return cached (5ms) ✅
Request 101: Cache expired → Database query (500ms) → Update cache → Return data
...
1000 requests = ~33 database queries = 16.5 seconds total
```

**Result: 97% reduction in database load!**

---

## Trade-offs

### Pros:
- ✅ Much faster responses
- ✅ Lower database load
- ✅ Lower costs
- ✅ Better user experience
- ✅ Handles traffic spikes better

### Cons:
- ⚠️ Data can be slightly stale (acceptable for most use cases)
- ⚠️ Need to think about what to cache
- ⚠️ Cache invalidation can be tricky (but Next.js handles it)

---

## Best Practices

1. **Cache by data freshness needs:**
   - Real-time: No cache (`force-dynamic`)
   - Near real-time: Short cache (10-30s)
   - Static-ish: Long cache (1 hour+)

2. **Use stale-while-revalidate:**
   - Always include `stale-while-revalidate` in Cache-Control
   - Provides instant responses even when cache expires

3. **Monitor cache hit rates:**
   - Check Vercel dashboard for cache statistics
   - Aim for >70% cache hit rate

4. **Don't cache user-specific data:**
   - User profiles, personal data, etc.
   - Use `force-dynamic` for these

---

## Example: Smart Caching Strategy

```typescript
// app/api/streams/route.ts
export const revalidate = 30 // Cache for 30 seconds

export async function GET(request: NextRequest) {
  const streams = await db.select().from(streams)
  
  // Determine cache time based on content
  const hasLiveStreams = streams.some(s => s.isLive)
  const cacheTime = hasLiveStreams ? 10 : 60 // Live: 10s, Ended: 60s
  
  return NextResponse.json(streams, {
    headers: {
      'Cache-Control': `public, s-maxage=${cacheTime}, stale-while-revalidate=${cacheTime * 2}`
    }
  })
}
```

---

## Summary

**Next.js caching** = Store API responses temporarily to avoid re-running expensive operations.

**Key concepts:**
- `revalidate`: How long to cache (in seconds)
- `Cache-Control`: HTTP headers for browser/CDN caching
- `stale-while-revalidate`: Serve stale cache while fetching fresh data

**For your app:**
- ✅ Cache: Categories, ended streams, stream lists
- ❌ Don't cache: Live viewer counts, chat messages, user-specific data

**Impact:**
- 70-90% reduction in database queries
- 50-80% faster API responses
- Better user experience
- Lower costs

---

## Further Reading

- [Next.js Data Fetching](https://nextjs.org/docs/app/building-your-application/data-fetching)
- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)
- [Route Segment Config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config)

