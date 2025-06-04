const { isBloomKing } = require('../../colors/auth');
const { createInstanceModels } = require('../../colors/schema');
const { log } = require('../../utils/logger');

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
        const settings = await BotSettings.findById('global') || await BotSettings.create({ _id: 'global' });
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
    } catch (error) {
        log('Maintenance middleware error:', error);
        return true;
    }
}

module.exports = maintenanceMiddleware; 