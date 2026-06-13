const http = require('http');
http.createServer((req, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);

const ccxt = require("ccxt");
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "8648255240:AAHCuaLQSHmBoXM9j5AhH8cmHUpjr69p2YY";
const CHAT_ID = "6814152338";
const bot = new TelegramBot(TOKEN);

const exchange = new ccxt.kucoin({ enableRateLimit: true });
let lastProcessedHour = -1; // لمنع التكرار داخل نفس الساعة

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function EMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];
    for (let i = 1; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
    }
    return ema;
}

async function checkSymbol(symbol) {
    try {
        const formatted = symbol.replace("USDT", "/USDT");
        // جلب الشموع (الساعة)
        const ohlcv = await exchange.fetchOHLCV(formatted, "1h", undefined, 50);
        
        // نأخذ الشموع المغلقة فقط (استبعاد الحالية)
        const closes = ohlcv.slice(0, -1).map(c => c[4]);
        if (closes.length < 30) return;

        // حساب التقاطع للشموع المغلقة
        const prevCloses = closes.slice(0, -1); // الشمعة قبل الأخيرة
        const currCloses = closes; // آخر شمعة أغلقت

        const isBullishPrev = EMA(prevCloses.slice(-25), 5) > EMA(prevCloses.slice(-25), 25);
        const isBullishCurr = EMA(currCloses.slice(-25), 5) > EMA(currCloses.slice(-25), 25);

        // إذا حدث التقاطع للتو (كان تحت وصار فوق)
        if (!isBullishPrev && isBullishCurr) {
            await bot.sendMessage(CHAT_ID, `🟢 EMA CROSS UP (Confirmed)\n\nCOIN: ${symbol}\nTime: ${new Date().toLocaleString()}`);
            console.log("CROSS UP:", symbol);
        }
    } catch (e) {
        console.log("Error checking", symbol, e.message);
    }
}

async function runBatchedScan() {
    console.log("Fetching all symbols...");
    try {
        const tickers = await exchange.fetchTickers();
        const allSymbols = Object.keys(tickers)
            .filter(s => s.endsWith("/USDT"))
            .filter(s => tickers[s].last && tickers[s].last <= 5)
            .sort((a, b) => (tickers[b].quoteVolume || 0) - (tickers[a].quoteVolume || 0))
            .slice(0, 600)
            .map(s => s.replace("/", ""));

        // تقسيم لـ 3 مجموعات (200 لكل مجموعة)
        const batch1 = allSymbols.slice(0, 200);
        const batch2 = allSymbols.slice(200, 400);
        const batch3 = allSymbols.slice(400, 600);

        const batches = [batch1, batch2, batch3];

        // تنفيذ المجموعات
        for (let i = 0; i < batches.length; i++) {
            console.log(`Starting Batch ${i + 1} with ${batches[i].length} symbols`);
            for (const symbol of batches[i]) {
                await checkSymbol(symbol);
                await sleep(300); // 💡 تأخير 300ms ضروري جداً
            }
        }
        console.log("All batches finished.");
    } catch (e) {
        console.log("Global error:", e.message);
    }
}

// مراقبة الوقت كل دقيقة
setInterval(() => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // التحقق: هل نحن في بداية الساعة (الدقيقة 0) والساعة تغيرت؟
    if (currentMinute === 0 && currentHour !== lastProcessedHour) {
        lastProcessedHour = currentHour;
        runBatchedScan();
    }
}, 60000);
