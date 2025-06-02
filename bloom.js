const { botname } = require('./colors/setup');
const express = require('express');
const rotationManager = require('./rotationManager');
const startupManager = require('./startupManager');
const { log } = require('./utils/logger');
const path = require('path');

let stopPokemonGame; const app = express();
const serverStartTime = Date.now();
const PORT = process.env.PORT || 3000;

async function init() {
    try {
        const results = await startupManager.startAll();
        log('Startup results:', results);
        
        if (results.some(r => r.success)) {
            rotationManager.startRotation();
        } else {
            log('❌ No instances started successfully. Please check your configuration and try again.');
            process.exit(1);
        }
    } catch (error) {
        log('Critical startup error:', error);
        process.exit(1);
    }
}

init();

app.use(express.static(path.join(__dirname, 'colors')));
app.get('/', (req, res) => {  res.sendFile(path.join(__dirname, 'colors', 'bloom.html')); });

app.listen(PORT, () => { log(`🔒 ${botname} Server is running on port ${PORT}`); });

app.get('/uptime', (req, res) => {
    const now = Date.now();
    const diff = now - serverStartTime;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    res.json({ days, hours, minutes, seconds });
});

app.get('/status', (_, res) => res.send(`✅ ${botname} bot is online`));