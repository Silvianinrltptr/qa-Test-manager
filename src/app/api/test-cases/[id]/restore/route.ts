import { getDb, prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const { id } = await params;
    const tcId = Number(id);
    if (!tcId || isNaN(tcId)) {
      return NextResponse.json({ error: 'Invalid test case ID' }, { status: 400 });
    }

    const db = getDb();
    const tc = (await db.prepare('SELECT * FROM test_cases WHERE id = ?').get(tcId)) as any;
    if (!tc) {
      return NextResponse.json({ error: 'Test case not found in database' }, { status: 404 });
    }

    if (tc.lifecycle_status === 'active') {
      return NextResponse.json({ error: 'Test case is already active' }, { status: 400 });
    }

    if (tc.lifecycle_status !== 'archived' && tc.lifecycle_status !== 'obsolete') {
      return NextResponse.json({
        error: `Cannot restore test case with lifecycle status "${tc.lifecycle_status}"`
      }, { status: 400 });
    }

    let reason = tc.lifecycle_status === 'obsolete'
      ? 'Restored to Active from Obsolete status via Change Log Recovery'
      : 'Restored to Active from Archived status via Change Log Recovery';

    try {
      const body = await req.json();
      if (body && body.reason) reason = body.reason;
    } catch {}

    const oldLifecycle = tc.lifecycle_status;

    // Execute atomic transaction via Prisma
    await prisma.$transaction(async (tx) => {
      // 1. Update test case lifecycle status to active without touching test data, ID, or results
      await tx.testCase.update({
        where: { id: tcId },
        data: {
          lifecycleStatus: 'active',
          updatedAt: new Date(),
        }
      });

      // 2. Insert new change log entry documenting the restoration
      await tx.changeLog.create({
        data: {
          entityType: 'test_case',
          entityId: tcId,
          entityRef: tc.case_id,
          changeType: 'restored',
          changedFields: 'lifecycle_status',
          oldValues: JSON.stringify({ lifecycle_status: oldLifecycle }),
          newValues: JSON.stringify({ lifecycle_status: 'active' }),
          reason,
        }
      });

      // 3. Insert activity log entry
      await tx.activityLog.create({
        data: {
          action: 'restored',
          entityType: 'test_case',
          entityId: tcId,
          entityRef: tc.case_id,
          description: `Test case "${tc.title}" (${tc.case_id}) restored from ${oldLifecycle} to active`,
        }
      });
    });

    // Fetch refreshed test case record
    const updatedTc = (await db.prepare(`
      SELECT tc.*, m.name as module_name, f.name as feature_name
      FROM test_cases tc
      LEFT JOIN modules m ON m.id = tc.module_id
      LEFT JOIN features f ON f.id = tc.feature_id
      WHERE tc.id = ?
    `).get(tcId)) as any;

    return NextResponse.json({
      success: true,
      message: `Test case ${tc.case_id} successfully restored to Active`,
      testCase: updatedTc,
    });
  } catch (error) {
    console.error('Failed to restore test case:', error);
    return NextResponse.json({ error: 'Internal server error restoring test case' }, { status: 500 });
  }
}
