const { botname } = require('./colors/setup');
const express = require('express');
const rotationManager = require('./utils/rotationManager');
const startupManager = require('./utils/startupManager');
const { log } = require('./utils/logger');
const path = require('path');
const { createInstanceModels } = require('./colors/schema');
const config = require('./utils/config');

let stopPokemonGame;
const app = express();
const serverStartTime = Date.now();
const PORT = process.env.PORT || 3000;

// Cache models per instance
const modelCache = new Map();

/**
 * Get or initialize models for an instance
 * @param {string} instanceId - The instance ID
 * @returns {Promise<Object>} The instance models
 */
async function getInstanceModels(instanceId) {
    let models = modelCache.get(instanceId);
    if (!models) {
        try {
            models = await createInstanceModels(instanceId);
            if (!models?.User || !models?.Exp) {
                throw new Error(`Failed to initialize models for instance ${instanceId}`);
            }
            modelCache.set(instanceId, models);
        } catch (error) {
            log(`Failed to initialize models for instance ${instanceId}:`, error);
            return null;
        }
    }
    return models;
}

// Helper function to get active instance stats
async function getInstanceStats() {
    try {
        // Get the current active instance using rotationManager
        const activeInstance = await rotationManager.getCurrentActiveInstance();
        if (!activeInstance) {
            throw new Error('No active instance found');
        }

        // Get or initialize instance models
        const models = await getInstanceModels(activeInstance);
        if (!models) {
            throw new Error(`Failed to get models for instance ${activeInstance}`);
        }

        const { User, Exp, Settings } = models;

        try {
            // Get database statistics
            const [totalUsers, activeUsers24h, totalGroups, commandsToday] = await Promise.all([
                User.countDocuments(),
                User.find({ lastActivity: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).countDocuments(),
                Settings.countDocuments(),
                Exp.find({ updatedAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).countDocuments()
            ]);

            // Get activity data for the last 24 hours
            const activityData = await Exp.aggregate([
                {
                    $match: {
                        updatedAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                    }
                },
                {
                    $group: {
                        _id: { $hour: '$updatedAt' },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id': 1 } }
            ]);

            // Format activity data for the chart
            const hours = Array.from({ length: 24 }, (_, i) => i);
            const labels = hours.map(h => `${h}:00`);
            const values = hours.map(hour => {
                const data = activityData.find(d => d._id === hour);
                return data ? data.count : 0;
            });

            // Calculate uptime using the existing endpoint logic
            const now = Date.now();
            const diff = now - serverStartTime;
            const uptime = {
                days: Math.floor(diff / (1000 * 60 * 60 * 24)),
                hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
                seconds: Math.floor((diff % (1000 * 60)) / 1000)
            };

            return {
                activeInstance,
                totalUsers,
                activeUsers: activeUsers24h,
                totalGroups,
                commandsToday,
                nextRotation: rotationManager.getNextRotationTime() || 8,
                uptime,
                activityData: { labels, values }
            };
        } catch (err) {
            log('Database error in getInstanceStats:', err);
            throw new Error('Failed to fetch statistics from database');
        }
    } catch (error) {
        log('Error getting instance stats:', error);
        throw error; // Propagate error to caller
    }
}

async function init() {
    try {
        const results = await startupManager.startAll();
        log('Startup results:', results);
        
        if (results.some(r => r.success)) {
            rotationManager.startRotation();
        } else {
            log('❌ No instances started successfully. Please check your configuration and try again.');
            process.exit(1);
        }
    } catch (error) {
        log('Critical startup error:', error);
        process.exit(1);
    }
}

init();

app.use(express.static(path.join(__dirname, 'colors')));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'colors', 'bloom.html')); });

app.listen(PORT, () => { log(`🔒 ${botname} Server is running on port ${PORT}`); });

app.get('/uptime', (req, res) => {
    const now = Date.now();
    const diff = now - serverStartTime;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    res.json({ days, hours, minutes, seconds });
});

app.get('/status', (_, res) => res.send(`✅ ${botname} bot is online`));

// New API endpoint for bot statistics
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await getInstanceStats();
        if (!stats) {
            return res.status(500).json({ error: 'Failed to fetch bot statistics' });
        }
        res.json(stats);
    } catch (error) {
        log('Error in /api/stats:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// New API endpoint for user statistics
app.get('/api/user-stats/:userId', async (req, res) => {
    try {
        let { userId } = req.params;
        let userJid;

        // Normalize input
        if (userId.endsWith('@whatsapp.net') || userId.endsWith('@lid')) {
            userJid = userId; // full JID provided
        } else if (/^\d+$/.test(userId)) {
            userJid = `${userId}@whatsapp.net`; // plain number
        } else {
            return res.status(400).json({ error: 'Invalid userId format' });
        }

        const activeInstance = await rotationManager.getCurrentActiveInstance();
        if (!activeInstance) {
            return res.status(503).json({ error: 'No active bot instance' });
        }

        const models = await getInstanceModels(activeInstance);
        if (!models) {
            return res.status(500).json({ error: `Failed to get models for instance ${activeInstance}` });
        }

        const { User, Exp } = models;

        const [user, exp] = await Promise.all([
            User.findById(userJid).lean(),
                                              Exp.findOne({ jid: userJid }).lean()
        ]);

        if (!user && !exp) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userStats = {
            id: userJid,
            name: user?.name,
            economy: user ? {
                walletBalance: user.walletBalance || 0,
                bankBalance: user.bankBalance || 0,
                lastActivity: user.lastActivity,
                inventory: user.inventory || {}
            } : null,
            experience: exp ? {
                points: exp.points || 0,
                messageCount: exp.messageCount || 0,
                streak: exp.streak || 0,
                lastDaily: exp.lastDaily
            } : null
        };

        res.json(userStats);
    } catch (error) {
        log('Error in /api/user-stats:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});
