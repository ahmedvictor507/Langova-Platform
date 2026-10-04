import { NextResponse } from 'next/server';
import { logError } from '@/lib/logger';

// Wraps a route handler so any unhandled error is logged with context and
// returned as a consistent 500 envelope, instead of leaking a raw stack /
// generic Next.js error page. Usage:
//   export const POST = withErrorHandling('stripe.webhook', async (req) => { ... });
export function withErrorHandling<A extends any[]>(
  name: string,
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      logError(`Unhandled error in ${name}`, err);
      return NextResponse.json(
        { error: 'Something went wrong on our end. Please try again.' },
        { status: 500 }
      );
    }
  };
}
