const config = {
    instances: [
        {
            id: 'bot1',
            sessionDir: 'heart_bot1',
            rotationHours: 8,
            logschat: process.env.LOGS_CHAT_1 || '',
            sessionToken: process.env.SESSION_1 || '',
            priority: parseInt(process.env.BOT1_PRIORITY || '1')
        },
        {
            id: 'bot2',
            sessionDir: 'heart_bot2',
            rotationHours: 8,
            logschat: process.env.LOGS_CHAT_2 || '',
            sessionToken: process.env.SESSION_2 || '',
            priority: parseInt(process.env.BOT2_PRIORITY || '2')
        },
        {
            id: 'bot3',
            sessionDir: 'heart_bot3',
            rotationHours: 8,
            logschat: process.env.LOGS_CHAT_3 || '',
            sessionToken: process.env.SESSION_3 || '',
            priority: parseInt(process.env.BOT3_PRIORITY || '3')
        }
    ],
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/bloom'
    },
    rotationEnabled: true,
    debugMode: false,
    startup: {
        waitForQR: true,
        qrTimeout: 120000,
        retryAttempts: 3,
        sequentialStart: true
    }
};

module.exports = config; 