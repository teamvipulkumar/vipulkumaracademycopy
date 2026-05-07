import { FileText } from "lucide-react";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-16">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-primary uppercase tracking-widest">Legal</span>
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight mb-3">Terms of Service</h1>
        <p className="text-muted-foreground mb-10">Last updated: January 1, 2025</p>

        <div className="prose prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>By accessing or using the ClickOcean platform ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service. These Terms apply to all visitors, users, and others who access the Service.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">2. Eligibility</h2>
            <p>You must be at least 18 years old to create an account and use our paid services. By using the Service, you represent and warrant that you meet this requirement and that all registration information you submit is accurate and truthful.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">3. Account Registration</h2>
            <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to notify us immediately of any unauthorized access. We reserve the right to terminate accounts that violate these Terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">4. Course Purchases & Access</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>All course purchases are for personal, non-commercial use only.</li>
              <li>You may not share, resell, redistribute, or publicly broadcast any course content.</li>
              <li>Access to purchased courses is granted for lifetime personal use on the platform.</li>
              <li>We reserve the right to update or remove course content without notice.</li>
              <li>Course enrollment does not transfer and is non-transferable between accounts.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">5. Prohibited Conduct</h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Download, copy, or reproduce course content without authorization.</li>
              <li>Use the platform for any unlawful or fraudulent purpose.</li>
              <li>Impersonate any person or entity.</li>
              <li>Reverse engineer, decompile, or attempt to extract source code.</li>
              <li>Use automated scripts or bots to access the Service.</li>
              <li>Attempt to gain unauthorized access to any portion of the Service.</li>
              <li>Post or transmit harmful, defamatory, or illegal content.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">6. Payments & Billing</h2>
            <p>All prices are listed in INR (Indian Rupee) unless otherwise specified. By purchasing a course, you authorize us to charge your chosen payment method. All sales are final unless otherwise stated in our Refund Policy. We use third-party payment processors and do not store your full payment details.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">7. Affiliate Program</h2>
            <p>Participation in our affiliate program is subject to the Affiliate Program Terms. Commissions are earned on eligible purchases made through your referral link. We reserve the right to modify commission rates or terminate the program with reasonable notice. Fraudulent activity will result in immediate disqualification and forfeiture of unpaid commissions.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">8. Intellectual Property</h2>
            <p>All content on the platform — including courses, videos, text, graphics, logos, and software — is the property of ClickOcean or its content creators and is protected by applicable intellectual property laws. You are granted a limited, non-exclusive, non-transferable license to access and view the content for personal, non-commercial purposes only.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">9. Disclaimer of Warranties</h2>
            <p>The Service is provided "as is" and "as available" without any warranties, express or implied. We do not warrant that the Service will be uninterrupted, error-free, or free of viruses. We do not guarantee any specific results from use of the courses. Individual results will vary.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">10. Limitation of Liability</h2>
            <p>To the fullest extent permitted by law, ClickOcean shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service, even if advised of the possibility of such damages. Our total liability shall not exceed the amount paid by you in the last 12 months.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">11. Termination</h2>
            <p>We may suspend or terminate your access to the Service at any time, without notice, for conduct that violates these Terms or is harmful to other users, us, or third parties. Upon termination, your right to use the Service will immediately cease.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">12. Governing Law</h2>
            <p>These Terms shall be governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts located in India. If any provision of these Terms is held invalid, the remaining provisions remain in full effect.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">13. Changes to Terms</h2>
            <p>We reserve the right to modify these Terms at any time. We will provide notice of significant changes by updating the date at the top of this page. Continued use of the Service after changes constitutes your acceptance of the new Terms.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-foreground mb-3">14. Contact</h2>
            <address className="mt-3 not-italic border border-border rounded-xl p-5 bg-card/50 text-sm space-y-1">
              <p className="font-semibold text-foreground">ClickOcean</p>
              <p>Email: <a href="mailto:legal@vipulkumaracademy.com" className="text-primary hover:underline">legal@vipulkumaracademy.com</a></p>
            </address>
          </section>
        </div>
      </div>
    </div>
  );
}
