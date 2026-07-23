import Ajv2020 from 'ajv/dist/2020';
import { readFileSync } from 'fs';
import { join } from 'path';
import { VerificationPipeline } from '../../src/ovp/core/pipeline';

describe('OVP schemas', () => {
  it('validates a generated run against the OVP run schema', async () => {
    const schema = JSON.parse(readFileSync(join(__dirname, '../../../schemas/ovp-run.schema.json'), 'utf8'));
    const validate = new Ajv2020({ strict: false }).compile(schema);
    expect(validate(await new VerificationPipeline().verify({ text: 'A claim is externally testable.' }))).toBe(true);
  });
});
