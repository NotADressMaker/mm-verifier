import { CheckerResult } from './types';

export interface ArithmeticCheckerInput {
  text: string;
}

type ArithmeticFinding = {
  expression: string;
  expected: number;
  provided: number;
};

export function arithmeticChecker(
  input: ArithmeticCheckerInput
): CheckerResult<{ mismatches: ArithmeticFinding[] }> {
  const regex = /(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)\s*=\s*(-?\d+(?:\.\d+)?)/g;
  const findings: ArithmeticFinding[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(input.text)) !== null) {
    const left = parseFloat(match[1]);
    const operator = match[2];
    const right = parseFloat(match[3]);
    const provided = parseFloat(match[4]);
    let expected = 0;

    switch (operator) {
      case '+':
        expected = left + right;
        break;
      case '-':
        expected = left - right;
        break;
      case '*':
        expected = left * right;
        break;
      case '/':
        expected = right === 0 ? NaN : left / right;
        break;
      default:
        expected = NaN;
    }

    if (!Number.isFinite(expected) || Math.abs(expected - provided) > 1e-6) {
      findings.push({
        expression: match[0],
        expected,
        provided,
      });
    }
  }

  const total = findings.length;
  const score = total === 0 ? 10000 : 0;

  return {
    name: 'arithmetic_checker',
    status: findings.length === 0 ? 'pass' : 'fail',
    score_bps: score,
    findings: {
      mismatches: findings,
    },
  };
}
