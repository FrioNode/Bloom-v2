function log(...args) {
    const timestamp = new Date().toLocaleString();
    
    // Get the stack trace and extract the caller's file path
    const stack = new Error().stack;
    const callerLine = stack.split('\n')[2]; // First line is Error, second is this function, third is caller
    
    // Extract file path - matches everything after the last '/' and before the last ':'
    const filePath = callerLine.match(/(?:\/[^/]+)+\.js/)?.[0] || 'unknown';
    // Get just the filename without full path for cleaner logs
    const fileName = filePath.split('/').pop();
    
    console.log(`Bloom: ${timestamp} | [${fileName}]`, ...args);
}

module.exports = { log }; 