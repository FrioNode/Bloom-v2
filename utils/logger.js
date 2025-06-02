function log(...args) {
    const timestamp = new Date().toLocaleString();
    console.log(`Bloom: ${timestamp} |`, ...args);
}

module.exports = { log }; 