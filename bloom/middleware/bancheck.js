const { createInstanceModels } = require('../../colors/schema');
const getMessages = require('../../colors/mess');
const mess = getMessages();
/**
 * Middleware to check if a user is banned
 * @param {Object} Bloom - The Bloom instance
 * @param {Object} message - The message object
 * @returns {boolean} - Whether to continue processing the command
 */
async function banCheckMiddleware(Bloom, message) {
    try {
        // Get the correct sender JID (handles both group and private chats)
        const sender = message.key.participant || message.key.remoteJid;
        if (!sender) return true;

        const { User } = createInstanceModels(Bloom._instanceId);
        
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
    } catch (error) {
        console.error('Ban check middleware error:', error);
        return true; // On error, allow command to proceed
    }
}

module.exports = banCheckMiddleware; 