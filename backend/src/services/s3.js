import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { readFile } from "node:fs/promises";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "vyntyra-applications";

/**
 * Upload a file to S3 and return the pre-signed URL
 * @param {string} filePath - Local file path
 * @param {string} s3Key - S3 object key (path in bucket)
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} Pre-signed URL
 */
export const uploadToS3 = async (filePath, s3Key, contentType = "application/pdf") => {
  try {
    const fileContent = await readFile(filePath);

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    });

    await s3Client.send(command);

    // Generate pre-signed URL (valid for 7 days)
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });

    const url = await getSignedUrl(s3Client, getCommand, { expiresIn: 7 * 24 * 60 * 60 });

    return url;
  } catch (error) {
    console.error("S3 upload error:", error);
    throw error;
  }
};

/**
 * Upload a Buffer to S3 and return the pre-signed URL
 * @param {Buffer} buffer - File buffer
 * @param {string} s3Key - S3 object key
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} Pre-signed URL
 */
export const uploadBufferToS3 = async (buffer, s3Key, contentType = "application/pdf") => {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    });

    await s3Client.send(command);

    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });

    const url = await getSignedUrl(s3Client, getCommand, { expiresIn: 7 * 24 * 60 * 60 });

    return url;
  } catch (error) {
    console.error("S3 buffer upload error:", error);
    throw error;
  }
};

/**
 * Delete a file from S3
 * @param {string} s3Key - S3 object key
 */
export const deleteFromS3 = async (s3Key) => {
  try {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });
    await s3Client.send(command);
  } catch (error) {
    console.error("S3 delete error:", error);
    throw error;
  }
};

export default s3Client;
