import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async findByEmail(
    email: string,
    includePassword = false,
  ): Promise<User | null> {
    const qb = this.repo
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email });
    if (includePassword) {
      qb.addSelect('user.passwordHash');
    }
    return qb.getOne();
  }

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('user')
      .where('LOWER(user.email) = LOWER(:email)', { email })
      .getCount();
    return count > 0;
  }

  async createAndSave(userData: Partial<User>): Promise<User> {
    const entity = this.repo.create(userData);
    return this.repo.save(entity);
  }

  async update(id: string, partial: Partial<User>): Promise<void> {
    await this.repo.update(id, partial);
  }
}
