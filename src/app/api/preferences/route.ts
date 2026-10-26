import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getUserKey(req: NextRequest): Promise<string> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload?.role) {
      return payload.role;
    }
  }
  return 'global';
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const userKey = await getUserKey(req);

    // Ensure table exists safely across environments
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id SERIAL PRIMARY KEY,
        user_key TEXT UNIQUE NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        theme TEXT DEFAULT 'light',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run().catch(() => {});

    const row = await db.prepare(
      'SELECT language, theme FROM user_preferences WHERE user_key = ?'
    ).get(userKey) as { language?: string; theme?: string } | undefined;

    return NextResponse.json({
      language: row?.language || 'en',
      theme: row?.theme || 'light',
      userKey,
    });
  } catch (error) {
    console.error('Failed to get preferences:', error);
    // Graceful fallback: return English default without breaking
    return NextResponse.json({ language: 'en', theme: 'light' });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const userKey = await getUserKey(req);
    const body = await req.json().catch(() => ({}));
    const { language, theme } = body;

    const validLang = language === 'id' ? 'id' : 'en';

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id SERIAL PRIMARY KEY,
        user_key TEXT UNIQUE NOT NULL,
        language TEXT NOT NULL DEFAULT 'en',
        theme TEXT DEFAULT 'light',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run().catch(() => {});

    await db.prepare(`
      INSERT INTO user_preferences (user_key, language, theme, updated_at)
      VALUES (?, ?, ?, NOW())
      ON CONFLICT(user_key) DO UPDATE SET
        language = EXCLUDED.language,
        theme = COALESCE(EXCLUDED.theme, user_preferences.theme),
        updated_at = NOW()
    `).run(userKey, validLang, theme || null);

    const res = NextResponse.json({ success: true, language: validLang, userKey });
    res.cookies.set('qastudio_lang', validLang, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
    });
    return res;
  } catch (error) {
    console.error('Failed to save preferences:', error);
    // Handle error safely per Requirement 3.7
    return NextResponse.json({ success: false, error: 'Database save failed' }, { status: 500 });
  }
}
