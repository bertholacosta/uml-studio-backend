import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectsModule } from '../projects/projects.module';
import { DiagramsModule } from '../diagrams/diagrams.module';
import { ActivityModule } from '../activity/activity.module';
import {
  AI_PROVIDER,
  AI_VISION_PROVIDER,
  AiProvider,
} from './providers/ai-provider';
import { GeminiProvider } from './providers/gemini.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { BedrockProvider } from './providers/bedrock.provider';
import {
  AiConversation,
  AiConversationSchema,
  AiMessage,
  AiMessageSchema,
} from './conversation/ai-conversation.schema';
import { AiConversationService } from './conversation/ai-conversation.service';
import {
  TrazoSettings,
  TrazoSettingsSchema,
} from './settings/trazo-settings.schema';
import { TrazoSettingsService } from './settings/trazo-settings.service';
import { AiAssistantService } from './services/ai-assistant.service';
import { AiAssistantController } from './controllers/ai-assistant.controller';

type ProviderName = 'ollama' | 'gemini' | 'bedrock';

const PROVIDERS: Record<
  ProviderName,
  new (config: ConfigService) => AiProvider
> = {
  ollama: OllamaProvider,
  gemini: GeminiProvider,
  bedrock: BedrockProvider,
};

function providerName(
  value: string | undefined,
  fallback: ProviderName,
): ProviderName {
  const name = (value || fallback).toLowerCase();
  if (name in PROVIDERS) return name as ProviderName;
  new Logger('AiAssistantModule').warn(
    `Proveedor de IA desconocido «${value}»; se usa ${fallback}`,
  );
  return fallback;
}

@Module({
  imports: [
    ProjectsModule,
    DiagramsModule,
    ActivityModule,
    MongooseModule.forFeature([
      { name: AiConversation.name, schema: AiConversationSchema },
      { name: AiMessage.name, schema: AiMessageSchema },
      { name: TrazoSettings.name, schema: TrazoSettingsSchema },
    ]),
  ],
  controllers: [AiAssistantController],
  // Para añadir un proveedor basta con implementar AiProvider y registrarlo en PROVIDERS
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new PROVIDERS[providerName(config.get('AI_PROVIDER'), 'ollama')](
          config,
        ),
    },
    {
      // Las imágenes pueden ir a otro proveedor (p. ej. Gemini) aunque el chat sea local
      provide: AI_VISION_PROVIDER,
      inject: [ConfigService, AI_PROVIDER],
      useFactory: (config: ConfigService, text: AiProvider) => {
        const textName = providerName(config.get('AI_PROVIDER'), 'ollama');
        const visionName = providerName(
          config.get('AI_VISION_PROVIDER'),
          textName,
        );
        return visionName === textName
          ? text
          : new PROVIDERS[visionName](config);
      },
    },
    AiConversationService,
    TrazoSettingsService,
    AiAssistantService,
  ],
})
export class AiAssistantModule {}
