const { createInstanceModels } = require('../../colors/schema');
const { isBloomKing } = require('../../colors/auth');

// Cache models per instance
const modelCache = new Map();

/**
 * Get or initialize BotSettings model for an instance
 * @param {string} instanceId - The instance ID
 * @returns {Promise<mongoose.Model>} The BotSettings model
 */
async function getInstanceModel(instanceId) {
    let BotSettings = modelCache.get(instanceId);
    if (!BotSettings) {
        try {
            const models = await createInstanceModels(instanceId);
            if (!models?.BotSettings) {
                throw new Error(`Failed to initialize BotSettings model for instance ${instanceId}`);
            }
            BotSettings = models.BotSettings;
            modelCache.set(instanceId, BotSettings);
        } catch (error) {
            console.error(`Failed to initialize BotSettings model for instance ${instanceId}:`, error);
            return null;
        }
    }
    return BotSettings;
}

/**
 * Get the current active instance from the database
 * @param {mongoose.Model} BotSettings - The BotSettings model
 * @returns {Promise<string>} The current active instance
 */
async function getCurrentActiveInstance(BotSettings) {
    try {
        const settings = await BotSettings.findById('global').select('activeInstance').lean();
        return settings?.activeInstance || 'none';
    } catch (error) {
        console.error('Error getting current active instance:', error);
        return 'none';
    }
}

module.exports = {
    bloom: {
        type: 'owner',
        desc: 'Toggle bot instance state',
        usage: 'bloom <instance> (bot1, bot2, bot3)',
        run: async (Bloom, message, fulltext) => {
            try {
                const sender = message.key.participant || message.key.remoteJid;
                if (!isBloomKing(sender, message)) return;

                const args = fulltext.split(' ');
                const targetInstance = args[1]?.toLowerCase();
                
                // Validate instance ID
                if (!targetInstance || !['bot1', 'bot2', 'bot3'].includes(targetInstance)) {
                    const msg = `┌──── ⚙️ Instance Control ────\n├ Usage: !bloom <instance>\n├ Available instances:\n├ • bot1\n├ • bot2\n└─ • bot3`;
                    return await Bloom.sendMessage(message.key.remoteJid, { text: msg });
                }

                // Get or initialize instance-specific model
                const BotSettings = await getInstanceModel(Bloom._instanceId);
                if (!BotSettings) {
                    await Bloom.sendMessage(message.key.remoteJid, { 
                        text: `┌──── ❌ Error ────\n└─ Failed to access bot settings database` 
                    });
                    return;
                }

                try {
                    // First get the current active instance
                    const previousInstance = await getCurrentActiveInstance(BotSettings);

                    // Perform the update as a separate operation
                    await BotSettings.findByIdAndUpdate(
                        'global',
                        { 
                            $set: { activeInstance: targetInstance },
                            $setOnInsert: { _id: 'global' }
                        },
                        { 
                            upsert: true,
                            new: true
                        }
                    );

                    // Small delay to ensure database consistency
                    await new Promise(resolve => setTimeout(resolve, 100));

                    // Verify the update and send message
                    const msg = `┌──── ⚙️ Instance Update ────\n├ Previous active: ${previousInstance}\n└─ Now active: ${targetInstance}`;
                    await Bloom.sendMessage(message.key.remoteJid, { text: msg });
                } catch (error) {
                    console.error('Error updating bot settings:', error);
                    await Bloom.sendMessage(message.key.remoteJid, { 
                        text: `┌──── ❌ Error ────\n└─ Failed to update instance state` 
                    });
                }
            } catch (error) {
                console.error('Error in bloom command:', error);
                await Bloom.sendMessage(message.key.remoteJid, { 
                    text: `┌──── ❌ Error ────\n└─ An unexpected error occurred` 
                });
            }
        }
    }
}; 