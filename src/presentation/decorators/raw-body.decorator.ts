import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const RawBody = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): Buffer | string => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { rawBody?: Buffer }>();

    if (request.rawBody) {
      return request.rawBody;
    }
    if (Buffer.isBuffer(request.body)) {
      return request.body;
    }
    if (typeof request.body === 'string') {
      return request.body;
    }
    if (request.body && Object.keys(request.body).length > 0) {
      return Buffer.from(JSON.stringify(request.body));
    }
    return Buffer.from('');
  },
);
