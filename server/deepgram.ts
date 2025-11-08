import { createClient } from "@deepgram/sdk";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

if (!DEEPGRAM_API_KEY) {
  throw new Error("DEEPGRAM_API_KEY environment variable is required");
}

const deepgram = createClient(DEEPGRAM_API_KEY);

export interface TextToSpeechOptions {
  text: string;
  model?: string;
  voice?: string;
}

/**
 * Split text into chunks at sentence boundaries
 */
function splitTextIntoChunks(text: string, maxChunkSize: number = 1900): string[] {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let remainingText = text;

  while (remainingText.length > 0) {
    if (remainingText.length <= maxChunkSize) {
      chunks.push(remainingText);
      break;
    }

    // Get a chunk
    let chunk = remainingText.substring(0, maxChunkSize);
    
    // Try to find a sentence boundary
    const lastPeriod = chunk.lastIndexOf('.');
    const lastExclamation = chunk.lastIndexOf('!');
    const lastQuestion = chunk.lastIndexOf('?');
    const lastSentenceEnd = Math.max(lastPeriod, lastExclamation, lastQuestion);
    
    // If we found a sentence boundary in the last 20% of the chunk, use it
    if (lastSentenceEnd > maxChunkSize * 0.8) {
      chunk = chunk.substring(0, lastSentenceEnd + 1);
    }
    
    chunks.push(chunk.trim());
    remainingText = remainingText.substring(chunk.length).trim();
  }

  return chunks;
}

/**
 * Combine multiple WAV buffers into one
 * WAV files have a 44-byte header, we keep the first header and concatenate the audio data
 */
function combineWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) {
    throw new Error("No buffers to combine");
  }
  
  if (buffers.length === 1) {
    return buffers[0];
  }

  // WAV header is 44 bytes
  const WAV_HEADER_SIZE = 44;
  
  // Get the first buffer's header
  const header = buffers[0].slice(0, WAV_HEADER_SIZE);
  
  // Collect all audio data (skip headers from all buffers)
  const audioDataChunks = buffers.map(buffer => buffer.slice(WAV_HEADER_SIZE));
  
  // Calculate total audio data size
  const totalAudioSize = audioDataChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  
  // Update the file size in the header
  // Bytes 4-7 contain file size - 8
  const totalFileSize = WAV_HEADER_SIZE + totalAudioSize - 8;
  header.writeUInt32LE(totalFileSize, 4);
  
  // Bytes 40-43 contain audio data size
  header.writeUInt32LE(totalAudioSize, 40);
  
  // Combine header + all audio data
  return Buffer.concat([header, ...audioDataChunks]);
}

async function generateAudioForSingleChunk(text: string, model: string): Promise<Buffer> {
  const response = await deepgram.speak.request(
    { text },
    {
      model,
      encoding: "linear16",
      container: "wav",
    }
  );

  const stream = await response.getStream();
  if (!stream) {
    throw new Error("Failed to get audio stream from Deepgram");
  }

  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const audioBuffer = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    audioBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  return Buffer.from(audioBuffer);
}

export async function generateAudioFromText(options: TextToSpeechOptions): Promise<Buffer> {
  const { text, model = "aura-asteria-en" } = options;

  try {
    // Split text into chunks if needed
    const textChunks = splitTextIntoChunks(text, 1900);
    
    if (textChunks.length === 1) {
      console.log("Generating audio for single chunk");
      return await generateAudioForSingleChunk(text, model);
    }

    console.log(`Generating audio in ${textChunks.length} chunks`);
    
    // Generate audio for each chunk
    const audioBuffers: Buffer[] = [];
    for (let i = 0; i < textChunks.length; i++) {
      console.log(`Generating audio chunk ${i + 1}/${textChunks.length} (${textChunks[i].length} chars)`);
      const buffer = await generateAudioForSingleChunk(textChunks[i], model);
      audioBuffers.push(buffer);
    }

    // Combine all audio buffers
    console.log("Combining audio chunks...");
    const combinedBuffer = combineWavBuffers(audioBuffers);
    console.log(`Combined audio size: ${combinedBuffer.length} bytes`);
    
    return combinedBuffer;
  } catch (error) {
    console.error("Error generating audio from text:", error);
    throw new Error("Failed to generate audio with Deepgram");
  }
}
