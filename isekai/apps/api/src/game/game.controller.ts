import { Controller, Get } from '@nestjs/common'

@Controller('game')
export class GameController {
  @Get('health')
  health() {
    return { status: 'ok' }
  }
}
