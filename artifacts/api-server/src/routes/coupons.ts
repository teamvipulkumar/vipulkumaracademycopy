import { Router } from "express";
import { db } from "@workspace/db";
import { couponsTable, coursesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

router.get("/", requireAdmin, async (req, res): Promise<void> => {
  const coupons = await db.select().from(couponsTable).orderBy(couponsTable.createdAt);
  res.json(coupons.map(c => ({ ...c, discountValue: parseFloat(String(c.discountValue)) })));
});

router.post("/", requireAdmin, async (req, res): Promise<void> => {
  const { code, discountType, discountValue, maxUses, expiresAt, courseId } = req.body;
  if (!code || !discountType || discountValue === undefined) {
    res.status(400).json({ error: "code, discountType, and discountValue are required" });
    return;
  }
  const [coupon] = await db.insert(couponsTable).values({
    code: code.toUpperCase(), discountType, discountValue: String(discountValue),
    maxUses: maxUses || null, expiresAt: expiresAt ? new Date(expiresAt) : null,
    courseId: courseId || null, isActive: true,
  }).returning();
  res.status(201).json({ ...coupon, discountValue: parseFloat(String(coupon.discountValue)) });
});

router.post("/validate", async (req, res): Promise<void> => {
  const { code, courseId } = req.body;
  if (!code || !courseId) { res.status(400).json({ error: "code and courseId required" }); return; }

  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, code.toUpperCase())).limit(1);
  if (!coupon || !coupon.isActive) { res.json({ valid: false, message: "Invalid or inactive coupon" }); return; }
  if (coupon.expiresAt && coupon.expiresAt < new Date()) { res.json({ valid: false, message: "Coupon has expired" }); return; }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) { res.json({ valid: false, message: "Coupon usage limit reached" }); return; }
  if (coupon.courseId && coupon.courseId !== courseId) { res.json({ valid: false, message: "Coupon not valid for this course" }); return; }

  const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, courseId)).limit(1);
  if (!course) { res.status(404).json({ error: "Course not found" }); return; }

  const price = parseFloat(course.price);
  const discountValue = parseFloat(String(coupon.discountValue));
  const finalPrice = coupon.discountType === "percentage" ? price * (1 - discountValue / 100) : Math.max(0, price - discountValue);

  res.json({ valid: true, discountType: coupon.discountType, discountValue, finalPrice, message: `Coupon applied! You save ${coupon.discountType === "percentage" ? discountValue + "%" : "$" + discountValue}` });
});

router.delete("/:couponId", requireAdmin, async (req, res): Promise<void> => {
  const couponId = parseInt(req.params.couponId);
  await db.delete(couponsTable).where(eq(couponsTable.id, couponId));
  res.json({ message: "Coupon deleted" });
});

export default router;
