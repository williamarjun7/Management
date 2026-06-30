import { createClient } from "@insforge/sdk";

function getEnv(name: string): string {
  const val = import.meta.env[name] as string | undefined;
  if (!val) {
    console.error(`[insforge] Missing required env var: ${name}. App will not function correctly.`);
    return '';
  }
  return val;
}

const baseUrl = getEnv('VITE_INSFORGE_URL');
const anonKey = getEnv('VITE_INSFORGE_ANON_KEY');

function makeStub(): ReturnType<typeof createClient> {
  return new Proxy({} as ReturnType<typeof createClient>, {
    get(_target, prop) {
      return new Proxy(
        {},
        {
          get(_target2, method) {
            return (..._args: unknown[]) =>
              Promise.reject(new Error(`[insforge] Cannot call "${String(prop)}.${String(method)}": missing env vars`));
          },
        },
      );
    },
  });
}

function buildClient() {
  if (!baseUrl || !anonKey) return makeStub();
  try {
    return createClient({ baseUrl, anonKey });
  } catch (err) {
    console.error('[insforge] Failed to create client:', err);
    return makeStub();
  }
}

export const insforge = buildClient();
