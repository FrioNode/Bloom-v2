const config = require('./config');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { log } = require('./logger');
const { start } = require('./whatsappClient');

class StartupManager {
    constructor() {
        this.qrCallbacks = new Map();
        this.currentStartupInstance = null;
    }

    sortInstancesByPriority() {
        return [...config.instances].sort((a, b) => a.priority - b.priority);
    }

    async checkSession(instance) {
        const sessionDir = path.join(__dirname, instance.sessionDir);
        const credsPath = path.join(sessionDir, 'creds.json');
        
        try {
            await fs.access(credsPath);
            // Validate the session file
            const data = await fs.readFile(credsPath, 'utf8');
            JSON.parse(data); // Try to parse to ensure it's valid JSON
            return true;
        } catch {
            return false;
        }
    }

    async downloadSession(instance) {
        if (!instance.sessionToken || !instance.sessionToken.startsWith("BLOOM~")) {
            log(`⚠️ No valid session token for ${instance.id}`);
            return false;
        }

        const sessionDir = path.join(__dirname, instance.sessionDir);
        const credsPath = path.join(sessionDir, 'creds.json');
        const pasteId = instance.sessionToken.split("BLOOM~")[1];
        
        try {
            // Ensure session directory exists
            await fs.mkdir(sessionDir, { recursive: true });
            
            const response = await axios.get(`https://pastebin.com/raw/${pasteId}`);
            const data = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            
            // Validate the session data
            try {
                JSON.parse(data);
            } catch {
                throw new Error('Invalid session data format');
            }
            
            await fs.writeFile(credsPath, data);
            log(`✅ Session downloaded for ${instance.id}`);
            return true;
        } catch (error) {
            log(`❌ Failed to download session for ${instance.id}: ${error.message}`);
            return false;
        }
    }

    registerQRCallback(instanceId, callback) {
        this.qrCallbacks.set(instanceId, callback);
    }

    async handleQR(instanceId, qr) {
        const callback = this.qrCallbacks.get(instanceId);
        if (callback) {
            await callback(qr);
        }
    }

    async startInstance(instance, qrCallback = null) {
        this.currentStartupInstance = instance;
        if (qrCallback) {
            this.registerQRCallback(instance.id, qrCallback);
        }

        let sessionExists = await this.checkSession(instance);
        
        if (!sessionExists) {
            log(`Attempting to download session for ${instance.id}...`);
            sessionExists = await this.downloadSession(instance);
        }

        if (sessionExists) {
            log(`Starting ${instance.id} with existing session...`);
            return await this.start(instance, false);
        } else {
            log(`Starting ${instance.id} with QR login...`);
            return await this.start(instance, true);
        }
    }

    async start(instance, useQR = false) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout starting ${instance.id}`));
            }, config.startup.qrTimeout);

            start(instance, {
                onQR: async (qr) => {
                    await this.handleQR(instance.id, qr);
                },
                onSuccess: () => {
                    clearTimeout(timeout);
                    resolve(true);
                },
                onError: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            }).catch(error => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    async startAll() {
        const instances = this.sortInstancesByPriority();
        const results = [];

        for (const instance of instances) {
            try {
                log(`Starting instance ${instance.id} (Priority: ${instance.priority})...`);
                const success = await this.startInstance(instance);
                results.push({ instance: instance.id, success });
                
                if (config.startup.sequentialStart && config.startup.waitForQR) {
                    // Wait for user confirmation or timeout before proceeding to next instance
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                log(`Failed to start ${instance.id}: ${error.message}`);
                results.push({ instance: instance.id, success: false, error: error.message });
            }
        }

        return results;
    }
}

module.exports = new StartupManager(); 