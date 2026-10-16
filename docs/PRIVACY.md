# Privacy Policy: Jobmark

Last updated: 16 October 2026

Jobmark is a browser extension that keeps a private list of the jobs you save or apply for. Everything it records stays on your computer. It has no server, no account system and no analytics.

## What it stores

When you click **Save** or **Apply** on a supported job site, use **Save this job** on any page, or add a job by hand, Jobmark stores a record on your device: the job title, company, location, work type, salary and link, when you saved and applied, the status you give it, your notes, and how you applied.

Records live in your browser's local extension storage (`chrome.storage.local`) and are never sent anywhere. The extension also remembers your chosen table columns, your settings, the date of your last backup and the day's warm line.

## What it reads

- **On Seek (Australia and New Zealand) and LinkedIn**, it reads the job on screen when you click Save or Apply. It also reads the page address to find which job is open and checks your saved jobs, so it can show a dot on the toolbar icon. It adds nothing to the page.
- **When you click Save this job**, it reads the current page once (title, main heading and any job posting data) to fill in the form. On Seek and LinkedIn it also asks its own script on the page for the job on screen. It does this only after your click, and on other websites it has no standing access.
- It does not crawl or automate anything, and it never touches your messages, profile or account details.

## Daily line and on-device AI

The popup and the sheet end with a short, warm line. If Chrome's built-in on-device AI model is already downloaded, Jobmark asks it to write the line. The request says only whether your week was quiet, active or your best so far, with no job details, and the model runs on your device. Jobmark never starts the model download. Otherwise the line comes from a fixed set of messages.

A line written by the model has a small info icon. You can turn the AI off in Settings (the gear in the sheet).

## What it does not do

- It makes **no network requests**. Nothing is uploaded, synced or shared.
- It has **no accounts, analytics, telemetry, advertising or tracking**.
- It loads no remote code, fonts or images.
- It never sells or shares your data, and has no access to it outside your device.

**Export** (CSV or Excel) and **Back up** (JSON) create files that your browser saves to your computer. The extension does not send them anywhere.

## Permissions

| Permission                                                 | Why                                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `storage`                                                  | Save your job records on your device                                   |
| `activeTab`                                                | Let **Save this job** read the page you are on, only after you click   |
| `scripting`                                                | Run the small reader for **Save this job** in that page                |
| Access to `au.seek.com`, `nz.seek.com`, `www.linkedin.com` | Detect Save and Apply clicks and show a dot for jobs you have recorded |

## Your data

Records stay until you delete them in the sheet or remove the extension. **Removing the extension deletes all of its data**, so use **Back up** first. **Import** brings a backup back.

## Changes

If the extension ever changes what it collects or sends, this policy will be updated before the change ships.

## Not affiliated

Jobmark is independent and not affiliated with, endorsed by or sponsored by Seek or LinkedIn.

## Contact

Questions or concerns: open an issue at <https://github.com/mr-kh13/job-marker/issues>.
