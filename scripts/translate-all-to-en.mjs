import { PrismaClient } from '@prisma/client';
import { translateTestCase } from '../src/lib/translation.ts';

const prisma = new PrismaClient();

// Reliable helper to detect if a text is Indonesian
export function isIndonesian(text) {
  if (!text) return false;
  return /\b(dan|yang|di|ke|dari|untuk|pada|dengan|adalah|berhasil|pengguna|halaman|pilih|klik|buka|masukkan|tampilkan|tidak|bisa|dapat|saat|akun|kata\s*sandi|periksa|jika|sesuai)\b/i.test(text);
}

async function main() {
  console.log('--- Generating Full English & Indonesian Translations ---');

  const allCases = await prisma.testCase.findMany({
    orderBy: { id: 'asc' }
  });

  const existingTranslations = await prisma.testCaseTranslation.findMany();
  const transMap = new Map(); // key: `${testCaseId}_${language}`
  for (const t of existingTranslations) {
    transMap.set(`${t.testCaseId}_${t.language}`, t);
  }

  console.log(`Total test cases: ${allCases.length}`);

  let enAdded = 0;
  let idAdded = 0;

  for (const tc of allCases) {
    const isIdSource = isIndonesian(tc.title);

    // 1. Ensure 'id' translation exists
    if (!transMap.has(`${tc.id}_id`)) {
      if (isIdSource) {
        // Source is Indonesian, mirror directly
        await prisma.testCaseTranslation.create({
          data: {
            testCaseId: tc.id,
            language: 'id',
            title: tc.title,
            preconditions: tc.preconditions,
            testSteps: tc.testSteps,
            testData: tc.testData,
            expectedResult: tc.expectedResult,
            reviewed: true,
          }
        });
        idAdded++;
      } else {
        // Source is English, translate to Indonesian
        console.log(`Translating TC #${tc.id} (${tc.caseId}) to ID...`);
        const res = await translateTestCase({
          title: tc.title,
          preconditions: tc.preconditions,
          test_steps: tc.testSteps,
          test_data: tc.testData,
          expected_result: tc.expectedResult
        }, 'id');
        if (res.success && res.translated) {
          await prisma.testCaseTranslation.create({
            data: {
              testCaseId: tc.id,
              language: 'id',
              title: res.translated.title,
              preconditions: res.translated.preconditions,
              testSteps: res.translated.test_steps,
              testData: res.translated.test_data,
              expectedResult: res.translated.expected_result,
              reviewed: false,
            }
          });
          idAdded++;
        }
      }
    }

    // 2. Ensure 'en' translation exists
    if (!transMap.has(`${tc.id}_en`)) {
      if (!isIdSource) {
        // Source is already English, mirror directly
        await prisma.testCaseTranslation.create({
          data: {
            testCaseId: tc.id,
            language: 'en',
            title: tc.title,
            preconditions: tc.preconditions,
            testSteps: tc.testSteps,
            testData: tc.testData,
            expectedResult: tc.expectedResult,
            reviewed: true,
          }
        });
        enAdded++;
        console.log(`TC #${tc.id} (${tc.caseId}) mirrored English source`);
      } else {
        // Source is Indonesian, translate to English
        console.log(`Translating TC #${tc.id} (${tc.caseId}) to EN...`);
        const res = await translateTestCase({
          title: tc.title,
          preconditions: tc.preconditions,
          test_steps: tc.testSteps,
          test_data: tc.testData,
          expected_result: tc.expectedResult
        }, 'en');
        if (res.success && res.translated) {
          await prisma.testCaseTranslation.create({
            data: {
              testCaseId: tc.id,
              language: 'en',
              title: res.translated.title,
              preconditions: res.translated.preconditions,
              testSteps: res.translated.test_steps,
              testData: res.translated.test_data,
              expectedResult: res.translated.expected_result,
              reviewed: false,
            }
          });
          enAdded++;
          console.log(`  -> EN: ${res.translated.title}`);
        } else {
          console.warn(`  Failed TC #${tc.id}: ${res.error}`);
        }
      }
    }
  }

  console.log(`Finished: ${enAdded} EN translations added, ${idAdded} ID translations added.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
