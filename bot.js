const http = require('http');
http.createServer((req, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);

const ccxt = require("ccxt");
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "8648255240:AAHCuaLQSHmBoXM9j5AhH8cmHUpjr69p2YY";
const CHAT_ID = "6814152338";

const bot = new TelegramBot(TOKEN);
bot.deleteWebHook();

// رسالة تأكيد العمل
bot.sendMessage(CHAT_ID, "🚀 البوت يعمل الآن.. تم ضبط فلتر RSI ليكون بين 1 و 40.").catch(err => console.log("Startup Error:", err.message));

const exchange = new ccxt.kucoin({ enableRateLimit: true });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let lastProcessedHour = -1;
const alertedSymbols = new Set();

function EMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
        ema = (data[i] - ema) * k + ema;
    }
    return ema;
}

// دالة حساب RSI
function getRSI(closes, period = 14) {
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[closes.length - i] - closes[closes.length - i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

async function checkSymbol(symbol) {
    try {
        const ohlcv = await exchange.fetchOHLCV(symbol, "1h", undefined, 100);
        if (ohlcv.length < 50) return;

        const lastCandle = ohlcv[ohlcv.length - 2];
        const open = lastCandle[1];
        const close = lastCandle[4];
        
        const closedCandles = ohlcv.slice(0, -1);
        const closes = closedCandles.map(c => c[4]);
        const volumes = closedCandles.map(c => c[5]);

        const currentVolume = volumes[volumes.length - 1];
        const avgVolume = volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
        
        const ema5Curr = EMA(closes.slice(-50), 5);
        const ema25Curr = EMA(closes.slice(-50), 25);
        const ema5Prev = EMA(closes.slice(-51, -1), 5);
        const ema25Prev = EMA(closes.slice(-51, -1), 25);

        // الحسابات
        const rsi = getRSI(closes);
        const wasBullish = ema5Prev > ema25Prev;
        const isBullish = ema5Curr > ema25Curr;
        const volumeStrong = currentVolume > avgVolume * 1.2; 
        const isGreen = close > open; 
        const isOverextended = close > (ema5Curr * 1.05);
        
        // الفلتر الجديد: RSI يجب أن يكون بين 1 و 40
        const isRsiValid = rsi >= 1 && rsi <= 40; 

        // شرط التنبيه
        if (!wasBullish && isBullish && volumeStrong && isGreen && !isOverextended && isRsiValid) {
            
            if (alertedSymbols.has(symbol)) return;

            const volumeRatio = (currentVolume / avgVolume).toFixed(2);
            const message = `🟢 GOLDEN CROSS DETECTED
━━━━━━━━━━━━
💰 COIN: ${symbol}

📈 EMA5: ${ema5Curr.toFixed(8)}
📉 EMA25: ${ema25Curr.toFixed(8)}

🔥 Volume Ratio: ${volumeRatio}x
📊 RSI: ${rsi.toFixed(2)}
💎 Status: OVERSOLD REBOUND
⏰ Time: ${new Date().toLocaleString()}`;

            await bot.sendMessage(CHAT_ID, message);
            alertedSymbols.add(symbol);
        }
    } catch (e) {
        // خطأ صامت
    }
}

async function runScan(start, end) {
    try {
        const tickers = await exchange.fetchTickers();
        const allSymbols = Object.keys(tickers)
            .filter(s => s.endsWith("/USDT"))
            .filter(s => tickers[s].last && tickers[s].last <= 5)
            .sort((a, b) => (tickers[b].quoteVolume || 0) - (tickers[a].quoteVolume || 0))
            .slice(start, end);

        console.log(`--- Scanning batch: ${start} to ${end} ---`);
        for (let i = 0; i < allSymbols.length; i += 10) {
            const chunk = allSymbols.slice(i, i + 10);
            await Promise.all(chunk.map(s => checkSymbol(s)));
            await sleep(1000); 
        }
    } catch (e) {
        console.log("Scanner Error:", e.message);
    }
}

setInterval(async () => {
    const now = new Date();
    const currentHour = now.getHours();
    
    if (currentHour !== lastProcessedHour) {
        alertedSymbols.clear();
        lastProcessedHour = currentHour;
    }

    const minutes = now.getMinutes();
    // الفحص كل 5 دقائق
    if (minutes % 5 === 0) { 
        if (minutes === 0) await runScan(0, 200);
        else if (minutes === 5) await runScan(200, 400);
        else if (minutes === 10) await runScan(400, 600);
    }
}, 60000);
