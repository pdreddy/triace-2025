import { test, expect } from './fixtures.js';

const password = 'local-e2e-test-password';
async function post(page, { kind = 'player', name, singles, doubles = '', whatsapp, note = '', needs = '1', wantMin = '', wantMax = '' }) {
  await page.goto('/partners');
  await page.getByRole('button', { name: /Post to the board/ }).click();
  const form = page.getByRole('form', { name: 'Post to the partner board' });
  if (kind === 'team') await form.getByLabel(/Find players/).check();
  await form.getByLabel('Your first name').fill(name);
  await form.getByLabel('Your WhatsApp number').fill(whatsapp);
  await form.getByLabel(kind === 'team' ? 'Your singles UTR' : 'Singles UTR').fill(singles);
  if (doubles) await form.getByLabel('Doubles UTR (optional)').fill(doubles);
  if (kind === 'team') { await form.getByLabel('Players you still need').selectOption(needs); if (wantMin) await form.getByLabel('Lowest UTR you want').fill(wantMin); if (wantMax) await form.getByLabel('Highest UTR you want').fill(wantMax); }
  if (note) await form.getByLabel('Note (optional)').fill(note);
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Post to the board' }).click();
}

test('partner board: a player posts, a captain replies, numbers are swapped but never published', async ({ browser, page }) => {
  const poster = await (await browser.newContext()).newPage();
  await post(poster, { name: 'Zelda', singles: '6.25', doubles: '6.80', whatsapp: '+15550102000', note: 'Free weekday evenings' });
  await expect(poster.getByText('Posted. Replies will show up under My posts.')).toBeVisible();
  const mine = poster.locator('.partner-card', { hasText: 'Zelda' });
  await expect(mine).toContainText('Your post');
  await expect(mine).toContainText('6.80');                       // the counted UTR (higher of singles and doubles)
  await expect(mine).toContainText('No replies yet');

  const other = await (await browser.newContext()).newPage();
  await other.goto('/partners');
  const card = other.locator('.partner-card', { hasText: 'Zelda' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Available to join a team');
  await expect(card).toContainText('Singles 6.25 · Doubles 6.80');
  await expect(card).toContainText('Free weekday evenings');
  await expect(card).not.toContainText('5550102000');              // the poster's number is not on the page
  await expect(card.getByRole('button', { name: 'Remove' })).toHaveCount(0);   // only the admin can remove

  // UTR filter: Zelda counts as 6.80
  await other.getByLabel('UTR from').fill('7');
  await expect(card).toHaveCount(0);
  await other.getByLabel('UTR from').fill('6');
  await other.getByLabel('UTR to').fill('7');
  await expect(card).toBeVisible();
  await other.getByLabel('UTR from').fill(''); await other.getByLabel('UTR to').fill('');

  await card.getByRole('button', { name: 'I’m interested' }).click();
  await card.getByLabel('Your first name').fill('Sam');
  await card.getByLabel('Your WhatsApp number').fill('+15550104000');
  await card.getByLabel('Message (optional)').fill('I can play Saturdays');
  await card.getByRole('button', { name: 'Send my details' }).click();
  const link = card.getByRole('link', { name: 'Message Zelda on WhatsApp' });
  await expect(link).toHaveAttribute('href', /^https:\/\/wa\.me\/15550102000\?text=/);   // the replier gets the poster's number as a link
  await other.reload();
  await expect(other.locator('.partner-card', { hasText: 'Zelda' }).getByRole('link', { name: 'Message Zelda on WhatsApp' })).toBeVisible();   // remembered on this device
  await expect(other.locator('.partner-card', { hasText: 'Zelda' })).toContainText('1 interested');

  await poster.reload();
  await poster.getByRole('tab', { name: /My posts/ }).click();
  const replies = poster.locator('.partner-card', { hasText: 'Zelda' });
  await expect(replies).toContainText('Sam');
  await expect(replies).toContainText('I can play Saturdays');
  await expect(replies.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', /wa\.me\/15550104000/);

  const publicData = await (await page.request.get('/api/public')).text();
  expect(publicData).not.toContain('5550102000');
  expect(publicData).not.toContain('5550104000');
  expect(publicData).toContain('Zelda');

  // the admin can remove any post
  const admin = await (await browser.newContext()).newPage();
  await admin.goto('/admin/login');
  await admin.getByLabel('Username or email').fill('reddi2026');
  await admin.getByLabel('Password', { exact: true }).fill(password);
  await admin.getByRole('button', { name: 'Sign in ↗', exact: true }).click();
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.goto('/partners');
  admin.on('dialog', d => d.accept());
  await admin.locator('.partner-card', { hasText: 'Zelda' }).getByRole('button', { name: 'Remove' }).click();
  await expect(admin.locator('.partner-card', { hasText: 'Zelda' })).toHaveCount(0);
  await other.reload();
  await expect(other.locator('.partner-card', { hasText: 'Zelda' })).toHaveCount(0);
});

test('partner board: a team with two players looks for a third, and posts are checked', async ({ browser }) => {
  const captain = await (await browser.newContext()).newPage();
  await post(captain, { kind: 'team', name: 'Ravi', singles: '7.00', whatsapp: '+15550103000', needs: '1', wantMin: '5', wantMax: '8', note: 'We play Saturday mornings' });
  await expect(captain.getByText('Posted.')).toBeVisible();

  const seeker = await (await browser.newContext()).newPage();
  await seeker.goto('/partners');
  await seeker.getByRole('tab', { name: /^Teams/ }).click();
  const card = seeker.locator('.partner-card', { hasText: 'Ravi' });
  await expect(card).toContainText('Team needs 1 more');
  await expect(card).toContainText('Looking for UTR 5.00 – 8.00');
  await seeker.getByRole('tab', { name: /^Players/ }).click();
  await expect(seeker.locator('.partner-card', { hasText: 'Ravi' })).toHaveCount(0);     // players and teams are separate lists

  // clear mistakes are explained, nothing is posted
  const bad = await (await browser.newContext()).newPage();
  await post(bad, { name: 'Linkman', singles: '6.0', whatsapp: '+15550105000', note: 'visit http://spam.example' });
  await expect(bad.getByText('cannot contain links')).toBeVisible();
  await post(bad, { name: 'Highrater', singles: '40', whatsapp: '+15550106000' });
  await expect(bad.getByText(/Enter a numeric UTR|Singles UTR must be between/)).toBeVisible();
  await seeker.reload();
  await expect(seeker.locator('.partner-card', { hasText: 'Linkman' })).toHaveCount(0);

  // the poster cannot remove their own post; the admin can
  await captain.getByRole('tab', { name: /My posts/ }).click();
  const own = captain.locator('.partner-card', { hasText: 'Ravi' });
  await expect(own).toContainText('Only the admin can remove posts');
  await expect(own.getByRole('button', { name: 'Remove' })).toHaveCount(0);
  const admin = await (await browser.newContext()).newPage();
  await admin.goto('/admin/login');
  await admin.getByLabel('Username or email').fill('reddi2026');
  await admin.getByLabel('Password', { exact: true }).fill(password);
  await admin.getByRole('button', { name: 'Sign in ↗', exact: true }).click();
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.goto('/partners');
  admin.on('dialog', d => d.accept());
  await admin.getByRole('tab', { name: /^Teams/ }).click();
  await admin.locator('.partner-card', { hasText: 'Ravi' }).getByRole('button', { name: 'Remove' }).click();
  await expect(admin.locator('.partner-card', { hasText: 'Ravi' })).toHaveCount(0);
});

test('partner board: a picked player is shown publicly with who picked them, then can be reopened', async ({ browser }) => {
  const poster = await (await browser.newContext()).newPage();
  await post(poster, { name: 'Pickme', singles: '6.50', whatsapp: '+15550107000', note: 'Weekday evenings' });
  await expect(poster.getByText('Posted.')).toBeVisible();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/partners');
  const card = visitor.locator('.partner-card', { hasText: 'Pickme' });
  await expect(card.getByRole('button', { name: 'I’m interested' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Mark as picked' })).toHaveCount(0);          // only the poster or the admin

  // the poster marks it picked and says by whom
  const mine = poster.locator('.partner-card', { hasText: 'Pickme' });
  await mine.getByRole('button', { name: 'Mark as picked' }).click();
  await mine.getByLabel(/Picked by which team/).fill('Ravi’s team');
  await mine.getByRole('button', { name: 'Show as picked' }).click();
  await expect(poster.getByText('Marked as picked by Ravi’s team.')).toBeVisible();
  await expect(mine).toContainText('Picked');
  await expect(mine).toContainText('Joined a team: Ravi’s team');

  // everyone sees it under Picked, no longer under Players, and cannot show interest
  await visitor.reload();
  await expect(visitor.locator('.partner-card', { hasText: 'Pickme' })).toHaveCount(0);       // not in the Players list any more
  await visitor.getByRole('tab', { name: /^Picked/ }).click();
  const pickedCard = visitor.locator('.partner-card', { hasText: 'Pickme' });
  await expect(pickedCard).toBeVisible();
  await expect(pickedCard).toContainText('Joined a team: Ravi’s team');
  await expect(pickedCard.getByRole('button', { name: 'I’m interested' })).toHaveCount(0);
  const publicData = await (await visitor.request.get('/api/public')).json();
  const record = Object.values(publicData.partnerPosts).find(p => p.firstName === 'Pickme');
  expect([record.status, record.pickedBy]).toEqual(['picked', 'Ravi’s team']);
  expect(JSON.stringify(publicData)).not.toContain('5550107000');

  // a mistake: the poster reopens it and it is back on the board
  await mine.getByRole('button', { name: 'Reopen' }).click();
  await expect(poster.getByText('Reopened.')).toBeVisible();
  await visitor.reload();
  await expect(visitor.locator('.partner-card', { hasText: 'Pickme' }).getByRole('button', { name: 'I’m interested' })).toBeVisible();

  // clean up as admin
  const admin = await (await browser.newContext()).newPage();
  await admin.goto('/admin/login');
  await admin.getByLabel('Username or email').fill('reddi2026');
  await admin.getByLabel('Password', { exact: true }).fill(password);
  await admin.getByRole('button', { name: 'Sign in ↗', exact: true }).click();
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.goto('/partners');
  admin.on('dialog', d => d.accept());
  const adminCard = admin.locator('.partner-card', { hasText: 'Pickme' });
  await adminCard.getByRole('button', { name: 'Mark as picked' }).click();                    // the admin can mark any post
  await adminCard.getByRole('button', { name: 'Show as picked' }).click();
  await expect(admin.getByText('Marked as picked.')).toBeVisible();
  await expect(adminCard).toHaveCount(0);                                                       // it leaves the Players list...
  await admin.getByRole('tab', { name: /^Picked/ }).click();                                    // ...and is listed under Picked
  const adminPicked = admin.locator('.partner-card', { hasText: 'Pickme' });
  await expect(adminPicked).toContainText('Joined a team');
  await adminPicked.getByRole('button', { name: 'Remove' }).click();
  await expect(admin.locator('.partner-card', { hasText: 'Pickme' })).toHaveCount(0);
});
