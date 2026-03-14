import json
import random
from collections import deque
from itertools import permutations

SIZE = 6
TARGET_SIZE_PROFILES = [
    [1, 2, 3, 10, 10, 10],
    [1, 2, 3, 9, 10, 11],
    [1, 2, 3, 8, 11, 11],
    [2, 3, 4, 9, 9, 9],
    [2, 3, 5, 8, 9, 9],
]
SINGLETON_PROFILES = [profile for profile in TARGET_SIZE_PROFILES if 1 in profile]
NON_SINGLETON_PROFILES = [profile for profile in TARGET_SIZE_PROFILES if 1 not in profile]
PUZZLE_NAMES = [
    ('sunrise-stripes', 'Sunrise Stripes', 'Easy'),
    ('ribbon-dance', 'Ribbon Dance', 'Easy'),
    ('petal-path', 'Petal Path', 'Easy'),
    ('ladder-lights', 'Ladder Lights', 'Medium'),
    ('canyon-echo', 'Canyon Echo', 'Medium'),
    ('orbital-bloom', 'Orbital Bloom', 'Medium'),
    ('current-knot', 'Current Knot', 'Hard'),
    ('lantern-grove', 'Lantern Grove', 'Hard'),
    ('mosaic-crossing', 'Mosaic Crossing', 'Hard'),
    ('ivy-loop', 'Ivy Loop', 'Expert'),
]


def is_valid_solution(columns):
    for row_a, col_a in enumerate(columns):
        for row_b, col_b in enumerate(columns):
            if row_a >= row_b:
                continue
            if abs(row_a - row_b) <= 1 and abs(col_a - col_b) <= 1:
                return False
    return True


def find_candidate_solutions(limit):
    candidates = []
    for permutation in permutations(range(SIZE)):
        if is_valid_solution(permutation):
            candidates.append(list(permutation))
        if len(candidates) >= limit:
            break
    return candidates


def find_all_candidate_solutions():
    return [list(permutation) for permutation in permutations(range(SIZE)) if is_valid_solution(permutation)]


def count_region_solutions(regions, candidates):
    matches = []

    for candidate in candidates:
        region_hits = [0] * SIZE
        valid = True

        for row, col in enumerate(candidate):
            region_id = regions[row][col]
            region_hits[region_id] += 1
            if region_hits[region_id] > 1:
                valid = False
                break

        if valid and all(count == 1 for count in region_hits):
            matches.append(candidate)

    return matches


def ensure_connected(grid, region_id):
    cells = [(row, col) for row in range(SIZE) for col in range(SIZE) if grid[row][col] == region_id]
    queue = deque([cells[0]])
    seen = {cells[0]}

    while queue:
        row, col = queue.popleft()
        for row_offset, col_offset in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            next_row = row + row_offset
            next_col = col + col_offset
            if not (0 <= next_row < SIZE and 0 <= next_col < SIZE):
                continue
            if grid[next_row][next_col] != region_id or (next_row, next_col) in seen:
                continue
            seen.add((next_row, next_col))
            queue.append((next_row, next_col))

    return len(seen) == len(cells)


def grow_regions(seed, solution, target_sizes):
    random.seed(seed)
    if len(target_sizes) != SIZE or sum(target_sizes) != SIZE * SIZE:
        raise ValueError('target_sizes must describe a full board partition')

    seeds = [(row, col) for row, col in enumerate(solution)]
    owner = {cell: index for index, cell in enumerate(seeds)}
    frontiers = {index: [cell] for index, cell in enumerate(seeds)}
    region_sizes = {index: 1 for index in range(SIZE)}
    directions = ((1, 0), (-1, 0), (0, 1), (0, -1))

    while sum(region_sizes.values()) < SIZE * SIZE:
        progress = False
        order = [region_id for region_id in range(SIZE) if region_sizes[region_id] < target_sizes[region_id]]
        random.shuffle(order)

        for region_id in order:
            candidates = frontiers[region_id][:]
            random.shuffle(candidates)

            for row, col in candidates:
                neighbors = []
                for row_offset, col_offset in directions:
                    next_row = row + row_offset
                    next_col = col + col_offset
                    if 0 <= next_row < SIZE and 0 <= next_col < SIZE and (next_row, next_col) not in owner:
                        neighbors.append((next_row, next_col))

                if neighbors:
                    chosen = random.choice(neighbors)
                    owner[chosen] = region_id
                    frontiers[region_id].append(chosen)
                    region_sizes[region_id] += 1
                    progress = True
                    break

        if not progress:
            raise RuntimeError('region growth stalled')

    grid = [[owner[(row, col)] for col in range(SIZE)] for row in range(SIZE)]
    for region_id in range(SIZE):
        if not ensure_connected(grid, region_id):
            raise RuntimeError(f'region {region_id} is disconnected')
    return grid


def build_puzzles():
    all_candidates = find_all_candidate_solutions()
    rng = random.Random(314159)
    puzzles = []

    for index, (puzzle_id, name, difficulty) in enumerate(PUZZLE_NAMES, start=1):
        puzzle = None

        wants_singleton = index <= len(PUZZLE_NAMES) // 2
        preferred_profiles = SINGLETON_PROFILES if wants_singleton else NON_SINGLETON_PROFILES

        for attempt in range(1, 3001):
            solution = rng.choice(all_candidates)
            profile_pool = preferred_profiles if attempt <= 2000 else TARGET_SIZE_PROFILES
            profile = profile_pool[(index + attempt) % len(profile_pool)][:]
            rng.shuffle(profile)

            try:
                regions = grow_regions(seed=10_000 + index * 1_000 + attempt, solution=solution, target_sizes=profile)
            except RuntimeError:
                continue

            matching_solutions = count_region_solutions(regions, all_candidates)

            if len(matching_solutions) == 1:
                unique_solution = matching_solutions[0]
                puzzle = {
                    'id': puzzle_id,
                    'name': name,
                    'difficulty': difficulty,
                    'size': SIZE,
                    'solution': [[row, col] for row, col in enumerate(unique_solution)],
                    'regions': regions,
                }
                break

        if puzzle is None:
            raise RuntimeError(f'Could not generate a unique puzzle for {puzzle_id}')

        puzzles.append(puzzle)

    return puzzles


if __name__ == '__main__':
    print(json.dumps(build_puzzles(), indent=2))
