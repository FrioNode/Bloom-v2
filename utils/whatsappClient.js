const { default: makeWASocket, fetchLatestBaileysVersion, DisconnectReason, useMultiFileAuthState } = require('baileys');
const setup = require('../colors/setup');
const { log } = require('./logger');
const mess = require('../colors/mess');
const { bloomCmd, initCommandHandler, startReminderChecker, initializeTicTacToe } = require('../bloom/brain');
const rotationManager = require('./rotationManager');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const MAX_RETRIES = 10;
// Connection state tracker
const connectionStates = new Map();

async function start(instanceConfig, options = {}) {
    const sessionDir = path.join(__dirname, '..', instanceConfig.sessionDir);
    const credsPath = path.join(sessionDir, 'creds.json');

    // Initialize connection state
    if (!connectionStates.has(instanceConfig.id)) {
        connectionStates.set(instanceConfig.id, {
            attempts: 0,
            lastAttempt: 0,
            active: false
        });
    }

    const state = connectionStates.get(instanceConfig.id);

    // Check if already connecting
    if (state.active) {
        log(`⚠️ ${instanceConfig.id} is already connecting`);
        return;
    }

    state.active = true;
    state.attempts++;
    state.lastAttempt = Date.now();

    try {
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        const { state: authState, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version, isLatest } = await fetchLatestBaileysVersion();
        log(`${setup.botname} (${instanceConfig.id}) on Baileys V${version.join('.')}, Is latest?: ${isLatest}`);

        const Bloom = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            browser: ["Bloom", "Safari", "3.3"],
            auth: authState,
            printQRInTerminal: false,
            getMessage: async (key) => {
                return { conversation: `> ${setup.botname} WhatsApp Automation` };
            }
        });

        Bloom._instanceId = instanceConfig.id;

        // Connection state handler
        Bloom.ev.on('connection.update', async (update) => {
            const { qr, connection, lastDisconnect } = update;

            if (qr && options.onQR) await options.onQR(qr);

            if (connection === 'open') {
                state.attempts = 0;
                log(`✅ Connected (${instanceConfig.id})`);

                try {
                    await Promise.all([
                        initCommandHandler(Bloom),
                                      startReminderChecker(Bloom),
                                      initializeTicTacToe(Bloom),
                                      require('../bloom/base/games')._autoStartGame(Bloom)
                    ].map(p => p.catch(e => log(`⚠️ Init error:`, e))));

                    if (options.onSuccess) options.onSuccess();
                    await sendStartupMessage(Bloom, instanceConfig);
                } catch (error) {
                    log(`❌ Init failed:`, error);
                }
            }

            if (connection === 'close') {
                state.active = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                log(`❌ Disconnected (${instanceConfig.id}): ${statusCode}`);

                if (statusCode === DisconnectReason.loggedOut) {
                    log(`🚫 Logged out`);
                    if (options.onError) options.onError(new Error('Logged out'));
                    return;
                }

                if (state.attempts >= MAX_RETRIES) {
                    log(`🛑 Max retries reached`);
                    return;
                }

                const delay = Math.min(5000 * Math.pow(2, state.attempts), 60000);
                setTimeout(() => !state.active && start(instanceConfig, options), delay);
            }
        });

        // Creds and message handlers
        Bloom.ev.on('creds.update', creds => {
            saveCreds(creds).catch(e => log('❌ Creds save failed:', e));
        });
        Bloom.ev.on('messages.upsert', handleMessages(Bloom, instanceConfig));

        return {
            instance: Bloom,
            shutdown: async () => {
                state.active = false;
                await Bloom.end();
                log(`🛑 ${instanceConfig.id} shut down successfully`);
            }
        };

    } catch (error) {
        state.active = false;
        log(`💥 Critical error in ${instanceConfig.id}:`, error);
        if (options.onError) options.onError(error);

        // Retry with backoff
        const delay = Math.min(5000 * state.attempts, 60000);
        setTimeout(() => start(instanceConfig, options), delay);
    }
}

// Helper function for startup message
async function sendStartupMessage(Bloom, instanceConfig) {
    try {
        const activeInstance = await rotationManager.getCurrentActiveInstance();
        if (instanceConfig.id !== activeInstance) return;

        const instanceSettings = setup.instances[activeInstance]; // Fixed shadowing
        const logschat = instanceSettings?.logschat || setup.bloomchat;

        if (!logschat || !setup.image) return;

        await Bloom.sendMessage(logschat, {
            image: { url: setup.image },
            caption: mess.bloom || '',
            contextInfo: {
                    isForwarded: true,
                    forwardingScore: 0,
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
            });
        }
 catch (error) {
    log('❌ Startup failed:', error);
}
}
// Message handler factory
function handleMessages(Bloom, instanceConfig) {
    return async ({ messages }) => {
        try {
            const message = messages[0];
            if (!message || message.key?.fromMe || message.key?.remoteJid === 'status@broadcast') return;

            await bloomCmd(Bloom, message);
        } catch (error) {
            log(`📨 Message handling error in ${instanceConfig.id}:`, error);
        }
    };
}

module.exports = { start };
