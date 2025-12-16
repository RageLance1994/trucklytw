import jwt from "jsonwebtoken";
import { serverEnv } from "./env";

export type AccessPayload = {
  id: string;
  email: string;
  role: string;
};

export const signAccess = (payload: AccessPayload) =>
  jwt.sign(payload, serverEnv.jwtAccessSecret, {
    expiresIn: serverEnv.accessExpires,
  });

export const signRefresh = (payload: AccessPayload) =>
  jwt.sign(payload, serverEnv.jwtRefreshSecret, {
    expiresIn: serverEnv.refreshExpires,
  });

export const verifyAccess = (token: string) =>
  jwt.verify(token, serverEnv.jwtAccessSecret) as AccessPayload;

export const verifyRefresh = (token: string) =>
  jwt.verify(token, serverEnv.jwtRefreshSecret) as AccessPayload;
