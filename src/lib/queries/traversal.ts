// src/lib/queries/traversal.ts
//
// The blast-radius traversal both the exposure query and the remediation
// query run. It is one query in two places, so it is defined once here.
//
// pathCount and resultLimit are passed explicitly (not omitted) --
// confirmed via scripts/test-blast-radius.ts that omitting them causes
// SSpaths to return far fewer results than actually exist in the graph,
// even though their documented defaults (1 and 100,000 respectively)
// shouldn't cause that. Explicit values reliably produce complete,
// correct results.

export const SSPATHS_FROM_SOURCE = `CALL algo.SSpaths({sourceNode: $sourceNode, relTypes: ['DEPENDS_ON'], relDirection: 'incoming', maxLen: $maxLen, pathCount: 10, resultLimit: 1000})
     YIELD path
     RETURN path`;
