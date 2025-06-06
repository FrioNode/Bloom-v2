const { sudochat } = require('./setup');
const mess = require('./mess');
const fs = require('fs').promises;
const path = require('path');
const config = require('../utils/config');

// ID Utilities - Now using a Map to store IDs for each instance
const BOT_IDS = new Map();

const loadCreds = async (instanceId) => {
    try {
        const instance = config.instances.find(i => i.id === instanceId);
        if (!instance) throw new Error(`Invalid instance ID: ${instanceId}`);
        
        const credsPath = path.join(__dirname, '..', instance.sessionDir, 'creds.json');
        const data = await fs.readFile(credsPath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
};

const normalizeJid = (jid) => {
    if (!jid) return null;
    // Remove device/agent suffix from JID
    jid = jid.split(':')[0];
    // Convert pure number to JID format if needed
    return jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
};

const normalizeLid = (lid) => {
    if (!lid) return null;
    return lid.includes('@') ? lid : `${lid}@lid`;
};

const initBotId = async (Bloom) => {
    const instanceId = Bloom._instanceId;
    if (!instanceId) {
        console.warn('Warning: No instance ID found in Bloom object');
        return;
    }

    const creds = await loadCreds(instanceId);
    let botJid, botLid;

    if (creds?.me) {
        botJid = normalizeJid(creds.me.id);
        botLid = creds.me.lid ? normalizeLid(creds.me.lid) : null;
    } else {
        botJid = normalizeJid(Bloom.user?.id);
        botLid = Bloom.me?.lid ? normalizeLid(Bloom.me.lid) : null;
    }

    // Store both IDs for this instance
    BOT_IDS.set(instanceId, { jid: botJid, lid: botLid });
    console.log(`Bot IDs initialized for ${instanceId}:`, { jid: botJid, lid: botLid });
};

const getBotIds = (Bloom) => {
    const instanceId = Bloom._instanceId;
    if (!instanceId) {
        console.warn('Warning: No instance ID found in Bloom object');
        return { jid: null, lid: null };
    }
    return BOT_IDS.get(instanceId) || { jid: null, lid: null };
};

const participantMatches = (participant, targetJid, targetLid) => {
    // First try direct JID match
    if (normalizeJid(participant.id) === normalizeJid(targetJid)) {
        return true;
    }
    
    // If we have a LID to compare and participant has a LID property
    if (targetLid && participant.lid) {
        return normalizeLid(participant.lid) === normalizeLid(targetLid);
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
        // Log participant IDs for debugging
        console.log('Group participants:', metadata.participants.map(p => ({ 
            id: p.id, 
            lid: p.lid,
            admin: p.admin
        })));
        return metadata;
    } catch (error) {
        console.error('Error fetching group metadata:', error);
        await Bloom.sendMessage(groupId, { text: mess.gmetafail });
        return null;
    }
};

const isBotAdmin = async (Bloom, message) => {
    const metadata = await fetchGroupMetadata(Bloom, message);
    if (!metadata) return false;

    const { jid: BOT_JID, lid: BOT_LID } = getBotIds(Bloom);
    const botMatch = metadata.participants.find(p => 
        participantMatches(p, BOT_JID, BOT_LID)
    );
    
    const isAdmin = ['admin', 'superadmin'].includes(botMatch?.admin);
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
    // Try to get sender's LID from Baileys if available
    const senderLid = message.key.lid || message.lid;

    const senderMatch = metadata.participants.find(p => 
        participantMatches(p, senderId, senderLid)
    );
    
    const isAdmin = ['admin', 'superadmin'].includes(senderMatch?.admin);
    console.log('Sender admin check:', { 
        senderId, 
        senderLid,
        matchedParticipant: senderMatch,
        isAdmin 
    });
    return isAdmin;
};

const isBloomKing = (sender, message) => {
    const checkId = sender.endsWith('@g.us') ? message.key.participant : sender;
    // For superadmin, we'll check both JID and LID if available
    return normalizeJid(checkId) === normalizeJid(sudochat) || 
           (message.key.lid && normalizeLid(message.key.lid) === normalizeLid(sudochat));
};

const isGroupAdminContext = async (Bloom, message) => {
    const { jid: BOT_JID, lid: BOT_LID } = getBotIds(Bloom);
    if (!BOT_JID) await initBotId(Bloom);

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
    initBotId: async (Bloom) => { await initBotId(Bloom); }
};