const http = require('http');
http.createServer((req, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);

const ccxt = require("ccxt");
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "8648255240:AAHCuaLQSHmBoXM9j5AhH8cmHUpjr69p2YY";
const CHAT_ID = "6814152338";
const bot = new TelegramBot(TOKEN);

const exchange = new ccxt.kucoin({ enableRateLimit: true });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let lastProcessedHour = -1;

function EMA(data, period) {
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
        const ohlcv = await exchange.fetchOHLCV(formatted, "1h", undefined, 100);
        
        if (ohlcv.length < 50) return;

        const closes = ohlcv.map(c => c[4]);
        
        const prevCloses = closes.slice(0, -1);
        const currCloses = closes;

        const ema5Prev = EMA(prevCloses.slice(-50), 5);
        const ema25Prev = EMA(prevCloses.slice(-50), 25);
        
        const ema5Curr = EMA(currCloses.slice(-50), 5);
        const ema25Curr = EMA(currCloses.slice(-50), 25);

        const wasBullish = ema5Prev > ema25Prev;
        const isBullish = ema5Curr > ema25Curr;

        if (!wasBullish && isBullish) {
            const message = `🟢 GOLDEN CROSS
━━━━━━━━━━━━
💰 COIN: ${symbol}
📈 EMA5: ${ema5Curr.toFixed(8)}
📉 EMA25: ${ema25Curr.toFixed(8)}
📊 Gap: ${(ema5Curr - ema25Curr).toFixed(8)}
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
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    if (currentHour !== lastProcessedHour) {
        if (currentMinute === 0) {
            await runScan(0, 200);
        } else if (currentMinute === 1) {
            await runScan(200, 400);
        } else if (currentMinute === 2) {
            await runScan(400, 600);
            lastProcessedHour = currentHour;
        }
    }
}, 60000);
