import bcrypt from 'bcrypt';
import { app } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const PORT = 4021;
const BASE = `http://127.0.0.1:${PORT}`;
const stamp = Date.now();
const prefix = `issue9-audit-${stamp}`;
const password = 'AuditPass123!';

function longCover() {
  return 'I have relevant nightlife operations experience and strong communication skills. '.repeat(2);
}

async function req(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

async function login(email, role) {
  const r = await req('/api/auth/login', { method: 'POST', body: { email, password, role } });
  if (r.status !== 200 || !r.data?.accessToken) throw new Error(`Login failed for ${email}: ${r.status}`);
  return r.data.accessToken;
}

async function ensureUser(email, role, fullName) {
  const existing = await prisma.user.findFirst({ where: { email, role, deletedAt: null } });
  const passwordHash = await bcrypt.hash(password, 10);
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { fullName, passwordHash, emailVerified: true, deletedAt: null, suspendedAt: null, suspendedReason: null },
    });
  }
  return prisma.user.create({
    data: { email, role, fullName, passwordHash, emailVerified: true },
  });
}

async function run() {
  const results = [];
  let server;
  const created = { jobs: [], apps: [], venues: [], users: [] };

  try {
    const ownerEmail = `${prefix}-owner@example.com`;
    const otherOwnerEmail = `${prefix}-other-owner@example.com`;
    const applicantEmail = `${prefix}-applicant@example.com`;
    const otherUserEmail = `${prefix}-other-user@example.com`;

    const owner = await ensureUser(ownerEmail, 'VENUE', 'Owner One');
    const otherOwner = await ensureUser(otherOwnerEmail, 'VENUE', 'Owner Two');
    const applicant = await ensureUser(applicantEmail, 'USER', 'Applicant One');
    const otherUser = await ensureUser(otherUserEmail, 'USER', 'Other User');
    created.users.push(owner.id, otherOwner.id, applicant.id, otherUser.id);

    const [venue1, venue2] = await Promise.all([
      prisma.venue.create({ data: { ownerUserId: owner.id, name: `${prefix}-venue-1`, venueType: 'club', city: 'Johannesburg', complianceStatus: 'pending' } }),
      prisma.venue.create({ data: { ownerUserId: otherOwner.id, name: `${prefix}-venue-2`, venueType: 'club', city: 'Johannesburg', complianceStatus: 'pending' } }),
    ]);
    created.venues.push(venue1.id, venue2.id);

    const [job1, job2] = await Promise.all([
      prisma.jobPosting.create({
        data: {
          venueId: venue1.id,
          title: `${prefix}-job-1`,
          description: 'Job one description',
          requirements: 'Job one requirements',
          jobType: 'FULL_TIME',
          compensationType: 'FIXED',
          compensationAmount: 120,
          compensationPer: 'HOUR',
          totalSpots: 1,
          status: 'OPEN',
        },
      }),
      prisma.jobPosting.create({
        data: {
          venueId: venue1.id,
          title: `${prefix}-job-2`,
          description: 'Job two description',
          requirements: 'Job two requirements',
          jobType: 'PART_TIME',
          compensationType: 'NEGOTIABLE',
          compensationAmount: 100,
          compensationPer: 'HOUR',
          totalSpots: 2,
          status: 'OPEN',
        },
      }),
    ]);
    created.jobs.push(job1.id, job2.id);

    server = app.listen(PORT);

    const ownerToken = await login(ownerEmail, 'VENUE');
    const otherOwnerToken = await login(otherOwnerEmail, 'VENUE');
    const applicantToken = await login(applicantEmail, 'USER');
    const otherUserToken = await login(otherUserEmail, 'USER');

    const apply1 = await req(`/api/jobs/${job1.id}/apply`, {
      method: 'POST',
      token: applicantToken,
      body: { coverMessage: longCover(), cvUrl: 'https://example.com/cv.pdf', cvFileName: 'cv.pdf' },
    });
    if (apply1.status !== 201) throw new Error(`Setup apply failed: ${apply1.status}`);
    created.apps.push(apply1.data.id);

    const check1 = await req(`/api/jobs/${job1.id}/applications`, { token: otherOwnerToken });
    results.push({ id: 1, pass: check1.status === 403, info: `status=${check1.status}` });

    const cvUnauth = await req(`/api/jobs/applications/${apply1.data.id}/cv`);
    const cvOtherUser = await req(`/api/jobs/applications/${apply1.data.id}/cv`, { token: otherUserToken });
    const cvOtherOwner = await req(`/api/jobs/applications/${apply1.data.id}/cv`, { token: otherOwnerToken });
    results.push({ id: 2, pass: cvUnauth.status === 401 && cvOtherUser.status === 403 && cvOtherOwner.status === 403, info: `unauth=${cvUnauth.status},otherUser=${cvOtherUser.status},otherOwner=${cvOtherOwner.status}` });

    const firstApply = await req(`/api/jobs/${job2.id}/apply`, { method: 'POST', token: applicantToken, body: { coverMessage: longCover() } });
    const secondApply = await req(`/api/jobs/${job2.id}/apply`, { method: 'POST', token: applicantToken, body: { coverMessage: longCover() } });
    if (firstApply.data?.id) created.apps.push(firstApply.data.id);
    results.push({ id: 3, pass: firstApply.status === 201 && secondApply.status === 409, info: `first=${firstApply.status},second=${secondApply.status}` });

    const ownerApply = await req(`/api/jobs/${job2.id}/apply`, { method: 'POST', token: ownerToken, body: { coverMessage: longCover() } });
    results.push({ id: 4, pass: ownerApply.status === 403, info: `status=${ownerApply.status}` });

    const beforeJob = await req(`/api/jobs/${job1.id}`, { token: ownerToken });
    const beforeSpots = beforeJob.data?.filledSpots;
    const hire = await req(`/api/jobs/applications/${apply1.data.id}/status`, { method: 'PATCH', token: ownerToken, body: { status: 'HIRED' } });
    const afterHire = await req(`/api/jobs/${job1.id}`, { token: ownerToken });
    const applicantMsg = await req(`/api/jobs/applications/${apply1.data.id}/messages`, { method: 'POST', token: applicantToken, body: { body: 'Checking in after hire.' } });
    const afterMsg = await req(`/api/jobs/${job1.id}`, { token: ownerToken });
    const pass5 = beforeSpots === 0 && hire.status === 200 && afterHire.data?.filledSpots === 1 && applicantMsg.status === 201 && afterMsg.data?.filledSpots === 1;
    results.push({ id: 5, pass: pass5, info: `before=${beforeSpots},afterHire=${afterHire.data?.filledSpots},afterMsg=${afterMsg.data?.filledSpots}` });

    const pubList = await req('/api/jobs/public');
    const pubOne = await req(`/api/jobs/public/${job2.id}`);
    const noCvLeak = !JSON.stringify(pubList.data || []).includes('cvUrl') && !JSON.stringify(pubOne.data || {}).includes('cvUrl');
    results.push({ id: 6, pass: pubList.status === 200 && pubOne.status === 200 && noCvLeak, info: `list=${pubList.status},one=${pubOne.status},noCvLeak=${noCvLeak}` });

    const passed = results.filter((x) => x.pass).length;
    console.log('Section F audit results:');
    for (const r of results) console.log(`- Check ${r.id}: ${r.pass ? 'PASS' : 'FAIL'} (${r.info})`);
    console.log(`Overall: ${passed}/${results.length} passed`);
    process.exitCode = passed === results.length ? 0 : 1;
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await prisma.jobMessage.deleteMany({ where: { applicationId: { in: created.apps } } }).catch(() => {});
    await prisma.jobApplication.deleteMany({ where: { id: { in: created.apps } } }).catch(() => {});
    await prisma.jobPosting.deleteMany({ where: { id: { in: created.jobs } } }).catch(() => {});
    await prisma.venue.deleteMany({ where: { id: { in: created.venues } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: created.users } } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
