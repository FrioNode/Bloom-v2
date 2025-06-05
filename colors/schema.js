const mongoose = require('mongoose');
const { log } = require('../utils/logger');
const { createModel, connect, waitForConnection, isConnected } = require('../utils/database');

const pokemonSchema = new mongoose.Schema({
    name: { type: String, required: true },
    weight: { type: Number, required: true },
    height: { type: Number, required: true },
    image: { type: String, required: true },
    description: { type: String, required: true },
    timeout: { type: Date, required: true },
});

const userSchema = new mongoose.Schema({
    _id: { type: String },
    name: { type: String, required: true },
    walletBalance: { type: Number, default: 0 },
    bankBalance: { type: Number, default: 0 },
    isBanned: { type: Boolean, default: false },
    banReason: { type: String },
    lastActivity: { type: Date, default: Date.now },
    inventory: {
        mining: [{
            name: { type: String, required: true },
            miningUses: { type: Number, default: 0 },
        }],
        magic: [{
            name: { type: String, required: true },
            miningUses: { type: Number, default: 0 },
        }],
        fishing: [{
            name: { type: String, required: true },
            miningUses: { type: Number, default: 0 },
        }],
        healing: [{
            name: { type: String, required: true },
            miningUses: { type: Number, default: 0 },
        }],
        animals: [{
            name: { type: String, required: true },
            value: { type: Number, required: true },
        }],
        stones: [{
            name: { type: String, required: true },
            value: { type: Number, required: true },
        }],
        pokemons: [{
            name: { type: String, required: true },
            height: { type: Number, required: true },
            weight: { type: Number, require: true },
            image: { type: String, required: true },
            description: { type: String, required: true },
        }],
    },
    transactionHistory: [{
        type: Object,
        arg: Number,
        item: String,
        result: String,
        transactionFee: { type: Number, default: 0 },
        animal: String,
        date: { type: Date, default: Date.now },
    }],
    lastDailyClaim: { type: Date, default: Date.now },
    lastZooCatch: { type: Date, default: Date.now },
    lastGamble: { type: Date, default: Date.now },
    lastWork: { type: Date, default: Date.now },
    lastFishCatch: { type: Date, default: Date.now },
});

const expSchema = new mongoose.Schema({
    jid: { type: String, required: true, unique: true },
    points: { type: Number, default: 0 },
    lastDaily: Date,
    streak: { type: Number, default: 0 },
    messageCount: { type: Number, default: 0 },
}, { timestamps: true });

const settingsSchema = new mongoose.Schema({
    group: { type: String, required: true, unique: true },
    antiLink: { type: Boolean, default: false },
    noImage: { type: Boolean, default: false },
    gameEnabled: { type: Boolean, default: true },
    nsfwEnabled: { type: Boolean, default: false },
    commandsEnabled: { type: Boolean, default: true },
    warns: { type: Map, of: Number, default: {} }
});

const userCounterSchema = new mongoose.Schema({
    user: { type: String, required: true, unique: true },
    count: { type: Number, default: 1 },
    lastUpdated: { type: Date, default: Date.now }
});

const afkSchema = new mongoose.Schema({
    user: { type: String, required: true, unique: true }, // WhatsApp JID
    reason: { type: String, default: '' },
    since: { type: Date, default: Date.now }
});

const TicTacToeSchema = new mongoose.Schema({
    roomId: { type: String, required: true, unique: true },
    groupId: { type: String },
    player1: {
        jid: { type: String, required: true },
        name: { type: String }, // Add this
        symbol: { type: String, default: '❌' }
    },
   player2: {
        jid: { type: String, default: null },
        name: { type: String },
        symbol: { type: String, default: '⭕' }
    },
    board: { type: [String], default: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '] },
    currentTurn: { type: String },
    status: { type: String, enum: ['waiting', 'active', 'ended'], default: 'waiting' },
    createdAt: { type: Date, default: Date.now },
    timeoutAt: { type: Date }
});

const reminderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    chatId: { type: String, required: true },
    text: { type: String, required: true },
    remindAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    reminded: { type: Boolean, default: false }
});

const ticketSchema = new mongoose.Schema({
    ticketId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    subject: { type: String, required: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    messages: [{
        sender: { type: String, required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    closedAt: { type: Date }
});

const counterSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    number: { type: Number, default: 0 },
    letter: { type: String, default: 'A' }
});

const botSettingsSchema = new mongoose.Schema({
    _id: { type: String, default: 'global' },
    maintenanceMode: { type: Boolean, default: false },
    lastMaintenanceUpdate: { type: Date, default: Date.now },
    maintenanceReason: { type: String, default: '' },
    activeInstance: { type: String, default: 'bot1' }  // Stores the ID of the currently active instance
}, { timestamps: true });

// Export models with instance-specific creation
async function createInstanceModels(instanceId) {
    // Wait for connection before creating models
    try {
        if (!isConnected()) {
            await connect();
            await waitForConnection();
        }

        const models = {
            Pokemon: createModel(instanceId, 'Pokemon', pokemonSchema),
            User: createModel(instanceId, 'User', userSchema),
            Settings: createModel(instanceId, 'Settings', settingsSchema),
            Exp: createModel(instanceId, 'Exp', expSchema),
            AFK: createModel(instanceId, 'AFK', afkSchema),
            TicTacToe: createModel(instanceId, 'TicTacToe', TicTacToeSchema),
            Reminder: createModel(instanceId, 'Reminder', reminderSchema),
            Ticket: createModel(instanceId, 'Ticket', ticketSchema),
            Counter: createModel(instanceId, 'Counter', counterSchema),
            UserCounter: createModel(instanceId, 'UserCounter', userCounterSchema),
            BotSettings: createModel(instanceId, 'BotSettings', botSettingsSchema)
        };

        // Verify all models have required methods
        for (const [name, model] of Object.entries(models)) {
            const requiredMethods = ['find', 'findOne', 'findById', 'deleteMany', 'countDocuments'];
            for (const method of requiredMethods) {
                if (typeof model[method] !== 'function') {
                    throw new Error(`Model ${name} is missing required method: ${method}`);
                }
            }
        }

        return models;
    } catch (error) {
        log(`❌ Error creating models for instance ${instanceId}:`, error);
        throw error;
    }
}

async function connectDB(moduleName) {
    try {
        if (!isConnected()) {
            await connect();
            await waitForConnection();
            log(`✅ [${moduleName}] Connected to MongoDB`);
        }
    } catch (error) {
        log(`❌ [${moduleName}] MongoDB connection error:`, error);
        throw error; // Let the caller handle the error
    }
}

module.exports = {
    createInstanceModels,
    connectDB
};