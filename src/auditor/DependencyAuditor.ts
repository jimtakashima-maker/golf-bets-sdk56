import { readJSON, fileExists, pathJoin } from "../core/FileUtils";

export interface Issue {
  id: string;
  severity: "info" | "warning" | "error";
  description: string;
}

export class DependencyAuditor {
  constructor(private projectRoot: string) {}

  audit(): Issue[] {
    const issues: Issue[] = [];

    const pkgPath = pathJoin(this.projectRoot, "package.json");
    if (!fileExists(pkgPath)) {
      issues.push({
        id: "missing-package-json",
        severity: "error",
        description: "package.json not found in project root."
      });
      return issues;
    }

    const pkg = readJSON(pkgPath);
    const deps = {
      ...pkg.dependencies,
      ...pkg.devDependencies
    };

    // --- Expo SDK compatibility checks ---
    const expoVersion = deps["expo"];
    if (expoVersion?.startsWith("~56")) {
      this.checkExpoSdk56(pkg, deps, issues);
    }

    // --- Peer dependency conflict checks ---
    this.checkPeerConflicts(deps, issues);

    return issues;
  }

  private checkExpoSdk56(pkg: any, deps: any, issues: Issue[]) {
    const react = deps["react"];
    const reactDom = deps["react-dom"];
    const rnWeb = deps["react-native-web"];

    if (react !== "18.3.1") {
      issues.push({
        id: "expo56-react-mismatch",
        severity: "error",
        description: `Expo SDK 56 requires react@18.3.1 but project has ${react}.`
      });
    }

    if (reactDom && !reactDom.startsWith("18.")) {
      issues.push({
        id: "expo56-react-dom-mismatch",
        severity: "error",
        description: `Expo SDK 56 requires react-dom@18.x for web but project has ${reactDom}.`
      });
    }

    if (rnWeb && !rnWeb.startsWith("0.19")) {
      issues.push({
        id: "expo56-rn-web-mismatch",
        severity: "warning",
        description: `Expo SDK 56 expects react-native-web@0.19.x but project has ${rnWeb}.`
      });
    }
  }

  private checkPeerConflicts(deps: any, issues: Issue[]) {
    const nodeModules = pathJoin(this.projectRoot, "node_modules");

    for (const depName of Object.keys(deps)) {
      const depPkgPath = pathJoin(nodeModules, depName, "package.json");
      if (!fileExists(depPkgPath)) continue;

      const installed = readJSON(depPkgPath);
      const peers = installed.peerDependencies || {};

      for (const peerName of Object.keys(peers)) {
        const requiredRange = peers[peerName];
        const installedVersion = deps[peerName];

        if (!installedVersion) {
          issues.push({
            id: `missing-peer-${peerName}`,
            severity: "warning",
            description: `${depName} requires peer ${peerName}@${requiredRange} but it is not installed.`
          });
          continue;
        }

        if (!this.satisfies(installedVersion, requiredRange)) {
          issues.push({
            id: `peer-conflict-${peerName}`,
            severity: "error",
            description: `${depName} requires ${peerName}@${requiredRange} but project has ${installedVersion}.`
          });
        }
      }
    }
  }

  // Very simple semver range check (good enough for peer conflicts)
  private satisfies(version: string, range: string): boolean {
    if (range.startsWith("^")) {
      const major = range.replace("^", "").split(".")[0];
      return version.startsWith(major + ".");
    }
    if (range.startsWith("~")) {
      const [major, minor] = range.replace("~", "").split(".");
      return version.startsWith(`${major}.${minor}.`);
    }
    return version === range;
  }
}
