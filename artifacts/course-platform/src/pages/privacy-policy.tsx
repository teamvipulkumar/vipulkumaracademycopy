import { Shield } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-16">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-primary uppercase tracking-widest">Legal</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-3">Privacy Policy</h1>
        <p className="text-muted-foreground mb-10">Last updated: January 1, 2025</p>

        <div className="prose prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">1. Introduction</h2>
            <p>ClickOcean ("we", "our", or "us") is committed to protecting your personal information and your right to privacy. This Privacy Policy describes how we collect, use, and share information about you when you use our platform, website, and services.</p>
            <p className="mt-3">By accessing or using our services, you agree to the terms of this Privacy Policy. If you do not agree, please discontinue use of our services.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">2. Information We Collect</h2>
            <p className="mb-3">We collect information you provide directly to us, including:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong className="text-foreground">Account Information:</strong> Name, email address, and password when you create an account.</li>
              <li><strong className="text-foreground">Payment Information:</strong> Billing details, card information (processed securely via our payment partners; we do not store raw card data).</li>
              <li><strong className="text-foreground">Profile Data:</strong> Any information you voluntarily add to your profile.</li>
              <li><strong className="text-foreground">Usage Data:</strong> Course progress, lesson completions, quiz scores, and learning activity.</li>
              <li><strong className="text-foreground">Communications:</strong> Messages sent to our support team or community.</li>
            </ul>
            <p className="mt-4">We also collect information automatically, such as IP address, browser type, device identifiers, pages visited, and referring URLs, through cookies and similar tracking technologies.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>To provide, operate, and improve our platform and courses.</li>
              <li>To process transactions and send related information (receipts, reminders).</li>
              <li>To personalize your learning experience and course recommendations.</li>
              <li>To send promotional communications (you may opt out at any time).</li>
              <li>To monitor and analyze usage patterns to improve the platform.</li>
              <li>To detect, prevent, and address technical issues or fraudulent activity.</li>
              <li>To comply with legal obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">4. Sharing Your Information</h2>
            <p className="mb-3">We do not sell your personal information. We may share information with:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong className="text-foreground">Service Providers:</strong> Third parties who perform services on our behalf (payment processing, email delivery, analytics, cloud hosting).</li>
              <li><strong className="text-foreground">Affiliate Program:</strong> Aggregated, non-identifiable referral data shared with affiliates.</li>
              <li><strong className="text-foreground">Legal Requirements:</strong> When required by law, regulation, or valid legal process.</li>
              <li><strong className="text-foreground">Business Transfers:</strong> In connection with a merger, sale, or acquisition of all or a portion of our company.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">5. Cookies & Tracking Technologies</h2>
            <p>We use cookies and similar tracking technologies to track activity on our services and retain certain information. You can instruct your browser to refuse all cookies or indicate when a cookie is being sent. However, some features may not function properly without cookies.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">6. Data Retention</h2>
            <p>We retain your personal information for as long as your account is active or as needed to provide services, comply with legal obligations, resolve disputes, and enforce agreements. You may request deletion of your account and associated data by contacting us.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">7. Your Rights</h2>
            <p className="mb-3">Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Access the personal information we hold about you.</li>
              <li>Correct inaccurate or incomplete data.</li>
              <li>Request deletion of your data.</li>
              <li>Object to or restrict certain processing.</li>
              <li>Data portability where applicable.</li>
              <li>Withdraw consent at any time.</li>
            </ul>
            <p className="mt-3">To exercise these rights, contact us at <a href="mailto:privacy@vipulkumaracademy.com" className="text-primary hover:underline">privacy@vipulkumaracademy.com</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">8. Security</h2>
            <p>We implement industry-standard technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the Internet or electronic storage is 100% secure.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">9. Children's Privacy</h2>
            <p>Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If you believe a child has provided us information, please contact us immediately.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">10. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new policy on this page and updating the "Last updated" date. Continued use after changes constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">11. Contact Us</h2>
            <p>If you have questions about this Privacy Policy, please contact us at:</p>
            <address className="mt-3 not-italic border border-border rounded-xl p-5 bg-card/50 text-sm space-y-1">
              <p className="font-semibold text-foreground">ClickOcean</p>
              <p>Email: <a href="mailto:privacy@vipulkumaracademy.com" className="text-primary hover:underline">privacy@vipulkumaracademy.com</a></p>
              <p>Website: <a href="https://vipulkumaracademy.com" className="text-primary hover:underline">vipulkumaracademy.com</a></p>
            </address>
          </section>
        </div>
      </div>
    </div>
  );
}
