import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` turns schema changes into SQL migrations; Wrangler applies them.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/api/db/schema.ts',
  out: './migrations',
});
