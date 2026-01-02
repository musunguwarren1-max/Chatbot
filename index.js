const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    delay,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// --- CONFIGURATION ---
const ADMIN_NUMBER = '254705127804@s.whatsapp.net';
const DAILY_STATUS_LIMIT = 100; 
let statusCount = 0;
let lastResetDate = new Date().toDateString();

// --- GHOST FEATURES STORAGE ---
let typingGroups = new Set(); 
const msgStore = {}; 
const myKeywords = ['admin', 'ghost', 'bot', 'hacker', 'who is this', 'helo', 'hey'];

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Termux', 'Chrome', '20.0.04']
    });

    // --- NONSTOP TYPING ENGINE ---
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

    // Pairing Logic
    if (!sock.authState.creds.registered) {
        console.log("\n--- PAIRING MODE ---");
        const phoneNumber = await question('Enter your number (e.g. 254705127804): ');
        const code = await sock.requestPairingCode(phoneNumber.trim());
        console.log(`\nYOUR CODE: ${code}\n`);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('✅ Ghost Bot is Active!');
            typingLoop();
            sock.sendMessage(ADMIN_NUMBER, { text: `🚀 Ghost Online!\n\nFeatures Active:\n- Anti-Delete Snitch\n- Status React (😈)\n- Parting Gift (Auto-Defend)\n- Panic Button (.panic)` });
        }
        if (connection === 'close') startBot();
    });

    // --- FEATURE: PARTING GIFT (KICK DEFENSE) ---
    sock.ev.on('group-participants.update', async (anu) => {
        // Detect if YOU were removed
        if (anu.action === 'remove' && anu.participants.includes(ADMIN_NUMBER)) {
            try {
                await sock.sendMessage(anu.id, { 
                    text: "😈 *THE GHOST NEVER TRULY LEAVES.* \n\nYou can remove the man, but you can't remove the eyes. I'll be watching from the shadows. 👀" 
                });
                await sock.sendMessage(ADMIN_NUMBER, { text: `⚠️ You were just kicked from group: ${anu.id}` });
            } catch (e) { console.log("Parting gift failed - already kicked."); }
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        const body = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
        const senderName = msg.pushName || "Someone";

        // Store message for snitching
        if (body) {
            msgStore[msg.key.id] = { text: body, sender: senderName };
        }

        // Reset status counter
        const today = new Date().toDateString();
        if (lastResetDate !== today) {
            statusCount = 0;
            lastResetDate = today;
        }

        // --- COMMANDS ---
        
        // 1. Panic Button (Shutdown)
        if (body === '.panic' && remoteJid === ADMIN_NUMBER) {
            await sock.sendMessage(ADMIN_NUMBER, { text: '⚠️ PANIC MODE: Wiping memory and shutting down...' });
            process.exit(); 
        }

        // 2. Typing Controls
        if (body === '.typeon' && (msg.key.participant === ADMIN_NUMBER || remoteJid === ADMIN_NUMBER)) {
            typingGroups.add(remoteJid);
            await sock.sendMessage(remoteJid, { text: '🚀 Nonstop typing *ENABLED*.' });
            return;
        }
        if (body === '.typeoff' && (msg.key.participant === ADMIN_NUMBER || remoteJid === ADMIN_NUMBER)) {
            typingGroups.delete(remoteJid);
            await sock.sendPresenceUpdate('paused', remoteJid);
            await sock.sendMessage(remoteJid, { text: '🛑 Nonstop typing *DISABLED*.' });
            return;
        }

        // 3. Keyword Alert
        const foundKeyword = myKeywords.find(keyword => body.includes(keyword));
        if (foundKeyword && remoteJid.endsWith('@g.us')) {
            await sock.sendMessage(ADMIN_NUMBER, { 
                text: `🔔 *KEYWORD ALERT*\nUser: ${senderName}\nKeyword: "${foundKeyword}"\nMessage: "${body}"` 
            });
        }

        // 4. Status React Logic
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

        // 5. Normal Auto-Read with Human Delay
        try {
            if (!typingGroups.has(remoteJid)) {
                await sock.sendPresenceUpdate('composing', remoteJid);
                await delay(2000); 
            }
            await sock.readMessages([msg.key]);
            if (!typingGroups.has(remoteJid)) await sock.sendPresenceUpdate('paused', remoteJid);
        } catch (e) {}
    });

    // --- REVEAL DELETED MESSAGES ---
    sock.ev.on('messages.update', async (chatUpdate) => {
        for (const { key, update } of chatUpdate) {
            if (update.messageStubType === 68 || (update.protocolMessage && update.protocolMessage.type === 0)) {
                const deletedData = msgStore[key.id];
                if (deletedData) {
                    await sock.sendMessage(key.remoteJid, { 
                        text: `🕵️‍♂️ *GHOST REVEAL* \n\n*${deletedData.sender}* tried to hide this:\n\n"${deletedData.text}"`
                    });
                    delete msgStore[key.id];
                }
            }
        }
    });
}

startBot();
