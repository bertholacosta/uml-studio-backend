import { Test, TestingModule } from '@nestjs/testing';
import { SpringTemplateEngineService } from './spring-template-engine.service';
import { GenerateCodeRequestDto } from '../dtos/generate-code-request.dto';

describe('SpringTemplateEngineService', () => {
  let service: SpringTemplateEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SpringTemplateEngineService],
    }).compile();

    service = module.get<SpringTemplateEngineService>(
      SpringTemplateEngineService,
    );
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  it('debe generar las 5 capas de Spring Boot, Flyway, Dockerfile, docker-compose y README a partir de un AST', () => {
    const dto: GenerateCodeRequestDto = {
      packageName: 'com.uagrm.ventas',
      artifactId: 'ventas-api',
      projectName: 'Sistema de Ventas',
      javaVersion: '21',
      databaseName: 'ventas_db',
    };

    const mockNodes = [
      {
        id: 'node-1',
        name: 'Producto',
        attributes: [
          { name: 'id', type: 'UUID', isNullable: false },
          { name: 'nombre', type: 'String', isNullable: false },
          { name: 'precio', type: 'Double', isNullable: false },
        ],
        methods: [
          {
            name: 'calcularDescuento',
            parameters: 'Double porcentaje',
            returnType: 'Double',
          },
        ],
      },
      {
        id: 'node-2',
        name: 'Categoria',
        attributes: [
          { name: 'id', type: 'UUID', isNullable: false },
          { name: 'codigo', type: 'String', isNullable: false },
          { name: 'descripcion', type: 'String', isNullable: true },
        ],
        methods: [],
      },
    ];

    const mockConnections = [
      {
        id: 'conn-1',
        sourceNodeId: 'node-2',
        targetNodeId: 'node-1',
        sourceId: 'node-2_right',
        targetId: 'node-1_left',
        type: 'association',
        sourceMultiplicity: '1',
        targetMultiplicity: '1..*',
      },
    ];

    const result = service.generateProjectFiles(
      dto,
      mockNodes,
      mockConnections,
    );

    expect(result).toBeDefined();
    expect(result.files.length).toBeGreaterThan(10);

    // Verificar capas generadas
    const entityFiles = result.files.filter((f) => f.layer === 'entity');
    expect(entityFiles.length).toBe(2);
    expect(entityFiles.some((f) => f.filename === 'Producto.java')).toBe(true);
    expect(entityFiles.some((f) => f.filename === 'Categoria.java')).toBe(true);

    const repoFiles = result.files.filter((f) => f.layer === 'repository');
    expect(repoFiles.length).toBe(2);
    expect(
      repoFiles.some((f) => f.filename === 'ProductoRepository.java'),
    ).toBe(true);

    const dtoFiles = result.files.filter((f) => f.layer === 'dto');
    expect(dtoFiles.length).toBe(6); // Create, Update, Response por cada una

    const serviceFiles = result.files.filter((f) => f.layer === 'service');
    expect(serviceFiles.length).toBe(2); // Direct Service class por cada una (sin impl)
    expect(
      serviceFiles.some((f) => f.filename === 'ProductoService.java'),
    ).toBe(true);
    expect(
      serviceFiles.some((f) => f.filename === 'ProductoServiceImpl.java'),
    ).toBe(false);

    const controllerFiles = result.files.filter(
      (f) => f.layer === 'controller',
    );
    expect(controllerFiles.length).toBe(2);
    expect(
      controllerFiles.some((f) => f.filename === 'ProductoController.java'),
    ).toBe(true);

    // Verificar Swagger UI y OpenAPI en Controller
    const productoController = controllerFiles.find(
      (f) => f.filename === 'ProductoController.java',
    )!;
    expect(productoController.content).toContain('@Tag(name = "Producto"');
    expect(productoController.content).toContain(
      '@Operation(summary = "Listar todos los registros de Producto")',
    );

    // Verificar Flyway Migration SQL
    const flywayFile = result.files.find((f) => f.layer === 'migration')!;
    expect(flywayFile).toBeDefined();
    expect(flywayFile.content).toContain(
      'CREATE TABLE IF NOT EXISTS "producto"',
    );
    expect(flywayFile.content).toContain(
      'CREATE TABLE IF NOT EXISTS "categoria"',
    );
    expect(flywayFile.content).toContain('FOREIGN KEY');

    // Verificar Docker y docker-compose (ambos modos: autónomo y local con recursos del host)
    const dockerComposeFile = result.files.find(
      (f) => f.filename === 'docker-compose.yml',
    )!;
    expect(dockerComposeFile).toBeDefined();
    expect(dockerComposeFile.content).toContain('image: postgres:18-alpine');
    expect(dockerComposeFile.content).toContain('ventas_db');

    const dockerComposeLocalFile = result.files.find(
      (f) => f.filename === 'docker-compose.local.yml',
    )!;
    expect(dockerComposeLocalFile).toBeDefined();
    expect(dockerComposeLocalFile.content).toContain(
      'image: postgres:18-alpine',
    );
    expect(dockerComposeLocalFile.content).toContain('Dockerfile.local');
    expect(dockerComposeLocalFile.content).toContain('ventas-api-app-local');

    const dockerfile = result.files.find((f) => f.filename === 'Dockerfile')!;
    expect(dockerfile).toBeDefined();
    expect(dockerfile.content).toContain('AS builder');

    const dockerfileLocal = result.files.find(
      (f) => f.filename === 'Dockerfile.local',
    )!;
    expect(dockerfileLocal).toBeDefined();
    expect(dockerfileLocal.content).toContain('COPY build/libs/*.jar app.jar');

    // Verificar build.gradle y settings.gradle
    const gradleFile = result.files.find((f) => f.filename === 'build.gradle')!;
    expect(gradleFile).toBeDefined();
    expect(gradleFile.content).toContain('springdoc-openapi-starter-webmvc-ui');
    expect(gradleFile.content).toContain('flyway-core');
    expect(gradleFile.content).toContain('org.projectlombok:lombok');

    const settingsFile = result.files.find(
      (f) => f.filename === 'settings.gradle',
    )!;
    expect(settingsFile).toBeDefined();
    expect(settingsFile.content).toContain("rootProject.name = 'ventas-api'");
  });

  it('debe detectar la clase Usuario y generar el módulo de autenticación con Spring Security y JWT', () => {
    const dto: GenerateCodeRequestDto = {
      packageName: 'com.uagrm.authdemo',
      artifactId: 'auth-api',
      projectName: 'Sistema con Autenticación',
      javaVersion: '21',
      databaseName: 'auth_db',
    };

    const mockNodes = [
      {
        id: 'node-u',
        name: 'Usuario',
        attributes: [
          { name: 'id', type: 'UUID', isNullable: false },
          { name: 'nombreCompleto', type: 'String', isNullable: false },
          { name: 'email', type: 'String', isNullable: false, isUnique: true },
          { name: 'password', type: 'String', isNullable: false },
        ],
        methods: [],
      },
    ];

    const result = service.generateProjectFiles(dto, mockNodes, []);

    expect(result.context.hasAuth).toBe(true);
    expect(result.context.userClass).toBeDefined();

    // Verificar archivos de seguridad y JWT
    expect(
      result.files.some((f) => f.filename === 'JwtTokenProvider.java'),
    ).toBe(true);
    expect(result.files.some((f) => f.filename === 'UserPrincipal.java')).toBe(
      true,
    );
    expect(
      result.files.some((f) => f.filename === 'CustomUserDetailsService.java'),
    ).toBe(true);
    expect(
      result.files.some((f) => f.filename === 'JwtAuthenticationFilter.java'),
    ).toBe(true);
    expect(result.files.some((f) => f.filename === 'SecurityConfig.java')).toBe(
      true,
    );
    expect(
      result.files.some((f) => f.filename === 'LoginRequestDto.java'),
    ).toBe(true);
    expect(
      result.files.some((f) => f.filename === 'RegisterRequestDto.java'),
    ).toBe(true);
    expect(
      result.files.some((f) => f.filename === 'AuthResponseDto.java'),
    ).toBe(true);
    expect(result.files.some((f) => f.filename === 'AuthService.java')).toBe(
      true,
    );
    expect(
      result.files.some((f) => f.filename === 'AuthServiceImpl.java'),
    ).toBe(false);
    expect(result.files.some((f) => f.filename === 'AuthController.java')).toBe(
      true,
    );

    // Verificar contenido de SecurityConfig y pom.xml
    const secConfig = result.files.find(
      (f) => f.filename === 'SecurityConfig.java',
    )!;
    expect(secConfig.content).toContain('/api/v1/auth/**');

    const gradleFile = result.files.find((f) => f.filename === 'build.gradle')!;
    expect(gradleFile.content).toContain('spring-boot-starter-security');
    expect(gradleFile.content).toContain('jjwt-api');

    // Verificar Flyway con seed inicial
    const flywayFile = result.files.find((f) => f.layer === 'migration')!;
    expect(flywayFile).toBeDefined();
    expect(flywayFile.content).toContain(
      'INITIAL SEED DATA FOR AUTHENTICATION',
    );
    expect(flywayFile.content).toContain('admin@studio.com');
  });

  it('no debe duplicar columnas ni atributos foráneos entre atributos escalares y @JoinColumn (ej. Order con customerId y Customer)', () => {
    const dto: GenerateCodeRequestDto = {
      packageName: 'com.uagrm.studio',
      artifactId: 'prueba-backend',
      projectName: 'Prueba',
      javaVersion: '21',
      databaseName: 'prueba_db',
    };

    const mockNodes = [
      {
        id: 'node-order',
        name: 'Order',
        attributes: [
          { name: 'id', type: 'UUID' },
          { name: 'orderDate', type: 'LocalDateTime' },
          { name: 'customerId', type: 'UUID' },
          { name: 'deliveryId', type: 'UUID' },
        ],
        methods: [],
      },
      {
        id: 'node-customer',
        name: 'Customer',
        attributes: [
          { name: 'customerID', type: 'UUID' },
          { name: 'name', type: 'String' },
        ],
        methods: [],
      },
      {
        id: 'node-delivery',
        name: 'Delivery',
        attributes: [
          { name: 'deliveryID', type: 'UUID' },
          { name: 'address', type: 'String' },
        ],
        methods: [],
      },
    ];

    const mockConnections = [
      {
        id: 'conn-cust-order',
        sourceNodeId: 'node-customer',
        targetNodeId: 'node-order',
        sourceId: 'node-customer_right',
        targetId: 'node-order_left',
        type: 'association',
        sourceMultiplicity: '1',
        targetMultiplicity: '1..*',
      },
      {
        id: 'conn-deliv-order',
        sourceNodeId: 'node-delivery',
        targetNodeId: 'node-order',
        sourceId: 'node-delivery_right',
        targetId: 'node-order_left',
        type: 'association',
        sourceMultiplicity: '1',
        targetMultiplicity: '1..*',
      },
    ];

    const result = service.generateProjectFiles(
      dto,
      mockNodes,
      mockConnections,
    );

    // 1. Verificar Order.java (Entidad)
    const orderEntity = result.files.find((f) => f.filename === 'Order.java')!;
    expect(orderEntity).toBeDefined();
    // Debe tener los @JoinColumn
    expect(orderEntity.content).toContain('@JoinColumn(name = "customer_id")');
    expect(orderEntity.content).toContain('private Customer customer;');
    expect(orderEntity.content).toContain('@JoinColumn(name = "delivery_id")');
    expect(orderEntity.content).toContain('private Delivery delivery;');
    // NO debe duplicar customer_id como campo escalar @Column
    expect(orderEntity.content).not.toContain('@Column(name = "customer_id")');
    expect(orderEntity.content).not.toContain('private UUID customerId;');
    expect(orderEntity.content).not.toContain('@Column(name = "delivery_id")');
    expect(orderEntity.content).not.toContain('private UUID deliveryId;');

    // 2. Verificar CreateOrderDto.java
    const createDto = result.files.find(
      (f) => f.filename === 'CreateOrderDto.java',
    )!;
    expect(createDto).toBeDefined();
    // customerId y deliveryId deben existir exactamente una vez en CreateOrderDto
    const customerMatches = createDto.content.match(/customerId;/g);
    expect(customerMatches).toHaveLength(1);
    const deliveryMatches = createDto.content.match(/deliveryId;/g);
    expect(deliveryMatches).toHaveLength(1);

    // 3. Verificar OrderResponseDto.java
    const responseDto = result.files.find(
      (f) => f.filename === 'OrderResponseDto.java',
    )!;
    expect(responseDto).toBeDefined();
    expect(responseDto.content).toContain('private UUID customerId;');
    expect(responseDto.content).toContain('private UUID deliveryId;');
    expect(responseDto.content).toContain(
      'entity.getCustomer() != null ? entity.getCustomer().getCustomerID() : null',
    );
    expect(responseDto.content).toContain(
      'entity.getDelivery() != null ? entity.getDelivery().getDeliveryID() : null',
    );

    // 4. Verificar OrderService.java
    const orderService = result.files.find(
      (f) => f.filename === 'OrderService.java',
    )!;
    expect(orderService).toBeDefined();
    expect(orderService.content).toContain(
      'com.uagrm.studio.entities.Customer',
    );
    expect(orderService.content).toContain(
      'com.uagrm.studio.entities.Delivery',
    );
    expect(orderService.content).toContain('if (dto.getCustomerId() != null)');
    expect(orderService.content).toContain(
      'customer.setCustomerID(dto.getCustomerId())',
    );
    expect(orderService.content).toContain('entity.setCustomer(customer)');
    expect(orderService.content).toContain('if (dto.getDeliveryId() != null)');
    expect(orderService.content).toContain(
      'delivery.setDeliveryID(dto.getDeliveryId())',
    );
    expect(orderService.content).toContain('entity.setDelivery(delivery)');
  });
});
