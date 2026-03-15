<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import puzzles from './data/puzzles.json'
import {
  CELL_BLOCKED,
  CELL_EMPTY,
  CELL_STAR,
  canPlaceStar,
  createGameState,
  getDerivedBlockedKeys,
  getGrid,
  getViolations,
  isSolved,
  placeStar,
  removeStar,
  toKey,
  toggleBlocked,
} from './lib/game'

const regionPalette = ['#1d4ed8', '#0891b2', '#7c3aed', '#059669', '#ea580c', '#db2777']
const pressDelay = 230
const inconsistencyDelayMs = 7000
const puzzlesPerPage = 12
const difficultyRank = {
  Easy: 1,
  Medium: 2,
  Hard: 3,
  Expert: 4,
}
const activePuzzleIndex = ref(0)
const currentPuzzlePage = ref(1)
const gameState = ref(createGameState(puzzles[activePuzzleIndex.value]))
const pendingPresses = new Map()
const showInconsistencyPanel = ref(false)
const showInfoPanel = ref(false)
const dragState = ref({
  active: false,
  hasDragged: false,
  mode: null,
  startKey: null,
  lastProcessedKey: null,
})
let inconsistencyTimerId = null
let suppressNextClick = false
let suppressResetTimerId = null

function getLegalStarCells(state, puzzle) {
  const legal = []

  for (let row = 0; row < puzzle.size; row += 1) {
    for (let col = 0; col < puzzle.size; col += 1) {
      if (canPlaceStar(state, puzzle, row, col)) {
        legal.push({ row, col })
      }
    }
  }

  return legal
}

function getOnePathAssessment(puzzle) {
  let state = createGameState(puzzle)
  let forcedSteps = 0

  while (!isSolved(state, puzzle)) {
    const legalMoves = getLegalStarCells(state, puzzle)

    if (legalMoves.length !== 1) {
      return {
        isSuperEasy: false,
        forcedSteps,
      }
    }

    const { row, col } = legalMoves[0]
    state = placeStar(state, puzzle, row, col)
    forcedSteps += 1
  }

  return {
    isSuperEasy: true,
    forcedSteps,
  }
}

const puzzleOrder = computed(() =>
  puzzles
    .map((puzzle, index) => ({
      puzzle,
      index,
      onePath: getOnePathAssessment(puzzle),
    }))
    .sort((left, right) => {
      if (left.onePath.isSuperEasy !== right.onePath.isSuperEasy) {
        return left.onePath.isSuperEasy ? -1 : 1
      }

      const leftDifficulty = difficultyRank[left.puzzle.difficulty] ?? 99
      const rightDifficulty = difficultyRank[right.puzzle.difficulty] ?? 99
      if (leftDifficulty !== rightDifficulty) {
        return leftDifficulty - rightDifficulty
      }

      return left.puzzle.name.localeCompare(right.puzzle.name)
    }),
)

const totalPuzzlePages = computed(() => Math.max(1, Math.ceil(puzzleOrder.value.length / puzzlesPerPage)))

const paginatedPuzzleOrder = computed(() => {
  const start = (currentPuzzlePage.value - 1) * puzzlesPerPage
  return puzzleOrder.value.slice(start, start + puzzlesPerPage)
})

const currentPuzzle = computed(() => puzzles[activePuzzleIndex.value])
const grid = computed(() => getGrid(gameState.value, currentPuzzle.value))
const derivedBlocks = computed(() => getDerivedBlockedKeys(gameState.value, currentPuzzle.value))
const violations = computed(() => getViolations(gameState.value, currentPuzzle.value))
const solved = computed(() => isSolved(gameState.value, currentPuzzle.value))
const starsPlaced = computed(() => gameState.value.stars.length)
const remainingStars = computed(() => currentPuzzle.value.size - starsPlaced.value)

const starConflictKeys = computed(() => {
  const conflicted = new Set(violations.value.touching)

  for (const key of gameState.value.stars) {
    const [row, col] = key.split(':').map(Number)
    const regionId = currentPuzzle.value.regions[row][col]

    if (
      violations.value.rows.has(row) ||
      violations.value.columns.has(col) ||
      violations.value.regions.has(regionId)
    ) {
      conflicted.add(key)
    }
  }

  return conflicted
})

const fullRowsWithoutStar = computed(() => {
  const starSet = new Set(gameState.value.stars)
  const rows = []

  for (let row = 0; row < currentPuzzle.value.size; row += 1) {
    let hasStar = false
    let isFull = true

    for (let col = 0; col < currentPuzzle.value.size; col += 1) {
      const key = toKey(row, col)
      if (starSet.has(key)) {
        hasStar = true
        break
      }
      if (grid.value[row][col] === CELL_EMPTY) {
        isFull = false
      }
    }

    if (!hasStar && isFull) {
      rows.push(row)
    }
  }

  return rows
})

const fullColumnsWithoutStar = computed(() => {
  const starSet = new Set(gameState.value.stars)
  const columns = []

  for (let col = 0; col < currentPuzzle.value.size; col += 1) {
    let hasStar = false
    let isFull = true

    for (let row = 0; row < currentPuzzle.value.size; row += 1) {
      const key = toKey(row, col)
      if (starSet.has(key)) {
        hasStar = true
        break
      }
      if (grid.value[row][col] === CELL_EMPTY) {
        isFull = false
      }
    }

    if (!hasStar && isFull) {
      columns.push(col)
    }
  }

  return columns
})

const fullRegionsWithoutStar = computed(() => {
  const starSet = new Set(gameState.value.stars)
  const regions = []

  for (let regionId = 0; regionId < currentPuzzle.value.size; regionId += 1) {
    let hasStar = false
    let hasOpening = false

    for (let row = 0; row < currentPuzzle.value.size; row += 1) {
      for (let col = 0; col < currentPuzzle.value.size; col += 1) {
        if (currentPuzzle.value.regions[row][col] !== regionId) {
          continue
        }

        const key = toKey(row, col)
        if (starSet.has(key)) {
          hasStar = true
          break
        }

        if (grid.value[row][col] === CELL_EMPTY) {
          hasOpening = true
        }
      }

      if (hasStar) {
        break
      }
    }

    if (!hasStar && !hasOpening) {
      regions.push(regionId)
    }
  }

  return regions
})

const hasInconsistencies = computed(() =>
  starConflictKeys.value.size > 0 ||
  fullRowsWithoutStar.value.length > 0 ||
  fullColumnsWithoutStar.value.length > 0 ||
  fullRegionsWithoutStar.value.length > 0,
)

const fullRowLabels = computed(() => fullRowsWithoutStar.value.map((row) => row + 1).join(', '))
const fullColumnLabels = computed(() => fullColumnsWithoutStar.value.map((col) => col + 1).join(', '))
const fullRegionLabels = computed(() => fullRegionsWithoutStar.value.map((regionId) => regionId + 1).join(', '))
const shouldShowInconsistencies = computed(() => showInconsistencyPanel.value && hasInconsistencies.value && !solved.value)

const inconsistencyFingerprint = computed(() => {
  if (!hasInconsistencies.value || solved.value) {
    return ''
  }

  return JSON.stringify({
    stars: [...starConflictKeys.value].sort(),
    rows: [...fullRowsWithoutStar.value],
    columns: [...fullColumnsWithoutStar.value],
    regions: [...fullRegionsWithoutStar.value],
  })
})

watch(
  inconsistencyFingerprint,
  (nextFingerprint) => {
    if (!nextFingerprint) {
      if (inconsistencyTimerId !== null) {
        window.clearTimeout(inconsistencyTimerId)
        inconsistencyTimerId = null
      }
      showInconsistencyPanel.value = false
      return
    }

    if (inconsistencyTimerId !== null) {
      window.clearTimeout(inconsistencyTimerId)
      inconsistencyTimerId = null
    }

    showInconsistencyPanel.value = false

    inconsistencyTimerId = window.setTimeout(() => {
      showInconsistencyPanel.value = true
      inconsistencyTimerId = null
    }, inconsistencyDelayMs)
  },
  { immediate: true },
)

watch(solved, (nextSolved) => {
  if (!nextSolved) {
    return
  }

  if (inconsistencyTimerId !== null) {
    window.clearTimeout(inconsistencyTimerId)
    inconsistencyTimerId = null
  }
  showInconsistencyPanel.value = false
})

onBeforeUnmount(() => {
  if (inconsistencyTimerId !== null) {
    window.clearTimeout(inconsistencyTimerId)
    inconsistencyTimerId = null
  }

  if (suppressResetTimerId !== null) {
    window.clearTimeout(suppressResetTimerId)
    suppressResetTimerId = null
  }
})

const boardMetrics = computed(() => {
  const cellSize = 88
  const boardSize = cellSize * currentPuzzle.value.size
  return { cellSize, boardSize }
})

const regionEdges = computed(() =>
  currentPuzzle.value.regions.map((row, rowIndex) =>
    row.map((regionId, colIndex) => ({
      top: rowIndex === 0 || currentPuzzle.value.regions[rowIndex - 1][colIndex] !== regionId,
      right:
        colIndex === currentPuzzle.value.size - 1 ||
        currentPuzzle.value.regions[rowIndex][colIndex + 1] !== regionId,
      bottom:
        rowIndex === currentPuzzle.value.size - 1 ||
        currentPuzzle.value.regions[rowIndex + 1][colIndex] !== regionId,
      left: colIndex === 0 || currentPuzzle.value.regions[rowIndex][colIndex - 1] !== regionId,
    })),
  ),
)

const statusText = computed(() => {
  if (solved.value) {
    return 'Solved! Every row, column, and region now contains exactly one star.'
  }

  if (remainingStars.value === 0) {
    return 'All stars are placed. Double-check the rows, columns, and colored regions.'
  }

  return `Place ${remainingStars.value} more ${remainingStars.value === 1 ? 'star' : 'stars'}. Single tap moves empty -> X -> star -> empty, and double tap fast-tracks to star or empty.`
})

function switchPuzzle(index) {
  pendingPresses.forEach((timerId) => window.clearTimeout(timerId))
  pendingPresses.clear()
  dragState.value = {
    active: false,
    hasDragged: false,
    mode: null,
    startKey: null,
  }
  suppressNextClick = false
  activePuzzleIndex.value = index
  syncPuzzlePageForIndex(index)
  gameState.value = createGameState(puzzles[index])
}

function resetPuzzle() {
  pendingPresses.forEach((timerId) => window.clearTimeout(timerId))
  pendingPresses.clear()
  dragState.value = {
    active: false,
    hasDragged: false,
    mode: null,
    startKey: null,
  }
  suppressNextClick = false
  gameState.value = createGameState(currentPuzzle.value)
}

function nextPuzzle() {
  switchPuzzle((activePuzzleIndex.value + 1) % puzzles.length)
}

function randomPuzzle() {
  if (puzzles.length <= 1) {
    return
  }

  let nextIndex = activePuzzleIndex.value
  while (nextIndex === activePuzzleIndex.value) {
    nextIndex = Math.floor(Math.random() * puzzles.length)
  }
  switchPuzzle(nextIndex)
}

function previousPuzzlePage() {
  if (currentPuzzlePage.value <= 1) {
    return
  }
  currentPuzzlePage.value -= 1
}

function nextPuzzlePage() {
  if (currentPuzzlePage.value >= totalPuzzlePages.value) {
    return
  }
  currentPuzzlePage.value += 1
}

function syncPuzzlePageForIndex(index) {
  const sortedPosition = puzzleOrder.value.findIndex((entry) => entry.index === index)
  if (sortedPosition < 0) {
    return
  }

  currentPuzzlePage.value = Math.floor(sortedPosition / puzzlesPerPage) + 1
}

watch(
  totalPuzzlePages,
  (pageCount) => {
    if (currentPuzzlePage.value > pageCount) {
      currentPuzzlePage.value = pageCount
    }
  },
  { immediate: true },
)

watch(
  puzzleOrder,
  () => {
    syncPuzzlePageForIndex(activePuzzleIndex.value)
  },
  { immediate: true },
)

function sortBoardKeys(keys) {
  return [...keys].sort((left, right) => {
    const [leftRow, leftCol] = left.split(':').map(Number)
    const [rightRow, rightCol] = right.split(':').map(Number)
    return leftRow - rightRow || leftCol - rightCol
  })
}

function setManualBlocked(row, col, shouldBeBlocked) {
  const key = toKey(row, col)
  if (gameState.value.stars.includes(key)) {
    return
  }

  const manualBlocks = new Set(gameState.value.manualBlocks)
  const hasBlock = manualBlocks.has(key)

  if (shouldBeBlocked && !hasBlock) {
    manualBlocks.add(key)
  }

  if (!shouldBeBlocked && hasBlock) {
    manualBlocks.delete(key)
  }

  gameState.value = {
    ...gameState.value,
    manualBlocks: sortBoardKeys(manualBlocks),
  }
}

function endDragInteraction() {
  if (dragState.value.hasDragged) {
    suppressNextClick = true
    if (suppressResetTimerId !== null) {
      window.clearTimeout(suppressResetTimerId)
    }
    suppressResetTimerId = window.setTimeout(() => {
      suppressNextClick = false
      suppressResetTimerId = null
    }, 350)
  }

  dragState.value = {
    active: false,
    hasDragged: false,
    mode: null,
    startKey: null,
    lastProcessedKey: null,
  }
}

function handleCellPointerDown(row, col, event) {
  if (solved.value || event.button !== 0) {
    return
  }

  if (suppressNextClick) {
    suppressNextClick = false
  }
  if (suppressResetTimerId !== null) {
    window.clearTimeout(suppressResetTimerId)
    suppressResetTimerId = null
  }

  const key = toKey(row, col)
  const isStar = gameState.value.stars.includes(key)

  if (isStar) {
    dragState.value = {
      active: false,
      hasDragged: false,
      mode: null,
      startKey: null,
      lastProcessedKey: null,
    }
    return
  }

  const hasManualBlock = gameState.value.manualBlocks.includes(key)
  const mode = hasManualBlock ? 'unblock' : 'block'
  dragState.value = {
    active: true,
    hasDragged: false,
    mode,
    startKey: key,
    lastProcessedKey: key,
  }
}

function handleCellPointerEnter(row, col, event) {
  // Mouse events: only drag if primary button is held
  if (event.pointerType === 'mouse' && event.buttons === 1) {
    processCellDrag(row, col)
  }
}

function processCellDrag(row, col) {
  if (!dragState.value.active || !dragState.value.mode) {
    return
  }

  const key = toKey(row, col)
  // Don't re-process the same cell unless we've moved to a new one
  if (dragState.value.lastProcessedKey === key) {
    return
  }

  if (!dragState.value.hasDragged && dragState.value.startKey) {
    const [startRow, startCol] = dragState.value.startKey.split(':').map(Number)
    setManualBlocked(startRow, startCol, dragState.value.mode === 'block')
  }

  if (dragState.value.mode === 'block') {
    setManualBlocked(row, col, true)
  } else {
    setManualBlocked(row, col, false)
  }

  dragState.value = {
    ...dragState.value,
    hasDragged: true,
    lastProcessedKey: key
  }
}

function handlePointerMove(event) {
  if (!dragState.value.active || event.pointerType !== 'touch') {
    return
  }

  // Find the cell under the pointer for touch devices
  const svg = event.currentTarget
  const point = new DOMPoint(event.clientX, event.clientY)
  const svgPoint = point.matrixTransform(svg.getScreenCTM().inverse())
  
  const col = Math.floor(svgPoint.x / boardMetrics.value.cellSize)
  const row = Math.floor(svgPoint.y / boardMetrics.value.cellSize)
  
  if (row >= 0 && row < currentPuzzle.value.size && col >= 0 && col < currentPuzzle.value.size) {
    processCellDrag(row, col)
  }
}

function handleCellPress(row, col) {
  if (suppressNextClick) {
    suppressNextClick = false
    return
  }

  if (solved.value) {
    return
  }

  const cellStateAtPress = grid.value[row][col]
  const key = toKey(row, col)
  const pending = pendingPresses.get(key)

  if (pending) {
    window.clearTimeout(pending)
    pendingPresses.delete(key)
    handleDoubleAction(row, col)
    return
  }

  const timerId = window.setTimeout(() => {
    if (cellStateAtPress === CELL_STAR) {
      gameState.value = removeStar(gameState.value, row, col)
    } else if (cellStateAtPress === CELL_BLOCKED) {
      gameState.value = placeStar(gameState.value, currentPuzzle.value, row, col)
    } else {
      gameState.value = toggleBlocked(gameState.value, row, col)
    }
    pendingPresses.delete(key)
  }, pressDelay)

  pendingPresses.set(key, timerId)
}

function handleDoubleAction(row, col) {
  if (grid.value[row][col] === CELL_STAR) {
    gameState.value = removeStar(gameState.value, row, col)
    return
  }

  gameState.value = placeStar(gameState.value, currentPuzzle.value, row, col)
}

function cellFill(regionId) {
  return `${regionPalette[regionId % regionPalette.length]}33`
}

function borderStroke(regionId) {
  return regionPalette[regionId % regionPalette.length]
}

function canAddStar(row, col) {
  return canPlaceStar(gameState.value, currentPuzzle.value, row, col)
}
</script>

<template>
  <main class="min-h-screen bg-slate-950 text-slate-50">
    <div class="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:px-8">
      <header class="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <section class="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur">
          <p class="text-sm font-semibold uppercase tracking-[0.35em] text-sky-300">Glitterati</p>
          <h1 class="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
            A web-first star-placement logic puzzle
          </h1>
          <p class="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            Fill the board with one star in every row, column, and region. Stars can never touch — even diagonally — so each one creates a buffer zone of blocked cells around it.
          </p>
        </section>

        <section class="rounded-3xl border border-slate-800 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-sm font-semibold uppercase tracking-[0.3em] text-sky-200">Current puzzle</p>
              <h2 class="mt-3 text-2xl font-bold text-white">{{ currentPuzzle.name }}</h2>
            </div>
            <button
              type="button"
              class="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sky-300 hover:bg-slate-700 lg:hidden"
              aria-label="Toggle instructions"
              @click="showInfoPanel = !showInfoPanel"
            >
              <span class="text-xl font-bold">i</span>
            </button>
          </div>
          <div class="mt-3 flex flex-wrap gap-3 text-sm text-slate-200">
            <span class="flex flex-col gap-0.5">
              <span class="rounded-full bg-white/10 px-3 py-1">{{ currentPuzzle.difficulty }}</span>
              <span class="px-1 text-[10px] uppercase tracking-widest text-slate-400">Score: {{ currentPuzzle.score }}</span>
            </span>
            <span class="rounded-full bg-white/10 px-3 py-1">{{ starsPlaced }} / {{ currentPuzzle.size }} stars</span>
          </div>
          <p class="mt-4 text-sm leading-6 text-slate-200">
            {{ statusText }}
          </p>
          <div
            v-if="shouldShowInconsistencies"
            class="mt-4 rounded-2xl border border-rose-300/70 bg-rose-500/15 px-4 py-3 text-sm text-rose-100"
            role="status"
            aria-live="polite"
          >
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-rose-100/90">Inconsistencies</p>
            <p v-if="starConflictKeys.size > 0" class="mt-2">Conflicting stars: {{ starConflictKeys.size }}</p>
            <p v-if="fullRowsWithoutStar.length > 0" class="mt-1">Full rows without a star: {{ fullRowLabels }}</p>
            <p v-if="fullColumnsWithoutStar.length > 0" class="mt-1">Full columns without a star: {{ fullColumnLabels }}</p>
            <p v-if="fullRegionsWithoutStar.length > 0" class="mt-1">Full colors without an opening: {{ fullRegionLabels }}</p>
          </div>
        </section>
      </header>

      <div class="flex flex-col-reverse gap-5 lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside class="space-y-6" :class="{ 'hidden lg:block': !showInfoPanel }">
          <section class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/30">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-lg font-bold text-white">Bundled puzzles</h2>
              <span class="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                {{ puzzles.length }} boards
              </span>
            </div>
            <!-- ... puzzle list buttons ... -->
            <div class="mt-4 grid gap-2">
              <button
                v-for="entry in paginatedPuzzleOrder"
                :key="entry.puzzle.id"
                type="button"
                class="flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition"
                :class="entry.index === activePuzzleIndex
                  ? 'border-sky-400 bg-sky-400/15 text-white'
                  : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:text-white'"
                @click="switchPuzzle(entry.index)"
              >
                <div class="flex flex-col gap-0.5">
                  <span class="font-semibold">{{ entry.puzzle.name }}</span>
                  <span class="text-[9px] font-bold uppercase tracking-widest text-slate-500">Score: {{ entry.puzzle.score }}</span>
                </div>
                <span class="flex items-center gap-2 text-xs uppercase tracking-[0.2em]">
                  <span
                    v-if="entry.onePath.isSuperEasy"
                    class="rounded-full border border-emerald-300/70 bg-emerald-400/20 px-2 py-0.5 font-semibold tracking-[0.1em] text-emerald-200"
                  >
                    Super easy
                  </span>
                  <span class="text-slate-400">{{ entry.puzzle.difficulty }}</span>
                </span>
              </button>
            </div>
            <div class="mt-4 flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-2">
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200 transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-white/10"
                :disabled="currentPuzzlePage === 1"
                @click="previousPuzzlePage"
              >
                Prev page
              </button>
              <span class="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                Page {{ currentPuzzlePage }} / {{ totalPuzzlePages }}
              </span>
              <button
                type="button"
                class="rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-200 transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-white/10"
                :disabled="currentPuzzlePage === totalPuzzlePages"
                @click="nextPuzzlePage"
              >
                Next page
              </button>
            </div>
          </section>

          <section class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/30">
            <h2 class="text-lg font-bold text-white">How to play</h2>
            <ul class="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              <li><span class="font-semibold text-white">Single tap</span> moves <span class="font-semibold text-white">empty -&gt; X -&gt; star -&gt; empty</span>.</li>
              <li><span class="font-semibold text-white">Double tap</span> places a <span class="font-semibold text-amber-200">star</span> unless one is already there, then clears it.</li>
              <li>Placing a star auto-fills the rest of its row, column, region, and adjacent cells.</li>
            </ul>
            <div class="mt-5 flex flex-wrap gap-3">
              <button type="button" class="rounded-full bg-sky-400 px-4 py-2 font-semibold text-slate-950 hover:bg-sky-300" @click="resetPuzzle">
                Reset puzzle
              </button>
              <button type="button" class="rounded-full bg-emerald-300 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-200" @click="randomPuzzle">
                Random puzzle
              </button>
              <button type="button" class="rounded-full bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/20" @click="nextPuzzle">
                Next puzzle
              </button>
            </div>
          </section>

          <section class="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-slate-950/30">
            <h2 class="text-lg font-bold text-white">Rules</h2>
            <ul class="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              <li>Exactly one star must appear in every row.</li>
              <li>Exactly one star must appear in every column.</li>
              <li>Exactly one star must appear in every colored region.</li>
              <li>Stars may not touch horizontally, vertically, or diagonally.</li>
            </ul>
          </section>
        </aside>

        <section class="flex flex-1 flex-col items-center justify-start rounded-[2rem] border border-slate-800 bg-slate-900/70 p-3 shadow-2xl shadow-slate-950/40 min-h-0">
          <div class="relative flex aspect-square w-full max-w-[min(calc(100vh-350px),560px)] items-center justify-center overflow-hidden rounded-[1.5rem] border border-slate-800 bg-slate-950/70 p-2">
            <svg
              class="h-full w-full touch-none select-none"
              :viewBox="`0 0 ${boardMetrics.boardSize} ${boardMetrics.boardSize}`"
              role="img"
              :aria-label="`${currentPuzzle.name} puzzle board`"
              @pointermove="handlePointerMove"
              @pointerup="endDragInteraction"
              @pointerleave="endDragInteraction"
              @pointercancel="endDragInteraction"
            >
              <g class="pointer-events-none">
                <!-- Subtle grid overlay -->
                <line
                  v-for="i in currentPuzzle.size + 1"
                  :key="`v-grid-${i}`"
                  :x1="(i - 1) * boardMetrics.cellSize"
                  :y1="0"
                  :x2="(i - 1) * boardMetrics.cellSize"
                  :y2="boardMetrics.boardSize"
                  stroke="#020617"
                  stroke-width="1.5"
                />
                <line
                  v-for="i in currentPuzzle.size + 1"
                  :key="`h-grid-${i}`"
                  :x1="0"
                  :y1="(i - 1) * boardMetrics.cellSize"
                  :x2="boardMetrics.boardSize"
                  :y2="(i - 1) * boardMetrics.cellSize"
                  stroke="#020617"
                  stroke-width="1.5"
                />

                <rect
                  v-for="rowIndex in fullRowsWithoutStar"
                  :key="`full-row-${rowIndex}`"
                  class="inconsistency-band"
                  :x="0"
                  :y="rowIndex * boardMetrics.cellSize"
                  :width="boardMetrics.boardSize"
                  :height="boardMetrics.cellSize"
                  rx="12"
                />
                <rect
                  v-for="colIndex in fullColumnsWithoutStar"
                  :key="`full-column-${colIndex}`"
                  class="inconsistency-band"
                  :x="colIndex * boardMetrics.cellSize"
                  :y="0"
                  :width="boardMetrics.cellSize"
                  :height="boardMetrics.boardSize"
                  rx="12"
                />
              </g>

              <g v-for="(row, rowIndex) in currentPuzzle.regions" :key="`row-${rowIndex}`">
                <g v-for="(regionId, colIndex) in row" :key="`${rowIndex}-${colIndex}`">
                  <!-- Base Cell Background -->
                  <rect
                    :x="colIndex * boardMetrics.cellSize + 2"
                    :y="rowIndex * boardMetrics.cellSize + 2"
                    :width="boardMetrics.cellSize - 4"
                    :height="boardMetrics.cellSize - 4"
                    rx="12"
                    :fill="cellFill(regionId)"
                    class="transition-colors duration-200"
                  />

                  <!-- Cell State Layer -->
                  <rect
                    :x="colIndex * boardMetrics.cellSize + 2"
                    :y="rowIndex * boardMetrics.cellSize + 2"
                    :width="boardMetrics.cellSize - 4"
                    :height="boardMetrics.cellSize - 4"
                    rx="12"
                    :fill="grid[rowIndex][colIndex] === CELL_EMPTY ? 'white' : 'black'"
                    :fill-opacity="grid[rowIndex][colIndex] === CELL_EMPTY ? 0.06 : (grid[rowIndex][colIndex] === CELL_STAR ? 0 : 0.25)"
                    class="cursor-pointer transition"
                    @pointerdown="handleCellPointerDown(rowIndex, colIndex, $event)"
                    @pointerenter="handleCellPointerEnter(rowIndex, colIndex, $event)"
                    @click="handleCellPress(rowIndex, colIndex)"
                  />

                  <!-- Interactive Border for Empty Cells -->
                  <rect
                    v-if="grid[rowIndex][colIndex] === CELL_EMPTY"
                    :x="colIndex * boardMetrics.cellSize + 4"
                    :y="rowIndex * boardMetrics.cellSize + 4"
                    :width="boardMetrics.cellSize - 8"
                    :height="boardMetrics.cellSize - 8"
                    rx="10"
                    fill="none"
                    stroke="white"
                    stroke-opacity="0.1"
                    stroke-width="1"
                    pointer-events="none"
                  />

                  <!-- Conflict / Illegal Highlight -->
                  <rect
                    v-if="!canAddStar(rowIndex, colIndex) && grid[rowIndex][colIndex] === CELL_EMPTY"
                    :x="colIndex * boardMetrics.cellSize + 2"
                    :y="rowIndex * boardMetrics.cellSize + 2"
                    :width="boardMetrics.cellSize - 4"
                    :height="boardMetrics.cellSize - 4"
                    rx="12"
                    fill="none"
                    stroke="#ef4444"
                    stroke-width="2"
                    stroke-dasharray="4 2"
                    pointer-events="none"
                  />

                  <line
                    v-if="regionEdges[rowIndex][colIndex].top"
                    :x1="colIndex * boardMetrics.cellSize"
                    :y1="rowIndex * boardMetrics.cellSize"
                    :x2="(colIndex + 1) * boardMetrics.cellSize"
                    :y2="rowIndex * boardMetrics.cellSize"
                    :stroke="borderStroke(regionId)"
                    stroke-linecap="round"
                    stroke-width="5"
                  />
                  <line
                    v-if="regionEdges[rowIndex][colIndex].right"
                    :x1="(colIndex + 1) * boardMetrics.cellSize"
                    :y1="rowIndex * boardMetrics.cellSize"
                    :x2="(colIndex + 1) * boardMetrics.cellSize"
                    :y2="(rowIndex + 1) * boardMetrics.cellSize"
                    :stroke="borderStroke(regionId)"
                    stroke-linecap="round"
                    stroke-width="5"
                  />
                  <line
                    v-if="regionEdges[rowIndex][colIndex].bottom"
                    :x1="colIndex * boardMetrics.cellSize"
                    :y1="(rowIndex + 1) * boardMetrics.cellSize"
                    :x2="(colIndex + 1) * boardMetrics.cellSize"
                    :y2="(rowIndex + 1) * boardMetrics.cellSize"
                    :stroke="borderStroke(regionId)"
                    stroke-linecap="round"
                    stroke-width="5"
                  />
                  <line
                    v-if="regionEdges[rowIndex][colIndex].left"
                    :x1="colIndex * boardMetrics.cellSize"
                    :y1="rowIndex * boardMetrics.cellSize"
                    :x2="colIndex * boardMetrics.cellSize"
                    :y2="(rowIndex + 1) * boardMetrics.cellSize"
                    :stroke="borderStroke(regionId)"
                    stroke-linecap="round"
                    stroke-width="5"
                  />

                  <g
                    v-if="grid[rowIndex][colIndex] === CELL_STAR"
                    pointer-events="none"
                    class="star-marker"
                    :class="{ 'star-marker-conflict': starConflictKeys.has(toKey(rowIndex, colIndex)) }"
                  >
                    <circle
                      class="star-dot"
                      :cx="colIndex * boardMetrics.cellSize + boardMetrics.cellSize / 2"
                      :cy="rowIndex * boardMetrics.cellSize + boardMetrics.cellSize / 2"
                      :r="boardMetrics.cellSize * 0.22"
                      fill="#fef3c7"
                      fill-opacity="0.2"
                    />
                    <circle
                      v-if="starConflictKeys.has(toKey(rowIndex, colIndex))"
                      class="conflict-ring"
                      :cx="colIndex * boardMetrics.cellSize + boardMetrics.cellSize / 2"
                      :cy="rowIndex * boardMetrics.cellSize + boardMetrics.cellSize / 2"
                      :r="boardMetrics.cellSize * 0.32"
                      fill="none"
                      stroke="#fb7185"
                      stroke-width="5"
                    />
                    <text
                      :x="colIndex * boardMetrics.cellSize + boardMetrics.cellSize / 2"
                      :y="rowIndex * boardMetrics.cellSize + boardMetrics.cellSize * 0.66"
                      text-anchor="middle"
                      fill="#fef3c7"
                      font-size="44"
                      font-weight="700"
                    >
                      ★
                    </text>
                  </g>

                  <g
                    v-else-if="grid[rowIndex][colIndex] === CELL_BLOCKED"
                    pointer-events="none"
                    class="block-marker"
                    :opacity="derivedBlocks.has(toKey(rowIndex, colIndex)) && !gameState.manualBlocks.includes(toKey(rowIndex, colIndex)) ? 0.5 : 0.9"
                  >
                    <line
                      :x1="colIndex * boardMetrics.cellSize + boardMetrics.cellSize * 0.39"
                      :y1="rowIndex * boardMetrics.cellSize + boardMetrics.cellSize * 0.39"
                      :x2="colIndex * boardMetrics.cellSize + boardMetrics.cellSize * 0.61"
                      :y2="rowIndex * boardMetrics.cellSize + boardMetrics.cellSize * 0.61"
                      stroke="#f8fafc"
                      stroke-linecap="round"
                      stroke-width="3"
                    />
                    <line
                      :x1="colIndex * boardMetrics.cellSize + boardMetrics.cellSize * 0.61"
                      :y1="rowIndex * boardMetrics.cellSize + boardMetrics.cellSize * 0.39"
                      :x2="colIndex * boardMetrics.cellSize + boardMetrics.cellSize * 0.39"
                      :y2="rowIndex * boardMetrics.cellSize + boardMetrics.cellSize * 0.61"
                      stroke="#f8fafc"
                      stroke-linecap="round"
                      stroke-width="3"
                    />
                  </g>
                </g>
              </g>
            </svg>
          </div>

          <div
            v-if="solved"
            class="mt-4 rounded-2xl border border-emerald-300/70 bg-emerald-400/20 p-4 text-emerald-50 shadow-lg shadow-emerald-900/30"
            role="status"
            aria-live="polite"
          >
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-100/90">Puzzle complete</p>
            <h3 class="mt-1 text-2xl font-black tracking-tight">You solved {{ currentPuzzle.name }}.</h3>
            <p class="mt-1 text-sm text-emerald-100/90">Every row, column, and region now has exactly one star with no touching neighbors.</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-full bg-emerald-200 px-4 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-100"
                @click="nextPuzzle"
              >
                Play next puzzle
              </button>
              <button
                type="button"
                class="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25"
                @click="resetPuzzle"
              >
                Replay this puzzle
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </main>
</template>

<style scoped>
.star-marker,
.block-marker,
.inconsistency-band {
  opacity: 0;
  animation: marker-in 0.2s ease-out forwards;
}

.star-marker,
.block-marker {
  transform-origin: center;
}

.star-dot,
.conflict-ring {
  transition: opacity 0.2s ease-out;
}

.star-marker-conflict text {
  fill: #fecaca;
}

.inconsistency-band {
  fill: rgb(244 63 94 / 22%);
}

@keyframes marker-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
