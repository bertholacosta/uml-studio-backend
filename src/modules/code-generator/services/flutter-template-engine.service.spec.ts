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

  it('debe estar definido', () => {
    expect(flutterEngine).toBeDefined();
  });

  it('debe generar la arquitectura limpia completa de Flutter (Data, Domain, Presentation BLoC, Pages, Injection, Pubspec)', () => {
    const dto: GenerateCodeRequestDto = {
      packageName: 'com.uagrm.tienda',
      artifactId: 'tienda-app',
      projectName: 'Tienda Ferreteria',
      serverPort: 8080,
    };

    const mockNodes = [
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
    ];

    const { context } = springEngine.generateProjectFiles(dto, mockNodes, []);
    const files = flutterEngine.generateFlutterProjectFiles(
      context,
      'flutter_app',
    );

    expect(files).toBeDefined();
    expect(files.length).toBeGreaterThan(20);

    // Verificar Core
    expect(files.some((f) => f.path.includes('api_constants.dart'))).toBe(true);
    expect(files.some((f) => f.path.includes('api_client.dart'))).toBe(true);
    expect(files.some((f) => f.path.includes('app_theme.dart'))).toBe(true);

    // Verificar api_constants.dart con el puerto correcto
    const apiConstFile = files.find(
      (f) => f.filename === 'api_constants.dart',
    )!;
    expect(apiConstFile.content).toContain('http://localhost:8080/api/v1');
    expect(apiConstFile.content).toContain('clienteEndpoint');
    expect(apiConstFile.content).toContain('pedidoEndpoint');

    // Verificar Clean Architecture para Cliente
    expect(files.some((f) => f.path.includes('cliente_entity.dart'))).toBe(
      true,
    );
    expect(files.some((f) => f.path.includes('cliente_model.dart'))).toBe(true);
    expect(
      files.some((f) => f.path.includes('cliente_remote_datasource.dart')),
    ).toBe(true);
    expect(
      files.some((f) => f.path.includes('cliente_repository_impl.dart')),
    ).toBe(true);
    expect(
      files.some((f) => f.path.includes('get_clientes_usecase.dart')),
    ).toBe(true);
    expect(files.some((f) => f.path.includes('cliente_bloc.dart'))).toBe(true);
    expect(files.some((f) => f.path.includes('cliente_list_page.dart'))).toBe(
      true,
    );
    expect(files.some((f) => f.path.includes('cliente_form_page.dart'))).toBe(
      true,
    );

    // Verificar Asistente IA Local (Qwen2.5 On-Device)
    expect(files.some((f) => f.filename === 'chat_message.dart')).toBe(true);
    expect(
      files.some((f) => f.filename === 'model_downloader_service.dart'),
    ).toBe(true);
    expect(files.some((f) => f.filename === 'local_llm_service.dart')).toBe(
      true,
    );
    expect(files.some((f) => f.filename === 'ai_assistant_service.dart')).toBe(
      true,
    );
    expect(files.some((f) => f.filename === 'ai_assistant_bloc.dart')).toBe(
      true,
    );
    expect(files.some((f) => f.filename === 'ai_assistant_page.dart')).toBe(
      true,
    );

    const aiServiceFile = files.find(
      (f) => f.filename === 'ai_assistant_service.dart',
    )!;
    expect(aiServiceFile.content).toContain('class AiAssistantService');
    expect(aiServiceFile.content).toContain('LocalLlmService');
    expect(aiServiceFile.content).toContain('Cliente');
    expect(aiServiceFile.content).toContain('Pedido');
    expect(aiServiceFile.content).toContain('_formatErrorInNaturalLanguage');
    expect(aiServiceFile.content).toContain('_extractRequestedFields');
    expect(aiServiceFile.content).toContain('_findFieldValue');

    const aiPageFile = files.find(
      (f) => f.filename === 'ai_assistant_page.dart',
    )!;
    expect(aiPageFile.content).toContain('_focusNode');
    expect(aiPageFile.content).toContain('_focusNode.requestFocus()');

    const homePageFile = files.find((f) => f.filename === 'home_page.dart')!;
    expect(homePageFile.content).toContain('AiAssistantPage');
    expect(homePageFile.content).toContain('Asistente IA');

    // Verificar Inyección de Dependencias
    const diFile = files.find(
      (f) => f.filename === 'injection_container.dart',
    )!;
    expect(diFile.content).toContain('sl.registerFactory(() => ClienteBloc');
    expect(diFile.content).toContain('sl.registerFactory(() => PedidoBloc');
    expect(diFile.content).toContain(
      'sl.registerLazySingleton(() => AiAssistantService',
    );
    expect(diFile.content).toContain(
      'sl.registerFactory(() => AiAssistantBloc',
    );

    // Verificar pubspec.yaml
    const pubspecFile = files.find((f) => f.filename === 'pubspec.yaml')!;
    expect(pubspecFile.content).toContain('flutter_bloc:');
    expect(pubspecFile.content).toContain('dio:');
    expect(pubspecFile.content).toContain('get_it:');
    expect(pubspecFile.content).toContain('dartz:');
  });

  it('debe generar el feature de autenticación completo en Flutter cuando existe clase Usuario', () => {
    const dto: GenerateCodeRequestDto = {
      packageName: 'com.uagrm.authapp',
      artifactId: 'auth-mobile',
      projectName: 'App Móvil con Auth',
      serverPort: 8080,
    };

    const mockNodes = [
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
    ];

    const { context } = springEngine.generateProjectFiles(dto, mockNodes, []);
    const files = flutterEngine.generateFlutterProjectFiles(
      context,
      'mobile_flutter',
    );

    expect(context.hasAuth).toBe(true);

    // Verificar archivos del feature auth en Flutter
    expect(files.some((f) => f.filename === 'token_storage_service.dart')).toBe(
      true,
    );
    expect(files.some((f) => f.filename === 'auth_models.dart')).toBe(true);
    expect(
      files.some((f) => f.filename === 'auth_remote_datasource.dart'),
    ).toBe(true);
    expect(files.some((f) => f.filename === 'auth_repository_impl.dart')).toBe(
      true,
    );
    expect(files.some((f) => f.filename === 'auth_usecases.dart')).toBe(true);
    expect(files.some((f) => f.filename === 'auth_bloc.dart')).toBe(true);
    expect(files.some((f) => f.filename === 'login_page.dart')).toBe(true);
    expect(files.some((f) => f.filename === 'register_page.dart')).toBe(true);
    expect(files.some((f) => f.filename === 'profile_page.dart')).toBe(true);

    // Verificar ApiClient con interceptor de token
    const apiClientFile = files.find((f) => f.filename === 'api_client.dart')!;
    expect(apiClientFile.content).toContain('TokenStorageService.getToken()');
    expect(apiClientFile.content).toContain('Authorization');

    // Verificar main.dart con LoginPage condicional
    const mainFile = files.find((f) => f.filename === 'main.dart')!;
    expect(mainFile.content).toContain('BlocProvider<AuthBloc>');
    expect(mainFile.content).toContain('LoginPage');
  });

  it('debe generar la app Flutter sin módulo de login si Usuario no tiene password', () => {
    const dto: GenerateCodeRequestDto = {
      packageName: 'com.uagrm.simpleapp',
      artifactId: 'simple-mobile',
      projectName: 'App Simple Sin Auth',
      serverPort: 8080,
    };

    const mockNodes = [
      {
        id: 'node-usr-simple',
        name: 'Usuario',
        attributes: [
          { name: 'id', type: 'UUID', isNullable: false },
          { name: 'nombre', type: 'String', isNullable: false },
        ],
        methods: [],
      },
    ];

    const { context } = springEngine.generateProjectFiles(dto, mockNodes, []);
    const files = flutterEngine.generateFlutterProjectFiles(
      context,
      'mobile_flutter',
    );

    expect(context.hasAuth).toBe(false);
    expect(files.some((f) => f.filename === 'login_page.dart')).toBe(false);
    expect(files.some((f) => f.filename === 'register_page.dart')).toBe(false);

    const mainFile = files.find((f) => f.filename === 'main.dart')!;
    expect(mainFile.content).not.toContain('BlocProvider<AuthBloc>');
    expect(mainFile.content).toContain('HomePage');
  });
});
