const { createInstanceModels } = require('../../colors/schema');
const { isBloomKing } = require('../../colors/auth');

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

                const { BotSettings } = createInstanceModels(Bloom._instanceId);
                const settings = await BotSettings.findById('global') || await BotSettings.create({ _id: 'global' });

                // Toggle instance
                const currentActive = settings.activeInstance;
                settings.activeInstance = targetInstance;
                await settings.save();

                const msg = `┌──── ⚙️ Instance Update ────\n├ Previous active: ${currentActive}\n└─ Now active: ${targetInstance}`;
                await Bloom.sendMessage(message.key.remoteJid, { text: msg });

            } catch (error) {
                console.error('Error in bloom command:', error);
                await Bloom.sendMessage(message.key.remoteJid, { 
                    text: `┌──── ❌ Error ────\n└─ Failed to update instance state` 
                });
            }
        }
    }
}; 