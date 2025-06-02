const { isBloomKing } = require('../../colors/auth');
const { createInstanceModels } = require('../../colors/schema');

/**
 * Middleware to handle maintenance mode
 * @param {Object} Bloom - The Bloom instance
 * @param {Object} message - The message object
 * @param {string} command - The command name
 * @returns {boolean} - Whether to continue processing the command
 */
async function maintenanceMiddleware(Bloom, message, command) {
    try {
        const { BotSettings } = createInstanceModels(Bloom._instanceId);
        
        // Get maintenance status from database
        const settings = await BotSettings.findById('global') || await BotSettings.create({ _id: 'global' });
        
        // Cache the maintenance mode status on the Bloom instance
        Bloom.maintenanceMode = settings.maintenanceMode;

        // If maintenance mode is not enabled, allow all commands
        if (!settings.maintenanceMode) {
            return true;
        }

        // In maintenance mode, check if sender is owner
        const sender = message.key.participant || message.key.remoteJid;
        if (isBloomKing(sender, message) || Bloom.isOwner?.(sender) || sender === require('../../colors/setup').sudochat) {
            return true;
        }

        // Block non-owners during maintenance with message
        const maintenanceMessage = settings.maintenanceReason 
            ? `🔧 *Bot is currently under maintenance*\n\n_Reason: ${settings.maintenanceReason}_`
            : '🔧 *Bot is currently under maintenance*\nPlease try again later.';

        await Bloom.sendMessage(message.key.remoteJid, {
            text: maintenanceMessage
        }, { quoted: message });
        
        return false;
    } catch (error) {
        console.error('Maintenance middleware error:', error);
        return true; // On error, allow command to proceed
    }
}

module.exports = maintenanceMiddleware; 