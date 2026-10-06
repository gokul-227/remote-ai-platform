# Request dependencies

Path variables are captured automatically: a list or create request stores the id of the item it returns,
and every request under that resource reuses it. Run the *Set by* request first (a full collection run
already does — folders and requests are ordered so producers come first).

| Variable | Set by | Used by |
| --- | --- | --- |
| `{{application_id}}` | *(set it in your environment)* | Applications › Withdraw Application<br>Applications › Respond To Invitation<br>Applications › Update Application Status |
| `{{comment_id}}` | Social Feed › Add a comment to a post<br>Social Feed › List post comments | Social Feed › Delete a comment |
| `{{company_id}}` | Job Posts › List Company Jobs | Job Posts › List Public Company Jobs<br>Company Profiles › Get Company By Id |
| `{{connection_id}}` | *(set it in your environment)* | Network › Update Connection<br>Network › Remove Connection |
| `{{contract_id}}` | Contracts › Create contract | Contracts › Digital sign contract<br>Contracts › Terminate contract<br>Contracts › Add milestone<br>Contracts › Get contract details<br>Contracts › Update contract<br>Contracts › Update contract milestone status |
| `{{conversation_id}}` | *(set it in your environment)* | Network › Send Message<br>Network › Message History |
| `{{engineer_id}}` | *(set it in your environment)* | Applications › Invite Engineer |
| `{{entry_id}}` | *(set it in your environment)* | Projects › Void Work Ledger Entry |
| `{{group_id}}` | groups › Create Group<br>groups › List Groups | groups › Join Group<br>groups › Leave Group<br>groups › Create Group Post<br>groups › List Members<br>groups › List Group Posts<br>groups › Get Group<br>groups › Update Group<br>groups › Update Member Role<br>groups › Delete Group<br>groups › Delete Group Post |
| `{{job_id}}` | Job Posts › Create Job<br>Job Posts › List Jobs | Job Posts › List Similar Jobs<br>Job Posts › Get Job By Id<br>Job Posts › Update Job<br>AI Matching Engine › Get My Match For Job<br>AI Matching Engine › Get Candidates For Job<br>Admin Operations › Update Job Status<br>Admin Operations › Delete Job<br>Saved Jobs › Save Job<br>Saved Jobs › Unsave Job<br>Applications › Apply To Job<br>Applications › Invite Engineer |
| `{{match_id}}` | *(set it in your environment)* | AI Matching Engine › Update Match Status |
| `{{milestone_id}}` | Contracts › Add milestone | Contracts › Update contract milestone status<br>Projects › Update Milestone Status |
| `{{notification_id}}` | *(set it in your environment)* | Notifications › Mark Read |
| `{{offer_id}}` | *(set it in your environment)* | Projects › Respond To Task Offer<br>Projects › Cancel Task Offer |
| `{{payment_id}}` | *(set it in your environment)* | Projects › Release Sandbox Payment<br>Projects › Refund Sandbox Payment<br>Payments & Financial Ledger › Release escrow payment<br>Payments & Financial Ledger › Refund escrow payment |
| `{{post_id}}` | Social Feed › Create a post<br>groups › Create Group Post<br>groups › List Group Posts | Social Feed › Toggle like on a post<br>Social Feed › Add a comment to a post<br>Social Feed › List post comments<br>Social Feed › Get single post<br>Social Feed › Update own post<br>Social Feed › Delete own post<br>Social Feed › Delete a comment<br>groups › Delete Group Post |
| `{{profile_id}}` | Engineer Profiles › List Engineers | Engineer Profiles › Get Engineer By Id |
| `{{project_id}}` | *(set it in your environment)* | Projects › Create Project Review<br>Projects › Create Sandbox Escrow<br>Projects › Generate Project Plan<br>Projects › Approve Project Plan<br>Projects › Generate Progress Summary<br>Projects › Generate Risk Analysis<br>Projects › Generate Documentation<br>Projects › List Milestones<br>Projects › List Project Tasks<br>Projects › List Project Ledger<br>Projects › List Project Payments<br>Projects › List Project Reviews<br>Projects › List Ai Reports<br>Projects › List Project Activity<br>Projects › Project Detail<br>Projects › Update Project Status |
| `{{report_id}}` | *(set it in your environment)* | Moderation › Decide Report |
| `{{submission_id}}` | *(set it in your environment)* | Projects › Ai Review Submission<br>Projects › Review Task Submission |
| `{{task_id}}` | *(set it in your environment)* | Projects › Record Work Ledger Entry<br>Projects › Create Task Offer<br>Projects › Submit Task Work<br>Projects › Add Task Dependency<br>Projects › Add Task Comment<br>Projects › List Task Submissions<br>Projects › Update Task |
| `{{user_id}}` | Admin Operations › List All Users<br>Trust & Reputation › Submit project review<br>Trust & Reputation › Add verification badge<br>Trust & Reputation › Admin verification queue<br>groups › List Members | groups › Update Member Role<br>Trust & Reputation › Get explainable trust score<br>Trust & Reputation › List user reviews<br>Trust & Reputation › List user verifications<br>Admin Operations › Update User Status<br>Admin Operations › Update User Role<br>Admin Operations › Delete User<br>Projects › Get Reputation<br>Network › Unblock User |
| `{{verification_id}}` | Trust & Reputation › Add verification badge<br>Trust & Reputation › Admin verification queue | Trust & Reputation › Admin: verify or reject a submitted credential |

## Session

| Variable | Set by | Used by |
| --- | --- | --- |
| `{{access_token}}` | Sign in › Verify code, or automatically (collection script) | every request that needs a signed-in user |
| `{{refresh_token}}` | Sign in › Verify code / Refresh session | the collection script, to renew the token |
