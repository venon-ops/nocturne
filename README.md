# Nocturne Tickets

Billetterie sociale pour soirées et projets musicaux. Le projet est un monorepo pnpm : une app web Next.js, une app Expo et un backend Supabase.

## Démarrer le rendu web

1. Installez Node.js 20+ et `corepack enable`.
2. À la racine : `pnpm install` puis `pnpm dev --filter=@nocturne/web`.
3. Ouvrez `http://localhost:3000`.

Le rendu emploie des données de démonstration si Supabase n'est pas configuré. Copiez `.env.example` vers `.env.local`, renseignez les clés Supabase et lancez `supabase db reset` pour le backend local.

## Paiements et sécurité

Configurez Stripe Connect Express et les variables secrètes uniquement dans Supabase : `supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... APP_URL=...`. Déployez les fonctions avec `supabase functions deploy <nom>`. Configurez le webhook Stripe vers `stripe-webhook`.

Les migrations activent RLS. Une vente et une validation de QR passent obligatoirement par une Edge Function ; le client ne peut ni créer ni modifier un billet.

## Déploiement

- Web : Vercel avec les variables `NEXT_PUBLIC_SUPABASE_*`.
- Mobile : `pnpm --filter @nocturne/mobile start`, puis EAS Build.
- Backend : Supabase CLI (`supabase link`, `supabase db push`, `supabase functions deploy`).
