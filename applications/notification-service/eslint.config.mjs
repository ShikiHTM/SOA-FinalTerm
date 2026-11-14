import baseConfig from "../../eslint.config.mjs";

export default [
    ...baseConfig,
    {
        files: ["**/*.ts"],
        rules: {
            // The project convention requires explicit types for variables.
            "@typescript-eslint/no-inferrable-types": "off"
        }
    }
];
