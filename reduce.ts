import fs from "fs/promises";
import { McapWriter, McapIndexedReader } from "@mcap/core";
import { FileHandleReadable, FileHandleWritable } from "@mcap/nodejs";
import { loadDecompressHandlers } from "@mcap/support";
import zstd from "@lichtblick/wasm-zstd";
import path from "path";

// Maximum frequency of messages to keep
// If a topic has a frequency greater than this, it will be reduced in half
const maxFrequency = 50;

// Read the input file from the command line argument
const inputFiles = process.argv.slice(2).filter((arg) => arg.endsWith(".mcap"));

if (inputFiles.length === 0) {
  console.error(
    "Usage: npm run reduce <input-file1.mcap> [<input-file2.mcap> ...]"
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

  const nonFrequentTopics: string[] = [];

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
  const channelTopicMap = new Map<number, string>();

  const topicsWriten = {};

  // Copy schemas
  for (const schema of reader.schemasById.values()) {
    const newSchemaId = await writer.registerSchema(schema);
    schemaMap.set(schema.id, newSchemaId);
  }

  const start = reader.statistics.messageStartTime;
  const end = reader.statistics.messageEndTime;

  // Copy channels
  for (const channel of reader.channelsById.values()) {
    const countMessages = Number(
      reader.statistics.channelMessageCounts.get(channel.id)
    );

    const frequency = Math.floor((countMessages / Number(end - start)) * 1e9);

    // Only keep channels / topics with frequency less than or equal to maxFrequency
    if (frequency <= maxFrequency) {
      nonFrequentTopics.push(channel.topic);
    }

    const newSchemaId = schemaMap.get(channel.schemaId) || 0;
    const newChannelId = await writer.registerChannel({
      ...channel,
      schemaId: newSchemaId,
    });
    channelMap.set(channel.id, newChannelId);
    channelTopicMap.set(channel.id, channel.topic);
  }

  // Copy messages
  for await (const record of reader.readMessages()) {
    if (record.type !== "Message") continue;
    const newChannelId = channelMap.get(record.channelId);
    if (newChannelId !== undefined) {
      // Always write if not frequent topic
      if (nonFrequentTopics.includes(channelTopicMap.get(record.channelId))) {
        await writer.addMessage({ ...record, channelId: newChannelId });
      } else if (!topicsWriten[newChannelId]) {
        topicsWriten[newChannelId] = true;
        await writer.addMessage({ ...record, channelId: newChannelId });
      } else {
        topicsWriten[newChannelId] = false;
      }
    }
  }

  // Close writer and streams
  await writer.end();
  await outputStream.close();
  await inputStream.close();

  console.log(`Reducing ${outputFile} complete.`);
}
