const { default: makeWASocket, fetchLatestBaileysVersion, DisconnectReason, useMultiFileAuthState } = require('baileys');
const setup = require('../colors/setup');
const { log } = require('./logger');
const mess = require('../colors/mess');
const { bloomCmd, initCommandHandler, startReminderChecker, initializeTicTacToe } = require('../bloom/brain');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

async function start(instanceConfig, options = {}) {
    const sessionDir = path.join(__dirname, '..', instanceConfig.sessionDir);
    const credsPath = path.join(sessionDir, 'creds.json');

    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true }); 
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        log(`${setup.botname} (${instanceConfig.id}) on Baileys V${version.join('.')}, Is latest ?: ${isLatest}`);

        const Bloom = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            browser: ["Bloom", "Safari", "3.3"],
            auth: state,
            getMessage: async (key) => {
                if (store) { 
                    const msg = await store.loadMessage(key.remoteJid, key.id);
                    return msg?.message || undefined; 
                } 
                return { conversation: `${setup.botname} for whatsapp Automation` };  
            } 
        });

        Bloom._instanceId = instanceConfig.id;
        
        Bloom.ev.on('connection.update', async (update) => {
            const { qr, connection, lastDisconnect } = update;

            if (qr) {
                if (options.onQR) {
                    await options.onQR(qr);
                }
            }

            if (connection === 'open') {
                log(`✅ Connected successfully (${instanceConfig.id})`);
                if (options.onSuccess) {
                    options.onSuccess();
                }

                // Initialize command handler and reminder checker
                try {
                    await initCommandHandler(Bloom);
                    log(`✅ Command handler initialized (${instanceConfig.id})`);
                    
                    await startReminderChecker(Bloom);
                    log(`✅ Reminder checker started (${instanceConfig.id})`);

                    await initializeTicTacToe(Bloom);
                    log(`✅ Ticktactoe cleaner started (${instanceConfig.id})`);

                    // Initialize Pokemon game
                    const { _autoStartGame } = require('../bloom/base/games');
                    await _autoStartGame(Bloom);
                    log(`✅ Pokemon game started (${instanceConfig.id})`);
                } catch (error) {
                    log(`❌ Error initializing bot services for ${instanceConfig.id}:`, error);
                }

                // Send payload message for first instance only
                if (instanceConfig.id === 'bot1') {
                    log(`${setup.emoji} ${setup.botname} is now online`);

                    // Get instance-specific logschat
                    const instanceConfig = setup.instances[`bot1`];
                    const logschat = instanceConfig?.logschat || setup.bloomchat;

                    if (!setup.botname || !logschat || !setup.image) {
                        log('⚠️ Missing essential config in colors/setup.js');
                        log('Required: BOT_NAME, LOGS_CHAT/LOGS_CHAT_1, IMAGE');
                        return;
                    }

                    if (mess && mess.bloom && mess.powered) {
                        const Payload = {
                            image: { url: setup.image },
                            caption: mess.bloom,
                            contextInfo: {
                                isForwarded: true,
                                forwardingScore: 2,
                                forwardedNewsletterMessageInfo: {
                                    newsletterJid: setup.channelid,
                                    newsletterName: setup.botname,
                                    serverMessageId: -1,
                                },
                                externalAdReply: {
                                    title: setup.botname,
                                    body: mess.powered,
                                    thumbnailUrl: setup.image,
                                    sourceUrl: setup.channel,
                                    mediaType: 1,
                                    renderLargerThumbnail: false,
                                },
                            },
                        };

                        
                        try {
                            await Bloom.sendMessage(logschat, Payload);
                        } catch (error) {
                            log('❌ Error sending startup message:', error);
                        }
                    }
                }
            }

            if (connection === 'close') {
                log(`❌ Connection closed for ${instanceConfig.id}`);
                const statusCode = lastDisconnect?.error?.output?.statusCode;

                if (statusCode !== DisconnectReason.loggedOut) {
                    if (options.onError) {
                        options.onError(new Error(`Connection closed with status ${statusCode}`));
                    }
                    log(`♻️ Attempting reconnect for ${instanceConfig.id}...`);
                    start(instanceConfig, options);
                } else {
                    console.warn(`🚫 ${instanceConfig.id} has been logged out.`);
                    if (options.onError) {
                        options.onError(new Error('Logged out'));
                    }
                }
            }
        });

        Bloom.ev.on('creds.update', saveCreds);

        // Add message handler
        Bloom.ev.on('messages.upsert', async ({ messages }) => {
            try {
                const message = messages[0];
                if (!message) return;
                
                if (message.key && message.key.remoteJid === 'status@broadcast') return;
                if (message.key.fromMe) return;

                await bloomCmd(Bloom, message);
            } catch (error) {
                log(`Error handling message in ${instanceConfig.id}:`, error);
            }
        });

        return {
            instance: Bloom,
            shutdown: async () => {
                await Bloom.logout();
                log(`Instance ${instanceConfig.id} shut down successfully`);
            }
        };
    } catch (error) {
        log(`Critical Error in instance ${instanceConfig.id}:`, error);
        if (options.onError) {
            options.onError(error);
        }
        throw error;
    }
}

module.exports = { start }; 