import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const body = await req.json();
    const { module_id, feature_id, requirement_text, session_id, provider = 'gemini', language = 'English' } = body;

    if (!requirement_text?.trim()) {
      return NextResponse.json({ error: 'Requirement text cannot be empty' }, { status: 400 });
    }

    const isIndonesian = typeof language === 'string' && (
      language.toLowerCase().includes('indonesia') || language.toLowerCase() === 'id'
    );
    const selectedLang = isIndonesian ? 'Bahasa Indonesia' : 'English';

    // Fetch module/feature info for context
    const moduleData = module_id ? db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(module_id)) as { name: string; prefix: string } : null;
    const feature = feature_id ? db.prepare('SELECT * FROM features WHERE id = ?').get(Number(feature_id)) as { name: string } : null;

    const languagePrompt = isIndonesian
      ? `LANGUAGE REQUIREMENT: Bahasa Indonesia
- Generate all test case content (title, preconditions, test_steps, test_data, expected_result, notes) primarily in natural, clear Bahasa Indonesia.
- Use natural Indonesian for explanations of business requirements, business rules, expected behavior, calculations, validations, and workflows.
- Keep the following in English when appropriate to improve practical clarity:
  * UI labels and actual button, field, page, and menu names (e.g. "Open the Login page", "Click the Save button", "Enter email in the Email field").
  * Technical terms such as API, endpoint, request, response, payload, session, database, and HTTP status codes.
  * Existing system identifiers and technical terminology.
- Do not force every technical instruction to be translated; prioritize clarity for QA engineers and developers.`
      : `LANGUAGE REQUIREMENT: English
- Generate all test case content (title, preconditions, test_steps, test_data, expected_result, notes) in clear, natural, professional English.
- Use consistent standard QA terminology.
- Avoid unnecessary translations or mixed-language sentences.
- Preserve actual UI labels, technical identifiers, and terminology from the source requirements.`;

    const systemPrompt = `You are a senior QA Engineer tasked with creating test cases from requirements.
Generate comprehensive test cases covering: positive, negative, boundary, validation, permission, and other relevant scenarios.

${languagePrompt}

IMPORTANT RULES:
- Do not write ambiguous expected results
- If the requirement is unclear, note it in the "notes" field
- Do not make assumptions about unstated business rules
- Output ONLY valid JSON, with no other text
- Note that JSON keys ("title", "test_type", "preconditions", "test_steps", "test_data", "expected_result", "priority", "notes") and enum values for "test_type" and "priority" must always remain in English as specified.

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
Requested Language: ${selectedLang}

Requirement:
${requirement_text}

Generate comprehensive test cases for the requirement above in ${selectedLang} following the language rules.`;

    let textContent: string | undefined;

    if (provider === 'deepseek') {
      const apiKey = process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        return NextResponse.json({
          error: 'AI_NOT_CONFIGURED',
          provider: 'deepseek',
          message: 'DEEPSEEK_API_KEY is not configured. See settings for setup instructions.',
          setupInstructions: [
            '1. Get an API key from https://platform.deepseek.com/api_keys',
            '2. Create or update the .env.local file in the project root',
            '3. Add: DEEPSEEK_API_KEY=your-key-here',
            '4. Restart the development server'
          ]
        }, { status: 503 });
      }

      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: 8192,
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('DeepSeek API error:', errText);
        return NextResponse.json({ error: 'DeepSeek API error', details: errText }, { status: 502 });
      }

      const aiResponse = await response.json();
      textContent = aiResponse.choices?.[0]?.message?.content;
    } else {
      // Default to Gemini
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json({
          error: 'AI_NOT_CONFIGURED',
          provider: 'gemini',
          message: 'GEMINI_API_KEY is not configured. See settings for setup instructions.',
          setupInstructions: [
            '1. Get an API key from https://aistudio.google.com/apikey',
            '2. Create a .env.local file in the project root',
            '3. Add: GEMINI_API_KEY=your-key-here',
            '4. Restart the development server'
          ]
        }, { status: 503 });
      }

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
        return NextResponse.json({ error: 'Gemini API error', details: errText }, { status: 502 });
      }

      const aiResponse = await response.json();
      textContent = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    if (!textContent) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 502 });
    }

    // Parse JSON from response with resilience for markdown code fences and truncated completions
    let drafts;
    try {
      const jsonMatch = textContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        drafts = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback for cut-off completions: salvage complete objects up to the last closing brace
        const firstBracket = textContent.indexOf('[');
        const lastBrace = textContent.lastIndexOf('}');
        if (firstBracket !== -1 && lastBrace > firstBracket) {
          const repairedJson = textContent.substring(firstBracket, lastBrace + 1) + '\n]';
          drafts = JSON.parse(repairedJson);
        } else {
          throw new Error('No JSON array found in response');
        }
      }
    } catch {
      try {
        const firstBracket = textContent.indexOf('[');
        const lastBrace = textContent.lastIndexOf('}');
        if (firstBracket !== -1 && lastBrace > firstBracket) {
          const repairedJson = textContent.substring(firstBracket, lastBrace + 1) + '\n]';
          drafts = JSON.parse(repairedJson);
        } else {
          throw new Error('Could not salvage JSON');
        }
      } catch {
        return NextResponse.json({ error: 'Failed to parse AI response', raw: textContent }, { status: 502 });
      }
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
