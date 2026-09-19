import type { OxlintConfig } from "oxlint"

import { recommended } from "@effect/tsgo/oxlint-presets"
import { defineConfig } from "oxlint"

type PluginConfig = NonNullable<OxlintConfig["plugins"]>
type RuleConfig = NonNullable<OxlintConfig["rules"]>

// Adapted from phaephe's oxlint config without its React/Next.js plugins, rules, settings and overrides.
const basePlugins: PluginConfig = ["typescript", "unicorn", "oxc", "promise", "import", "node"]

const categories: NonNullable<OxlintConfig["categories"]> = {
  correctness: "error",
  suspicious: "error",
  perf: "error",
  pedantic: "error",
  style: "error",
  restriction: "error",
}

const baseRules: RuleConfig = {
  "node/no-top-level-await": "off", // We don't care about CJS
  "unicorn/max-nested-calls": "off", // I don't like it
  "typescript/prefer-readonly-parameter-types": "off",
  "typescript/explicit-function-return-type": "off",
  "typescript/explicit-module-boundary-types": "off",
  "unicorn/prefer-global-this": "off",
  "func-style": ["error", "expression"],
  "no-magic-numbers": "off",
  "oxc/no-optional-chaining": "off",
  "oxc/no-rest-spread-properties": "off",
  "oxc/no-async-await": "off",
  "unicorn/no-null": "off",
  "sort-imports": "off",
  "no-undefined": "off",
  "max-statements": "off",
  "unicorn/no-process-exit": "off",
  "no-ternary": "off",
  "no-continue": "off",
  "prefer-destructuring": "off",
  "no-console": "error",
  "no-warning-comments": "off",
  "max-params": "off",
  "max-lines-per-function": "off",
  "id-length": "off",
  "no-inline-comments": "off",
  "unicorn/no-array-reduce": "error",
  "no-use-before-define": "error",
  "node/callback-return": "off", // Results in false positives
  "no-duplicate-imports": "off", // Does not work with oxfmt, yikes
  "no-void": "off",
  "typescript/explicit-member-accessibility": "off",
  complexity: "error",
  "max-classes-per-file": "off",
  "require-await": "off", // This rule is inferior to the accuracy of the type-aware typescript/require-await rule.
  "no-plusplus": "error",
  "init-declarations": "error",
  "sort-keys": "off",
  "oxc/erasing-op": "error",
  "no-nested-ternary": "off",
  "unicorn/no-nested-ternary": "off",
  "typescript/use-unknown-in-catch-callback-variable": "error",
  "typescript/no-non-null-assertion": "error",
  "oxc/no-map-spread": "off", // Keeping spread: Object.assign alternative causes accidental mutability
  "unicorn/no-await-expression-member": "error",
  "no-empty-function": "error",
  "unicorn/no-useless-collection-argument": "error",
  "unicorn/prefer-ternary": "error",
  "no-negated-condition": "error",
  "typescript/array-type": "error",
  // Effect builds errors, services and schemas through capitalized factory calls.
  "new-cap": ["error", { capIsNew: false }],
  "unicorn/throw-new-error": "off",
  "one-var": ["error", "never"],
  "arrow-body-style": ["error", "as-needed", { requireReturnForObjectLiteral: true }],
  "import/prefer-default-export": "off",
  "import/no-namespace": "off",
  "import/no-named-export": "off",
  "promise/prefer-await-to-then": "error",
  "import/group-exports": "error",
  "promise/prefer-await-to-callbacks": "off",
  "node/no-process-env": "error",
  "import/exports-last": "error",
  "import/max-dependencies": "off",
  "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
  "typescript/no-import-type-side-effects": "error",
  "import/no-relative-parent-imports": "error",
  "oxc/no-barrel-file": "error",
  "import/first": "error",
  "promise/avoid-new": "error",
  "import/no-nodejs-modules": "off", // This is a Bun process, not a browser app.
  "import/no-default-export": "error",
  "no-underscore-dangle": ["error", { allow: ["__dirname", "__filename", "_tag"] }],
}

// The Effect recommended preset and this repository's all-error categories
// raise these diagnostics to errors in packages/*/src, which this tooling
// change does not own. Keep them visible as warnings until the package sources
// adopt the suggestions.
const effectRuleSeverities: RuleConfig = {
  "effecttsgo/any-unknown-in-error-context": "warn",
  "effecttsgo/deterministic-keys": "warn",
  "effecttsgo/missing-pipeable-signature": "warn",
  "effecttsgo/missing-return-yield-star": "warn",
  "effecttsgo/missed-pipeable-opportunity": "warn",
  "effecttsgo/nested-effect-gen-yield": "warn",
  "effecttsgo/new-schema-class": "warn",
  "effecttsgo/prefer-schema-type-property": "warn",
  "effecttsgo/strict-effect-provide": "warn",
  "effecttsgo/unnecessary-arrow-block": "warn",
}

const ignorePatterns = [
  "**/node_modules/**",
  "**/dist/**",
  "**/drizzle/**",
  "**/*.d.ts",
  "**/*.config.{js,ts,mjs,cjs}",
  "**/tsconfig.tsbuildinfo",
]

export default defineConfig({
  extends: [recommended],
  plugins: basePlugins,
  categories,
  rules: { ...baseRules, ...effectRuleSeverities },
  overrides: [
    {
      files: ["packages/core/**/*.{ts,tsx}"],
      rules: {
        // Core deliberately has no path aliases: it is loaded with an arbitrary
        // cwd, so its own child directories are reached with relative imports.
        "import/no-relative-parent-imports": "off",
        // Core data models pair every Schema.Struct with a same-name type alias
        // for its decoded type. The rule does not distinguish the value and
        // type declaration spaces, so it reads the pair as a redeclaration.
        "no-redeclare": "off",
      },
    },
  ],
  env: {
    builtin: true,
  },
  ignorePatterns,
})
