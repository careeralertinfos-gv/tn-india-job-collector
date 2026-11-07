## What does TN India Job Collector do?

**TN India Job Collector** collects recent job listings from employer career feeds on Greenhouse and SmartRecruiters, plus LinkedIn and Naukri when enabled. It keeps records with a reliable posting timestamp from the previous 24 hours, removes likely duplicates, and places Tamil Nadu roles first. Run it on the [Apify platform](https://apify.com/) to access the dataset, API, schedules, integrations, run monitoring, and Blogger-ready HTML output.

The LinkedIn and Naukri integrations use the community Actors `curious_coder/linkedin-jobs-scraper` and `muhammetakkurtt/naukri-job-scraper`. These are paid per-result services; review their current Store pricing and test with small limits before scheduling regular runs.

## Why use TN India Job Collector?

Checking each career site manually takes time and makes it easy to miss new openings. This Actor brings supported sources into one dataset, prioritizes Tamil Nadu while retaining other India-wide results, and provides direct application links. It can help job seekers review new openings, publishers prepare daily job roundups, and teams monitor hiring trends.

Results depend on the configured companies, the community Actors’ coverage and limits, and the source sites’ availability. This is not a guarantee of every job posted online.

## How to use TN India Job Collector

1. Open the Actor’s **Input** tab.
2. Leave LinkedIn and Naukri enabled for portal searches, or disable either source to avoid its Store Actor call.
3. Optionally enter a role keyword. Leave it empty for a broad search.
4. Keep the external search cap at 10 for an initial cost test.
5. Add Greenhouse board tokens or SmartRecruiters company identifiers if you also want employer-feed results.
6. Start a run and inspect the dataset and logs. Only listings with a reliable timestamp in the last 24 hours are kept.
7. After deploying the Actor, create a daily Apify Schedule for **20:00 Asia/Kolkata** if that is the desired delivery time.

## Input

Use the **Input** tab to configure:

| Input | Purpose |
| --- | --- |
| `enableLinkedInJobs` / `enableNaukriJobs` | Enable or disable each paid community Actor; both are enabled by default. |
| `maxExternalJobsPerSearch` | Maximum requested results per location search, from 1 to 50. There are separate Tamil Nadu and India searches for each enabled portal. The default 10 is intended for cost-controlled testing. |
| `maxExternalChargePerSearchUsd` | Maximum event charge passed to each paid child run. Naukri requires at least $0.10 per run; with all four searches enabled the configured caps can total $0.40. |
| `externalSearchKeyword` | Optional role or keyword passed to LinkedIn and Naukri. |
| `greenhouseBoards` / `smartRecruitersCompanies` | Optional company boards or identifiers for employer feeds. |
| `targetLocations` | Location substrings used for filtering. The default includes `India`, so it retains India-wide matches; Tamil Nadu locations are ordered first. |
| `keywords` | Optional final title/location filter. A job must match at least one keyword when provided. |
| `maxJobsPerBoard` | Per-company cap for Greenhouse and SmartRecruiters. |

The portal Actors receive a Tamil Nadu search and an India-wide search. The Actor deduplicates overlapping results before saving them. LinkedIn's relative posting time is used when an exact timestamp is unavailable; listings with no usable timestamp are excluded because they cannot be verified as posted within the exact 24-hour window.

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

## Pricing / Cost estimation

### How much does it cost to collect India job listings?

LinkedIn and Naukri are paid per-result Actors. At the listed starting rates checked during setup, 10 results from each of the two searches on each portal would be approximately **$0.036** in result charges (20 LinkedIn results at $1.00/1,000 plus 20 Naukri results at $0.80/1,000). Actual charges can differ by Store pricing, discounts, results returned, and platform usage. Check both Actors’ current Pricing tabs before running them.

The limit is per search, not per portal: each enabled portal can return up to twice `maxExternalJobsPerSearch`. A `maxItems` result cap and a per-child-run `maxTotalChargeUsd` limit are sent to Apify. Naukri requires a minimum $0.10 event-charge cap per child run; with both portals enabled, the four configured caps can total up to $0.40 per parent run, excluding any platform usage charges. Actual pay-per-event costs depend on returned results and can be lower than the cap. Begin with 10 and inspect the completed runs and billing before increasing it or creating a daily schedule. Direct Greenhouse and SmartRecruiters API calls are separate from the community Actor result fees.

## Tips or Advanced options

- Start with a low external result limit and test one portal at a time if you want to compare quality and charges.
- Set `externalSearchKeyword` to a role such as `software engineer` to narrow paid portal searches.
- Tamil Nadu listings sort before other India locations; the dataset is still India-wide.
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
