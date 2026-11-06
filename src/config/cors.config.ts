/**
 * Configuración centralizada de CORS para API REST y WebSockets
 */

// Servidores de desarrollo: Angular (4200) y la app móvil ejecutada como web (5050)
const DEV_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:5050',
];

let cachedOrigins: string[] | null = null;

export function getAllowedCorsOrigins(): string[] {
  if (cachedOrigins) return cachedOrigins;

  const envOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  // Los servidores de desarrollo solo se admiten fuera de producción
  const defaults = process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS;
  cachedOrigins = Array.from(new Set([...envOrigins, ...defaults]));
  return cachedOrigins;
}

export function isOriginAllowed(origin?: string): boolean {
  if (!origin) return true;
  const allowed = getAllowedCorsOrigins();
  return allowed.includes('*') || allowed.includes(origin);
}
