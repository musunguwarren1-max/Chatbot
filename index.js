const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

const ADMIN_NUMBER = '254705127804@s.whatsapp.net';
const DAILY_STATUS_LIMIT = 100; 
let statusCount = 0;
let lastResetDate = new Date().toDateString();

let typingGroups = new Set(); 
const msgStore = {}; 
const myKeywords = ['admin', 'ghost', 'bot', 'hacker', 'who is this'];

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Termux', 'Chrome', '20.0.04'],
        // --- KOYEB RAM OPTIMIZATION ---
        shouldSyncHistoryMessage: () => false, // Prevents RAM crashes
        linkPreviewImageThumbnailWidth: 192,
        markOnlineOnConnect: true
    });

    async function typingLoop() {
        while (true) {
            if (typingGroups.size > 0) {
                for (const jid of typingGroups) {
                    try { await sock.sendPresenceUpdate('composing', jid); } catch (e) {}
                }
            }
            await delay(15000); 
        }
    }

    if (!sock.authState.creds.registered) {
        console.log("\n--- PAIRING MODE ---");
        const phoneNumber = await question('Enter your number: ');
        const code = await sock.requestPairingCode(phoneNumber.trim());
        console.log(`\nYOUR CODE: ${code}\n`);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('✅ Ghost Bot is Active!');
            typingLoop();
            sock.sendMessage(ADMIN_NUMBER, { text: `🚀 Ghost Online (Cloud Mode)` });
        }
        if (connection === 'close') startBot();
    });

    // --- PARTING GIFT (AUTO-DEFEND) ---
    sock.ev.on('group-participants.update', async (anu) => {
        if (anu.action === 'remove' && anu.participants.includes(ADMIN_NUMBER)) {
            try {
                await sock.sendMessage(anu.id, { 
                    text: "😈 *THE GHOST NEVER TRULY LEAVES.* \n\nYou can remove the man, but you can't remove the eyes. 👀" 
                });
            } catch (e) {}
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        const body = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
        const senderName = msg.pushName || "Someone";

        if (body) msgStore[msg.key.id] = { text: body, sender: senderName };

        // Panic Button
        if (body === '.panic' && remoteJid === ADMIN_NUMBER) {
            await sock.sendMessage(ADMIN_NUMBER, { text: '⚠️ SHUTTING DOWN...' });
            process.exit(); 
        }

        // Status View
        if (remoteJid === 'status@broadcast') {
            if (statusCount < DAILY_STATUS_LIMIT) {
                try {
                    await sock.readMessages([msg.key]);
                    await sock.sendMessage(remoteJid, { react: { key: msg.key, text: '😈' } }, { statusJidList: [msg.key.participant] });
                    statusCount++;
                } catch (e) {}
            }
            return;
        }

        // Auto-Read
        try {
            await sock.readMessages([msg.key]);
        } catch (e) {}
    });

    sock.ev.on('messages.update', async (chatUpdate) => {
        for (const { key, update } of chatUpdate) {
            if (update.messageStubType === 68 || (update.protocolMessage && update.protocolMessage.type === 0)) {
                const deletedData = msgStore[key.id];
                if (deletedData) {
                    await sock.sendMessage(key.remoteJid, { text: `🕵️‍♂️ *GHOST REVEAL* \n\n*${deletedData.sender}*: "${deletedData.text}"` });
                }
            }
        }
    });
}

startBot();
