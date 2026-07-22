import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaLibSql({
        url: process.env.DATABASE_URL ?? 'file:./data/gray-hill.db',
      }),
    })
  }

  async onModuleInit() {
    await this.$connect()
    console.log('[Prisma] Connected to SQLite')
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
