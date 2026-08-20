// src/lib/queries/typosquat.ts
//
// Blueprint section 7.3: SIMILAR_NAME neighbors of a package, ranked by
// name-distance and download-count disparity. Real data: Levenshtein
// distance + real npm download counts (scripts/load-similar-names.ts).

import type { Session } from "neo4j-driver";
import { toBoltId, toJsNumber } from "../hydradb";
import { packageId } from "../ids";

export interface TyposquatCandidate {
  packageName: string;
  editDistance: number;
  downloadDisparity: number;
}

export async function getTyposquatCandidates(
  session: Session,
  packageName: string
): Promise<TyposquatCandidate[]> {
  const pid = packageId("npm", packageName);

  const result = await session.run(
    `MATCH (p:Package {id: $pid})-[r:SIMILAR_NAME]->(other:Package)
     RETURN other.name AS name, r.editDistance AS editDistance, r.downloadDisparity AS downloadDisparity
     ORDER BY r.editDistance ASC, r.downloadDisparity DESC`,
    { pid: toBoltId(pid) }
  );

  return result.records.map((record) => ({
    packageName: record.get("name") as string,
    editDistance: toJsNumber(record.get("editDistance")) as number,
    downloadDisparity: toJsNumber(record.get("downloadDisparity")) as number,
  }));
}