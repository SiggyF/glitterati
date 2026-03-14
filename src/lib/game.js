export const CELL_EMPTY = 'empty'
export const CELL_BLOCKED = 'blocked'
export const CELL_STAR = 'star'

export function toKey(row, col) {
  return `${row}:${col}`
}

export function fromKey(key) {
  const [row, col] = key.split(':').map(Number)
  return { row, col }
}

export function createGameState(puzzle) {
  return {
    puzzleId: puzzle.id,
    stars: [],
    manualBlocks: [],
  }
}

function toSet(keys) {
  return new Set(keys)
}

function sortKeys(keys) {
  return [...keys].sort((left, right) => {
    const leftParts = left.split(':').map(Number)
    const rightParts = right.split(':').map(Number)
    return leftParts[0] - rightParts[0] || leftParts[1] - rightParts[1]
  })
}

function countStarsInRow(starSet, row, size) {
  let count = 0
  for (let col = 0; col < size; col += 1) {
    if (starSet.has(toKey(row, col))) {
      count += 1
    }
  }
  return count
}

function countStarsInColumn(starSet, col, size) {
  let count = 0
  for (let row = 0; row < size; row += 1) {
    if (starSet.has(toKey(row, col))) {
      count += 1
    }
  }
  return count
}

function countStarsInRegion(starSet, puzzle, regionId) {
  let count = 0
  for (let row = 0; row < puzzle.size; row += 1) {
    for (let col = 0; col < puzzle.size; col += 1) {
      if (puzzle.regions[row][col] === regionId && starSet.has(toKey(row, col))) {
        count += 1
      }
    }
  }
  return count
}

export function getAdjacentCoordinates(size, row, col) {
  const adjacent = []

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let colOffset = -1; colOffset <= 1; colOffset += 1) {
      if (rowOffset === 0 && colOffset === 0) {
        continue
      }

      const nextRow = row + rowOffset
      const nextCol = col + colOffset

      if (nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size) {
        adjacent.push({ row: nextRow, col: nextCol })
      }
    }
  }

  return adjacent
}

export function getDerivedBlockedKeys(state, puzzle) {
  const derived = new Set()
  const starSet = toSet(state.stars)

  for (const key of starSet) {
    const { row, col } = fromKey(key)

    for (let index = 0; index < puzzle.size; index += 1) {
      if (index !== col) {
        derived.add(toKey(row, index))
      }
      if (index !== row) {
        derived.add(toKey(index, col))
      }
    }

    const regionId = puzzle.regions[row][col]
    for (let nextRow = 0; nextRow < puzzle.size; nextRow += 1) {
      for (let nextCol = 0; nextCol < puzzle.size; nextCol += 1) {
        if ((nextRow !== row || nextCol !== col) && puzzle.regions[nextRow][nextCol] === regionId) {
          derived.add(toKey(nextRow, nextCol))
        }
      }
    }

    for (const adjacent of getAdjacentCoordinates(puzzle.size, row, col)) {
      derived.add(toKey(adjacent.row, adjacent.col))
    }
  }

  for (const key of starSet) {
    derived.delete(key)
  }

  return derived
}

export function getGrid(state, puzzle) {
  const starSet = toSet(state.stars)
  const manualBlockSet = toSet(state.manualBlocks)
  const derivedSet = getDerivedBlockedKeys(state, puzzle)

  return Array.from({ length: puzzle.size }, (_, row) =>
    Array.from({ length: puzzle.size }, (_, col) => {
      const key = toKey(row, col)
      if (starSet.has(key)) {
        return CELL_STAR
      }
      if (manualBlockSet.has(key) || derivedSet.has(key)) {
        return CELL_BLOCKED
      }
      return CELL_EMPTY
    }),
  )
}

export function canPlaceStar(state, puzzle, row, col) {
  const key = toKey(row, col)
  const starSet = toSet(state.stars)

  if (starSet.has(key)) {
    return true
  }

  if (countStarsInRow(starSet, row, puzzle.size) >= 1) {
    return false
  }

  if (countStarsInColumn(starSet, col, puzzle.size) >= 1) {
    return false
  }

  if (countStarsInRegion(starSet, puzzle, puzzle.regions[row][col]) >= 1) {
    return false
  }

  for (const adjacent of getAdjacentCoordinates(puzzle.size, row, col)) {
    if (starSet.has(toKey(adjacent.row, adjacent.col))) {
      return false
    }
  }

  return true
}

export function toggleBlocked(state, row, col) {
  const key = toKey(row, col)
  const starSet = toSet(state.stars)
  const manualBlocks = toSet(state.manualBlocks)

  if (starSet.has(key)) {
    return state
  }

  if (manualBlocks.has(key)) {
    manualBlocks.delete(key)
  } else {
    manualBlocks.add(key)
  }

  return {
    ...state,
    manualBlocks: sortKeys(manualBlocks),
  }
}

export function placeStar(state, puzzle, row, col) {
  if (!canPlaceStar(state, puzzle, row, col)) {
    return state
  }

  const key = toKey(row, col)
  const stars = toSet(state.stars)
  const manualBlocks = toSet(state.manualBlocks)

  stars.add(key)
  manualBlocks.delete(key)

  return {
    ...state,
    stars: sortKeys(stars),
    manualBlocks: sortKeys(manualBlocks),
  }
}

export function removeStar(state, row, col) {
  const key = toKey(row, col)
  const stars = toSet(state.stars)

  if (!stars.has(key)) {
    return state
  }

  stars.delete(key)

  return {
    ...state,
    stars: sortKeys(stars),
  }
}

export function getViolations(state, puzzle) {
  const starSet = toSet(state.stars)
  const violations = {
    rows: new Set(),
    columns: new Set(),
    regions: new Set(),
    touching: new Set(),
  }

  for (let row = 0; row < puzzle.size; row += 1) {
    if (countStarsInRow(starSet, row, puzzle.size) > 1) {
      violations.rows.add(row)
    }
  }

  for (let col = 0; col < puzzle.size; col += 1) {
    if (countStarsInColumn(starSet, col, puzzle.size) > 1) {
      violations.columns.add(col)
    }
  }

  for (let regionId = 0; regionId < puzzle.size; regionId += 1) {
    if (countStarsInRegion(starSet, puzzle, regionId) > 1) {
      violations.regions.add(regionId)
    }
  }

  for (const key of starSet) {
    const { row, col } = fromKey(key)
    for (const adjacent of getAdjacentCoordinates(puzzle.size, row, col)) {
      if (starSet.has(toKey(adjacent.row, adjacent.col))) {
        violations.touching.add(key)
        violations.touching.add(toKey(adjacent.row, adjacent.col))
      }
    }
  }

  return violations
}

export function isSolved(state, puzzle) {
  const starSet = toSet(state.stars)

  if (starSet.size !== puzzle.size) {
    return false
  }

  for (let row = 0; row < puzzle.size; row += 1) {
    if (countStarsInRow(starSet, row, puzzle.size) !== 1) {
      return false
    }
  }

  for (let col = 0; col < puzzle.size; col += 1) {
    if (countStarsInColumn(starSet, col, puzzle.size) !== 1) {
      return false
    }
  }

  for (let regionId = 0; regionId < puzzle.size; regionId += 1) {
    if (countStarsInRegion(starSet, puzzle, regionId) !== 1) {
      return false
    }
  }

  return getViolations(state, puzzle).touching.size === 0
}
