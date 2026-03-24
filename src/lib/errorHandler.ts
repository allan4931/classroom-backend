/**
 * Security error handling utilities
 * Provides secure error responses without information disclosure
 */

import type { Request, Response } from "express";

/**
 * Generic error response that doesn't leak sensitive information
 */
export function sendErrorResponse(res: Response, statusCode: number, userMessage: string, logError?: any, context?: string) {
  // Log the actual error for debugging (in production, use proper logging)
  if (logError || context) {
    console.error(`Security Error [${context || 'Unknown'}]:`, logError || 'No error details');
  }

  // Send generic error message to user
  const errorMessages: Record<number, string> = {
    400: userMessage || 'Bad request',
    401: userMessage || 'Authentication required',
    403: userMessage || 'Access denied',
    404: userMessage || 'Resource not found',
    429: userMessage || 'Too many requests',
    500: userMessage || 'Internal server error',
  };

  return res.status(statusCode).json({
    error: errorMessages[statusCode] || 'An error occurred',
    message: userMessage || errorMessages[statusCode] || 'An error occurred',
    // Only include timestamp in development
    ...(process.env.NODE_ENV === 'development' && { timestamp: new Date().toISOString() })
  });
}

/**
 * Rate limiting error response
 */
export function sendRateLimitError(res: Response, retryAfter?: number) {
  const headers: Record<string, string> = {};
  if (retryAfter) {
    headers['Retry-After'] = retryAfter.toString();
  }

  return res.status(429)
    .set(headers)
    .json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      ...(retryAfter && { retryAfter })
    });
}

/**
 * Authentication error response
 */
export function sendAuthError(res: Response, message: string = 'Authentication failed') {
  return sendErrorResponse(res, 401, message, 'Authentication error', 'AUTH');
}

/**
 * Authorization error response
 */
export function sendAuthzError(res: Response, message: string = 'Access denied') {
  return sendErrorResponse(res, 403, message, 'Authorization error', 'AUTHZ');
}

/**
 * Validation error response
 */
export function sendValidationError(res: Response, errors: string | string[]) {
  const errorArray = Array.isArray(errors) ? errors : [errors];
  return sendErrorResponse(res, 400, 'Validation failed', errorArray, 'VALIDATION');
}

/**
 * Not found error response
 */
export function sendNotFoundError(res: Response, resource: string = 'Resource') {
  return sendErrorResponse(res, 404, `${resource} not found`, 'Not found error', 'NOT_FOUND');
}

/**
 * Server error response
 */
export function sendServerError(res: Response, error?: any, context?: string) {
  return sendErrorResponse(res, 500, 'Internal server error', error, context || 'SERVER_ERROR');
}
