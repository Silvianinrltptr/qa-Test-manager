import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';

const QA_ONLY_PATHS = [
  '/dashboard',
  '/modules',
  '/test-cases',
  '/bulk-add',
  '/ai-generator',
  '/import',
  '/execution',
  '/impact-analysis',
  '/traceability',
  '/reports',
  '/weekly-progress',
  '/change-log',
  '/feedback',
  '/settings',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isViewerPath = pathname.startsWith('/project-viewer');
  const isQaPath = QA_ONLY_PATHS.some(p => pathname.startsWith(p));

  // Project Viewer is open to Developer & PM without password
  if (isViewerPath) {
    return NextResponse.next();
  }

  if (!isQaPath) {
    return NextResponse.next();
  }

  // Read session cookie for QA pages
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  // Protect QA-only pages: requires valid QA workspace session
  if (!session || session.role !== 'qa') {
    const loginUrl = new URL('/', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
