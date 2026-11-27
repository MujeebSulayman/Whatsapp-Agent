import { Controller, Get, Module } from '@nestjs/common';
import { InfraModule } from './infra.module.js';
import { WhatsappController } from './webhooks/whatsapp.controller.js';
import { WhatsappService } from './webhooks/whatsapp.service.js';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [InfraModule],
  controllers: [HealthController, WhatsappController],
  providers: [WhatsappService]
})
export class AppModule {}
