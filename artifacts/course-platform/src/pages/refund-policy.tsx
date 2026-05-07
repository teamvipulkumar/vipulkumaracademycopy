import { RefreshCw } from "lucide-react";

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-16">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-primary uppercase tracking-widest">Legal</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-3">Refund Policy</h1>
        <p className="text-muted-foreground mb-10">Last updated: January 1, 2025</p>

        {/* Summary card */}
        <div className="mb-10 rounded-2xl border border-primary/20 bg-primary/5 p-6">
          <p className="text-sm font-semibold text-primary mb-1">Quick Summary</p>
          <p className="text-sm text-muted-foreground">We offer a <strong className="text-foreground">7-day full refund</strong> on all course purchases — no questions asked. After 7 days, refunds are evaluated on a case-by-case basis. Read below for full details.</p>
        </div>

        <div className="prose prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">1. Our Commitment</h2>
            <p>At ClickOcean, we stand behind the quality of our courses. If you are not satisfied with your purchase, we want to make it right. This policy outlines the conditions under which you may request a refund.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">2. 7-Day Money-Back Guarantee</h2>
            <p>You may request a full refund within <strong className="text-foreground">7 calendar days</strong> of your course purchase date, provided:</p>
            <ul className="list-disc pl-5 mt-3 space-y-1.5">
              <li>You have not completed more than 30% of the course content.</li>
              <li>You have not downloaded any course materials or resources.</li>
              <li>The request is made within the 7-day window from the original purchase date.</li>
            </ul>
            <p className="mt-3">Refunds under the 7-day guarantee are processed without requiring a reason, though feedback is appreciated.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">3. Refunds After 7 Days</h2>
            <p>After the 7-day window has passed, refunds may be considered in exceptional circumstances:</p>
            <ul className="list-disc pl-5 mt-3 space-y-1.5">
              <li><strong className="text-foreground">Technical Issues:</strong> If a documented technical error on our platform prevented you from accessing the course content you paid for.</li>
              <li><strong className="text-foreground">Duplicate Purchase:</strong> If you accidentally purchased the same course twice, we will refund the duplicate.</li>
              <li><strong className="text-foreground">Misrepresentation:</strong> If the course content substantially differs from its advertised description.</li>
            </ul>
            <p className="mt-3">These requests will be reviewed individually and approved at our sole discretion.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">4. Non-Refundable Items</h2>
            <p>The following are not eligible for refunds:</p>
            <ul className="list-disc pl-5 mt-3 space-y-1.5">
              <li>Courses where more than 30% of the content has been completed.</li>
              <li>Courses purchased using promotional coupons or during special sale events (unless otherwise stated).</li>
              <li>Affiliate commission earnings.</li>
              <li>Any course purchased after a previous refund on the same course.</li>
              <li>Subscription plans (if applicable) after the plan period has begun.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">5. How to Request a Refund</h2>
            <p>To request a refund:</p>
            <ol className="list-decimal pl-5 mt-3 space-y-1.5">
              <li>Email us at <a href="mailto:support@vipulkumaracademy.com" className="text-primary hover:underline">support@vipulkumaracademy.com</a> with the subject line <strong className="text-foreground">"Refund Request – [Course Name]"</strong>.</li>
              <li>Include your registered email address, order/payment ID, and the reason for your request.</li>
              <li>Our team will respond within 2 business days.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">6. Refund Processing</h2>
            <p>Once a refund is approved:</p>
            <ul className="list-disc pl-5 mt-3 space-y-1.5">
              <li>The refund will be credited to the original payment method.</li>
              <li>Processing time is typically <strong className="text-foreground">5–10 business days</strong> depending on your bank or payment provider.</li>
              <li>Your access to the refunded course will be revoked upon refund approval.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">7. Chargebacks</h2>
            <p>We encourage you to contact us before initiating a chargeback with your bank. Unauthorized chargebacks may result in account suspension. We will work with you to resolve any payment dispute fairly and promptly.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">8. Contact Us</h2>
            <p>For refund requests or questions about this policy:</p>
            <address className="mt-3 not-italic border border-border rounded-xl p-5 bg-card/50 text-sm space-y-1">
              <p className="font-semibold text-foreground">ClickOcean — Support</p>
              <p>Email: <a href="mailto:support@vipulkumaracademy.com" className="text-primary hover:underline">support@vipulkumaracademy.com</a></p>
              <p>Response time: Within 2 business days</p>
            </address>
          </section>
        </div>
      </div>
    </div>
  );
}
