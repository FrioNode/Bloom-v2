const { createInstanceModels } = require('../../colors/schema');
const mess = require('../../colors/mess');
const { log } = require('../../utils/logger');

// Cache models per instance
const modelCache = new Map();

/**
 * Get or initialize User model for an instance
 * @param {string} instanceId - The instance ID
 * @returns {Promise<mongoose.Model>} The User model
 */
async function getInstanceModel(instanceId) {
    let User = modelCache.get(instanceId);
    if (!User) {
        try {
            const models = await createInstanceModels(instanceId);
            if (!models?.User) {
                throw new Error(`Failed to initialize User model for instance ${instanceId}`);
            }
            User = models.User;
            modelCache.set(instanceId, User);
        } catch (error) {
            log(`Failed to initialize User model for instance ${instanceId}:`, error);
            return null;
        }
    }
    return User;
}

/**
 * Middleware to check if a user is banned
 * @param {Object} Bloom - The Bloom instance
 * @param {Object} message - The message object
 * @returns {Promise<boolean>} - Whether to continue processing the command
 */
async function banCheckMiddleware(Bloom, message) {
    try {
        // Get the correct sender JID (handles both group and private chats)
        const sender = message.key.participant || message.key.remoteJid;
        if (!sender) return true;

        // Get or initialize instance-specific model
        const User = await getInstanceModel(Bloom._instanceId);
        if (!User) {
            log(`Could not access User model for ban check (instance: ${Bloom._instanceId})`);
            return true; // On model error, allow command to proceed
        }
        
        try {
            // Find the user
            const user = await User.findOne({ _id: sender });
            
            // If user doesn't exist in database, they're not banned
            if (!user) return true;

            // Check if user is banned
            if (user.isBanned) {
                const banMessage = user.banReason 
                    ? `┌──── ⛔ Banned User ────\n├ You are banned from using the bot\n└─ Reason: ${user.banReason}`
                    : `┌──── ⛔ Banned User ────\n└─ You are banned from using the bot`;

                await Bloom.sendMessage(message.key.remoteJid, {
                    text: banMessage
                }, { quoted: message });
                
                return false;
            }

            return true;
        } catch (err) {
            log(`Database error in ban check for user ${sender}:`, err);
            return true; // On database error, allow command to proceed
        }
    } catch (error) {
        log('Ban check middleware error:', error);
        return true; // On error, allow command to proceed
    }
}

module.exports = banCheckMiddleware; 