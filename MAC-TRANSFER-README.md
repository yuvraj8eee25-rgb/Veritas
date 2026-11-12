# Veritas Mac transfer

This archive contains the Veritas source projects in `app/` (the original Vite app) and `veritas-react/` (the Next.js/React app). Their sibling layout is intentional: the React project references shared source from `../app/`.

## Requirements
- Node.js 22 (the original Vite app supports Node 20.19+ or 22.12+; use Node 22 for both projects).
- Access to the Supabase project for live backend features.

## Original Vite app
1. In Terminal, `cd goat/app`
2. Copy `.env.example` to `.env.local` and set the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values.
3. Run `npm ci`, then `npm run dev`.

## Next.js/React app
1. In Terminal, `cd goat/veritas-react`
2. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Run `npm ci`, then `npm run dev`; open `http://localhost:3000`.

Local `.env.local` files and installed/generated files were omitted. Configure only public anon/publishable keys in browser-exposed variables; keep service-role and provider secrets in server-side Supabase configuration. No Git history is included.
