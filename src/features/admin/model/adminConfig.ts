const DEFAULT_ADMIN_ENTRY_PATH = '/ops-dodoudou-9c41f7';
const DEFAULT_ADMIN_API_PREFIX = '/api/_ops_dodoudou_9c41f7';

function normalizeAbsolutePath(value: string | undefined, fallback: string) {
  const input = value?.trim();
  if (!input) return fallback;
  const path = input.startsWith('/') ? input : `/${input}`;
  const normalized = path.replace(/\/+$/, '') || fallback;
  return /^\/[A-Za-z0-9/_-]+$/.test(normalized) ? normalized : fallback;
}

export const ADMIN_ENTRY_PATH = normalizeAbsolutePath(
  import.meta.env.VITE_ADMIN_ENTRY_PATH,
  DEFAULT_ADMIN_ENTRY_PATH,
);

export const ADMIN_API_PREFIX = normalizeAbsolutePath(
  import.meta.env.VITE_ADMIN_API_PREFIX,
  DEFAULT_ADMIN_API_PREFIX,
);
