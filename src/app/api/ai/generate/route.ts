import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const body = await req.json();
    const { module_id, feature_id, requirement_text, session_id } = body;

    if (!requirement_text?.trim()) {
      return NextResponse.json({ error: 'Requirement text cannot be empty' }, { status: 400 });
    }

    // Check if Gemini API key is configured
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: 'AI_NOT_CONFIGURED',
        message: 'GEMINI_API_KEY is not configured. See settings for setup instructions.',
        setupInstructions: [
          '1. Get an API key from https://aistudio.google.com/apikey',
          '2. Create a .env.local file in the project root',
          '3. Add: GEMINI_API_KEY=your-key-here',
          '4. Restart the development server'
        ]
      }, { status: 503 });
    }

    // Fetch module/feature info for context
    const moduleData = module_id ? db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(module_id)) as { name: string; prefix: string } : null;
    const feature = feature_id ? db.prepare('SELECT * FROM features WHERE id = ?').get(Number(feature_id)) as { name: string } : null;

    const systemPrompt = `You are a senior QA Engineer tasked with creating test cases from requirements.
Generate comprehensive test cases covering: positive, negative, boundary, validation, permission, and other relevant scenarios.

IMPORTANT RULES:
- Do not write ambiguous expected results
- If the requirement is unclear, note it in the "notes" field
- Do not make assumptions about unstated business rules
- Output ONLY valid JSON, with no other text

Output format (JSON array):
[
  {
    "title": "string - concise test case title",
    "test_type": "functional|regression|smoke|boundary|negative|validation|permission|integration|uat|performance|other",
    "preconditions": "initial conditions required",
    "test_steps": "test steps (separate with \\n1. 2. 3.)",
    "test_data": "data used for testing",
    "expected_result": "specific expected result",
    "priority": "low|medium|high|critical",
    "notes": "notes if requirement is ambiguous"
  }
]`;

    const userPrompt = `Module: ${moduleData?.name || 'Unknown'}
Feature: ${feature?.name || 'Unknown'}

Requirement:
${requirement_text}

Generate comprehensive test cases for the requirement above.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return NextResponse.json({ error: 'AI API error', details: errText }, { status: 502 });
    }

    const aiResponse = await response.json();
    const textContent = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 502 });
    }

    // Parse JSON from response
    let drafts;
    try {
      // Extract JSON array from text (may have markdown code fences)
      const jsonMatch = textContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found');
      drafts = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response', raw: textContent }, { status: 502 });
    }

    // Check for duplicates against existing test cases
    const existingCases = db.prepare(`
      SELECT title, test_type FROM test_cases 
      WHERE module_id = ? AND feature_id = ? AND lifecycle_status = 'active'
    `).all(Number(module_id), Number(feature_id)) as { title: string; test_type: string }[];

    interface AiDraftItem {
      title?: string;
      test_type?: string;
      preconditions?: string;
      test_steps?: string;
      test_data?: string;
      expected_result?: string;
      priority?: string;
      notes?: string;
      [key: string]: unknown;
    }

    const draftsWithDupeCheck = (drafts as AiDraftItem[]).map((draft: AiDraftItem) => {
      const isDuplicate = existingCases.some(
        ec => ec.title.toLowerCase().trim() === draft.title?.toLowerCase()?.trim()
      );
      return { ...draft, module_id, feature_id, isDuplicate, duplicateOf: isDuplicate ? 'existing' : null, selected: !isDuplicate };
    });

    // Save session in DB
    if (session_id) {
      db.prepare(`
        INSERT INTO ai_drafts (session_id, module_id, feature_id, draft_data, status)
        VALUES (?, ?, ?, ?, 'pending')
      `).run(session_id, Number(module_id), Number(feature_id), JSON.stringify(draftsWithDupeCheck));
    }

    return NextResponse.json({ drafts: draftsWithDupeCheck, totalGenerated: drafts.length });
  } catch (error) {
    console.error('AI generate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
