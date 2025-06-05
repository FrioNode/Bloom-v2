const { isBloomKing } = require('../../colors/auth');
const { createInstanceModels } = require('../../colors/schema');
const { log } = require('../../utils/logger');

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
            log(`Failed to initialize BotSettings model for instance ${instanceId}:`, error);
            return null;
        }
    }
    return BotSettings;
}

/**
 * Middleware to handle maintenance mode
 * @param {Object} Bloom - The Bloom instance
 * @param {Object} message - The message object
 * @param {string} command - The command name
 * @returns {Promise<boolean>} - Whether to continue processing the command
 */
async function maintenanceMiddleware(Bloom, message, command) {
    try {
        // Get or initialize instance-specific model
        const BotSettings = await getInstanceModel(Bloom._instanceId);
        if (!BotSettings) {
            log(`Could not access BotSettings model for maintenance check (instance: ${Bloom._instanceId})`);
            return true; // On model error, allow command to proceed
        }

        try {
            // Get or create settings
            let settings = await BotSettings.findById('global');
            if (!settings) {
                settings = await BotSettings.create({ _id: 'global' });
            }

            Bloom.maintenanceMode = settings.maintenanceMode;
            if (!settings.maintenanceMode) {
                return true;
            }

            const sender = message.key.participant || message.key.remoteJid;
            if (isBloomKing(sender, message) || Bloom.isOwner?.(sender) || sender === require('../../colors/setup').sudochat) {
                return true;
            }

            const maintenanceMessage = settings.maintenanceReason 
                ? `🔧 *Bot is currently under maintenance*\n\n_Reason: ${settings.maintenanceReason}_`
                : '🔧 *Bot is currently under maintenance*\nPlease try again later.';

            await Bloom.sendMessage(message.key.remoteJid, {
                text: maintenanceMessage
            }, { quoted: message });
            
            return false;
        } catch (err) {
            log(`Database error in maintenance check:`, err);
            return true; // On database error, allow command to proceed
        }
    } catch (error) {
        log('Maintenance middleware error:', error);
        return true; // On error, allow command to proceed
    }
}

module.exports = maintenanceMiddleware; 