export default [
  {
    plugins: ['@typescript-eslint'],
    rules: {
        // Allow unused vars if they are prefixed with an underscore
        "@typescript-eslint/no-unused-vars": [
            "warn",
            {
                "argsIgnorePattern": "^_",
                "varsIgnorePattern": "^_",
                "caughtErrorsIgnorePattern": "^_"
            }
        ]
    }
  }
]
