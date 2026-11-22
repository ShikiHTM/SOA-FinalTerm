import rootConfig from "../../eslint.config.mjs";

export default [
    ...rootConfig,
    {
        files: ["**/*.ts", "**/*.tsx"],
        rules: {
            "@typescript-eslint/no-inferrable-types": "off",
        },
    },
];
