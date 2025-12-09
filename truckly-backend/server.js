import "dotenv/config";
import express from "express";
import cors from "cors";
import expressWs from "express-ws";
import User from "./models/User.js"
import registerStream from "./ws/stream.js";
import { startDatabases } from "./utils/database.js";
import authRoutes from "./routes/auth.js";
import vehicleRoutes from "./routes/vehicles.js";

const app = express();
const wsServer = expressWs(app);

// WebSocket endpoints
registerStream(app, wsServer.getWss());

app.use(cors({ origin: "*" }));
app.use(express.json());

app.use("/auth", authRoutes);
app.use("/vehicles", vehicleRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/vehicles", vehicleRoutes);

startDatabases()
  .then(() => {
    const port = process.env.PORT || 5050;
    app.listen(port, () =>
      console.log(`🔌 Backend online su http://localhost:${port}`)
    );

    User.find({}).then((data,err) => {
      console.log(data);
    })

  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  });
