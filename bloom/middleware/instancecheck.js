const { createInstanceModels } = require('../../colors/schema');
const { isBloomKing } = require('../../colors/auth');
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
 * Middleware to check if the current instance is active
 * @param {Object} Bloom - The Bloom instance
 * @param {Object} message - The message object
 * @param {string} command - The command being executed
 * @returns {Promise<boolean>} - Whether to continue processing the command
 */
async function instanceCheckMiddleware(Bloom, message, command) {
    try {
        const instanceId = Bloom._instanceId;
        if (!instanceId) {
            log('No instance ID found');
            return false;
        }
        
        // Always allow bloom command
        if (command === 'bloom') return true;

        // Get or initialize instance-specific model
        const BotSettings = await getInstanceModel(instanceId);
        if (!BotSettings) {
            return false;
        }

        // Get or create settings
        try {
            let settings = await BotSettings.findById('global');
            if (!settings) {
                settings = await BotSettings.create({ _id: 'global', activeInstance: instanceId });
                log(`Created new BotSettings document for instance ${instanceId}`);
            }
            return settings.activeInstance === instanceId;
        } catch (err) {
            log(`Failed to access BotSettings for instance ${instanceId}:`, err);
            return false;
        }
    } catch (error) {
        log('Instance check middleware error:', error);
        return false; // On error, don't process commands
    }
}

module.exports = instanceCheckMiddleware; 