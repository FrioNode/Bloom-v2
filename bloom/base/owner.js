let imports = {};

try {
    imports = {
        createInstanceModels: require('../../colors/schema').createInstanceModels,
        setup: require('../../colors/setup'),
        isBloomKing: require('../../colors/auth').isBloomKing,
        mess: require('../../colors/mess'),
        exec: require('child_process').exec,
        promisify: require('util').promisify,
        fs: require('fs'),
        path: require('path')
    };
} catch (error) {
    console.error('Failed to load required modules:', error);
    process.exit(1);
}

const {
    createInstanceModels,
    setup: { sudochat, bloom },
    isBloomKing,
    mess,
    exec,
    promisify,
    fs,
    path
} = imports;

const execPromise = promisify(exec);
const configPath = path.join(__dirname, '../../colors/config.json');

// Cache for instance models
const instanceModelsCache = new Map();

// Helper function to get models for the current instance
async function getModels(instanceId) {
    if (!instanceModelsCache.has(instanceId)) {
        const models = await createInstanceModels(instanceId);
        instanceModelsCache.set(instanceId, models);
    }
    return instanceModelsCache.get(instanceId);
}

// Helper function to verify owner
function verifyOwner(Bloom, sender, message) {
    return isBloomKing(sender, message) || Bloom.isOwner?.(sender) || sender === sudochat;
}

module.exports = {
    join: {
        type: 'owner',
        desc: 'Make bot join a group',
        usage: 'join <group_link> or <code>',
        run: async (Bloom, message, fulltext) => {
            const remoteJid = message.key.remoteJid;
            const sender = message.key.participant || remoteJid;

            if (sender !== sudochat) {
                return await Bloom.sendMessage(remoteJid, { text: '❌ This command is for the bot owner only.' }, { quoted: message });
            }

            const input = fulltext.split(' ').slice(1).join(' ').trim();
            if (!input) {
                return await Bloom.sendMessage(remoteJid, { text: '❌ Please provide a group invite link or code.' }, { quoted: message });
            }

            // Match link or code
            const match = input.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/) || input.match(/^([a-zA-Z0-9]{20,})$/);
            if (!match) {
                return await Bloom.sendMessage(remoteJid, { text: '❌ Invalid link or code. Please check and try again.' }, { quoted: message });
            }

            const code = match[1];

            try {
                const groupInfo = await Bloom.groupAcceptInvite(code);
                return await Bloom.sendMessage(remoteJid, {
                    text: `✅ Successfully joined group:\n*${groupInfo.subject || 'Unnamed Group'}*`
                }, { quoted: message });
            } catch (err) {
                let reason = '❌ Failed to join group.';

                if (err?.output?.statusCode === 500 && err?.message?.toLowerCase().includes('conflict')) {
                    reason = '⚠️ Bot is already a member of that group.';
                } else if (err?.message?.toLowerCase().includes('not-authorized')) {
                    reason = '❌ Link may be revoked or invalid.';
                }

                console.error('Group Join Error:', err);
                await Bloom.sendMessage(remoteJid, { text: reason }, { quoted: message });
            }
        }
    },
    reboot: {
        type: 'owner',
        desc: 'Reboots the bot.',
        run: async (Bloom, message, fulltext) => {
            const sender = message.key.remoteJid;

            if (!verifyOwner(Bloom, sender, message)) {
                return await Bloom.sendMessage(sender, { text: mess.norestart }, { quoted: message });
            }

            try {
                await Bloom.sendMessage(sender, { text: mess.restarting }, { quoted: message });
                await execPromise(bloom.scripts.restart);
            } catch (err) {
                console.error('Reboot error:', err);
                await Bloom.sendMessage(sender, { text: `❌ Failed to reboot the bot: ${err.message}` }, { quoted: message });
            }
        }
    },
    stop: {
        type: 'owner',
        desc: 'Stops the bot.',
        run: async (Bloom, message, fulltext) => {
            const sender = message.key.remoteJid;

            if (!verifyOwner(Bloom, sender, message)) {
                return await Bloom.sendMessage(sender, { text: mess.norestart }, { quoted: message });
            }

            try {
                // Stopping bot (PM2 process)
                await Bloom.sendMessage(sender, { text: '🛑 Bot has been stopped.' }, { quoted: message });
                await execPromise(bloom.scripts.stop);
            } catch (err) {
                console.error('Stop error:', err);
                await Bloom.sendMessage(sender, { text: `❌ Failed to stop the bot: ${err.message}` }, { quoted: message });
            }
        }
    },
    $: {
        type: 'owner',
        desc: 'Executes a shell command (owner only)',
        run: async (Bloom, message, fulltext) => {
            const sender = message.key.remoteJid;

            if (!verifyOwner(Bloom, sender, message)) {
                return await Bloom.sendMessage(sender, { text: mess.owner || '❌ Unauthorized access.' }, { quoted: message });
            }

            const command = fulltext.trim().split(' ').slice(1).join(' '); // remove "$" from fulltext

            if (!command) {
                return await Bloom.sendMessage(sender, { text: mess.noarg }, { quoted: message });
            }

            try {
                const { stdout, stderr } = await execPromise(command);

                if (stderr) {
                    return await Bloom.sendMessage(sender, {
                        text: `❌ stderr:\n\`\`\`\n${stderr}\n\`\`\``
                    }, { quoted: message });
                }

                const output = stdout.length > 3000
                ? stdout.slice(0, 3000) + '\n... (output truncated)'
                : stdout;

                await Bloom.sendMessage(sender, {
                    text: `✅ Output:\n\`\`\`\n${output}\n\`\`\``
                }, { quoted: message });

            } catch (err) {
                await Bloom.sendMessage(sender, {
                    text: `❌ Error:\n\`\`\`\n${err.message}\n\`\`\``
                }, { quoted: message });
            }
        }
    },
    setxp: {
        run: async (Bloom, message, fulltext) => {
            const sender = message.key.remoteJid;
            if (!verifyOwner(Bloom, sender, message)) {
                return await Bloom.sendMessage(message.key.remoteJid, { text: mess.owner });
            }

            const quotedJid = message.message?.extendedTextMessage?.contextInfo?.participant;
            const parts = fulltext.split(' ').slice(1);
            let targetJid = null;
            let amount = null;

            if (quotedJid) {
                // Format: setxp (quoted user) 1234
                targetJid = quotedJid;
                amount = parseInt(parts[0]);
            } else if (parts.length === 2 && /^\d+$/.test(parts[0])) {
                // Format: setxp 254700000000 1234
                targetJid = parts[0] + "@s.whatsapp.net";
                amount = parseInt(parts[1]);
            }

            if (!targetJid || isNaN(amount)) {
                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: `⚠️ Usage:\n*setxp (quote user) 1234*\nor\n*setxp 254700000000 1234*`
                });
            }

            try {
                const models = await getModels(Bloom._instanceId);
                const { Exp } = models;
                const expData = await Exp.findOneAndUpdate(
                    { jid: targetJid },
                    { $set: { points: amount } },
                    { upsert: true, new: true }
                );

                await Bloom.sendMessage(message.key.remoteJid, {
                    text: `✅ Set XP for @${targetJid.split('@')[0]} to ${amount} points`,
                    mentions: [targetJid]
                });
            } catch (error) {
                console.error('Error in setxp command:', error);
                await Bloom.sendMessage(message.key.remoteJid, {
                    text: '❌ Failed to update XP. Please try again later.'
                });
            }
        },
        type: 'owner',
        desc: 'Set EXP for a user manually',
        usage: '*setxp (quote user) 1234*\nor\n*setxp 254700000000 1234*'
    },
    xpreset: {
        run: async (Bloom, message, fulltext) => {
            const { User } = getModels(Bloom._instanceId);
            const sender = message.key.participant || message.key.remoteJid;
            if (sender !== sudochat) {
                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: "🚫 Only the bot owner can reset EXP."
                });
            }
            const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.participant;
            if (!mentionedJid) {
                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: "❓ Please mention the user whose EXP you want to reset."
                });
            }

            const user = await User.findById(mentionedJid);
            if (!user) {
                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: "⚠️ No user data found."
                });
            }

            user.points = 0;
            user.messageCount = 0;
            user.streak = 0;
            user.lastDaily = null;
            await user.save();

            await Bloom.sendMessage(message.key.remoteJid, {
                text: `🔄 EXP for @${mentionedJid.split('@')[0]} has been reset.`,
                mentions: [mentionedJid]
            });
        },
        type: 'owner',
        desc: 'Reset a user\'s EXP (admin only)'
    },
    set: {
        type: 'owner',
        desc: 'Set config variables in config.json (Owner only)',
        usage: 'set <key> <value>',
        async run(Bloom, message, fulltext) {
            const sender = message.key.participant || message.key.remoteJid;
            const [arg, ...rest] = fulltext.split(' ').slice(1);
            const value = rest.join(' ');

            if (sender !== sudochat) {
                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: mess.owner
                }, { quoted: message });
            }

            if (!arg || !value) {
                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: 'Usage: set <key> <value>'
                }, { quoted: message });
            }

            try {
                const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));

                if (!(arg in configData)) {
                    return await Bloom.sendMessage(message.key.remoteJid, {
                        text: `❌ Key "${arg}" does not exist in config.json.`
                    }, { quoted: message });
                }

                configData[arg] = isNaN(value)
                ? (value === 'true' ? true : value === 'false' ? false : value)
                : Number(value);

                fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));

                await Bloom.sendMessage(sender, {
                    text: `✅ Config updated!\n"${arg}" = ${value}`
                }, { quoted: message });

            } catch (error) {
                console.error('Config update failed:', error);
                await Bloom.sendMessage(message.key.remoteJid, {
                    text: `❌ Failed to update config: ${error.message}`
                }, { quoted: message });
            }
        }
    },
    broadcast: {
        type: 'owner',
        desc: 'Broadcast a message to all registered users',
        run: async (Bloom, message, fulltext) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;
            
            if (!verifyOwner(Bloom, senderID, message)) {
                return await Bloom.sendMessage(message.key.remoteJid, { text: mess.owner }, { quoted: message });
            }

            const broadcastMessage = fulltext.split(' ').slice(1).join(' ');
            if (!broadcastMessage) {
                return await Bloom.sendMessage(message.key.remoteJid, { text: '❌ Please provide a message to broadcast.' }, { quoted: message });
            }

            try {
                const users = await User.find({});
                let successCount = 0;
                let failCount = 0;

                await Bloom.sendMessage(message.key.remoteJid, { text: '📢 Starting broadcast...' }, { quoted: message });

                for (const user of users) {
                    try {
                        await Bloom.sendMessage(user._id, { 
                            text: `📢 *Broadcast Message*\n\n${broadcastMessage}`,
                            contextInfo: { isForwarded: true }
                        });
                        successCount++;
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Delay to prevent spam
                    } catch (err) {
                        failCount++;
                        console.error(`Failed to send broadcast to ${user._id}:`, err);
                    }
                }

                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: `📢 Broadcast completed!\n✅ Success: ${successCount}\n❌ Failed: ${failCount}`
                }, { quoted: message });
            } catch (error) {
                console.error('Broadcast error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { text: '❌ An error occurred while broadcasting.' }, { quoted: message });
            }
        }
    },

    ban: {
        type: 'owner',
        desc: 'Ban a user from using the bot',
        run: async (Bloom, message, fulltext) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;

            if (!verifyOwner(Bloom, senderID, message)) {
                return await Bloom.sendMessage(message.key.remoteJid, { text: mess.owner }, { quoted: message });
            }

            let targetUser = message.message?.extendedTextMessage?.contextInfo?.participant;
            if (!targetUser) {
                const userPhone = fulltext.split(' ')[1];
                if (!userPhone || !/^\d+$/.test(userPhone)) {
                    return await Bloom.sendMessage(message.key.remoteJid, { text: '❌ Please tag a user or provide a valid phone number.' }, { quoted: message });
                }
                targetUser = `${userPhone}@s.whatsapp.net`;
            }

            try {
                let user = await User.findById(targetUser);
                if (!user) {
                    user = new User({ _id: targetUser });
                }

                user.isBanned = true;
                await user.save();

                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: `✅ Successfully banned @${targetUser.split('@')[0]} from using the bot.`,
                    mentions: [targetUser]
                }, { quoted: message });
            } catch (error) {
                console.error('Ban error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { text: '❌ An error occurred while banning the user.' }, { quoted: message });
            }
        }
    },

    unban: {
        type: 'owner',
        desc: 'Unban a user from the bot',
        run: async (Bloom, message, fulltext) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;

            if (!verifyOwner(Bloom, senderID, message)) {
                return await Bloom.sendMessage(message.key.remoteJid, { text: mess.owner }, { quoted: message });
            }

            let targetUser = message.message?.extendedTextMessage?.contextInfo?.participant;
            if (!targetUser) {
                const userPhone = fulltext.split(' ')[1];
                if (!userPhone || !/^\d+$/.test(userPhone)) {
                    return await Bloom.sendMessage(message.key.remoteJid, { text: '❌ Please tag a user or provide a valid phone number.' }, { quoted: message });
                }
                targetUser = `${userPhone}@s.whatsapp.net`;
            }

            try {
                const user = await User.findById(targetUser);
                if (!user) {
                    return await Bloom.sendMessage(message.key.remoteJid, { text: '❌ User not found in database.' }, { quoted: message });
                }

                user.isBanned = false;
                await user.save();

                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: `✅ Successfully unbanned @${targetUser.split('@')[0]}.`,
                    mentions: [targetUser]
                }, { quoted: message });
            } catch (error) {
                console.error('Unban error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { text: '❌ An error occurred while unbanning the user.' }, { quoted: message });
            }
        }
    },

    stats: {
        type: 'owner',
        desc: 'View bot statistics',
        run: async (Bloom, message) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;

            if (!verifyOwner(Bloom, senderID, message)) {
                return await Bloom.sendMessage(message.key.remoteJid, { text: mess.owner }, { quoted: message });
            }

            try {
                // Get database statistics
                const stats = await Promise.all([
                    User.countDocuments(),
                    User.countDocuments({ isBanned: true }),
                    User.find({ lastActivity: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).countDocuments(),
                    User.find({ lastActivity: { $gt: new Date(Date.now() - 1 * 60 * 60 * 1000) } }).countDocuments() // Last hour
                ]);

                // Get system statistics
                const uptime = process.uptime();
                const memory = process.memoryUsage();
                const memoryUsage = Math.round(memory.heapUsed / 1024 / 1024);
                const statsMessage = `┌──── 📊 Bot Statistics ────
├ 👥 Total Users: ${stats[0]}
├ 🚫 Banned Users: ${stats[1]}
├ ✅ Active Users (24h): ${stats[2]}
├ ⚡ Active Users (1h): ${stats[3]}
├ 🤖 Instance ID: ${Bloom._instanceId}
├ 💾 Memory Usage: ${memoryUsage}MB
└─ ⏰ Uptime: ${formatUptime(uptime * 1000)}`;

                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: statsMessage 
                }, { quoted: message });
            } catch (error) {
                console.error('Stats error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ Database error: Could not fetch statistics.' 
                }, { quoted: message });
            }
        }
    },

    reset_user: {
        type: 'owner',
        desc: 'Reset a user\'s data',
        run: async (Bloom, message, fulltext) => {
            const { User } = getModels(Bloom._instanceId);
            const senderID = message.key.participant || message.key.remoteJid;

            if (!verifyOwner(Bloom, senderID, message)) {
                return await Bloom.sendMessage(message.key.remoteJid, { text: mess.owner }, { quoted: message });
            }

            let targetUser = message.message?.extendedTextMessage?.contextInfo?.participant;
            if (!targetUser) {
                const userPhone = fulltext.split(' ')[1];
                if (!userPhone || !/^\d+$/.test(userPhone)) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Please tag a user or provide a valid phone number.' 
                    }, { quoted: message });
                }
                targetUser = `${userPhone}@s.whatsapp.net`;
            }

            try {
                // Check if user exists
                const user = await User.findOne({ _id: targetUser });
                if (!user) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ User not found in database.' 
                    }, { quoted: message });
                }

                // Reset user data
                await User.findOneAndUpdate(
                    { _id: targetUser },
                    {
                        $set: {
                            walletBalance: 0,
                            bankBalance: 0,
                            inventory: {
                                mining: [],
                                magic: [],
                                fishing: [],
                                healing: [],
                                animals: [],
                                stones: [],
                                pokemons: []
                            },
                            transactionHistory: [],
                            lastDailyClaim: null,
                            lastZooCatch: null,
                            lastGamble: null,
                            lastWork: null,
                            lastActivity: new Date(),
                            experience: 0,
                            level: 1,
                            warnings: 0,
                            isBanned: false
                        }
                    },
                    { new: true }
                );

                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: `✅ Successfully reset data for @${targetUser.split('@')[0]}.`,
                    mentions: [targetUser]
                }, { quoted: message });
            } catch (error) {
                console.error('Reset user error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ Database error: Could not reset user data.' 
                }, { quoted: message });
            }
        }
    },

    maintenance: {
        type: 'owner',
        desc: 'Toggle maintenance mode',
        usage: 'maintenance [reason]',
        run: async (Bloom, message, fulltext) => {
            const senderID = message.key.participant || message.key.remoteJid;

            if (!verifyOwner(Bloom, senderID, message)) {
                return await Bloom.sendMessage(message.key.remoteJid, { text: mess.owner }, { quoted: message });
            }

            try {
                // Get models for this instance
                const models = getModels(Bloom._instanceId);
                if (!models?.BotSettings) {
                    throw new Error('BotSettings model not available');
                }

                // Get or create settings
                let settings = await models.BotSettings.findById('global');
                if (!settings) {
                    settings = await models.BotSettings.create({ _id: 'global' });
                }

                // Toggle maintenance mode
                settings.maintenanceMode = !settings.maintenanceMode;
                settings.lastMaintenanceUpdate = new Date();
                
                // Get maintenance reason if provided
                const reason = fulltext.split(' ').slice(1).join(' ').trim();
                if (reason) {
                    settings.maintenanceReason = reason;
                } else if (settings.maintenanceMode) {
                    settings.maintenanceReason = 'System maintenance';
                } else {
                    settings.maintenanceReason = '';
                }

                // Save settings
                await settings.save();
                
                // Update runtime config
                Bloom.maintenanceMode = settings.maintenanceMode;

                // Send confirmation message
                const statusMessage = settings.maintenanceMode 
                    ? `🔧 *Maintenance Mode Enabled*\n\n` +
                      `*Reason:* ${settings.maintenanceReason}\n` +
                      `*Time:* ${settings.lastMaintenanceUpdate.toLocaleString()}\n\n` +
                      `_Only bot owners can use commands during maintenance._`
                    : '✅ *Maintenance Mode Disabled*\n\n_Bot is now accessible to all users._';

                return await Bloom.sendMessage(message.key.remoteJid, {
                    text: statusMessage
                }, { quoted: message });

            } catch (error) {
                console.error('Maintenance mode error:', error);
                return await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ Database Error: Could not update maintenance mode.' 
                }, { quoted: message });
            }
        }
    }
};

// Helper function to format uptime
function formatUptime(uptime) {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}