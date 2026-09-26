// Legal page content. Everything here describes what the product actually
// does today (checked against the code). Facts only the operator can supply
// live in OPERATOR; a null value is rendered as a visible "pending" notice,
// never guessed. Filling these in (and legal review) is a launch blocker.

export const OPERATOR: {
  legalName: string | null;
  address: string[] | null;
  contactEmail: string | null;
  vatOrRegister: string | null;
  contentResponsible: string | null;
  aiProviders: string | null;
  cacheProvider: string | null;
  dataLocations: string | null;
  logRetention: string | null;
  governingLaw: string | null;
  supervisoryAuthority: string | null;
} = {
  legalName: null,
  address: null,
  // hello@remoteaiplatform.com is the verified *sending* address; it may only
  // be published here once someone confirms it is monitored.
  contactEmail: null,
  vatOrRegister: null,
  contentResponsible: null,
  aiProviders: null,
  cacheProvider: null,
  dataLocations: null,
  logRetention: null,
  governingLaw: null,
  supervisoryAuthority: null,
};

export const LAST_UPDATED = "26 September 2026";

export type Fact = { fact: string | null; label: string };
export type Block = string | string[] | Fact;
export type Section = { h: string; body: Block[] };

const fact = (value: string | null, label: string): Fact => ({ fact: value, label });

export const PRIVACY: Section[] = [
  {
    h: "Who is responsible",
    body: [
      "Remote AI Platform (remoteaiplatform.com) connects professionals with companies and organisations for remote work. This notice explains what personal data the service processes, why, who can see it and what rights you have.",
      fact(OPERATOR.legalName, "Name of the operator responsible for your data (controller)"),
      fact(OPERATOR.address?.join(", ") ?? null, "Postal address of the operator"),
      fact(OPERATOR.contactEmail, "Contact email for privacy requests"),
    ],
  },
  {
    h: "What we collect",
    body: [
      [
        "Account data: your name, email address and account type (professional or organisation). You sign in with a one-time code sent by email, or with Google, Microsoft or GitHub; from those providers we receive your name and email address. We do not store a password for these sign-in methods.",
        "Profile data you enter: headline, bio, skills, experience, education, location, time zone, availability, rates, salary expectations and links. Companies provide organisation details and job posts.",
        "Resumes: the file you upload, the text extracted from it and the profile fields generated from that text.",
        "Communications and content: messages, connection requests, posts, comments, group activity, reports you file and reviews you write.",
        "Work records: applications, invitations, contract offers and signatures, milestones, project tasks, submissions and time entries.",
        "Usage data: product events such as an account being created, a search or an application, linked to your account when you are signed in.",
        "Technical data: request logs (including IP address and browser type) and error reports, used for security and troubleshooting.",
      ],
    ],
  },
  {
    h: "Who can see your data",
    body: [
      [
        "If your professional profile is public, anyone can see your name, headline, bio, skills, experience, location, time zone, availability, hourly rate and links. If you hide it, only you, administrators and the companies you apply to can see it.",
        "Your resume file, your extracted resume data, your minimum salary expectation and your AI profile review are never shown to other users.",
        "A company you apply to sees your application, your profile and the match explanation for its job.",
        "Messages are visible only to the people in the conversation. Posts and group content are visible to the audience they were shared with.",
        "Administrators can access account data where needed for support, security and moderation.",
      ],
    ],
  },
  {
    h: "Why we process it",
    body: [
      "To provide the service you signed up for (your account, profile, matching, applications, messaging and work tools); for our legitimate interest in keeping the service secure, preventing abuse and understanding how it is used; and on the basis of your consent where we ask for it.",
    ],
  },
  {
    h: "How AI is used",
    body: [
      "AI models are used to extract profile fields from your resume, to review your profile and suggest improvements, and to write match explanations. Match scores themselves are calculated by the platform from profile and job data. AI output can be wrong: you can review and edit everything extracted from your resume, and hiring decisions are made by people, not by the platform.",
      "To produce this output, the relevant text (for example your resume text, profile or a job description) is sent to the AI provider in use at the time.",
      fact(OPERATOR.aiProviders, "AI providers that receive this data, and whether they may retain or train on it"),
    ],
  },
  {
    h: "Service providers",
    body: [
      "We use these providers to run the service. They process data on our behalf. We do not sell personal data and do not share it with advertisers.",
      [
        "Supabase: database, sign-in and file storage",
        "Render: application servers for the API",
        "Cloudflare: website hosting and delivery",
        "Resend: email delivery (sign-in codes and notifications)",
        "Sentry: error monitoring",
        "Job boards we list jobs from receive nothing about you. If you apply to an external job, you do so on that board's own site.",
      ],
      fact(OPERATOR.cacheProvider, "Provider of the temporary data cache (used for rate limiting)"),
      "Payments are not processed through Remote AI Platform at the moment. If that changes, this notice will name the payment provider first.",
    ],
  },
  {
    h: "Where data is stored",
    body: [fact(OPERATOR.dataLocations, "Countries or regions where data is stored and processed, and the safeguards used for transfers outside the EU/EEA")],
  },
  {
    h: "How long we keep it",
    body: [
      "Account, profile and content data are kept while your account exists. When you ask us to delete your account, we delete or anonymise your data unless we must keep specific records to meet a legal obligation.",
      fact(OPERATOR.logRetention, "Retention period for request logs, error reports and backups"),
    ],
  },
  {
    h: "Your rights",
    body: [
      "Depending on where you live (for example under the GDPR), you have the right to access your data, correct it, have it deleted, receive it in a portable format, object to or restrict processing, and withdraw consent at any time. You can correct most profile data yourself in your profile. For anything else, including account deletion and data export, contact us at the address above; these requests are handled manually for now.",
      "You also have the right to lodge a complaint with a data protection supervisory authority.",
      fact(OPERATOR.supervisoryAuthority, "Supervisory authority responsible for the operator"),
    ],
  },
  {
    h: "Storage on your device",
    body: [
      "We store your sign-in session and a few interface choices (such as the job or conversation you last opened) in your browser's local storage so the site works. They are removed when you sign out. We do not use advertising or cross-site tracking cookies.",
    ],
  },
  {
    h: "Changes",
    body: ["If this notice changes materially, we will update the date above and tell registered users."],
  },
];

export const TERMS: Section[] = [
  {
    h: "About these terms",
    body: [
      "These terms apply when you use Remote AI Platform (remoteaiplatform.com).",
      fact(OPERATOR.legalName, "Name of the operator you are contracting with"),
    ],
  },
  {
    h: "Accounts",
    body: [
      "You need an account to apply, message or hire. Give accurate information, keep your sign-in method secure, and use one account per person or organisation. Company accounts must be operated by someone authorised to act for that organisation.",
    ],
  },
  {
    h: "Jobs from other sites",
    body: [
      "Many listings are collected from public job boards and link to the original posting. We do not verify them, and the original site's terms apply when you apply there. Applying through an external link is not recorded as an application on Remote AI Platform.",
    ],
  },
  {
    h: "AI features",
    body: [
      "Resume extraction, profile reviews and match explanations are generated automatically and can be incomplete or wrong. Check anything that matters before relying on it. The platform does not decide who is hired.",
    ],
  },
  {
    h: "Contracts and payments",
    body: [
      "Contracts created on the platform are agreements between the organisation and the professional. Once either party has signed, the terms can no longer be edited. Payments are not processed through Remote AI Platform yet: approving a milestone does not move any money, and the parties arrange payment between themselves.",
    ],
  },
  {
    h: "Acceptable use",
    body: [
      [
        "No false, misleading or discriminatory job posts or profiles.",
        "No spam, harassment, or content that is illegal or infringes others' rights.",
        "No scraping, automated account creation or attempts to access data that is not yours.",
        "No attempts to disrupt or probe the service without permission.",
      ],
      "You can report content or accounts from the page where you see them. We may remove content or suspend accounts that break these rules.",
    ],
  },
  {
    h: "Ending your account",
    body: ["You can stop using the service at any time and ask us to delete your account. We may suspend or close accounts that break these terms."],
  },
  {
    h: "Liability and governing law",
    body: [fact(OPERATOR.governingLaw, "Liability terms, governing law and place of jurisdiction (requires legal review)")],
  },
];

export const IMPRESSUM: Section[] = [
  {
    h: "Provider",
    body: [
      fact(OPERATOR.legalName, "Full legal name of the provider"),
      fact(OPERATOR.address?.join(", ") ?? null, "Postal address"),
    ],
  },
  { h: "Contact", body: [fact(OPERATOR.contactEmail, "Contact email address")] },
  { h: "VAT ID / commercial register", body: [fact(OPERATOR.vatOrRegister, "VAT ID or register entry, or a statement that none applies")] },
  { h: "Responsible for content", body: [fact(OPERATOR.contentResponsible, "Person responsible for editorial content")] },
  {
    h: "Links and user content",
    body: [
      "Job listings from other sites and content posted by users are not our own content. We act on reports of unlawful content and remove it once we become aware of it. We have no control over external sites we link to.",
    ],
  },
];

export const isFact = (b: Block): b is Fact => typeof b === "object" && !Array.isArray(b);

/** Operator facts still missing on a page; non-empty means the page is not launch-ready. */
export const pendingFacts = (sections: Section[]) => sections.flatMap((s) => s.body).filter(isFact).filter((b) => b.fact == null);
