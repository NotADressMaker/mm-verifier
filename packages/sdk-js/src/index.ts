export { MAMVClient, MAMVClientOptions } from './client';
/** @deprecated Use MAMVClient. */
export { MAMVClient as MMVClient } from './client';
/** @deprecated Use MAMVClientOptions. */
export type { MAMVClientOptions as MMVClientOptions } from './client';
export * from './types';
export {
  verify,
  verifyReceiptOnchain,
  createClient,
  FACTUAL_CONSENSUS_PROGRAM,
} from './quickstart';
export type { QuickstartConfig } from './quickstart';
