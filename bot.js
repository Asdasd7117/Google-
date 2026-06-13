const http = require('http');
http.createServer((req, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);

const ccxt = require("ccxt");
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "ضع_التوكن_الجديد_هنا";
const CHAT_ID = "6814152338";

const bot = new TelegramBot(TOKEN);

// Bybit بدلاً من Binance
const exchange = new ccxt.bybit({
    enableRateLimit: true
});

let lastState = {};

function EMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];

    for (let i = 1; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
    }

    return ema;
}

async function getSymbols() {
    try {
        const tickers = await exchange.fetchTickers();

        const symbols = Object.keys(tickers)
            .filter(s => s.endsWith("/USDT"))
            .filter(s => tickers[s].last && tickers[s].last < 5)
            .sort((a, b) => (tickers[b].quoteVolume || 0) - (tickers[a].quoteVolume || 0))
            .slice(0, 300);

        console.log(`Found ${symbols.length} symbols`);

        return symbols;
    } catch (e) {
        console.log("getSymbols error:", e.message);
        return [];
    }
}

async function checkSymbol(symbol) {
    try {
        const ohlcv = await exchange.fetchOHLCV(symbol, "1h", undefined, 100);

        const closes = ohlcv.map(c => c[4]);

        if (closes.length < 60) return;

        const previousCloses = closes.slice(0, -1);

        const ema7Prev = EMA(previousCloses.slice(-50), 7);
        const ema25Prev = EMA(previousCloses.slice(-50), 25);

        const ema7Now = EMA(closes.slice(-50), 7);
        const ema25Now = EMA(closes.slice(-50), 25);

        const crossedUp =
            ema7Prev <= ema25Prev &&
            ema7Now > ema25Now;

        if (crossedUp && !lastState[symbol]) {
            lastState[symbol] = true;

            await bot.sendMessage(
                CHAT_ID,
                `🟢 EMA7 CROSS EMA25 UP\n\nCOIN: ${symbol}\nTIMEFRAME: 1H`
            );

            console.log(`Signal sent: ${symbol}`);
        }

        if (!crossedUp) {
            lastState[symbol] = false;
        }

    } catch (e) {
        console.log(`${symbol}: ${e.message}`);
    }
}

async function run() {
    console.log(`Scan started: ${new Date().toLocaleString()}`);

    const symbols = await getSymbols();

    for (const symbol of symbols) {
        await checkSymbol(symbol);
    }

    console.log("Scan finished");
}

setInterval(run, 60000);
run();
