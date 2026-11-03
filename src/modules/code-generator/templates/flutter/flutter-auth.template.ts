import * as path from 'path';
import {
  JavaClassMeta,
  ProjectContext,
  toSnakeCase,
  getUserEmailField,
  getUserPasswordField,
} from '../spring_boot/template-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

/**
 * Renderiza el servicio de almacenamiento seguro y en memoria del token JWT.
 */
export function renderFlutterTokenStorageService(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-token-storage.template.mustache'),
  );
  return renderMustache(template, {});
}

/**
 * Renderiza los modelos DTO de Autenticación para Flutter.
 */
export function renderFlutterAuthModels(userMeta: JavaClassMeta): string {
  const userSnake = toSnakeCase(userMeta.className);
  const template = loadTemplate(
    path.join(__dirname, 'flutter-auth-models.template.mustache'),
  );
  return renderMustache(template, {
    userSnake,
    className: userMeta.className,
  });
}

/**
 * Renderiza el DataSource remoto para comunicarse con /api/v1/auth.
 */
export function renderFlutterAuthRemoteDataSource(): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-auth-datasource.template.mustache'),
  );
  return renderMustache(template, {});
}

/**
 * Renderiza la interfaz de Dominio del Repositorio de Auth.
 */
export function renderFlutterAuthDomainRepository(
  userMeta: JavaClassMeta,
): string {
  const userSnake = toSnakeCase(userMeta.className);
  const template = loadTemplate(
    path.join(__dirname, 'flutter-auth-domain-repository.template.mustache'),
  );
  return renderMustache(template, {
    userSnake,
    className: userMeta.className,
  });
}

/**
 * Renderiza la Implementación de Datos del Repositorio de Auth.
 */
export function renderFlutterAuthDataRepository(
  userMeta: JavaClassMeta,
): string {
  const userSnake = toSnakeCase(userMeta.className);
  const template = loadTemplate(
    path.join(__dirname, 'flutter-auth-data-repository.template.mustache'),
  );
  return renderMustache(template, {
    userSnake,
    className: userMeta.className,
  });
}

/**
 * Renderiza los casos de uso para la autenticación en Flutter.
 */
export function renderFlutterAuthUseCases(userMeta: JavaClassMeta): string {
  const userSnake = toSnakeCase(userMeta.className);
  const template = loadTemplate(
    path.join(__dirname, 'flutter-auth-usecases.template.mustache'),
  );
  return renderMustache(template, {
    userSnake,
    className: userMeta.className,
  });
}

/**
 * Renderiza el BLoC de Autenticación (Events, States y BLoC).
 */
export function renderFlutterAuthBloc(userMeta: JavaClassMeta): string {
  const userSnake = toSnakeCase(userMeta.className);
  const template = loadTemplate(
    path.join(__dirname, 'flutter-auth-bloc.template.mustache'),
  );
  return renderMustache(template, {
    userSnake,
    className: userMeta.className,
  });
}

/**
 * Renderiza la pantalla LoginPage con diseño profesional.
 */
export function renderFlutterLoginPage(context: ProjectContext): string {
  const template = loadTemplate(
    path.join(__dirname, 'flutter-login-page.template.mustache'),
  );
  return renderMustache(template, {
    projectName: context.projectName,
  });
}

/**
 * Renderiza la pantalla RegisterPage.
 */
export function renderFlutterRegisterPage(
  context: ProjectContext,
  userMeta: JavaClassMeta,
): string {
  const emailField = getUserEmailField(userMeta);
  const passField = getUserPasswordField(userMeta);
  const regularFields = userMeta.fields.filter(
    (f) => !f.isId && f.name !== passField.name && f.name !== emailField.name,
  );

  const extraDataEntries = regularFields.map((f) => {
    let parseExpr = `_${f.name}Controller.text.trim()`;
    if (f.javaType === 'Integer' || f.javaType === 'Long') {
      parseExpr = `int.tryParse(_${f.name}Controller.text.trim()) ?? 0`;
    } else if (
      f.javaType === 'Double' ||
      f.javaType === 'Float' ||
      f.javaType === 'BigDecimal'
    ) {
      parseExpr = `double.tryParse(_${f.name}Controller.text.trim()) ?? 0.0`;
    } else if (f.javaType === 'Boolean') {
      parseExpr = `_${f.name}Controller.text.trim().toLowerCase() == 'true'`;
    }
    return { name: f.name, parseExpr };
  });

  const regularFieldsWidgets = regularFields.map((f) => {
    const label = f.name.charAt(0).toUpperCase() + f.name.slice(1);
    const isNum =
      f.javaType === 'Integer' ||
      f.javaType === 'Long' ||
      f.javaType === 'Double' ||
      f.javaType === 'BigDecimal';
    return {
      name: f.name,
      label,
      keyboardType: isNum ? 'TextInputType.number' : 'TextInputType.text',
      isRequired: !f.isNullable,
    };
  });

  const emailLabel =
    emailField.name.charAt(0).toUpperCase() + emailField.name.slice(1);

  const template = loadTemplate(
    path.join(__dirname, 'flutter-register-page.template.mustache'),
  );
  return renderMustache(template, {
    className: userMeta.className,
    regularFields: regularFields.map((f) => ({ name: f.name })),
    extraDataEntries,
    regularFieldsWidgets,
    emailLabel,
    emailLabelLower: emailLabel.toLowerCase(),
  });
}

/**
 * Renderiza la pantalla ProfilePage con opción de cerrar sesión.
 */
export function renderFlutterProfilePage(
  context: ProjectContext,
  userMeta: JavaClassMeta,
): string {
  const userSnake = toSnakeCase(userMeta.className);
  const nameField = userMeta.fields.find((f) =>
    ['nombre', 'name', 'fullname', 'nombrecompleto', 'username'].includes(
      f.name.toLowerCase(),
    ),
  );
  const lastNameField = userMeta.fields.find((f) =>
    ['apellido', 'lastname', 'apellidos'].includes(f.name.toLowerCase()),
  );
  const emailField = getUserEmailField(userMeta);

  const nameGetter = nameField ? `u.${nameField.name}` : null;
  const lastNameGetter = lastNameField ? `u.${lastNameField.name}` : null;
  const emailGetter = emailField ? `u.${emailField.name}` : null;

  const template = loadTemplate(
    path.join(__dirname, 'flutter-profile-page.template.mustache'),
  );
  return renderMustache(template, {
    projectName: context.projectName,
    className: userMeta.className,
    userSnake,
    nameGetter,
    lastNameGetter,
    emailGetter,
  });
}
