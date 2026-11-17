module.exports = {
  apps: [
    {
      name: "nextjs-bun-app",
      script: "bun",
      args: "--bun next start",
      cwd: "./",
      instances: 1, // Note: Cluster mode is generally not stable for Bun via PM2 yet; use fork mode (1 instance)
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // Ensures PM2 can find the Bun binary globally
        PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
      },
    },
  ],
};
