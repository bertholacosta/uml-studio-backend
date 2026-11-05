import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

const MINUTE = 60_000;

/** Límite general por usuario (o IP sin sesión). */
export const DEFAULT_LIMIT = { ttl: MINUTE, limit: 300 };
/** Login y registro: frena los intentos de adivinar contraseñas. */
export const AUTH_LIMIT = { ttl: MINUTE, limit: 10 };
/** Chat del equipo: mensajes entre personas y menciones a Trazo. */
export const CHAT_LIMIT = { ttl: MINUTE, limit: 60 };
/** Imágenes para Trazo: cada una ocupa el servidor de IA. */
export const AI_LIMIT = { ttl: MINUTE, limit: 20 };

/**
 * Limita las peticiones HTTP por usuario autenticado o, si no hay sesión, por IP.
 * Los mensajes de WebSocket no pasan por aquí.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return Promise.resolve(true);
    }
    return super.canActivate(context);
  }

  protected getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(
      req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`,
    );
  }
}
