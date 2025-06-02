const { sudochat } = require('./setup');
const mess = require('./mess');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

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

const normalizeId = (jid) => {
    if (!jid) return jid;
    jid = jid.split(':')[0];
    return jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
};

const initBotId = async (Bloom) => {
    // Get instance ID from Bloom object
    const instanceId = Bloom._instanceId;
    if (!instanceId) {
        console.warn('Warning: No instance ID found in Bloom object');
        return;
    }

    const creds = await loadCreds(instanceId);
    let botJid, botLid;

    if (creds?.me) {
        botJid = normalizeId(creds.me.id);
        botLid = normalizeId(creds.me.lid).replace('@s.whatsapp.net', '@lid');
    } else {
        botJid = normalizeId(Bloom.user?.id);
        botLid = Bloom.me?.lid
            ? normalizeId(Bloom.me.lid).replace('@s.whatsapp.net', '@lid')
            : botJid.replace('@s.whatsapp.net', '@lid');
    }

    // Store IDs for this instance
    BOT_IDS.set(instanceId, { jid: botJid, lid: botLid });
};

const getBotIds = (Bloom) => {
    const instanceId = Bloom._instanceId;
    if (!instanceId) {
        console.warn('Warning: No instance ID found in Bloom object');
        return { jid: null, lid: null };
    }
    return BOT_IDS.get(instanceId) || { jid: null, lid: null };
};

const idsMatch = (a, b) => {
    if (!a || !b) return false;
    return a.split('@')[0].split(':')[0] === b.split('@')[0].split(':')[0];
};

const fetchGroupMetadata = async (Bloom, message) => {
    const groupId = message.key.remoteJid;
    if (!groupId.endsWith('@g.us')) {
        await Bloom.sendMessage(groupId, { text: mess.group });
        return null;
    }

    try {
        return await Bloom.groupMetadata(groupId);
    } catch {
        await Bloom.sendMessage(groupId, { text: mess.gmetafail });
        return null;
    }
};

const isBotAdmin = async (Bloom, message) => {
    const metadata = await fetchGroupMetadata(Bloom, message);
    if (!metadata) return false;

    const { jid: BOT_JID, lid: BOT_LID } = getBotIds(Bloom);
    const botMatch = metadata.participants.find(p =>
        idsMatch(p.id, BOT_JID) || (BOT_LID && idsMatch(p.id, BOT_LID))
    );
    return ['admin', 'superadmin'].includes(botMatch?.admin);
};

const isSenderAdmin = async (Bloom, message) => {
    const metadata = await fetchGroupMetadata(Bloom, message);
    if (!metadata) return false;

    const senderId = message.key.participant || message.participant;
    if (!senderId) return false;

    const senderMatch = metadata.participants.find(p => idsMatch(p.id, senderId));
    return ['admin', 'superadmin'].includes(senderMatch?.admin);
};

const isBloomKing = (sender, message) => {
    const checkId = sender.endsWith('@g.us') ? message.key.participant : sender;
    return idsMatch(checkId, sudochat);
};

const isGroupAdminContext = async (Bloom, message) => {
    const { jid: BOT_JID, lid: BOT_LID } = getBotIds(Bloom);
    if (!BOT_JID) await initBotId(Bloom);

    const metadata = await fetchGroupMetadata(Bloom, message);
    if (!metadata) return false;

    const senderId = message.key.participant || message.participant;
    const botParticipant = metadata.participants.find(p =>
        idsMatch(p.id, BOT_JID) || (BOT_LID && idsMatch(p.id, BOT_LID))
    );
    const senderParticipant = metadata.participants.find(p => idsMatch(p.id, senderId));

    const botAdmin = ['admin', 'superadmin'].includes(botParticipant?.admin);
    const senderAdmin = ['admin', 'superadmin'].includes(senderParticipant?.admin);

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