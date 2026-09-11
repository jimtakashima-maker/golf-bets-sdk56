import { LLMClient } from "../core/LLMClient";
import { AuditIssue } from "../auditor/DependencyAuditor";
import { FixPlan } from "../core/FixPlan";

export class VersionResolver {
  constructor(private llm: LLMClient) {}

  async resolve(issues: AuditIssue[]): Promise<FixPlan> {
    const expoFixes = this.resolveExpoSdk56(issues);
    const peerFixes = this.resolvePeerConflicts(issues);

    const dependencies = [...expoFixes.dependencies, ...peerFixes.dependencies];
    const devDependencies = [...expoFixes.devDependencies, ...peerFixes.devDependencies];

    const prompt = `
You are an expert Expo/React Native dependency resolver.

Here are the audit issues:
${JSON.stringify(issues, null, 2)}

Your job:
- Generate a FixPlan JSON object ONLY.
- Fix Expo SDK 56 compatibility issues.
- Fix peer dependency conflicts.
- Fix version-range mismatches.
- NEVER modify package.json directly.
- ALWAYS output dependency updates only.
- ALWAYS output valid JSON.
- NO markdown.
- NO backticks.
- NO explanation.

Return ONLY this shape:

{
  "dependencies": [],
  "devDependencies": [],
  "configPatches": []
}

Here is the base FixPlan to merge into your output:

{
  "dependencies": ${JSON.stringify(dependencies)},
  "devDependencies": ${JSON.stringify(devDependencies)},
  "configPatches": []
}
`;

    const raw = await this.llm.chat(prompt);

    try {
      const plan = JSON.parse(raw) as FixPlan;
      return plan;
    } catch (e) {
      throw new Error(`Failed to parse FixPlan JSON from LLM: ${e}\nRaw: ${raw}`);
    }
  }

  private resolveExpoSdk56(issues: AuditIssue[]) {
    const deps: { name: string; version: string }[] = [];
    const devDeps: { name: string; version: string }[] = [];

    const expoIssues = issues.map(i => i.id);

    if (expoIssues.includes("expo56-react-dom-mismatch")) {
      deps.push({ name: "react-dom", version: "18.2.0" });
    }

    if (expoIssues.includes("expo56-rn-web-mismatch")) {
      deps.push({ name: "react-native-web", version: "0.19.9" });
    }

    if (expoIssues.includes("expo56-react-mismatch")) {
      deps.push({ name: "react", version: "18.3.1" });
    }

    return { dependencies: deps, devDependencies: devDeps };
  }

  private resolvePeerConflicts(issues: AuditIssue[]) {
    const deps: { name: string; version: string }[] = [];
    const devDeps: { name: string; version: string }[] = [];

    for (const issue of issues) {
      if (issue.id.startsWith("peer-conflict-react-dom")) {
        deps.push({ name: "react-dom", version: "18.2.0" });
      }

      if (issue.id.startsWith("peer-conflict-react-native-web")) {
        deps.push({ name: "react-native-web", version: "0.19.9" });
      }
    }

    return { dependencies: deps, devDependencies: devDeps };
  }
}
