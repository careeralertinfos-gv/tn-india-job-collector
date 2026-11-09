## What does TN India Job Collector do?

**TN India Job Collector** collects recent job listings from employer career feeds on Greenhouse and SmartRecruiters, plus LinkedIn and Naukri when enabled. It keeps records with a reliable posting timestamp from the previous 24 hours, removes likely duplicates, and places Tamil Nadu roles first. Run it on the [Apify platform](https://apify.com/) to access the dataset, API, schedules, integrations, run monitoring, and Blogger-ready HTML output.

The LinkedIn and Naukri integrations use the community Actors `curious_coder/linkedin-jobs-scraper` and `muhammetakkurtt/naukri-job-scraper`. Each enabled portal starts one child run focused on Chennai, Tamil Nadu. These are paid per-result services; review their current Store pricing and test with small limits before scheduling regular runs.

## Why use TN India Job Collector?

Checking each career site manually takes time and makes it easy to miss new openings. This Actor brings supported sources into one dataset, focuses portal searches on Chennai and Tamil Nadu, and provides direct application links. It can help job seekers review new openings, publishers prepare daily job roundups, and teams monitor hiring trends.

Results depend on the configured companies, the community Actors’ coverage and limits, and the source sites’ availability. This is not a guarantee of every job posted online.

## How to use TN India Job Collector

1. Open the Actor’s **Input** tab.
2. Leave LinkedIn and Naukri enabled for portal searches, or disable either source to avoid its Store Actor call.
3. Optionally enter a role keyword. Leave it empty to search Chennai roles across the configured Software/IT and Data/AI job-title filters.
4. Keep the external search cap at 10 for an initial cost test.
5. Add Greenhouse board tokens or SmartRecruiters company identifiers if you also want employer-feed results.
6. Start a run and inspect the dataset and logs. Only listings with a reliable timestamp in the last 24 hours are kept.
7. After deploying the Actor, create a daily Apify Schedule for **20:00 Asia/Kolkata** if that is the desired delivery time.

## Input

Use the **Input** tab to configure:

| Input | Purpose |
| --- | --- |
| `enableLinkedInJobs` / `enableNaukriJobs` | Enable or disable each paid community Actor; both are enabled by default. |
| `maxExternalJobsPerSearch` | Maximum results imported from each enabled portal, from 1 to 50. Each portal runs one Chennai search. Naukri requires a minimum child input of 50 jobs, but the collector imports only this configured limit. The default 10 is intended for cost-controlled testing. |
| `maxExternalChargePerSearchUsd` | Maximum event charge passed to each paid child run. Naukri requires at least $0.10 per run; with both portals enabled the configured caps can total $0.20. |
| `externalSearchKeyword` | Optional single role or keyword passed to LinkedIn and Naukri to narrow their searches. |
| `greenhouseBoards` / `smartRecruitersCompanies` | Optional company boards or identifiers for employer feeds. |
| `targetLocations` | Location substrings used for filtering. The default targets Tamil Nadu and Chennai. |
| `keywords` | Defaults to the agreed Software/IT and Data/AI role list. Filters job titles and locations after scraping; clear or edit it to change which results are saved. It does not reduce child Actor charges. |
| `maxJobsPerBoard` | Per-company cap for Greenhouse and SmartRecruiters. |

Each enabled portal receives one Chennai search, reducing duplicate searches and child-run charges. The default role filter covers Software/IT and Data/AI titles; use `externalSearchKeyword` to narrow the portal query to one role, or edit/clear `keywords` to change the final title filter. The collector deduplicates overlapping postings before saving them. Relative posting dates are parsed when supported; jobs without a usable date or outside the last 24 hours are excluded.

## Output

Each dataset item includes normalized job details and `blogger_html`. Example:

```json
{
  "job_key": "linkedin:123456",
  "title": "Software Engineer",
  "company": "Example Company",
  "location": "Chennai, Tamil Nadu, India",
  "posted_at": "2026-11-07T10:00:00.000Z",
  "job_type": "Full-time",
  "apply_url": "https://www.linkedin.com/jobs/view/123456",
  "source_name": "LinkedIn"
}
```

You can download the dataset in various formats such as JSON, HTML, CSV, or Excel.

## Data table

| Field | Description |
| --- | --- |
| `title`, `company`, `location` | Job title, employer, and listed location |
| `posted_at` | Parsed posting timestamp; only jobs in the previous 24 hours are emitted |
| `job_type`, `experience_level`, `salary` | Employment, experience, and compensation details when available |
| `description`, `requirements` | Source-provided job information when available |
| `apply_url`, `source_url` | Application and source posting links |
| `source_name`, `source_type`, `job_key` | Origin and deduplication identifiers |
| `blogger_html` | Escaped HTML fragment suitable for preparing a Blogger post |

Missing compensation or other source fields remain blank; the Actor does not infer them.
If the LinkedIn source omits an application URL but includes a numeric LinkedIn job ID, the collector constructs a standard LinkedIn job-view link. It leaves the URL blank when neither a source link nor a usable numeric ID is available.

## Pricing / Cost estimation

### How much does it cost to collect India job listings?

LinkedIn and Naukri are paid per-result Actors. At the listed starting rates checked during setup, 10 results from each portal would be approximately **$0.018** in result charges (10 LinkedIn results at $1.00/1,000 plus 10 Naukri results at $0.80/1,000). Actual charges can differ by Store pricing, discounts, results returned, and platform usage. Check both Actors’ current Pricing tabs before running them.

The result limit applies once per enabled portal and caps how many results the parent imports; it is also passed as Apify's `maxItems` cap. Naukri rejects child input limits below 50, so the child may fetch more jobs than the parent imports. A per-child-run `maxTotalChargeUsd` limit is also sent to Apify. Naukri requires a minimum $0.10 event-charge cap per child run; with both portals enabled, the two configured caps can total up to $0.20 per parent run, excluding any platform usage charges. Actual pay-per-event costs depend on returned results and can be lower than the cap. Begin with 10 and inspect the completed runs and billing before increasing it or creating a daily schedule. Direct Greenhouse and SmartRecruiters API calls are separate from the community Actor result fees.

## Tips or Advanced options

- Start with a low external result limit and disable a portal if you want to compare source quality and charges.
- Set `externalSearchKeyword` to a role such as `software engineer` to narrow LinkedIn and Naukri searches. This is the best way to reduce broad, less relevant LinkedIn results.
- The default `keywords` list filters saved job titles to Software/IT and Data/AI roles after collection. This improves relevance, but only `externalSearchKeyword` and the child result limit affect the portal search itself.
- Portal searches target Chennai, Tamil Nadu. Greenhouse and SmartRecruiters results are limited by the configured target locations.
- LinkedIn's date filter and Naukri's one-day freshness filter are supplemented by a strict timestamp check. LinkedIn relative timestamps are interpreted relative to collection time; Naukri local timestamps are interpreted as India Standard Time.
- Greenhouse does not always provide a true posting timestamp. Such records are excluded rather than using an update timestamp as a posting date.
- The Actor prepares HTML but does not publish to Blogger. Publishing requires a separate integration and credentials.

## FAQ, disclaimers, and support

### Does this collect every job posted today?

No. It collects results returned by configured sources and community Actors, subject to their coverage and per-search caps. A daily run at 20:00 IST also only covers the 24-hour window before that run.

### How do I schedule a daily run?

After deploying the Actor, create a schedule in Apify Console and select the daily 20:00 time in the `Asia/Kolkata` timezone. Scheduling is configured in the Apify Console, not by running this source code locally.

### Is scraping allowed?

Use these sources responsibly and comply with each site’s terms, applicable laws, privacy requirements, and the community Actors’ usage terms. The Actor is intended to collect public job information, not personal contact data.

For problems or feature requests, use the Actor’s **Issues** tab. Custom integrations or additional career systems can be added as separate, tested sources.
