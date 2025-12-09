import { signAccess, signRefresh } from "../config/jwt.js";
import { UserService } from "../services/UserService.js";

export const AuthController = {
  async login(req, res) {
    const { email, password } = req.body;

    const user = await UserService.findByEmail(email);
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await UserService.validatePassword(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Wrong password" });

    const payload = { id: user._id.toString(), email: user.email, role: user.role };

    return res.json({
      accessToken: signAccess(payload),
      refreshToken: signRefresh(payload),
      user: payload,
    });
  },
};
