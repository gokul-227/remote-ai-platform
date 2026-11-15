// Public policy and company pages. Everything here describes what the product
// actually does today (checked against apps/api: auth/export.py,
// auth/retention.py, notifications, services/ai/metering.py). Copy names the
// operator "Remote AI Platform" and one contact address only. It never names
// individuals, hosting or infrastructure vendors, or internal tooling;
// service providers appear by category, as established job portals do
// (legal_public.test.tsx enforces this).

export const CONTACT_EMAIL = "contact@remoteaiplatform.com";

export const OPERATOR = {
  legalName: "Remote AI Platform",
  website: "remoteaiplatform.com",
  contactEmail: CONTACT_EMAIL,
} as const;

export const LAST_UPDATED = "15 November 2026";

export type Fact = { fact: string | null; label: string };
export type Block = string | string[] | Fact;
export type Section = { h: string; body: Block[] };

const write = `write to ${CONTACT_EMAIL}`;

export const PRIVACY: Section[] = [
  {
    h: "Who we are",
    body: [
      `Remote AI Platform (${OPERATOR.website}) is an online service that helps professionals find remote jobs and freelance work, and helps organisations hire and work with them. This Privacy Policy explains what personal data we collect, how we use and share it, how long we keep it and the choices and rights you have. Remote AI Platform is the controller of the personal data described here.`,
      `If you have questions about this policy or your data, ${write}.`,
    ],
  },
  {
    h: "Data we collect",
    body: [
      "Data you give us:",
      [
        "Account data: your name, email address and how you use the service (as a professional, an organisation, or both). You sign in with a one-time code sent by email, or with a supported account such as Google, Microsoft, GitHub or LinkedIn; from those services we receive your name, email address and, where available, your profile photo. We do not store a password.",
        "Profile data: headline, bio, skills, experience, education, location, time zone, availability, rates, salary expectations and links. Organisations provide company details and job posts.",
        "Resumes: the file you upload, the text extracted from it and the profile fields created from that text.",
        "Content and communications: messages, connection requests, posts, comments, group and community activity, reviews, reports you file and the members you block.",
        "Work records: applications, invitations, contract offers and signatures, milestones, project tasks, submissions and time entries.",
        "Contacts you choose to import: if you use “Find people you know from Google”, we read the names and email addresses in your Google contacts once, with your permission, to show which of them already have a public profile. We do not store your contact list. If you invite contacts, we email only the people you select and afterwards keep only a one-way hash of their address. Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
      ],
      "Data we collect automatically:",
      [
        "Usage data: actions such as creating an account, searching or applying, linked to your account while you are signed in, and how much of your AI feature allowance you have used.",
        "Device and log data: IP address, browser type, pages requested and error reports, used to keep the service secure and working.",
      ],
    ],
  },
  {
    h: "How we use your data",
    body: [
      [
        "To provide the service: your account, profile, job search, matching, applications, messaging, contracts and work tools.",
        "To send you service messages, such as sign-in codes and notifications about activity on your account. You choose which notifications you receive by email or push in Settings.",
        "To keep the service safe: preventing fraud, spam and abuse, enforcing our Terms and Community Guidelines, and investigating reports.",
        "To understand and improve how the service is used.",
        "To meet legal obligations.",
      ],
      "Legal bases (where the GDPR or similar laws apply): performance of our contract with you; our legitimate interests in operating a secure and useful service; your consent, where we ask for it (for example importing contacts), which you can withdraw at any time; and compliance with legal obligations.",
    ],
  },
  {
    h: "How we use AI",
    body: [
      "We use AI models to extract profile details from your resume, to review your profile and suggest improvements, to write match explanations and to power the in-app assistant. Match scores are calculated by the platform from profile and job data. To produce this output, the relevant text (for example your resume, profile or a job description) is sent to an AI model provider acting on our behalf.",
      "AI output can be wrong. You can review and edit everything extracted from your resume. The platform does not decide who is hired; organisations and professionals do.",
    ],
  },
  {
    h: "How your information is shared",
    body: [
      "With other members, as you choose:",
      [
        "If your profile is public, anyone can see your name, headline, bio, skills, experience, location, time zone, availability, hourly rate and links. If you hide it, it is visible only to you, our staff and organisations you apply to.",
        "An organisation you apply to sees your application, your profile and the match explanation for its job.",
        "Messages are visible to the people in the conversation; posts and group content to the audience you shared them with.",
        "Verification badges we have confirmed and reviews you receive are shown wherever your profile is visible.",
        "Your resume file, extracted resume data, minimum salary expectation and AI profile review are never shown to other members. Nobody is told that you blocked them.",
      ],
      "With service providers who process data on our behalf, under contracts that limit their use of it:",
      [
        "Cloud hosting, database and file storage providers",
        "Authentication (sign-in) providers",
        "Email delivery providers",
        "AI model providers",
        "Error monitoring and security providers",
      ],
      "For legal reasons: when required by law or legal process, or to protect the rights, safety and property of our members, the public or Remote AI Platform.",
      "In a business transfer: if Remote AI Platform is involved in a merger, acquisition or sale of assets, your data may transfer as part of it, and this policy will continue to apply.",
      "We do not sell your personal data, and we do not share it with advertisers or for cross-context behavioural advertising. Job boards whose listings we show receive nothing about you; if you apply to an external job, you do so on that site under its own terms.",
      "Payments are not processed through Remote AI Platform at this time. If that changes, we will update this policy first.",
    ],
  },
  {
    h: "Data retention",
    body: [
      "We keep account, profile and content data while your account is open. When you delete your account in Settings > Privacy, your profile, resume, applications, messages you sent and other content are deleted promptly, and your sign-in account is removed.",
      `If you have signed contracts or payment records with another member, we cannot delete those records on request because the other party relies on them. In that case ${write} and we will close your account, keep only those records and delete the rest.`,
      "To stop an old session from recreating a deleted account, we keep a one-way code derived from your sign-in identifier. It contains no name or email address.",
      "Logs, error reports and backups are kept only as long as needed for security, troubleshooting and recovery, and then deleted or overwritten on a rolling basis.",
    ],
  },
  {
    h: "Your rights and choices",
    body: [
      [
        "Access and portability: download a copy of your data at any time in Settings > Privacy.",
        "Correction: edit your profile and account details yourself.",
        "Deletion: delete your account in Settings > Privacy.",
        "Visibility: make your profile public or hidden, and block members.",
        "Notifications: choose which notifications you receive and how.",
        "Objection, restriction and withdrawal of consent: contact us and we will act on your request.",
      ],
      "EEA, UK and Swiss residents: under the GDPR you have the rights to access, rectify, erase, restrict, object and port your data, and to lodge a complaint with your local data protection authority.",
      "California residents: under the CCPA you have the rights to know, access, correct and delete your personal information, and not to be discriminated against for exercising these rights. We do not sell or share personal information as those terms are defined in the CCPA.",
      `To make a request that you cannot complete in Settings, ${write} from the email address on your account. We may need to verify your identity, and we respond within the time required by applicable law.`,
    ],
  },
  {
    h: "International data transfers",
    body: [
      "Remote AI Platform serves members worldwide, and our service providers may process data in countries other than your own, including outside the European Economic Area. Where we transfer personal data internationally, we rely on appropriate safeguards such as the European Commission's Standard Contractual Clauses.",
    ],
  },
  {
    h: "Security",
    body: [
      "We protect your data with encryption in transit, server-side access checks on every request, and restricted staff access. No service can guarantee perfect security; see our Trust and Security page for how to report a vulnerability.",
    ],
  },
  {
    h: "Children",
    body: [
      `Remote AI Platform is a professional service and is not directed at children. You must be at least 16 years old to use it. If you believe a child has given us personal data, ${write} and we will delete it.`,
    ],
  },
  {
    h: "Cookies and similar technologies",
    body: [
      "We use only the storage needed to run the service, such as keeping you signed in and remembering interface choices. We do not use advertising or cross-site tracking cookies. See our Cookie Policy for details.",
    ],
  },
  {
    h: "Changes to this policy",
    body: [
      "We may update this policy from time to time. If we make material changes, we will update the date at the top and notify registered members before the changes take effect.",
    ],
  },
  {
    h: "Contact us",
    body: [`For any privacy question or request, ${write}.`],
  },
];

export const TERMS: Section[] = [
  {
    h: "Introduction",
    body: [
      `These Terms of Service ("Terms") are an agreement between you and Remote AI Platform and apply when you use ${OPERATOR.website} and related services (the "Service"). By creating an account or using the Service, you agree to these Terms, our Privacy Policy and our Community Guidelines.`,
    ],
  },
  {
    h: "Eligibility and accounts",
    body: [
      [
        "You must be at least 16 years old and able to form a binding contract.",
        "Give accurate information and keep it up to date. Use one account per person.",
        "Keep access to your email and sign-in methods secure; you are responsible for activity on your account.",
        "If you act for an organisation, you confirm you are authorised to do so.",
      ],
    ],
  },
  {
    h: "The Service",
    body: [
      "Remote AI Platform lets professionals build profiles, find and apply for remote work and collaborate, and lets organisations post jobs, review candidates and manage work. The Service is free to use today and has no paid plans.",
      "Many job listings are collected from public job boards and link to the original posting. We do not verify every listing, and the original site's terms apply when you apply there.",
    ],
  },
  {
    h: "Your content",
    body: [
      "You own the content you post. You give Remote AI Platform a worldwide, non-exclusive, royalty-free licence to host, store, display and process it as needed to operate and improve the Service, for example showing your public profile to other members. This licence ends when you delete the content or your account, except for content others have already shared or that we must keep by law.",
      "You are responsible for your content and confirm that you have the rights to post it.",
    ],
  },
  {
    h: "AI features",
    body: [
      "Resume extraction, profile reviews, match explanations and the assistant are generated automatically and can be incomplete or wrong. Check anything important before relying on it. Use of AI features is subject to fair-use allowances. The platform does not make hiring decisions.",
    ],
  },
  {
    h: "Contracts between members",
    body: [
      "Contracts created on the Service are agreements between the organisation and the professional; Remote AI Platform is not a party to them. Once either party has signed, the terms can no longer be edited. Payments are not processed through Remote AI Platform at this time: approving a milestone does not move money, and the parties arrange payment between themselves.",
    ],
  },
  {
    h: "Acceptable use",
    body: [
      "You agree to follow our Community Guidelines. In particular, you must not:",
      [
        "post false, misleading, fraudulent or discriminatory jobs or profiles;",
        "harass, spam or impersonate others, or post illegal or infringing content;",
        "scrape the Service, create accounts by automated means or access data that is not yours;",
        "probe, disrupt or overload the Service, except through responsible disclosure as described on our Trust and Security page.",
      ],
    ],
  },
  {
    h: "Suspension and termination",
    body: [
      `You can stop using the Service and delete your account at any time in Settings > Privacy. We may remove content, restrict features, or suspend or close accounts that break these Terms or put members at risk. If you believe we made a mistake, ${write} to appeal.`,
    ],
  },
  {
    h: "Disclaimers",
    body: [
      'The Service is provided "as is" and "as available". To the extent permitted by law, we make no warranties about the accuracy of listings, member content or AI output, or that the Service will be uninterrupted or error-free. We do not guarantee that you will find work or hire anyone.',
    ],
  },
  {
    h: "Limitation of liability",
    body: [
      "To the extent permitted by law, Remote AI Platform is not liable for indirect, incidental or consequential damages, or for the conduct of members or third-party sites. Nothing in these Terms limits liability that cannot be limited by law, including for intent, gross negligence or injury to life, body or health, or your statutory rights as a consumer.",
    ],
  },
  {
    h: "Changes to these Terms",
    body: [
      "We may update these Terms. If changes are material, we will notify registered members before they take effect. Continuing to use the Service after that means you accept the updated Terms.",
    ],
  },
  {
    h: "Contact",
    body: [`Questions about these Terms? ${write[0].toUpperCase()}${write.slice(1)}.`],
  },
];

export const COOKIES: Section[] = [
  {
    h: "Our approach",
    body: [
      "Remote AI Platform does not use advertising cookies, analytics cookies or cross-site tracking. We only store what is strictly necessary to make the Service work, so no cookie consent banner is needed.",
    ],
  },
  {
    h: "What we store on your device",
    body: [
      [
        "Sign-in session: keeps you signed in between visits. Removed when you sign out.",
        "Interface preferences: small settings such as the job or conversation you last opened, so the site picks up where you left off.",
        "Notifications: if you turn on push notifications, your browser stores the subscription needed to deliver them.",
      ],
      "This information is kept in your browser's local storage and is not used to track you across other websites.",
    ],
  },
  {
    h: "Your choices",
    body: [
      "You can clear this storage at any time in your browser settings; you will then need to sign in again. If we ever introduce optional cookies, we will update this policy and ask for your consent first.",
    ],
  },
  { h: "Contact", body: [`Questions? ${write[0].toUpperCase()}${write.slice(1)}.`] },
];

export const GUIDELINES: Section[] = [
  {
    h: "Our community",
    body: [
      "Remote AI Platform is a professional community. These guidelines keep it trustworthy, safe and useful for everyone. They apply to profiles, job posts, messages, posts, comments, groups and every other part of the Service.",
    ],
  },
  {
    h: "Be real",
    body: [
      [
        "Use your real name and accurate information about your skills, experience and organisation.",
        "Do not impersonate people or organisations, or create fake or duplicate accounts.",
        "Post only genuine jobs that you are authorised to fill, with honest descriptions of the role and pay.",
      ],
    ],
  },
  {
    h: "Be safe",
    body: [
      [
        "No harassment, threats, hate speech or bullying.",
        "No scams: never ask candidates to pay a fee, buy equipment or share bank details or identity documents to be considered for a job.",
        "No sexual, violent or otherwise graphic content.",
        "Do not share other people's private information without permission.",
      ],
    ],
  },
  {
    h: "Be professional",
    body: [
      [
        "No spam, unsolicited bulk messages, chain messages or misleading links.",
        "No discrimination in job posts or hiring based on protected characteristics.",
        "Respect intellectual property: post only content you have the right to share.",
        "Do not use the Service for anything illegal.",
      ],
    ],
  },
  {
    h: "Reporting and enforcement",
    body: [
      "Use Report on any profile, job, post or message that breaks these guidelines. Our team reviews reports and may remove content, limit features, or suspend or close accounts. Serious or repeated violations can lead to a permanent ban.",
      `If you think we made a mistake, ${write} to appeal. If you are in immediate danger, contact your local emergency services.`,
    ],
  },
];

export const SECURITY: Section[] = [
  {
    h: "How we protect your account",
    body: [
      [
        "All traffic to Remote AI Platform is encrypted in transit with HTTPS.",
        "You sign in with one-time codes or a trusted account provider; we never store passwords.",
        "Access to your data is checked on our servers on every request, and staff access is restricted.",
        "You can review where you are signed in, sign out everywhere, and download or delete your data in Settings.",
      ],
    ],
  },
  {
    h: "Staying safe on Remote AI Platform",
    body: [
      [
        "We will never ask for your sign-in code. Do not share it with anyone.",
        "Legitimate employers will not ask you to pay to apply, buy equipment or share bank details before an offer.",
        "Report suspicious jobs, profiles or messages with Report so our team can review them.",
      ],
    ],
  },
  {
    h: "Responsible disclosure",
    body: [
      `If you believe you have found a security vulnerability, please ${write} with a description and steps to reproduce. We will acknowledge your report, keep you updated and credit you if you wish.`,
      [
        "Only test against your own account and data.",
        "Do not access, change or delete other people's data.",
        "Do not degrade the Service (no denial-of-service, spam or social engineering).",
        "Give us reasonable time to fix the issue before disclosing it publicly.",
      ],
      "We will not pursue legal action against good-faith research that follows these rules.",
    ],
  },
];

export const ABOUT: Section[] = [
  {
    h: "Who we are",
    body: [
      "Remote AI Platform connects professionals with remote jobs and freelance work, and gives organisations the tools to find, hire and work with them, all in one place.",
    ],
  },
  {
    h: "What you can do",
    body: [
      [
        "Search remote jobs gathered from many job boards, with filters for location, time zone and work type.",
        "Build a professional profile, optionally with help from AI to import your resume.",
        "See explainable match scores that show why a job fits.",
        "Apply, message, sign contracts and manage projects, documents and meetings.",
        "Join communities and groups to learn and grow your network.",
      ],
    ],
  },
  {
    h: "Our principles",
    body: [
      [
        "Transparency: matches are explained, and AI output is always yours to review and edit.",
        "Privacy: you control your profile visibility and your data, and we never sell it.",
        "Fairness: people make hiring decisions, not algorithms.",
      ],
      "Remote AI Platform is free to use.",
    ],
  },
  { h: "Contact", body: [`Questions, press or partnerships: ${CONTACT_EMAIL}.`] },
];

export const CONTACT: Section[] = [
  {
    h: "How can we help?",
    body: [
      `Write to ${CONTACT_EMAIL} for anything about Remote AI Platform. Including the email address on your account and, if relevant, a link to the page or item helps us respond faster.`,
      [
        "Account and sign-in help",
        "Privacy requests, such as a copy of your data or closing your account",
        "Reporting abuse, scams or a security issue",
        "Appeals about removed content or account restrictions",
        "Press and partnerships",
      ],
      "Please never include sign-in codes in an email.",
    ],
  },
  {
    h: "Before you write",
    body: [
      "Many questions are answered in our Help Centre. To report a specific profile, job or message, use Report on that item; it reaches our moderation team directly.",
    ],
  },
];

export const IMPRESSUM: Section[] = [
  {
    h: "Provider",
    body: [`${OPERATOR.legalName} (${OPERATOR.website})`],
  },
  { h: "Contact", body: [`Email: ${CONTACT_EMAIL}`] },
  {
    h: "Links and user content",
    body: [
      "Job listings from other sites and content posted by members are not our own content. We act on reports of unlawful content and remove it once we become aware of it. We have no control over external sites we link to.",
    ],
  },
];

export const HELP_FAQ: [string, string][] = [
  [
    "How do I sign in?",
    "Enter your email and use the one-time sign-in code we send you. You can also continue with Google, Microsoft or GitHub.",
  ],
  [
    "What determines my match score?",
    "Skills contribute 40%, experience 25%, role 15%, timezone 8%, availability 7%, rate 3% and remote preference 2%. Review the explanation alongside your own judgment.",
  ],
  [
    "How do contracts work?",
    "Review the scope and milestones, then sign. Once either party signs, the terms can no longer be edited. The professional delivers each milestone and the company approves it. Payments are not processed through Remote AI Platform yet, so approving work does not move money.",
  ],
  [
    "Can I withdraw an application?",
    "You can withdraw an active application before it is accepted or rejected. Review the current status in Applications.",
  ],
  [
    "How do I import a resume?",
    "Choose AI Resume Import during onboarding. Supported resumes are PDF or DOCX up to 10 MB. Review extracted information and correct it before completing your profile.",
  ],
  [
    "How do I manage a company?",
    "Choose the hiring role at registration, complete the organization profile, then use Hiring to post jobs and review candidates.",
  ],
  [
    "How do I download or delete my data?",
    "Go to Settings > Privacy to download a copy of your data or delete your account.",
  ],
  [
    "Where do I report a problem?",
    "Use the report action on the relevant job, profile or community content. Our moderation team reviews every report.",
  ],
  [
    "How do I contact support?",
    `Email ${CONTACT_EMAIL}. Use the same address for privacy requests, such as a copy of your data or closing your account.`,
  ],
  [
    "How do I report abuse or a security issue?",
    `Use Report on the post, profile or job, or email ${CONTACT_EMAIL} with details. Please don’t include sign-in codes.`,
  ],
  ["Are there paid plans?", "Remote AI Platform is free to use today and has no paid subscription plans."],
];

export const isFact = (b: Block): b is Fact => typeof b === "object" && !Array.isArray(b);

/** Facts still missing on a page; non-empty means the page is not launch-ready. */
export const pendingFacts = (sections: Section[]) =>
  sections
    .flatMap((s) => s.body)
    .filter(isFact)
    .filter((b) => b.fact == null);
