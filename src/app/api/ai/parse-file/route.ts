import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

// Parse uploaded files and extract text content
export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    let extractedText = '';
    let method = '';

    if (ext === 'txt' || ext === 'md' || ext === 'csv' || ext === 'html') {
      extractedText = buffer.toString('utf-8');
      method = 'text';
    } else if (ext === 'docx') {
      try {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
        method = 'docx';
      } catch {
        return NextResponse.json({ error: 'Failed to process DOCX file. Ensure mammoth is installed.' }, { status: 422 });
      }
    } else if (ext === 'pdf') {
      try {
        const pdfParseModule = await import('pdf-parse');
        type PdfParseFn = (buf: Buffer) => Promise<{ text: string }>;
        const pdfParse: PdfParseFn = (pdfParseModule as { default?: PdfParseFn }).default || (pdfParseModule as unknown as PdfParseFn);
        const data = await pdfParse(buffer);
        extractedText = data.text;
        method = 'pdf';
      } catch {
        return NextResponse.json({ error: 'Failed to process PDF file.' }, { status: 422 });
      }
    } else if (ext === 'xlsx' || ext === 'xls') {
      try {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheets: string[] = workbook.SheetNames;
        const sheetName = sheets[0]; // Use first sheet
        const sheet = workbook.Sheets[sheetName];
        extractedText = XLSX.utils.sheet_to_csv(sheet);
        method = 'xlsx';
      } catch {
        return NextResponse.json({ error: 'Failed to process Excel file.' }, { status: 422 });
      }
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext || '')) {
      // Use Gemini Vision API for image OCR
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return NextResponse.json({
          error: 'AI_NOT_CONFIGURED',
          message: 'GEMINI_API_KEY is required to process images'
        }, { status: 503 });
      }

      const base64 = buffer.toString('base64');
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Extract all text from this image. Preserve the original formatting as much as possible. If this is a requirement document, table, or screenshot, extract all text content.' },
              { inlineData: { mimeType, data: base64 } }
            ]
          }]
        })
      });

      if (!response.ok) {
        return NextResponse.json({ error: 'Failed to process image with AI' }, { status: 502 });
      }

      const aiResp = await response.json();
      extractedText = aiResp.candidates?.[0]?.content?.parts?.[0]?.text || '';
      method = 'ocr_vision';
    } else {
      return NextResponse.json({
        error: `File format .${ext} is not supported. Supported formats: TXT, DOCX, PDF, XLSX, XLS, CSV, PNG, JPG, JPEG`
      }, { status: 415 });
    }

    if (!extractedText.trim()) {
      return NextResponse.json({ error: 'Unable to extract text from this file' }, { status: 422 });
    }

    return NextResponse.json({
      text: extractedText,
      method,
      filename: file.name,
      size: buffer.length,
    });
  } catch (error) {
    console.error('File parse error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
