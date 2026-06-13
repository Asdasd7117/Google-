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

// دالة EMA دقيقة
function EMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
        ema = (data[i] - ema) * k + ema;
    }
    return ema;
}

// دالة فحص التقاطع (المنطق المصحح)
async function checkSymbol(symbol) {
    try {
        const formatted = symbol.replace("USDT", "/USDT");
        const ohlcv = await exchange.fetchOHLCV(formatted, "1h", undefined, 60);
        
        if (ohlcv.length < 50) return;

        // استخراج الإغلاقات
        const closes = ohlcv.map(c => c[4]);
        
        // حساب القيم للشمعة قبل الأخيرة (سابقاً)
        const prevCloses = closes.slice(0, -1);
        const ema5Prev = EMA(prevCloses.slice(-25), 5);
        const ema25Prev = EMA(prevCloses.slice(-25), 25);
        
        // حساب القيم للشمعة الأخيرة المغلقة (حالياً)
        const currCloses = closes;
        const ema5Curr = EMA(currCloses.slice(-25), 5);
        const ema25Curr = EMA(currCloses.slice(-25), 25);

        // شرط التقاطع الذهبي: كان تحت وأصبح فوق
        const wasBullish = ema5Prev > ema25Prev;
        const isBullish = ema5Curr > ema25Curr;

        if (!wasBullish && isBullish) {
            await bot.sendMessage(CHAT_ID, `🟢 GOLDEN CROSS DETECTED\n\nCOIN: ${symbol}\nEMA5 > EMA25 (Confirmed)\nTime: ${new Date().toLocaleString()}`);
            console.log("CROSS DETECTED:", symbol);
        }
    } catch (e) {
        // تجاهل الخطأ
    }
}

// دالة التشغيل المجزأ
async function runScan(start, end) {
    try {
        const tickers = await exchange.fetchTickers();
        const allSymbols = Object.keys(tickers)
            .filter(s => s.endsWith("/USDT"))
            .filter(s => tickers[s].last && tickers[s].last <= 5)
            .sort((a, b) => (tickers[b].quoteVolume || 0) - (tickers[a].quoteVolume || 0))
            .slice(start, end);

        console.log(`Scanning ${allSymbols.length} symbols (Index ${start} to ${end})...`);

        const CHUNK_SIZE = 10;
        for (let i = 0; i < allSymbols.length; i += CHUNK_SIZE) {
            const chunk = allSymbols.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(s => checkSymbol(s.replace("/", ""))));
            await sleep(500);
        }
    } catch (e) {
        console.log("Error during scan:", e.message);
    }
}

// المجدول الرئيسي
setInterval(async () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    if (currentHour !== lastProcessedHour) {
        if (currentMinute === 0) {
            console.log("Min 0: Running Batch 1");
            await runScan(0, 200);
        } else if (currentMinute === 1) {
            console.log("Min 1: Running Batch 2");
            await runScan(200, 400);
        } else if (currentMinute === 2) {
            console.log("Min 2: Running Batch 3");
            await runScan(400, 600);
            lastProcessedHour = currentHour; // التحديث هنا لإنهاء الدورة
        }
    }
}, 60000);
