import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, timingSafeEqual } from "node:crypto";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const TABLE = process.env.TABLE_NAME;
const BUCKET = process.env.BUCKET_NAME;
const CAMERA_TABLE = process.env.CAMERA_TABLE;
const CAMERA_PHOTOS_PER_GUEST = Number.parseInt(process.env.CAMERA_PHOTOS_PER_GUEST || "5", 10);
const CAMERA_ADMIN_CODE_HASH = process.env.CAMERA_ADMIN_CODE_HASH || "";
const EVENT_PARTITION = "EVENT";
const SETTINGS_ID = "SETTINGS";
const UUID_PATTERN = /^[0-9a-f-]{36}$/i;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,authorization",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
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

    if (path.startsWith("/camera") || path.startsWith("/admin/camera")) {
      if (!CAMERA_TABLE) return response(503, { error: "The disposable camera is not configured." });
      return await handleCameraRequest({ method, path, event });
    }

    return response(404, { error: "Not found." });
  } catch (error) {
    console.error("Guestbook API error", error);
    return response(500, { error: "The guestbook service could not complete the request." });
  }
}

async function handleCameraRequest({ method, path, event }) {
  if (method === "GET" && path === "/camera/my-photos") {
    const cameraId = event.queryStringParameters?.cameraId || "";
    if (!UUID_PATTERN.test(cameraId)) return response(400, { error: "Invalid camera session." });
    const result = await ddb.send(new QueryCommand({
      TableName: CAMERA_TABLE,
      KeyConditionExpression: "cameraId = :cameraId",
      FilterExpression: "itemType = :photo AND #status = :pending",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":cameraId": cameraId, ":photo": "photo", ":pending": "pending" },
    }));
    const photos = await Promise.all((result.Items || []).map(async (photo) => ({
      id: photo.photoId,
      createdAt: photo.createdAt,
      photoUrl: await cameraPhotoUrl(photo),
    })));
    return response(200, { photos });
  }

  if (method === "DELETE" && path === "/camera/my-photos") {
    const { cameraId, photoId } = parseBody(event);
    if (!UUID_PATTERN.test(cameraId || "") || !UUID_PATTERN.test(photoId || "")) {
      return response(400, { error: "Invalid photo." });
    }
    const itemId = `PHOTO#${photoId}`;
    const result = await ddb.send(new GetCommand({ TableName: CAMERA_TABLE, Key: { cameraId, itemId } }));
    if (!result.Item || result.Item.itemType !== "photo" || !["pending", "uploading"].includes(result.Item.status)) {
      return response(404, { error: "Photo not found." });
    }
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `disposable/${cameraId}/${photoId}.jpg` }));
    try {
      await ddb.send(new TransactWriteCommand({
        TransactItems: [
          { Delete: { TableName: CAMERA_TABLE, Key: { cameraId, itemId }, ConditionExpression: "itemType = :photo AND #status IN (:pending, :uploading)", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":photo": "photo", ":pending": "pending", ":uploading": "uploading" } } },
          { Update: { TableName: CAMERA_TABLE, Key: { cameraId, itemId: "SESSION" }, UpdateExpression: "SET shotsUsed = shotsUsed - :one", ConditionExpression: "shotsUsed > :zero", ExpressionAttributeValues: { ":one": 1, ":zero": 0 } } },
        ],
      }));
    } catch (error) {
      if (error.name === "TransactionCanceledException") return response(409, { error: "That photo changed while it was being deleted. Refresh your photos and try again." });
      throw error;
    }
    return response(200, { deleted: true, shotsUsed: await getSessionShots(cameraId) });
  }

  if (method === "POST" && path === "/camera/session") {
    const { cameraId, name, email = "" } = parseBody(event);
    const cleanName = typeof name === "string" ? name.trim().slice(0, 80) : "";
    const cleanEmail = typeof email === "string" ? email.trim().slice(0, 254) : "";
    if (!UUID_PATTERN.test(cameraId || "") || !cleanName || (cleanEmail && !/^\S+@\S+\.\S+$/.test(cleanEmail))) {
      return response(400, { error: "Enter a name and a valid email address, if you choose to provide one." });
    }

    const result = await ddb.send(new UpdateCommand({
      TableName: CAMERA_TABLE,
      Key: { cameraId, itemId: "SESSION" },
      UpdateExpression: "SET itemType = :type, #name = :name, email = :email, shotsUsed = if_not_exists(shotsUsed, :zero)",
      ExpressionAttributeNames: { "#name": "name" },
      ExpressionAttributeValues: { ":type": "session", ":name": cleanName, ":email": cleanEmail, ":zero": 0 },
      ReturnValues: "ALL_NEW",
    }));
    return response(200, { shotsUsed: result.Attributes.shotsUsed, shotLimit: CAMERA_PHOTOS_PER_GUEST });
  }

  if (method === "GET" && path === "/camera/session") {
    const cameraId = event.queryStringParameters?.cameraId || "";
    if (!UUID_PATTERN.test(cameraId)) return response(400, { error: "Invalid camera session." });
    const result = await ddb.send(new GetCommand({
      TableName: CAMERA_TABLE,
      Key: { cameraId, itemId: "SESSION" },
    }));
    return response(200, {
      shotsUsed: result.Item?.shotsUsed || 0,
      shotLimit: CAMERA_PHOTOS_PER_GUEST,
    });
  }

  if (method === "POST" && path === "/camera/uploads") {
    const { cameraId, photoId } = parseBody(event);
    if (!UUID_PATTERN.test(cameraId || "") || !UUID_PATTERN.test(photoId || "")) {
      return response(400, { error: "Invalid camera upload." });
    }

    const existing = await ddb.send(new GetCommand({
      TableName: CAMERA_TABLE,
      Key: { cameraId, itemId: `PHOTO#${photoId}` },
    }));
    if (existing.Item && existing.Item.status !== "uploading") {
      return response(409, { error: "This photo has already been submitted." });
    }
    if (!existing.Item && (await getCameraSettings()).revealed) {
      return response(410, { error: "The event camera is closed. The photo roll has been revealed." });
    }

    let shotsUsed;
    if (!existing.Item) {
      try {
        await ddb.send(new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: CAMERA_TABLE,
                Key: { cameraId, itemId: "SESSION" },
                UpdateExpression: "SET shotsUsed = shotsUsed + :one",
                ConditionExpression: "attribute_exists(#name) AND shotsUsed < :limit",
                ExpressionAttributeNames: { "#name": "name" },
                ExpressionAttributeValues: { ":one": 1, ":limit": CAMERA_PHOTOS_PER_GUEST },
              },
            },
            {
              Put: {
                TableName: CAMERA_TABLE,
                Item: {
                  cameraId,
                  itemId: `PHOTO#${photoId}`,
                  photoId,
                  itemType: "photo",
                  status: "uploading",
                  createdAt: new Date().toISOString(),
                },
                ConditionExpression: "attribute_not_exists(itemId)",
              },
            },
          ],
        }));
        shotsUsed = await getSessionShots(cameraId);
      } catch (error) {
        if (error.name === "TransactionCanceledException") {
          const session = await ddb.send(new GetCommand({ TableName: CAMERA_TABLE, Key: { cameraId, itemId: "SESSION" } }));
          if (!session.Item || session.Item.shotsUsed >= CAMERA_PHOTOS_PER_GUEST) {
            return response(409, { error: "Your camera roll is full. Thanks for taking part!" });
          }
          return response(409, { error: "This shot is already being uploaded. Retry it in a moment." });
        }
        throw error;
      }
    } else {
      const session = await ddb.send(new GetCommand({ TableName: CAMERA_TABLE, Key: { cameraId, itemId: "SESSION" } }));
      shotsUsed = session.Item?.shotsUsed || 0;
    }

    const key = `disposable/${cameraId}/${photoId}.jpg`;
    const url = await getSignedUrl(s3, new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: "image/jpeg",
    }), { expiresIn: 300 });
    return response(200, { photoId, url, shotsUsed, shotLimit: CAMERA_PHOTOS_PER_GUEST });
  }

  if (method === "POST" && path === "/camera/complete") {
    const { cameraId, photoId } = parseBody(event);
    if (!UUID_PATTERN.test(cameraId || "") || !UUID_PATTERN.test(photoId || "")) {
      return response(400, { error: "Invalid camera upload." });
    }
    const key = `disposable/${cameraId}/${photoId}.jpg`;
    const [photo, object] = await Promise.all([
      ddb.send(new GetCommand({ TableName: CAMERA_TABLE, Key: { cameraId, itemId: `PHOTO#${photoId}` } })),
      s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })),
    ]);
    if (!photo.Item || photo.Item.status !== "uploading") return response(404, { error: "Upload reservation not found." });
    if (object.ContentType !== "image/jpeg" || !object.ContentLength || object.ContentLength > 10 * 1024 * 1024) {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      await ddb.send(new DeleteCommand({ TableName: CAMERA_TABLE, Key: { cameraId, itemId: `PHOTO#${photoId}` } }));
      await ddb.send(new UpdateCommand({
        TableName: CAMERA_TABLE,
        Key: { cameraId, itemId: "SESSION" },
        UpdateExpression: "SET shotsUsed = shotsUsed - :one",
        ConditionExpression: "shotsUsed > :zero",
        ExpressionAttributeValues: { ":one": 1, ":zero": 0 },
      }));
      return response(400, { error: "Photos must be JPEG files under 10 MB." });
    }
    await ddb.send(new UpdateCommand({
      TableName: CAMERA_TABLE,
      Key: { cameraId, itemId: `PHOTO#${photoId}` },
      UpdateExpression: "SET #status = :status, fileSize = :size",
      ConditionExpression: "#status = :uploading",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": "pending", ":uploading": "uploading", ":size": object.ContentLength },
    }));
    return response(201, { photoId, shotsUsed: (await getSessionShots(cameraId)) });
  }

  if (method === "GET" && path === "/camera/photos") {
    const settings = await getCameraSettings();
    if (!settings.revealed) return response(200, { revealed: false, photos: [] });
    const photos = await listCameraPhotos();
    const visible = await Promise.all(photos
      .filter((photo) => photo.status === "pending")
      .map(async (photo) => {
        const session = await ddb.send(new GetCommand({ TableName: CAMERA_TABLE, Key: { cameraId: photo.cameraId, itemId: "SESSION" } }));
        return {
          id: photo.photoId,
          name: session.Item?.name || "Guest",
          createdAt: photo.createdAt,
          photoUrl: await cameraPhotoUrl(photo),
        };
      }));
    return response(200, { revealed: true, photos: visible });
  }

  if (path.startsWith("/admin/camera")) {
    if (!isCameraAdmin(event)) return response(401, { error: "Host access code is incorrect." });

    if (method === "GET" && path === "/admin/camera/photos") {
      const [settings, photos] = await Promise.all([getCameraSettings(), listCameraPhotos()]);
      const review = await Promise.all(photos
        .filter((photo) => photo.status === "pending" || photo.status === "uploading")
        .map(async (photo) => {
          const session = await ddb.send(new GetCommand({ TableName: CAMERA_TABLE, Key: { cameraId: photo.cameraId, itemId: "SESSION" } }));
          return {
            id: photo.photoId,
            cameraId: photo.cameraId,
            status: photo.status,
            name: session.Item?.name || "Guest",
            email: session.Item?.email || "",
            createdAt: photo.createdAt,
            photoUrl: photo.status === "pending" ? await cameraPhotoUrl(photo) : null,
          };
        }));
      return response(200, { revealed: Boolean(settings.revealed), photos: review });
    }

    if (method === "POST" && path === "/admin/camera/reveal") {
      await ddb.send(new UpdateCommand({
        TableName: CAMERA_TABLE,
        Key: { cameraId: EVENT_PARTITION, itemId: SETTINGS_ID },
        UpdateExpression: "SET itemType = :type, revealed = :revealed",
        ExpressionAttributeValues: { ":type": "settings", ":revealed": true },
      }));
      return response(200, { revealed: true });
    }

    if (method === "DELETE" && path === "/admin/camera/photos") {
      const { cameraId, photoId } = parseBody(event);
      if (!UUID_PATTERN.test(cameraId || "") || !UUID_PATTERN.test(photoId || "")) {
        return response(400, { error: "Invalid photo." });
      }
      const itemId = `PHOTO#${photoId}`;
      const result = await ddb.send(new GetCommand({ TableName: CAMERA_TABLE, Key: { cameraId, itemId } }));
      if (!result.Item || result.Item.itemType !== "photo") return response(404, { error: "Photo not found." });
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `disposable/${cameraId}/${photoId}.jpg` }));
      await ddb.send(new DeleteCommand({ TableName: CAMERA_TABLE, Key: { cameraId, itemId } }));
      return response(200, { deleted: true });
    }
  }

  return response(404, { error: "Not found." });
}

async function getSessionShots(cameraId) {
  const result = await ddb.send(new GetCommand({ TableName: CAMERA_TABLE, Key: { cameraId, itemId: "SESSION" } }));
  return result.Item?.shotsUsed || 0;
}

async function getCameraSettings() {
  const result = await ddb.send(new GetCommand({
    TableName: CAMERA_TABLE,
    Key: { cameraId: EVENT_PARTITION, itemId: SETTINGS_ID },
  }));
  return result.Item || { revealed: false };
}

async function listCameraPhotos() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await ddb.send(new ScanCommand({
      TableName: CAMERA_TABLE,
      FilterExpression: "itemType = :photo",
      ExpressionAttributeValues: { ":photo": "photo" },
      ExclusiveStartKey,
    }));
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function cameraPhotoUrl(photo) {
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET,
    Key: `disposable/${photo.cameraId}/${photo.photoId}.jpg`,
  }), { expiresIn: 3600 });
}

function isCameraAdmin(event) {
  if (!CAMERA_ADMIN_CODE_HASH) return false;
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  const code = header.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!code) return false;
  const supplied = createHash("sha256").update(code).digest();
  let expected;
  try {
    if (!/^[0-9a-f]{64}$/i.test(CAMERA_ADMIN_CODE_HASH)) return false;
    expected = Buffer.from(CAMERA_ADMIN_CODE_HASH, "hex");
  } catch {
    return false;
  }
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
