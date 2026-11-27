import { Controller, Get, Module } from '@nestjs/common';
import { AnalyticsController } from './analytics/analytics.controller.js';
import { AuthController } from './auth/auth.controller.js';
import { BusinessController } from './businesses/business.controller.js';
import { EmbeddingService } from './common/embedding.js';
import { Messenger } from './common/messenger.js';
import { ConversationsController } from './conversations/conversations.controller.js';
import { CustomersController } from './customers/customers.controller.js';
import { InfraModule } from './infra.module.js';
import { OrdersController } from './orders/orders.controller.js';
import { CatalogController } from './products/catalog.controller.js';
import { TeamController } from './team/team.controller.js';
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
  controllers: [HealthController, WhatsappController, AuthController, BusinessController, CatalogController, ConversationsController, OrdersController, CustomersController, AnalyticsController, TeamController],
  providers: [WhatsappService, Messenger, EmbeddingService]
})
export class AppModule {}
