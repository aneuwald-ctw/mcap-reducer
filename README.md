# MCAP Reducer

A simple tool to reduce the size of MCAP files by reducing the frequency of high-frequency topics.

## How it works

The reducer analyzes all topics in your MCAP file and reduces by half the messages from topics that have a frequency higher than the configured threshold (default: 50 Hz). Topics with frequency equal to or below the threshold are kept unchanged.

## Requirements

- Node.js
- npm

## Installation

1. Clone this repository:

```bash
git clone https://github.com/aneuwald-ctw/mcap-reducer.git
cd reduce-mcaps
```

2. Install dependencies:

```bash
npm install
```

## Usage

### Single file

```bash
npm run reduce /path/to/your/file.mcap
```

### Multiple files

```bash
npm run reduce /path/to/file1.mcap /path/to/file2.mcap /path/to/file3.mcap
```

### All MCAP files in a directory
```bash
npm run reduce /path/to/mcaps/*.mcap
```
*Note: The shell will expand `*.mcap` to match all `.mcap` files in the directory*

The reduced files will be created in the same directory as each input file with the suffix `_reduced.mcap`. If a file with the same name already exists, it will create numbered versions like `_reduced (2).mcap`, `_reduced (3).mcap`, etc.

For example:

- Input: `/home/user/data/recording.mcap`
- Output: `/home/user/data/recording_reduced.mcap`
- If exists: `/home/user/data/recording_reduced (2).mcap`

## Configuration

You can adjust the frequency threshold by modifying the `maxFrequency` variable in `reduce.ts`:

```typescript
const maxFrequency = 50; // Change this value as needed
```

- Topics with frequency ≤ `maxFrequency` Hz: **kept unchanged**
- Topics with frequency > `maxFrequency` Hz: **reduced by half**
