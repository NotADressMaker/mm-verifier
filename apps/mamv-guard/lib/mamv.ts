import { MAMVClient } from '@mamv/sdk';
import { config } from './config';
export function createMamvClient() { return new MAMVClient({ baseUrl: config.mamvBaseUrl, apiKey: config.mamvApiKey, chainId: config.chainId, contractAddress: config.contractAddress }); }
