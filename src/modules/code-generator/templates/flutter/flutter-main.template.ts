import * as path from 'path';
import { ProjectContext, toSnakeCase } from '../spring_boot/template-models';
import { getPluralName } from './flutter-models';
import { loadTemplate, renderMustache } from '../mustache-renderer';

export function renderFlutterInjectionContainer(
  context: ProjectContext,
): string {
  const features = context.classes.map((meta) => {
    const snake = toSnakeCase(meta.className);
    const classPlural = getPluralName(meta.className);
    const snakePlural = getPluralName(snake);
    return {
      className: meta.className,
      snake,
      classPlural,
      snakePlural,
    };
  });

  const template = loadTemplate(
    path.join(__dirname, 'flutter-injection-container.template.mustache'),
  );
  return renderMustache(template, {
    hasAuth: context.hasAuth,
    features,
  });
}

export function renderFlutterHomePage(context: ProjectContext): string {
  const classes = context.classes.map((c) => ({
    className: c.className,
    snake: toSnakeCase(c.className),
    classPlural: getPluralName(c.className),
  }));

  const template = loadTemplate(
    path.join(__dirname, 'flutter-home-page.template.mustache'),
  );
  return renderMustache(template, {
    projectName: context.projectName,
    hasAuth: context.hasAuth,
    classes,
  });
}

export function renderFlutterMain(context: ProjectContext): string {
  const classes = context.classes.map((meta) => ({
    className: meta.className,
    snake: toSnakeCase(meta.className),
  }));

  const homeWidget = context.hasAuth
    ? `BlocBuilder<AuthBloc, AuthState>(
          builder: (context, state) {
            if (state is Authenticated) {
              return const HomePage();
            } else if (state is Unauthenticated || state is AuthFailureState) {
              return const LoginPage();
            }
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          },
        )`
    : 'const HomePage()';

  const template = loadTemplate(
    path.join(__dirname, 'flutter-main.template.mustache'),
  );
  return renderMustache(template, {
    projectName: context.projectName,
    hasAuth: context.hasAuth,
    classes,
    homeWidget,
  });
}
