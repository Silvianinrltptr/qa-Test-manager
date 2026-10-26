export interface TestCaseTranslateInput {
  title: string;
  preconditions?: string | null;
  test_steps?: string | null;
  test_data?: string | null;
  expected_result?: string | null;
}

export interface TestCaseTranslateOutput {
  title: string;
  preconditions: string;
  test_steps: string;
  test_data: string;
  expected_result: string;
}

export interface TranslationResult {
  success: boolean;
  translated?: TestCaseTranslateOutput;
  provider?: 'deepseek' | 'gemini';
  error?: string;
}

export async function translateTestCase(
  input: TestCaseTranslateInput,
  targetLang: 'id' | 'en' = 'id'
): Promise<TranslationResult> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!deepseekKey && !geminiKey) {
    return {
      success: false,
      error: 'No translation AI service configured. Please configure DEEPSEEK_API_KEY or GEMINI_API_KEY in .env.local.'
    };
  }

  const langName = targetLang === 'id' ? 'Bahasa Indonesia' : 'English';
  const prompt = `You are an expert QA Engineering translator.
Translate the following software test case fields into ${langName}.

CRITICAL RULES:
1. Preserve technical terms verbatim (e.g., API, HTTP, 200, 404, JWT, Bearer token, payload, status code, login, logout, URL, query param, database, JSON, boolean, null, validation, form, modal).
2. Preserve test logic, sequence order, step numbering (e.g. "1. ", "2. "), test IDs, and placeholders (e.g. {{user}}, {email}).
3. Translate user actions, UI labels in context, preconditions, steps, and expected outcomes accurately and naturally using professional QA standards in ${langName}.
4. Return ONLY a valid JSON object with the following exact keys:
{
  "title": "translated title",
  "preconditions": "translated preconditions or empty string",
  "test_steps": "translated test steps or empty string",
  "test_data": "translated test data or empty string",
  "expected_result": "translated expected result or empty string"
}

Test Case Content to Translate:
Title: ${input.title || ''}
Preconditions: ${input.preconditions || ''}
Test Steps: ${input.test_steps || ''}
Test Data: ${input.test_data || ''}
Expected Result: ${input.expected_result || ''}`;

  // Try DeepSeek first
  if (deepseekKey) {
    try {
      const res = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${deepseekKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'You are an accurate technical QA translator. Output ONLY a valid JSON object without markdown fences or additional commentary.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 2048
        })
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = parseJsonContent(content);
          if (parsed && parsed.title) {
            return {
              success: true,
              provider: 'deepseek',
              translated: {
                title: String(parsed.title || input.title),
                preconditions: String(parsed.preconditions || input.preconditions || ''),
                test_steps: String(parsed.test_steps || input.test_steps || ''),
                test_data: String(parsed.test_data || input.test_data || ''),
                expected_result: String(parsed.expected_result || input.expected_result || '')
              }
            };
          }
        }
      } else {
        const errText = await res.text();
        console.warn('DeepSeek translation API responded with non-200:', res.status, errText);
      }
    } catch (e: any) {
      console.warn('DeepSeek translation fetch failed:', e.message);
    }
  }

  // Fallback to Gemini if DeepSeek unavailable or failed
  if (geminiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json'
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          const parsed = parseJsonContent(content);
          if (parsed && parsed.title) {
            return {
              success: true,
              provider: 'gemini',
              translated: {
                title: String(parsed.title || input.title),
                preconditions: String(parsed.preconditions || input.preconditions || ''),
                test_steps: String(parsed.test_steps || input.test_steps || ''),
                test_data: String(parsed.test_data || input.test_data || ''),
                expected_result: String(parsed.expected_result || input.expected_result || '')
              }
            };
          }
        }
      }
    } catch (e: any) {
      console.warn('Gemini translation fetch failed:', e.message);
    }
  }

  return {
    success: false,
    error: 'AI translation service failed or unavailable. Please check API keys and connectivity.'
  };
}

function parseJsonContent(text: string): Record<string, unknown> | null {
  try {
    let clean = text.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

/**
 * Accurately and reliably checks if a given text is in Indonesian.
 */
export function isIndonesianText(text?: string | null): boolean {
  if (!text || typeof text !== 'string') return false;
  const sample = text.slice(0, 500);
  return /\b(dan|yang|di|ke|dari|untuk|pada|dengan|adalah|berhasil|pengguna|halaman|pilih|klik|buka|masukkan|tampilkan|tidak|bisa|dapat|saat|akun|kata\s*sandi|periksa|jika|sesuai|peringatan|bidang|wajib)\b/i.test(sample);
}

export interface TranslationRecord {
  id?: number;
  testCaseId?: number;
  test_case_id?: number;
  language: string;
  title?: string | null;
  preconditions?: string | null;
  testSteps?: string | null;
  test_steps?: string | null;
  testData?: string | null;
  test_data?: string | null;
  expectedResult?: string | null;
  expected_result?: string | null;
  reviewed?: boolean;
}

export interface ResolvedTestCaseFields {
  title: string;
  preconditions: string | null;
  test_steps: string | null;
  test_data: string | null;
  expected_result: string | null;
  original_title: string;
  original_preconditions: string | null;
  original_test_steps: string | null;
  original_test_data: string | null;
  original_expected_result: string | null;
  source_language: 'id' | 'en';
  display_language: 'id' | 'en';
  has_translation: boolean;
  translation_reviewed: boolean;
}

/**
 * Resolves whether to return the original or translated test case content
 * based on the user's selected language ('en' | 'id'), regardless of what language
 * the test case was originally written or generated in.
 */
export function resolveTestCaseLanguageContent(
  rawTestCase: {
    title: string;
    preconditions?: string | null;
    test_steps?: string | null;
    testSteps?: string | null;
    test_data?: string | null;
    testData?: string | null;
    expected_result?: string | null;
    expectedResult?: string | null;
  },
  translations: TranslationRecord[] | { en?: TranslationRecord | null; id?: TranslationRecord | null },
  targetLang: string = 'en'
): ResolvedTestCaseFields {
  const normLang: 'id' | 'en' = targetLang === 'id' ? 'id' : 'en';

  const enTrans: TranslationRecord | undefined = Array.isArray(translations)
    ? translations.find(t => t.language === 'en')
    : translations.en ?? undefined;

  const idTrans: TranslationRecord | undefined = Array.isArray(translations)
    ? translations.find(t => t.language === 'id')
    : translations.id ?? undefined;

  const rawTitle = rawTestCase.title || '';
  const rawPre = rawTestCase.preconditions ?? null;
  const rawSteps = rawTestCase.test_steps ?? rawTestCase.testSteps ?? null;
  const rawData = rawTestCase.test_data ?? rawTestCase.testData ?? null;
  const rawExpected = rawTestCase.expected_result ?? rawTestCase.expectedResult ?? null;

  // Determine source language of raw testCase
  // If id translation exists and has identical title to raw while en translation exists with different title, raw is ID.
  // Or check if rawTitle contains characteristic Indonesian words.
  let isRawId = isIndonesianText(rawTitle) || isIndonesianText(rawSteps) || isIndonesianText(rawExpected);
  if (!isRawId && idTrans && idTrans.title === rawTitle && enTrans && enTrans.title !== rawTitle) {
    isRawId = true;
  }
  const sourceLang: 'id' | 'en' = isRawId ? 'id' : 'en';

  if (normLang === 'en') {
    if (sourceLang === 'en') {
      // Raw is English, so use raw
      return {
        title: rawTitle,
        preconditions: rawPre,
        test_steps: rawSteps,
        test_data: rawData,
        expected_result: rawExpected,
        original_title: rawTitle,
        original_preconditions: rawPre,
        original_test_steps: rawSteps,
        original_test_data: rawData,
        original_expected_result: rawExpected,
        source_language: 'en',
        display_language: 'en',
        has_translation: Boolean(idTrans),
        translation_reviewed: Boolean(enTrans?.reviewed ?? true),
      };
    } else {
      // Raw is Indonesian, so return English translation if available, else fallback
      const hasEn = Boolean(enTrans && enTrans.title);
      return {
        title: hasEn ? (enTrans!.title || rawTitle) : rawTitle,
        preconditions: hasEn ? (enTrans!.preconditions ?? (enTrans as any)!.preconditions ?? rawPre) : rawPre,
        test_steps: hasEn ? (enTrans!.test_steps ?? enTrans!.testSteps ?? rawSteps) : rawSteps,
        test_data: hasEn ? (enTrans!.test_data ?? enTrans!.testData ?? rawData) : rawData,
        expected_result: hasEn ? (enTrans!.expected_result ?? enTrans!.expectedResult ?? rawExpected) : rawExpected,
        original_title: rawTitle,
        original_preconditions: rawPre,
        original_test_steps: rawSteps,
        original_test_data: rawData,
        original_expected_result: rawExpected,
        source_language: 'id',
        display_language: 'en',
        has_translation: hasEn,
        translation_reviewed: Boolean(enTrans?.reviewed),
      };
    }
  } else {
    // normLang === 'id'
    if (sourceLang === 'id') {
      // Raw is Indonesian, so use raw (or id translation if cleaner)
      return {
        title: (idTrans?.title) || rawTitle,
        preconditions: (idTrans?.preconditions ?? idTrans?.preconditions) ?? rawPre,
        test_steps: (idTrans?.test_steps ?? idTrans?.testSteps) ?? rawSteps,
        test_data: (idTrans?.test_data ?? idTrans?.testData) ?? rawData,
        expected_result: (idTrans?.expected_result ?? idTrans?.expectedResult) ?? rawExpected,
        original_title: rawTitle,
        original_preconditions: rawPre,
        original_test_steps: rawSteps,
        original_test_data: rawData,
        original_expected_result: rawExpected,
        source_language: 'id',
        display_language: 'id',
        has_translation: Boolean(enTrans),
        translation_reviewed: Boolean(idTrans?.reviewed ?? true),
      };
    } else {
      // Raw is English, so return Indonesian translation if available, else fallback
      const hasId = Boolean(idTrans && idTrans.title);
      return {
        title: hasId ? (idTrans!.title || rawTitle) : rawTitle,
        preconditions: hasId ? (idTrans!.preconditions ?? (idTrans as any)!.preconditions ?? rawPre) : rawPre,
        test_steps: hasId ? (idTrans!.test_steps ?? idTrans!.testSteps ?? rawSteps) : rawSteps,
        test_data: hasId ? (idTrans!.test_data ?? idTrans!.testData ?? rawData) : rawData,
        expected_result: hasId ? (idTrans!.expected_result ?? idTrans!.expectedResult ?? rawExpected) : rawExpected,
        original_title: rawTitle,
        original_preconditions: rawPre,
        original_test_steps: rawSteps,
        original_test_data: rawData,
        original_expected_result: rawExpected,
        source_language: 'en',
        display_language: 'id',
        has_translation: hasId,
        translation_reviewed: Boolean(idTrans?.reviewed),
      };
    }
  }
}

