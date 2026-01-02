const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

// Temporary memory to catch deleted messages without crashing the server
const msgStore = new Map(); 

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Ghost-Cloud', 'Chrome', '3.0'],
        // CRITICAL: Stop syncing old chats to save RAM
        shouldSyncHistoryMessage: () => false, 
        getMessage: async (key) => {
            if (msgStore.has(key.id)) return { conversation: msgStore.get(key.id).text };
            return { noContextInfo: true };
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('✅ Ghost Bot is Back & Fully Armed!');
            sock.sendMessage('254705127804@s.whatsapp.net', { text: "💀 *Ghost Bot Re-Activated:* All commands and Snitch mode are LIVE." });
        }
        if (connection === 'close') startBot();
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const remoteJid = msg.key.remoteJid;
        const body = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
        const senderName = msg.pushName || "User";

        // 1. STORE FOR SNITCH (Limits to 50 messages to save RAM)
        if (body) {
            msgStore.set(msg.key.id, { text: body, sender: senderName });
            if (msgStore.size > 50) {
                const firstKey = msgStore.keys().next().value;
                msgStore.delete(firstKey);
            }
        }

        // 2. AUTO STATUS VIEW
        if (remoteJid === 'status@broadcast') {
            await sock.readMessages([msg.key]);
            await sock.sendMessage(remoteJid, { react: { key: msg.key, text: '🕵️‍♂️' } }, { statusJidList: [msg.key.participant] });
            return;
        }

        // 3. COMMANDS
        if (body === '.alive') {
            await sock.sendMessage(remoteJid, { text: "👻 *I am lurking in the cloud...* \nStatus: 24/7 Online" });
        }
        
        if (body === '.menu') {
            await sock.sendMessage(remoteJid, { text: "💀 *GHOST COMMANDS* \n\n1. .alive - Check status\n2. .ping - Check speed\n3. Auto-Status - Always ON\n4. Anti-Delete - Always ON" });
        }

        if (body === '.ping') {
            await sock.sendMessage(remoteJid, { text: "🚀 *Pong!* Ghost is flying." });
        }
    });

    // 4. THE SNITCH (Deleted Message Recovery)
    sock.ev.on('messages.update', async (chatUpdate) => {
        for (const { key, update } of chatUpdate) {
            if (update.messageStubType === 68 || (update.protocolMessage && update.protocolMessage.type === 0)) {
                const deletedData = msgStore.get(key.id);
                if (deletedData) {
                    await sock.sendMessage(key.remoteJid, { 
                        text: `🕵️‍♂️ *GHOST REVEAL* \n\n*${deletedData.sender}* tried to hide: \n"${deletedData.text}"` 
                    });
                }
            }
        }
    });
}

startBot();
