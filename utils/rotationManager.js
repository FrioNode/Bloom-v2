const config = require('./config');
const { log } = require('./logger');
const fs = require('fs').promises;
const path = require('path');
const { createInstanceModels } = require('../colors/schema');

class RotationManager {
    constructor() {
        this.instances = config.instances;
        this.rotationInterval = null;
        this.isRotating = false;
        this.lastRotationTime = Date.now();
        this.currentRotationHours = 8;
        this.models = null;
    }

    async getModels() {
        if (!this.models) {
            this.models = await createInstanceModels('bot1');
        }
        return this.models;
    }

    async initialize() {
        try {
            // Create session directories if they don't exist
            for (const instance of this.instances) {
                const sessionDir = path.join(__dirname, instance.sessionDir);
                await fs.mkdir(sessionDir, { recursive: true });
            }

            // Initialize BotSettings if not exists
            const { BotSettings } = await this.getModels();
            const settings = await BotSettings.findById('global') || await BotSettings.create({ 
                _id: 'global',
                activeInstance: 'bot1',
                lastRotation: new Date()
            });

            log(`✅ Rotation manager initialized with active instance: ${settings.activeInstance}`);
        } catch (error) {
            log(`❌ Error initializing rotation manager: ${error.message}`);
            throw error; // Propagate error to caller
        }
    }

    async getCurrentActiveInstance() {
        try {
            const { BotSettings } = await this.getModels();
            const settings = await BotSettings.findById('global');
            const activeInstance = settings?.activeInstance || 'bot1';
            
            // Validate that the active instance exists in config
            if (!this.instances.find(i => i.id === activeInstance)) {
                log(`⚠️ Invalid active instance ${activeInstance} in database, resetting to bot1`);
                if (settings) {
                    settings.activeInstance = 'bot1';
                    await settings.save();
                }
                return 'bot1';
            }
            
            return activeInstance;
        } catch (error) {
            log(`❌ Error getting active instance: ${error.message}`);
            return 'bot1';
        }
    }

    async rotateInstance() {
        if (this.isRotating) return;

        try {
            this.isRotating = true;
            const { BotSettings } = await this.getModels();
            const settings = await BotSettings.findById('global');
            
            if (!config.rotationEnabled) {
                log('ℹ️ Rotation is disabled in config');
                return;
            }

            // Get and validate current active instance
            const currentInstanceId = settings.activeInstance;
            if (!currentInstanceId) {
                log('⚠️ No active instance found, defaulting to bot1');
                settings.activeInstance = 'bot1';
                await settings.save();
                return;
            }

            const currentIndex = this.instances.findIndex(i => i.id === currentInstanceId);
            if (currentIndex === -1) {
                log(`⚠️ Invalid active instance ${currentInstanceId}, resetting to bot1`);
                settings.activeInstance = 'bot1';
                await settings.save();
                return;
            }
            
            // Calculate next instance
            const nextIndex = (currentIndex + 1) % this.instances.length;
            const nextInstance = this.instances[nextIndex];

            log(`🔄 Rotating from ${currentInstanceId} to ${nextInstance.id} (${nextIndex + 1}/${this.instances.length})`);

            // Update in database
            settings.activeInstance = nextInstance.id;
            settings.lastRotation = new Date();
            await settings.save();

            // Reset rotation timer with new instance's hours
            this.resetRotationTimer(nextInstance.rotationHours);
            
            log(`✅ Successfully rotated to instance: ${nextInstance.id} (Next rotation in ${nextInstance.rotationHours} hours)`);

            // Broadcast rotation event to all instances
            await this.broadcastRotationEvent(nextInstance.id);

        } catch (error) {
            log(`❌ Error during rotation: ${error.message}`);
        } finally {
            this.isRotating = false;
        }
    }

    async broadcastRotationEvent(newActiveInstance) {
        try {
            for (const instance of this.instances) {
                if (instance.logschat) {
                   // const message = `┌──── 🔄 Instance Rotation ────\n├ New Active: ${newActiveInstance}\n└─ Previous: ${await this.getCurrentActiveInstance()}`;
                }
            }
        } catch (error) {
            log(`❌ Error broadcasting rotation: ${error.message}`);
        }
    }

    resetRotationTimer(hours) {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
            this.rotationInterval = null;
        }

        const rotationInterval = hours * 60 * 60 * 1000;
        this.lastRotationTime = Date.now();
        this.currentRotationHours = hours;
        log(`⏰ Setting rotation timer for ${hours} hours`);
        
        this.rotationInterval = setInterval(() => {
            this.rotateInstance().catch(err => {
                log(`❌ Error during scheduled rotation: ${err.message}`);
            });
        }, rotationInterval);
    }

    getNextRotationTime() {
        if (!this.rotationInterval) return null;
        const nextRotation = this.lastRotationTime + (this.currentRotationHours * 60 * 60 * 1000);
        const now = Date.now();
        return Math.max(0, Math.ceil((nextRotation - now) / (60 * 60 * 1000)));
    }

    async startRotation() {
        try {
            const { BotSettings } = await this.getModels();
            const settings = await BotSettings.findById('global');
            
            if (!config.rotationEnabled) {
                log('ℹ️ Rotation is disabled in config');
                return;
            }

            // If settings don't exist, create them
            if (!settings) {
                log('⚠️ No settings found, initializing with bot1');
                await BotSettings.create({
                    _id: 'global',
                    activeInstance: 'bot1',
                    lastRotation: new Date()
                });
                this.resetRotationTimer(this.instances[0].rotationHours);
                log(`✅ Rotation manager started with instance bot1 (Rotation interval: ${this.instances[0].rotationHours} hours)`);
                return;
            }

            const currentInstance = this.instances.find(i => i.id === settings.activeInstance);
            if (!currentInstance) {
                log('⚠️ Current active instance not found in config, resetting to bot1');
                settings.activeInstance = 'bot1';
                await settings.save();
                return this.startRotation(); // Retry after reset
            }

            this.resetRotationTimer(currentInstance.rotationHours);
            log(`✅ Rotation manager started with instance ${currentInstance.id} (Rotation interval: ${currentInstance.rotationHours} hours)`);
        } catch (error) {
            log(`❌ Error starting rotation: ${error.message}`);
            throw error; // Propagate error to caller
        }
    }

    async stopRotation() {
        try {
            if (this.rotationInterval) {
                clearInterval(this.rotationInterval);
                this.rotationInterval = null;
            }

            log('⏹️ Rotation manager stopped');
        } catch (error) {
            log(`❌ Error stopping rotation: ${error.message}`);
        }
    }
}

module.exports = new RotationManager();