import fs from 'fs';
import path from 'path';
import { validateProgram } from '../../shared/programs';
import { validateReceiptV1 } from '../../shared/schemaValidation';

const { program } = require('../../programs/factual-consensus');

const fixturesDir = path.join(
  __dirname,
  '../../programs/factual-consensus/fixtures/v1.0.0'
);
const definitionPath = path.join(
  __dirname,
  '../../programs/factual-consensus/definition.json'
);

describe('Program conformance fixtures', () => {
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('validates the program definition and matches golden receipt output', async () => {
    const definition = JSON.parse(fs.readFileSync(definitionPath, 'utf8'));
    const definitionValidation = validateProgram(definition);
    expect(definitionValidation.valid).toBe(true);

    const input = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'input.json'), 'utf8')
    );
    const mockOutputs = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'mock_model_outputs.json'), 'utf8')
    );
    const expected = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'output.json'), 'utf8')
    );

    const bundle = {
      ...input.bundle,
      model_runs: mockOutputs,
    };

    const receipt = await program.run(bundle, input.context);
    expect(receipt).toEqual(expected);

    const schemaResult = validateReceiptV1(receipt);
    expect(schemaResult.valid).toBe(true);
  });
});
