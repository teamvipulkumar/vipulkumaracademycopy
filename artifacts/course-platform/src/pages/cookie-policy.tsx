import { Cookie } from "lucide-react";

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-16">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Cookie className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-primary uppercase tracking-widest">Legal</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-3">Cookie Policy</h1>
        <p className="text-muted-foreground mb-10">Last updated: January 1, 2025</p>

        <div className="prose prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">1. What Are Cookies?</h2>
            <p>Cookies are small text files placed on your device when you visit a website. They are widely used to make websites work, function more efficiently, and provide information to website owners. Cookies allow the site to recognize your device and remember certain information about your preferences or actions.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">2. How We Use Cookies</h2>
            <p>ClickOcean uses cookies and similar tracking technologies to:</p>
            <ul className="list-disc pl-5 mt-3 space-y-1.5">
              <li>Keep you signed in and maintain your session security.</li>
              <li>Remember your preferences (language, display settings).</li>
              <li>Track course progress and learning activity.</li>
              <li>Analyze how our platform is used to improve the experience.</li>
              <li>Serve relevant content and course recommendations.</li>
              <li>Measure the effectiveness of our marketing campaigns.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">3. Types of Cookies We Use</h2>

            <div className="space-y-5 mt-3">
              <div className="border border-border rounded-xl p-4 bg-card/40">
                <h3 className="font-semibold text-foreground mb-1">Essential Cookies</h3>
                <p className="text-sm">Required for the platform to function. These include session management, authentication tokens, and security cookies. You cannot opt out of these without disabling the platform.</p>
              </div>
              <div className="border border-border rounded-xl p-4 bg-card/40">
                <h3 className="font-semibold text-foreground mb-1">Functional Cookies</h3>
                <p className="text-sm">Enable enhanced functionality such as remembering your login state, course bookmarks, and UI preferences. Disabling these may affect your experience.</p>
              </div>
              <div className="border border-border rounded-xl p-4 bg-card/40">
                <h3 className="font-semibold text-foreground mb-1">Analytics Cookies</h3>
                <p className="text-sm">Used to understand how visitors interact with our platform (pages visited, time spent, features used). We use this data to improve our services. These cookies collect anonymous data.</p>
              </div>
              <div className="border border-border rounded-xl p-4 bg-card/40">
                <h3 className="font-semibold text-foreground mb-1">Marketing Cookies</h3>
                <p className="text-sm">Used to deliver relevant advertisements and track campaign performance. These may be set by third-party advertising partners and track your activity across websites.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">4. Third-Party Cookies</h2>
            <p>Some cookies are placed by third-party services that appear on our pages. We use services such as:</p>
            <ul className="list-disc pl-5 mt-3 space-y-1.5">
              <li><strong className="text-foreground">Google Analytics</strong> — website traffic analysis</li>
              <li><strong className="text-foreground">Stripe / Razorpay</strong> — payment processing</li>
              <li><strong className="text-foreground">Video hosting providers</strong> — embedded video players (Bunny Stream, etc.)</li>
            </ul>
            <p className="mt-3">These third parties have their own privacy and cookie policies. We do not control cookies set by these services.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">5. Managing Cookies</h2>
            <p>Most web browsers allow you to manage cookies through their settings. You can:</p>
            <ul className="list-disc pl-5 mt-3 space-y-1.5">
              <li>View cookies currently stored on your device.</li>
              <li>Block cookies from specific or all websites.</li>
              <li>Delete all or selected cookies.</li>
            </ul>
            <p className="mt-3">Note that blocking essential cookies will prevent you from signing in and using core features of the platform. To manage cookies, visit your browser's preferences or settings menu.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">6. Cookie Retention</h2>
            <p>Session cookies are deleted when you close your browser. Persistent cookies remain on your device for a set period (typically 30 days to 2 years) or until you delete them manually.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">7. Updates to This Policy</h2>
            <p>We may update this Cookie Policy from time to time to reflect changes in technology, legislation, or our data practices. We will post any changes on this page and update the "Last updated" date.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">8. Contact Us</h2>
            <address className="mt-3 not-italic border border-border rounded-xl p-5 bg-card/50 text-sm space-y-1">
              <p className="font-semibold text-foreground">ClickOcean</p>
              <p>Email: <a href="mailto:privacy@vipulkumaracademy.com" className="text-primary hover:underline">privacy@vipulkumaracademy.com</a></p>
            </address>
          </section>
        </div>
      </div>
    </div>
  );
}
