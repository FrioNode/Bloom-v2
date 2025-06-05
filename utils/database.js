const mongoose = require('mongoose');
const { log } = require('./logger');
const { mongo } = require('../colors/setup');

const uri = mongo || process.env.MONGODB_URI || 'mongodb://localhost:27017/bloom';

// Function to safely parse and debug MongoDB URI
function debugMongoURI(uri) {
    try {
        const maskedURI = uri.replace(/:([^@/]+)@/, ':****@');
        const parts = new URL(maskedURI);
        return {
            protocol: parts.protocol,
            host: parts.host,
            pathname: parts.pathname,
            database: parts.pathname.split('/')[1] || 'NO_DATABASE_SPECIFIED',
            search: parts.search ? 'Has query parameters' : 'No query parameters'
        };
    } catch (error) {
        return { error: 'Invalid URI format' };
    }
}

let isConnected = false;
let connectionPromise = null;

// Cache for connections and models
const connections = new Map();
const modelCache = new Map();

// Log initial configuration
const uriInfo = debugMongoURI(uri);
log([
    '🔄 MongoDB Configuration:',
    `- Node Environment: ${process.env.NODE_ENV}`,
    `- Connection URI type: ${uri.startsWith('mongodb+srv') ? 'Atlas (SRV)' : 'Standard'}`,
    `- Protocol: ${uriInfo.protocol}`,
    `- Host: ${uriInfo.host}`,
    `- Database: ${uriInfo.database}`,
    `- Query Params: ${uriInfo.search}`
].join('\n'));

// Disable mongoose buffering
mongoose.set('bufferCommands', false);
mongoose.set('debug', process.env.NODE_ENV !== 'production');

async function connect() {
    if (connectionPromise) {
        return connectionPromise;
    }

    // If no database is specified in the URI, append default database
    let connectionURI = uri;
    const uriInfo = debugMongoURI(uri);
    if (uriInfo.database === 'NO_DATABASE_SPECIFIED') {
        const hasParams = uri.includes('?');
        connectionURI = `${uri}${hasParams ? '&' : '?'}dbname=bloom`;
        log('⚠️ No database specified in URI, using default database: bloom');
    }

    connectionPromise = new Promise(async (resolve, reject) => {
        try {
            if (isConnected) {
                resolve();
                return;
            }

            // Clear any existing connections
            if (mongoose.connection.readyState !== 0) {
                log('🔄 Closing existing connection...');
                await mongoose.connection.close();
            }

            log('🔄 Attempting to connect to MongoDB...');
            await mongoose.connect(connectionURI);
            
            // Test the connection with a simple operation
            await mongoose.connection.db.admin().ping();
            
            isConnected = true;
            log([
                '✅ MongoDB connected successfully',
                `- Server: ${mongoose.connection.host}`,
                `- Database: ${mongoose.connection.db.databaseName}`,
                `- Port: ${mongoose.connection.port}`
            ].join('\n'));
            resolve();
        } catch (error) {
            connectionPromise = null;
            isConnected = false;
            log('❌ MongoDB connection error:', error);
            if (error.name === 'MongoServerSelectionError') {
                log([
                    '⚠️ Could not reach MongoDB server. Please check:',
                    '1. MongoDB server is running',
                    '2. Network connectivity',
                    '3. Firewall settings',
                    '4. MongoDB URI is correct',
                    `5. Current URI format: ${debugMongoURI(connectionURI).protocol}//${debugMongoURI(connectionURI).host}`
                ].join('\n'));
            }
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
    const cacheKey = `${instanceId}:${modelName}`;
    
    // Return cached model if exists
    if (modelCache.has(cacheKey)) {
        return modelCache.get(cacheKey);
    }

    try {
        // Ensure schema is actually a mongoose schema
        const actualSchema = schema instanceof mongoose.Schema ? schema : new mongoose.Schema(schema);
        
        // Get or create connection for this instance
        const dbName = instanceId === 'cleanup' ? 'bloom' : `bloom_${instanceId}`;
        let conn = connections.get(dbName);
        
        if (!conn) {
            conn = mongoose.connection.useDb(dbName, { useCache: true });
            connections.set(dbName, conn);
        }

        // Create or get the model
        let model;
        try {
            model = conn.model(modelName);
        } catch (e) {
            if (e.name === 'MissingSchemaError') {
                model = conn.model(modelName, actualSchema);
            } else {
                throw e;
            }
        }

        // Verify model has necessary methods
        const requiredMethods = ['find', 'findOne', 'findById', 'deleteMany', 'countDocuments'];
        for (const method of requiredMethods) {
            if (typeof model[method] !== 'function') {
                throw new Error(`Model ${modelName} is missing required method: ${method}`);
            }
        }

        modelCache.set(cacheKey, model);
        return model;
    } catch (error) {
        log(`❌ Error creating model ${modelName} for instance ${instanceId}:`, error);
        throw error;
    }
}

async function waitForConnection(timeout = 30000) {
    if (!connectionPromise) {
        await connect();
    }
    
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