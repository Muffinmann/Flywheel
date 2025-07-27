/**
 * @fileoverview RuleManagement - file system based rule management in command line
 * 
 * we offer a file system based rule management approach in the build-time:
 * ```txt
 * rules/
 * ├── category/               # Root category 
 * │   ├── index.json          # root-level field rules
 * │   ├── shared.json         # root-level shared conditions
 * │   ├── sub-category1/            # Second layer 
 * │   │   ├── index.json            # sub-category-specific overrides or appends
 * │   │   ├── shared.json           # sub-specific shared conditions
 * │   │   ├── sub-sub-category-1/           # Third layer 
 * │   │   │   ├── index.json
 * │   │   │   └── shared.json
 * │   │   ├── sub-sub-category-2/
 * │   │   └── sub-sub-category-3/
 * │   ├── sub-category-2/           # Second layer
 * │   └── sub-category-3/           # Second layer
 * ```
 * it woks as following:
 * 1. You can create several root categories for different rule set (e.g. based on product). For a structure of rule set @see RuleEngine. 
 * 2. Under each root category, the rules(both "index.json" and "shared.json") defined in the sub-category either overrides the one in the parent (if the field name is same)
 *    or get appended to the parent.
 * 3. Each path of rules in a root category will be squashed into one key-value pair, with the path its key.
 *    One advantage of this approach is that you don't have to worry that two child will override the same parent rule.
 *    It may look like this:
 * ```json 
 * {
 *  "category/sub-category-1/sub-sub-category-2": {
 *    "fields": {...},
 *    "sharedRules": {...}
 *  },
 *  "category/sub-category-2": {
 *    "fields": {...},
 *    "sharedRules": {...}
 *  },
 * ...
 *}
 * ```
 * 4. Each folder name contains two part, one as the readable name and the other one as id, separated by "__"(double underscore).
 *    For example: "product-foot-wear__prd-001".
 * 
 * 5. The system will generate a map between the id and the corresponding path. For example, the structure of `rules` for some wearable products may look like:
 * ```txt
 * body-wear__prd-001
 * ├─── arm__prd-002
 * |    └───hand__prd-004
 * |
 * ├─── leg__prd-003
 * ```

 * The generated map will be:
 * ```json
 * {
 *  "prd-001": "body-wear__prd-001",
 *  "prd-002": "body-wear__prd-001/arm__prd-002",
 *  "prd-003": "body-wear__prd-001/leg__prd-003",
 *  "prd-004": "body-wear__prd-001/arm__prd-002/hand__prd-004"
 * }
 * ```
 * 
 * When you reference the product rule set by its id, e.g. "prd-004" in front-end:
 * ```ts
 * import ruleSetMap from "src/rules/index.ts"
 * const selectedProductId = "prd-001"
 * const engine = new RuleEngine()
 * engine.loadRuleSet(ruleSetMap.get("prd-001"))
 * ```
 * it can then find the correct path:
 * ```json
 *{
 *  "body-wear__prd-001/arm__prd-002/hand__prd-004": {
 *    "fields": {...},
 *    "sharedRules": {...}
 *  },
 * ...
 *} 
 * ```
 * 
 * 
 * Run the bash command to squash rules
 * ```bash
 * node squash-rules.mjs path-to/your/rules
 * ```
 * 
 * The final squashed rule will be generate under the root category, in the previous example: `rules/index.js`
 * and you can import this file later in your project.
 * 
 *  ## Validation
 *  The CLI will throw if:
 *  - Folder name is missing __ separator
 *  - id is duplicated across tree
 *  - circular field dependencies
 */