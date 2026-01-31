import { Interface } from 'ethers';
import { MARKETPLACE_ABI } from '../src/services/blockchain';

describe('Marketplace ABI', () => {
  it('exposes the contract methods and events used by the API', () => {
    const iface = new Interface(MARKETPLACE_ABI);

    expect(() => iface.getFunction('createTask')).not.toThrow();
    expect(() => iface.getFunction('getTaskMeta')).not.toThrow();
    expect(() => iface.getEvent('TaskCreated')).not.toThrow();

    expect(() => iface.getFunction('submitJob')).toThrow();
    expect(() => iface.getFunction('getJob')).toThrow();
    expect(() => iface.getFunction('getEvaluation')).toThrow();
  });
});
