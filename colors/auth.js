const { sudochat, sudolid } = require('./setup');
const mess = require('./mess');
const fs = require('fs').promises;
const path = require('path');
const config = require('../utils/config');

const BOT_IDS = new Map();

const loadCreds = async (instanceId) => {
    try {
        const instance = config.instances.find(i => i.id === instanceId);
        if (!instance) throw new Error(`Invalid instance ID: ${instanceId}`);
        const credsPath = path.join(__dirname, '..', instance.sessionDir, 'creds.json');
        const data = await fs.readFile(credsPath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading credentials:', error);
        return null;
    }
};

const normalizeJid = (jid) => {
    if (!jid) return null;
    // Remove any suffix after ':' and ensure proper format
    jid = jid.split(':')[0].split('@')[0];
    return jid ? `${jid}@s.whatsapp.net` : null;
};

const normalizeLid = (lid) => {
    if (!lid) return null;
    return lid.split(':')[0] + '@lid';
};

const initBotId = async (Bloom) => {
    const instanceId = Bloom._instanceId;
    if (!instanceId) return;

    // Try multiple sources for bot identity
    let botJid = null, botLid = null;

    // 1. Check Bloom's user object first
    if (Bloom?.user?.id) {
        botJid = normalizeJid(Bloom.user.id);
        botLid = Bloom.user.lid ? normalizeLid(Bloom.user.lid) : null;
    }

    // 2. If not found, try loading from credentials
    if (!botJid) {
        const creds = await loadCreds(instanceId);
        if (creds?.me?.id) {
            botJid = normalizeJid(creds.me.id);
            botLid = creds.me.lid ? normalizeLid(creds.me.lid) : null;
        }
    }

    if (botJid) {
        BOT_IDS.set(instanceId, { jid: botJid, lid: botLid });
        console.log(`Bot IDs initialized for ${instanceId}:`, { jid: botJid, lid: botLid });
    } else {
        console.error(`Failed to initialize bot ID for instance ${instanceId}`);
    }
};

const getBotIds = (Bloom) => {
    const instanceId = Bloom._instanceId;
    if (!instanceId) return { jid: null, lid: null };

    if (!BOT_IDS.has(instanceId)) {
        console.warn(`Bot IDs not initialized for instance ${instanceId}`);
        return { jid: null, lid: null };
    }

    return BOT_IDS.get(instanceId);
};

const participantMatches = (participant, targetJid, targetLid) => {
    if (!participant || !participant.id) return false;
    if (targetJid && (
        participant.id === targetJid || // Exact match
        normalizeJid(participant.id) === normalizeJid(targetJid) // Normalized
    )) return true;
    if (targetLid && (
        participant.id === targetLid || // Exact LID match
        (participant.lid && normalizeLid(participant.lid) === normalizeLid(targetLid)) // Normalized
    )) return true;
    if (targetLid && participant.id.endsWith('@lid') && participant.id === targetLid) {
        return true;
    }
    return false;
};

const fetchGroupMetadata = async (Bloom, message) => {
    const groupId = message.key.remoteJid;
    if (!groupId.endsWith('@g.us')) {
        await Bloom.sendMessage(groupId, { text: mess.group });
        return null;
    }

    try {
        const metadata = await Bloom.groupMetadata(groupId);
        console.log('Group participants:', metadata.participants.map(p => ({
            id: p.id, lid: p.lid, admin: p.admin
        })));
        return metadata;
    } catch (error) {
        console.error('Error fetching group metadata:', error);
        await Bloom.sendMessage(groupId, { text: mess.gmetafail });
        return null;
    }
};

const isBotAdmin = async (Bloom, message) => {
    await initBotId(Bloom);

    const metadata = await fetchGroupMetadata(Bloom, message);
    if (!metadata) return false;

    const { jid: BOT_JID, lid: BOT_LID } = getBotIds(Bloom);
    if (!BOT_JID) {
        console.error('Bot JID not available for admin check');
        return false;
    }

    const botMatch = metadata.participants.find(p =>
    participantMatches(p, BOT_JID, BOT_LID)
    );

    const isAdmin = botMatch && ['admin', 'superadmin'].includes(botMatch.admin);
    console.log('Bot admin check:', {
        botJid: BOT_JID,
        botLid: BOT_LID,
        matchedParticipant: botMatch,
        isAdmin
    });
    return isAdmin;
};

const isSenderAdmin = async (Bloom, message) => {
    const metadata = await fetchGroupMetadata(Bloom, message);
    if (!metadata) return false;

    const senderId = message.key.participant || message.participant;
    const senderLid = message.key.lid || message.lid;

    const senderMatch = metadata.participants.find(p =>
    participantMatches(p, senderId, senderLid)
    );

    const isAdmin = ['admin', 'superadmin'].includes(senderMatch?.admin);
    console.log('Sender admin check:', { senderId, senderLid, matchedParticipant: senderMatch, isAdmin });
    return isAdmin;
};

const isBloomKing = (sender, message) => {
    const checkId = sender.endsWith('@g.us') ? message.key.participant : sender;
    return (
        normalizeJid(checkId) === normalizeJid(sudochat) ||
        (message.key.lid && normalizeLid(message.key.lid) === normalizeLid(sudolid)) ||
        (checkId.endsWith('@lid') && checkId === sudolid)
    );
}

const isGroupAdminContext = async (Bloom, message) => {
    await initBotId(Bloom);
    const { jid: BOT_JID, lid: BOT_LID } = getBotIds(Bloom);

    const metadata = await fetchGroupMetadata(Bloom, message);
    if (!metadata) return false;

    const senderId = message.key.participant || message.participant;
    const senderLid = message.key.lid || message.lid;

    const botParticipant = metadata.participants.find(p =>
    participantMatches(p, BOT_JID, BOT_LID)
    );
    const senderParticipant = metadata.participants.find(p =>
    participantMatches(p, senderId, senderLid)
    );

    const botAdmin = ['admin', 'superadmin'].includes(botParticipant?.admin);
    const senderAdmin = ['admin', 'superadmin'].includes(senderParticipant?.admin);

    console.log('Group admin context check:', {
        botJid: BOT_JID,
        botLid: BOT_LID,
        senderId,
        senderLid,
        botMatch: botParticipant,
        senderMatch: senderParticipant,
        botAdmin,
        senderAdmin
    });

    if (!botAdmin) await Bloom.sendMessage(message.key.remoteJid, { text: mess.botadmin });
    if (!senderAdmin) await Bloom.sendMessage(message.key.remoteJid, { text: mess.youadmin });

    return botAdmin && senderAdmin;
};

module.exports = {
    fetchGroupMetadata,
    isBotAdmin,
    isSenderAdmin,
    isBloomKing,
    isGroupAdminContext,
    initBotId,
    getBotIds
};
