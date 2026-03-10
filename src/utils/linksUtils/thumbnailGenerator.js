const ffmpeg = require('fluent-ffmpeg');
const sharp = require("sharp");
const path = require("path");
const fs = require("fs").promises;
const asyncHandler = require('../errors/asyncHandler'); 
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require('@aws-sdk/lib-storage');

const s3Config = { 
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }, 
  region: process.env.AWS_REGION, 
};
if (process.env.AWS_ENDPOINT) {
  s3Config.endpoint = process.env.AWS_ENDPOINT;
  s3Config.forcePathStyle = true;
}
const s3 = new S3Client(s3Config);

const processFile = asyncHandler(async (file, ThumbnailsPath) => {
  const fileName = file.originalname;
  const mimeType = file.mimetype;
  const nameWithoutExt = fileName.split(".")[0];
  console.log(`processing file fopr blur with the name of ${fileName}`)
  
  // Determine output filename based on file type
  const outputFileName = mimeType.startsWith('video/') 
    ? `${nameWithoutExt}-thumbnail-vid.jpg` 
    : `${nameWithoutExt}-thumbnail.jpg`;
    
  const tempDir = './tmp';
  const tempInputPath = path.join(tempDir, fileName);
  const tempOutputPath = path.join(tempDir, outputFileName);

  try {
    // 1. Ensure tmp directory exists
    await fs.mkdir(tempDir, { recursive: true });

    // 2. Save the file temporarily
    await fs.writeFile(tempInputPath, file.buffer);

    // 3. Process based on file type
    if (mimeType.startsWith('video/')) {
      await processVideo(tempInputPath, tempOutputPath);
    } else if (mimeType.startsWith('image/')) {
      await processImage(tempInputPath, tempOutputPath);
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    // 4. Upload thumbnail to S3
    const thumbnailBuffer = await fs.readFile(tempOutputPath);
    await uploadToS3(thumbnailBuffer, outputFileName, ThumbnailsPath);

    return outputFileName;
  } catch (error) {
    console.error("Error in processFile:", error);
    throw error;
  } finally {
    // 5. Clean up (even if errors occurred)
    try {
      await Promise.all([
        fs.unlink(tempInputPath).catch(() => {}),
        fs.unlink(tempOutputPath).catch(() => {})
      ]);
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }
  }
});

// Helper functions (remain unchanged)
async function processVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: [0],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        //size: '612x486'
      })
      .on('end', () => {
        ffmpeg(outputPath)
          .output(outputPath)
          .videoFilter('gblur=sigma=38')
          .on('end', resolve)
          .on('error', reject)
          .run();
      })
      .on('error', reject);
  });
}

async function processImage(inputPath, outputPath) {
  await sharp(inputPath)
    //.resize(612, 486)
    .blur(80)
    .toFile(outputPath);
}

async function uploadToS3(buffer, fileName, prefix) {
  const upload = new Upload({
    client: s3,
    params: {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `${prefix}/${fileName}`,
      Body: buffer,
      ContentType: 'image/jpeg'
    }
  });
  await upload.done();
}

module.exports = processFile;