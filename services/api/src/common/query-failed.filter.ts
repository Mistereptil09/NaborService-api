import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

/**
 * Catches TypeORM QueryFailedError and converts known low-level
 * PostgreSQL errors into proper HTTP responses.
 *
 * Currently handled:
 * - 22P02: invalid input syntax for type uuid → 400 Bad Request
 *   (e.g. GET /events/undefined when the frontend passes a bad ID)
 */
@Catch(QueryFailedError)
export class QueryFailedFilter implements ExceptionFilter {
  private readonly logger = new Logger(QueryFailedFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const pgCode = (exception as any).code;
    const message = (exception as any).message ?? '';

    if (pgCode === '22P02') {
      // invalid_text_representation — typically a bad UUID
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid identifier format',
        error: 'Bad Request',
        path: request.url,
      });
      return;
    }

    // Re-throw anything we don't explicitly handle
    this.logger.error(
      `Unhandled QueryFailedError [${pgCode}]: ${message}`,
      (exception as any).stack,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
      path: request.url,
    });
  }
}
