import type { INodeTypeBaseDescription, IVersionedNodeType } from 'n8n-workflow';
import { VersionedNodeType } from 'n8n-workflow';

import { LimescapeDocsV1 } from './v1/LimescapeDocsV1.node';

/**
 * LimescapeDocs Versioned Node
 *
 * =============================================================================
 * HOW N8N NODE VERSIONING WORKS (Hybrid)
 * =============================================================================
 *
 * 1. EXISTING WORKFLOWS KEEP THEIR VERSION
 *    - A workflow saved with version 1.22 will ALWAYS use version 1.22
 *    - This ensures existing workflows never break when you update the node

 * 2. NEW WORKFLOWS GET THE `defaultVersion`
 *    - When users add a new Limescape Docs node, they get the defaultVersion
 *    - Users can manually change versions in node settings if needed

 * 3. LIGHT VS FULL VERSIONING
 *    - Light versioning (minor updates): Inside a major implementation (e.g., V1), use a version array
 *      in the implementation file (e.g., `version: [1.21, 1.22, 1.23]`) and `@version` in displayOptions.
 *    - Full versioning (major updates): This entry class maps versions to implementations via `nodeVersions`.
 *      Example: `1.21/1.22/1.23 → LimescapeDocsV1`, `2/2.1 → LimescapeDocsV2`.
 *
 * =============================================================================
 * ADDING A NEW VERSION
 * =============================================================================
 *
 * SCENARIO A: Library update is backward compatible (minor: 1.22 → 1.23)
 * -----------------------------------------------------------------------
 * If limescape-docs changes are backward compatible, add the new minor both to:
 * - V1 implementation `version` array: e.g., `[1.21, 1.22, 1.23]`
 * - Entry `nodeVersions` map pointing to the SAME V1 implementation:
 *
 *   const nodeVersions: IVersionedNodeType['nodeVersions'] = {
 *       1.22: new LimescapeDocsV1(baseDescription),
 *       1.23: new LimescapeDocsV1(baseDescription),  // ADD THIS
 *   };
 *   // Optionally update: defaultVersion: 1.23
 *
 *
 * SCENARIO B: Breaking changes require new implementation (major: 1.x → 2.0)
 * -----------------------------------------------------------------------
 * If there are breaking changes (new required params, removed features, etc.):
 *
 * Step 1: Create v2/ folder:
 *   nodes/LimescapeDocs/
 *   ├── v1/LimescapeDocsV1.node.ts  (keep for 1.21/1.22/1.23 workflows)
 *   └── v2/LimescapeDocsV2.node.ts  (NEW implementation)
 *
 * Step 2: Import and add to nodeVersions:
 *   import { LimescapeDocsV2 } from './v2/LimescapeDocsV2.node';
 *
 *   const nodeVersions: IVersionedNodeType['nodeVersions'] = {
 *       1.22: new LimescapeDocsV1(baseDescription),  // Old workflows still work!
 *       2: new LimescapeDocsV2(baseDescription),     // New major version
 *   };
 *   // Update: defaultVersion: 2
 *
 * =============================================================================
 * VERSION HISTORY
 * =============================================================================
 * - 1.22: Initial versioned release (maps to limescape-docs 1.22.x)
 *         Uses LimescapeDocsV1 implementation
 *
 */
export class LimescapeDocs extends VersionedNodeType {
    constructor() {
        const baseDescription: INodeTypeBaseDescription = {
            displayName: 'Limescape Docs',
            name: 'limescapeDocs',
            icon: 'file:limescape-logo-square.svg',
            group: ['transform'],
            subtitle: '={{$parameter["operation"]}}',
            description: 'OCR & Document Extraction using AI models via Limescape Docs',
            defaultVersion: 1.23,  // ← UPDATE THIS when adding new versions
        };

        // =====================================================================
        // NODE VERSIONS MAP
        // =====================================================================
        // Each key is a version number, each value is an INodeType implementation.
        // Add new versions here. Old versions must remain to support existing workflows!
        const nodeVersions: IVersionedNodeType['nodeVersions'] = {
            1: new LimescapeDocsV1(baseDescription),
            1.21: new LimescapeDocsV1(baseDescription),
            1.22: new LimescapeDocsV1(baseDescription),
            1.23: new LimescapeDocsV1(baseDescription)
            // Future versions:
            // 1.23: new LimescapeDocsV1(baseDescription),  // If backward compatible
            // 2: new LimescapeDocsV2(baseDescription),     // If breaking changes
        };

        super(nodeVersions, baseDescription);
    }
}
