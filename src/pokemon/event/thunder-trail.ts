export const THUNDER_TRAIL_BOARD_SIZE = 8;
export const THUNDER_TRAIL_MIN_STEPS = 10;
export const THUNDER_TRAIL_MAX_STEPS = 10;

export const THUNDER_DIRECTIONS = [
  { label: "↖️", dx: -1, dy: -1 }, { label: "⬆️", dx: 0, dy: -1 }, { label: "↗️", dx: 1, dy: -1 },
  { label: "⬅️", dx: -1, dy: 0 }, { label: "➡️", dx: 1, dy: 0 },
  { label: "↙️", dx: -1, dy: 1 }, { label: "⬇️", dx: 0, dy: 1 }, { label: "↘️", dx: 1, dy: 1 },
] as const;

export type ThunderDirectionIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
type Point = { x: number; y: number };

export type ThunderTrailPath = {
  directions: ThunderDirectionIndex[];
  points: Point[];
};

function adjacent(left: Point, right: Point): boolean {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) === 1;
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target]!, result[index]!];
  }
  return result;
}

/**
 * Builds an induced path in a king-move grid. A new point may touch only its
 * immediate predecessor, so the rendered route cannot form branches or touch itself.
 */
export function createThunderTrailPath(random = Math.random, steps = THUNDER_TRAIL_MIN_STEPS + Math.floor(random() * (THUNDER_TRAIL_MAX_STEPS - THUNDER_TRAIL_MIN_STEPS + 1))): ThunderTrailPath {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const points: Point[] = [{ x: Math.floor(random() * THUNDER_TRAIL_BOARD_SIZE), y: Math.floor(random() * THUNDER_TRAIL_BOARD_SIZE) }];
    const directions: ThunderDirectionIndex[] = [];
    const extend = (): boolean => {
      if (directions.length === steps) return true;
      const current = points.at(-1)!;
      for (const directionIndex of shuffled(THUNDER_DIRECTIONS.map((_, index) => index as ThunderDirectionIndex), random)) {
        const direction = THUNDER_DIRECTIONS[directionIndex];
        const candidate = { x: current.x + direction.dx, y: current.y + direction.dy };
        if (candidate.x < 0 || candidate.y < 0 || candidate.x >= THUNDER_TRAIL_BOARD_SIZE || candidate.y >= THUNDER_TRAIL_BOARD_SIZE) continue;
        if (points.some((point, index) => index < points.length - 1 && adjacent(point, candidate))) continue;
        points.push(candidate);
        directions.push(directionIndex);
        if (extend()) return true;
        directions.pop();
        points.pop();
      }
      return false;
    };
    if (extend()) return { directions, points };
  }
  throw new Error("Could not create a non-touching Thunder Trail path.");
}

export function renderThunderTrailPath(path: ThunderTrailPath): string {
  const pointIndex = new Map(path.points.map((point, index) => [`${point.x}:${point.y}`, index]));
  return Array.from({ length: THUNDER_TRAIL_BOARD_SIZE }, (_, y) => Array.from({ length: THUNDER_TRAIL_BOARD_SIZE }, (_, x) => {
    const index = pointIndex.get(`${x}:${y}`);
    if (index === undefined) return "⬛";
    if (index === 0) return "🟢";
    if (index === path.points.length - 1) return "⚡";
    return "🟨";
  }).join("")).join("\n");
}

export function isValidThunderTrailPath(path: ThunderTrailPath): boolean {
  if (path.points.length !== path.directions.length + 1 || path.directions.length < THUNDER_TRAIL_MIN_STEPS || path.directions.length > THUNDER_TRAIL_MAX_STEPS) return false;
  return path.points.every((point, index) => path.points.every((other, otherIndex) => {
    if (index === otherIndex) return true;
    const isNeighbour = adjacent(point, other);
    return !isNeighbour || Math.abs(index - otherIndex) === 1;
  }));
}
