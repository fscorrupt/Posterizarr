/**
 * Enhanced fetch wrapper that automatically includes Basic Auth credentials
 * if they are stored in sessionStorage.
 *
 * Usage:
 *   import { authFetch } from './utils/authFetch';
 *   const response = await authFetch('/api/status');
 */

export async function authFetch(url, options = {}) {
  const credentials = sessionStorage.getItem("auth_credentials");

  const headers = {
    ...options.headers,
  };

  // Add Basic Auth header if credentials are available
  if (credentials) {
    headers["Authorization"] = `Basic ${credentials}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

export default authFetch;
