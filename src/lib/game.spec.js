import { describe, expect, it } from 'vitest'
import puzzles from '../data/puzzles.json'
import {
  CELL_BLOCKED,
  CELL_EMPTY,
  CELL_STAR,
  canPlaceStar,
  createGameState,
  getGrid,
  isSolved,
  placeStar,
  removeStar,
  toggleBlocked,
} from './game'

const puzzle = puzzles[0]

describe('game logic', () => {
  it('creates an empty board', () => {
    const state = createGameState(puzzle)
    const grid = getGrid(state, puzzle)

    expect(grid).toHaveLength(puzzle.size)
    expect(grid[0][0]).toBe(CELL_EMPTY)
  })

  it('applies derived blocks after a star is placed', () => {
    const state = placeStar(createGameState(puzzle), puzzle, 0, 0)
    const grid = getGrid(state, puzzle)

    expect(grid[0][0]).toBe(CELL_STAR)
    expect(grid[0][1]).toBe(CELL_BLOCKED)
    expect(grid[1][0]).toBe(CELL_BLOCKED)
    expect(grid[1][1]).toBe(CELL_BLOCKED)
  })

  it('prevents illegal star placements', () => {
    const state = placeStar(createGameState(puzzle), puzzle, 0, 0)

    // Star in the same row/column/region should be blocked
    expect(canPlaceStar(state, puzzle, 0, 3)).toBe(false)
    expect(canPlaceStar(state, puzzle, 1, 1)).toBe(false)
  })

  it('toggles manual blocked marks', () => {
    let state = createGameState(puzzle)
    const r = puzzle.size - 1
    const c = puzzle.size - 2

    state = toggleBlocked(state, r, c)
    expect(getGrid(state, puzzle)[r][c]).toBe(CELL_BLOCKED)

    state = toggleBlocked(state, r, c)
    expect(getGrid(state, puzzle)[r][c]).toBe(CELL_EMPTY)
  })

  it('removes stars cleanly', () => {
    let state = createGameState(puzzle)
    state = placeStar(state, puzzle, 0, 0)
    expect(state.stars).toContain("0:0")
    
    // Find a valid spot for a second star (MUST NOT BE 0,0)
    let r2 = -1, c2 = -1;
    for (let r = 0; r < puzzle.size; r++) {
        for (let c = 0; c < puzzle.size; c++) {
            if (r === 0 && c === 0) continue;
            if (canPlaceStar(state, puzzle, r, c)) {
                r2 = r; c2 = c; break;
            }
        }
        if (r2 !== -1) break;
    }

    expect(r2).not.toBe(-1)

    state = placeStar(state, puzzle, r2, c2)
    expect(state.stars).toContain(`${r2}:${c2}`)
    expect(state.stars).toContain("0:0")
    
    state = removeStar(state, r2, c2)
    expect(state.stars).not.toContain(`${r2}:${c2}`)
    expect(state.stars).toContain("0:0")

    const grid = getGrid(state, puzzle)
    expect(grid[r2][c2]).toBe(CELL_EMPTY)
    // Row 0 should still be blocked by star at (0,0)
    expect(grid[0][1]).toBe(CELL_BLOCKED)
  })

  it('detects a solved board using the bundled solution', () => {
    let state = createGameState(puzzle)

    for (const [row, col] of puzzle.solution) {
      state = placeStar(state, puzzle, row, col)
    }

    expect(isSolved(state, puzzle)).toBe(true)
  })
})
