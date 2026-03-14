# Glitterati

Glitterati is a standalone web game inspired by star-placement logic puzzles.

## Rules

- Exactly one star must appear in each row.
- Exactly one star must appear in each column.
- Exactly one star must appear in each colored region.
- Stars may not touch horizontally, vertically, or diagonally.

## Controls

- Single click or tap adds or removes an `X`.
- Double click or double tap adds or removes a star.
- Placing a star automatically blocks the rest of its row, column, region, and surrounding cells.

## Development

```sh
npm install
npm run dev
```

## Scripts

```sh
npm run build
npm run test:unit
npm run test:e2e
npm run generate:puzzles
```
