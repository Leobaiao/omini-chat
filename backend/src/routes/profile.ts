import { Router } from "express";
import { z } from "zod";
import { getPool } from "../db.js";
import { authMw } from "../mw.js";
import { hashPassword } from "../auth.js";
import { validateBody } from "../middleware/validateMw.js";

const router = Router();

const ProfileSchema = z.object({
    password: z.string().min(6).optional(),
    avatar: z.string().url().optional().or(z.literal("")),
});

// PUT /api/profile
router.put("/", authMw, validateBody(ProfileSchema), async (req, res, next) => {
    try {
        const user = (req as any).user;
        const body = req.body as z.infer<typeof ProfileSchema>;

        const pool = await getPool();
        const updates: string[] = [];
        const request = pool.request().input("userId", user.userId);

        if (body.password) {
            const hash = await hashPassword(body.password);
            updates.push("PasswordHash = @hash");
            request.input("hash", hash);
        }

        if (body.avatar !== undefined) {
            updates.push("Avatar = @avatar");
            request.input("avatar", body.avatar || null);
        }

        if (updates.length > 0) {
            await request.query(`
        UPDATE omni.[User]
        SET ${updates.join(", ")}
        WHERE UserId = @userId
      `);
        }

        res.json({ ok: true });
    } catch (error) {
        next(error);
    }
});

export default router;
