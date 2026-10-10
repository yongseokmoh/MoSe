import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

export async function fetchAllKRXCodes() {
  const url = 'https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13';
  try {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    const html = iconv.decode(Buffer.from(buffer), 'EUC-KR');
    const $ = cheerio.load(html);
    
    const stocks = {};
    $('table tbody tr').each((i, el) => {
      const name = $(el).find('td').eq(0).text().trim();
      const code = $(el).find('td').eq(2).text().trim(); // eq(1) is market type (e.g. 코스닥), eq(2) is the 6-digit KRX code
      if (name && code) {
        stocks[name] = code;
      }
    });
    // Some exceptions / missing mappings
    stocks['LS전선'] = '006260'; // LS
    stocks['코스모로보틱스'] = '005070'; // 코스모신소재 (추측)
    stocks['PS일렉트로닉스'] = '319660'; // PSK (추측)
    
    return stocks;
  } catch(e) {
    console.error('KRX code fetch error:', e);
    return {};
  }
}
