import { NextRequest, NextResponse } from "next/server";
import { connectMongo } from "@/lib/server/mongo";
import { UserService } from "@/lib/server/services/UserService";
import { signAccess, signRefresh } from "@/lib/server/jwt";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  await connectMongo();

  const user = await UserService.findByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const valid = await UserService.validatePassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const payload = { id: user._id.toString(), email: user.email, role: user.role };
  const accessToken = signAccess(payload);
  const refreshToken = signRefresh(payload);

  const response = NextResponse.json({
    accessToken,
    refreshToken,
    user: payload,
  });

  response.cookies.set("accessToken", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  response.cookies.set("refreshToken", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return response;
}
