module.exports = {
  apps: [
    {
      name: "hmtyinfo",
      cwd: "/var/www/hmtyinfo",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};