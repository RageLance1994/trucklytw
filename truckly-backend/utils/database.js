import mongoose from "mongoose";

export async function startDatabases() {
  try {
    const uri =
      process.env.MONGO_URI ||
      (process.env.MONGO_ROOT_USER &&
        process.env.MONGO_ROOT_PASSWORD &&
        process.env.MONGO_HOSTS &&
        `mongodb://${process.env.MONGO_ROOT_USER}:${process.env.MONGO_ROOT_PASSWORD}@${process.env.MONGO_HOSTS}/test?authSource=admin`);

    if (!uri) {
      throw new Error("Missing Mongo connection string (MONGO_URI or root credentials).");
    }

    console.log("Connecting to MongoDB:", uri);

    mongoose.connection.on("connecting", () =>
      console.log("||==|| --> DB Entered connecting state.")
    );

    mongoose.connection.on("error", (err) => {
      console.log("||==|| --> DB Encountered an error. Restarting.", err);
      setTimeout(() => mongoose.disconnect(), 5000);
    });

    mongoose.connection.once("open", () =>
      console.log("||==|| --> MongoDB connection opened!")
    );

    mongoose.connection.on("reconnected", () =>
      console.log("||==|| --> DB reconnected!")
    );

    mongoose.connection.on("disconnected", () => {
      console.log("||==|| --> DB disconnected! Reconnecting...");
      setTimeout(() => mongoose.connect(uri), 5000);
    });

    await mongoose.connect(uri, {
      maxPoolSize: 20,
    });

    console.log(`||==|| --> Successfully connected to ${mongoose.connection.name}`);

    return true;
  } catch (e) {
    console.error("Mongo CONNECTION ERROR:", e);
    throw e;
  }
}
