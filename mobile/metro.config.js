const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Allow importing the API client shared with the web app
config.watchFolders = [path.resolve(__dirname, "../shared")];

module.exports = config;
