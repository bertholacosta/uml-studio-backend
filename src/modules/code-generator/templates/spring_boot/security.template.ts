import * as path from 'path';
import {
  JavaClassMeta,
  ProjectContext,
  getUserEmailField,
  getUserPasswordField,
  getUserUsernameField,
  toPascalCase,
} from './template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderJwtTokenProvider(
  context: ProjectContext,
  _userClass: JavaClassMeta,
): string {
  const templatePath = path.join(
    __dirname,
    'jwt-token-provider.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    packageName: context.packageName,
  });
}

export function renderUserPrincipal(
  context: ProjectContext,
  userClass: JavaClassMeta,
): string {
  const templatePath = path.join(__dirname, 'user-principal.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  const idType = userClass.idField.javaType;
  const emailField = getUserEmailField(userClass);
  const passField = getUserPasswordField(userClass);

  return renderMustache(mustacheTemplate, {
    packageName: context.packageName,
    userClassName: userClass.className,
    idType,
    idGetter: userClass.idField.getterName,
    isUuid: idType === 'UUID',
    emailGetter: emailField.getterName,
    passGetter: passField.getterName,
  });
}

export function renderCustomUserDetailsService(
  context: ProjectContext,
  userClass: JavaClassMeta,
): string {
  const templatePath = path.join(
    __dirname,
    'custom-user-details-service.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  const emailField = getUserEmailField(userClass);
  const usernameField = getUserUsernameField(userClass);
  const emailMethod = `findBy${toPascalCase(emailField.name)}`;
  const usernameMethod = usernameField
    ? `findBy${toPascalCase(usernameField.name)}`
    : null;

  const lookupStatement =
    usernameMethod && usernameMethod !== emailMethod
      ? `        ${userClass.className} user = userRepository.${emailMethod}(username)
                .or(() -> userRepository.${usernameMethod}(username))
                .orElseThrow(() -> new UsernameNotFoundException("Usuario no encontrado con identificador: " + username));`
      : `        ${userClass.className} user = userRepository.${emailMethod}(username)
                .orElseThrow(() -> new UsernameNotFoundException("Usuario no encontrado con identificador: " + username));`;

  return renderMustache(mustacheTemplate, {
    packageName: context.packageName,
    userClassName: userClass.className,
    lookupStatement,
  });
}

export function renderJwtAuthenticationFilter(context: ProjectContext): string {
  const templatePath = path.join(
    __dirname,
    'jwt-authentication-filter.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    packageName: context.packageName,
  });
}

export function renderSecurityConfig(context: ProjectContext): string {
  const templatePath = path.join(
    __dirname,
    'security-config.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    packageName: context.packageName,
  });
}

export function renderLoginRequestDto(context: ProjectContext): string {
  const templatePath = path.join(
    __dirname,
    'login-request-dto.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    packageName: context.packageName,
  });
}

export function renderRegisterRequestDto(
  context: ProjectContext,
  userClass: JavaClassMeta,
): string {
  const templatePath = path.join(
    __dirname,
    'register-request-dto.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  const passField = getUserPasswordField(userClass);
  const regularFields = userClass.fields.filter(
    (f) => !f.isId && f.name !== passField.name,
  );

  const fieldsDefs = regularFields.map((f) => {
    const validation =
      f.javaType === 'String'
        ? `    @NotBlank(message = "El campo '${f.name}' es obligatorio")`
        : `    @NotNull(message = "El campo '${f.name}' es obligatorio")`;
    return {
      content: `${validation}\n    private ${f.javaType} ${f.name};`,
    };
  });

  return renderMustache(mustacheTemplate, {
    packageName: context.packageName,
    hasDates: userClass.hasDates,
    hasBigDecimals: userClass.hasBigDecimals,
    fieldsDefs,
  });
}

export function renderAuthResponseDto(
  context: ProjectContext,
  userClass: JavaClassMeta,
): string {
  const templatePath = path.join(
    __dirname,
    'auth-response-dto.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    packageName: context.packageName,
    userClassName: userClass.className,
  });
}

export function renderAuthService(
  context: ProjectContext,
  userClass: JavaClassMeta,
): string {
  const templatePath = path.join(__dirname, 'auth-service.template.mustache');
  const mustacheTemplate = loadTemplate(templatePath);

  const emailField = getUserEmailField(userClass);
  const passField = getUserPasswordField(userClass);
  const usernameField = getUserUsernameField(userClass);

  const emailMethod = `findBy${toPascalCase(emailField.name)}`;
  const usernameMethod = usernameField
    ? `findBy${toPascalCase(usernameField.name)}`
    : null;

  const regularFields = userClass.fields.filter(
    (f) => !f.isId && f.name !== passField.name,
  );
  const fieldSetters = regularFields
    .map((f) => `        user.${f.setterName}(request.${f.getterName}());`)
    .join('\n');

  const lookupUser =
    usernameMethod && usernameMethod !== emailMethod
      ? `        ${userClass.className} user = userRepository.${emailMethod}(identifier)
                .or(() -> userRepository.${usernameMethod}(identifier))
                .orElseThrow(() -> new BadCredentialsException("Credenciales inválidas"));`
      : `        ${userClass.className} user = userRepository.${emailMethod}(identifier)
                .orElseThrow(() -> new BadCredentialsException("Credenciales inválidas"));`;

  return renderMustache(mustacheTemplate, {
    packageName: context.packageName,
    userClassName: userClass.className,
    idGetter: userClass.idField.getterName,
    passGetter: passField.getterName,
    passSetter: passField.setterName,
    lookupUser,
    fieldSetters,
  });
}

export function renderAuthController(
  context: ProjectContext,
  _userClass: JavaClassMeta,
): string {
  const templatePath = path.join(
    __dirname,
    'auth-controller.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  return renderMustache(mustacheTemplate, {
    packageName: context.packageName,
  });
}

export function renderDataInitializer(
  context: ProjectContext,
  userClass: JavaClassMeta,
): string {
  const templatePath = path.join(
    __dirname,
    'data-initializer.template.mustache',
  );
  const mustacheTemplate = loadTemplate(templatePath);

  const emailField = getUserEmailField(userClass);
  const passField = getUserPasswordField(userClass);
  const emailMethod = `findBy${toPascalCase(emailField.name)}`;

  const fields = userClass.fields.filter(
    (f) => !f.isId && f.name !== passField.name && f.name !== emailField.name,
  );
  const setters: string[] = [];

  for (const f of fields) {
    if (
      f.name.toLowerCase().includes('rol') ||
      f.name.toLowerCase().includes('role')
    ) {
      setters.push(`                admin.${f.setterName}("ADMIN");`);
    } else if (
      f.name.toLowerCase() === 'username' ||
      f.name.toLowerCase() === 'usuario'
    ) {
      setters.push(`                admin.${f.setterName}("admin");`);
    } else if (
      f.name.toLowerCase().includes('nombre') ||
      f.name.toLowerCase().includes('name')
    ) {
      setters.push(`                admin.${f.setterName}("Administrador");`);
    } else if (
      f.name.toLowerCase().includes('telefono') ||
      f.name.toLowerCase().includes('phone')
    ) {
      setters.push(`                admin.${f.setterName}("70000000");`);
    } else if (
      f.name.toLowerCase().includes('nit') ||
      f.name.toLowerCase().includes('ci') ||
      f.name.toLowerCase().includes('documento')
    ) {
      setters.push(`                admin.${f.setterName}("1234567");`);
    } else if (f.javaType === 'String') {
      setters.push(`                admin.${f.setterName}("${f.name}_admin");`);
    } else if (
      f.javaType === 'Integer' ||
      f.javaType === 'Long' ||
      f.javaType === 'Double' ||
      f.javaType === 'BigDecimal'
    ) {
      setters.push(`                admin.${f.setterName}(0);`);
    } else if (f.javaType === 'Boolean') {
      setters.push(`                admin.${f.setterName}(true);`);
    }
  }

  return renderMustache(mustacheTemplate, {
    packageName: context.packageName,
    userClassName: userClass.className,
    emailMethod,
    emailSetter: emailField.setterName,
    passSetter: passField.setterName,
    adminSetters: setters.join('\n'),
  });
}
