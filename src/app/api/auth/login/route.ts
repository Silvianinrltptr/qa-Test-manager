import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWorkspacePassword,
  createSessionToken,
  SESSION_COOKIE_NAME,
  WorkspaceRole,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      workspace?: WorkspaceRole;
      password?: string;
    };

    const { workspace, password } = body;

    if (!workspace || (workspace !== 'qa' && workspace !== 'dev_pm')) {
      return NextResponse.json(
        { error: 'INVALID_WORKSPACE', message: 'Please select a valid workspace (QA or Developer & PM)' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'PASSWORD_REQUIRED', message: 'Password is required' },
        { status: 400 }
      );
    }

    const isValid = verifyWorkspacePassword(workspace, password);
    if (!isValid) {
      return NextResponse.json(
        {
          error: 'INVALID_PASSWORD',
          message: `Incorrect password for ${workspace === 'qa' ? 'QA Workspace' : 'Developer & PM Workspace'}.`,
        },
        { status: 401 }
      );
    }

    const token = await createSessionToken(workspace);

    const response = NextResponse.json({
      success: true,
      role: workspace,
      redirectTo: workspace === 'qa' ? '/dashboard' : '/project-viewer',
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (error) {
    console.error('Auth login error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'An internal authentication error occurred' }, { status: 500 });
  }
}
