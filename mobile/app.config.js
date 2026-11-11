module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || config.extra?.eas?.projectId;
  return {
    ...config,
    extra: {
      ...config.extra,
      eas: projectId ? { ...config.extra?.eas, projectId } : config.extra?.eas
    }
  };
};
