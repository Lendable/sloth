import globals from "globals";

import path from "path";
import {fileURLToPath} from "url";
import {FlatCompat} from "@eslint/eslintrc";
import pluginJs from "@eslint/js";

// mimic CommonJS variables -- not needed if using CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat(
  {
    baseDirectory: __dirname,
    recommendedConfig: pluginJs.configs.recommended
  }
);

export default [
  {
    languageOptions: {globals: globals.browser},
  },
  ...compat.extends('airbnb-base'),
  ...compat.config({
    rules: {
      'no-await-in-loop': 'off',
      'no-console': 'off',
      'no-continue': 'off',
      'no-plusplus': 'off',
      'no-promise-executor-return': 'off',
      'no-constant-condition': 'off',
      'no-restricted-syntax': 'off',
    }
  })
];
