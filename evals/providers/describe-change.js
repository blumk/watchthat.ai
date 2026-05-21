// Promptfoo provider that calls the real describeChange() from lib so the
// eval tests the production code path — prompt construction, parser
// fallbacks, fact-diff filtering, everything. Without this seam promptfoo
// would only exercise raw Claude responses to a copy-pasted prompt, which
// drifts from production the moment we tweak lib/describe-change.ts.
//
// Loaded by promptfoo's CLI directly (CommonJS), with tsx/cjs registered
// so the require() of our .ts module Just Works.

// eslint-disable-next-line @typescript-eslint/no-require-imports
require("tsx/cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { describeChange } = require("../../lib/describe-change");

module.exports = class DescribeChangeProvider {
  constructor(options = {}) {
    this.providerId = options.id || "describe-change";
  }

  id() {
    return this.providerId;
  }

  /**
   * Promptfoo invokes this once per test case. Test-case `vars` from the
   * YAML config become our function inputs. The returned `output` is what
   * assertions run against — we return the full DescribeChangeResult so
   * assertions can reach .description / .classification / .emoji.
   */
  async callApi(_promptText, context = {}) {
    const vars = context.vars || {};
    try {
      const result = await describeChange({
        oldValue: String(vars.oldMarkdown ?? ""),
        newValue: String(vars.newMarkdown ?? ""),
        watchTarget: String(vars.watchTarget ?? "page content"),
        watchTargets: Array.isArray(vars.watchTargets) ? vars.watchTargets : undefined,
        userNotes: Array.isArray(vars.userNotes) ? vars.userNotes : undefined,
        url: String(vars.url ?? "https://example.com/eval"),
        factsDiff: Array.isArray(vars.factsDiff) ? vars.factsDiff : undefined,
      });
      return { output: result };
    } catch (err) {
      return {
        output: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
};
