import { Link } from "wouter";
import { HandshakeIcon, AlertTriangle, BadgeIndianRupee, Users, FileText, Scale, Ban, Clock, Mail, Shield } from "lucide-react";

const SECTIONS = [
  {
    icon: FileText,
    title: "1. Agreement & Eligibility",
    content: [
      {
        heading: "1.1 Acceptance of Terms",
        body: `By registering for, accessing, or participating in the Upcalify Affiliate Program ("Program"), you ("Affiliate") agree to be legally bound by these Affiliate Terms & Conditions ("Agreement"). This Agreement forms a binding contract between you and Upcalify ("Company", "we", "us", or "our"). If you do not agree to any part of this Agreement, you must not participate in the Program.`,
      },
      {
        heading: "1.2 Eligibility Requirements",
        body: "To qualify for the Program, you must: (a) be at least 18 years of age; (b) have a valid, active bank account or UPI handle registered in your own name for payout purposes; (c) have submitted accurate and truthful information during registration; (d) comply with all applicable laws, regulations, and platform policies of any channel you use for promotion; (e) not be a current employee, contractor, or immediate family member of the Company.",
      },
      {
        heading: "1.3 Application & Approval",
        body: "Submission of an affiliate application does not guarantee acceptance. The Company reserves the sole and absolute right to approve or reject any application without providing a reason. Approval may be revoked at any time if the Affiliate is found to be in breach of this Agreement or if the Company determines that continued participation is not in its interest.",
      },
      {
        heading: "1.4 Account Maintenance Fee",
        body: "A one-time, non-refundable Account Maintenance Fee may be charged at the time of application, as displayed on the affiliate registration page. This fee covers platform setup, anti-fraud screening, and dedicated affiliate support. Payment of this fee does not guarantee approval, and the fee will not be refunded in the event of rejection or subsequent termination.",
      },
    ],
  },
  {
    icon: BadgeIndianRupee,
    title: "2. Commission Structure & Payouts",
    content: [
      {
        heading: "2.1 Commission Eligibility",
        body: "Affiliates earn a commission only on successful, completed, and non-refunded purchases made by new customers who: (a) click on the Affiliate's unique referral link within the active cookie window; (b) complete a qualifying purchase during that session or within the tracking window; (c) are not previously registered users of the platform unless the Affiliate's link was their first interaction.",
      },
      {
        heading: "2.2 Commission Rates",
        body: "Commission rates are determined by the Company and communicated to each Affiliate in their dashboard. Rates may vary based on the product, promotional period, or Affiliate tier. The Company reserves the right to modify commission rates at any time with at least 7 days prior notice. Changes do not apply retroactively to sales already completed.",
      },
      {
        heading: "2.3 Cookie & Attribution Window",
        body: "Referral attribution is tracked via browser cookies for the period specified in your affiliate dashboard (default: 30 days from the date of the last click on your referral link). If a customer clears their cookies, uses a different device, or the cookie expires before purchase, no commission will be attributed. Only the last-click Affiliate receives the commission where multiple Affiliates have referred the same customer.",
      },
      {
        heading: "2.4 Minimum Payout Threshold",
        body: "Commissions are paid out once the Affiliate's accumulated balance reaches the minimum payout threshold displayed in the dashboard (default: \u20B9500). Balances below this threshold will roll over to the next payout cycle. The Company shall not be obligated to make payments below this minimum.",
      },
      {
        heading: "2.5 Payout Schedule",
        body: "Eligible commissions are processed as per the payout schedule displayed in the Affiliate dashboard (typically on a weekly or bi-weekly basis). Actual bank transfer timelines may vary based on the payment processor and banking institution. The Company is not liable for delays caused by third-party payment providers or banking systems.",
      },
      {
        heading: "2.6 Deductions & Chargebacks",
        body: "The Company reserves the right to withhold, deduct, or reverse commissions attributable to: (a) refunded or disputed transactions; (b) fraudulent, self-referred, or incentivized purchases; (c) violations of this Agreement; (d) chargebacks initiated by customers. Such deductions will be reflected in the Affiliate's dashboard.",
      },
      {
        heading: "2.7 Account Maintenance Fee Exclusion",
        body: "For absolute clarity: the one-time Account Maintenance Fee paid by an Affiliate upon registration is entirely retained by the Company and does not attract any commission, referral credit, or revenue share for any third party. This fee is solely a platform access charge.",
      },
    ],
  },
  {
    icon: Shield,
    title: "3. Affiliate Obligations & Conduct",
    content: [
      {
        heading: "3.1 Ethical Promotion",
        body: "You agree to promote Company products and services honestly, accurately, and in a manner that reflects positively on the Company brand. All promotional materials, claims, and representations must be truthful, non-deceptive, and substantiated. You must clearly disclose your affiliate relationship in all promotional content in compliance with applicable advertising standards and guidelines (including FTC guidelines or applicable Indian advertising standards).",
      },
      {
        heading: "3.2 Prohibited Promotional Methods",
        body: "The following promotional methods are strictly prohibited and will result in immediate termination and forfeiture of all commissions: (a) spam, unsolicited emails, SMS, or messaging of any kind; (b) use of misleading, false, or exaggerated claims about Company products; (c) cookie stuffing, click fraud, typosquatting, or any form of traffic manipulation; (d) bidding on the Company's brand name, trademarks, or variations thereof in paid search advertising without prior written consent; (e) cloaking affiliate links or disguising the destination of referral traffic; (f) use of fake testimonials, fabricated screenshots, or manufactured social proof; (g) promoting on adult content, hate speech, gambling, illegal, or politically extremist platforms; (h) impersonating the Company, its employees, or any official representative.",
      },
      {
        heading: "3.3 Social Media & Content Guidelines",
        body: "When promoting on social media or any public platform, you must comply with that platform's terms of service. You must not create fake reviews, manipulate ratings, or solicit fake engagements. All content must include an appropriate and visible affiliate disclosure statement such as: #affiliate, #ad, or 'This post contains affiliate links' — or equivalent language mandated by applicable regulations.",
      },
      {
        heading: "3.4 Self-Referrals",
        body: "Self-referrals — purchasing products through your own referral link to earn a commission — are strictly prohibited. The Company employs automated systems to detect self-referrals. Commissions earned via self-referral will be permanently forfeited, and the Affiliate may be terminated from the Program.",
      },
      {
        heading: "3.5 Accuracy of Account Information",
        body: "You are responsible for maintaining accurate and up-to-date account information, including your bank account or UPI details. The Company shall not be responsible for failed payouts resulting from incorrect or outdated payment information provided by you. Any change in payment details must be updated in the dashboard at least 7 days before the next payout cycle.",
      },
    ],
  },
  {
    icon: Users,
    title: "4. Intellectual Property & Branding",
    content: [
      {
        heading: "4.1 License to Use Materials",
        body: "The Company grants you a limited, revocable, non-exclusive, non-transferable license to use the approved promotional materials, logos, banners, and creatives provided in the Affiliate dashboard solely for the purpose of promoting the Company's products and services under this Agreement. This license is valid only during the term of your active participation in the Program.",
      },
      {
        heading: "4.2 Restrictions",
        body: "You may not alter, modify, distort, or create derivative works of any Company branding or materials without prior written approval. You may not use the Company name, logo, or likeness in a way that implies endorsement, partnership, or official affiliation beyond the affiliate relationship. All intellectual property of the Company remains the exclusive property of the Company.",
      },
      {
        heading: "4.3 User-Generated Content",
        body: "Any content you create promoting the Company's products shall not infringe upon the intellectual property, privacy rights, or publicity rights of any third party. You grant the Company a royalty-free license to share, repost, or feature your promotional content (with attribution) across Company-owned channels.",
      },
    ],
  },
  {
    icon: Scale,
    title: "5. Compliance & Legal Obligations",
    content: [
      {
        heading: "5.1 Applicable Laws",
        body: "You agree to comply with all applicable local, national, and international laws and regulations, including but not limited to: data protection and privacy laws (including India's Information Technology Act), consumer protection regulations, anti-spam laws, income tax obligations on earned commissions, and advertising disclosure requirements.",
      },
      {
        heading: "5.2 Tax Responsibilities",
        body: "Commissions paid to you constitute taxable income. You are solely responsible for reporting and remitting all applicable taxes on commissions earned, including income tax and GST (if applicable). The Company may deduct applicable TDS (Tax Deducted at Source) as required under Indian tax law and will issue the appropriate tax certificate (Form 16A or equivalent) where required by law.",
      },
      {
        heading: "5.3 KYC & Verification",
        body: "The Company reserves the right to require KYC (Know Your Customer) verification before processing payouts. This may include providing government-issued photo ID, PAN card, and bank account verification documents. Failure to complete KYC within the stipulated time may result in suspension of payout processing.",
      },
      {
        heading: "5.4 Data Protection",
        body: "You must handle any customer data shared with you in the course of the affiliate relationship in compliance with applicable data protection laws. You must not use customer data for any purpose other than facilitating referrals under this Program. Any breach of data protection obligations may result in immediate termination and legal liability.",
      },
    ],
  },
  {
    icon: Ban,
    title: "6. Prohibited Activities & Fraud Prevention",
    content: [
      {
        heading: "6.1 Zero-Tolerance Fraud Policy",
        body: "The Company maintains a zero-tolerance policy towards affiliate fraud. Fraudulent activity includes, but is not limited to: generating fake clicks or impressions, creating fictitious purchases, using bots or automated tools to inflate performance metrics, manipulating referral attribution systems, or coordinating with other parties to generate illegitimate commissions.",
      },
      {
        heading: "6.2 Monitoring & Auditing",
        body: "The Company employs automated and manual monitoring systems to detect irregular traffic patterns, click fraud, and suspicious conversion activity. The Company may conduct audits of your promotional methods, traffic sources, and conversion quality at any time without notice.",
      },
      {
        heading: "6.3 Consequences of Fraud",
        body: "If fraud is detected or suspected: (a) all pending and future commission payments will be immediately suspended; (b) all fraudulently earned commissions will be permanently forfeited; (c) your affiliate account will be terminated; (d) the Company reserves the right to pursue civil and/or criminal legal action to recover damages, costs, and losses caused by fraudulent activity.",
      },
    ],
  },
  {
    icon: Clock,
    title: "7. Term, Termination & Modification",
    content: [
      {
        heading: "7.1 Term",
        body: "This Agreement begins on the date your affiliate application is approved and continues until terminated by either party.",
      },
      {
        heading: "7.2 Termination by You",
        body: "You may terminate your participation in the Program at any time by submitting a written request via email to the Company. Upon termination, you must immediately cease all use of Company promotional materials and referral links. Any legitimate commissions earned prior to termination will be paid in the next eligible payout cycle, subject to the minimum payout threshold.",
      },
      {
        heading: "7.3 Termination by Company",
        body: "The Company may terminate this Agreement and your participation in the Program immediately and without prior notice for: (a) any breach of this Agreement; (b) fraudulent, deceptive, or unethical conduct; (c) failure to maintain the promotional quality standards expected of affiliates; (d) inactivity for a period exceeding 12 consecutive months; (e) any conduct the Company reasonably determines to be harmful to its brand or business. Upon termination for cause, all unpaid commissions shall be forfeited.",
      },
      {
        heading: "7.4 Modification of Agreement",
        body: "The Company reserves the right to modify any terms of this Agreement, including commission rates, payout schedules, and prohibited practices, at any time. Material changes will be communicated via email or dashboard notification with at least 7 days notice. Continued participation in the Program after the effective date of any modification constitutes acceptance of the revised terms.",
      },
      {
        heading: "7.5 Modification of the Program",
        body: "The Company reserves the right to modify, suspend, or discontinue the Affiliate Program or any part thereof at any time, with or without cause, and with or without notice. The Company shall not be liable to you for any modification, suspension, or discontinuation of the Program.",
      },
    ],
  },
  {
    icon: AlertTriangle,
    title: "8. Disclaimers & Limitation of Liability",
    content: [
      {
        heading: "8.1 No Guarantee of Earnings",
        body: "Participation in the Affiliate Program does not guarantee any specific level of income or earnings. Commission income is entirely dependent on your promotional efforts, market conditions, and customer behavior. The Company makes no representation or warranty regarding the amount of commissions you may earn.",
      },
      {
        heading: `8.2 Disclaimer of Warranties`,
        body: `The Affiliate Program is provided "as is" and "as available". The Company disclaims all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement. The Company does not warrant that the tracking system will be error-free or uninterrupted.`,
      },
      {
        heading: "8.3 Limitation of Liability",
        body: "To the maximum extent permitted by applicable law, the Company's total liability to you for any claim arising from this Agreement shall not exceed the total commissions paid to you in the three (3) months immediately preceding the event giving rise to the claim. In no event shall the Company be liable for indirect, incidental, special, consequential, or punitive damages.",
      },
      {
        heading: "8.4 Indemnification",
        body: "You agree to indemnify, defend, and hold harmless the Company, its officers, directors, employees, agents, and partners from and against any claims, liabilities, damages, losses, costs, or expenses (including reasonable legal fees) arising from: (a) your participation in the Program; (b) your violation of this Agreement; (c) your violation of any applicable law or third-party right; or (d) any content or promotional activity you undertake in connection with the Program.",
      },
    ],
  },
  {
    icon: Scale,
    title: "9. Governing Law & Dispute Resolution",
    content: [
      {
        heading: "9.1 Governing Law",
        body: "This Agreement shall be governed by and construed in accordance with the laws of India, without regard to its conflict of law provisions.",
      },
      {
        heading: "9.2 Dispute Resolution",
        body: "Any dispute, controversy, or claim arising out of or in connection with this Agreement shall first be attempted to be resolved through good-faith negotiation between the parties. If the dispute cannot be resolved within 30 days, it shall be submitted to binding arbitration in accordance with the Arbitration and Conciliation Act, 1996 (India). The seat of arbitration shall be India.",
      },
      {
        heading: "9.3 Jurisdiction",
        body: "Subject to the arbitration clause above, the parties consent to the exclusive jurisdiction of the courts of India for any matters not subject to arbitration. You waive any objection to such jurisdiction based on venue or inconvenient forum.",
      },
    ],
  },
];

export default function AffiliateTermsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/30">
        <div className="max-w-4xl mx-auto px-4 md:px-8 py-14">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <HandshakeIcon className="w-5 h-5 text-primary" />
            </div>
            <span className="text-xs font-semibold text-primary uppercase tracking-widest">Legal</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground mb-3">
            Affiliate Terms &amp; Conditions
          </h1>
          <p className="text-muted-foreground text-sm mb-6 leading-relaxed max-w-2xl">
            These terms govern participation in the Upcalify Affiliate Program. Please read them carefully before registering. By joining the program, you agree to be legally bound by these terms.
          </p>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
              Last updated: May 10, 2026
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              Effective immediately upon approval
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              Governed by Laws of India
            </span>
          </div>
        </div>
      </div>

      {/* Quick nav */}
      <div className="sticky top-[60px] z-10 border-b border-border bg-background/95 backdrop-blur-sm hidden lg:block">
        <div className="max-w-4xl mx-auto px-8">
          <div className="flex items-center gap-1 overflow-x-auto py-3 scrollbar-none">
            {SECTIONS.map((s, i) => (
              <a
                key={i}
                href={`#section-${i}`}
                className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                {s.title.split(". ")[1] ?? s.title}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-12">
        <div className="space-y-12">
          {SECTIONS.map((section, idx) => {
            const Icon = section.icon;
            return (
              <section key={idx} id={`section-${idx}`} className="scroll-mt-28">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">{section.title}</h2>
                </div>
                <div className="space-y-4 pl-0 md:pl-12">
                  {section.content.map((item, j) => (
                    <div key={j} className="border border-border rounded-xl p-5 bg-card/40 hover:bg-card/70 transition-colors">
                      <h3 className="text-sm font-semibold text-foreground mb-2">{item.heading}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {/* Contact section */}
          <section id="contact" className="scroll-mt-28">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">10. Contact Information</h2>
            </div>
            <div className="pl-0 md:pl-12">
              <div className="border border-border rounded-xl p-6 bg-card/40">
                <p className="text-sm text-muted-foreground mb-5">
                  If you have any questions about these Affiliate Terms &amp; Conditions, wish to report a violation, or need to resolve a dispute, please contact us:
                </p>
                <address className="not-italic space-y-2 text-sm">
                  <p className="font-semibold text-foreground text-base">Upcalify</p>
                  <p className="text-muted-foreground">
                    Affiliate Support:{" "}
                    <a href="mailto:affiliate@vipulkumaracademy.com" className="text-primary hover:underline">
                      affiliate@vipulkumaracademy.com
                    </a>
                  </p>
                  <p className="text-muted-foreground">
                    Legal Enquiries:{" "}
                    <a href="mailto:legal@vipulkumaracademy.com" className="text-primary hover:underline">
                      legal@vipulkumaracademy.com
                    </a>
                  </p>
                </address>
              </div>
            </div>
          </section>

          {/* Acknowledgement box */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
            <div className="flex items-start gap-4">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <HandshakeIcon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground mb-1">Your Agreement</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  By registering for or continuing to participate in the Upcalify Affiliate Program, you acknowledge that you have read, understood, and agree to be bound by these Affiliate Terms &amp; Conditions in their entirety. These terms constitute the entire agreement between you and Upcalify with respect to the Affiliate Program and supersede all prior agreements, representations, or understandings.
                </p>
              </div>
            </div>
          </div>

          {/* Back links */}
          <div className="flex flex-wrap gap-4 pt-4 border-t border-border text-sm text-muted-foreground">
            <Link href="/affiliate" className="hover:text-primary transition-colors">&larr; Back to Affiliate Program</Link>
            <span className="text-border">|</span>
            <Link href="/terms-of-service" className="hover:text-primary transition-colors">Terms of Service</Link>
            <span className="text-border">|</span>
            <Link href="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
