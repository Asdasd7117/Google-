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

function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
        ema = (data[i] - ema) * k + ema;
    }
    return ema;
}

async function checkSymbol(symbol) {
    try {
        const formatted = symbol.replace("USDT", "/USDT");
        const ohlcv = await exchange.fetchOHLCV(formatted, "15m", undefined, 150);
        
        if (ohlcv.length < 100) return;

        const closes = ohlcv.map(c => c[4]);
        const lows = ohlcv.map(c => c[3]);
        
        const prevCloses = closes.slice(0, -1);
        const currClose = closes[closes.length - 1];
        const prevClose = closes[closes.length - 2];
        const currLow = lows[lows.length - 1];

        const ema99Prev = calculateEMA(prevCloses.slice(-100), 99);
        const ema99Curr = calculateEMA(closes.slice(-100), 99);

        const isBreakout = (prevClose <= ema99Prev) && (currClose > ema99Curr);
        const isBounce = (prevClose > ema99Prev) && (currLow <= ema99Curr) && (currClose > ema99Curr);

        if (isBreakout || isBounce) {
            const type = isBreakout ? "🚀 BREAKOUT" : "🛡️ BOUNCE/SUPPORT";
            const message = `${type} (EMA 99)
━━━━━━━━━━━━
💰 COIN: ${symbol}
📈 Price: ${currClose.toFixed(8)}
⚖️ EMA99: ${ema99Curr.toFixed(8)}
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
