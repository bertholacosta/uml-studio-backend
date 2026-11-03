import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error: typeof message === 'object' ? message : { message },
    };

    const summary = `${request.method} ${request.url} - ${status} - ${JSON.stringify(errorResponse.error)}`;
    if (status >= 500) {
      // Los errores inesperados se registran con su traza; al cliente solo le llega el mensaje genérico
      this.logger.error(
        summary,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(summary);
    }

    response.status(status).json(errorResponse);
  }
}
