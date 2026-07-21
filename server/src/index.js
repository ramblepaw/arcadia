import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb } from "./db.js";
import { attachUser } from "./middleware/requireAuth.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { playsRouter } from "./routes/plays.js";
import { healthRouter } from "./routes/health.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const app = express();

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", 1);
}

app.use(express.json());
app.use(cookieParser());

const apiRouter = express.Router();
apiRouter.use(attachUser);
apiRouter.use("/auth", authRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.use(playsRouter);
apiRouter.use("/health", healthRouter);
app.use("/api", apiRouter);

app.use(express.static(repoRoot));

const port = process.env.PORT || 8090;

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`[server] listening on port ${port}, serving ${repoRoot}`);
    });
  })
  .catch((err) => {
    console.error("[server] failed to initialize database", err);
    process.exit(1);
  });
