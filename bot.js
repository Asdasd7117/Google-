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

// فحص التقاطع
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

        // نستخدم فقط الشموع المغلقة
        const current = closes.slice(0, -1);
        const prev = closes.slice(0, -2);

        const ema7_now = EMA(current.slice(-50), 7);
        const ema25_now = EMA(current.slice(-50), 25);

        const ema7_prev = EMA(prev.slice(-50), 7);
        const ema25_prev = EMA(prev.slice(-50), 25);

        const crossedUp =
            ema7_prev <= ema25_prev &&
            ema7_now > ema25_now;

        // إرسال مرة واحدة فقط
        if (crossedUp && !lastState[symbol]) {
            lastState[symbol] = true;

            await bot.sendMessage(
                CHAT_ID,
                `🟢 EMA CROSS UP CONFIRMED

COIN: ${symbol}
TIMEFRAME: 1H`
            );

            console.log("Signal sent:", symbol);
        }

        // إعادة التفعيل عند انتهاء الاتجاه
        if (!crossedUp) {
            lastState[symbol] = false;
        }

    } catch (e) {
        console.log(symbol, "error:", e.message);
    }
}

// تشغيل البوت
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
