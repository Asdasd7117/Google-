const axios = require("axios");
const TelegramBot = require("node-telegram-bot-api");

const TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";
const CHAT_ID = "YOUR_CHAT_ID";

const bot = new TelegramBot(TOKEN);

let lastState = {}; 
// لتجنب تكرار الإشارات

// ================= EMA CALC =================
function EMA(data, period) {
    const k = 2 / (period + 1);
    let ema = data[0];

    for (let i = 1; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
    }

    return ema;
}

// ================= GET COINS =================
async function getSymbols() {
    const res = await axios.get("https://api.binance.com/api/v3/ticker/24hr");

    return res.data
        .filter(c => c.symbol.endsWith("USDT"))
        .filter(c => parseFloat(c.lastPrice) < 5)
        .map(c => c.symbol);
}

// ================= CHECK SYMBOL =================
async function checkSymbol(symbol) {
    try {
        const res = await axios.get(
            `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=50`
        );

        const closes = res.data.map(c => parseFloat(c[4]));

        const ema7 = EMA(closes.slice(-20), 7);
        const ema25 = EMA(closes.slice(-50), 25);

        const prevEma7 = EMA(closes.slice(-21, -1), 7);
        const prevEma25 = EMA(closes.slice(-21, -1), 25);

        const crossedUp = prevEma7 <= prevEma25 && ema7 > ema25;

        if (crossedUp) {
            if (!lastState[symbol]) {
                lastState[symbol] = true;

                bot.sendMessage(
                    CHAT_ID,
                    `🟢 EMA CROSS UP\nCOIN: ${symbol}\nTIMEFRAME: 1H`
                );

                console.log("SENT:", symbol);
            }
        } else {
            // reset so next real cross can trigger again
            lastState[symbol] = false;
        }

    } catch (e) {}
}

// ================= MAIN LOOP =================
async function run() {
    const symbols = await getSymbols();

    console.log("Coins:", symbols.length);

    for (let s of symbols) {
        await checkSymbol(s);
    }
}

setInterval(run, 60 * 1000); // كل دقيقة فحص
run();
