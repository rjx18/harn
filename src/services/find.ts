import type { Anchor } from "../anchors/types.js";
import { scanAnchors } from "../anchors/scanner.js";
import { HarnError } from "../core/errors.js";
import type { HarnPaths } from "../core/repo.js";
import type { Assumption } from "../domain/assumption.js";
import { loadHarnProject, type HarnProject } from "../domain/project.js";

export interface FindOptions {
  assumptionId?: string;
  dependedBy?: string;
  depth?: number;
  file?: string;
  planId?: string;
}

export async function findHarn(paths: HarnPaths, options: FindOptions): Promise<unknown> {
  const [project, scan] = await Promise.all([loadHarnProject(paths), scanAnchors(paths.root)]);

  if (options.dependedBy) {
    return findDependedBy(project.assumptions, options.dependedBy, options.depth ?? 1);
  }

  if (options.file) {
    return findFileAnchors(scan.anchors, options.file);
  }

  if (options.planId) {
    return findPlanScope(project, options.planId);
  }

  if (options.assumptionId) {
    return findAssumption(project.assumptions, scan.anchors, options.assumptionId);
  }

  return {
    summary: {
      assumptions: project.assumptions.length,
      anchors: scan.anchors.length,
      plans: project.plans.length
    }
  };
}

function findAssumption(assumptions: Assumption[], anchors: Anchor[], assumptionId: string): unknown {
  const assumption = requireAssumption(assumptions, assumptionId);

  return {
    assumption: {
      id: assumption.id,
      title: assumption.title,
      state: assumption.state,
      statement: assumption.statement
    },
    depends_on: assumption.depends_on,
    depended_by: assumptions
      .filter((candidate) => candidate.depends_on.includes(assumption.id))
      .map((candidate) => ({ id: candidate.id, title: candidate.title })),
    anchors: anchors
      .filter((anchor) => anchor.assumptionId === assumption.id)
      .map((anchor) => ({
        ref: anchor.ref,
        file: anchor.file,
        line: anchor.startLine
      }))
  };
}

function findDependedBy(assumptions: Assumption[], assumptionId: string, depth: number): unknown {
  const target = requireAssumption(assumptions, assumptionId);
  const dependents = collectDependents(assumptions, assumptionId, depth);

  return {
    target: {
      id: target.id,
      title: target.title
    },
    depended_by: {
      depth,
      assumptions: dependents.map((assumption) => ({
        id: assumption.id,
        title: assumption.title,
        depth: assumption.depth
      }))
    }
  };
}

function findFileAnchors(anchors: Anchor[], file: string): unknown {
  return {
    file,
    anchors: anchors
      .filter((anchor) => anchor.file === file)
      .map((anchor) => ({
        assumption: anchor.assumptionId,
        ref: anchor.ref,
        line: anchor.startLine
      }))
  };
}

function findPlanScope(project: HarnProject, planId: string): unknown {
  const plan = project.plans.find((candidate) => candidate.id === planId);
  if (!plan) {
    throw new HarnError(`Plan not found: ${planId}`);
  }

  return {
    plan: {
      id: plan.id,
      title: plan.title
    },
    assumptions: {
      retire: plan.assumptions.retire.map((action) => action.id),
      create: plan.assumptions.create.map((action) => action.id),
      reviewed: plan.assumptions.reviewed.map((action) => action.id)
    },
    anchors: Object.entries(plan.anchors).flatMap(([assumptionId, refs]) =>
      Object.entries(refs).map(([ref, action]) => ({
        assumption: assumptionId,
        ref,
        planned_action: action.action
      }))
    )
  };
}

function requireAssumption(assumptions: Assumption[], assumptionId: string): Assumption {
  const assumption = assumptions.find((candidate) => candidate.id === assumptionId);
  if (!assumption) {
    throw new HarnError(`Assumption not found: ${assumptionId}`);
  }

  return assumption;
}

function collectDependents(
  assumptions: Assumption[],
  assumptionId: string,
  maxDepth: number
): Array<Assumption & { depth: number }> {
  const results: Array<Assumption & { depth: number }> = [];
  const seen = new Set<string>([assumptionId]);
  let frontier = [{ id: assumptionId, depth: 0 }];

  while (frontier.length > 0) {
    const nextFrontier: Array<{ id: string; depth: number }> = [];

    for (const current of frontier) {
      if (current.depth >= maxDepth) {
        continue;
      }

      const nextDepth = current.depth + 1;
      for (const assumption of assumptions) {
        if (!assumption.depends_on.includes(current.id) || seen.has(assumption.id)) {
          continue;
        }

        seen.add(assumption.id);
        results.push({ ...assumption, depth: nextDepth });
        nextFrontier.push({ id: assumption.id, depth: nextDepth });
      }
    }

    frontier = nextFrontier;
  }

  return results;
}
