import { DockerManager } from './DockerManager';
import type {
  ComplianceConfig,
  ComplianceReport,
  LicenseIssue,
  LicenseReport,
  SBOMComponent,
  SBOMReport,
  SecurityFinding,
  VulnerabilityReport,
} from 'domain/models/types';

/**
 * Runs compliance and security checks inside a container
 */
export class ComplianceManager {
  constructor(private readonly dockerManager: DockerManager) {}

  async runCompliance(
    containerId: string,
    packageName: string,
    config?: ComplianceConfig,
  ): Promise<ComplianceReport | undefined> {
    if (!config || config.enabled === false) {
      return undefined;
    }

    const report: ComplianceReport = {};

    if (config.sbom !== false) {
      report.sbom = await this.generateSBOM(containerId, packageName);
    }

    if (config.audit !== false) {
      report.vulnerabilities = await this.runAudit(containerId);
    }

    if (config.licenseCheck !== false) {
      report.licenses = await this.collectLicenses(containerId, packageName);
    }

    if (config.artifactDir) {
      await this.persistArtifacts(containerId, config.artifactDir, report);
    }

    return report;
  }

  private async generateSBOM(containerId: string, packageName: string): Promise<SBOMReport> {
    const result = await this.dockerManager.executeCommand(containerId, [
      'npm',
      'list',
      '--json',
    ]);

    let components: SBOMComponent[] = [];
    try {
      const parsed = JSON.parse(result.stdout || '{}');
      components = this.flattenDependencies(parsed.dependencies ?? {});
    } catch {
      components = [];
    }

    return {
      packageName,
      generatedAt: new Date().toISOString(),
      components,
    };
  }

  private flattenDependencies(deps: Record<string, any>, prefix = ''): SBOMComponent[] {
    const components: SBOMComponent[] = [];

    for (const [name, info] of Object.entries(deps)) {
      const version = typeof info === 'object' && info.version ? info.version : 'unknown';
      components.push({ name, version, path: prefix });

      if (info && typeof info === 'object' && info.dependencies) {
        components.push(...this.flattenDependencies(info.dependencies, `${prefix}${name}>`));
      }
    }

    return components;
  }

  private async runAudit(containerId: string): Promise<VulnerabilityReport> {
    const result = await this.dockerManager.executeCommand(containerId, [
      'npm',
      'audit',
      '--json',
      '--audit-level=low',
    ]);

    try {
      const parsed = JSON.parse(result.stdout || '{}');
      const findings: SecurityFinding[] = [];

      if (parsed.advisories) {
        for (const advisory of Object.values(parsed.advisories) as any[]) {
          findings.push({
            title: advisory.title,
            severity: advisory.severity ?? 'unknown',
            dependency: advisory.module_name,
            via: advisory.cves?.[0],
            url: advisory.url,
          });
        }
      }

      if (Array.isArray(parsed.vulnerabilities)) {
        for (const vuln of parsed.vulnerabilities) {
          findings.push({
            title: vuln.title ?? vuln.name ?? 'Vulnerability',
            severity: vuln.severity ?? 'unknown',
            dependency: vuln.name ?? 'unknown',
            via: vuln.via?.[0]?.source,
            url: vuln.url,
          });
        }
      }

      return { findings, raw: parsed };
    } catch {
      return { findings: [], raw: result.stdout };
    }
  }

  private async collectLicenses(
    containerId: string,
    packageName: string,
  ): Promise<LicenseReport> {
    const result = await this.dockerManager.executeCommand(containerId, [
      'npm',
      'view',
      packageName,
      'license',
      '--json',
    ]);

    const issues: LicenseIssue[] = [];
    try {
      const licenseValue = JSON.parse(result.stdout || '"unknown"');
      if (licenseValue && typeof licenseValue === 'string') {
        issues.push({
          dependency: packageName,
          license: licenseValue,
          message: `Root package license: ${licenseValue}`,
        });
      }
    } catch {
      issues.push({ dependency: packageName, license: 'unknown', message: 'Unable to resolve license' });
    }

    return { issues };
  }

  private async persistArtifacts(
    containerId: string,
    dir: string,
    report: ComplianceReport,
  ): Promise<void> {
    await this.dockerManager.createDirectory(containerId, dir);
    await this.dockerManager.createFile(
      containerId,
      `${dir.replace(/\/$/, '')}/compliance-report.json`,
      JSON.stringify(report, null, 2),
    );
  }
}
