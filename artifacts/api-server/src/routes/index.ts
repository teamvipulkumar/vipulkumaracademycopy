import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import coursesRouter from "./courses";
import enrollmentsRouter from "./enrollments";
import lessonsRouter from "./lessons";
import paymentsRouter from "./payments";
import affiliatesRouter from "./affiliates";
import adminRouter from "./admin";
import couponsRouter from "./coupons";
import notificationsRouter from "./notifications";
import analyticsRouter from "./analytics";
import uploadRouter from "./upload";
import crmRouter from "./crm";
import emailTrackingRouter from "./email-tracking";
import gstRouter from "./gst";
import bundlesRouter from "./bundles";
import staffRouter from "./staff";
import pixelRouter from "./pixel";
import creatorRouter, { adminCreatorsRouter, adminCreatorPayoutsRouter } from "./creators";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db";

const router: IRouter = Router();

router.use(healthRouter);

router.get("/pixel-config", async (_req, res): Promise<void> => {
  try {
    const [settings] = await db.select({
      facebookPixelEnabled: platformSettingsTable.facebookPixelEnabled,
      facebookPixelId: platformSettingsTable.facebookPixelId,
      facebookPixelBaseCode: platformSettingsTable.facebookPixelBaseCode,
    }).from(platformSettingsTable).limit(1);
    if (!settings || !settings.facebookPixelEnabled) {
      res.json({ enabled: false, pixelId: null, baseCode: null });
      return;
    }
    res.json({ enabled: true, pixelId: settings.facebookPixelId, baseCode: settings.facebookPixelBaseCode ?? null });
  } catch {
    res.json({ enabled: false, pixelId: null });
  }
});

router.use("/auth", authRouter);
router.use("/courses", coursesRouter);
router.use("/enrollments", enrollmentsRouter);
router.use("/lessons", lessonsRouter);
router.use("/payments", paymentsRouter);
router.use("/affiliate", affiliatesRouter);
router.use("/admin", adminRouter);
router.use("/coupons", couponsRouter);
router.use("/notifications", notificationsRouter);
router.use("/analytics", analyticsRouter);
router.use("/upload", uploadRouter);
router.use("/admin/crm", crmRouter);
router.use("/email", emailTrackingRouter);
router.use("/admin/gst", gstRouter);
router.use("/bundles", bundlesRouter);
router.use("/admin/staff", staffRouter);
router.use("/admin/creators", adminCreatorsRouter);
router.use("/admin/creator-payouts", adminCreatorPayoutsRouter);
router.use("/creator", creatorRouter);
router.use("/pixel", pixelRouter);

export default router;
