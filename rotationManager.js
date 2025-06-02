const config = require('./config');
const { log } = require('./utils/logger');
const fs = require('fs').promises;
const path = require('path');
const { createInstanceModels } = require('./colors/schema');

class RotationManager {
    constructor() {
        this.instances = config.instances;
        this.rotationInterval = null;
        this.isRotating = false;
    }

    async initialize() {
        try {
            // Create session directories if they don't exist
            for (const instance of this.instances) {
                const sessionDir = path.join(__dirname, instance.sessionDir);
                await fs.mkdir(sessionDir, { recursive: true });
            }

            // Initialize BotSettings if not exists
            const { BotSettings } = createInstanceModels('bot1');
            const settings = await BotSettings.findById('global') || await BotSettings.create({ 
                _id: 'global',
                activeInstance: 'bot1',
                lastRotation: new Date(),
                rotationEnabled: config.rotationEnabled
            });

            log(`✅ Rotation manager initialized with active instance: ${settings.activeInstance}`);
        } catch (error) {
            log(`❌ Error initializing rotation manager: ${error.message}`);
        }
    }

    async getCurrentActiveInstance() {
        try {
            const { BotSettings } = createInstanceModels('bot1');
            const settings = await BotSettings.findById('global');
            return settings?.activeInstance || 'bot1';
        } catch (error) {
            log(`❌ Error getting active instance: ${error.message}`);
            return 'bot1';
        }
    }

    async rotateInstance() {
        if (this.isRotating) return;

        try {
            this.isRotating = true;
            const { BotSettings } = createInstanceModels('bot1');
            const settings = await BotSettings.findById('global');
            
            if (!settings?.rotationEnabled) {
                log('ℹ️ Rotation is disabled in database');
                return;
            }

            // Get current active instance
            const currentInstanceId = settings.activeInstance;
            const currentIndex = this.instances.findIndex(i => i.id === currentInstanceId);
            
            // Calculate next instance
            const nextIndex = (currentIndex + 1) % this.instances.length;
            const nextInstance = this.instances[nextIndex];

            log(`🔄 Rotating from ${currentInstanceId} to ${nextInstance.id}`);

            // Update in database
            settings.activeInstance = nextInstance.id;
            settings.lastRotation = new Date();
            await settings.save();

            // Reset rotation timer with new instance's hours
            this.resetRotationTimer(nextInstance.rotationHours);
            
            log(`✅ Successfully rotated to instance: ${nextInstance.id}`);

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
            // Send rotation event to all instance log chats
            for (const instance of this.instances) {
                if (instance.logschat) {
                    const message = `┌──── 🔄 Instance Rotation ────\n├ New Active: ${newActiveInstance}\n└─ Previous: ${await this.getCurrentActiveInstance()}`;
                    // Note: You'll need to implement the actual message sending logic
                    // through your WhatsApp client here
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
        log(`⏰ Setting rotation timer for ${hours} hours`);
        
        this.rotationInterval = setInterval(() => {
            this.rotateInstance().catch(err => {
                log(`❌ Error during scheduled rotation: ${err.message}`);
            });
        }, rotationInterval);
    }

    async startRotation() {
        try {
            const { BotSettings } = createInstanceModels('bot1');
            const settings = await BotSettings.findById('global');
            
            if (!settings?.rotationEnabled) {
                log('ℹ️ Rotation is disabled in database');
                return;
            }

            const currentInstance = this.instances.find(i => i.id === settings.activeInstance);
            this.resetRotationTimer(currentInstance.rotationHours);
            log('✅ Rotation manager started');
        } catch (error) {
            log(`❌ Error starting rotation: ${error.message}`);
        }
    }

    async stopRotation() {
        try {
            if (this.rotationInterval) {
                clearInterval(this.rotationInterval);
                this.rotationInterval = null;
            }

            const { BotSettings } = createInstanceModels('bot1');
            const settings = await BotSettings.findById('global');
            if (settings) {
                settings.rotationEnabled = false;
                await settings.save();
            }

            log('⏹️ Rotation manager stopped');
        } catch (error) {
            log(`❌ Error stopping rotation: ${error.message}`);
        }
    }
}

module.exports = new RotationManager();