import { NextResponse } from 'next/server';

import type { ApiResponse } from '@/types/contract';

export class ApiRouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRouteError';
    this.status = status;
  }
}

export interface RouteContext<TParams = Record<string, string>> {
  params: TParams;
}

export type RouteHandler<TParams = Record<string, string>> = (
  request: Request,
  context: RouteContext<TParams>,
) => Promise<Response>;

export function apiSuccess<T>(data: T, status = 200): Response {
  const body: ApiResponse<T> = {
    data,
    error: null,
    status,
  };

  return NextResponse.json(body, { status });
}

export function apiFailure(status: number, error: string): Response {
  const body: ApiResponse<null> = {
    data: null,
    error,
    status,
  };

  return NextResponse.json(body, { status });
}

export function badRequest(message: string): ApiRouteError {
  return new ApiRouteError(400, message);
}

export function unauthorized(message: string): ApiRouteError {
  return new ApiRouteError(401, message);
}

export function forbidden(message: string): ApiRouteError {
  return new ApiRouteError(403, message);
}

export function notFound(message: string): ApiRouteError {
  return new ApiRouteError(404, message);
}

export function conflict(message: string): ApiRouteError {
  return new ApiRouteError(409, message);
}

export function serverError(message: string): ApiRouteError {
  return new ApiRouteError(500, message);
}

export async function runRoute<TParams = Record<string, string>>(
  request: Request,
  context: RouteContext<TParams>,
  handler: RouteHandler<TParams>,
): Promise<Response> {
  try {
    return await handler(request, context);
  } catch (error) {
    if (error instanceof ApiRouteError) {
      return apiFailure(error.status, error.message);
    }

    console.error(error);
    return apiFailure(500, 'Internal server error');
  }
}
