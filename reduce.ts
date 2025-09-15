import fs from "fs/promises";
import { McapWriter, McapIndexedReader } from "@mcap/core";
import { FileHandleReadable, FileHandleWritable } from "@mcap/nodejs";
import { loadDecompressHandlers } from "@mcap/support";
import zstd from "@lichtblick/wasm-zstd";
import path from "path";

// Maximum frequency of messages to keep
// If a topic has a frequency greater than this, it will be reduced
let maxFrequency = 50;

// Read the input file from the command line argument
const inputFiles = process.argv.slice(2).filter((arg) => arg.endsWith(".mcap"));

const frequencyFlag = process.argv.slice(2).filter((arg) => arg.startsWith("--messageFrequency"));
if (frequencyFlag.length > 0) {
  const frequencyWanted = parseInt(frequencyFlag[0].split("=").pop());
  if(!isNaN(frequencyWanted)) {
    maxFrequency = frequencyWanted;
  }
}


if (inputFiles.length === 0) {
  console.error(
    "Usage: npm run reduce <input-file1.mcap> [<input-file2.mcap> ...] [--messageFrequency=<freq>]"
  );
  process.exit(1);
}

reduceMcaps(inputFiles);

async function reduceMcaps(inputFiles: string[]) {
  for (const inputFile of inputFiles) {
    try {
      await reduceFrequency(inputFile);
    } catch (error) {
      console.error(`Error reducing ${inputFile}:`, error);
    }
  }
}

async function reduceFrequency(inputFile: string) {
  console.log(`Reducing ${inputFile}...`);

  // Initialize reader
  const inputStream = await fs.open(inputFile, "r");
  const reader = await McapIndexedReader.Initialize({
    readable: new FileHandleReadable(inputStream),
    decompressHandlers: await loadDecompressHandlers(),
  });

  const outputFile = path.join(
    path.dirname(inputFile),
    path.basename(inputFile).replace(".mcap", "_reduced.mcap")
  );
  const outputStream = await fs.open(outputFile, "w");
  const writer = new McapWriter({
    writable: new FileHandleWritable(outputStream),
    compressChunk: (data) => ({
      compression: "zstd",
      compressedData: zstd.compress(data),
    }),
  });

  await writer.start({ library: "mcap-reduce", profile: "reducer" });

  const schemaMap = new Map<number, number>();
  const channelMap = new Map<number, number>();
  const channelKeepRate = new Map<number, number>();
  const channelMessageCounter = new Map<number, number>();

  // Copy schemas
  for (const schema of reader.schemasById.values()) {
    const newSchemaId = await writer.registerSchema(schema);
    schemaMap.set(schema.id, newSchemaId);
  }

  const start = reader.statistics.messageStartTime;
  const end = reader.statistics.messageEndTime;
  const durationSeconds = Number(end - start) / 1e9;

  // Copy channels and calculate keep rates
  for (const channel of reader.channelsById.values()) {
    const countMessages = Number(
      reader.statistics.channelMessageCounts.get(channel.id) || 0
    );

    const frequency = countMessages / durationSeconds;

    let keepRate = 1;
    if (frequency > maxFrequency) {
      keepRate = Math.ceil(frequency / maxFrequency);
    } 

    const newSchemaId = schemaMap.get(channel.schemaId) || 0;
    const newChannelId = await writer.registerChannel({
      ...channel,
      schemaId: newSchemaId,
    });
    
    channelMap.set(channel.id, newChannelId);
    channelKeepRate.set(channel.id, keepRate);
    channelMessageCounter.set(channel.id, 0);
  }

  let totalMessagesWritten = 0;
  
  for await (const record of reader.readMessages()) {
    if (record.type !== "Message") continue;
    
    const newChannelId = channelMap.get(record.channelId);
    if (newChannelId !== undefined) {
      const keepRate = channelKeepRate.get(record.channelId) || 1;
      const messageCount = channelMessageCounter.get(record.channelId) || 0;
      
      // Keep message if it's the Nth message (where N = keepRate)
      if (messageCount % keepRate === 0) {
        await writer.addMessage({ ...record, channelId: newChannelId });
        totalMessagesWritten++;
      }
      
      channelMessageCounter.set(record.channelId, messageCount + 1);
    }
  }

  // Close writer and streams
  await writer.end();
  await outputStream.close();
  await inputStream.close();


  console.log(`Reducing ${outputFile} complete.`);
}