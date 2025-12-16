import mongoose from "mongoose";
import { resolveMongoUri } from "./env";

declare global {
  var __truckly_mongoose__: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
}

type LoggerConnection = typeof mongoose.connection & {
  __truckly_logger_attached?: boolean;
};

const globalStore =
  globalThis.__truckly_mongoose__ || ({
    conn: null,
    promise: null,
  } as {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  });
globalThis.__truckly_mongoose__ = globalStore;

function attachLogging(connection: LoggerConnection) {
  if (connection.__truckly_logger_attached) return;
  connection.__truckly_logger_attached = true;

  connection.on("connecting", () =>
    console.log("||==|| --> DB Entered connecting state.")
  );
  connection.on("error", (err) => {
    console.error("||==|| --> DB Encountered an error. Restarting.", err);
    setTimeout(() => mongoose.disconnect().catch(() => undefined), 5000);
  });
  connection.once("open", () =>
    console.log("||==|| --> MongoDB connection opened!")
  );
  connection.on("reconnected", () =>
    console.log("||==|| --> DB reconnected!")
  );
  connection.on("disconnected", () => {
    console.log("||==|| --> DB disconnected! Reconnecting...");
    setTimeout(() => {
      connectMongo().catch((err) =>
        console.error("Mongo reconnection failed:", err)
      );
    }, 5000);
  });
}

export async function connectMongo() {
  if (globalStore.conn) return globalStore.conn;

  if (!globalStore.promise) {
    const uri = resolveMongoUri();
    console.log("Connecting to MongoDB:", uri);

    globalStore.promise = mongoose.connect(uri, {
      maxPoolSize: 20,
    });
  }

  try {
    globalStore.conn = await globalStore.promise;
    attachLogging(mongoose.connection);
    console.log(
      `||==|| --> Successfully connected to ${mongoose.connection.name}`
    );
  } catch (err) {
    globalStore.promise = null;
    throw err;
  }

  return globalStore.conn;
}
