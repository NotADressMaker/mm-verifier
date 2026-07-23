import { Claim, ClaimType, Finding, VerificationContext } from '../core/models';
export interface Checker {
  readonly name: string;
  readonly version: string;
  readonly supportedClaimTypes: ReadonlySet<ClaimType>;
  check(claim: Claim, context: VerificationContext): Promise<Finding[]>;
}
