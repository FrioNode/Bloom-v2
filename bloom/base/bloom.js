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
                    // Get or create settings
                    let settings = await BotSettings.findById('global');
                    if (!settings) {
                        settings = await BotSettings.create({ 
                            _id: 'global',
                            activeInstance: targetInstance 
                        });
                    } else {
                        // Update active instance
                        settings.activeInstance = targetInstance;
                        await settings.save();
                    }

                    const msg = `┌──── ⚙️ Instance Update ────\n├ Previous active: ${settings.activeInstance || 'none'}\n└─ Now active: ${targetInstance}`;
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