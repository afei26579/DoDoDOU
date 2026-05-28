const DEFAULT_AUTH_REDIRECT = '/discovery';

type RedirectLocation = {
  pathname: string;
  search?: string;
  hash?: string;
};

export function resolveAuthRedirect(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return DEFAULT_AUTH_REDIRECT;
  if (value === '/' || value === '/login' || value === '/account') return DEFAULT_AUTH_REDIRECT;
  return value;
}

export function createLoginRedirectPath(location: RedirectLocation) {
  const redirectTo = resolveAuthRedirect(`${location.pathname}${location.search ?? ''}${location.hash ?? ''}`);
  return `/login?redirect=${encodeURIComponent(redirectTo)}`;
}
