const os = require('os');
const { exec } = require('child_process');
const { createInstanceModels, connectDB } = require('../../colors/schema');
const { botname, cpyear, mode, timezone } = require('../../colors/setup');
const mess = require('../../colors/mess');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const config = require('../../utils/config');

const LEVELS = [
    { name: '👶 Baby', min: 0 },
    { name: '🌱 Beginner', min: 10 },
    { name: '🪶 Novice', min: 25 },
    { name: '🏠 Citizen', min: 50 },
    { name: '🛡️ Lord', min: 100 },
    { name: '🎩 Baron', min: 200 },
    { name: '🏛️ Governor', min: 400 },
    { name: '⚔️ Commander', min: 700 },
    { name: '🧠 Master', min: 1000 },
    { name: '🔥 Grandmaster', min: 1500 },
    { name: '🔮 Archmage', min: 2200 },
    { name: '🧙 Wizard', min: 3000 }
];

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

// Initialize MongoDB connection
connectDB('user').catch(err => {
    log('❌ Failed to connect to MongoDB:', err);
    process.exit(1);
});

const locale = timezone || 'Africa/Nairobi';
const getCurrentDate = () => {
    return new Date().toLocaleString('en-US', { timeZone: locale });
};

const runtime = ms => {
    const sec = Math.floor(ms / 1000 % 60);
    const min = Math.floor(ms / (1000 * 60) % 60);
    const hrs = Math.floor(ms / (1000 * 60 * 60) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    return `${days}d ${hrs}h ${min}m ${sec}s`;
};

const getLevelData = (points) => {
    let current = LEVELS[0], next = null;
    for (let i = 1; i < LEVELS.length; i++) {
        if (points >= LEVELS[i].min) current = LEVELS[i];
        else { next = LEVELS[i]; break; }
    }
    return {
        current,
        next,
        name: current.name,
        nextName: next?.name || 'MAX LEVEL',
        toNext: next ? next.min - points : 0
    };
};

const msToTime = ms => {
    const sec = Math.floor((ms / 1000) % 60);
    const min = Math.floor((ms / (1000 * 60)) % 60);
    const hrs = Math.floor((ms / (1000 * 60 * 60)) % 24);
    return `${hrs}h ${min}m ${sec}s`;
};

const createProgressBar = (percent) => {
    const filled = '▓'.repeat(Math.floor(percent / 5));
    const empty = '░'.repeat(20 - Math.floor(percent / 5));
    return `[${filled}${empty}]`;
};

const normalizeJid = (jid) => {
    if (!jid) return 'Not available';
    // Remove device suffix and normalize
    return jid.split(':')[0] + '@' + jid.split('@')[1];
};

const normalizeLid = (lid) => {
    if (!lid) return 'Not available';
    // Remove device suffix for LID
    return lid.split(':')[0] + '@lid';
};

const loadBotCreds = async (instanceId) => {
    try {
        const instance = config.instances.find(i => i.id === instanceId);
        if (!instance) return null;
        
        const credsPath = path.join(__dirname, '../..', instance.sessionDir, 'creds.json');
        const data = await fs.readFile(credsPath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
};

module.exports = {
    test: {
        type: 'user',
        desc: 'A user testing command',
        usage: 'test',
        run: async (Bloom, message, fulltext) => {
            const senderJid = message.key.participant || message.key.remoteJid;
            const senderName = message.pushName || conn.contacts?.[senderJid]?.name || senderJid;
            console.log("📨 Executing test...");
            await Bloom.sendMessage(message.key.remoteJid, { text: `> Test passed! By: ${senderName}` });
        }
    },
    about: {
        type: 'user',
        desc: 'About this bot',
        run: async (Bloom, message) => {
            let april = message.key.remoteJid;
            await Bloom.sendMessage(april, { text: mess.about });
        }
    },
    status: {
        type: 'user',
        desc: 'Show system status',
        run: async (Bloom, message, fulltext, commands) => {
            try {
                const uptime = process.uptime() * 1000;
                const mem = process.memoryUsage();
                const disk = await new Promise(res => exec('df -h', (_,stdout) => {
                    const line = stdout.split('\n').find(l => l.includes('/'));
                    res(line.split(/\s+/).slice(1,4));
                }));

                const dbStatus = mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected';
                const statusMessage = `----🌼 ${botname} 🌼---
┌──────────────────── 🧠
├  \`\`\`${getCurrentDate()}
├ Uptime: ${runtime(uptime)}
├ Commands: ${Object.keys(commands).length}
├ Platform: ${os.platform()}
├ Server: ${os.hostname()}
├ Memory: ${(os.totalmem()/1e9-os.freemem()/1e9).toFixed(2)} GB / ${(os.totalmem()/1e9).toFixed(2)} GB
├ Heap Mem: ${(mem.heapUsed/1e6).toFixed(2)} MB / ${(mem.heapTotal/1e6).toFixed(2)} MB
├ External Mem: ${(mem.external/1e6).toFixed(2)} MB
├ Disk: ${disk[1]} / ${disk[0]} (Free: ${disk[2]})
├ Database: ${dbStatus}
├ Mode: ${process.env.NODE_ENV||'development'} | ${mode}\`\`\`
└────────────────────── 🚀
> (c) ${cpyear} FrioNode - 🦑 •|•`;

                await Bloom.sendMessage(message.key.remoteJid, {text: statusMessage}, {quoted: message});
            } catch (error) {
                console.error('Status command error:', error);
                await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ An error occurred while fetching system status.' 
                }, { quoted: message });
            }
        }
    },
    exp: {
        type: 'user',
        desc: 'Check your EXP and get daily bonus',
        run: async (Bloom, message) => {
            try {
                if (mongoose.connection.readyState !== 1) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Database connection is currently unavailable. Please try again later.' 
                    }, { quoted: message });
                }

                const models = await getModels(Bloom._instanceId);
                const { Exp } = models;
                const jid = message.key?.participant || message.key?.remoteJid;
                const now = new Date();

                let expData = await Exp.findOneAndUpdate(
                    { jid },
                    { $setOnInsert: { points: 0, streak: 0 } },
                    { upsert: true, new: true }
                );

                let bonusGiven = false;
                const lastDaily = expData.lastDaily ? new Date(expData.lastDaily) : null;
                
                if (!lastDaily || (now - lastDaily) > 86400000) {
                    // Calculate streak
                    const streakMaintained = lastDaily && (now - lastDaily) < 172800000; // 48 hours
                    const newStreak = streakMaintained ? (expData.streak || 0) + 1 : 1;
                    
                    // Calculate bonus points (base 5 + streak bonus)
                    const streakBonus = Math.min(Math.floor(newStreak / 7), 5); // Max 5 bonus points
                    const totalBonus = 5 + streakBonus;

                    expData = await Exp.findOneAndUpdate(
                        { jid },
                        {
                            $inc: { points: totalBonus },
                            $set: { 
                                lastDaily: now,
                                streak: newStreak
                            }
                        },
                        { new: true }
                    );
                    bonusGiven = true;
                }

                const { current, next, toNext } = getLevelData(expData.points);
                const progress = next ? ((expData.points - current.min) / (next.min - current.min) * 100).toFixed(1) : 100;
                const progressBar = createProgressBar(progress);

                const response = `┌────📊 EXP REPORT─────
├ 🔢 *${expData.points.toLocaleString()}* points
├ 🎖️ Level: *${current.name}*
${next ? `├ ⬆️ *${toNext.toLocaleString()}* more to *${next.name}*
├ ${progressBar} ${progress}%` : `├ 🏆 *MAX LEVEL*: ${current.name}`}
${bonusGiven ? `├ 🎁 Daily bonus claimed! (+${5 + Math.min(Math.floor(expData.streak / 7), 5)} EXP)
├ 🔥 Streak: *${expData.streak} days*` : `├ 🕒 Daily bonus in: ${msToTime(86400000 - (now - lastDaily))}`}
└────────────────────`;

                await Bloom.sendMessage(message.key.remoteJid, { text: response }, { quoted: message });
            } catch (err) {
                console.error('Error in exp command:', err);
                await Bloom.sendMessage(message.key.remoteJid, {
                    text: '❌ An error occurred while fetching your EXP data.'
                }, { quoted: message });
            }
        }
    },
    leader: {
        type: 'user',
        desc: 'See leaderboard for top 10 users',
        run: async (Bloom, message) => {
            try {
                if (mongoose.connection.readyState !== 1) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Database connection is currently unavailable. Please try again later.' 
                    }, { quoted: message });
                }

                const { Exp } = await getModels(Bloom._instanceId);
                const topUsers = await Exp.find()
                    .sort({ points: -1 })
                    .limit(10)
                    .lean()
                    .exec();

                if (!topUsers.length) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: "📊 No users found in the leaderboard yet." 
                    }, { quoted: message });
                }

                const medals = ['🥇', '🥈', '🥉'];
                const leaderboardText = topUsers.map((user, index) => {
                    const { name } = getLevelData(user.points);
                    const medal = medals[index] || '🏅';
                    const progress = createProgressBar(user.points / LEVELS[LEVELS.length - 1].min * 100);
                    return `${medal} @${user.jid.split('@')[0]}\n💫 *${user.points.toLocaleString()} pts* | ${name}\n${progress}`;
                }).join('\n\n');

                await Bloom.sendMessage(message.key.remoteJid, {
                    text: `🏆 *Global Leaderboard*\n\n${leaderboardText}`,
                    mentions: topUsers.map(u => u.jid)
                }, { quoted: message });
            } catch (error) {
                console.error('Leaderboard error:', error);
                await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ An error occurred while fetching the leaderboard.' 
                }, { quoted: message });
            }
        }
    },
    jid: {
        type: 'user',
        desc: 'Returns the JID and LID information',
        run: async (Bloom, message) => {
            const chatJid = message.key.remoteJid;
            
            // For sender info, check if the ID is actually a LID
            let senderJid = message.key.participant || message.key.remoteJid;
            let senderLid = null;
            
            // If the ID ends with @lid, it's a business account
            if (senderJid.endsWith('@lid')) {
                senderLid = normalizeLid(senderJid);
                senderJid = 'Business Account';
            } else {
                // Check if there's a LID in the message
                senderLid = message.key.lid || message.lid;
                if (senderLid) senderLid = normalizeLid(senderLid);
                if (senderJid) senderJid = normalizeJid(senderJid);
            }

            // Get bot info from creds.json
            const creds = await loadBotCreds(Bloom._instanceId);
            const botJid = normalizeJid(creds?.me?.id || Bloom.user?.id);
            const botLid = normalizeLid(creds?.me?.lid || Bloom.me?.lid);

            const infoText = `📱 *Chat Information*\n\n` +
                           `*Chat JID:*\n${chatJid}\n\n` +
                           `*Sender Info:*\n` +
                           `├ JID: ${senderJid}\n` +
                           `└ LID: ${senderLid || 'Not available'}\n\n` +
                           `*Bot Info:*\n` +
                           `├ JID: ${botJid}\n` +
                           `└ LID: ${botLid}`;

            await Bloom.sendMessage(message.key.remoteJid, { 
                text: infoText
            }, { quoted: message });
        }
    },
    level: {
        type: 'user',
        desc: 'See rank/level of another user',
        run: async (Bloom, message, fulltext) => {
            try {
                if (mongoose.connection.readyState !== 1) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Database connection is currently unavailable. Please try again later.' 
                    }, { quoted: message });
                }

                const { Exp } = await getModels(Bloom._instanceId);
                const text = fulltext.trim().split(' ').slice(1).join(' ').trim();
                let targetJid = message.message?.extendedTextMessage?.contextInfo?.participant;

                if (!targetJid && /^\d{8,15}$/.test(text)) {
                    targetJid = `${text}@s.whatsapp.net`;
                }

                if (!targetJid) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: "❗ Please tag a user or provide a valid phone number." 
                    }, { quoted: message });
                }

                const exp = await Exp.findOne({ jid: targetJid }).lean();
                if (!exp) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: `🙁 That user has no EXP yet.` 
                    }, { quoted: message });
                }

                const { name, nextName, toNext } = getLevelData(exp.points);
                const currentLevel = LEVELS.find(l => l.name === name);
                const nextLevel = LEVELS.find(l => l.name === nextName);
                const progress = nextName !== 'MAX LEVEL' 
                    ? (((exp.points - currentLevel.min) / (nextLevel.min - currentLevel.min)) * 100).toFixed(1)
                    : 100;
                const progressBar = createProgressBar(progress);

                await Bloom.sendMessage(message.key.remoteJid, {
                    text: `📊 *User Level Info*\n\n` +
                          `👤 *User:* @${targetJid.split('@')[0]}\n` +
                          `🎖️ *Level:* ${name}\n` +
                          `💫 *Points:* ${exp.points.toLocaleString()} pts\n` +
                          `${nextName !== 'MAX LEVEL' 
                            ? `📈 *Next Level:* ${toNext.toLocaleString()} pts → ${nextName}\n${progressBar} ${progress}%` 
                            : '🏆 *MAX LEVEL ACHIEVED!*\n' + progressBar}`,
                    mentions: [targetJid]
                }, { quoted: message });
            } catch (error) {
                console.error('Level check error:', error);
                await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ An error occurred while checking the user level.' 
                }, { quoted: message });
            }
        }
    },
    rank: {
        run: async (...args) => module.exports.level.run(...args),
        type: 'user',
        desc: 'See rank/level of another user'
    },
    profile: {
        type: 'user',
        desc: 'View your or another user\'s profile',
        run: async (Bloom, message, fulltext) => {
            try {
                if (mongoose.connection.readyState !== 1) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Database connection is currently unavailable. Please try again later.' 
                    }, { quoted: message });
                }

                const { User, Exp } = await getModels(Bloom._instanceId);
                const text = fulltext.trim().split(' ').slice(1).join(' ').trim();
                let targetJid = message.message?.extendedTextMessage?.contextInfo?.participant;

                if (!targetJid && /^\d{8,15}$/.test(text)) {
                    targetJid = `${text}@s.whatsapp.net`;
                }

                if (!targetJid) {
                    targetJid = message.key.participant || message.key.remoteJid;
                }

                const [user, exp] = await Promise.all([
                    User.findById(targetJid).lean(),
                    Exp.findOne({ jid: targetJid }).lean()
                ]);

                if (!user && !exp) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: `❌ No profile found for this user.` 
                    }, { quoted: message });
                }

                const { name: levelName, nextName, toNext } = getLevelData(exp?.points || 0);
                const progress = nextName !== 'MAX LEVEL' 
                    ? ((exp?.points || 0) / LEVELS[LEVELS.length - 1].min * 100).toFixed(1)
                    : 100;
                const progressBar = createProgressBar(progress);

                const profileText = `👤 *User Profile*\n\n` +
                    `🆔 *ID:* @${targetJid.split('@')[0]}\n` +
                    `${user?.name ? `📝 *Name:* ${user.name}\n` : ''}` +
                    `\n💰 *Economy*\n` +
                    `${user ? `├ 👛 Wallet: ${user.walletBalance?.toLocaleString() || 0}\n` +
                    `└ 🏦 Bank: ${user.bankBalance?.toLocaleString() || 0}\n` : '❌ Not registered in economy\n'}` +
                    `\n📊 *Experience*\n` +
                    `${exp ? `├ 💫 Points: ${exp.points?.toLocaleString() || 0}\n` +
                    `├ 🎖️ Level: ${levelName}\n` +
                    `├ 🔥 Streak: ${exp.streak || 0} days\n` +
                    `${nextName !== 'MAX LEVEL' ? `├ ⬆️ Next: ${toNext.toLocaleString()} pts → ${nextName}\n` : '🏆 MAX LEVEL ACHIEVED!\n'}` +
                    `└ ${progressBar} ${progress}%` : '❌ No experience data\n'}`;

                await Bloom.sendMessage(message.key.remoteJid, {
                    text: profileText,
                    mentions: [targetJid]
                }, { quoted: message });
            } catch (error) {
                console.error('Profile error:', error);
                await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ An error occurred while fetching the profile.' 
                }, { quoted: message });
            }
        }
    },
    progress: {
        type: 'user',
        desc: 'Shows your EXP progress bar',
        run: async (Bloom, message) => {
            try {
                if (mongoose.connection.readyState !== 1) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: '❌ Database connection is currently unavailable. Please try again later.' 
                    }, { quoted: message });
                }

                const { Exp } = await getModels(Bloom._instanceId);
                const jid = message.key?.participant || message.key?.remoteJid;
                const expData = await Exp.findOne({ jid }).lean();
                
                if (!expData) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: "🌱 Start using commands to earn EXP!" 
                    }, { quoted: message });
                }

                const { current, next } = getLevelData(expData.points);
                if (!next) {
                    return await Bloom.sendMessage(message.key.remoteJid, { 
                        text: `┌───────────────\n├ 🏆 Max Level: *${current.name}*\n├ ${createProgressBar(100)}\n└───────────────`
                    }, { quoted: message });
                }

                const percent = Math.floor(((expData.points - current.min) / (next.min - current.min)) * 100);
                const progressBar = createProgressBar(percent);

                await Bloom.sendMessage(message.key.remoteJid, {
                    text: `┌───────────────
├ 🎖️ Level: *${current.name}*
├ 🔋 Progress: ${progressBar} ${percent}%
├ ⬆️ *${next.name}* at *${next.min.toLocaleString()}* points
└───────────────`
                }, { quoted: message });
            } catch (error) {
                console.error('Progress check error:', error);
                await Bloom.sendMessage(message.key.remoteJid, { 
                    text: '❌ An error occurred while checking your progress.' 
                }, { quoted: message });
            }
        }
    }
};

function getIcon(type) {
    const icons = {
        'mining': '⛏️',
        'magic': '🪄',
        'fishing': '🎣',
        'healing': '💊',
        'animal': '🦁',
        'stone': '💎',
        'pokemon': '⭐'
    };
    return icons[type] || '📦';
}