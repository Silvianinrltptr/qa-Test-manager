import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { module_id, feature_id, requirement_text, session_id } = body;

    if (!requirement_text?.trim()) {
      return NextResponse.json({ error: 'Teks requirement tidak boleh kosong' }, { status: 400 });
    }

    // Check if Gemini API key is configured
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        error: 'AI_NOT_CONFIGURED',
        message: 'GEMINI_API_KEY belum dikonfigurasi. Lihat pengaturan untuk instruksi setup.',
        setupInstructions: [
          '1. Dapatkan API key dari https://aistudio.google.com/apikey',
          '2. Buat file .env.local di root project',
          '3. Tambahkan: GEMINI_API_KEY=your-key-here',
          '4. Restart server development'
        ]
      }, { status: 503 });
    }

    // Fetch module/feature info for context
    const module = module_id ? db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(module_id)) as { name: string; prefix: string } : null;
    const feature = feature_id ? db.prepare('SELECT * FROM features WHERE id = ?').get(Number(feature_id)) as { name: string } : null;

    const systemPrompt = `Kamu adalah QA Engineer senior yang bertugas membuat test case dari requirement.
Hasilkan test case yang komprehensif mencakup: positive, negative, boundary, validation, permission, dan scenario lainnya.

ATURAN PENTING:
- Jangan buat expected result yang ambigu
- Jika requirement tidak jelas, tandai di field "notes" 
- Jangan membuat asumsi tentang business rules yang tidak disebutkan
- Hasilkan HANYA JSON yang valid, tidak ada teks lain

Format output (JSON array):
[
  {
    "title": "string - judul singkat test case",
    "test_type": "functional|regression|smoke|boundary|negative|validation|permission|integration|uat|performance|other",
    "preconditions": "kondisi awal yang diperlukan",
    "test_steps": "langkah-langkah tes (pisahkan dengan \\n1. 2. 3.)",
    "test_data": "data yang digunakan untuk testing",
    "expected_result": "hasil yang diharapkan secara spesifik",
    "priority": "low|medium|high|critical",
    "notes": "catatan jika ada requirement yang ambigu"
  }
]`;

    const userPrompt = `Modul: ${module?.name || 'Unknown'}
Fitur: ${feature?.name || 'Unknown'}

Requirement:
${requirement_text}

Buat test case yang komprehensif untuk requirement di atas.`;

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

    const draftsWithDupeCheck = drafts.map((draft: any) => {
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
