function log(...args) {
    const timestamp = new Date().toLocaleString();
    const stack = new Error().stack;
    const callerLine = stack.split('\n')[2];
    const filePath = callerLine.match(/(?:\/[^/]+)+\.js/)?.[0] || 'unknown';
    const fileName = filePath.split('/').pop();
    console.log(`Bloom: ${timestamp} | [${fileName}]`, ...args);
}
module.exports = { log }; 