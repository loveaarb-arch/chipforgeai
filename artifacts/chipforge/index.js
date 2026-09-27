// Keep this entrypoint before expo-router so a diagnostic build can show
// startup JavaScript errors that otherwise terminate the iOS release app.
if (process.env.EXPO_PUBLIC_DIAGNOSTIC_BUILD === '1' && !__DEV__) {
  // React Native's initialization installs its own fatal error handler.
  // Initialize it first so it cannot replace the diagnostic handler below.
  require('react-native/Libraries/Core/InitializeCore');
  const { Alert } = require('react-native');
  let showingError = false;

  function showStartupError(error) {
    if (showingError) return;
    showingError = true;

    const message = error instanceof Error
      ? `${error.name}: ${error.message}\n\n${error.stack || ''}`
      : String(error);

    // The splash screen can cover the diagnostic if the root layout never loads.
    require('expo-splash-screen').hideAsync().catch(() => {});
    Alert.alert(
      'Chip Forge AI startup error',
      `${message.slice(0, 1800)}\n\nPlease screenshot this message. Do not submit this diagnostic build to App Review.`,
      [{ text: 'OK' }],
    );
  }

  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      showStartupError(error);
    } else {
      console.warn(error);
    }
  });

  try {
    require('expo-router/entry');
  } catch (error) {
    showStartupError(error);
  }
} else {
  require('expo-router/entry');
}