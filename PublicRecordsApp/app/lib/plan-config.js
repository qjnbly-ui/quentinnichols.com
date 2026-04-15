export const PLAN_ORDER = ["free", "starter", "organization"];

export const PLAN_CONFIG = {
  free: {
    id: "free",
    name: "Free",
    priceLabel: "$0/month",
    documentLimit: 25,
    summary: "A simple private archive for getting started.",
    features: [
      "25 private documents",
      "Email/password sign-in",
      "Upload, search, preview, download",
      "Manual billing upgrades in Supabase for now",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceLabel: "$24/month",
    documentLimit: 250,
    summary: "More room for active boards and recurring record sets.",
    features: [
      "250 private documents",
      "Same private archive workflow",
      "More headroom for monthly uploads",
      "Stripe-ready account metadata",
    ],
  },
  organization: {
    id: "organization",
    name: "Organization",
    priceLabel: "$89/month",
    documentLimit: 2500,
    summary: "Higher-volume records management with room to grow.",
    features: [
      "2,500 private documents",
      "Built for larger ongoing archives",
      "Prepared for future billing sync",
      "Prepared for future organization expansion",
    ],
  },
};

export function getPlanConfig(planId) {
  return PLAN_CONFIG[planId] || PLAN_CONFIG.free;
}

export function formatPlanName(planId) {
  return getPlanConfig(planId).name;
}
