const { createInstanceModels } = require('./schema');

async function trackUsage(jid, instanceId) {
    if (!jid || !instanceId) return;
    try {
        const models = await createInstanceModels(instanceId);
        const { Exp, User } = models;
        
        // Update exp points and message count
        await Exp.findOneAndUpdate(
            { jid },
            {
                $inc: {
                    points: 1,
                    messageCount: 1
                }
            },
            { upsert: true, new: true }
        );

        // Update user's last activity
        await User.findOneAndUpdate(
            { _id: jid },
            { 
                lastActivity: new Date(),
                $setOnInsert: { name: jid.split('@')[0] }  // Set name only if creating new user
            },
            { upsert: true }
        );
    } catch (err) {
        console.error('❌ Error tracking user activity:', err);
    }
}

module.exports = { trackUsage };