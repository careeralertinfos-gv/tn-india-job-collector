import { describe, expect, it } from 'vitest';

import {
    deduplicateAndPrioritizeJobs,
    isPostedWithinLast24Hours,
    normalizeLinkedInJob,
    normalizeNaukriJob,
    parsePostedAt,
    parseRelativePostedAt,
} from '../src/job-utils.js';

describe('job normalization and selection', () => {
    it('parses Naukri timestamps as India time and excludes date-only values', () => {
        expect(parsePostedAt('2026-11-07 13:23:19', '+05:30')).toBe('2026-11-07T07:53:19.000Z');
        expect(parsePostedAt('2026-11-07')).toBeNull();
    });

    it('keeps only timestamps within the previous 24 hours', () => {
        const now = Date.parse('2026-11-07T12:00:00.000Z');

        expect(isPostedWithinLast24Hours('2026-11-06T12:00:00.000Z', now)).toBe(true);
        expect(isPostedWithinLast24Hours('2026-11-06T11:59:59.999Z', now)).toBe(false);
        expect(isPostedWithinLast24Hours('2026-11-07T12:00:00.001Z', now)).toBe(false);
        expect(isPostedWithinLast24Hours('2026-11-07', now)).toBe(false);
    });

    it('uses LinkedIn relative posting time when its exact timestamp is unavailable', () => {
        const scrapedAt = '2026-11-07T12:00:00.000Z';

        expect(parseRelativePostedAt('2 hours ago', Date.parse(scrapedAt))).toBe('2026-11-07T10:00:00.000Z');
        expect(parseRelativePostedAt('1 day ago', Date.parse(scrapedAt))).toBe('2026-11-06T12:00:00.000Z');
        expect(parseRelativePostedAt('unknown', Date.parse(scrapedAt))).toBeNull();
        expect(
            normalizeLinkedInJob(
                { postedAt: '2026-11-07', postedAtRelative: '2 hours ago' },
                scrapedAt,
            ).posted_at,
        ).toBe('2026-11-07T10:00:00.000Z');
    });

    it('normalizes LinkedIn and Naukri job records into the shared output shape', () => {
        const linkedInJob = normalizeLinkedInJob({
            id: 'li-1',
            title: 'Engineer',
            companyName: 'Example',
            location: 'Chennai, Tamil Nadu, India',
            link: 'https://linkedin.example/job/1',
            postedAtTimestamp: Date.parse('2026-11-07T10:00:00.000Z'),
        });
        const naukriJob = normalizeNaukriJob({
            jobId: 'nk-1',
            title: 'Analyst',
            companyName: 'Example Co',
            location: 'Coimbatore, Tamil Nadu',
            jdURL: 'https://naukri.example/job/1',
            createdDate: '2026-11-07 15:30:00',
        });

        expect(linkedInJob).toMatchObject({
            job_key: 'linkedin:li-1',
            company: 'Example',
            posted_at: '2026-11-07T10:00:00.000Z',
            apply_url: 'https://linkedin.example/job/1',
        });
        expect(naukriJob).toMatchObject({
            job_key: 'naukri:nk-1',
            company: 'Example Co',
            posted_at: '2026-11-07T10:00:00.000Z',
            apply_url: 'https://naukri.example/job/1',
        });
    });

    it('builds a LinkedIn job URL from its numeric ID when the scraper omits a URL', () => {
        expect(normalizeLinkedInJob({ id: 'urn:li:jobPosting:12345' })).toMatchObject({
            job_key: 'linkedin:urn:li:jobPosting:12345',
            source_job_id: 'urn:li:jobPosting:12345',
            apply_url: 'https://www.linkedin.com/jobs/view/12345/',
            source_url: 'https://www.linkedin.com/jobs/view/12345/',
        });
    });

    it('does not replace a missing LinkedIn URL when the job ID is not numeric', () => {
        expect(normalizeLinkedInJob({ id: 'not-a-numeric-id' }).apply_url).toBe('');
    });

    it('deduplicates equivalent roles and puts Tamil Nadu results first', () => {
        const jobs = [
            {
                title: 'Engineer',
                company: 'Example',
                location: 'Bengaluru, India',
                posted_at: '2026-11-07T11:00:00.000Z',
                description: 'Role details',
                source_type: 'Job board',
            },
            {
                title: 'Engineer',
                company: 'Example',
                location: 'Chennai, Tamil Nadu',
                posted_at: '2026-11-07T10:00:00.000Z',
                description: 'Employer details',
                source_type: 'Direct employer',
            },
            {
                title: 'Engineer',
                company: 'Example',
                location: 'Chennai, Tamil Nadu',
                posted_at: '2026-11-07T10:00:00.000Z',
                description: 'Duplicate portal listing',
                source_type: 'Job board',
            },
        ];

        const results = deduplicateAndPrioritizeJobs(jobs);

        expect(results).toHaveLength(2);
        expect(results[0].location).toContain('Chennai');
        expect(results[0].source_type).toBe('Direct employer');
    });
});
