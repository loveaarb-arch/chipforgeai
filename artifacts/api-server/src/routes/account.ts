import { clerkClient } from "@clerk/express";
import { Router, type IRouter } from "express";
import { hasComplimentaryAccess } from "../lib/accountAccess";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/account/access", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const ownerEmailSha256 = process.env.OWNER_ACCESS_EMAIL_SHA256;

  // An unconfigured exemption must not grant access to anyone.
  if (!ownerEmailSha256?.trim()) {
    res.json({ complimentaryAccess: false });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(req.userId!);
    res.json({
      complimentaryAccess: hasComplimentaryAccess(user.emailAddresses, ownerEmailSha256),
    });
  } catch {
    // Don't include account details or authentication data in logs/responses.
    req.log.warn("Unable to verify complimentary account access");
    res.status(503).json({ error: "Account access verification is unavailable. Please try again." });
  }
});

export default router;