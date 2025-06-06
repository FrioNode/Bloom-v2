const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const Bot = require('../package.json');

// Load .env if not in production
if (process.env.NODE_ENV !== 'production') {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log('[ENV] Loaded .env from', envPath);
    } else {
        console.warn('[ENV] .env not found at', envPath);
    }
}

function getInstanceConfig(instanceId) {
    const index = instanceId.replace('bot', '');
    return {
        session: process.env[`SESSION_${index}`],
        logschat: process.env[`LOGS_CHAT_${index}`] || process.env.LOGS_CHAT || '120363154923982755@g.us',
        priority: parseInt(process.env[`BOT${index}_PRIORITY`] || index)
    };
}

function getAll() {
    const config = {
        mongo: process.env.MONGODB_URI || process.env.MONGO,
        node: process.env.NODE_ENV || 'development',
        sudochat: `${process.env.OWNERNUMBER || '254718241545'}@s.whatsapp.net`,
        devname: process.env.DEVNAME || 'FrioNode',
        ownername: process.env.OWNERNAME || 'Benson',
        bloomchat: process.env.BLOOMCHAT || '120363154923982755@g.us',
        openchat: process.env.OPENCHAT || '120363154923982755@g.us',
        channelid: process.env.CHANNEL_ID || '120363321675231023@newsletter',
        channel: process.env.CHANNEL || 'https://whatsapp.com/channel/0029VaF8RYn5YU6Dp8e2mD0A',
        botname: process.env.BOT_NAME || 'Bloom',
        image: process.env.IMAGE || 'https://i.imgur.com/XFGxWXt.jpeg',
        lang: process.env.BOT_LANG || 'EN',
        react: process.env.REACT || 'true',
        emoji: process.env.EMOJI || '🌸',
        reboot: process.env.REBOOT === 'true',
        prefix: process.env.PREFIX || '!',
        timezone: process.env.TIMEZONE || 'Africa/Nairobi',
        mode: process.env.MODE || 'public',
        pixelkey: process.env.PIXELKEY || '',
        bloom: Bot,
        cpyear: new Date().getFullYear()
    };

    // Add instance-specific configs
    config.instances = {
        bot1: getInstanceConfig('bot1'),
        bot2: getInstanceConfig('bot2'),
        bot3: getInstanceConfig('bot3')
    };

    return config;
}

const config = getAll();

module.exports = {
    ...config,
    getInstanceConfig,
    _getAll: getAll,
    _reload: () => Object.assign(config, getAll())
};
