import json
import random
import sys
import multiprocessing
from collections import deque

BASE_NAMES = [
    'Sunrise Stripes', 'Ribbon Dance', 'Petal Path', 'Ladder Lights',
    'Canyon Echo', 'Orbital Bloom', 'Current Knot', 'Lantern Grove',
    'Mosaic Crossing', 'Ivy Loop'
]

def get_all_placements(size):
    """Returns a list of all valid star sets (bitmasks) for a given size."""
    # Adjacency masks: pre-calculate which cells are blocked by a star at (r, c)
    adj_masks = [0] * (size * size)
    for r in range(size):
        for c in range(size):
            mask = 0
            for dr in [-1, 0, 1]:
                for dc in [-1, 0, 1]:
                    nr, nc = r + dr, c + dc
                    if 0 <= nr < size and 0 <= nc < size:
                        mask |= (1 << (nr * size + nc))
            adj_masks[r * size + c] = mask

    placements = []
    
    def solve(r, current_mask, cols_mask, adj_forbidden_mask):
        if r == size:
            placements.append(current_mask)
            return
        
        # Possible columns in this row: not in cols_mask and not in adj_forbidden_mask
        row_start = r * size
        for c in range(size):
            pos = row_start + c
            if not (cols_mask & (1 << c)) and not (adj_forbidden_mask & (1 << pos)):
                solve(r + 1, 
                      current_mask | (1 << pos), 
                      cols_mask | (1 << c), 
                      adj_forbidden_mask | adj_masks[pos])

    solve(0, 0, 0, 0)
    return placements

class Scorer:
    def __init__(self, size, regions):
        self.size = size
        self.regions = regions
        self.grid = [None] * (size * size)
        self.score = 0
        self.stars_count = 0

    def solve_logic(self):
        # Implementation of Tier 1-3 logic to score difficulty
        # (Simplified for the turbo script, but keeps the same weights)
        changed = True
        while changed and self.stars_count < self.size:
            changed = False
            # 1. Housekeeping (Implicit in logic)
            # 2. Lone Candidates (Row, Col, Region)
            for rid in range(self.size):
                cells = [i for i, r in enumerate(self.regions) if r == rid]
                empty = [i for i in cells if self.grid[i] is None]
                if not any(self.grid[i] is True for i in cells) and len(empty) == 1:
                    self.grid[empty[0]] = True; self.stars_count += 1
                    self.score += 10; changed = True; break
            
            if changed: continue
            
            for r in range(self.size):
                cells = [r * self.size + c for c in range(self.size)]
                empty = [i for i in cells if self.grid[i] is None]
                if not any(self.grid[i] is True for i in cells) and len(empty) == 1:
                    self.grid[empty[0]] = True; self.stars_count += 1
                    self.score += 15; changed = True; break
            
            if changed: continue

            # 3. Pointing logic
            for rid in range(self.size):
                cells = [i for i, r in enumerate(self.regions) if r == rid]
                empty = [i for i in cells if self.grid[i] is None]
                if not any(self.grid[i] is True for i in cells) and len(empty) > 1:
                    rows = set(i // self.size for i in empty)
                    if len(rows) == 1:
                        row = list(rows)[0]
                        for c in range(self.size):
                            idx = row * self.size + c
                            if self.regions[idx] != rid and self.grid[idx] is None:
                                self.grid[idx] = False; changed = True
                        if changed: self.score += 30; break
            
        if self.stars_count < self.size:
            self.score += 600 # Expert jump
        return self.score

def generate_single_puzzle(args):
    size, all_placements, seed = args
    rng = random.Random(seed)
    
    target_mask = rng.choice(all_placements)
    target_cells = [i for i in range(size * size) if (target_mask & (1 << i))]
    
    regions = [-1] * (size * size)
    frontiers = []
    for rid, cell in enumerate(target_cells):
        regions[cell] = rid
        frontiers.append(cell)
    
    unassigned_count = (size * size) - size
    
    # BFS-like growth to guarantee connectivity
    while unassigned_count > 0:
        # Pick a random cell from the current regions' frontier
        idx = rng.choice(frontiers)
        r, c = idx // size, idx % size
        
        # Look for unassigned neighbors
        neighbors = []
        for dr, dc in [(0,1),(0,-1),(1,0),(-1,0)]:
            nr, nc = r+dr, c+dc
            if 0 <= nr < size and 0 <= nc < size:
                n_idx = nr * size + nc
                if regions[n_idx] == -1:
                    neighbors.append(n_idx)
        
        if not neighbors:
            frontiers.remove(idx)
            continue
            
        # Assign a random neighbor to the same region
        n_idx = rng.choice(neighbors)
        regions[n_idx] = regions[idx]
        frontiers.append(n_idx)
        unassigned_count -= 1

    # Uniqueness check
    is_unique = True
    for p_mask in all_placements:
        if p_mask == target_mask: continue
        hits = 0
        valid = True
        for i in range(size * size):
            if (p_mask & (1 << i)):
                rid = regions[i]
                if (hits & (1 << rid)):
                    valid = False; break
                hits |= (1 << rid)
        if valid:
            is_unique = False; break
    
    if is_unique:
        scorer = Scorer(size, regions)
        score = scorer.solve_logic()
        diff = 'Beginner' if score < 100 else 'Easy' if score < 250 else 'Medium' if score < 450 else 'Hard' if score < 800 else 'Expert'
        
        # Format for JSON
        res_regions = []
        for r in range(size):
            res_regions.append(regions[r*size : (r+1)*size])
            
        return {
            'size': size,
            'solution': [[i // size, i % size] for i in target_cells],
            'regions': res_regions,
            'score': score,
            'difficulty': diff
        }
    return None

def build_puzzles():
    total_target = 100
    puzzles = []
    
    sys.stderr.write("Pre-calculating placements...\n")
    placements_by_size = {sz: get_all_placements(sz) for sz in [7, 8, 9]}
    
    pool = multiprocessing.Pool()
    seed_base = random.randint(0, 1000000)
    
    sys.stderr.write("Starting parallel generation...\n")
    
    attempt = 0
    while len(puzzles) < total_target:
        batch_size = 200
        args = []
        for i in range(batch_size):
            sz = random.choice([7, 8, 8, 9])
            args.append((sz, placements_by_size[sz], seed_base + attempt + i))
        
        results = pool.map(generate_single_puzzle, args)
        for r in results:
            if r:
                # Basic duplicate check
                if not any(p['regions'] == r['regions'] for p in puzzles):
                    puzzles.append(r)
        
        attempt += batch_size
        sys.stderr.write(f"Generated {len(puzzles)} puzzles...\n")
        if attempt > 100000: break

    puzzles.sort(key=lambda x: x['score'])
    
    # Final cleanup and naming
    final = []
    for i, p in enumerate(puzzles[:total_target], 1):
        if i <= len(BASE_NAMES):
            p['name'] = BASE_NAMES[i-1]
            p['id'] = p['name'].lower().replace(' ', '-')
        else:
            p['name'] = f'Glitter Grid {i:03d}'
            p['id'] = f'glitter-grid-{i:03d}'
        final.append(p)
        
    return final

if __name__ == '__main__':
    print(json.dumps(build_puzzles(), indent=2))
