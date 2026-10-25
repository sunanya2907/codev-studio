import type { PaymentProvider } from "@/lib/plans";

// Browser-side helper shared by the editor's pricing modal and the /pricing page.

export type CheckoutRequest =
  | { action: "PLAN"; plan: string }
  | { action: "TOKENS"; tokens: number }
  | { action: "PORTAL" };

export type CheckoutResult =
  | { kind: "redirect" } // browser is being sent to Stripe
  | { kind: "switched" } // existing subscription was changed; webhook updates the plan
  | { kind: "demo"; tier: string; tokenBalance: number } // Stripe not configured (local dev only)
  | { kind: "error"; error: string };

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

/** "Exclusive" is custom-priced: it opens an email instead of a checkout. */
export function contactForExclusive() {
  const subject = encodeURIComponent("Build_Core Exclusive plan");
  window.location.href = CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}?subject=${subject}` : "/";
}

async function readJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return { error: `Server error (${res.status}). Please try again.` };
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const el = document.createElement("script");
    el.src = "https://checkout.razorpay.com/v1/checkout.js";
    el.onload = () => resolve(true);
    el.onerror = () => resolve(false);
    document.body.appendChild(el);
  });
}

/** Razorpay: UPI (GPay / PhonePe / Paytm / FamPay ...), cards, wallets, netbanking. */
async function startRazorpay(req: CheckoutRequest): Promise<CheckoutResult> {
  if (req.action === "PORTAL") {
    return { kind: "error", error: "Razorpay plans are prepaid for 30 days; just pay again to renew." };
  }
  try {
    const res = await fetch("/api/razorpay/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        req.action === "PLAN" ? { action: "PLAN", plan: req.plan } : { action: "TOKENS", tokens: req.tokens }
      ),
    });
    const order = await readJson(res);
    if (!res.ok) return { kind: "error", error: order.error || "Could not start the payment." };
    if (!(await loadRazorpayScript())) {
      return { kind: "error", error: "Could not load Razorpay. Check your connection and retry." };
    }

    // Resolves when the user pays, closes the popup, or the payment fails.
    return await new Promise<CheckoutResult>((resolve) => {
      const rzp = new (window as any).Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        name: order.name,
        description: order.description,
        prefill: order.prefill,
        theme: { color: "#f59e0b" },
        handler: async (response: any) => {
          const v = await fetch("/api/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
          const out = await readJson(v);
          if (!v.ok) return resolve({ kind: "error", error: out.error || "Verification failed." });
          // The editor reloads billing on this flag (same flow as Stripe's success redirect).
          window.location.href = "/orchestrate?checkout=success";
          resolve({ kind: "redirect" });
        },
        modal: { ondismiss: () => resolve({ kind: "error", error: "Payment cancelled." }) },
      });
      rzp.on("payment.failed", (r: any) =>
        resolve({ kind: "error", error: r?.error?.description || "Payment failed." })
      );
      rzp.open();
    });
  } catch {
    return { kind: "error", error: "Network error. Please try again." };
  }
}

export async function startCheckout(
  req: CheckoutRequest,
  provider: PaymentProvider = "stripe"
): Promise<CheckoutResult> {
  if (provider === "razorpay") return startRazorpay(req);
  try {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    const data = await readJson(res);

    if (res.ok && data.url) {
      window.location.href = data.url;
      return { kind: "redirect" };
    }
    if (res.ok && data.switched) return { kind: "switched" };

    // No Stripe keys (e.g. localhost): fall back to the free demo billing endpoint.
    if (data.code === "STRIPE_NOT_CONFIGURED" && req.action !== "PORTAL") {
      const demoRes = await fetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          req.action === "PLAN"
            ? { action: "UPGRADE_PLAN", plan: req.plan }
            : { action: "BUY_TOKENS", extraTokens: req.tokens }
        ),
      });
      const demo = await readJson(demoRes);
      if (demoRes.ok) {
        return { kind: "demo", tier: demo.tier, tokenBalance: demo.tokenBalance };
      }
      return { kind: "error", error: demo.error || "Payments are not available yet." };
    }

    return { kind: "error", error: data.error || "Could not start the payment." };
  } catch {
    return { kind: "error", error: "Network error. Please try again." };
  }
}
