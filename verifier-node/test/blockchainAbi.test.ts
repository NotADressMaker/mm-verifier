import { Interface } from 'ethers';
import { VerifierMarketplace } from '../../shared/abi';

describe('VerifierMarketplace ABI', () => {
  it('includes commit-reveal functions and events', () => {
    const iface = new Interface(VerifierMarketplace.abi);

    expect(() => iface.getFunction('createTask')).not.toThrow();
    expect(() => iface.getFunction('commitEvaluation')).not.toThrow();
    expect(() => iface.getFunction('revealEvaluation')).not.toThrow();
    expect(() => iface.getFunction('finalize')).not.toThrow();
    expect(() => iface.getFunction('getTaskMeta')).not.toThrow();

    expect(() => iface.getEvent('TaskCreated')).not.toThrow();
    expect(() => iface.getEvent('Committed')).not.toThrow();
    expect(() => iface.getEvent('Revealed')).not.toThrow();
    expect(() => iface.getEvent('Finalized')).not.toThrow();
  });
});
