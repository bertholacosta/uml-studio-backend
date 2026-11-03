import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/user.repository';

const SEED_PASSWORD = 'Pass1234!';
// El usuario demo y dos compañeros para probar la pizarra compartida con Trazo
const SEED_USERS = [
  { fullName: 'Usuario Demo', email: 'demo@example.com' },
  { fullName: 'Ana Pérez', email: 'ana@example.com' },
  { fullName: 'Luis Rojas', email: 'luis@example.com' },
];

@Injectable()
export class AuthSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthSeedService.name);

  constructor(private readonly userRepository: UserRepository) {}

  async onApplicationBootstrap() {
    await this.seedDefaultUsers();
  }

  private async seedDefaultUsers() {
    // Los usuarios de prueba tienen credenciales públicas: nunca crearlos en producción
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    try {
      const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
      for (const user of SEED_USERS) {
        if (await this.userRepository.findByEmail(user.email)) continue;
        await this.userRepository.createAndSave({
          ...user,
          passwordHash,
          isActive: true,
        });
        this.logger.log(`👤 Usuario de prueba creado: ${user.email}`);
      }
    } catch (error: any) {
      this.logger.warn(
        `No se pudo inicializar usuario de prueba automático: ${error?.message || error}`,
      );
    }
  }
}
