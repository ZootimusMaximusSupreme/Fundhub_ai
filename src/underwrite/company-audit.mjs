// Company name, industry-code, shell-LLC, website, and LinkedIn check.
//
// Suggestions only. Nothing here renames a company or blocks a payment.
//
// The code list is the one written under "NAICS Codes" in
// credentials/notion-scrape/output/nov-datapoint-drop-cca-network--29ac3aa7/FULL.md.
// The risky-industry words are from
// credentials/notion-scrape/output/low-risk-business--b6d65efe/FULL.md.
// The name flags are from
// credentials/notion-scrape/output/using-aged-corps--1e5c3aa7/FULL.md
// ("Low-risk NAICS + neutral name" / "Any hint of real-estate flipping, crypto, trucking, investing").
//
// Shell LLC rule — owner-set 2026-09-27: open shells outside the operating
// business (minimum two, one new each quarter), sole member not a trust,
// blank basic name, Arizona for out-of-state shells ($90, no yearly fee),
// with a short how-to for people who do not live in Arizona.
//
// Website + LinkedIn — owner-set 2026-09-27: no scanner, no paid website API.
// They need a website (Alec: banks check online presence). Always recommend a
// LinkedIn business profile because lenders like to see it.

export const APPROVED_NAICS = Object.freeze([
  Object.freeze({ code: "611000", label: "Education" }),
  Object.freeze({ code: "541613", label: "Marketing" }),
  Object.freeze({ code: "541000", label: "Technology" }),
  Object.freeze({ code: "454100", label: "eCommerce" }),
  Object.freeze({ code: "541611", label: "Consulting" }),
  Object.freeze({ code: "531311", label: "Residential" })
]);

/** Automatic decline in the low-risk business notes. */
const RESTRICTED_WORDS = Object.freeze([
  ["ammunition", "ammunition manufacturing"],
  ["bail bond", "bail bonds"],
  ["energy trading", "energy trading"],
  ["loan broker", "loan brokering"],
  ["gambling", "gambling"],
  ["casino", "gambling"],
  ["political campaign", "a political campaign"],
  ["x-rated", "adult entertainment"],
  ["adult entertainment", "adult entertainment"]
]);

/** Stricter underwriting in the same notes, plus the aged-corp name flags. */
const HIGH_RISK_WORDS = Object.freeze([
  ["real estate", "real estate"],
  ["flipping", "real-estate flipping"],
  ["crypto", "crypto"],
  ["trucking", "trucking"],
  ["truck", "trucking"],
  ["investing", "investing"],
  ["investment", "investing"],
  ["agriculture", "agriculture"],
  ["auto sales", "auto sales"],
  ["car dealer", "auto sales"],
  ["courier", "courier services"],
  ["dry cleaner", "dry cleaners"],
  ["contractor", "general contracting"],
  ["nursing home", "nursing homes"],
  ["hotel", "hotels"],
  ["motel", "motels"],
  ["jewelry", "jewelry"],
  ["limousine", "limousine services"],
  ["limo", "limousine services"],
  ["restaurant", "restaurants"],
  ["software", "software"]
]);

const NEUTRAL_EXAMPLES = "Consulting, Marketing, or Systems";

/** Standing shell-LLC copy — owner-set 2026-09-27. Shown once per file. */
export const SHELL_LLC_SUGGESTION_TEXT =
  "Open shell LLCs outside your operating business. Keep at least two. " +
  "Open one new shell LLC each quarter. File each as a sole member — one owner. " +
  "Do not open them under a trust; two owners makes it harder. " +
  "Use a blank, basic, standard name with no fancy or risky words. " +
  "For an out-of-state shell, open it in Arizona. You do not have to live in Arizona. " +
  "File the LLC with the state of Arizona. The $90 is the Arizona state filing fee, and Arizona has no yearly fee. " +
  "Keep one owner. Do not use a trust. Use a basic name. " +
  "This shell is separate from the company you already run in your home state. " +
  "A filing helper such as Northwest Registered Agent can file the Arizona LLC for you. " +
  "If the shell is not in your home state, also foreign-file it into your home state so it is registered where you live.";

export const SHELL_LLC_SUGGESTION_WHY =
  "This is the standing Fundhub rule for shell LLCs. " +
  "Extra companies outside the operating business help funding. " +
  "The file cannot tell a shell from an operating company, so this rule is shown once " +
  "whether you have no company or already have one.";

/** Standing website copy — owner-set 2026-09-27. No scanner. Shown once per file. */
export const WEBSITE_SUGGESTION_TEXT =
  "You need a website. Set one up. It is simple. Put the business on it.";

export const WEBSITE_SUGGESTION_WHY =
  "Banks check that you exist online. " +
  "Alec's notes say: maintain a basic website tied to the domain — banks often check online presence. " +
  "Fundhub does not scan the site and does not call a paid website API. The rule is simply that they need one.";

/** Standing LinkedIn copy — owner-set 2026-09-27. Shown once per file. */
export const LINKEDIN_SUGGESTION_TEXT =
  "Put the business on LinkedIn as a business profile.";

export const LINKEDIN_SUGGESTION_WHY =
  "Lenders like to see that the person has a business profile on LinkedIn. " +
  "Owner-set 2026-09-27.";

function digits(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d || null;
}

function approvedByCode(code) {
  return APPROVED_NAICS.find((row) => row.code === code) || null;
}

function hits(text, pairs) {
  const hay = ` ${String(text || "").toLowerCase()} `;
  const found = [];
  for (const [needle, label] of pairs) {
    if (hay.includes(needle)) found.push(label);
  }
  return [...new Set(found)];
}

/**
 * auditCompany — one saved company.
 * @returns {object} name and industry suggestions. change is false when nothing is wrong.
 */
export function auditCompany({ name = "", naics = null } = {}) {
  const company = String(name || "").trim();
  const code = digits(naics);
  const approved = code ? approvedByCode(code) : null;
  const nameFlags = [
    ...hits(company, RESTRICTED_WORDS),
    ...hits(company, HIGH_RISK_WORDS)
  ];
  const uniqueFlags = [...new Set(nameFlags)];

  let naicsSuggestion;
  if (!code) {
    naicsSuggestion = {
      change: true,
      from: null,
      status: "missing",
      why: "This company has no industry code. The company step cannot move on without one. Pick a code from the low-risk list.",
      pick: APPROVED_NAICS.map((row) => ({ code: row.code, label: row.label }))
    };
  } else if (!approved) {
    naicsSuggestion = {
      change: true,
      from: code,
      status: "not_on_list",
      why: `${code} is not on the low-risk list. A risky industry makes a lender more likely to say no. Pick a code from that list instead.`,
      pick: APPROVED_NAICS.map((row) => ({ code: row.code, label: row.label }))
    };
  } else {
    naicsSuggestion = {
      change: false,
      from: code,
      status: "approved",
      label: approved.label,
      why: `${code} ${approved.label} is on the low-risk list.`,
      pick: []
    };
  }

  const restrictedInName = hits(company, RESTRICTED_WORDS);
  let nameSuggestion;
  if (!company || uniqueFlags.length === 0) {
    nameSuggestion = {
      change: false,
      from: company || null,
      flags: [],
      why: company ? "The name does not use a flagged word." : "No company name is saved.",
      suggestion: null
    };
  } else {
    const listed = uniqueFlags.join(", ");
    const why = restrictedInName.length
      ? `The name says ${listed}. Those industries are an automatic no in the low-risk notes. A neutral name does not name that work. Examples used for a low-risk filing are ${NEUTRAL_EXAMPLES}.`
      : `The name says ${listed}. The aged-corp notes say a high-risk name, or any hint of real estate, crypto, trucking, or investing, leads to denials. A neutral name does not name that work. Examples used for a low-risk filing are ${NEUTRAL_EXAMPLES}.`;
    nameSuggestion = {
      change: true,
      from: company,
      flags: uniqueFlags,
      why,
      suggestion: `Take ${listed} out of the name. Use a neutral name such as ${NEUTRAL_EXAMPLES}.`
    };
  }

  return { name: company || null, naics: code, nameSuggestion, naicsSuggestion };
}

/**
 * shellLlcSuggestion — standing shell-LLC rule for the whole file.
 * Shown for people with no company and people with companies. The saved
 * company list cannot tell shells from operating companies, so this is
 * always the standing rule once — never "open two more on top" of an
 * unknown stack.
 */
export function shellLlcSuggestion({ companyCount = 0 } = {}) {
  const count = Number.isFinite(companyCount) ? Math.max(0, Math.floor(companyCount)) : 0;
  return {
    change: true,
    status: "standing_rule",
    companyCount: count,
    canTellShellsApart: false,
    why: SHELL_LLC_SUGGESTION_WHY,
    suggestion: SHELL_LLC_SUGGESTION_TEXT
  };
}

/** Standing website rule — always shown once. No scan. No vendor call. */
export function websiteSuggestion() {
  return {
    change: true,
    status: "standing_rule",
    why: WEBSITE_SUGGESTION_WHY,
    suggestion: WEBSITE_SUGGESTION_TEXT
  };
}

/** Standing LinkedIn business-profile rule — always shown once. */
export function linkedInSuggestion() {
  return {
    change: true,
    status: "standing_rule",
    why: LINKEDIN_SUGGESTION_WHY,
    suggestion: LINKEDIN_SUGGESTION_TEXT
  };
}

export function auditCompanies(businesses = []) {
  const rows = Array.isArray(businesses) ? businesses : [];
  const companies = rows.map((row) => {
    const entity = row?.entity_data && typeof row.entity_data === "object" ? row.entity_data : {};
    return auditCompany({
      name: row?.name,
      naics: row?.naics ?? entity.naics ?? entity.naics_code ?? null
    });
  });
  return {
    companies,
    shellSuggestion: shellLlcSuggestion({ companyCount: companies.length }),
    websiteSuggestion: websiteSuggestion(),
    linkedInSuggestion: linkedInSuggestion()
  };
}
