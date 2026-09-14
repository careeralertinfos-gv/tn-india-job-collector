import { Actor } from 'apify';

await Actor.init();

function cleanText(value = '') {
    return String(value)
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
        ['Last updated', job.source_updated_at],
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

function isRelevantJob(title, location, targetLocations, keywords, collectAllLocations) {
    if (!collectAllLocations && !matchesAny(location, targetLocations)) {
        return false;
    }

    if (keywords.length && !matchesAny(`${title} ${location}`, keywords)) {
        return false;
    }

    return true;
}

try {
    const input = (await Actor.getInput()) ?? {};

    const greenhouseBoards = input.greenhouseBoards ?? [];
    const smartRecruitersCompanies = input.smartRecruitersCompanies ?? [];
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

    if (!greenhouseBoards.length && !smartRecruitersCompanies.length) {
        throw new Error('Add at least one Greenhouse board or SmartRecruiters company.');
    }

    let collectedJobs = 0;

    for (const board of greenhouseBoards) {
        const token = board.token?.trim();
        const company = board.company?.trim() || token;

        if (!token) {
            console.warn('Skipping a Greenhouse board without a token.');
            continue;
        }

        const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
            console.warn(`Could not load ${company}: ${response.status} ${response.statusText}`);
            continue;
        }

        const data = await response.json();
        const jobs = Array.isArray(data.jobs) ? data.jobs.slice(0, maxJobsPerBoard) : [];

        for (const sourceJob of jobs) {
            const title = cleanText(sourceJob.title);
            const location = cleanText(sourceJob.location?.name);

            if (!isRelevantJob(title, location, targetLocations, keywords, collectAllLocations)) {
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
                posted_at: null,
                scraped_at: new Date().toISOString(),
            };

            job.blogger_html = createBloggerHtml(job);
            await Actor.pushData(job);
            collectedJobs += 1;
        }
    }

    for (const source of smartRecruitersCompanies) {
        const identifier = source.identifier?.trim();
        const configuredCompany = source.company?.trim() || identifier;

        if (!identifier) {
            console.warn('Skipping a SmartRecruiters company without an identifier.');
            continue;
        }

        const listUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(identifier)}/postings?limit=100&country=IN`;
        const listResponse = await fetch(listUrl);

        if (!listResponse.ok) {
            console.warn(`Could not load ${configuredCompany}: ${listResponse.status} ${listResponse.statusText}`);
            continue;
        }

        const listData = await listResponse.json();
        const postings = Array.isArray(listData.content)
    ? listData.content.slice(0, maxJobsPerBoard)
    : [];

        for (const posting of postings) {
            const postingId = posting.id ?? posting.postingId;
            const title = cleanText(posting.name ?? posting.title);
            const location = cleanText([
                posting.location?.city,
                posting.location?.region,
                posting.location?.country,
            ].filter(Boolean).join(', '));

            if (!postingId || !isRelevantJob(title, location, targetLocations, keywords, collectAllLocations)) {
                continue;
            }

            let details = {};

            try {
                const detailsUrl = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(identifier)}/postings/${encodeURIComponent(postingId)}`;
                const detailsResponse = await fetch(detailsUrl);

                if (detailsResponse.ok) {
                    details = await detailsResponse.json();
                } else {
                    console.warn(`Could not load details for ${configuredCompany} job ${postingId}.`);
                }
            } catch (error) {
                console.warn(`Could not load details for ${configuredCompany} job ${postingId}: ${error.message}`);
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
                source_updated_at: posting.releasedDate ?? details.releasedDate ?? null,
                posted_at: posting.releasedDate ?? details.releasedDate ?? null,
                scraped_at: new Date().toISOString(),
            };

            job.blogger_html = createBloggerHtml(job);
            await Actor.pushData(job);
            collectedJobs += 1;
        }
    }

    console.log(`Collected ${collectedJobs} matching jobs.`);
} finally {
    await Actor.exit();
}
