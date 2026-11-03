import { Injectable } from '@nestjs/common';
import {
  ProjectContext,
  toSnakeCase,
  withInherited,
} from '../templates/spring_boot/template-models';
import { getPluralName } from '../templates/flutter/flutter-models';
import {
  renderApiConstants,
  renderExceptions,
  renderFailures,
  renderApiClient,
  renderAppTheme,
} from '../templates/flutter/flutter-core.templates';
import { renderFlutterEntity } from '../templates/flutter/flutter-entity.template';
import {
  renderFlutterModel,
  renderFlutterRequestModel,
} from '../templates/flutter/flutter-model.template';
import { renderFlutterRemoteDataSource } from '../templates/flutter/flutter-datasource.template';
import {
  renderFlutterDomainRepository,
  renderFlutterDataRepository,
} from '../templates/flutter/flutter-repository.template';
import {
  renderFlutterGetAllUseCase,
  renderFlutterGetByIdUseCase,
  renderFlutterCreateUseCase,
  renderFlutterUpdateUseCase,
  renderFlutterDeleteUseCase,
} from '../templates/flutter/flutter-usecases.template';
import {
  renderFlutterBloc,
  renderFlutterBlocEvents,
  renderFlutterBlocStates,
} from '../templates/flutter/flutter-bloc.template';
import {
  renderFlutterCardWidget,
  renderFlutterListPage,
  renderFlutterFormPage,
} from '../templates/flutter/flutter-ui.template';
import {
  renderFlutterInjectionContainer,
  renderFlutterHomePage,
  renderFlutterMain,
} from '../templates/flutter/flutter-main.template';
import { renderFlutterPubspec } from '../templates/flutter/flutter-pubspec.template';
import {
  renderFlutterTokenStorageService,
  renderFlutterAuthModels,
  renderFlutterAuthRemoteDataSource,
  renderFlutterAuthDomainRepository,
  renderFlutterAuthDataRepository,
  renderFlutterAuthUseCases,
  renderFlutterAuthBloc,
  renderFlutterLoginPage,
  renderFlutterRegisterPage,
  renderFlutterProfilePage,
} from '../templates/flutter/flutter-auth.template';
import { renderFlutterReadme } from '../templates/flutter/flutter-readme.template';
import {
  renderFlutterAndroidBuildGradle,
  renderFlutterAndroidSettingsGradle,
  renderFlutterAndroidAppBuildGradle,
  renderFlutterAndroidManifest,
  renderFlutterMainActivity,
  renderFlutterLocalProperties,
  renderFlutterGradleProperties,
  renderFlutterGradleWrapperProperties,
  renderFlutterMetadata,
  renderFlutterStylesXml,
} from '../templates/flutter/flutter-android.template';
import {
  renderFlutterLinuxRootCMake,
  renderFlutterLinuxFlutterCMake,
  renderFlutterLinuxRunnerCMake,
  renderFlutterLinuxMainCc,
  renderFlutterLinuxMyApplicationH,
  renderFlutterLinuxMyApplicationCc,
} from '../templates/flutter/flutter-linux.template';
import {
  renderFlutterAiMessageModel,
  renderFlutterModelDownloaderService,
  renderFlutterLocalLlmService,
  renderFlutterAiService,
  renderFlutterAiBloc,
  renderFlutterAiPage,
} from '../templates/flutter/flutter-ai.template';
import { GeneratedFileDto } from '../dtos/code-generation-preview-response.dto';

@Injectable()
export class FlutterTemplateEngineService {
  /**
   * Genera la estructura completa de archivos de la aplicación Flutter (Clean Architecture + BLoC + Android Config).
   */
  generateFlutterProjectFiles(
    context: ProjectContext,
    basePath = '',
  ): GeneratedFileDto[] {
    const files: GeneratedFileDto[] = [];
    const prefix = basePath ? `${basePath}/` : '';
    const appId = `com.example.${context.artifactId.replace(/[^a-z0-9_]/g, '_').toLowerCase()}`;
    const packageSubpath = appId.replace(/\./g, '/');

    // 1. Core
    files.push({
      path: `${prefix}lib/core/constants/api_constants.dart`,
      filename: 'api_constants.dart',
      language: 'dart',
      layer: 'config',
      content: renderApiConstants(context),
    });

    files.push({
      path: `${prefix}lib/core/errors/exceptions.dart`,
      filename: 'exceptions.dart',
      language: 'dart',
      layer: 'config',
      content: renderExceptions(),
    });

    files.push({
      path: `${prefix}lib/core/errors/failures.dart`,
      filename: 'failures.dart',
      language: 'dart',
      layer: 'config',
      content: renderFailures(),
    });

    files.push({
      path: `${prefix}lib/core/network/api_client.dart`,
      filename: 'api_client.dart',
      language: 'dart',
      layer: 'config',
      content: renderApiClient(),
    });

    files.push({
      path: `${prefix}lib/core/theme/app_theme.dart`,
      filename: 'app_theme.dart',
      language: 'dart',
      layer: 'config',
      content: renderAppTheme(),
    });

    files.push({
      path: `${prefix}lib/core/services/token_storage_service.dart`,
      filename: 'token_storage_service.dart',
      language: 'dart',
      layer: 'config',
      content: renderFlutterTokenStorageService(),
    });

    // 2. Auth Feature (si existe clase de usuario)
    if (context.hasAuth && context.userClass) {
      const userMeta = context.userClass;

      files.push({
        path: `${prefix}lib/features/auth/data/models/auth_models.dart`,
        filename: 'auth_models.dart',
        language: 'dart',
        layer: 'dto',
        content: renderFlutterAuthModels(userMeta),
      });

      files.push({
        path: `${prefix}lib/features/auth/data/datasources/auth_remote_datasource.dart`,
        filename: 'auth_remote_datasource.dart',
        language: 'dart',
        layer: 'repository',
        content: renderFlutterAuthRemoteDataSource(),
      });

      files.push({
        path: `${prefix}lib/features/auth/data/repositories/auth_repository_impl.dart`,
        filename: 'auth_repository_impl.dart',
        language: 'dart',
        layer: 'repository',
        content: renderFlutterAuthDataRepository(userMeta),
      });

      files.push({
        path: `${prefix}lib/features/auth/domain/repositories/auth_repository.dart`,
        filename: 'auth_repository.dart',
        language: 'dart',
        layer: 'repository',
        content: renderFlutterAuthDomainRepository(userMeta),
      });

      files.push({
        path: `${prefix}lib/features/auth/domain/usecases/auth_usecases.dart`,
        filename: 'auth_usecases.dart',
        language: 'dart',
        layer: 'service',
        content: renderFlutterAuthUseCases(userMeta),
      });

      files.push({
        path: `${prefix}lib/features/auth/presentation/bloc/auth_bloc.dart`,
        filename: 'auth_bloc.dart',
        language: 'dart',
        layer: 'controller',
        content: renderFlutterAuthBloc(userMeta),
      });

      files.push({
        path: `${prefix}lib/features/auth/presentation/pages/login_page.dart`,
        filename: 'login_page.dart',
        language: 'dart',
        layer: 'controller',
        content: renderFlutterLoginPage(context),
      });

      files.push({
        path: `${prefix}lib/features/auth/presentation/pages/register_page.dart`,
        filename: 'register_page.dart',
        layer: 'controller',
        language: 'dart',
        content: renderFlutterRegisterPage(context, userMeta),
      });

      files.push({
        path: `${prefix}lib/features/auth/presentation/pages/profile_page.dart`,
        filename: 'profile_page.dart',
        language: 'dart',
        layer: 'controller',
        content: renderFlutterProfilePage(context, userMeta),
      });
    }

    // 3. Features (Un módulo por cada entidad)
    // Una subclase expone también el id y los campos heredados, igual que su API REST
    for (const meta of context.classes.map(withInherited)) {
      const snake = toSnakeCase(meta.className);
      const snakePlural = getPluralName(snake);

      // Data Layer
      files.push({
        path: `${prefix}lib/features/${snake}/data/datasources/${snake}_remote_datasource.dart`,
        filename: `${snake}_remote_datasource.dart`,
        language: 'dart',
        layer: 'repository',
        content: renderFlutterRemoteDataSource(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/data/models/${snake}_model.dart`,
        filename: `${snake}_model.dart`,
        language: 'dart',
        layer: 'dto',
        content: renderFlutterModel(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/data/models/${snake}_request_model.dart`,
        filename: `${snake}_request_model.dart`,
        language: 'dart',
        layer: 'dto',
        content: renderFlutterRequestModel(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/data/repositories/${snake}_repository_impl.dart`,
        filename: `${snake}_repository_impl.dart`,
        language: 'dart',
        layer: 'repository',
        content: renderFlutterDataRepository(meta),
      });

      // Domain Layer
      files.push({
        path: `${prefix}lib/features/${snake}/domain/entities/${snake}_entity.dart`,
        filename: `${snake}_entity.dart`,
        language: 'dart',
        layer: 'entity',
        content: renderFlutterEntity(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/domain/repositories/${snake}_repository.dart`,
        filename: `${snake}_repository.dart`,
        language: 'dart',
        layer: 'repository',
        content: renderFlutterDomainRepository(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/domain/usecases/get_${snakePlural}_usecase.dart`,
        filename: `get_${snakePlural}_usecase.dart`,
        language: 'dart',
        layer: 'service',
        content: renderFlutterGetAllUseCase(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/domain/usecases/get_${snake}_by_id_usecase.dart`,
        filename: `get_${snake}_by_id_usecase.dart`,
        language: 'dart',
        layer: 'service',
        content: renderFlutterGetByIdUseCase(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/domain/usecases/create_${snake}_usecase.dart`,
        filename: `create_${snake}_usecase.dart`,
        language: 'dart',
        layer: 'service',
        content: renderFlutterCreateUseCase(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/domain/usecases/update_${snake}_usecase.dart`,
        filename: `update_${snake}_usecase.dart`,
        language: 'dart',
        layer: 'service',
        content: renderFlutterUpdateUseCase(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/domain/usecases/delete_${snake}_usecase.dart`,
        filename: `delete_${snake}_usecase.dart`,
        language: 'dart',
        layer: 'service',
        content: renderFlutterDeleteUseCase(meta),
      });

      // Presentation Layer (BLoC)
      files.push({
        path: `${prefix}lib/features/${snake}/presentation/bloc/${snake}_event.dart`,
        filename: `${snake}_event.dart`,
        language: 'dart',
        layer: 'controller',
        content: renderFlutterBlocEvents(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/presentation/bloc/${snake}_state.dart`,
        filename: `${snake}_state.dart`,
        language: 'dart',
        layer: 'controller',
        content: renderFlutterBlocStates(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/presentation/bloc/${snake}_bloc.dart`,
        filename: `${snake}_bloc.dart`,
        language: 'dart',
        layer: 'controller',
        content: renderFlutterBloc(meta),
      });

      // Presentation Layer (Widgets & Pages)
      files.push({
        path: `${prefix}lib/features/${snake}/presentation/widgets/${snake}_card_widget.dart`,
        filename: `${snake}_card_widget.dart`,
        language: 'dart',
        layer: 'controller',
        content: renderFlutterCardWidget(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/presentation/pages/${snake}_list_page.dart`,
        filename: `${snake}_list_page.dart`,
        language: 'dart',
        layer: 'controller',
        content: renderFlutterListPage(meta),
      });

      files.push({
        path: `${prefix}lib/features/${snake}/presentation/pages/${snake}_form_page.dart`,
        filename: `${snake}_form_page.dart`,
        language: 'dart',
        layer: 'controller',
        content: renderFlutterFormPage(meta),
      });
    }

    // Feature: Asistente IA Local (Qwen2.5 On-Device via lib_llama_cpp)
    files.push({
      path: `${prefix}lib/features/ai_assistant/data/models/chat_message.dart`,
      filename: 'chat_message.dart',
      language: 'dart',
      layer: 'dto',
      content: renderFlutterAiMessageModel(),
    });

    files.push({
      path: `${prefix}lib/features/ai_assistant/data/services/model_downloader_service.dart`,
      filename: 'model_downloader_service.dart',
      language: 'dart',
      layer: 'service',
      content: renderFlutterModelDownloaderService(),
    });

    files.push({
      path: `${prefix}lib/features/ai_assistant/data/services/local_llm_service.dart`,
      filename: 'local_llm_service.dart',
      language: 'dart',
      layer: 'service',
      content: renderFlutterLocalLlmService(),
    });

    files.push({
      path: `${prefix}lib/features/ai_assistant/data/services/ai_assistant_service.dart`,
      filename: 'ai_assistant_service.dart',
      language: 'dart',
      layer: 'service',
      content: renderFlutterAiService(context),
    });

    files.push({
      path: `${prefix}lib/features/ai_assistant/presentation/bloc/ai_assistant_bloc.dart`,
      filename: 'ai_assistant_bloc.dart',
      language: 'dart',
      layer: 'controller',
      content: renderFlutterAiBloc(),
    });

    files.push({
      path: `${prefix}lib/features/ai_assistant/presentation/pages/ai_assistant_page.dart`,
      filename: 'ai_assistant_page.dart',
      language: 'dart',
      layer: 'controller',
      content: renderFlutterAiPage(context),
    });

    // 3. Home Dashboard & Inyección GetIt & Main
    files.push({
      path: `${prefix}lib/features/home/presentation/pages/home_page.dart`,
      filename: 'home_page.dart',
      language: 'dart',
      layer: 'controller',
      content: renderFlutterHomePage(context),
    });

    files.push({
      path: `${prefix}lib/injection_container.dart`,
      filename: 'injection_container.dart',
      language: 'dart',
      layer: 'config',
      content: renderFlutterInjectionContainer(context),
    });

    files.push({
      path: `${prefix}lib/main.dart`,
      filename: 'main.dart',
      language: 'dart',
      layer: 'config',
      content: renderFlutterMain(context),
    });

    // 4. Configuración del Proyecto Dart
    files.push({
      path: `${prefix}pubspec.yaml`,
      filename: 'pubspec.yaml',
      language: 'yaml',
      layer: 'config',
      content: renderFlutterPubspec(context),
    });

    files.push({
      path: `${prefix}analysis_options.yaml`,
      filename: 'analysis_options.yaml',
      language: 'yaml',
      layer: 'config',
      content: `include: package:flutter_lints/flutter.yaml

linter:
  rules:
    prefer_const_constructors: true
    prefer_const_literals_to_create_immutables: true
`,
    });

    files.push({
      path: `${prefix}.metadata`,
      filename: '.metadata',
      language: 'yaml',
      layer: 'config',
      content: renderFlutterMetadata(),
    });

    // 5. Configuración Nativa Android (Gradle, Manifest, Activity, Local & Wrapper Properties)
    files.push({
      path: `${prefix}android/build.gradle.kts`,
      filename: 'build.gradle.kts',
      language: 'kotlin',
      layer: 'config',
      content: renderFlutterAndroidBuildGradle(),
    });

    files.push({
      path: `${prefix}android/settings.gradle.kts`,
      filename: 'settings.gradle.kts',
      language: 'kotlin',
      layer: 'config',
      content: renderFlutterAndroidSettingsGradle(),
    });

    files.push({
      path: `${prefix}android/app/build.gradle.kts`,
      filename: 'build.gradle.kts',
      language: 'kotlin',
      layer: 'config',
      content: renderFlutterAndroidAppBuildGradle(context),
    });

    files.push({
      path: `${prefix}android/app/src/main/AndroidManifest.xml`,
      filename: 'AndroidManifest.xml',
      language: 'xml',
      layer: 'config',
      content: renderFlutterAndroidManifest(context),
    });

    files.push({
      path: `${prefix}android/app/src/main/kotlin/${packageSubpath}/MainActivity.kt`,
      filename: 'MainActivity.kt',
      language: 'kotlin',
      layer: 'config',
      content: renderFlutterMainActivity(context),
    });

    files.push({
      path: `${prefix}android/app/src/main/res/values/styles.xml`,
      filename: 'styles.xml',
      language: 'xml',
      layer: 'config',
      content: renderFlutterStylesXml(),
    });

    files.push({
      path: `${prefix}android/local.properties`,
      filename: 'local.properties',
      language: 'properties',
      layer: 'config',
      content: renderFlutterLocalProperties(),
    });

    files.push({
      path: `${prefix}android/gradle.properties`,
      filename: 'gradle.properties',
      language: 'properties',
      layer: 'config',
      content: renderFlutterGradleProperties(),
    });

    files.push({
      path: `${prefix}android/gradle/wrapper/gradle-wrapper.properties`,
      filename: 'gradle-wrapper.properties',
      language: 'properties',
      layer: 'config',
      content: renderFlutterGradleWrapperProperties(),
    });

    // 6. Soporte Nativo Linux Desktop (CMake & GTK Runner)
    files.push({
      path: `${prefix}linux/CMakeLists.txt`,
      filename: 'CMakeLists.txt',
      language: 'cmake',
      layer: 'config',
      content: renderFlutterLinuxRootCMake(context),
    });

    files.push({
      path: `${prefix}linux/flutter/CMakeLists.txt`,
      filename: 'CMakeLists.txt',
      language: 'cmake',
      layer: 'config',
      content: renderFlutterLinuxFlutterCMake(),
    });

    files.push({
      path: `${prefix}linux/runner/CMakeLists.txt`,
      filename: 'CMakeLists.txt',
      language: 'cmake',
      layer: 'config',
      content: renderFlutterLinuxRunnerCMake(context),
    });

    files.push({
      path: `${prefix}linux/runner/main.cc`,
      filename: 'main.cc',
      language: 'cpp',
      layer: 'config',
      content: renderFlutterLinuxMainCc(),
    });

    files.push({
      path: `${prefix}linux/runner/my_application.h`,
      filename: 'my_application.h',
      language: 'cpp',
      layer: 'config',
      content: renderFlutterLinuxMyApplicationH(),
    });

    files.push({
      path: `${prefix}linux/runner/my_application.cc`,
      filename: 'my_application.cc',
      language: 'cpp',
      layer: 'config',
      content: renderFlutterLinuxMyApplicationCc(context),
    });

    // 7. Documentación README.md
    files.push({
      path: `${prefix}README.md`,
      filename: 'README.md',
      language: 'markdown',
      layer: 'docs',
      content: renderFlutterReadme(context),
    });

    return files;
  }
}
