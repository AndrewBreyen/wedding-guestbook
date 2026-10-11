import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, ScanCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const TABLE = process.env.TABLE_NAME;
const BUCKET = process.env.BUCKET_NAME;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json",
};

function response(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function parseBody(event) {
  return JSON.parse(event.body || "{}");
}

export async function handler(event) {
  try {
    if (event.requestContext?.http?.method === "OPTIONS") return response(204, {});
    const method = event.requestContext?.http?.method;
    const path = event.rawPath.replace(/\/$/, "") || "/";

    if (method === "POST" && path === "/uploads") {
      const { id } = parseBody(event);
      if (!/^[0-9a-f-]{36}$/i.test(id || "")) return response(400, { error: "Invalid entry id." });
      const photoKey = `photos/${id}-photo.jpg`;
      const printKey = `photos/${id}-print.jpg`;
      const [photoUrl, printUrl] = await Promise.all([
        getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: photoKey, ContentType: "image/jpeg" }), { expiresIn: 300 }),
        getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: printKey, ContentType: "image/jpeg" }), { expiresIn: 300 }),
      ]);
      return response(200, { uploads: { photo: { key: photoKey, url: photoUrl }, print: { key: printKey, url: printUrl } } });
    }

    if (method === "POST" && path === "/entries") {
      const { id, name, notes = "" } = parseBody(event);
      if (!/^[0-9a-f-]{36}$/i.test(id || "") || typeof name !== "string" || !name.trim()) {
        return response(400, { error: "A valid id and name are required." });
      }
      const entry = {
        id,
        itemType: "guestbook",
        name: name.trim().slice(0, 100),
        notes: typeof notes === "string" ? notes.trim().slice(0, 1000) : "",
        photoKey: `photos/${id}-photo.jpg`,
        printKey: `photos/${id}-print.jpg`,
        createdAt: new Date().toISOString(),
      };
      const uploadedObjects = await Promise.all([
        s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: entry.photoKey })),
        s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: entry.printKey })),
      ]);
      if (uploadedObjects.some((object) => object.ContentType !== "image/jpeg" || object.ContentLength > 10 * 1024 * 1024)) {
        return response(400, { error: "Images must be JPEG files under 10 MB." });
      }
      await ddb.send(new PutCommand({ TableName: TABLE, Item: entry, ConditionExpression: "attribute_not_exists(id)" }));
      const [photoUrl, printImageUrl] = await Promise.all([
        getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: entry.photoKey }), { expiresIn: 3600 }),
        getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: entry.printKey }), { expiresIn: 3600 }),
      ]);
      return response(201, { ...entry, photoUrl, printImageUrl });
    }

    if (method === "GET" && path === "/entries") {
      const result = await ddb.send(new ScanCommand({
        TableName: TABLE,
        FilterExpression: "attribute_not_exists(itemType) OR itemType = :guestbook",
        ExpressionAttributeValues: { ":guestbook": "guestbook" },
      }));
      const entries = await Promise.all((result.Items || [])
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(async (entry) => ({
          id: entry.id,
          name: entry.name,
          notes: entry.notes,
          createdAt: entry.createdAt,
          photoUrl: await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: entry.photoKey }), { expiresIn: 3600 }),
          printImageUrl: await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: entry.printKey }), { expiresIn: 3600 }),
        })));
      return response(200, entries);
    }

    return response(404, { error: "Not found." });
  } catch (error) {
    console.error("Guestbook API error", error);
    return response(500, { error: "The guestbook service could not complete the request." });
  }
}
