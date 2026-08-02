import "server-only";

/**
 * Reads an environment variable at runtime.
 *
 * Deliberately uses dynamic bracket access. Next.js statically inlines
 * `process.env.FOO` at build time in some bundling layers, which silently
 * produced a build-time value in one layer and a runtime value in another.
 * That mismatch broke JWT verification between the auth route and server
 * actions. Keep this indirection.
 */
export function env(name: string): string | undefined {
  const key = String(name);
  return process.env[key];
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}
