import { corsHeaders } from './auth-middleware.ts';
import { ApiResponse } from './types.ts';

export function successResponse<T>(data: T, message?: string): Response {
  const body: ApiResponse<T> = {
    success: true,
    data,
    message
  };
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200
  });
}

export function errorResponse(message: string, code: number = 400, status: number = 400): Response {
  const body: ApiResponse = {
    success: false,
    message,
    code
  };
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: status
  });
}
