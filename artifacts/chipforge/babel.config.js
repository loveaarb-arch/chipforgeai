module.exports = function (api) {
  api.cache(true);
  return {
    // Resolve from this app, not from a pnpm virtual-store entrypoint.
    presets: [[require.resolve('babel-preset-expo'), { unstable_transformImportMeta: true }]],
  };
};
