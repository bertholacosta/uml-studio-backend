import { Test, TestingModule } from '@nestjs/testing';
import { FlutterTemplateEngineService } from './flutter-template-engine.service';
import { SpringTemplateEngineService } from './spring-template-engine.service';
import { GenerateCodeRequestDto } from '../dtos/generate-code-request.dto';

describe('FlutterTemplateEngineService', () => {
  let flutterEngine: FlutterTemplateEngineService;
  let springEngine: SpringTemplateEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FlutterTemplateEngineService, SpringTemplateEngineService],
    }).compile();

    flutterEngine = module.get<FlutterTemplateEngineService>(
      FlutterTemplateEngineService,
    );
    springEngine = module.get<SpringTemplateEngineService>(
      SpringTemplateEngineService,
    );
  });

  const generate = (dto: GenerateCodeRequestDto, nodes: any[]) => {
    const { context } = springEngine.generateProjectFiles(dto, nodes, []);
    const files = flutterEngine.generateFlutterProjectFiles(
      context,
      'mobile_flutter',
    );
    const dartFiles = files
      .filter((f) => f.language === 'dart')
      .map((f) => f.path.replace('mobile_flutter/lib/', ''));
    const content = (suffix: string) =>
      files.find((f) => f.path.endsWith(suffix))?.content ?? '';
    return { context, files, dartFiles, content };
  };

  const tienda = {
    dto: {
      packageName: 'com.uagrm.tienda',
      artifactId: 'tienda-app',
      projectName: 'Tienda Ferreteria',
      serverPort: 8080,
    } as GenerateCodeRequestDto,
    nodes: [
      {
        id: 'node-1',
        name: 'Cliente',
        attributes: [
          { name: 'id', type: 'UUID', isNullable: false },
          { name: 'nombre', type: 'String', isNullable: false },
          { name: 'telefono', type: 'String', isNullable: true },
          { name: 'saldo', type: 'Double', isNullable: true },
        ],
        methods: [],
      },
      {
        id: 'node-2',
        name: 'Pedido',
        attributes: [
          { name: 'id', type: 'UUID', isNullable: false },
          { name: 'fecha', type: 'LocalDate', isNullable: false },
          { name: 'total', type: 'Double', isNullable: false },
        ],
        methods: [],
      },
    ],
  };

  it('debe estar definido', () => {
    expect(flutterEngine).toBeDefined();
  });

  it('genera una app genérica: los mismos archivos Dart sin importar las clases', () => {
    const { dartFiles } = generate(tienda.dto, tienda.nodes);

    expect(dartFiles.sort()).toEqual([
      'api.dart',
      'assistant/assistant.dart',
      'assistant/assistant_screen.dart',
      'assistant/interpreter.dart',
      'assistant/local_model.dart',
      'config.dart',
      'main.dart',
      'schema.dart',
      'screens/home_screen.dart',
      'screens/record_form.dart',
      'screens/records_screen.dart',
    ]);
  });

  it('describe las clases del diagrama en schema.dart', () => {
    const { content } = generate(tienda.dto, tienda.nodes);
    const schema = content('lib/schema.dart');

    expect(schema).toContain("name: 'Cliente'");
    expect(schema).toContain("plural: 'clientes'");
    expect(schema).toContain("endpoint: '/cliente'");
    expect(schema).toContain("title: 'nombre'");
    expect(schema).toContain("Field('id', 'text', isId: true),");
    expect(schema).toContain("Field('nombre', 'text', required: true),");
    expect(schema).toContain("Field('telefono', 'text'),");
    expect(schema).toContain("Field('saldo', 'double'),");
    expect(schema).toContain("Field('fecha', 'date', required: true),");
    // Sin un texto que lo nombre, el registro se identifica por su id
    expect(schema).toMatch(/name: 'Pedido',[\s\S]*?title: 'id'/);
  });

  it('apunta a la API del backend generado y deja cambiarla al compilar', () => {
    const { content } = generate(tienda.dto, tienda.nodes);
    const config = content('lib/config.dart');

    expect(config).toContain("const String appName = 'Tienda Ferreteria';");
    expect(config).toContain("'http://localhost:8080/api/v1'");
    expect(config).toContain("String.fromEnvironment(\n  'API_URL'");
  });

  it('solo depende de lo imprescindible', () => {
    const { content } = generate(tienda.dto, tienda.nodes);
    const pubspec = content('pubspec.yaml');

    expect(pubspec).toContain('dio:');
    expect(pubspec).toContain('lib_llama_cpp:');
    expect(pubspec).toContain('speech_to_text:');
    for (const removed of [
      'flutter_bloc',
      'get_it',
      'dartz',
      'equatable',
      'google_fonts',
      'flutter_markdown',
      // Sin login no hay sesión que guardar
      'shared_preferences',
    ]) {
      expect(pubspec).not.toContain(removed);
    }
  });

  it('el asistente usa el modelo local con una instrucción corta y una sola llamada', () => {
    const { content } = generate(tienda.dto, tienda.nodes);
    const model = content('assistant/local_model.dart');
    const assistant = content('assistant/assistant.dart');

    expect(model).toContain('qwen2.5-0.5b-instruct-q4_k_m.gguf');
    expect(model).toContain('static const contextSize = 1024;');
    expect(model).toContain('threadCount: threads');
    expect(model).toContain('temperature: 0,');
    // El modelo se carga antes del primer mensaje
    expect(model).toContain("user: 'Hola', maxTokens: 1");

    // Una llamada al modelo por mensaje, y solo con las entidades nombradas
    expect(assistant.match(/model\.generate\(/g)).toHaveLength(1);
    expect(assistant).toContain('entitiesMentioned(text)');
    expect(assistant).toContain('complete(command, rules)');
  });

  it('las plantillas Dart no dejan etiquetas de Mustache sin resolver', () => {
    const { files } = generate(tienda.dto, tienda.nodes);
    for (const file of files.filter((f) => f.language === 'dart')) {
      expect(file.content).not.toContain('{{');
    }
  });

  it('con una clase Usuario con contraseña añade el inicio de sesión', () => {
    const { context, dartFiles, content } = generate(
      {
        packageName: 'com.uagrm.authapp',
        artifactId: 'auth-mobile',
        projectName: 'App Móvil con Auth',
        serverPort: 8080,
      },
      [
        {
          id: 'node-usr',
          name: 'Usuario',
          attributes: [
            { name: 'id', type: 'UUID', isNullable: false },
            { name: 'email', type: 'String', isNullable: false },
            { name: 'password', type: 'String', isNullable: false },
          ],
          methods: [],
        },
      ],
    );

    expect(context.hasAuth).toBe(true);
    expect(dartFiles).toContain('screens/login_screen.dart');

    const api = content('lib/api.dart');
    expect(api).toContain("_startSession('/auth/login'");
    expect(api).toContain("_startSession('/auth/register'");
    expect(api).toContain("headers['Authorization'] = 'Bearer $token'");

    expect(content('lib/main.dart')).toContain(
      'loggedIn ? const HomeScreen() : const LoginScreen()',
    );
    expect(content('screens/login_screen.dart')).toContain(
      "entityNamed('Usuario')",
    );
    expect(content('pubspec.yaml')).toContain('shared_preferences:');
    // La contraseña no se muestra en listas ni respuestas
    expect(content('lib/schema.dart')).toContain(
      "Field('password', 'text', required: true, secret: true),",
    );
  });

  it('sin contraseña en Usuario no hay login ni sesión', () => {
    const { context, dartFiles, content } = generate(
      {
        packageName: 'com.uagrm.simpleapp',
        artifactId: 'simple-mobile',
        projectName: 'App Simple Sin Auth',
        serverPort: 8080,
      },
      [
        {
          id: 'node-usr-simple',
          name: 'Usuario',
          attributes: [
            { name: 'id', type: 'UUID', isNullable: false },
            { name: 'nombre', type: 'String', isNullable: false },
          ],
          methods: [],
        },
      ],
    );

    expect(context.hasAuth).toBe(false);
    expect(dartFiles).not.toContain('screens/login_screen.dart');
    expect(content('lib/api.dart')).not.toContain('Authorization');
    expect(content('lib/main.dart')).toContain('home: const HomeScreen(),');
    expect(content('lib/main.dart')).not.toContain('LoginScreen');
  });
});
