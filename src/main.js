import { Actor } from 'apify';
import { log } from 'apify/log';
import {
    deduplicateAndPrioritizeJobs,
    isPostedWithinLast24Hours,
    isTamilNaduLocation,
    normalizeLinkedInJob,
    normalizeNaukriJob,
} from './job-utils.js';

await Actor.init();

function cleanText(value = '') {
    return String(value ?? '')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function matchesAny(value, terms) {
    if (!terms.length) return true;

    const normalizedValue = String(value).toLowerCase();
    return terms.some((term) => normalizedValue.includes(String(term).toLowerCase()));
}

function createBloggerHtml(job) {
    const details = [
        ['Company', job.company],
        ['Location', job.location],
        ['Employment type', job.job_type],
        ['Experience level', job.experience_level],
        ['Department', job.department],
        ['Posted at', job.posted_at],
    ].filter(([, value]) => value);

    const detailHtml = details
        .map(([label, value]) => `<p><strong>${label}:</strong> ${escapeHtml(value)}</p>`)
        .join('');

    const descriptionHtml = job.description
        ? `<h3>Job description</h3><p>${escapeHtml(job.description)}</p>`
        : '';

    return [
        `<h2>${escapeHtml(job.title)}</h2>`,
        detailHtml,
        descriptionHtml,
        `<p><a href="${escapeHtml(job.apply_url)}" rel="nofollow">Apply on the company careers page</a></p>`,
        `<p><small>Source: ${escapeHtml(job.source_name)}</small></p>`,
    ].join('\n');
}

function smartRecruitersDescription(jobDetails) {
    const sections = jobDetails.jobAd?.sections ?? {};

    return Object.values(sections)
        .map((section) => {
            if (typeof section === 'string') return section;
            if (section && typeof section === 'object') {
                return section.text ?? section.content ?? '';
            }
            return '';
        })
        .join(' ');
}

function isRelevantJob(title, location, targetLocations, keywords, collectAllLocations, sourceSearchIsIndiaWide = false) {
    const matchesLocation = matchesAny(location, targetLocations);
    const indiaIsTargeted = sourceSearchIsIndiaWide && matchesAny('India', targetLocations);
    if (!collectAllLocations && !matchesLocation && !indiaIsTargeted) {
        return false;
    }

    if (keywords.length && !matchesAny(`${title} ${location}`, keywords)) {
        return false;
    }

    return true;
}

async function runStoreActor(actorId, actorInput, maxItems, maxTotalChargeUsd) {
    log.info(
        `Starting ${actorId} with a maximum of ${maxItems} results and $${maxTotalChargeUsd.toFixed(2)} in event charges.`,
    );
    const run = await Actor.call(actorId, actorInput, {
        maxItems,
        maxTotalChargeUsd,
        waitSecs: 300,
    });

    if (run.status !== 'SUCCEEDED') {
        throw new Error(`${actorId} finished with status ${run.status ?? 'unknown'}.`);
    }

    if (!run.defaultDatasetId) {
        throw new Error(`${actorId} completed without a default dataset.`);
    }

    const dataset = await Actor.openDataset(run.defaultDatasetId);
    const { items } = await dataset.getData({ limit: maxItems });
    log.info(`${actorId} returned ${items.length} jobs.`);
    return items;
}

try {
    const input = (await Actor.getInput()) ?? {};

    const greenhouseBoards = input.greenhouseBoards ?? [];
    const smartRecruitersCompanies = input.smartRecruitersCompanies ?? [];
    const enableLinkedInJobs = input.enableLinkedInJobs !== false;
    const enableNaukriJobs = input.enableNaukriJobs !== false;
    const externalSearchKeyword = input.externalSearchKeyword?.trim() ?? '';
    const maxExternalJobsPerSearch = input.maxExternalJobsPerSearch ?? 10;
    const maxExternalChargePerSearchUsd = input.maxExternalChargePerSearchUsd ?? 0.02;
    const collectionStartedAt = Date.now();
    const targetLocations = input.targetLocations ?? [
        'Tamil Nadu',
        'Chennai',
        'Coimbatore',
        'Madurai',
        'Tiruchirappalli',
        'Hosur',
        'Salem',
        'Tirunelveli',
        'India',
    ];
    const keywords = input.keywords ?? [];
    const maxJobsPerBoard = input.maxJobsPerBoard ?? 25;
    const collectAllLocations = input.collectAllLocations === true;

    if (!greenhouseBoards.length && !smartRecruitersCompanies.length && !enableLinkedInJobs && !enableNaukriJobs) {
        throw new Error('Enable LinkedIn or Naukri, or configure at least one Greenhouse board or SmartRecruiters company.');
    }

    const collectedJobs = [];

    for (const board of greenhouseBoards) {
        const token = board.token?.trim();
        const company = board.company?.trim() || token;

        if (!token) {
            log.warning('Skipping a Greenhouse board without a token.');
            continue;
        }

        const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
            log.warning(`Could not load ${company}: ${response.status} ${response.statusText}`);
            continue;
        }

        const data = await response.json();
        const jobs = Array.isArray(data.jobs) ? data.jobs : [];
        let collectedForBoard = 0;
        let jobsWithoutPostingDate = 0;

        for (const sourceJob of jobs) {
            if (collectedForBoard >= maxJobsPerBoard) {
                break;
            }

            const title = cleanText(sourceJob.title);
            const location = cleanText(sourceJob.location?.name);

            if (!isRelevantJob(title, location, targetLocations, keywords, collectAllLocations)) {
                continue;
            }

            const postedAt = sourceJob.first_published_at ?? sourceJob.created_at ?? null;
            if (!isPostedWithinLast24Hours(postedAt, collectionStartedAt)) {
                if (!postedAt) {
                    jobsWithoutPostingDate += 1;
                }
                continue;
            }

            const job = {
                job_key: `greenhouse:${token}:${sourceJob.id}`,
                title,
                company,
                location,
                remote_status: location.toLowerCase().includes('remote') ? 'Remote' : 'Not specified',
                job_type: null,
                experience_level: null,
                salary: null,
                department: cleanText(sourceJob.departments?.map((item) => item.name).join(', ')),
                description: cleanText(sourceJob.content),
                requirements: [],
                apply_url: sourceJob.absolute_url,
                source_url: sourceJob.absolute_url,
                source_name: `Greenhouse - ${company}`,
                source_type: 'Direct employer',
                source_job_id: String(sourceJob.id),
                source_updated_at: sourceJob.updated_at ?? null,
                posted_at: postedAt,
                scraped_at: new Date().toISOString(),
            };

            collectedJobs.push(job);
            collectedForBoard += 1;
        }

        if (jobsWithoutPostingDate) {
            log.warning(
                `Excluded ${jobsWithoutPostingDate} Greenhouse jobs from ${company} because the feed did not provide posting timestamps.`,
            );
        }
    }

    for (const source of smartRecruitersCompanies) {
        const identifier = source.identifier?.trim();
        const configuredCompany = source.company?.trim() || identifier;

        if (!identifier) {
            log.warning('Skipping a SmartRecruiters company without an identifier.');
            continue;
        }

        const pageSize = 100;
        let offset = 0;
        let collectedForCompany = 0;
        while (collectedForCompany < maxJobsPerBoard) {
            const listUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(identifier)}/postings?limit=${pageSize}&offset=${offset}`;
            const listResponse = await fetch(listUrl);

            if (!listResponse.ok) {
                log.warning(`Could not load ${configuredCompany} postings at offset ${offset}: ${listResponse.status} ${listResponse.statusText}`);
                break;
            }

            const listData = await listResponse.json();
            const postings = Array.isArray(listData.content) ? listData.content : [];
            log.info(`${configuredCompany}: loaded ${postings.length} postings at offset ${offset} of ${listData.totalFound ?? 'unknown'}`);

            if (postings.length === 0) {
                break;
            }

            for (const posting of postings) {
                const postingId = posting.id ?? posting.postingId;
                const title = cleanText(posting.name ?? posting.title);
                const countryCode = cleanText(posting.location?.country);
                const country = countryCode.toLowerCase() === 'in' ? 'India' : countryCode;

                const location = cleanText([
                    posting.location?.city,
                    posting.location?.region,
                    country,
                ].filter(Boolean).join(', '));
                if (!postingId || !isRelevantJob(title, location, targetLocations, keywords, collectAllLocations)) {
                    continue;
                }
                if (posting.releasedDate && !isPostedWithinLast24Hours(posting.releasedDate, collectionStartedAt)) {
                    continue;
                }

                let details = {};

                try {
                    const detailsUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(identifier)}/postings/${encodeURIComponent(postingId)}`;
                    const detailsResponse = await fetch(detailsUrl);

                    if (detailsResponse.ok) {
                        details = await detailsResponse.json();
                    } else {
                        log.warning(`Could not load details for ${configuredCompany} job ${postingId}.`);
                    }
                } catch (error) {
                    log.warning(`Could not load details for ${configuredCompany} job ${postingId}: ${error.message}`);
                }

                const postedAt = posting.releasedDate ?? details.releasedDate ?? null;
                if (!isPostedWithinLast24Hours(postedAt, collectionStartedAt)) {
                    continue;
                }

                const company = cleanText(posting.company?.name ?? configuredCompany);
                const job = {
                    job_key: `smartrecruiters:${identifier}:${postingId}`,
                    title,
                    company,
                    location,
                    remote_status: location.toLowerCase().includes('remote') ? 'Remote' : 'Not specified',
                    job_type: cleanText(posting.typeOfEmployment?.label ?? details.typeOfEmployment?.label),
                    experience_level: cleanText(posting.experienceLevel?.label ?? details.experienceLevel?.label),
                    salary: null,
                    department: cleanText(posting.department?.label ?? details.department?.label),
                    description: cleanText(smartRecruitersDescription(details)),
                    requirements: [],
                    apply_url: `https://jobs.smartrecruiters.com/${encodeURIComponent(identifier)}/${encodeURIComponent(postingId)}`,
                    source_url: `https://jobs.smartrecruiters.com/${encodeURIComponent(identifier)}/${encodeURIComponent(postingId)}`,
                    source_name: `SmartRecruiters - ${company}`,
                    source_type: 'Direct employer',
                    source_job_id: String(postingId),
                    source_updated_at: postedAt,
                    posted_at: postedAt,
                    scraped_at: new Date().toISOString(),
                };

                collectedJobs.push(job);
                collectedForCompany += 1;

                if (collectedForCompany >= maxJobsPerBoard) {
                    break;
                }
            }

            offset += postings.length;
            if (postings.length < pageSize || offset >= (listData.totalFound ?? Infinity)) {
                break;
            }
        }
    }

    const searchKeyword = externalSearchKeyword;

    if (enableLinkedInJobs) {
        for (const location of ['Tamil Nadu', 'India']) {
            const linkedinInput = {
                keywords: searchKeyword || undefined,
                location,
                datePosted: 'past24Hours',
                autoConvertToAiSearch: true,
                scrapeCompany: false,
                limitPerSource: maxExternalJobsPerSearch,
                splitByLocation: false,
            };
            const sourceJobs = await runStoreActor(
                'curious_coder/linkedin-jobs-scraper',
                linkedinInput,
                maxExternalJobsPerSearch,
                maxExternalChargePerSearchUsd,
            );
            collectedJobs.push(...sourceJobs.map((job) => normalizeLinkedInJob(job)));
        }
    }

    if (enableNaukriJobs) {
        const keywordSlug = searchKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const tamilNaduSearchUrl = `https://www.naukri.com/${keywordSlug ? `${keywordSlug}-` : ''}jobs-in-tamil-nadu`;
        const indiaSearchUrl = `https://www.naukri.com/${keywordSlug ? `${keywordSlug}-` : ''}jobs-in-india`;

        for (const search of [
            { name: 'Tamil Nadu', searchUrl: tamilNaduSearchUrl },
            { name: 'India', searchUrl: indiaSearchUrl },
        ]) {
            const naukriInput = {
                jobBoard: 'naukri',
                maxJobs: maxExternalJobsPerSearch,
                freshness: '1',
                sortBy: 'date',
                fetchDetails: false,
                searchUrl: search.searchUrl,
            };
            const sourceJobs = await runStoreActor(
                'muhammetakkurtt/naukri-job-scraper',
                naukriInput,
                maxExternalJobsPerSearch,
                maxExternalChargePerSearchUsd,
            );
            log.info(`Naukri ${search.name} search returned ${sourceJobs.length} raw jobs.`);
            collectedJobs.push(...sourceJobs.map((job) => normalizeNaukriJob(job)));
        }
    }

    const recentJobs = collectedJobs.filter((job) =>
        isPostedWithinLast24Hours(job.posted_at, collectionStartedAt),
    );
    const relevantJobs = recentJobs.filter((job) =>
        isRelevantJob(
            job.title,
            job.location,
            targetLocations,
            keywords,
            collectAllLocations,
            job.source_name === 'LinkedIn' || job.source_name === 'Naukri',
        ),
    );
    const prioritizedJobs = deduplicateAndPrioritizeJobs(relevantJobs);

    for (const job of prioritizedJobs) {
        job.blogger_html = createBloggerHtml(job);
        await Actor.pushData(job);
    }

    const missingPostingDates = collectedJobs.filter((job) => !job.posted_at).length;
    const tamilNaduJobs = prioritizedJobs.filter((job) => isTamilNaduLocation(job.location)).length;
    if (missingPostingDates) {
        log.warning(`Excluded ${missingPostingDates} jobs without a reliable posting timestamp from the 24-hour results.`);
    }
    log.info(
        `Collected ${prioritizedJobs.length} unique jobs posted in the last 24 hours (${tamilNaduJobs} Tamil Nadu, ${prioritizedJobs.length - tamilNaduJobs} other India locations); Tamil Nadu jobs are listed first.`,
    );
} finally {
    await Actor.exit();
}
