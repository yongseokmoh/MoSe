import { NextResponse } from 'next/server';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import DOMPurify from 'isomorphic-dompurify';

async function translateHtmlWithDeepSeek(html: string): Promise<string> {
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  if (!DEEPSEEK_API_KEY) throw new Error('DEEPSEEK_API_KEY is not set');
  
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + DEEPSEEK_API_KEY
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "You are an expert translator. Translate the following HTML content into perfect Korean, preserving all HTML tags and structure exactly as they are. DO NOT output anything outside the HTML structure. Only return the translated HTML." },
        { role: "user", content: html }
      ]
    })
  });
  
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const translate = searchParams.get('translate') === 'true';

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch article: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    const doc = new JSDOM(html, { url });
    
    // Remove scripts and styles for cleaner fallback
    doc.window.document.querySelectorAll('script, style, noscript, iframe, nav, footer, header').forEach(el => el.remove());

    const reader = new Readability(doc.window.document);
    const article = reader.parse();

    let cleanHtml = '';
    let title = doc.window.document.title || '기사 읽기';

    if (article && article.content) {
      cleanHtml = DOMPurify.sanitize(article.content);
      title = article.title || title;
    } else {
      // Fallback: extract all p, div, span, and heading tags that contain substantial text
      const elements = Array.from(doc.window.document.querySelectorAll('p, div, span, h1, h2, h3, h4'));
      const textBlocks = elements
        .map(el => el.textContent?.trim())
        .filter(t => t && t.length > 30);
      
      if (textBlocks.length > 0) {
        const uniqueBlocks = Array.from(new Set(textBlocks));
        cleanHtml = DOMPurify.sanitize(uniqueBlocks.map(t => `<p>${t}</p>`).join(''));
      } else {
        const bodyText = doc.window.document.body?.textContent?.trim() || '';
        if (bodyText.length > 50) {
          cleanHtml = DOMPurify.sanitize(`<p>${bodyText.substring(0, 3000)}...</p>`);
        } else {
          cleanHtml = `<p style="padding: 15px; background: #f3f4f6; color: #4b5563; border-radius: 8px;"><strong>본문을 직접 추출할 수 없는 구조의 페이지입니다. (보안 정책 등) 하단의 원문 링크를 통해 확인해 주세요.</strong></p>`;
        }
      }
    }

    if (translate && cleanHtml) {
      try {
        let translated = await translateHtmlWithDeepSeek(cleanHtml);
        cleanHtml = translated.replace(/^```html\s*/i, '').replace(/\s*```$/i, '');
      } catch (err: any) {
        console.error('Translation failed:', err.message);
        cleanHtml = `<div style="margin-bottom: 20px; padding: 15px; background-color: #fee2e2; color: #991b1b; border-radius: 8px; font-weight: bold;">번역에 실패하여 원문을 제공합니다.</div>${cleanHtml}`;
      }
    }

    return NextResponse.json({
      title: title,
      content: cleanHtml,
      siteName: article?.siteName || '',
    });
  } catch (error: any) {
    console.error('Readability Error:', error.message);
    return NextResponse.json({ error: error.message || 'Failed to parse article' }, { status: 500 });
  }
}
