const { createInstanceModels } = require('./schema');

// Simple Pokémon name generator
function getRandomPokemonName() {
    const pokemon = [
        'Pikachu', 'Charmander', 'Bulbasaur', 'Squirtle', 'Eevee',
        'Jigglypuff', 'Meowth', 'Psyduck', 'Snorlax', 'Gengar',
        'Machop', 'Magikarp', 'Dratini', 'Togepi', 'Lucario'
    ];
    return pokemon[Math.floor(Math.random() * pokemon.length)];
}

async function trackUsage(message, instanceId) {
    if (!message || !instanceId) return;

    try {
        const models = await createInstanceModels(instanceId);
        const { Exp, User, Settings } = models;

        const groupJid = message.key.remoteJid?.endsWith('@g.us') ? message.key.remoteJid : null;
        const senderJid = message.key.participant || message.key.remoteJid;

        // Get a user-friendly name
        const pushName = message.pushName;
        const fallbackName = pushName || getRandomPokemonName() || senderJid.split('@')[0];

        // 1. Group setup
        if (groupJid) {
            await Settings.findOneAndUpdate(
                { group: groupJid },
                {
                    $setOnInsert: {
                        group: groupJid,
                        commandsEnabled: true
                    }
                },
                { upsert: true }
            );
        }

        // 2. User activity tracking
        if (senderJid && !senderJid.endsWith('@broadcast')) {
            await Exp.findOneAndUpdate(
                { jid: senderJid },
                { $inc: { points: 1, messageCount: 1 } },
                { upsert: true }
            );

            await User.findOneAndUpdate(
                { _id: senderJid },
                {
                    lastActivity: new Date(),
                                        $setOnInsert: {
                                            name: fallbackName,
                                            inGroups: groupJid ? [groupJid] : []
                                        }
                },
                { upsert: true }
            );

            if (groupJid) {
                await User.updateOne(
                    { _id: senderJid },
                    { $addToSet: { inGroups: groupJid } }
                );
            }
        }
    } catch (err) {
        console.error('❌ Error tracking activity:', err);
    }
}

module.exports = { trackUsage };
