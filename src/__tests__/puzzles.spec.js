import { describe, expect, it } from 'vitest'
import puzzles from '../data/puzzles.json'

const SIZE = 6

function isNonTouchingPermutation(columns) {
  for (let rowA = 0; rowA < SIZE; rowA += 1) {
    for (let rowB = rowA + 1; rowB < SIZE; rowB += 1) {
      if (Math.abs(rowA - rowB) <= 1 && Math.abs(columns[rowA] - columns[rowB]) <= 1) {
        return false
      }
    }
  }

  return true
}

function buildCandidateColumns() {
  const candidates = []

  function search(row, usedColumns, current) {
    if (row === SIZE) {
      if (isNonTouchingPermutation(current)) {
        candidates.push([...current])
      }
      return
    }

    for (let column = 0; column < SIZE; column += 1) {
      if (usedColumns.has(column)) {
        continue
      }
      usedColumns.add(column)
      current.push(column)
      search(row + 1, usedColumns, current)
      current.pop()
      usedColumns.delete(column)
    }
  }

  search(0, new Set(), [])
  return candidates
}

function countSolutions(regions, candidates) {
  let count = 0

  for (const columns of candidates) {
    const regionHits = Array.from({ length: SIZE }, () => 0)
    let valid = true

    for (let row = 0; row < SIZE; row += 1) {
      const regionId = regions[row][columns[row]]
      regionHits[regionId] += 1
      if (regionHits[regionId] > 1) {
        valid = false
        break
      }
    }

    if (valid && regionHits.every((hits) => hits === 1)) {
      count += 1
      if (count > 1) {
        break
      }
    }
  }

  return count
}

function regionSizes(regions) {
  const counts = Array.from({ length: SIZE }, () => 0)

  for (const row of regions) {
    for (const regionId of row) {
      counts[regionId] += 1
    }
  }

  return counts
}

describe('bundled puzzles', () => {
  const candidateColumns = buildCandidateColumns()

  it('have exactly one valid solution each', () => {
    for (const puzzle of puzzles) {
      expect(countSolutions(puzzle.regions, candidateColumns), puzzle.id).toBe(1)
    }
  })

  it('always include 2-cell and 3-cell groups', () => {
    for (const puzzle of puzzles) {
      const sizes = regionSizes(puzzle.regions)
      expect(sizes.includes(2), puzzle.id).toBe(true)
      expect(sizes.includes(3), puzzle.id).toBe(true)
    }
  })

  it('include at least one puzzle with a 1-cell group', () => {
    const hasSingleton = puzzles.some((puzzle) => regionSizes(puzzle.regions).includes(1))
    expect(hasSingleton).toBe(true)
  })

  it('include at least one puzzle without a 1-cell group', () => {
    const hasNonSingletonOnly = puzzles.some((puzzle) => !regionSizes(puzzle.regions).includes(1))
    expect(hasNonSingletonOnly).toBe(true)
  })
})
