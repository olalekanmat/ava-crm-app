// Builds for the avahealthcareltd.com site set AVA_WEB_BASE=/AvaCRM/app so the web app works in that folder.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...config.experiments, ...(process.env.AVA_WEB_BASE ? { baseUrl: process.env.AVA_WEB_BASE } : {}) },
});
