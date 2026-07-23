import { Checker } from '../checkers/base';
import { Claim } from './models';

export class CheckerRegistry {
  private readonly checkers: Checker[] = [];
  register(checker: Checker): void {
    if (this.checkers.some((candidate) => candidate.name === checker.name)) throw new Error(`Checker already registered: ${checker.name}`);
    this.checkers.push(checker);
  }
  forClaim(claim: Claim): Checker[] {
    return this.checkers.filter((checker) => checker.supportedClaimTypes.has(claim.claim_type) || checker.supportedClaimTypes.has('unknown'));
  }
  versions(): Record<string, string> { return Object.fromEntries(this.checkers.map((checker) => [checker.name, checker.version])); }
}
