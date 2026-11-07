export function cleanText(value = '') {
    return String(value ?? '')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function matchesAny(value, terms) {
    if (!terms.length) return true;

    const normalizedValue = String(value).toLowerCase();
    return terms.some((term) => normalizedValue.includes(String(term).toLowerCase()));
}

export function parsePostedAt(value, timeZone = null) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        const milliseconds = value < 1e12 ? value * 1000 : value;
        const date = new Date(milliseconds);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }

    if (typeof value !== 'string' || !value.trim()) return null;

    let normalized = value.trim();
    if (/^\d{10,13}$/.test(normalized)) {
        return parsePostedAt(Number(normalized));
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

    if (timeZone && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(normalized)) {
        normalized = `${normalized.replace(' ', 'T')}${timeZone}`;
    }

    const timestamp = Date.parse(normalized);
    return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function isPostedWithinLast24Hours(postedAt, now = Date.now()) {
    const parsedDate = parsePostedAt(postedAt);
    if (!parsedDate) return false;

    const timestamp = Date.parse(parsedDate);
    return timestamp <= now && timestamp >= now - 24 * 60 * 60 * 1000;
}

export function isTamilNaduLocation(location = '') {
    return /\b(tamil\s+nadu|chennai|madurai|coimbatore|tiruchirappalli|trichy|tirunelveli|tiruppur|salem|hosur|erode|vellore|thanjavur|thoothukudi|tuticorin|dindigul|karur|namakkal|cuddalore|nagercoil|kanchipuram|tn)\b/i.test(
        String(location),
    );
}

function getDescription(candidates) {
    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return cleanText(candidate);
    }
    return '';
}

function getSalary(value) {
    if (Array.isArray(value)) return value.map(cleanText).filter(Boolean).join(' - ') || null;
    if (value && typeof value === 'object') return cleanText(JSON.stringify(value)) || null;
    return cleanText(value) || null;
}

function getRemoteStatus(location, explicitRemote, workplaceTypes = []) {
    const workplaceText = Array.isArray(workplaceTypes) ? workplaceTypes.join(' ') : workplaceTypes;
    if (explicitRemote === true || /\b(remote|work from home|hybrid)\b/i.test(`${location} ${workplaceText}`)) {
        return 'Remote or hybrid';
    }
    return 'Not specified';
}

export function normalizeLinkedInJob(sourceJob, scrapedAt = new Date().toISOString()) {
    const jobId = sourceJob.id ?? sourceJob.jobId;
    const postedAt = parsePostedAt(sourceJob.postedAtTimestamp ?? sourceJob.postedAt);
    const applyUrl = sourceJob.link ?? sourceJob.applyUrl ?? '';
    const location = cleanText(sourceJob.location);
    const company = cleanText(sourceJob.companyName ?? sourceJob.company);

    return {
        job_key: `linkedin:${jobId ?? applyUrl}`,
        title: cleanText(sourceJob.title),
        company,
        location,
        remote_status: getRemoteStatus(location, sourceJob.workRemoteAllowed, sourceJob.workplaceTypes),
        job_type: cleanText(sourceJob.employmentType),
        experience_level: cleanText(sourceJob.seniorityLevel),
        salary: getSalary(sourceJob.salaryInfo),
        department: cleanText(Array.isArray(sourceJob.jobFunction) ? sourceJob.jobFunction.join(', ') : sourceJob.jobFunction),
        description: getDescription([sourceJob.descriptionText, sourceJob.descriptionHtml]),
        requirements: [],
        apply_url: applyUrl,
        source_url: applyUrl,
        source_name: 'LinkedIn',
        source_type: 'Job board',
        source_job_id: jobId == null ? '' : String(jobId),
        source_updated_at: postedAt,
        posted_at: postedAt,
        scraped_at: scrapedAt,
    };
}

export function normalizeNaukriJob(sourceJob, scrapedAt = new Date().toISOString()) {
    const jobId = sourceJob.jobId ?? sourceJob.id;
    const postedAt = parsePostedAt(sourceJob.createdDate, '+05:30');
    const applyUrl = sourceJob.jdURL ?? sourceJob.url ?? '';
    const location = cleanText(Array.isArray(sourceJob.location) ? sourceJob.location.join(', ') : sourceJob.location);
    const company = cleanText(sourceJob.companyName ?? sourceJob.company);

    return {
        job_key: `naukri:${jobId ?? applyUrl}`,
        title: cleanText(sourceJob.title),
        company,
        location,
        remote_status: getRemoteStatus(location, false, sourceJob.workMode),
        job_type: cleanText(sourceJob.jobType ?? sourceJob.employmentType),
        experience_level: cleanText(sourceJob.experienceText ?? sourceJob.experience),
        salary: getSalary(sourceJob.salary),
        department: cleanText(sourceJob.roleCategory ?? sourceJob.department),
        description: getDescription([sourceJob.jobDescription, sourceJob.description]),
        requirements: Array.isArray(sourceJob.tagsAndSkills)
            ? sourceJob.tagsAndSkills.map(cleanText).filter(Boolean)
            : [],
        apply_url: applyUrl,
        source_url: applyUrl,
        source_name: 'Naukri',
        source_type: 'Job board',
        source_job_id: jobId == null ? '' : String(jobId),
        source_updated_at: postedAt,
        posted_at: postedAt,
        scraped_at: scrapedAt,
    };
}

function jobCompleteness(job) {
    return [
        job.source_type === 'Direct employer' ? 100 : 0,
        job.description ? 10 : 0,
        job.job_type ? 2 : 0,
        job.experience_level ? 2 : 0,
        job.salary ? 2 : 0,
    ].reduce((total, value) => total + value, 0);
}

export function deduplicateAndPrioritizeJobs(jobs) {
    const uniqueJobs = new Map();

    for (const job of jobs) {
        const fingerprint = [job.title, job.company, job.location]
            .map((value) => cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
            .join('|');
        if (!fingerprint.replaceAll('|', '')) continue;

        const existing = uniqueJobs.get(fingerprint);
        if (!existing || jobCompleteness(job) > jobCompleteness(existing)) {
            uniqueJobs.set(fingerprint, job);
        }
    }

    return [...uniqueJobs.values()].sort((first, second) => {
        const tnDifference = Number(isTamilNaduLocation(second.location)) - Number(isTamilNaduLocation(first.location));
        if (tnDifference) return tnDifference;
        return Date.parse(second.posted_at) - Date.parse(first.posted_at);
    });
}
