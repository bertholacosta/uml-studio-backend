import { registerAs } from '@nestjs/config';

const DEV_FALLBACK_SECRET = 'dev_only_jwt_secret_do_not_use_in_production';

export default registerAs('jwt', () => {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET es obligatorio en producción');
  }

  return {
    secret: secret || DEV_FALLBACK_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  };
});
