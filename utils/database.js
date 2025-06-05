const mongoose = require('mongoose');
const { log } = require('./logger');
const { mongo } = require('../colors/setup');

const uri = mongo || process.env.MONGODB_URI || 'mongodb://localhost:27017/bloom';
let isConnected = false;
let connectionPromise = null;

async function connect() {
    if (connectionPromise) {
        return connectionPromise;
    }

    connectionPromise = new Promise(async (resolve, reject) => {
        try {
            if (isConnected) {
                resolve();
                return;
            }

            // Clear any existing connections
            if (mongoose.connection.readyState !== 0) {
                await mongoose.connection.close();
            }

            await mongoose.connect(uri, {
                maxPoolSize: 50,
                minPoolSize: 10,
                serverSelectionTimeoutMS: 30000,
                socketTimeoutMS: 45000,
                family: 4,
                connectTimeoutMS: 30000,
                retryWrites: true,
                w: 'majority',
                keepAlive: true,
                keepAliveInitialDelay: 300000
            });

            isConnected = true;
            log('✅ MongoDB connected successfully');
            resolve();
        } catch (error) {
            connectionPromise = null;
            isConnected = false;
            log('❌ MongoDB connection error:', error);
            reject(error);
        }
    });

    return connectionPromise;
}

mongoose.connection.on('connected', () => {
    isConnected = true;
    log('✅ MongoDB connection established');
});

mongoose.connection.on('error', (err) => {
    isConnected = false;
    connectionPromise = null;
    log('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    isConnected = false;
    connectionPromise = null;
    log('❌ MongoDB disconnected');
    
    // Attempt to reconnect
    setTimeout(() => {
        if (!isConnected) {
            log('🔄 Attempting to reconnect to MongoDB...');
            connect().catch(err => log('❌ Reconnection failed:', err));
        }
    }, 5000);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        log('💤 MongoDB connection closed through app termination');
        process.exit(0);
    } catch (err) {
        log('❌ Error during MongoDB shutdown:', err);
        process.exit(1);
    }
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

// Wait for connection before allowing operations
async function waitForConnection(timeout = 30000) {
    const start = Date.now();
    
    while (!isConnected && Date.now() - start < timeout) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!isConnected) {
        throw new Error('MongoDB connection timeout');
    }
}

// Initialize connection at module load
connect().catch(err => log('❌ Initial connection failed:', err));

module.exports = { 
    createModel,
    connect,
    waitForConnection,
    isConnected: () => isConnected
}; 