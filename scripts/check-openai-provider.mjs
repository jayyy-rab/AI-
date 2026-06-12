import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const env = loadEnvFile("server/.env");
const apiKey = process.env.OPENAI_API_KEY ?? env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL ?? env.OPENAI_MODEL ?? "gpt-4.1-mini";
const requireCheck = process.env.REQUIRE_OPENAI_CHECK === "1";

if (!apiKey) {
  const message = "OPENAI_API_KEY is not set; skipping real provider check";
  if (requireCheck) throw new Error(message);
  console.log(message);
  process.exit(0);
}

const checks = [
  { expected: "red", imageUrl: createSolidPngDataUrl(64, 64, 230, 24, 24) },
  { expected: "green", imageUrl: createSolidPngDataUrl(64, 64, 24, 190, 72) },
  { expected: "blue", imageUrl: createSolidPngDataUrl(64, 64, 34, 92, 230) }
];

let passed = 0;
const results = [];

for (const check of checks) {
  const answer = await askDominantColor(check.imageUrl);
  const ok = answer.includes(check.expected);
  if (ok) passed += 1;
  results.push({ expected: check.expected, answer, ok });
}

if (passed < 2) {
  throw new Error(`OpenAI provider visual check failed ${passed}/3: ${JSON.stringify(results)}`);
}

console.log(`openai provider ok (${model}) ${passed}/3`);

function loadEnvFile(path) {
  try {
    const content = readFileSync(path, "utf8");
    return Object.fromEntries(
      content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        })
    );
  } catch {
    return {};
  }
}

function extractOutputText(body) {
  if (typeof body.output_text === "string") return body.output_text;

  return (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join(" ");
}

async function askDominantColor(imageUrl) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "What is the dominant color in this image? Answer with one English color word."
            },
            {
              type: "input_image",
              image_url: imageUrl,
              detail: "low"
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI provider check failed: ${response.status} ${body.slice(0, 500)}`);
  }

  const body = await response.json();
  return extractOutputText(body).toLowerCase();
}

function createSolidPngDataUrl(width, height, red, green, blue) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixelStart = rowStart + 1 + x * 3;
      raw[pixelStart] = red;
      raw[pixelStart + 1] = green;
      raw[pixelStart + 2] = blue;
    }
  }

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", createIhdr(width, height)),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);

  return `data:image/png;base64,${png.toString("base64")}`;
}

function createIhdr(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return ihdr;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
