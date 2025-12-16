const REQUIRED_VARS = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const;

const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required env vars: ${missing.join(", ")}`);
}

export const serverEnv = {
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET as string,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET as string,
  userSecret: process.env.USER_SECRET,
  accessExpires: process.env.ACCESS_EXPIRES || "24h",
  refreshExpires: process.env.REFRESH_EXPIRES || "7d",
  mongoUri: process.env.MONGO_URI,
  mongoRootUser: process.env.MONGO_ROOT_USER,
  mongoRootPassword: process.env.MONGO_ROOT_PASSWORD,
  mongoHosts: process.env.MONGO_HOSTS,
  mongoDefaultDb: process.env.MONGO_DEFAULT_DB || "test",
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS || 10),
};

export function resolveMongoUri() {
  if (serverEnv.mongoUri) {
    return serverEnv.mongoUri;
  }

  if (
    serverEnv.mongoRootUser &&
    serverEnv.mongoRootPassword &&
    serverEnv.mongoHosts
  ) {
    return `mongodb://${serverEnv.mongoRootUser}:${serverEnv.mongoRootPassword}@${serverEnv.mongoHosts}/${serverEnv.mongoDefaultDb}?authSource=admin`;
  }

  throw new Error(
    "Missing Mongo connection string (MONGO_URI or root credentials)."
  );
}
