import {
  applyOperations,
  clone,
  type Operation,
  type Project,
  type Proposal,
} from "../domain/model";

export function reviewIndexes(
  project: Project,
  proposal: Proposal,
  decision: "accept" | "reject",
  indexes?: number[],
) {
  if (
    indexes?.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= proposal.operations.length,
    )
  )
    throw new Error("Review item index is out of range.");
  const pending = proposal.operations
    .map((_, i) => i)
    .filter((i) => !proposal.reviewedOperations[String(i)]);
  const selected = indexes
    ? pending.filter((i) => indexes.includes(i))
    : pending;
  if (decision === "reject" || !selected.length) return selected;
  const valid = (items: number[]) => {
    try {
      applyOperations(
        project,
        items.map((i) => proposal.operations[i]!),
      );
      return true;
    } catch {
      return false;
    }
  };
  if (valid(selected)) return selected;
  if (!valid(pending))
    throw new Error(
      "These changes depend on a rejected or changed item. Restore the rejected item or create a fresh proposal.",
    );
  // Keep the requested items and only the other changes needed for a valid project.
  let group = pending;
  for (const i of pending) {
    if (selected.includes(i)) continue;
    const without = group.filter((j) => j !== i);
    if (valid(without)) group = without;
  }
  return group;
}

const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const operationKey = (op: Operation) =>
  op.type === "set_project_meta" || op.type === "set_presentation"
    ? op.type
    : `${op.type.includes("media") ? "media" : op.type.includes("sequence") ? "sequence" : op.type.endsWith("cue") ? "cue" : "clip"}:${"sequenceId" in op ? op.sequenceId + ":" : ""}${"value" in op ? op.value.id : op.id}`;
export function conflictingOperations(a: Operation, b: Operation): boolean {
  if (a.type === "set_project_meta" && b.type === "set_project_meta")
    return Object.keys(a.value).some(
      (key) =>
        key in b.value &&
        !equal(
          a.value[key as keyof typeof a.value],
          b.value[key as keyof typeof b.value],
        ),
    );
  if (operationKey(a) === operationKey(b))
    return !equal(
      "value" in a ? a.value : undefined,
      "value" in b ? b.value : undefined,
    );
  if (
    (a.type === "upsert_sequence" || a.type === "remove_sequence") &&
    "sequenceId" in b &&
    (a.type === "upsert_sequence" ? a.value.id : a.id) === b.sequenceId
  ) {
    if (a.type === "remove_sequence") return true;
    const values = b.type.endsWith("cue") ? a.value.cues : a.value.clips;
    const expected = "value" in b ? b.value : undefined;
    return !equal(
      values.find((v) => v.id === ("value" in b ? b.value.id : b.id)),
      expected,
    );
  }
  if (
    (b.type === "upsert_sequence" || b.type === "remove_sequence") &&
    "sequenceId" in a
  )
    return conflictingOperations(b, a);
  return false;
}
function target(project: Project, op: Operation): unknown {
  if (op.type === "set_project_meta")
    return Object.fromEntries(
      Object.keys(op.value).map((k) => [k, project[k as keyof Project]]),
    );
  if (op.type === "set_presentation") return project.presentation;
  if (op.type === "upsert_media" || op.type === "remove_media")
    return project.media.find(
      (m) => m.id === ("value" in op ? op.value.id : op.id),
    );
  if (op.type === "upsert_sequence" || op.type === "remove_sequence")
    return project.sequences.find(
      (s) => s.id === ("value" in op ? op.value.id : op.id),
    );
  const sequence = project.sequences.find((s) => s.id === op.sequenceId);
  const items = op.type.endsWith("cue") ? sequence?.cues : sequence?.clips;
  return items?.find(
    (item) => item.id === ("value" in op ? op.value.id : op.id),
  );
}
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

// Merge only what the proposal changed. Arrays with IDs are collections;
// ordered values such as quiz answers and tags must agree as a whole.
function merge(
  before: unknown,
  current: unknown,
  proposed: unknown,
  path: string,
): unknown {
  if (
    path.endsWith(".provenance") &&
    object(before) &&
    object(current) &&
    object(proposed)
  ) {
    // Older cue forms rewrote creation metadata on every edit. Those fields
    // describe creation, not an authored change. Keep the saved attribution.
    proposed = {
      ...proposed,
      createdAt: before.createdAt,
      createdBy: before.createdBy,
    };
  }
  if (equal(before, proposed)) return current;
  if (equal(before, current) || equal(current, proposed)) return proposed;
  if (object(before) && object(current) && object(proposed)) {
    return Object.fromEntries(
      [
        ...new Set([
          ...Object.keys(before),
          ...Object.keys(current),
          ...Object.keys(proposed),
        ]),
      ].map((key) => [
        key,
        merge(before[key], current[key], proposed[key], `${path}.${key}`),
      ]),
    );
  }
  const keyed = (v: unknown): v is { id: string }[] =>
    Array.isArray(v) &&
    v.every((item) => object(item) && typeof item.id === "string") &&
    new Set(v.map((item) => item.id)).size === v.length;
  if (keyed(before) && keyed(current) && keyed(proposed)) {
    const ids = (items: { id: string }[]) => items.map((item) => item.id);
    // Preserve a single author's reordering; competing reorderings need review.
    const common = ids(before).filter(
      (id) =>
        current.some((v) => v.id === id) && proposed.some((v) => v.id === id),
    );
    const order = (items: { id: string }[]) =>
      ids(items).filter((id) => common.includes(id));
    const currentMoved = !equal(common, order(current));
    const proposedMoved = !equal(common, order(proposed));
    if (
      currentMoved &&
      proposedMoved &&
      !equal(order(current), order(proposed))
    )
      throw new Error(`${path} order`);
    const primary = proposedMoved ? proposed : current;
    const secondary = proposedMoved ? current : proposed;
    return [...new Set([...ids(primary), ...ids(secondary), ...ids(before)])]
      .map((id) =>
        merge(
          before.find((v) => v.id === id),
          current.find((v) => v.id === id),
          proposed.find((v) => v.id === id),
          `${path}[${id}]`,
        ),
      )
      .filter((v) => v !== undefined);
  }
  throw new Error(path);
}

export function rebaseProposal(
  before: Project | undefined,
  after: Project,
  proposal: Proposal,
) {
  const result = clone(proposal);
  const conflicts = new Map<number, string>();
  let baseline = before;
  if (baseline) {
    try {
      baseline = applyOperations(
        baseline,
        proposal.operations.filter(
          (_, i) => proposal.reviewedOperations[String(i)] === "accepted",
        ),
      );
    } catch {
      // Older partial reviews can depend on another proposal's resources.
      // Keep the original comparison when that intermediate project is invalid.
    }
  }
  result.operations = result.operations.map((op, i) => {
    if (result.reviewedOperations[String(i)]) return op;
    try {
      if (!baseline) throw new Error("original revision is unavailable");
      if (
        !("value" in op) &&
        target(baseline, op) === undefined &&
        target(after, op) !== undefined
      )
        throw new Error(op.type.replaceAll("_", " "));
      const value = merge(
        target(baseline, op),
        target(after, op),
        "value" in op ? op.value : undefined,
        op.type.replaceAll("_", " "),
      );
      if ("value" in op && value === undefined)
        throw new Error("item was removed");
      return "value" in op ? ({ ...op, value } as Operation) : op;
    } catch (error) {
      conflicts.set(
        i,
        `Item ${i + 1} conflicts with newer edits at ${error instanceof Error ? error.message : String(error)}. Keep the saved edit and reject this item, or create a replacement proposal from the latest version.`,
      );
      return op;
    }
  });
  return { proposal: result, conflicts };
}

export function planPreparedReview(
  project: Project,
  prepared: ReturnType<typeof rebaseProposal>,
  indexes?: number[],
) {
  for (const [index, message] of prepared.conflicts)
    if (!indexes || indexes.includes(index)) throw new Error(message);
  const available = clone(prepared.proposal);
  for (const index of prepared.conflicts.keys())
    available.reviewedOperations[String(index)] = "rejected";
  return reviewIndexes(project, available, "accept", indexes);
}
