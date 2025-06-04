const { createInstanceModels } = require('../../colors/schema');
const { isBloomKing } = require('../../colors/auth');
const { log } = require('../../utils/logger');

/**
 * Middleware to check if the current instance is active
 * @param {Object} Bloom - The Bloom instance
 * @param {Object} message - The message object
 * @param {string} command - The command being executed
 * @returns {boolean} - Whether to continue processing the command
 */
async function instanceCheckMiddleware(Bloom, message, command) {
    try {
        const instanceId = Bloom._instanceId;
        if (!instanceId) return false;
        if (command === 'bloom') return true;
        const { BotSettings } = createInstanceModels(instanceId);
        const settings = await BotSettings.findById('global') || await BotSettings.create({ _id: 'global' });
        return settings.activeInstance === instanceId;
    } catch (error) {
        log('Instance check middleware error:', error);
        return false; // On error, don't process commands
    }
}

module.exports = instanceCheckMiddleware; 