import { describe, expect, it } from 'vitest'
import puzzles from '../data/puzzles.json'

function isNonTouchingPermutation(columns, size) {
  for (let rowA = 0; rowA < size; rowA += 1) {
    for (let rowB = rowA + 1; rowB < size; rowB += 1) {
      if (Math.abs(rowA - rowB) <= 1 && Math.abs(columns[rowA] - columns[rowB]) <= 1) {
        return false
      }
    }
  }

  return true
}

const candidateColumnsCache = new Map()

function getCandidateColumns(size) {
  if (candidateColumnsCache.has(size)) {
    return candidateColumnsCache.get(size)
  }

  const candidates = []

  function search(row, usedColumns, current) {
    if (row === size) {
      if (isNonTouchingPermutation(current, size)) {
        candidates.push([...current])
      }
      return
    }

    for (let column = 0; column < size; column += 1) {
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
  candidateColumnsCache.set(size, candidates)
  return candidates
}

function countSolutions(size, regions, candidates) {
  let count = 0

  for (const columns of candidates) {
    const regionHits = Array.from({ length: size }, () => 0)
    let valid = true

    for (let row = 0; row < size; row += 1) {
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

function regionSizes(size, regions) {
  const counts = Array.from({ length: size }, () => 0)

  for (const row of regions) {
    for (const regionId of row) {
      counts[regionId] += 1
    }
  }

  return counts
}

describe('bundled puzzles', () => {
  it('have exactly one valid solution each', () => {
    for (const puzzle of puzzles) {
      const candidates = getCandidateColumns(puzzle.size)
      expect(countSolutions(puzzle.size, puzzle.regions, candidates), puzzle.id).toBe(1)
    }
  })

  it('include at least one puzzle with a 1-cell group', () => {
    const hasSingleton = puzzles.some((puzzle) => regionSizes(puzzle.size, puzzle.regions).includes(1))
    expect(hasSingleton).toBe(true)
  })

  it('include at least one puzzle without a 1-cell group', () => {
    const hasNonSingletonOnly = puzzles.some((puzzle) => !regionSizes(puzzle.size, puzzle.regions).includes(1))
    expect(hasNonSingletonOnly).toBe(true)
  })
})
