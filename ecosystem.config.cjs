module.exports = {
  apps: [
    {
      name: 'DoDouDou',
      // 如果 server 已编译为 JS：
      script: 'server/gallery-server.mjs',
      // 如果使用 tsx 直接运行 TS：
      // script: 'tsx',
      // args: 'server/index.ts',
      cwd: '/var/www/DoDouDou',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        DATABASE_URL: 'file:./dev.db',
        GALLERY_ALLOWED_ORIGINS: 'https://dodoudou.xyz,https://www.dodoudou.xyz',
        GALLERY_SERVER_HOST: '127.0.0.1',
        PRODUCTION_CLOSED_HOSTS: 'dodoudou.com,www.dodoudou.com',
        PUBLIC_BETA_URL: 'https://dodoudou.xyz',
      },
      // 异常时自动重启
      watch: false,
      max_memory_restart: '500M',
      // 日志路径
      out_file: '/var/log/DoDouDou/out.log',
      error_file: '/var/log/DoDouDou/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
