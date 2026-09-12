const path = require('path');

/** Matches market-research-agent slugify output. */
const RESEARCH_SLUG_RE = /^[a-z0-9-]{1,90}$/;
/** Matches crypto.randomBytes(8).toString('hex') job ids. */
const RESEARCH_JOB_ID_RE = /^[a-f0-9]{16}$/;

function isSafeResearchSlug(slug) {
  return typeof slug === 'string' && RESEARCH_SLUG_RE.test(slug) && !slug.includes('..');
}

function isSafeResearchJobId(jobId) {
  return typeof jobId === 'string' && RESEARCH_JOB_ID_RE.test(jobId);
}

/**
 * Resolve a path under baseDir; throw if the result escapes the directory.
 */
function containedJoin(baseDir, ...parts) {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, ...parts);
  const rel = path.relative(base, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error('path escapes research directory');
    err.code = 'PATH_ESCAPE';
    throw err;
  }
  return target;
}

function assertSafeResearchSlug(slug) {
  if (!isSafeResearchSlug(slug)) {
    const err = new Error('invalid research slug');
    err.code = 'INVALID_SLUG';
    throw err;
  }
  return slug;
}

function assertSafeResearchJobId(jobId) {
  if (!isSafeResearchJobId(jobId)) {
    const err = new Error('invalid research job id');
    err.code = 'INVALID_JOB_ID';
    throw err;
  }
  return jobId;
}

module.exports = {
  RESEARCH_SLUG_RE,
  RESEARCH_JOB_ID_RE,
  isSafeResearchSlug,
  isSafeResearchJobId,
  assertSafeResearchSlug,
  assertSafeResearchJobId,
  containedJoin,
};
