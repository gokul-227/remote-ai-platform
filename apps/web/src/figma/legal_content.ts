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

export const LAST_UPDATED = "16 November 2026";

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
      "Legal bases (where the GDPR, UK GDPR or similar laws apply):",
      [
        "Performance of our contract with you: running your account, profile, search, matching, applications, messaging, contracts and work tools, and sending service messages.",
        "Legitimate interests: keeping the service secure, preventing fraud and abuse, moderating content, and understanding and improving the service. You can object to this processing.",
        "Consent, where we ask for it: for example importing contacts, push notifications and optional email notifications. You can withdraw consent at any time in Settings.",
        "Legal obligation: responding to lawful requests and keeping records the law requires.",
      ],
      "We do not use your data for automated decisions that have legal or similarly significant effects on you.",
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
        "Payment processing and tax calculation providers (only if you buy a paid feature)",
      ],
      "For legal reasons: when required by law or legal process, or to protect the rights, safety and property of our members, the public or Remote AI Platform.",
      "In a business transfer: if Remote AI Platform is involved in a merger, acquisition or sale of assets, your data may transfer as part of it, and this policy will continue to apply.",
      "We do not sell your personal data, and we do not share it with advertisers or for cross-context behavioural advertising. Job boards whose listings we show receive nothing about you; if you apply to an external job, you do so on that site under its own terms.",
      "If you buy a paid feature, our payment processor collects your card details, billing address and any VAT number directly; we never see your full card number. We keep a record of what you bought, invoices and refunds for as long as accounting and tax law require, even after you delete your account (without the link to your account). Payments between members for contracts are not processed through Remote AI Platform.",
    ],
  },
  {
    h: "Data retention",
    body: [
      "Job listings collected from other sites are deleted automatically 90 days after they were posted, or earlier if the source withdraws them.",
      "We keep account, profile and content data until you delete it or your account. You can download a copy of your data at any time in Settings > Privacy. When you delete your account in Settings > Privacy, your profile, resume, applications, messages you sent and other content are deleted promptly, and your sign-in account is removed.",
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
      "We protect your data with encryption in transit, server-side access checks on every request, and restricted staff access. No service can guarantee perfect security; see our Security Policy for how to report a vulnerability.",
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

const Write = `${write[0].toUpperCase()}${write.slice(1)}`;

export const TERMS: Section[] = [
  {
    h: "Introduction",
    body: [
      `These Terms of Service ("Terms") are an agreement between you and Remote AI Platform ("we", "us") and apply when you use ${OPERATOR.website} and related services (the "Service"). By creating an account or using the Service, you agree to these Terms and to the policies they refer to: our Privacy Policy, Cookie Policy, Community Guidelines, Copyright and Takedown Policy and, if you post jobs, our Job Posting and Employer Terms. If you do not agree, do not use the Service.`,
    ],
  },
  {
    h: "Eligibility and accounts",
    body: [
      [
        "You must be at least 16 years old and able to form a binding contract.",
        "Give accurate information and keep it up to date. Use one account per person.",
        "Keep access to your email and sign-in methods secure; you are responsible for activity on your account. Tell us promptly if you believe your account has been compromised.",
        "If you act for an organisation, you confirm you are authorised to bind it to these Terms.",
      ],
    ],
  },
  {
    h: "The Service",
    body: [
      "Remote AI Platform lets professionals build profiles, find and apply for remote work and collaborate, and lets organisations post jobs, review candidates and manage work. Searching, viewing and applying for jobs is free. Some optional features are paid; see Paid services below and our pricing page. We may change, add or remove features over time; if we remove a feature you rely on, we will try to give reasonable notice.",
    ],
  },
  {
    h: "Job listings from other sites",
    body: [
      "Many job listings on the Service are collected automatically from public job boards and company career pages and link to the original posting. We show them to help you discover opportunities; we are not the employer or a recruiter for those roles, and we do not endorse or verify them.",
      [
        "Listings may be out of date, incomplete or inaccurate, or may already be filled. Check the original posting before you apply.",
        "When you apply on another site, that site's terms and privacy policy apply, not ours.",
        "Imported listings are removed automatically once they are older than our listing window (currently 90 days), or earlier if the source withdraws them.",
        `If you own a listing and want it corrected or removed, ${write}.`,
      ],
    ],
  },
  {
    h: "Your content and licence to us",
    body: [
      "You own the content you post, such as your profile, resume, messages, posts and job posts. You give Remote AI Platform a worldwide, non-exclusive, royalty-free licence, transferable only to a successor of the Service and sublicensable only to service providers acting for us, to host, store, copy, display, adapt (for example format it for different screens) and process that content as needed to operate, secure and improve the Service, for example to show your public profile to other members or to calculate matches.",
      "This licence ends when you delete the content or your account, except for copies others have already shared within the Service, content we must keep by law, and backups that are overwritten on a rolling basis.",
      "You are responsible for your content and confirm that you have the rights to post it and that it does not break the law or these Terms. We may remove content that does.",
      "If you send us feedback or suggestions, we may use them without obligation to you.",
    ],
  },
  {
    h: "Our content and intellectual property",
    body: [
      "The Service, including its software, design, text, logos and the Remote AI Platform name, is owned by us or our licensors and is protected by law. These Terms give you a personal, non-exclusive, non-transferable right to use the Service as intended; they do not give you any right to our trademarks or to copy, modify or reverse engineer the Service except where the law allows it.",
    ],
  },
  {
    h: "AI-assisted features",
    body: [
      "Resume extraction, profile reviews, match explanations, writing help and the assistant are generated automatically by AI models and can be incomplete, outdated or wrong. They are suggestions, not professional, legal, financial or career advice.",
      [
        "Check anything important before relying on it, and review AI-generated text before you send or publish it; you are responsible for content you choose to use.",
        "Match scores are an aid to your own judgement. The platform does not make hiring decisions; members do.",
        "Do not use AI features to create content that breaks these Terms or our Community Guidelines.",
        "AI features are subject to fair-use allowances, which may change.",
      ],
    ],
  },
  {
    h: "Contracts between members",
    body: [
      "Contracts created on the Service are agreements between the organisation and the professional; Remote AI Platform is not a party to them and is not an employer, agency or payment intermediary. Once either party has signed, the terms can no longer be edited. Payments are not processed through Remote AI Platform at this time: approving a milestone does not move money, and the parties arrange payment between themselves.",
    ],
  },
  {
    h: "Paid services",
    body: [
      "Remote AI Platform (the trading name of the seller shown on your receipt) offers optional paid services: subscriptions (for example Premium, Freelancer Plus, Hire and Hire Pro), one-off purchases (for example Featured jobs, Urgent badges, profile boosts) and credits (for example job, messaging, proposal and AI credits, and a prepaid balance for sponsored jobs). Current prices and what each includes are on our pricing page. Core features (searching, viewing and applying for jobs) are never paid.",
      [
        "Prices are in euros and include VAT where it applies. VAT is calculated at checkout from your billing address; businesses can add a VAT number. Payments are handled by our payment processor, and you receive a receipt or invoice by email; subscription invoices can also be downloaded in Settings > Billing.",
        "Subscriptions renew automatically at the end of each billing period (monthly or yearly) at the price shown when you subscribed, until you cancel. You can cancel at any time in Settings > Billing; cancelling stops the next renewal and you keep access until the end of the period you paid for. We will tell you before any price change applies to your subscription, and you can cancel before it does.",
        "A free trial, where offered, is available once per member. If you don't cancel before it ends, the subscription starts and is charged.",
        "If a renewal payment fails, we and our payment processor will email you and retry for a short period; if it still fails, the subscription ends.",
        "Credits and prepaid balances expire 12 months after purchase and have no cash value. They are not refundable except as stated here or required by law. A messaging credit is returned automatically if the member you wrote to does not reply within 14 days.",
        "Featured, Urgent, Sponsored and Promoted placements are advertising. They are always labelled as paid, they do not change the order of organic results, and we may refuse or remove a placement that breaks our rules.",
        "Promotion codes and referral credits apply only as described when they are offered, and can't be exchanged for cash.",
      ],
      "Right of withdrawal (consumers in the EU/EEA): you normally have 14 days to withdraw from a purchase of a digital service. Because paid services start straight away, at checkout you ask us to start immediately and acknowledge that you lose the right of withdrawal once the service has been fully provided. If you withdraw within 14 days before that, we refund the amount for the part not yet provided. To withdraw, " + write + " or use Settings > Billing.",
      "Refunds: apart from the right of withdrawal and your statutory rights, payments are not refundable, but if something we sold you didn't work as described, " + write + " and we will put it right or refund you. Refunds go back to the original payment method.",
    ],
  },
  {
    h: "Acceptable use",
    body: [
      "You agree to follow our Community Guidelines. In particular, you must not:",
      [
        "post false, misleading, fraudulent or discriminatory jobs or profiles, or ask candidates for money;",
        "harass, spam or impersonate others, or post illegal or infringing content;",
        "scrape, crawl or bulk-download the Service or member data, create accounts by automated means, or access data that is not yours;",
        "use the Service to build a competing database or to send unsolicited marketing;",
        "upload malware, or probe, disrupt or overload the Service, except through responsible disclosure as described in our Security Policy;",
        "get around limits, blocks or restrictions we or other members put in place.",
      ],
    ],
  },
  {
    h: "Third-party links and services",
    body: [
      "The Service contains links to other websites, such as original job postings, company sites and links members add, and lets you sign in with or connect other services. We do not control those sites or services and are not responsible for their content, availability or practices. Your use of them is governed by their own terms and privacy policies.",
    ],
  },
  {
    h: "Suspension and termination",
    body: [
      "You can stop using the Service and delete your account at any time in Settings > Privacy; you can download a copy of your data there first.",
      `We may remove content, restrict features, or suspend or close accounts that break these Terms, put members or the Service at risk, or where the law requires it. Where appropriate and lawful we will tell you why. If you believe we made a mistake, ${write} to appeal.`,
      "Sections that by their nature should survive termination, such as disclaimers, limitation of liability and governing law, continue to apply.",
    ],
  },
  {
    h: "Disclaimers",
    body: [
      'The Service is provided "as is" and "as available". To the extent permitted by law, we make no warranties, express or implied, about the accuracy of listings, member content or AI output, or that the Service will be uninterrupted, secure or error-free. We do not vet every member or employer, and we do not promise that you will find work or hire anyone. Take care when dealing with other members and never pay to apply for a job.',
    ],
  },
  {
    h: "Limitation of liability",
    body: [
      "To the extent permitted by law, Remote AI Platform is not liable for indirect, incidental, special or consequential damages, loss of profits, data or opportunity, or for the conduct of members or third-party sites. For the free Service, our total liability for any claim is limited to the greatest extent the law allows; for paid services, it is limited to the amount you paid us for the affected service in the 12 months before the claim, to the extent the law allows.",
      "Nothing in these Terms limits liability that cannot be limited by law, including for intent, gross negligence, fraud or injury to life, body or health, or your statutory rights as a consumer.",
    ],
  },
  {
    h: "Indemnity",
    body: [
      "If you use the Service for business purposes, you agree to compensate us for reasonable claims, losses and costs arising from your content or your breach of these Terms, to the extent permitted by law.",
    ],
  },
  {
    h: "Governing law and disputes",
    body: [
      "These Terms are governed by the laws of the place where Remote AI Platform is established, without regard to conflict-of-laws rules. If you are a consumer, you also keep the protection of the mandatory laws of the country where you live and may bring proceedings in its courts.",
      `Before starting any formal dispute, please ${write} so we can try to resolve the issue informally.`,
    ],
  },
  {
    h: "General",
    body: [
      "If any part of these Terms is found unenforceable, the rest remains in effect. Our failure to enforce a provision is not a waiver. You may not transfer your rights under these Terms; we may transfer ours to a successor of the Service. These Terms and the policies they refer to are the entire agreement between you and us about the Service.",
    ],
  },
  {
    h: "Changes to these Terms",
    body: [
      "We may update these Terms. If changes are material, we will update the date at the top and notify registered members before they take effect. Continuing to use the Service after that means you accept the updated Terms; if you do not agree, you can delete your account.",
    ],
  },
  {
    h: "Contact",
    body: [`Questions about these Terms? ${Write}.`],
  },
];

export const COPYRIGHT: Section[] = [
  {
    h: "Our approach",
    body: [
      "Remote AI Platform respects intellectual property rights and expects members to do the same. Members may post only content they own or have permission to share. We respond to clear notices of alleged infringement, in line with the notice-and-takedown procedures of laws such as the US Digital Millennium Copyright Act (DMCA) and the EU Digital Services Act.",
    ],
  },
  {
    h: "Reporting infringement",
    body: [
      `If you believe content on the Service infringes your copyright or other intellectual property, ${write} with the subject line "Copyright notice" and include:`,
      [
        "your name and contact details, and, if you act for the rights holder, confirmation that you are authorised to do so;",
        "a description of the work you believe is infringed;",
        "the exact link (URL) to each item you want removed;",
        "a statement that you have a good-faith belief that the use is not authorised by the rights holder, its agent or the law;",
        "a statement that the information in your notice is accurate and, under penalty of perjury, that you are the rights holder or authorised to act for them;",
        "your physical or electronic signature.",
      ],
      "Incomplete notices may delay our response. Submitting a knowingly false notice may make you liable for damages.",
    ],
  },
  {
    h: "What happens next",
    body: [
      "When we receive a valid notice, we remove or disable access to the content and tell the member who posted it, including a copy of the notice where appropriate. We may share the notice, with your contact details removed where possible, with the member concerned.",
    ],
  },
  {
    h: "Counter-notices",
    body: [
      `If your content was removed and you believe this was a mistake or that you have the right to use it, ${write} with the subject line "Counter-notice" and include your name and contact details, the link to the removed content, a statement under penalty of perjury that you have a good-faith belief it was removed by mistake or misidentification, your consent to the jurisdiction of the courts competent for your address, and your signature. We may forward the counter-notice to the person who sent the original notice and may restore the content unless they tell us they have started legal action.`,
    ],
  },
  {
    h: "Repeat infringers",
    body: [
      "We close the accounts of members who repeatedly infringe the rights of others, in appropriate circumstances.",
    ],
  },
  {
    h: "Job listings from other sites",
    body: [
      `Job listings we collect from public sources show a short summary and link to the original posting. If you own a listing and want it removed or changed, ${write} with the link and we will act on it promptly.`,
    ],
  },
  {
    h: "Other reports",
    body: [
      "For trademark issues, impersonation or other unlawful content, use Report on the item or write to us with the details above adapted to your complaint.",
    ],
  },
];

export const EMPLOYER_TERMS: Section[] = [
  {
    h: "About these terms",
    body: [
      "These Job Posting and Employer Terms apply when you post a job, search for candidates, contact professionals or offer contracts on Remote AI Platform on behalf of an organisation. They add to our Terms of Service and Community Guidelines; if they conflict, these terms apply to job posting.",
    ],
  },
  {
    h: "Who can post",
    body: [
      [
        "You must be authorised to recruit for the organisation you represent and to accept these terms for it.",
        "Your organisation profile must be accurate and must not impersonate another organisation.",
        "Posting jobs is free. Optional paid features are described below and in the Paid services section of our Terms of Service.",
      ],
    ],
  },
  {
    h: "Job post requirements",
    body: [
      "Every job post must:",
      [
        "describe a real, currently open position that you are authorised to fill;",
        "describe the role, location or time-zone requirements, employment type and pay honestly, without misleading titles or hidden conditions;",
        "comply with applicable employment, equal-opportunity and anti-discrimination laws;",
        "link only to your own or your applicant tracking system's application page.",
      ],
      "Job posts must not:",
      [
        "ask candidates to pay any fee, buy equipment or training, or provide bank details or identity documents before an offer;",
        "advertise multi-level marketing, pyramid schemes, commission-only roles presented as salaried, or illegal work;",
        "discriminate on the basis of protected characteristics, except where the law expressly allows it;",
        "collect candidate data for purposes other than the advertised role.",
      ],
    ],
  },
  {
    h: "Candidate data",
    body: [
      "When professionals apply or share their profile with you, you receive personal data. You are responsible for handling it lawfully as an independent controller: use it only to assess candidates for your roles, keep it secure, do not sell or share it with others, and delete it when you no longer need it. Do not export or scrape candidate data from the Service, and do not contact professionals with unsolicited marketing.",
    ],
  },
  {
    h: "Hiring decisions",
    body: [
      "Match scores and AI summaries are aids, not decisions. You make your own hiring decisions and are responsible for them, including any screening or background checks you carry out, which must comply with the law.",
    ],
  },
  {
    h: "Paid features for employers",
    body: [
      "Featured jobs, Urgent badges, sponsored jobs, social and newsletter boosts, job credits, messaging credits, candidate database access, team seats, employer branding and the Hire and Hire Pro subscriptions are optional. The Paid services section of our Terms of Service (billing, renewals, cancellation, refunds and VAT) applies to them.",
      [
        "Paid placements are advertising and are always labelled \"Featured\", \"Urgent\" or \"Sponsored\". They never change the order of organic results, and a paid job must meet every job post requirement above.",
        "Sponsored jobs are charged per click from your prepaid balance, up to your daily budget and maximum cost per click. We count a click once per visitor per day and do not charge for clicks we identify as automated or for your own clicks. When your balance runs out the job stops being sponsored.",
        "Candidate search shows only members who have chosen to be open to opportunities and to make their profile public. Messaging credits are for genuine recruiting messages; the Candidate data rules below apply to everything you see.",
        "Social and newsletter boosts are scheduled by our team after purchase; we may decline content that doesn't fit our channels and refund you if we do.",
      ],
    ],
  },
  {
    h: "Contracts and payment",
    body: [
      "Contracts you create with professionals are agreements between you and them; Remote AI Platform is not a party, employer of record or agency. Payments are not processed through Remote AI Platform at this time. You are responsible for paying professionals as agreed and for your own tax, employment and classification obligations.",
    ],
  },
  {
    h: "Review and removal",
    body: [
      `We may review, edit for formatting, refuse or remove any job post, and restrict or close employer accounts that break these terms or that members report as fraudulent. If you think we made a mistake, ${write} to appeal.`,
    ],
  },
  {
    h: "Contact",
    body: [`Questions about posting jobs? ${Write}.`],
  },
];

export const ACCESSIBILITY: Section[] = [
  {
    h: "Our commitment",
    body: [
      "Remote AI Platform wants everyone to be able to find work and hire, including people with disabilities. We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA across our public pages and the application.",
    ],
  },
  {
    h: "What we do",
    body: [
      [
        "Use semantic HTML, landmarks and headings so pages work with screen readers.",
        "Provide a skip-to-content link, visible focus indicators and full keyboard navigation.",
        "Check colour contrast and support browser zoom and reflow.",
        "Offer light and dark themes and respect reduced-motion preferences where we use animation.",
        "Run automated accessibility checks as part of our test suite.",
      ],
    ],
  },
  {
    h: "Known limitations",
    body: [
      "We have not yet completed an independent accessibility audit, so we do not claim full conformance. Some parts of the application, such as the document, spreadsheet and slide editors, drag-and-drop boards and video calls, may be harder to use with assistive technology. Job listings collected from other sites and content posted by members may not meet our standards.",
    ],
  },
  {
    h: "Feedback and help",
    body: [
      `If you have difficulty using any part of Remote AI Platform, or need information in a different format, ${write} with the page address and a description of the problem. We aim to reply within five working days and will try to provide the information or service another way while we fix the issue.`,
    ],
  },
  {
    h: "Enforcement",
    body: [
      "If you are not satisfied with our response, you may contact the accessibility enforcement or equality body in your country.",
    ],
  },
];

export const SECURITY_POLICY: Section[] = [
  {
    h: "Reporting a vulnerability",
    body: [
      `We welcome reports from security researchers. If you believe you have found a vulnerability in Remote AI Platform, ${write} with the subject line "Security report" and include a description of the issue, the affected URL or feature, steps to reproduce and the potential impact. Please do not include sign-in codes or other people's personal data.`,
      "Our machine-readable contact details are published at /.well-known/security.txt.",
    ],
  },
  {
    h: "What to expect",
    body: [
      [
        "We aim to acknowledge your report within three working days.",
        "We will keep you informed as we investigate and fix the issue.",
        "We will credit you when the issue is resolved, if you wish.",
        "We do not offer a paid bug bounty at this time.",
      ],
    ],
  },
  {
    h: "In scope",
    body: [[`${OPERATOR.website} and its subdomains`, "The Remote AI Platform web application and its API"]],
  },
  {
    h: "Out of scope",
    body: [
      [
        "Job boards and other third-party sites we link to",
        "Denial-of-service, load or volume testing",
        "Social engineering, phishing or physical attacks",
        "Reports from automated scanners without a demonstrated impact",
        "Missing best-practice headers or settings with no practical security impact",
      ],
    ],
  },
  {
    h: "Rules of engagement",
    body: [
      [
        "Only test against accounts and data you own.",
        "Do not access, change, keep or delete other people's data. If you encounter it, stop and tell us.",
        "Do not degrade the Service or other members' experience (no denial-of-service, spam or social engineering).",
        "Give us reasonable time to fix the issue before disclosing it publicly, and coordinate the timing with us.",
      ],
    ],
  },
  {
    h: "Safe harbour",
    body: [
      "If you act in good faith and follow this policy, we will consider your research authorised, will not pursue legal action against you for it, and will not ask others to. This does not override the rights of third parties we do not control.",
    ],
  },
];

/** Every public legal page, in the order the /legal index lists them. */
export const LEGAL_PAGES: { href: string; title: string; summary: string }[] = [
  { href: "/terms", title: "Terms of Service", summary: "The agreement that applies when you use Remote AI Platform." },
  {
    href: "/privacy",
    title: "Privacy Policy",
    summary: "What personal data we collect, why, how long we keep it and your rights.",
  },
  { href: "/cookies", title: "Cookie Policy", summary: "The small amount of storage we use on your device, and why." },
  {
    href: "/community-guidelines",
    title: "Community Guidelines",
    summary: "What is and is not allowed on the platform, and how we enforce it.",
  },
  {
    href: "/employer-terms",
    title: "Job Posting and Employer Terms",
    summary: "Rules for organisations that post jobs and contact candidates.",
  },
  {
    href: "/copyright",
    title: "Copyright and Takedown Policy",
    summary: "How to report infringing content and how counter-notices work.",
  },
  { href: "/security", title: "Security Policy", summary: "How to report a vulnerability responsibly." },
  {
    href: "/accessibility",
    title: "Accessibility Statement",
    summary: "Our accessibility goals, known limitations and how to get help.",
  },
  { href: "/trust", title: "Trust and Security", summary: "How we protect your account and how to stay safe." },
  { href: "/impressum", title: "Legal notice", summary: "Provider information for Remote AI Platform." },
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
        "Respect intellectual property: post only content you have the right to share. Rights holders can use our Copyright and Takedown Policy.",
        "Review AI-generated text before you post or send it; you are responsible for it.",
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
      "We will not pursue legal action against good-faith research that follows these rules. See our Security Policy for the full scope and safe-harbour terms.",
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
      "Searching, viewing and applying for jobs on Remote AI Platform is free; optional paid features are listed on our pricing page.",
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
  ["Are there paid plans?", "Job search, viewing jobs and applying are free. Optional paid features for members and employers are listed on the pricing page; prices include VAT where it applies."],
];

export const isFact = (b: Block): b is Fact => typeof b === "object" && !Array.isArray(b);

/** Facts still missing on a page; non-empty means the page is not launch-ready. */
export const pendingFacts = (sections: Section[]) =>
  sections
    .flatMap((s) => s.body)
    .filter(isFact)
    .filter((b) => b.fact == null);
