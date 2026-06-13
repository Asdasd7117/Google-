const http = require('http');
http.createServer((req, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);

const ccxt = require("ccxt");
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "8648255240:AAHCuaLQSHmBoXM9j5AhH8cmHUpjr69p2YY";
const CHAT_ID = "6814152338";

const bot = new TelegramBot(TOKEN);

// KuCoin exchange
const exchange = new ccxt.kucoin({
    enableRateLimit: true
});

let lastState = {};

// EMA function
function EMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];

    for (let i = 1; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
    }

    return ema;
}

// جلب العملات
async function getSymbols() {
    try {
        const tickers = await exchange.fetchTickers();

        const symbols = Object.keys(tickers)
            .filter(s => s.endsWith("/USDT"))
            .filter(s => tickers[s].last && tickers[s].last < 10)
            .sort((a, b) =>
                (tickers[b].quoteVolume || 0) - (tickers[a].quoteVolume || 0)
            )
            .slice(0, 200)
            .map(s => s.replace("/", ""));

        console.log(`Symbols found: ${symbols.length}`);

        return symbols;
    } catch (e) {
        console.log("getSymbols error:", e.message);
        return [];
    }
}

// فحص EMA لحظي (Live Cross)
async function checkSymbol(symbol) {
    try {
        const formatted = symbol.replace("USDT", "/USDT");

        const ohlcv = await exchange.fetchOHLCV(
            formatted,
            "1h",
            undefined,
            100
        );

        const closes = ohlcv.map(c => c[4]);

        if (closes.length < 60) return;

        // EMA الحالي
        const ema7 = EMA(closes.slice(-50), 7);
        const ema25 = EMA(closes.slice(-50), 25);

        const isBullish = ema7 > ema25;

        const prevState = lastState[symbol];

        // أول مرة فقط
        if (prevState === undefined) {
            lastState[symbol] = isBullish;
            return;
        }

        // 🟢 تقاطع للأعلى (فوري)
        if (!prevState && isBullish) {
            lastState[symbol] = true;

            await bot.sendMessage(
                CHAT_ID,
                `🟢 LIVE EMA CROSS UP

COIN: ${symbol}
TIMEFRAME: 1H`
            );

            console.log("CROSS UP:", symbol);
        }

        // 🔴 رجوع للأسفل لإعادة التفعيل
        if (prevState && !isBullish) {
            lastState[symbol] = false;

            console.log("RESET:", symbol);
        }

    } catch (e) {
        console.log(symbol, "error:", e.message);
    }
}

// تشغيل الفحص
async function run() {
    console.log("Scan started:", new Date().toLocaleString());

    const symbols = await getSymbols();

    for (const s of symbols) {
        await checkSymbol(s);
    }

    console.log("Scan finished");
}

// تشغيل كل دقيقة
setInterval(run, 60000);
run();
