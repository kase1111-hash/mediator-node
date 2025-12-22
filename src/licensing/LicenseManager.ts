import {
  MediatorConfig,
  License,
  LicenseScope,
  LicenseStatus,
  SubjectType,
} from '../types';
import { nanoid } from 'nanoid';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

/**
 * License proposal parameters
 */
export interface LicenseProposalParams {
  grantorId: string;
  granteeId: string;
  proposedBy: string; // Can be grantor, grantee, or mediator
  subject: {
    type: SubjectType;
    ids: string[];
  };
  purpose: string;
  limits?: string[];
  duration: {
    type: 'perpetual' | 'time_bounded';
    expiresAt?: number;
  };
  transferability?: {
    sublicenseAllowed?: boolean;
    redelegationAllowed?: boolean;
  };
  underlyingReferences?: string[];
}

/**
 * License ratification parameters
 */
export interface LicenseRatificationParams {
  licenseId: string;
  ratifiedBy: string; // Must be the grantor
  ratificationStatement: string; // Natural language statement
  signature?: string;
  humanAuthorship: boolean; // Must be true
}

/**
 * License revocation parameters
 */
export interface LicenseRevocationParams {
  licenseId: string;
  revokedBy: string; // Must be the grantor
  revocationStatement: string; // Natural language explanation
  signature?: string;
}

/**
 * Manages license lifecycle and validation
 * Implements MP-04 Licensing Protocol
 */
export class LicenseManager {
  private config: MediatorConfig;
  private licenses: Map<string, License> = new Map();
  private dataPath: string;

  constructor(config: MediatorConfig, dataPath: string = './data/licenses') {
    this.config = config;
    this.dataPath = dataPath;

    // Ensure data directory exists
    if (!fs.existsSync(this.dataPath)) {
      fs.mkdirSync(this.dataPath, { recursive: true });
    }

    // Load existing licenses
    this.loadLicenses();

    logger.info('LicenseManager initialized', {
      dataPath,
      licensesLoaded: this.licenses.size,
    });
  }

  /**
   * Propose a new license
   * Phase 1 of licensing lifecycle
   */
  public proposeLicense(params: LicenseProposalParams): {
    success: boolean;
    licenseId?: string;
    error?: string;
  } {
    try {
      // Validate required fields
      if (!params.grantorId || !params.granteeId) {
        return {
          success: false,
          error: 'Grantor and grantee are required',
        };
      }

      if (!params.subject || !params.subject.ids || params.subject.ids.length === 0) {
        return {
          success: false,
          error: 'Subject with at least one ID is required',
        };
      }

      if (!params.purpose || params.purpose.trim().length === 0) {
        return {
          success: false,
          error: 'Purpose is required',
        };
      }

      // Validate duration
      if (params.duration.type === 'time_bounded' && !params.duration.expiresAt) {
        return {
          success: false,
          error: 'Expiration time required for time-bounded licenses',
        };
      }

      if (params.duration.type === 'time_bounded' && params.duration.expiresAt! <= Date.now()) {
        return {
          success: false,
          error: 'Expiration time must be in the future',
        };
      }

      const licenseId = nanoid();
      const now = Date.now();

      const scope: LicenseScope = {
        subject: params.subject,
        purpose: params.purpose,
        limits: params.limits || [],
        duration: params.duration,
        transferability: {
          sublicenseAllowed: params.transferability?.sublicenseAllowed ?? false,
          redelegationAllowed: params.transferability?.redelegationAllowed ?? false,
        },
      };

      const license: License = {
        licenseId,
        grantorId: params.grantorId,
        granteeId: params.granteeId,
        scope,
        status: 'proposed',
        proposedAt: now,
        proposedBy: params.proposedBy,
        underlyingReferences: params.underlyingReferences || [],
        licenseHash: '', // Will be set after ratification
        humanAuthorship: false, // Set to true upon ratification
      };

      // Store license
      this.licenses.set(licenseId, license);
      this.saveLicense(license);

      logger.info('License proposed', {
        licenseId,
        grantorId: params.grantorId,
        granteeId: params.granteeId,
        proposedBy: params.proposedBy,
        subjectType: params.subject.type,
        subjectCount: params.subject.ids.length,
      });

      return {
        success: true,
        licenseId,
      };
    } catch (error) {
      logger.error('Error proposing license', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Ratify a proposed license
   * Phase 2 of licensing lifecycle - requires human authorship
   */
  public ratifyLicense(params: LicenseRatificationParams): {
    success: boolean;
    error?: string;
  } {
    try {
      const license = this.licenses.get(params.licenseId);

      if (!license) {
        return {
          success: false,
          error: 'License not found',
        };
      }

      // Validate status
      if (license.status !== 'proposed') {
        return {
          success: false,
          error: `License cannot be ratified from ${license.status} status`,
        };
      }

      // Validate ratifier is the grantor
      if (params.ratifiedBy !== license.grantorId) {
        return {
          success: false,
          error: 'Only the grantor can ratify a license',
        };
      }

      // Validate human authorship requirement
      const requireHuman = this.config.requireHumanRatification ?? true;
      if (requireHuman && !params.humanAuthorship) {
        return {
          success: false,
          error: 'Human authorship required for ratification',
        };
      }

      // Validate ratification statement
      if (!params.ratificationStatement || params.ratificationStatement.trim().length === 0) {
        return {
          success: false,
          error: 'Ratification statement is required',
        };
      }

      const now = Date.now();

      // Update license
      license.status = 'ratified';
      license.ratifiedAt = now;
      license.ratificationStatement = params.ratificationStatement;
      license.signature = params.signature;
      license.humanAuthorship = params.humanAuthorship;

      // Calculate license hash
      license.licenseHash = this.calculateLicenseHash(license);

      this.saveLicense(license);

      logger.info('License ratified', {
        licenseId: params.licenseId,
        grantorId: license.grantorId,
        humanAuthorship: params.humanAuthorship,
      });

      return {
        success: true,
      };
    } catch (error) {
      logger.error('Error ratifying license', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Activate a ratified license
   * Phase 3 of licensing lifecycle
   */
  public activateLicense(licenseId: string): {
    success: boolean;
    error?: string;
  } {
    try {
      const license = this.licenses.get(licenseId);

      if (!license) {
        return {
          success: false,
          error: 'License not found',
        };
      }

      // Validate status
      if (license.status !== 'ratified') {
        return {
          success: false,
          error: `License cannot be activated from ${license.status} status`,
        };
      }

      // Check if already expired (for time-bounded licenses)
      if (
        license.scope.duration.type === 'time_bounded' &&
        license.scope.duration.expiresAt! <= Date.now()
      ) {
        license.status = 'expired';
        this.saveLicense(license);

        return {
          success: false,
          error: 'License has already expired',
        };
      }

      const now = Date.now();

      // Update license
      license.status = 'active';
      license.activatedAt = now;

      this.saveLicense(license);

      logger.info('License activated', {
        licenseId,
        grantorId: license.grantorId,
        granteeId: license.granteeId,
      });

      return {
        success: true,
      };
    } catch (error) {
      logger.error('Error activating license', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Revoke an active license
   * Requires human authorship and natural language statement
   */
  public revokeLicense(params: LicenseRevocationParams): {
    success: boolean;
    error?: string;
  } {
    try {
      const license = this.licenses.get(params.licenseId);

      if (!license) {
        return {
          success: false,
          error: 'License not found',
        };
      }

      // Validate status
      if (license.status === 'revoked') {
        return {
          success: false,
          error: 'License is already revoked',
        };
      }

      if (license.status === 'expired') {
        return {
          success: false,
          error: 'Cannot revoke an expired license',
        };
      }

      // Validate revoker is the grantor
      if (params.revokedBy !== license.grantorId) {
        return {
          success: false,
          error: 'Only the grantor can revoke a license',
        };
      }

      // Validate revocation statement
      if (!params.revocationStatement || params.revocationStatement.trim().length === 0) {
        return {
          success: false,
          error: 'Revocation statement is required',
        };
      }

      const now = Date.now();

      // Update license
      license.status = 'revoked';
      license.revokedAt = now;
      license.revocationStatement = params.revocationStatement;
      license.revocationSignature = params.signature;

      this.saveLicense(license);

      logger.info('License revoked', {
        licenseId: params.licenseId,
        grantorId: license.grantorId,
        reason: params.revocationStatement,
      });

      return {
        success: true,
      };
    } catch (error) {
      logger.error('Error revoking license', { error });
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * Check and expire time-bounded licenses
   */
  public checkAndExpireLicenses(): {
    expiredCount: number;
    expiredLicenses: string[];
  } {
    const now = Date.now();
    const expired: string[] = [];

    for (const license of this.licenses.values()) {
      if (
        license.status === 'active' &&
        license.scope.duration.type === 'time_bounded' &&
        license.scope.duration.expiresAt! <= now
      ) {
        license.status = 'expired';
        this.saveLicense(license);
        expired.push(license.licenseId);

        logger.info('License automatically expired', {
          licenseId: license.licenseId,
          expiresAt: license.scope.duration.expiresAt,
        });
      }
    }

    return {
      expiredCount: expired.length,
      expiredLicenses: expired,
    };
  }

  /**
   * Get license by ID
   */
  public getLicense(licenseId: string): License | undefined {
    return this.licenses.get(licenseId);
  }

  /**
   * Get licenses by grantor
   */
  public getLicensesByGrantor(grantorId: string): License[] {
    return Array.from(this.licenses.values()).filter(
      (license) => license.grantorId === grantorId
    );
  }

  /**
   * Get licenses by grantee
   */
  public getLicensesByGrantee(granteeId: string): License[] {
    return Array.from(this.licenses.values()).filter(
      (license) => license.granteeId === granteeId
    );
  }

  /**
   * Get licenses by status
   */
  public getLicensesByStatus(status: LicenseStatus): License[] {
    return Array.from(this.licenses.values()).filter((license) => license.status === status);
  }

  /**
   * Get active licenses for a specific subject
   */
  public getActiveLicensesForSubject(subjectType: SubjectType, subjectId: string): License[] {
    return Array.from(this.licenses.values()).filter(
      (license) =>
        license.status === 'active' &&
        license.scope.subject.type === subjectType &&
        license.scope.subject.ids.includes(subjectId)
    );
  }

  /**
   * Verify if a grantee has active license for a subject
   */
  public verifyLicense(
    granteeId: string,
    subjectType: SubjectType,
    subjectId: string
  ): {
    hasLicense: boolean;
    license?: License;
    reason?: string;
  } {
    const licenses = Array.from(this.licenses.values()).filter(
      (license) =>
        license.granteeId === granteeId &&
        license.scope.subject.type === subjectType &&
        license.scope.subject.ids.includes(subjectId)
    );

    // Find active license
    const activeLicense = licenses.find((l) => l.status === 'active');

    if (activeLicense) {
      return {
        hasLicense: true,
        license: activeLicense,
      };
    }

    // Check for expired/revoked licenses
    const expiredLicense = licenses.find((l) => l.status === 'expired');
    if (expiredLicense) {
      return {
        hasLicense: false,
        reason: 'License has expired',
      };
    }

    const revokedLicense = licenses.find((l) => l.status === 'revoked');
    if (revokedLicense) {
      return {
        hasLicense: false,
        reason: 'License has been revoked',
      };
    }

    return {
      hasLicense: false,
      reason: 'No license found',
    };
  }

  /**
   * Get statistics
   */
  public getStats(): {
    totalLicenses: number;
    licensesByStatus: Record<LicenseStatus, number>;
    licensesBySubjectType: Record<SubjectType, number>;
    activeLicenses: number;
    expiredLicenses: number;
    revokedLicenses: number;
    averageSubjectsPerLicense: number;
  } {
    const licensesByStatus: Record<LicenseStatus, number> = {
      proposed: 0,
      ratified: 0,
      active: 0,
      expired: 0,
      revoked: 0,
    };

    const licensesBySubjectType: Record<SubjectType, number> = {
      receipt: 0,
      artifact: 0,
      agreement: 0,
      settlement: 0,
      intent: 0,
      other: 0,
    };

    let totalSubjects = 0;

    for (const license of this.licenses.values()) {
      licensesByStatus[license.status]++;
      licensesBySubjectType[license.scope.subject.type]++;
      totalSubjects += license.scope.subject.ids.length;
    }

    return {
      totalLicenses: this.licenses.size,
      licensesByStatus,
      licensesBySubjectType,
      activeLicenses: licensesByStatus.active,
      expiredLicenses: licensesByStatus.expired,
      revokedLicenses: licensesByStatus.revoked,
      averageSubjectsPerLicense:
        this.licenses.size > 0 ? Math.round((totalSubjects / this.licenses.size) * 10) / 10 : 0,
    };
  }

  /**
   * Calculate SHA-256 hash of license contents
   */
  private calculateLicenseHash(license: License): string {
    const hashContent = {
      licenseId: license.licenseId,
      grantorId: license.grantorId,
      granteeId: license.granteeId,
      scope: license.scope,
      ratifiedAt: license.ratifiedAt,
      ratificationStatement: license.ratificationStatement,
      underlyingReferences: license.underlyingReferences,
    };

    return crypto.createHash('sha256').update(JSON.stringify(hashContent)).digest('hex');
  }

  /**
   * Save license to disk
   */
  private saveLicense(license: License): void {
    const filePath = path.join(this.dataPath, `${license.licenseId}.json`);

    try {
      fs.writeFileSync(filePath, JSON.stringify(license, null, 2));
    } catch (error) {
      logger.error('Error saving license', {
        licenseId: license.licenseId,
        error,
      });
    }
  }

  /**
   * Load all licenses from disk
   */
  private loadLicenses(): void {
    if (!fs.existsSync(this.dataPath)) {
      return;
    }

    try {
      const files = fs.readdirSync(this.dataPath);

      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }

        const filePath = path.join(this.dataPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const license: License = JSON.parse(content);

        this.licenses.set(license.licenseId, license);
      }

      logger.info('Licenses loaded from disk', {
        count: this.licenses.size,
      });
    } catch (error) {
      logger.error('Error loading licenses', { error });
    }
  }
}
