/**
 * Configuración centralizada de CORS para API REST y WebSockets
 */

const DEV_ORIGINS = ['http://localhost:4200', 'http://127.0.0.1:4200'];

let cachedOrigins: string[] | null = null;

export function getAllowedCorsOrigins(): string[] {
  if (cachedOrigins) return cachedOrigins;

  const envOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  // El servidor de desarrollo de Angular solo se admite fuera de producción
  const defaults = process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS;
  cachedOrigins = Array.from(new Set([...envOrigins, ...defaults]));
  return cachedOrigins;
}

export function isOriginAllowed(origin?: string): boolean {
  if (!origin) return true;
  const allowed = getAllowedCorsOrigins();
  return allowed.includes('*') || allowed.includes(origin);
}
