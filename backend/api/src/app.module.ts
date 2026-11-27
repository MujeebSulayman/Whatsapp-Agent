import { Controller, Get, Module } from '@nestjs/common';
import { createOpenRouterClient, createOpenRouterEmbedder, embeddingModelFromEnv } from '@wa/ai';
import { createPaystackClient } from '@wa/shared';
import { AnalyticsController } from './analytics/analytics.controller.js';
import { AccountsService } from './auth/accounts.service.js';
import { AuthController } from './auth/auth.controller.js';
import { GOOGLE_CLIENT, GoogleClient } from './auth/google.client.js';
import { SocialAuthController } from './auth/social.controller.js';
import { BusinessController } from './businesses/business.controller.js';
import { EmbeddingService } from './common/embedding.js';
import { Messenger } from './common/messenger.js';
import { ConversationsController } from './conversations/conversations.controller.js';
import { CustomersController } from './customers/customers.controller.js';
import { InfraModule } from './infra.module.js';
import { SetupAiController } from './setup-ai/setup-ai.controller.js';
import { LLM_CLIENT, QUERY_EMBEDDER, SetupAiService } from './setup-ai/setup-ai.service.js';
import { OrdersController } from './orders/orders.controller.js';
import { CatalogController } from './products/catalog.controller.js';
import { PlaybooksController } from './playbooks/playbooks.controller.js';
import { PAYSTACK_CLIENT, PaymentsController } from './payments/payments.controller.js';
import { PaystackWebhookController } from './payments/paystack.webhook.js';
import { MediaController } from './media/media.controller.js';
import { MediaService } from './media/media.service.js';
import { WaitlistController } from './products/waitlist.controller.js';
import { WaitlistService } from './products/waitlist.service.js';
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
  controllers: [HealthController, WhatsappController, AuthController, SocialAuthController, SetupAiController, BusinessController, CatalogController, WaitlistController, MediaController, PaymentsController, PaystackWebhookController, PlaybooksController, ConversationsController, OrdersController, CustomersController, AnalyticsController, TeamController],
  providers: [WhatsappService, Messenger, { provide: PAYSTACK_CLIENT, useFactory: () => (process.env.PAYSTACK_SECRET_KEY ? createPaystackClient(process.env.PAYSTACK_SECRET_KEY) : null) }, WaitlistService, MediaService, EmbeddingService, AccountsService, { provide: GOOGLE_CLIENT, useFactory: () => new GoogleClient() },
    SetupAiService,
    { provide: LLM_CLIENT, useFactory: () => createOpenRouterClient({ apiKey: process.env.OPENROUTER_API_KEY ?? '', appTitle: 'Converso' }) },
    {
      provide: QUERY_EMBEDDER,
      useFactory: () => {
        const key = process.env.OPENROUTER_API_KEY;
        if (!key) return undefined;
        const embedder = createOpenRouterEmbedder({ apiKey: key, model: embeddingModelFromEnv() });
        return async (t: string) => (await embedder.embed([t]))[0]!;
      }
    }]
})
export class AppModule {}
