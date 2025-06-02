module.exports = {
    apps: [{
        name: "bloom",
        script: "./bloom.js",
        instances: 1,
        exec_mode: "fork",
        watch: true,
        ignore_watch: ["node_modules", "heart*", "temp"],
        env: {
            NODE_ENV: "development",
        },
        env_production: {
            NODE_ENV: "production",
        },
        max_memory_restart: "1G",
        error_file: "logs/err.log",
        out_file: "logs/out.log",
        time: true
    }]
}; 