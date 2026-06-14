const http = require('http');
http.createServer((req, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);

const ccxt = require("ccxt");
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "8648255240:AAHCuaLQSHmBoXM9j5AhH8cmHUpjr69p2YY";
const CHAT_ID = "6814152338";
const bot = new TelegramBot(TOKEN);

const exchange = new ccxt.kucoin({ enableRateLimit: true });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let lastProcessedMinute = -1;

async function checkSymbol(symbol) {
    try {
        const formatted = symbol.replace("USDT", "/USDT");
        const ohlcv = await exchange.fetchOHLCV(formatted, "15m", undefined, 96);
        
        if (ohlcv.length < 24) return;

        const prices = ohlcv.map(c => c[4]);
        const highs = ohlcv.map(c => c[2]);
        const volumes = ohlcv.map(c => c[5]);

        const currentPrice = prices[prices.length - 1];
        const last24hHighs = highs.slice(0, -1);
        const highestPrice = Math.max(...last24hHighs);
        
        const currentVolume = volumes[volumes.length - 1];
        const avgVolume = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / 95;

        const isTooLate = currentPrice > (highestPrice * 1.015);

        if (currentPrice > highestPrice && currentVolume > (avgVolume * 2) && !isTooLate) {
            const message = `⚡ FAST BREAKOUT
━━━━━━━━━━━━
💰 COIN: ${symbol}
📈 Price: ${currentPrice.toFixed(8)}
🔝 24h High: ${highestPrice.toFixed(8)}
📊 Vol Spike: ${(currentVolume / avgVolume).toFixed(2)}x
⏰ Time: ${new Date().toLocaleString()}`;

            await bot.sendMessage(CHAT_ID, message);
        }
    } catch (e) {}
}

async function runScan(start, end) {
    try {
        const tickers = await exchange.fetchTickers();
        const allSymbols = Object.keys(tickers)
            .filter(s => s.endsWith("/USDT"))
            .filter(s => tickers[s].last && tickers[s].last <= 5)
            .sort((a, b) => (tickers[b].quoteVolume || 0) - (tickers[a].quoteVolume || 0))
            .slice(start, end);

        const CHUNK_SIZE = 10;
        for (let i = 0; i < allSymbols.length; i += CHUNK_SIZE) {
            const chunk = allSymbols.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(s => checkSymbol(s.replace("/", ""))));
            await sleep(500); 
        }
    } catch (e) {}
}

setInterval(async () => {
    const now = new Date();
    const m = now.getMinutes();

    if (m % 5 === 0 && m !== lastProcessedMinute) {
        const slot = m / 5;
        const start = slot * 50;
        const end = start + 50;
        
        await runScan(start, end);
        lastProcessedMinute = m;
    }
}, 60000);
