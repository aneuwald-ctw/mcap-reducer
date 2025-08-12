# MCAP Reducer

A simple tool to reduce the size of MCAP files by reducing the frequency of high-frequency topics.

## How it works

The reducer analyzes all topics in your MCAP file and reduces by half the messages from topics that have a frequency higher than the configured threshold (default: 50 Hz). Topics with frequency equal to or below the threshold are kept unchanged.

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

```bash
npm run reduce /path/to/your/file.mcap
```

The reduced file will be created in the same directory as the input file with the suffix `_reduced.mcap`.

For example:

- Input: `/home/user/data/recording.mcap`
- Output: `/home/user/data/recording_reduced.mcap`

## Configuration

You can adjust the frequency threshold by modifying the `maxFrequency` variable in `reduce.ts`:

```typescript
const maxFrequency = 50; // Change this value as needed
```

- Topics with frequency ≤ `maxFrequency` Hz: **kept unchanged**
- Topics with frequency > `maxFrequency` Hz: **reduced by half**

## Requirements

- Node.js
- npm
