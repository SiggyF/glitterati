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

    expect(grid).toHaveLength(6)
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

    expect(canPlaceStar(state, puzzle, 0, 3)).toBe(false)
    expect(canPlaceStar(state, puzzle, 1, 1)).toBe(false)
    expect(canPlaceStar(state, puzzle, 2, 4)).toBe(true)
  })

  it('toggles manual blocked marks', () => {
    let state = createGameState(puzzle)

    state = toggleBlocked(state, 5, 4)
    expect(getGrid(state, puzzle)[5][4]).toBe(CELL_BLOCKED)

    state = toggleBlocked(state, 5, 4)
    expect(getGrid(state, puzzle)[5][4]).toBe(CELL_EMPTY)
  })

  it('removes stars cleanly', () => {
    let state = createGameState(puzzle)
    state = placeStar(state, puzzle, 0, 0)
    state = placeStar(state, puzzle, 2, 4)
    state = removeStar(state, 2, 4)

    const grid = getGrid(state, puzzle)
    expect(grid[2][4]).toBe(CELL_EMPTY)
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
