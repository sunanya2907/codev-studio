import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#070709] text-gray-300 py-16 px-6">
      <div className="max-w-3xl mx-auto bg-[#0e0e12] border border-white/10 rounded-2xl p-8 md:p-12 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-6 mb-8">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
              BUILD_CORE LEGAL
            </span>
            <h1 className="text-3xl font-bold text-white mt-1">
              Terms and Conditions
            </h1>
          </div>
          <Link
            href="/orchestrate"
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white border border-white/10 transition"
          >
            ← Back to App
          </Link>
        </div>

        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              1. Acceptance of Terms
            </h2>
            <p>
              By signing in via Google OAuth or accessing Build_Core, you agree to
              be bound by these Terms and Conditions and our Privacy Policy. If you
              do not agree to these terms, you may not access or use our platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              2. Description of Service
            </h2>
            <p>
              Build_Core provides an AI-powered software orchestration and code
              generation platform utilizing multiple AI agents to generate
              architectural specifications, frontend interfaces, backend logic, and
              database schemas.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              3. User Accounts & Google Authentication
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>You must sign in using a valid Google account.</li>
              <li>
                You are responsible for maintaining the security of your account and
                for all activities under your session.
              </li>
              <li>
                You agree not to abuse free-tier trial allocations using multiple
                accounts.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              4. Subscriptions, Token Billing & Refunds
            </h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Subscription Tiers:</strong> We offer Free ($0/month),
                Standard ($9/month), Pro ($49/month), and Exclusive (Custom) plans.
              </li>
              <li>
                <strong>Token Usage:</strong> Each generation consumes tokens from
                your balance. Monthly tokens reset each billing cycle.
              </li>
              <li>
                <strong>Extra Token Top-Ups:</strong> On-demand tokens purchased at
                $1 per token are added immediately to your balance.
              </li>
              <li>
                <strong>Refund Policy:</strong> All subscription charges and token
                top-up purchases are final and non-refundable.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              5. Ownership of Generated Code & Intellectual Property
            </h2>
            <p>
              Subject to Section 6, you retain full ownership and commercial rights
              to the source code, specifications, and exported ZIP files generated
              through your prompts. Build_Core retains all rights in the underlying
              platform, UI, custom system rules, and agent orchestration logic.
            </p>
          </section>

          <section className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <h2 className="text-lg font-semibold text-amber-300 mb-2">
              6. Data Usage & AI Agent Training
            </h2>
            <ul className="list-disc pl-5 space-y-1.5 text-gray-200">
              <li>
                <strong>License to Train AI Models:</strong> By submitting prompts,
                specifications, or code inputs to Build_Core, you grant Build_Core a
                worldwide, non-exclusive, royalty-free, irrevocable, and perpetual
                license to store, analyze, and use your inputs, generation history,
                and resulting code outputs to train, fine-tune, evaluate, and
                improve our AI agents, orchestration algorithms, and platform
                services.
              </li>
              <li>
                <strong>Confidentiality Caution:</strong> Do not input sensitive
                personal data, production API keys, passwords, or proprietary trade
                secrets into prompts unless you consent to such data being used for
                model training and improvement.
              </li>
              <li>
                <strong>Enterprise Opt-Out:</strong> Users on the Exclusive (Custom)
                Plan may request a custom data processing agreement to opt out of AI
                agent training upon written confirmation.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              7. Acceptable Use Policy
            </h2>
            <p>
              You agree not to generate malware, exploit scripts, or harmful code,
              attempt to extract underlying AI system prompts, or abuse API
              endpoints.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              8. AI Output Disclaimer (&quot;As-Is&quot; Basis)
            </h2>
            <p>
              Build_Core provides all generated code, database schemas, and
              specifications &quot;AS IS&quot; without warranties of any kind. You
              are solely responsible for reviewing, testing, and securing any
              generated code before deploying it to production.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">
              9. Limitation of Liability & Termination
            </h2>
            <p>
              Build_Core shall not be liable for any indirect or consequential
              damages arising out of your use of the platform. We reserve the right
              to suspend or terminate accounts that breach these Terms.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}