const http = require('http');
http.createServer((req, res) => res.end('Bot is running')).listen(process.env.PORT || 3000);

const ccxt = require("ccxt");
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";
const CHAT_ID = "YOUR_CHAT_ID";

const bot = new TelegramBot(TOKEN);
const exchange = new ccxt.binance();

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
        return Object.keys(tickers)
            .filter(s => s.endsWith("/USDT"))
            .filter(s => tickers[s].last < 5)
            .sort((a, b) => tickers[b].quoteVolume - tickers[a].quoteVolume)
            .slice(0, 30) 
            .map(s => s.replace("/", ""));
    } catch (e) {
        return [];
    }
}

async function checkSymbol(symbol) {
    try {
        const formattedSymbol = symbol.replace("USDT", "/USDT");
        const ohlcv = await exchange.fetchOHLCV(formattedSymbol, "1h", undefined, 50);
        const closes = ohlcv.map(c => c[4]);

        const ema7 = EMA(closes.slice(-20), 7);
        const ema25 = EMA(closes.slice(-50), 25);
        const prevEma7 = EMA(closes.slice(-21, -1), 7);
        const prevEma25 = EMA(closes.slice(-21, -1), 25);

        const crossedUp = prevEma7 <= prevEma25 && ema7 > ema25;

        if (crossedUp) {
            if (!lastState[symbol]) {
                lastState[symbol] = true;
                bot.sendMessage(CHAT_ID, `🟢 EMA CROSS UP\nCOIN: ${symbol}\nTIMEFRAME: 1H`);
            }
        } else {
            lastState[symbol] = false;
        }
    } catch (e) {}
}

async function run() {
    const symbols = await getSymbols();
    for (let s of symbols) {
        await checkSymbol(s);
    }
}

setInterval(run, 60000);
run();
