const mongoose = require('mongoose');
const { log } = require('./utils/logger');
const { mongo } = require('./colors/setup');

const uri = mongo || process.env.MONGODB_URI || 'mongodb://localhost:27017/bloom';

mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
});

mongoose.connection.on('connected', () => {
    log('✅ MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
    log('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    log('❌ MongoDB disconnected');
});

function createModel(instanceId, modelName, schema) {
    const dbName = instanceId === 'cleanup' ? 'bloom' : `bloom_${instanceId}`;
    const connection = mongoose.connection.useDb(dbName);
    
    try {
        return connection.model(modelName, schema);
    } catch (error) {
        // If model already exists, return it
        if (error.name === 'OverwriteModelError') {
            return connection.model(modelName);
        }
        throw error;
    }
}

module.exports = { createModel }; 