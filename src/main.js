import { Actor } from 'apify';

await Actor.init();

function cleanText(value = '') {
    return value
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

    const normalizedValue = value.toLowerCase();
    return terms.some((term) => normalizedValue.includes(term.toLowerCase()));
}

function createBloggerHtml(job) {
    const details = [
        ['Company', job.company],
        ['Location', job.location],
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

try {
    const input = (await Actor.getInput()) ?? {};

    const greenhouseBoards = input.greenhouseBoards ?? [];
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

    if (!greenhouseBoards.length) {
        throw new Error('Add at least one Greenhouse board in the actor input.');
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
            const description = cleanText(sourceJob.content);
            const searchableText = `${title} ${location}`;

            if (!matchesAny(location, targetLocations)) continue;
            if (keywords.length && !matchesAny(searchableText, keywords)) continue;

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
                description,
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

    console.log(`Collected ${collectedJobs} matching Greenhouse jobs.`);
} finally {
    await Actor.exit();
}
