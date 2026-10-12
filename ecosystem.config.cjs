// PM2 process file for VitalMatch production deployment.
// Single instance (fork): the file ledger, in-memory caches and Socket.io rooms
// are per-process, so clustering would split state. Sessions live in MySQL and
// survive restarts.
module.exports = {
  apps: [
    {
      name: 'vitalmatch',
      script: 'index.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      max_memory_restart: '512M',
      kill_timeout: 35000,
      listen_timeout: 15000,
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
