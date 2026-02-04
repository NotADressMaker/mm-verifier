/**
 * Export Contract ABIs to shared/abi/
 *
 * Copies compiled contract artifacts to shared/abi/ for use by API and verifier-node.
 * Run this after `npm run compile` in the contracts directory.
 */

import * as fs from 'fs';
import * as path from 'path';

const ARTIFACTS_DIR = path.join(__dirname, '../artifacts/contracts');
const OUTPUT_DIR = path.join(__dirname, '../../shared/abi');

const CONTRACTS_TO_EXPORT = [
  'VerifierMarketplace',
  'BondVaultWETH',
  'DisputeLadder',
  'AuditorRegistry',
  'BundleRegistry',
  'BLSSlashingManager',
  'StakingManager',
  'DisputeResolver',
  'JobBoardEscrow',
];

async function exportABIs() {
  console.log('Exporting contract ABIs...\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`✅ Created output directory: ${OUTPUT_DIR}\n`);
  }

  let exportedCount = 0;
  let errorCount = 0;

  for (const contractName of CONTRACTS_TO_EXPORT) {
    try {
      // Find contract artifact (may be in subdirectory)
      const artifactPath = findArtifact(ARTIFACTS_DIR, contractName);

      if (!artifactPath) {
        console.error(`❌ Artifact not found: ${contractName}`);
        errorCount++;
        continue;
      }

      // Read artifact
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));

      // Create simplified export with just ABI, bytecode, contractName
      const exportData = {
        contractName: artifact.contractName,
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        sourceName: artifact.sourceName,
      };

      // Write to output directory
      const outputPath = path.join(OUTPUT_DIR, `${contractName}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));

      console.log(`✅ Exported: ${contractName} → ${path.relative(process.cwd(), outputPath)}`);
      exportedCount++;
    } catch (error: any) {
      console.error(`❌ Error exporting ${contractName}:`, error.message);
      errorCount++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Exported ${exportedCount}/${CONTRACTS_TO_EXPORT.length} contracts`);
  if (errorCount > 0) {
    console.log(`${errorCount} errors encountered`);
  }
  console.log(`${'='.repeat(60)}\n`);

  if (exportedCount > 0) {
    console.log('Next steps:');
    console.log('1. Update shared/abi/index.ts to uncomment imports');
    console.log('2. Restart API and verifier-node services');
    console.log('3. Update import statements in API/verifier-node code\n');
  }
}

/**
 * Recursively find artifact file for a contract
 */
function findArtifact(dir: string, contractName: string): string | null {
  if (!fs.existsSync(dir)) {
    return null;
  }

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Check if directory matches contract name
      if (file.endsWith('.sol')) {
        const jsonPath = path.join(fullPath, `${contractName}.json`);
        if (fs.existsSync(jsonPath)) {
          return jsonPath;
        }
      }

      // Recursively search subdirectories
      const found = findArtifact(fullPath, contractName);
      if (found) return found;
    }
  }

  return null;
}

// Run export
exportABIs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
