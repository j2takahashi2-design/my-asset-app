// Netlify Function: サーバーサイドで株価を取得（CORSなし）
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const sym = event.queryStringParameters?.sym;
  if (!sym) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'sym required' }) };
  }

  // 仮想通貨: CRYPTO:coinId 形式で受け取る
  if (sym.startsWith('CRYPTO:')) {
    const coinId = sym.replace('CRYPTO:', '').toLowerCase();
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=jpy`,
        { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const data = await res.json();
        const keys = Object.keys(data);
        if (keys.length > 0) {
          const priceJpy = data[keys[0]].jpy;
          return { statusCode: 200, headers, body: JSON.stringify({ price: priceJpy, name: keys[0] }) };
        }
      }
    } catch (e) {}
    return { statusCode: 404, headers, body: JSON.stringify({ error: '仮想通貨取得失敗' }) };
  }

  try {
    const urls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Referer': 'https://finance.yahoo.com/',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) continue;
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;

        if (meta?.regularMarketPrice > 0) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              price: meta.regularMarketPrice,
              name: meta.shortName || meta.longName || sym,
              currency: meta.currency || 'JPY',
              previousClose: meta.chartPreviousClose || meta.regularMarketPreviousClose,
            }),
          };
        }
      } catch {}
    }

    // 決算日取得
    if (event.queryStringParameters?.earnings === '1') {
      try {
        const earnUrl = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${encodeURIComponent(sym)}?modules=calendarEvents`;
        const res = await fetch(earnUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Referer': 'https://finance.yahoo.com/' },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const d = await res.json();
          const dates = d?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate;
          if (dates?.length) {
            const earningsDate = new Date(dates[0].raw * 1000).toISOString().slice(0, 10);
            return { statusCode: 200, headers, body: JSON.stringify({ earningsDate }) };
          }
        }
      } catch {}
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: '株価取得失敗', sym }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
