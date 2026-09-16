module.exports = {
  dependencies: {},

  commands: [],

  platforms: {},

  project: {
    android: {
      packageName: "com.jimtakashimamaker.golfbetssdk56"
    }
  },

  // ⭐ Disable RN codegen during development (prevents heavy memory usage in Codespaces)
  reactNativePath: "node_modules/react-native",

  dependencies: {
    "react-native": {
      platforms: {
        android: {
          // Prevents Gradle from running RN codegen (huge stability boost in Codespaces)
          codegenConfig: null
        }
      }
    }
  }
};
