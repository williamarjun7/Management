import { createClient } from "@insforge/sdk";

const baseUrl = import.meta.env.VITE_INSFORGE_URL;
const anonKey = import.meta.env.VITE_INSFORGE_ANON_KEY;

if (!baseUrl || !anonKey) {
  throw new Error('VITE_INSFORGE_URL and VITE_INSFORGE_ANON_KEY must be set in .env');
}

export const insforge = createClient({
  baseUrl,
  anonKey,
});
