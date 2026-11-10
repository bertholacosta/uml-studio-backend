import { Injectable } from '@nestjs/common';
import { ProjectContext } from '../templates/spring_boot/template-models';
import {
  renderFlutterApi,
  renderFlutterAssistant,
  renderFlutterAssistantScreen,
  renderFlutterConfig,
  renderFlutterHomeScreen,
  renderFlutterInterpreter,
  renderFlutterLocalModel,
  renderFlutterLoginScreen,
  renderFlutterMain,
  renderFlutterRecordForm,
  renderFlutterRecordsScreen,
  renderFlutterSchema,
} from '../templates/flutter/flutter-app.template';
import { renderFlutterPubspec } from '../templates/flutter/flutter-pubspec.template';
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
import { GeneratedFileDto } from '../dtos/code-generation-preview-response.dto';

@Injectable()
export class FlutterTemplateEngineService {
  /**
   * Genera la app Flutter: una app genérica, con los mismos archivos para
   * cualquier diagrama. Lo único que cambia es `lib/schema.dart`, que describe
   * las clases del UML; las pantallas y el asistente de IA local leen de ahí.
   */
  generateFlutterProjectFiles(
    context: ProjectContext,
    basePath = '',
  ): GeneratedFileDto[] {
    const files: GeneratedFileDto[] = [];
    const prefix = basePath ? `${basePath}/` : '';
    const appId = `com.example.${context.artifactId.replace(/[^a-z0-9_]/g, '_').toLowerCase()}`;
    const packageSubpath = appId.replace(/\./g, '/');

    const dart = (
      file: string,
      layer: GeneratedFileDto['layer'],
      content: string,
    ) =>
      files.push({
        path: `${prefix}lib/${file}`,
        filename: file.split('/').pop()!,
        language: 'dart',
        layer,
        content,
      });

    // 1. El diagrama como datos, y lo que la app necesita para hablar con el backend
    dart('schema.dart', 'entity', renderFlutterSchema(context));
    dart('config.dart', 'config', renderFlutterConfig(context));
    dart('api.dart', 'repository', renderFlutterApi(context));
    dart('main.dart', 'config', renderFlutterMain(context));

    // 2. Pantallas: sirven para cualquier entidad
    dart(
      'screens/home_screen.dart',
      'controller',
      renderFlutterHomeScreen(context),
    );
    dart(
      'screens/records_screen.dart',
      'controller',
      renderFlutterRecordsScreen(),
    );
    dart('screens/record_form.dart', 'controller', renderFlutterRecordForm());
    if (context.hasAuth && context.userClass) {
      dart(
        'screens/login_screen.dart',
        'controller',
        renderFlutterLoginScreen(context),
      );
    }

    // 3. Asistente de IA local (Qwen2.5 en el dispositivo con lib_llama_cpp)
    dart('assistant/local_model.dart', 'service', renderFlutterLocalModel());
    dart('assistant/interpreter.dart', 'service', renderFlutterInterpreter());
    dart('assistant/assistant.dart', 'service', renderFlutterAssistant());
    dart(
      'assistant/assistant_screen.dart',
      'controller',
      renderFlutterAssistantScreen(),
    );

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
