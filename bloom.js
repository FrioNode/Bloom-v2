const { botname } = require('./colors/setup');
const express = require('express');
const rotationManager = require('./utils/rotationManager');
const startupManager = require('./utils/startupManager');
const { log } = require('./utils/logger');
const path = require('path');
const { createInstanceModels } = require('./colors/schema');
const config = require('./utils/config');

let stopPokemonGame; const app = express();
const serverStartTime = Date.now();
const PORT = process.env.PORT || 3000;

// Helper function to get active instance stats
async function getInstanceStats() {
    try {
        // Get the current active instance using rotationManager
        const activeInstance = await rotationManager.getCurrentActiveInstance();
        const { User, Exp } = createInstanceModels(activeInstance);

        // Get database statistics
        const [totalUsers, activeUsers24h, totalGroups, commandsToday] = await Promise.all([
            User.countDocuments(),
            User.find({ lastActivity: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }).countDocuments(),
            User.distinct('groups').then(groups => groups.length),
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
            nextRotation: rotationManager.getNextRotationTime() || 8, // Fallback to 8 hours if no rotation is set
            uptime,
            activityData: { labels, values }
        };
    } catch (error) {
        console.error('Error getting instance stats:', error);
        return null;
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
app.get('/', (req, res) => {  res.sendFile(path.join(__dirname, 'colors', 'bloom.html')); });

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
        console.error('Error in /api/stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// New API endpoint for user statistics
app.get('/api/user-stats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const activeInstance = await rotationManager.getCurrentActiveInstance();
        
        if (!activeInstance) {
            return res.status(503).json({ error: 'No active bot instance' });
        }

        const { User, Exp } = createInstanceModels(activeInstance);
        const [user, exp] = await Promise.all([
            User.findById(userId).lean(),
            Exp.findOne({ jid: userId }).lean()
        ]);

        if (!user && !exp) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userStats = {
            id: userId,
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
        console.error('Error in /api/user-stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});